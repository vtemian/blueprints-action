/**
 * @fileoverview Production-ready SQLite database connection and session management module
 * @module core/database
 * @version 1.0.0
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * Custom database error classes
 */
export class DatabaseError extends Error {
  constructor(message, code = 'DB_ERROR', originalError = null) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.originalError = originalError;
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message, originalError = null) {
    super(message, 'CONNECTION_ERROR', originalError);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends DatabaseError {
  constructor(message, query = null, originalError = null) {
    super(message, 'QUERY_ERROR', originalError);
    this.name = 'QueryError';
    this.query = query;
  }
}

/**
 * Connection pool implementation for better-sqlite3
 */
class ConnectionPool extends EventEmitter {
  constructor(dbPath, options = {}) {
    super();
    this.dbPath = dbPath;
    this.maxConnections = options.maxConnections || 10;
    this.idleTimeout = options.idleTimeout || 30000;
    this.connections = new Map();
    this.availableConnections = [];
    this.waitingQueue = [];
    this.totalConnections = 0;
    this.closed = false;
  }

  /**
   * Get a connection from the pool
   * @returns {Promise<Database>} Database connection
   */
  async getConnection() {
    if (this.closed) {
      throw new ConnectionError('Connection pool is closed');
    }

    return new Promise((resolve, reject) => {
      // Try to get an available connection
      if (this.availableConnections.length > 0) {
        const connection = this.availableConnections.pop();
        this._resetConnectionTimeout(connection);
        resolve(connection);
        return;
      }

      // Create new connection if under limit
      if (this.totalConnections < this.maxConnections) {
        try {
          const connection = this._createConnection();
          resolve(connection);
        } catch (error) {
          reject(new ConnectionError('Failed to create database connection', error));
        }
        return;
      }

      // Add to waiting queue
      this.waitingQueue.push({ resolve, reject });
    });
  }

  /**
   * Release a connection back to the pool
   * @param {Database} connection - Database connection to release
   */
  releaseConnection(connection) {
    if (this.closed || !this.connections.has(connection)) {
      return;
    }

    // Check if there are waiting requests
    if (this.waitingQueue.length > 0) {
      const { resolve } = this.waitingQueue.shift();
      this._resetConnectionTimeout(connection);
      resolve(connection);
      return;
    }

    // Return to available pool
    this.availableConnections.push(connection);
    this._setConnectionTimeout(connection);
  }

  /**
   * Create a new database connection
   * @private
   * @returns {Database} New database connection
   */
  _createConnection() {
    try {
      const connection = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : null,
        fileMustExist: false
      });

      // Configure connection
      connection.pragma('journal_mode = WAL');
      connection.pragma('synchronous = NORMAL');
      connection.pragma('cache_size = 1000');
      connection.pragma('temp_store = memory');
      connection.pragma('mmap_size = 268435456'); // 256MB

      this.connections.set(connection, {
        created: Date.now(),
        lastUsed: Date.now(),
        timeout: null
      });

      this.totalConnections++;
      this.emit('connection:created', { total: this.totalConnections });

      return connection;
    } catch (error) {
      throw new ConnectionError('Failed to create database connection', error);
    }
  }

  /**
   * Set idle timeout for connection
   * @private
   * @param {Database} connection - Database connection
   */
  _setConnectionTimeout(connection) {
    const connectionInfo = this.connections.get(connection);
    if (!connectionInfo) return;

    connectionInfo.timeout = setTimeout(() => {
      this._closeIdleConnection(connection);
    }, this.idleTimeout);
  }

  /**
   * Reset connection timeout
   * @private
   * @param {Database} connection - Database connection
   */
  _resetConnectionTimeout(connection) {
    const connectionInfo = this.connections.get(connection);
    if (!connectionInfo) return;

    if (connectionInfo.timeout) {
      clearTimeout(connectionInfo.timeout);
      connectionInfo.timeout = null;
    }
    connectionInfo.lastUsed = Date.now();
  }

  /**
   * Close idle connection
   * @private
   * @param {Database} connection - Database connection to close
   */
  _closeIdleConnection(connection) {
    const index = this.availableConnections.indexOf(connection);
    if (index > -1) {
      this.availableConnections.splice(index, 1);
    }

    this._closeConnection(connection);
  }

  /**
   * Close a specific connection
   * @private
   * @param {Database} connection - Database connection to close
   */
  _closeConnection(connection) {
    try {
      connection.close();
    } catch (error) {
      console.error('Error closing database connection:', error);
    }

    this.connections.delete(connection);
    this.totalConnections--;
    this.emit('connection:closed', { total: this.totalConnections });
  }

  /**
   * Close all connections in the pool
   */
  async close() {
    this.closed = true;

    // Reject all waiting requests
    while (this.waitingQueue.length > 0) {
      const { reject } = this.waitingQueue.shift();
      reject(new ConnectionError('Connection pool is closing'));
    }

    // Close all connections
    for (const connection of this.connections.keys()) {
      this._closeConnection(connection);
    }

    this.availableConnections.length = 0;
    this.emit('pool:closed');
  }

  /**
   * Get pool statistics
   * @returns {Object} Pool statistics
   */
  getStats() {
    return {
      totalConnections: this.totalConnections,
      availableConnections: this.availableConnections.length,
      waitingRequests: this.waitingQueue.length,
      maxConnections: this.maxConnections,
      closed: this.closed
    };
  }
}

/**
 * Main Database class for SQLite operations
 */
export class DatabaseManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.dbUrl = options.dbUrl || process.env.DATABASE_URL || './tasks.db';
    this.poolOptions = {
      maxConnections: options.maxConnections || 10,
      idleTimeout: options.idleTimeout || 30000,
      ...options.poolOptions
    };
    
    this.pool = null;
    this.connected = false;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.healthCheckInterval = options.healthCheckInterval || 30000;
    this.healthCheckTimer = null;
  }

  /**
   * Connect to the database and initialize connection pool
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected) {
      return;
    }

    try {
      // Ensure database directory exists
      const dbDir = path.dirname(this.dbUrl);
      await fs.mkdir(dbDir, { recursive: true });

      // Create connection pool
      this.pool = new ConnectionPool(this.dbUrl, this.poolOptions);
      
      // Test connection
      await this._testConnection();
      
      this.connected = true;
      this._startHealthCheck();
      
      this.emit('connected');
      console.log(`Database connected: ${this.dbUrl}`);
    } catch (error) {
      throw new ConnectionError('Failed to connect to database', error);
    }
  }

  /**
   * Disconnect from the database
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }

    this._stopHealthCheck();
    
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
    
    this.connected = false;
    this.emit('disconnected');
    console.log('Database disconnected');
  }

  /**
   * Get a database connection from the pool
   * @returns {Promise<Database>} Database connection
   */
  async getConnection() {
    if (!this.connected || !this.pool) {
      throw new ConnectionError('Database not connected');
    }

    return await this.pool.getConnection();
  }

  /**
   * Release a connection back to the pool
   * @param {Database} connection - Database connection to release
   */
  releaseConnection(connection) {
    if (this.pool) {
      this.pool.releaseConnection(connection);
    }
  }

  /**
   * Execute a query with automatic connection management
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} Query result
   */
  async query(sql, params = []) {
    const connection = await this.getConnection();
    
    try {
      const stmt = connection.prepare(sql);
      const result = stmt.all(...params);
      return result;
    } catch (error) {
      throw new QueryError('Query execution failed', sql, error);
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute a single row query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} Single row result
   */
  async queryOne(sql, params = []) {
    const connection = await this.getConnection();
    
    try {
      const stmt = connection.prepare(sql);
      const result = stmt.get(...params);
      return result;
    } catch (error) {
      throw new QueryError('Query execution failed', sql, error);
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute a query that modifies data
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Execution result with changes and lastInsertRowid
   */
  async execute(sql, params = []) {
    const connection = await this.getConnection();
    
    try {
      const stmt = connection.prepare(sql);
      const result = stmt.run(...params);
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid
      };
    } catch (error) {
      throw new QueryError('Query execution failed', sql, error);
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Function} callback - Function containing transaction logic
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback) {
    const connection = await this.getConnection();
    
    try {
      const transaction = connection.transaction(callback);
      return transaction();
    } catch (error) {
      throw new QueryError('Transaction failed', null, error);
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Test database connection
   * @private
   * @returns {Promise<void>}
   */
  async _testConnection() {
    const connection = await this.pool.getConnection();
    
    try {
      connection.prepare('SELECT 1').get();
    } catch (error) {
      throw new ConnectionError('Database connection test failed', error);
    } finally {
      this.pool.releaseConnection(connection);
    }
  }

  /**
   * Start health check timer
   * @private
   */
  _startHealthCheck() {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        this.emit('health:error', error);
      }
    }, this.healthCheckInterval);
  }

  /**
   * Stop health check timer
   * @private
   */
  _stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform health check
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    const startTime = Date.now();
    
    try {
      await this._testConnection();
      const responseTime = Date.now() - startTime;
      const stats = this.pool.getStats();
      
      const health = {
        status: 'healthy',
        responseTime,
        timestamp: new Date().toISOString(),
        pool: stats
      };
      
      this.emit('health:check', health);
      return health;
    } catch (error) {
      const health = {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      this.emit('health:check', health);
      throw error;
    }
  }

  /**
   * Get database statistics
   * @returns {Object} Database statistics
   */
  getStats() {
    return {
      connected: this.connected,
      dbUrl: this.dbUrl,
      pool: this.pool ? this.pool.getStats() : null
    };
  }
}

/**
 * Database initialization and schema management
 */
export class DatabaseInitializer {
  constructor(dbManager) {
    this.db = dbManager;
    this.migrations = new Map();
  }

  /**
   * Initialize database with default schema
   * @returns {Promise<void>}
   */
  async initDb() {
    const connection = await this.db.getConnection();
    
    try {
      // Create migrations table
      connection.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create default tables
      await this._createDefaultTables(connection);
      
      console.log('Database initialized successfully');
    } catch (error) {
      throw new DatabaseError('Database initialization failed', 'INIT_ERROR', error);
    } finally {
      this.db.releaseConnection(connection);
    }
  }

  /**
   * Create default application tables
   * @private
   * @param {Database} connection - Database connection
   */
  async _createDefaultTables(connection) {
    // Example: Tasks table
    connection.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        update