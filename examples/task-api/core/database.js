/**
 * Core Database Module - Production-ready SQLite connection and session management
 * @module core.database
 * @version 1.0.0
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';

// Load environment variables
dotenv.config();

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

class ConnectionError extends DatabaseError {
  constructor(message, originalError = null) {
    super(message, 'CONNECTION_ERROR', originalError);
    this.name = 'ConnectionError';
  }
}

class TransactionError extends DatabaseError {
  constructor(message, originalError = null) {
    super(message, 'TRANSACTION_ERROR', originalError);
    this.name = 'TransactionError';
  }
}

/**
 * Database configuration with environment-based settings and fallback defaults
 */
class DatabaseConfig {
  constructor() {
    this.database_url = process.env.DATABASE_URL || 'sqlite:./app.db';
    this.pool_size = parseInt(process.env.DB_POOL_SIZE) || 10;
    this.pool_timeout = parseInt(process.env.DB_POOL_TIMEOUT) || 30000;
    this.retry_attempts = parseInt(process.env.DB_RETRY_ATTEMPTS) || 3;
    this.retry_delay = parseInt(process.env.DB_RETRY_DELAY) || 1000;
    this.connection_timeout = parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000;
    this.enable_wal = process.env.DB_ENABLE_WAL !== 'false';
    this.busy_timeout = parseInt(process.env.DB_BUSY_TIMEOUT) || 5000;
    this.log_level = process.env.DB_LOG_LEVEL || 'info';
  }

  /**
   * Extract database path from URL
   * @returns {string} Database file path
   */
  getDatabasePath() {
    if (this.database_url.startsWith('sqlite:')) {
      return this.database_url.replace('sqlite:', '');
    }
    return this.database_url;
  }
}

/**
 * Logger utility for database operations
 */
class DatabaseLogger {
  constructor(level = 'info') {
    this.level = level;
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
  }

  log(level, message, meta = {}) {
    if (this.levels[level] <= this.levels[this.level]) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        message,
        ...meta
      };
      console.log(JSON.stringify(logEntry));
    }
  }

  error(message, meta = {}) { this.log('error', message, meta); }
  warn(message, meta = {}) { this.log('warn', message, meta); }
  info(message, meta = {}) { this.log('info', message, meta); }
  debug(message, meta = {}) { this.log('debug', message, meta); }
}

/**
 * Connection pool manager for SQLite connections
 */
class ConnectionPool extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.connections = new Set();
    this.availableConnections = [];
    this.waitingQueue = [];
    this.isShuttingDown = false;
  }

  /**
   * Get a connection from the pool
   * @returns {Promise<sqlite.Database>} Database connection
   */
  async getConnection() {
    if (this.isShuttingDown) {
      throw new ConnectionError('Connection pool is shutting down');
    }

    if (this.availableConnections.length > 0) {
      const connection = this.availableConnections.pop();
      this.logger.debug('Reusing existing connection from pool');
      return connection;
    }

    if (this.connections.size < this.config.pool_size) {
      const connection = await this.createConnection();
      this.connections.add(connection);
      this.logger.debug('Created new connection', { poolSize: this.connections.size });
      return connection;
    }

    // Wait for available connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new ConnectionError('Connection pool timeout'));
      }, this.config.pool_timeout);

      this.waitingQueue.push({ resolve, reject, timeout });
    });
  }

  /**
   * Return a connection to the pool
   * @param {sqlite.Database} connection - Database connection to return
   */
  releaseConnection(connection) {
    if (this.waitingQueue.length > 0) {
      const { resolve, timeout } = this.waitingQueue.shift();
      clearTimeout(timeout);
      resolve(connection);
    } else {
      this.availableConnections.push(connection);
    }
  }

  /**
   * Create a new SQLite connection
   * @returns {Promise<sqlite.Database>} New database connection
   */
  async createConnection() {
    const dbPath = this.config.getDatabasePath();
    
    try {
      const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      // Configure SQLite for better concurrency
      if (this.config.enable_wal) {
        await db.exec('PRAGMA journal_mode = WAL;');
      }
      
      await db.exec(`PRAGMA busy_timeout = ${this.config.busy_timeout};`);
      await db.exec('PRAGMA foreign_keys = ON;');
      await db.exec('PRAGMA synchronous = NORMAL;');

      this.logger.debug('Created new SQLite connection', { path: dbPath });
      return db;
    } catch (error) {
      this.logger.error('Failed to create database connection', { error: error.message });
      throw new ConnectionError(`Failed to create connection: ${error.message}`, error);
    }
  }

  /**
   * Close all connections in the pool
   */
  async closeAll() {
    this.isShuttingDown = true;
    this.logger.info('Shutting down connection pool');

    // Reject all waiting requests
    this.waitingQueue.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new ConnectionError('Connection pool is shutting down'));
    });
    this.waitingQueue = [];

    // Close all connections
    const allConnections = [...this.connections, ...this.availableConnections];
    const closePromises = allConnections.map(async (connection) => {
      try {
        await connection.close();
      } catch (error) {
        this.logger.warn('Error closing connection', { error: error.message });
      }
    });

    await Promise.all(closePromises);
    this.connections.clear();
    this.availableConnections = [];
    
    this.logger.info('Connection pool shutdown complete');
  }
}

/**
 * Database session wrapper for transaction management
 */
class DatabaseSession {
  constructor(connection, pool, logger) {
    this.connection = connection;
    this.pool = pool;
    this.logger = logger;
    this.isInTransaction = false;
    this.isClosed = false;
  }

  /**
   * Execute a SQL query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} Query result
   */
  async execute(sql, params = []) {
    if (this.isClosed) {
      throw new DatabaseError('Session is closed');
    }

    try {
      this.logger.debug('Executing SQL query', { sql, params });
      const result = await this.connection.run(sql, params);
      return result;
    } catch (error) {
      this.logger.error('SQL execution failed', { sql, params, error: error.message });
      throw new DatabaseError(`Query execution failed: ${error.message}`, 'QUERY_ERROR', error);
    }
  }

  /**
   * Fetch all rows from a query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async fetchAll(sql, params = []) {
    if (this.isClosed) {
      throw new DatabaseError('Session is closed');
    }

    try {
      this.logger.debug('Fetching all rows', { sql, params });
      const rows = await this.connection.all(sql, params);
      return rows;
    } catch (error) {
      this.logger.error('Fetch all failed', { sql, params, error: error.message });
      throw new DatabaseError(`Fetch failed: ${error.message}`, 'QUERY_ERROR', error);
    }
  }

  /**
   * Fetch one row from a query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|null>} Query result
   */
  async fetchOne(sql, params = []) {
    if (this.isClosed) {
      throw new DatabaseError('Session is closed');
    }

    try {
      this.logger.debug('Fetching one row', { sql, params });
      const row = await this.connection.get(sql, params);
      return row || null;
    } catch (error) {
      this.logger.error('Fetch one failed', { sql, params, error: error.message });
      throw new DatabaseError(`Fetch failed: ${error.message}`, 'QUERY_ERROR', error);
    }
  }

  /**
   * Begin a database transaction
   */
  async beginTransaction() {
    if (this.isInTransaction) {
      throw new TransactionError('Transaction already in progress');
    }

    try {
      await this.connection.exec('BEGIN TRANSACTION;');
      this.isInTransaction = true;
      this.logger.debug('Transaction started');
    } catch (error) {
      throw new TransactionError(`Failed to begin transaction: ${error.message}`, error);
    }
  }

  /**
   * Commit the current transaction
   */
  async commit() {
    if (!this.isInTransaction) {
      throw new TransactionError('No transaction in progress');
    }

    try {
      await this.connection.exec('COMMIT;');
      this.isInTransaction = false;
      this.logger.debug('Transaction committed');
    } catch (error) {
      this.isInTransaction = false;
      throw new TransactionError(`Failed to commit transaction: ${error.message}`, error);
    }
  }

  /**
   * Rollback the current transaction
   */
  async rollback() {
    if (!this.isInTransaction) {
      throw new TransactionError('No transaction in progress');
    }

    try {
      await this.connection.exec('ROLLBACK;');
      this.isInTransaction = false;
      this.logger.debug('Transaction rolled back');
    } catch (error) {
      this.isInTransaction = false;
      throw new TransactionError(`Failed to rollback transaction: ${error.message}`, error);
    }
  }

  /**
   * Execute a function within a transaction
   * @param {Function} fn - Function to execute in transaction
   * @returns {Promise<any>} Function result
   */
  async transaction(fn) {
    await this.beginTransaction();
    
    try {
      const result = await fn(this);
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  /**
   * Close the session and return connection to pool
   */
  async close() {
    if (this.isClosed) {
      return;
    }

    if (this.isInTransaction) {
      this.logger.warn('Closing session with active transaction, rolling back');
      await this.rollback();
    }

    this.pool.releaseConnection(this.connection);
    this.isClosed = true;
    this.logger.debug('Session closed');
  }
}

/**
 * Base model class with common fields and utilities
 */
class BaseModel {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
    
    // Copy other properties
    Object.keys(data).forEach(key => {
      if (!['id', 'created_at', 'updated_at'].includes(key)) {
        this[key] = data[key];
      }
    });
  }

  /**
   * Update the updated_at timestamp
   */
  touch() {
    this.updated_at = new Date().toISOString();
  }

  /**
   * Convert model to plain object
   * @returns {Object} Plain object representation
   */
  toObject() {
    const obj = {};
    Object.keys(this).forEach(key => {
      if (typeof this[key] !== 'function') {
        obj[key] = this[key];
      }
    });
    return obj;
  }

  /**
   * Get base table schema SQL
   * @param {string} tableName - Name of the table
   * @returns {string} CREATE TABLE SQL
   */
  static getBaseSchema(tableName) {
    return `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `;
  }
}

/**
 * Main Database class - Singleton pattern for connection management
 */
class Database extends EventEmitter {
  constructor() {
    super();
    
    if (Database.instance) {
      return Database.instance;
    }

    this.config = new DatabaseConfig();
    this.logger = new DatabaseLogger(this.config.log_level);
    this.pool = new ConnectionPool(this.config, this.logger);
    this.isInitialized = false;
    this.healthCheckInterval = null;

    // Singleton instance
    Database.instance = this;

    // Graceful shutdown handling
    process.on('SIGINT', () => this.close());
    process.on('SIGTERM', () => this.close());
  }

  /**
   * Initialize the database
   * @param {Object} options - Initialization options
   * @returns {Promise<void>}
   */
  async init(options = {}) {
    if (this.isInitialized) {
      this.logger.warn('Database already initialized');
      return;
    }

    try {
      this.logger.info('Initializing database', { config: this.config });

      // Ensure database directory exists
      const dbPath = this.config.getDatabasePath();
      const dbDir = path.dirname(dbPath);
      
      try {
        await fs.access(dbDir);
      } catch {
        await fs.mkdir(db