/**
 * Database Connection and Session Management Module
 * Production-ready SQLite database manager with connection pooling and session management
 * 
 * @fileoverview Provides database connection pooling, session management, and lifecycle control
 * @author Production Team
 * @version 1.0.0
 */

import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Custom error classes for database operations
 */
class DatabaseError extends Error {
  constructor(message, code = 'DB_ERROR', originalError = null) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }
}

class ConnectionPoolError extends DatabaseError {
  constructor(message, originalError = null) {
    super(message, 'POOL_ERROR', originalError);
    this.name = 'ConnectionPoolError';
  }
}

class SessionError extends DatabaseError {
  constructor(message, originalError = null) {
    super(message, 'SESSION_ERROR', originalError);
    this.name = 'SessionError';
  }
}

/**
 * Database configuration with environment-based defaults
 */
const DEFAULT_CONFIG = {
  databaseUrl: process.env.DATABASE_URL || path.join(__dirname, 'tasks.db'),
  poolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
  retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS) || 3,
  retryDelay: parseInt(process.env.DB_RETRY_DELAY) || 1000,
  enableWAL: process.env.DB_ENABLE_WAL !== 'false',
  enableForeignKeys: process.env.DB_ENABLE_FOREIGN_KEYS !== 'false',
  busyTimeout: parseInt(process.env.DB_BUSY_TIMEOUT) || 30000,
  cacheSize: parseInt(process.env.DB_CACHE_SIZE) || 2000,
  logLevel: process.env.DB_LOG_LEVEL || 'info'
};

/**
 * Database Session class for managing individual database operations
 */
class DatabaseSession extends EventEmitter {
  /**
   * @param {Database} connection - SQLite database connection
   * @param {string} sessionId - Unique session identifier
   * @param {ConnectionPool} pool - Reference to connection pool
   */
  constructor(connection, sessionId, pool) {
    super();
    this.connection = connection;
    this.sessionId = sessionId;
    this.pool = pool;
    this.isActive = true;
    this.createdAt = Date.now();
    this.lastUsed = Date.now();
    this.transactionDepth = 0;
    this.preparedStatements = new Map();
  }

  /**
   * Execute a SQL query with parameters
   * @param {string} sql - SQL query string
   * @param {Array|Object} params - Query parameters
   * @returns {Object} Query result
   */
  query(sql, params = []) {
    this._validateSession();
    this.lastUsed = Date.now();

    try {
      const stmt = this._getPreparedStatement(sql);
      const result = stmt.all(params);
      
      this.emit('query', { sql, params, resultCount: result.length });
      return {
        rows: result,
        rowCount: result.length,
        lastInsertRowid: stmt.reader ? null : this.connection.lastInsertRowid
      };
    } catch (error) {
      this.emit('error', error);
      throw new SessionError(`Query execution failed: ${error.message}`, error);
    }
  }

  /**
   * Execute a SQL query and return first row
   * @param {string} sql - SQL query string
   * @param {Array|Object} params - Query parameters
   * @returns {Object|null} First row or null
   */
  queryOne(sql, params = []) {
    this._validateSession();
    this.lastUsed = Date.now();

    try {
      const stmt = this._getPreparedStatement(sql);
      const result = stmt.get(params);
      
      this.emit('query', { sql, params, resultCount: result ? 1 : 0 });
      return result || null;
    } catch (error) {
      this.emit('error', error);
      throw new SessionError(`Query execution failed: ${error.message}`, error);
    }
  }

  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE)
   * @param {string} sql - SQL statement
   * @param {Array|Object} params - Statement parameters
   * @returns {Object} Execution result
   */
  execute(sql, params = []) {
    this._validateSession();
    this.lastUsed = Date.now();

    try {
      const stmt = this._getPreparedStatement(sql);
      const result = stmt.run(params);
      
      this.emit('execute', { sql, params, changes: result.changes });
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid
      };
    } catch (error) {
      this.emit('error', error);
      throw new SessionError(`Statement execution failed: ${error.message}`, error);
    }
  }

  /**
   * Begin a database transaction
   * @returns {DatabaseSession} This session for chaining
   */
  beginTransaction() {
    this._validateSession();
    
    try {
      if (this.transactionDepth === 0) {
        this.connection.exec('BEGIN TRANSACTION');
      } else {
        this.connection.exec(`SAVEPOINT sp_${this.transactionDepth}`);
      }
      
      this.transactionDepth++;
      this.emit('transaction', { type: 'begin', depth: this.transactionDepth });
      return this;
    } catch (error) {
      this.emit('error', error);
      throw new SessionError(`Failed to begin transaction: ${error.message}`, error);
    }
  }

  /**
   * Commit the current transaction
   * @returns {DatabaseSession} This session for chaining
   */
  commitTransaction() {
    this._validateSession();
    
    if (this.transactionDepth === 0) {
      throw new SessionError('No active transaction to commit');
    }

    try {
      if (this.transactionDepth === 1) {
        this.connection.exec('COMMIT');
      } else {
        this.connection.exec(`RELEASE SAVEPOINT sp_${this.transactionDepth - 1}`);
      }
      
      this.transactionDepth--;
      this.emit('transaction', { type: 'commit', depth: this.transactionDepth });
      return this;
    } catch (error) {
      this.emit('error', error);
      throw new SessionError(`Failed to commit transaction: ${error.message}`, error);
    }
  }

  /**
   * Rollback the current transaction
   * @returns {DatabaseSession} This session for chaining
   */
  rollbackTransaction() {
    this._validateSession();
    
    if (this.transactionDepth === 0) {
      throw new SessionError('No active transaction to rollback');
    }

    try {
      if (this.transactionDepth === 1) {
        this.connection.exec('ROLLBACK');
      } else {
        this.connection.exec(`ROLLBACK TO SAVEPOINT sp_${this.transactionDepth - 1}`);
      }
      
      this.transactionDepth--;
      this.emit('transaction', { type: 'rollback', depth: this.transactionDepth });
      return this;
    } catch (error) {
      this.emit('error', error);
      throw new SessionError(`Failed to rollback transaction: ${error.message}`, error);
    }
  }

  /**
   * Execute a function within a transaction
   * @param {Function} fn - Function to execute in transaction
   * @returns {*} Function result
   */
  async withTransaction(fn) {
    this.beginTransaction();
    
    try {
      const result = await fn(this);
      this.commitTransaction();
      return result;
    } catch (error) {
      this.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Close the session and return connection to pool
   */
  close() {
    if (!this.isActive) return;

    try {
      // Rollback any pending transactions
      while (this.transactionDepth > 0) {
        this.rollbackTransaction();
      }

      // Clean up prepared statements
      this.preparedStatements.clear();
      
      this.isActive = false;
      this.emit('close', { sessionId: this.sessionId });
      
      // Return connection to pool
      this.pool._releaseConnection(this.connection);
    } catch (error) {
      this.emit('error', error);
      // Force close even if cleanup fails
      this.isActive = false;
      this.pool._releaseConnection(this.connection);
    }
  }

  /**
   * Get or create a prepared statement
   * @private
   * @param {string} sql - SQL query
   * @returns {Statement} Prepared statement
   */
  _getPreparedStatement(sql) {
    if (!this.preparedStatements.has(sql)) {
      const stmt = this.connection.prepare(sql);
      this.preparedStatements.set(sql, stmt);
    }
    return this.preparedStatements.get(sql);
  }

  /**
   * Validate session is still active
   * @private
   */
  _validateSession() {
    if (!this.isActive) {
      throw new SessionError('Session is closed');
    }
  }
}

/**
 * Connection Pool Manager
 */
class ConnectionPool extends EventEmitter {
  /**
   * @param {Object} config - Pool configuration
   */
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connections = [];
    this.availableConnections = [];
    this.activeConnections = new Set();
    this.isInitialized = false;
    this.isClosed = false;
    this.waitingQueue = [];
    this.sessionCounter = 0;
  }

  /**
   * Initialize the connection pool
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      await this._ensureDatabaseDirectory();
      await this._createConnections();
      await this._setupDatabase();
      
      this.isInitialized = true;
      this.emit('initialized', { poolSize: this.connections.length });
      
      this._log('info', `Connection pool initialized with ${this.connections.length} connections`);
    } catch (error) {
      this.emit('error', error);
      throw new ConnectionPoolError(`Failed to initialize connection pool: ${error.message}`, error);
    }
  }

  /**
   * Get a database session
   * @param {number} timeout - Connection timeout in milliseconds
   * @returns {Promise<DatabaseSession>} Database session
   */
  async getSession(timeout = this.config.connectionTimeout) {
    if (!this.isInitialized) {
      throw new ConnectionPoolError('Connection pool not initialized');
    }

    if (this.isClosed) {
      throw new ConnectionPoolError('Connection pool is closed');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new ConnectionPoolError('Connection timeout'));
      }, timeout);

      const tryGetConnection = () => {
        if (this.availableConnections.length > 0) {
          clearTimeout(timeoutId);
          const connection = this.availableConnections.pop();
          this.activeConnections.add(connection);
          
          const sessionId = `session_${++this.sessionCounter}_${Date.now()}`;
          const session = new DatabaseSession(connection, sessionId, this);
          
          this.emit('sessionCreated', { sessionId, activeCount: this.activeConnections.size });
          resolve(session);
        } else {
          this.waitingQueue.push({ resolve, reject, tryGetConnection });
        }
      };

      tryGetConnection();
    });
  }

  /**
   * Get pool statistics
   * @returns {Object} Pool statistics
   */
  getStats() {
    return {
      totalConnections: this.connections.length,
      availableConnections: this.availableConnections.length,
      activeConnections: this.activeConnections.size,
      waitingRequests: this.waitingQueue.length,
      isInitialized: this.isInitialized,
      isClosed: this.isClosed
    };
  }

  /**
   * Close all connections and cleanup
   * @returns {Promise<void>}
   */
  async close() {
    if (this.isClosed) return;

    this.isClosed = true;
    
    try {
      // Reject all waiting requests
      this.waitingQueue.forEach(({ reject }) => {
        reject(new ConnectionPoolError('Connection pool is closing'));
      });
      this.waitingQueue = [];

      // Close all connections
      for (const connection of this.connections) {
        try {
          connection.close();
        } catch (error) {
          this._log('warn', `Error closing connection: ${error.message}`);
        }
      }

      this.connections = [];
      this.availableConnections = [];
      this.activeConnections.clear();
      
      this.emit('closed');
      this._log('info', 'Connection pool closed');
    } catch (error) {
      this.emit('error', error);
      throw new ConnectionPoolError(`Failed to close connection pool: ${error.message}`, error);
    }
  }

  /**
   * Release a connection back to the pool
   * @private
   * @param {Database} connection - Database connection to release
   */
  _releaseConnection(connection) {
    if (this.isClosed) return;

    this.activeConnections.delete(connection);
    
    if (this.waitingQueue.length > 0) {
      const { tryGetConnection } = this.waitingQueue.shift();
      this.availableConnections.push(connection);
      setImmediate(tryGetConnection);
    } else {
      this.availableConnections.push(connection);
    }

    this.emit('connectionReleased', { 
      availableCount: this.availableConnections.length,
      activeCount: this.activeConnections.size 
    });
  }

  /**
   * Create database connections
   * @private
   */
  async _createConnections() {
    const connectionPromises = [];
    
    for (let i = 0; i < this.config.poolSize; i++) {
      connectionPromises.push(this._createConnection());
    }

    this.connections = await Promise.all(connectionPromises);
    this.availableConnections = [...this.connections];
  }

  /**
   * Create a single database connection with retry logic
   * @private
   * @returns {Promise<Database>} Database connection
   */
  async _createConnection() {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retry