/**
 * Core Database Connection and Session Management Module
 * Provides SQLite database connection pooling, session management, and base model utilities
 * 
 * @module core.database
 * @author Production Ready Code Generator
 * @version 1.0.0
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { EventEmitter } from 'events';

// Configuration constants
const DEFAULT_DB_PATH = './tasks.db';
const DEFAULT_POOL_SIZE = 10;
const DEFAULT_BUSY_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

/**
 * Database configuration interface
 * @typedef {Object} DatabaseConfig
 * @property {string} url - Database file path
 * @property {number} poolSize - Maximum number of connections in pool
 * @property {number} busyTimeout - SQLite busy timeout in milliseconds
 * @property {number} retryAttempts - Number of retry attempts for failed operations
 * @property {number} retryDelay - Base delay between retries in milliseconds
 * @property {boolean} enableWAL - Enable Write-Ahead Logging mode
 * @property {boolean} enableForeignKeys - Enable foreign key constraints
 */

/**
 * Database error types
 */
class DatabaseError extends Error {
    constructor(message, code = 'DATABASE_ERROR', cause = null) {
        super(message);
        this.name = 'DatabaseError';
        this.code = code;
        this.cause = cause;
    }
}

class ConnectionError extends DatabaseError {
    constructor(message, cause = null) {
        super(message, 'CONNECTION_ERROR', cause);
        this.name = 'ConnectionError';
    }
}

class TransactionError extends DatabaseError {
    constructor(message, cause = null) {
        super(message, 'TRANSACTION_ERROR', cause);
        this.name = 'TransactionError';
    }
}

/**
 * Connection pool implementation for SQLite
 */
class ConnectionPool extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.connections = [];
        this.availableConnections = [];
        this.activeConnections = new Set();
        this.isShuttingDown = false;
        this.waitingQueue = [];
        
        this._initializePool();
    }

    /**
     * Initialize the connection pool
     * @private
     */
    _initializePool() {
        try {
            // Ensure database directory exists
            const dbDir = dirname(this.config.url);
            if (!existsSync(dbDir)) {
                mkdirSync(dbDir, { recursive: true });
            }

            // Create initial connections
            for (let i = 0; i < this.config.poolSize; i++) {
                const connection = this._createConnection();
                this.connections.push(connection);
                this.availableConnections.push(connection);
            }

            this.emit('poolReady', this.connections.length);
        } catch (error) {
            this.emit('error', new ConnectionError('Failed to initialize connection pool', error));
            throw error;
        }
    }

    /**
     * Create a new database connection
     * @private
     * @returns {Database} SQLite database connection
     */
    _createConnection() {
        try {
            const db = new Database(this.config.url, {
                timeout: this.config.busyTimeout,
                verbose: process.env.NODE_ENV === 'development' ? console.log : null
            });

            // Configure SQLite settings
            if (this.config.enableWAL) {
                db.pragma('journal_mode = WAL');
            }
            
            if (this.config.enableForeignKeys) {
                db.pragma('foreign_keys = ON');
            }

            // Set busy timeout
            db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
            
            // Optimize SQLite settings
            db.pragma('synchronous = NORMAL');
            db.pragma('cache_size = 1000');
            db.pragma('temp_store = memory');

            // Add connection metadata
            db._poolId = randomUUID();
            db._createdAt = new Date();
            db._lastUsed = new Date();

            return db;
        } catch (error) {
            throw new ConnectionError(`Failed to create database connection: ${error.message}`, error);
        }
    }

    /**
     * Acquire a connection from the pool
     * @returns {Promise<Database>} Database connection
     */
    async acquire() {
        if (this.isShuttingDown) {
            throw new ConnectionError('Connection pool is shutting down');
        }

        return new Promise((resolve, reject) => {
            if (this.availableConnections.length > 0) {
                const connection = this.availableConnections.pop();
                this.activeConnections.add(connection);
                connection._lastUsed = new Date();
                resolve(connection);
            } else {
                // Add to waiting queue
                this.waitingQueue.push({ resolve, reject, timestamp: Date.now() });
                
                // Set timeout for waiting requests
                setTimeout(() => {
                    const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
                    if (index !== -1) {
                        this.waitingQueue.splice(index, 1);
                        reject(new ConnectionError('Connection acquisition timeout'));
                    }
                }, this.config.busyTimeout);
            }
        });
    }

    /**
     * Release a connection back to the pool
     * @param {Database} connection - Database connection to release
     */
    release(connection) {
        if (!this.activeConnections.has(connection)) {
            console.warn('Attempting to release connection not in active set');
            return;
        }

        this.activeConnections.delete(connection);
        
        if (this.isShuttingDown) {
            this._closeConnection(connection);
            return;
        }

        // Check if there are waiting requests
        if (this.waitingQueue.length > 0) {
            const { resolve } = this.waitingQueue.shift();
            this.activeConnections.add(connection);
            connection._lastUsed = new Date();
            resolve(connection);
        } else {
            this.availableConnections.push(connection);
        }
    }

    /**
     * Close a specific connection
     * @private
     * @param {Database} connection - Connection to close
     */
    _closeConnection(connection) {
        try {
            connection.close();
        } catch (error) {
            console.error('Error closing database connection:', error);
        }
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
            isShuttingDown: this.isShuttingDown
        };
    }

    /**
     * Gracefully shutdown the connection pool
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.isShuttingDown = true;
        
        // Reject all waiting requests
        this.waitingQueue.forEach(({ reject }) => {
            reject(new ConnectionError('Connection pool is shutting down'));
        });
        this.waitingQueue = [];

        // Wait for active connections to be released (with timeout)
        const shutdownTimeout = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (this.activeConnections.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Force close any remaining active connections
        this.activeConnections.forEach(connection => {
            console.warn('Force closing active connection during shutdown');
            this._closeConnection(connection);
        });

        // Close all available connections
        this.availableConnections.forEach(connection => {
            this._closeConnection(connection);
        });

        this.connections = [];
        this.availableConnections = [];
        this.activeConnections.clear();
        
        this.emit('poolClosed');
    }
}

/**
 * Database connection manager
 */
class DatabaseManager {
    constructor(config = {}) {
        this.config = {
            url: config.url || process.env.DATABASE_URL || DEFAULT_DB_PATH,
            poolSize: config.poolSize || parseInt(process.env.DB_POOL_SIZE) || DEFAULT_POOL_SIZE,
            busyTimeout: config.busyTimeout || parseInt(process.env.DB_BUSY_TIMEOUT) || DEFAULT_BUSY_TIMEOUT,
            retryAttempts: config.retryAttempts || parseInt(process.env.DB_RETRY_ATTEMPTS) || DEFAULT_RETRY_ATTEMPTS,
            retryDelay: config.retryDelay || parseInt(process.env.DB_RETRY_DELAY) || DEFAULT_RETRY_DELAY,
            enableWAL: config.enableWAL !== undefined ? config.enableWAL : true,
            enableForeignKeys: config.enableForeignKeys !== undefined ? config.enableForeignKeys : true
        };
        
        this.pool = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the database connection pool
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            this.pool = new ConnectionPool(this.config);
            
            // Wait for pool to be ready
            await new Promise((resolve, reject) => {
                this.pool.once('poolReady', resolve);
                this.pool.once('error', reject);
            });

            this.isInitialized = true;
            console.log(`Database pool initialized with ${this.config.poolSize} connections`);
        } catch (error) {
            throw new ConnectionError('Failed to initialize database manager', error);
        }
    }

    /**
     * Execute a database operation with retry logic
     * @param {Function} operation - Database operation to execute
     * @param {number} attempt - Current attempt number
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, attempt = 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= this.config.retryAttempts) {
                throw error;
            }

            // Calculate exponential backoff delay
            const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
            console.warn(`Database operation failed (attempt ${attempt}), retrying in ${delay}ms:`, error.message);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.executeWithRetry(operation, attempt + 1);
        }
    }

    /**
     * Execute a database query
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<any>} Query result
     */
    async query(sql, params = []) {
        if (!this.isInitialized) {
            throw new DatabaseError('Database manager not initialized');
        }

        return this.executeWithRetry(async () => {
            const connection = await this.pool.acquire();
            try {
                const stmt = connection.prepare(sql);
                return stmt.all(params);
            } finally {
                this.pool.release(connection);
            }
        });
    }

    /**
     * Execute a database query and return first result
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<any>} First query result
     */
    async queryOne(sql, params = []) {
        if (!this.isInitialized) {
            throw new DatabaseError('Database manager not initialized');
        }

        return this.executeWithRetry(async () => {
            const connection = await this.pool.acquire();
            try {
                const stmt = connection.prepare(sql);
                return stmt.get(params);
            } finally {
                this.pool.release(connection);
            }
        });
    }

    /**
     * Execute a database command (INSERT, UPDATE, DELETE)
     * @param {string} sql - SQL command
     * @param {Array} params - Command parameters
     * @returns {Promise<Object>} Command result with changes and lastInsertRowid
     */
    async execute(sql, params = []) {
        if (!this.isInitialized) {
            throw new DatabaseError('Database manager not initialized');
        }

        return this.executeWithRetry(async () => {
            const connection = await this.pool.acquire();
            try {
                const stmt = connection.prepare(sql);
                return stmt.run(params);
            } finally {
                this.pool.release(connection);
            }
        });
    }

    /**
     * Execute multiple operations in a transaction
     * @param {Function} operations - Function containing database operations
     * @returns {Promise<any>} Transaction result
     */
    async transaction(operations) {
        if (!this.isInitialized) {
            throw new DatabaseError('Database manager not initialized');
        }

        return this.executeWithRetry(async () => {
            const connection = await this.pool.acquire();
            const transaction = connection.transaction(operations);
            
            try {
                return transaction();
            } catch (error) {
                throw new TransactionError('Transaction failed', error);
            } finally {
                this.pool.release(connection);
            }
        });
    }

    /**
     * Get pool statistics
     * @returns {Object} Pool statistics
     */
    getStats() {
        return this.pool ? this.pool.getStats() : null;
    }

    /**
     * Gracefully shutdown the database manager
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (this.pool) {
            await this.pool.shutdown();
            this.pool = null;
        }
        this.isInitialized = false;
        console.log('Database manager shutdown complete');
    }
}

/**
 * Base model utilities
 */
class BaseModel {
    /**
     * Generate a new UUID
     * @returns {string} UUID string
     */
    static generateId() {
        return randomUUID();
    }

    /**
     * Get current timestamp in ISO format
     * @returns {string} ISO timestamp
     */
    static getCurrentTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Add common fields to model data
     * @param {Object} data - Model data
     * @param {boolean} isUpdate - Whether this is an update operation
     * @returns {Object} Data with common fields
     */
    static addCommonFields(data, isUpdate = false) {
        const now = this.getCurrentTimestamp();
        
        if (!isUpdate) {
            data.id = data.id || this.generateId();
            data.created_at = now;
        }
        
        data.updated_at = now;
        return data;
    }

    /**
     * Validate required fields
     * @param {Object} data - Data to validate
     * @param {Array<string>} requiredFields - Required field names
     * @throws {DatabaseError} If validation fails
     */
    static validateRequired(data, requiredFields) {
        const missing = requiredFields.filter(field => 
            data[field] === undefined || data[field] === null || data[field] === ''
        );
        
        if (missing.length > 0) {
            throw new DatabaseError(`Missing require