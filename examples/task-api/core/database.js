/**
 * @fileoverview Core database connection and session management module
 * Provides SQLite database connectivity with connection pooling, session management,
 * and base model functionality for production applications.
 * 
 * @module core/database
 * @version 1.0.0
 * @author Expert JavaScript Developer
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { EventEmitter } from 'events';

/**
 * Database configuration object
 * @typedef {Object} DatabaseConfig
 * @property {string} url - Database file path or connection URL
 * @property {number} maxConnections - Maximum number of concurrent connections
 * @property {number} connectionTimeout - Connection timeout in milliseconds
 * @property {number} idleTimeout - Idle connection timeout in milliseconds
 * @property {boolean} enableWAL - Enable Write-Ahead Logging mode
 * @property {boolean} enableForeignKeys - Enable foreign key constraints
 * @property {string} logLevel - Logging level (error, warn, info, debug)
 * @property {number} retryAttempts - Number of retry attempts for failed operations
 * @property {number} retryDelay - Delay between retry attempts in milliseconds
 */

/**
 * Default database configuration
 * @type {DatabaseConfig}
 */
const DEFAULT_CONFIG = {
    url: process.env.DATABASE_URL || './data/tasks.db',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 10,
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 300000,
    enableWAL: process.env.DB_ENABLE_WAL !== 'false',
    enableForeignKeys: process.env.DB_ENABLE_FOREIGN_KEYS !== 'false',
    logLevel: process.env.DB_LOG_LEVEL || 'info',
    retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.DB_RETRY_DELAY) || 1000
};

/**
 * Database connection pool manager
 * Handles connection lifecycle, pooling, and health monitoring
 */
class DatabasePool extends EventEmitter {
    /**
     * @param {DatabaseConfig} config - Database configuration
     */
    constructor(config = DEFAULT_CONFIG) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.connections = new Map();
        this.availableConnections = [];
        this.activeConnections = new Set();
        this.isInitialized = false;
        this.healthCheckInterval = null;
        
        // Bind methods to preserve context
        this.getConnection = this.getConnection.bind(this);
        this.releaseConnection = this.releaseConnection.bind(this);
        this.closeAll = this.closeAll.bind(this);
    }

    /**
     * Initialize the database pool
     * @returns {Promise<void>}
     * @throws {Error} If initialization fails
     */
    async initialize() {
        try {
            this.log('info', 'Initializing database pool...');
            
            // Ensure database directory exists
            const dbDir = dirname(this.config.url);
            if (!existsSync(dbDir)) {
                mkdirSync(dbDir, { recursive: true });
            }

            // Create initial connections
            for (let i = 0; i < Math.min(2, this.config.maxConnections); i++) {
                await this.createConnection();
            }

            // Start health check monitoring
            this.startHealthCheck();
            
            this.isInitialized = true;
            this.emit('initialized');
            this.log('info', `Database pool initialized with ${this.availableConnections.length} connections`);
        } catch (error) {
            this.log('error', 'Failed to initialize database pool:', error);
            throw new Error(`Database pool initialization failed: ${error.message}`);
        }
    }

    /**
     * Create a new database connection
     * @returns {Promise<Database>}
     * @private
     */
    async createConnection() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Database connection timeout'));
            }, this.config.connectionTimeout);

            try {
                const db = new Database(this.config.url, {
                    timeout: this.config.connectionTimeout,
                    verbose: this.config.logLevel === 'debug' ? console.log : null
                });

                // Configure database settings
                if (this.config.enableWAL) {
                    db.pragma('journal_mode = WAL');
                }
                
                if (this.config.enableForeignKeys) {
                    db.pragma('foreign_keys = ON');
                }

                // Set other pragmas for performance
                db.pragma('synchronous = NORMAL');
                db.pragma('cache_size = 1000');
                db.pragma('temp_store = memory');

                const connectionId = randomUUID();
                const connectionInfo = {
                    id: connectionId,
                    db,
                    createdAt: new Date(),
                    lastUsed: new Date(),
                    isActive: false
                };

                this.connections.set(connectionId, connectionInfo);
                this.availableConnections.push(connectionId);

                clearTimeout(timeout);
                resolve(db);
                
                this.log('debug', `Created database connection: ${connectionId}`);
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    /**
     * Get a database connection from the pool
     * @returns {Promise<{db: Database, release: Function}>}
     * @throws {Error} If no connection is available
     */
    async getConnection() {
        if (!this.isInitialized) {
            throw new Error('Database pool not initialized');
        }

        let connectionId = this.availableConnections.pop();
        
        // Create new connection if none available and under limit
        if (!connectionId && this.connections.size < this.config.maxConnections) {
            await this.createConnection();
            connectionId = this.availableConnections.pop();
        }

        // Wait for available connection if at limit
        if (!connectionId) {
            connectionId = await this.waitForConnection();
        }

        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo) {
            throw new Error('Invalid connection ID');
        }

        connectionInfo.isActive = true;
        connectionInfo.lastUsed = new Date();
        this.activeConnections.add(connectionId);

        const release = () => this.releaseConnection(connectionId);
        
        return {
            db: connectionInfo.db,
            release,
            id: connectionId
        };
    }

    /**
     * Wait for an available connection
     * @returns {Promise<string>} Connection ID
     * @private
     */
    async waitForConnection() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection pool exhausted - timeout waiting for available connection'));
            }, this.config.connectionTimeout);

            const checkForConnection = () => {
                const connectionId = this.availableConnections.pop();
                if (connectionId) {
                    clearTimeout(timeout);
                    resolve(connectionId);
                } else {
                    setTimeout(checkForConnection, 100);
                }
            };

            checkForConnection();
        });
    }

    /**
     * Release a connection back to the pool
     * @param {string} connectionId - Connection ID to release
     */
    releaseConnection(connectionId) {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo) {
            this.log('warn', `Attempted to release unknown connection: ${connectionId}`);
            return;
        }

        connectionInfo.isActive = false;
        connectionInfo.lastUsed = new Date();
        this.activeConnections.delete(connectionId);
        this.availableConnections.push(connectionId);

        this.log('debug', `Released connection: ${connectionId}`);
    }

    /**
     * Start health check monitoring
     * @private
     */
    startHealthCheck() {
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 60000); // Check every minute
    }

    /**
     * Perform health check on connections
     * @private
     */
    performHealthCheck() {
        const now = new Date();
        const connectionsToRemove = [];

        for (const [connectionId, connectionInfo] of this.connections) {
            // Remove idle connections that exceed timeout
            if (!connectionInfo.isActive && 
                (now - connectionInfo.lastUsed) > this.config.idleTimeout) {
                connectionsToRemove.push(connectionId);
            }
        }

        // Clean up idle connections
        connectionsToRemove.forEach(connectionId => {
            this.removeConnection(connectionId);
        });

        this.log('debug', `Health check completed. Active: ${this.activeConnections.size}, Available: ${this.availableConnections.length}`);
    }

    /**
     * Remove a connection from the pool
     * @param {string} connectionId - Connection ID to remove
     * @private
     */
    removeConnection(connectionId) {
        const connectionInfo = this.connections.get(connectionId);
        if (connectionInfo) {
            try {
                connectionInfo.db.close();
            } catch (error) {
                this.log('warn', `Error closing connection ${connectionId}:`, error);
            }
            
            this.connections.delete(connectionId);
            this.activeConnections.delete(connectionId);
            
            const index = this.availableConnections.indexOf(connectionId);
            if (index > -1) {
                this.availableConnections.splice(index, 1);
            }
            
            this.log('debug', `Removed connection: ${connectionId}`);
        }
    }

    /**
     * Close all connections and cleanup
     * @returns {Promise<void>}
     */
    async closeAll() {
        this.log('info', 'Closing all database connections...');
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        const closePromises = Array.from(this.connections.keys()).map(connectionId => {
            return new Promise(resolve => {
                try {
                    this.removeConnection(connectionId);
                } catch (error) {
                    this.log('error', `Error closing connection ${connectionId}:`, error);
                }
                resolve();
            });
        });

        await Promise.all(closePromises);
        
        this.connections.clear();
        this.availableConnections.length = 0;
        this.activeConnections.clear();
        this.isInitialized = false;
        
        this.emit('closed');
        this.log('info', 'All database connections closed');
    }

    /**
     * Get pool statistics
     * @returns {Object} Pool statistics
     */
    getStats() {
        return {
            totalConnections: this.connections.size,
            activeConnections: this.activeConnections.size,
            availableConnections: this.availableConnections.length,
            maxConnections: this.config.maxConnections,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Log message with level
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     * @private
     */
    log(level, message, ...args) {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        const configLevel = levels[this.config.logLevel] || 2;
        
        if (levels[level] <= configLevel) {
            const timestamp = new Date().toISOString();
            console[level](`[${timestamp}] [DB-${level.toUpperCase()}] ${message}`, ...args);
        }
    }
}

/**
 * Base model class with common functionality
 * Provides UUID primary keys and automatic timestamp management
 */
class BaseModel {
    /**
     * @param {Object} data - Initial data for the model
     */
    constructor(data = {}) {
        this.id = data.id || randomUUID();
        this.createdAt = data.created_at || new Date();
        this.updatedAt = data.updated_at || new Date();
        
        // Copy other properties
        Object.keys(data).forEach(key => {
            if (!['id', 'created_at', 'updated_at'].includes(key)) {
                this[key] = data[key];
            }
        });
    }

    /**
     * Update the updatedAt timestamp
     */
    touch() {
        this.updatedAt = new Date();
    }

    /**
     * Convert model to plain object
     * @returns {Object} Plain object representation
     */
    toObject() {
        const obj = {};
        for (const key in this) {
            if (this.hasOwnProperty(key) && typeof this[key] !== 'function') {
                obj[key] = this[key];
            }
        }
        return obj;
    }

    /**
     * Convert model to JSON
     * @returns {string} JSON representation
     */
    toJSON() {
        return JSON.stringify(this.toObject());
    }

    /**
     * Create base table schema
     * @returns {string} SQL CREATE TABLE statement base
     */
    static getBaseSchema() {
        return `
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        `;
    }
}

/**
 * Database session manager
 * Provides transaction support and query execution with retry logic
 */
class DatabaseSession {
    /**
     * @param {Object} connection - Database connection object
     */
    constructor(connection) {
        this.connection = connection;
        this.db = connection.db;
        this.isInTransaction = false;
        this.statements = new Map();
    }

    /**
     * Prepare a SQL statement with caching
     * @param {string} sql - SQL statement
     * @returns {Statement} Prepared statement
     */
    prepare(sql) {
        if (!this.statements.has(sql)) {
            this.statements.set(sql, this.db.prepare(sql));
        }
        return this.statements.get(sql);
    }

    /**
     * Execute a query with retry logic
     * @param {string} sql - SQL query
     * @param {Array|Object} params - Query parameters
     * @param {number} retryCount - Current retry count
     * @returns {Promise<any>} Query result
     */
    async execute(sql, params = [], retryCount = 0) {
        try {
            const stmt = this.prepare(sql);
            return stmt.run(params);
        } catch (error) {
            if (retryCount < DEFAULT_CONFIG.retryAttempts && this.isRetryableError(error)) {
                await this.delay(DEFAULT_CONFIG.retryDelay * (retryCount + 1));
                return this.execute(