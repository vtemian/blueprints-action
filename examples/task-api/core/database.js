/**
 * Core Database Module
 * Provides database connection, session management, and base model functionality
 * @module core.database
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { EventEmitter } from 'events';

/**
 * Custom database error classes
 */
export class DatabaseError extends Error {
    constructor(message, code = 'DB_ERROR') {
        super(message);
        this.name = 'DatabaseError';
        this.code = code;
    }
}

export class ConnectionError extends DatabaseError {
    constructor(message) {
        super(message, 'CONNECTION_ERROR');
        this.name = 'ConnectionError';
    }
}

export class TransactionError extends DatabaseError {
    constructor(message) {
        super(message, 'TRANSACTION_ERROR');
        this.name = 'TransactionError';
    }
}

/**
 * Database configuration and connection pool manager
 */
class DatabaseManager extends EventEmitter {
    constructor() {
        super();
        this.db = null;
        this.isInitialized = false;
        this.connectionPool = new Map();
        this.config = this._loadConfig();
        this.statements = new Map();
        
        // Graceful shutdown handling
        process.on('SIGINT', () => this.closeDb());
        process.on('SIGTERM', () => this.closeDb());
        process.on('exit', () => this.closeDb());
    }

    /**
     * Load database configuration from environment variables
     * @private
     * @returns {Object} Database configuration object
     */
    _loadConfig() {
        const dbUrl = process.env.DATABASE_URL || './tasks.db';
        const dbPath = dbUrl.replace('sqlite:///', '').replace('sqlite://', '');
        
        return {
            path: dbPath,
            options: {
                verbose: process.env.NODE_ENV === 'development' ? console.log : null,
                fileMustExist: false,
                timeout: parseInt(process.env.DB_TIMEOUT) || 5000,
                readonly: process.env.DB_READONLY === 'true',
            },
            pool: {
                maxConnections: parseInt(process.env.DB_POOL_SIZE) || 10,
                idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
            }
        };
    }

    /**
     * Ensure database directory exists
     * @private
     * @param {string} dbPath - Database file path
     */
    _ensureDbDirectory(dbPath) {
        const dir = dirname(dbPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Create database connection
     * @private
     * @returns {Database} SQLite database instance
     */
    _createConnection() {
        try {
            this._ensureDbDirectory(this.config.path);
            
            const db = new Database(this.config.path, this.config.options);
            
            // Configure SQLite for better performance and reliability
            db.pragma('journal_mode = WAL');
            db.pragma('synchronous = NORMAL');
            db.pragma('cache_size = 1000');
            db.pragma('temp_store = memory');
            db.pragma('mmap_size = 268435456'); // 256MB
            
            // Enable foreign keys
            db.pragma('foreign_keys = ON');
            
            return db;
        } catch (error) {
            throw new ConnectionError(`Failed to create database connection: ${error.message}`);
        }
    }

    /**
     * Get database connection (dependency injection function)
     * @returns {Database} Active database connection
     * @throws {ConnectionError} When connection is not available
     */
    getDb() {
        if (!this.db || !this.isInitialized) {
            throw new ConnectionError('Database not initialized. Call initDb() first.');
        }
        return this.db;
    }

    /**
     * Initialize database and create tables
     * @async
     * @returns {Promise<void>}
     * @throws {DatabaseError} When initialization fails
     */
    async initDb() {
        try {
            if (this.isInitialized) {
                return;
            }

            this.db = this._createConnection();
            
            // Create base tables
            await this._createBaseTables();
            
            // Prepare common statements
            this._prepareStatements();
            
            this.isInitialized = true;
            this.emit('connected');
            
            console.log(`Database initialized: ${this.config.path}`);
        } catch (error) {
            this.emit('error', error);
            throw new DatabaseError(`Database initialization failed: ${error.message}`);
        }
    }

    /**
     * Create base database tables
     * @private
     * @async
     * @returns {Promise<void>}
     */
    async _createBaseTables() {
        const createTablesSQL = `
            -- Base table for common fields
            CREATE TABLE IF NOT EXISTS base_model (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Trigger to update updated_at timestamp
            CREATE TRIGGER IF NOT EXISTS update_timestamp 
            AFTER UPDATE ON base_model
            BEGIN
                UPDATE base_model SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END;

            -- Example tasks table extending base model pattern
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                title TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
                priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
                due_date DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TRIGGER IF NOT EXISTS update_tasks_timestamp 
            AFTER UPDATE ON tasks
            BEGIN
                UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END;

            -- Indexes for better performance
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
            CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
        `;

        try {
            this.db.exec(createTablesSQL);
        } catch (error) {
            throw new DatabaseError(`Failed to create tables: ${error.message}`);
        }
    }

    /**
     * Prepare commonly used SQL statements
     * @private
     */
    _prepareStatements() {
        try {
            this.statements.set('healthCheck', this.db.prepare('SELECT 1 as healthy'));
            this.statements.set('getTableInfo', this.db.prepare('PRAGMA table_info(?)'));
            this.statements.set('vacuum', this.db.prepare('VACUUM'));
        } catch (error) {
            throw new DatabaseError(`Failed to prepare statements: ${error.message}`);
        }
    }

    /**
     * Execute a transaction with automatic rollback on error
     * @async
     * @param {Function} callback - Transaction callback function
     * @returns {Promise<any>} Transaction result
     * @throws {TransactionError} When transaction fails
     */
    async executeTransaction(callback) {
        if (!this.db) {
            throw new ConnectionError('Database not initialized');
        }

        const transaction = this.db.transaction(callback);
        
        try {
            return transaction();
        } catch (error) {
            throw new TransactionError(`Transaction failed: ${error.message}`);
        }
    }

    /**
     * Health check for database connection
     * @async
     * @returns {Promise<boolean>} Health status
     */
    async healthCheck() {
        try {
            if (!this.db || !this.isInitialized) {
                return false;
            }
            
            const stmt = this.statements.get('healthCheck');
            const result = stmt.get();
            return result && result.healthy === 1;
        } catch (error) {
            this.emit('error', error);
            return false;
        }
    }

    /**
     * Get database statistics
     * @async
     * @returns {Promise<Object>} Database statistics
     */
    async getStats() {
        if (!this.db) {
            throw new ConnectionError('Database not initialized');
        }

        try {
            const stats = {
                path: this.config.path,
                isInitialized: this.isInitialized,
                inTransaction: this.db.inTransaction,
                memory: this.db.memory,
                readonly: this.db.readonly,
                open: this.db.open,
            };

            return stats;
        } catch (error) {
            throw new DatabaseError(`Failed to get database stats: ${error.message}`);
        }
    }

    /**
     * Optimize database (vacuum and analyze)
     * @async
     * @returns {Promise<void>}
     */
    async optimize() {
        if (!this.db) {
            throw new ConnectionError('Database not initialized');
        }

        try {
            this.db.exec('VACUUM');
            this.db.exec('ANALYZE');
            console.log('Database optimization completed');
        } catch (error) {
            throw new DatabaseError(`Database optimization failed: ${error.message}`);
        }
    }

    /**
     * Close database connection and cleanup resources
     * @async
     * @returns {Promise<void>}
     */
    async closeDb() {
        try {
            if (this.db && this.db.open) {
                // Close prepared statements
                for (const [name, stmt] of this.statements) {
                    try {
                        stmt.finalize();
                    } catch (error) {
                        console.warn(`Failed to finalize statement ${name}:`, error.message);
                    }
                }
                this.statements.clear();

                // Close database connection
                this.db.close();
                this.emit('disconnected');
                console.log('Database connection closed');
            }
        } catch (error) {
            console.error('Error closing database:', error.message);
            throw new DatabaseError(`Failed to close database: ${error.message}`);
        } finally {
            this.db = null;
            this.isInitialized = false;
        }
    }
}

/**
 * Base Model class with common fields and methods
 */
export class BaseModel {
    constructor(data = {}) {
        this.id = data.id || this.generateId();
        this.created_at = data.created_at || new Date().toISOString();
        this.updated_at = data.updated_at || new Date().toISOString();
    }

    /**
     * Generate UUID for primary key
     * @returns {string} UUID string
     */
    generateId() {
        return randomUUID().replace(/-/g, '');
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
        return {
            id: this.id,
            created_at: this.created_at,
            updated_at: this.updated_at,
            ...this.getFields()
        };
    }

    /**
     * Get model-specific fields (to be overridden by subclasses)
     * @returns {Object} Model-specific fields
     */
    getFields() {
        return {};
    }

    /**
     * Validate model data (to be overridden by subclasses)
     * @returns {Array} Array of validation errors
     */
    validate() {
        const errors = [];
        
        if (!this.id) {
            errors.push('ID is required');
        }
        
        return errors;
    }
}

/**
 * Connection utilities and helper functions
 */
export class ConnectionUtils {
    /**
     * Retry database operation with exponential backoff
     * @async
     * @param {Function} operation - Operation to retry
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} baseDelay - Base delay in milliseconds
     * @returns {Promise<any>} Operation result
     */
    static async retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxRetries) {
                    break;
                }
                
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.warn(`Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error.message);
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw new DatabaseError(`Operation failed after ${maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Create a timeout wrapper for database operations
     * @async
     * @param {Promise} promise - Promise to wrap
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<any>} Promise with timeout
     */
    static async withTimeout(promise, timeout = 5000) {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new DatabaseError(`Operation timed out after ${timeout}ms`)), timeout);
        });
        
        return Promise.race([promise, timeoutPromise]);
    }
}

// Create singleton instance
const dbManager = new DatabaseManager();

// Export main functions and classes
export const getDb = () => dbManager.getDb();
export const initDb = () => dbManager.initDb();
export const closeDb = () => dbManager.closeDb();
export const executeTransaction = (callback) => dbManager.executeTransaction(callback);
export const healthCheck = () => dbManager.healthCheck();
export const getStats = () => dbManager.getStats();
export const optimize = () => dbManager.optimize();

// Export database manager instance for advanced usage
export { dbManager };

// Default export
export default {
    getDb,
    initDb,
    closeDb,
    executeTransaction,
    healthCheck,
    getStats,
    optimize,
    BaseModel,
    ConnectionUtils,
    DatabaseError,
    ConnectionError,
    TransactionError,
    dbManager
};