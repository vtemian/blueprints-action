/**
 * Core Database Module
 * Production-ready SQLite database connection and session management
 * 
 * @module core.database
 * @author Expert JavaScript Developer
 * @version 1.0.0
 */

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const EventEmitter = require('events');

/**
 * Database Configuration Class
 */
class DatabaseConfig {
    constructor() {
        this.DATABASE_URL = process.env.DATABASE_URL || './tasks.db';
        this.MAX_CONNECTIONS = parseInt(process.env.DB_MAX_CONNECTIONS) || 10;
        this.CONNECTION_TIMEOUT = parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000;
        this.RETRY_ATTEMPTS = parseInt(process.env.DB_RETRY_ATTEMPTS) || 3;
        this.RETRY_DELAY = parseInt(process.env.DB_RETRY_DELAY) || 1000;
        this.WAL_MODE = process.env.DB_WAL_MODE !== 'false';
        this.FOREIGN_KEYS = process.env.DB_FOREIGN_KEYS !== 'false';
        this.BUSY_TIMEOUT = parseInt(process.env.DB_BUSY_TIMEOUT) || 5000;
    }
}

/**
 * Database Connection Pool Manager
 */
class DatabasePool extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.connections = new Map();
        this.activeConnections = 0;
        this.isShuttingDown = false;
        this.healthCheckInterval = null;
        this.stats = {
            totalConnections: 0,
            activeQueries: 0,
            errors: 0,
            lastError: null
        };
    }

    /**
     * Get or create a database connection
     * @returns {Database} SQLite database instance
     */
    async getConnection() {
        if (this.isShuttingDown) {
            throw new Error('Database pool is shutting down');
        }

        const connectionId = `conn_${Date.now()}_${Math.random()}`;
        
        try {
            const db = new Database(this.config.DATABASE_URL, {
                timeout: this.config.CONNECTION_TIMEOUT,
                verbose: process.env.NODE_ENV === 'development' ? console.log : null
            });

            // Configure database settings
            this.configureConnection(db);
            
            this.connections.set(connectionId, {
                db,
                created: Date.now(),
                lastUsed: Date.now()
            });

            this.activeConnections++;
            this.stats.totalConnections++;
            
            this.emit('connectionCreated', { connectionId, activeConnections: this.activeConnections });
            
            return { db, connectionId };
        } catch (error) {
            this.stats.errors++;
            this.stats.lastError = error;
            this.emit('connectionError', error);
            throw new DatabaseError(`Failed to create database connection: ${error.message}`, error);
        }
    }

    /**
     * Configure individual database connection
     * @param {Database} db - SQLite database instance
     */
    configureConnection(db) {
        // Enable WAL mode for better concurrency
        if (this.config.WAL_MODE) {
            db.pragma('journal_mode = WAL');
        }
        
        // Enable foreign key constraints
        if (this.config.FOREIGN_KEYS) {
            db.pragma('foreign_keys = ON');
        }
        
        // Set busy timeout
        db.pragma(`busy_timeout = ${this.config.BUSY_TIMEOUT}`);
        
        // Optimize for performance
        db.pragma('synchronous = NORMAL');
        db.pragma('cache_size = 1000');
        db.pragma('temp_store = memory');
    }

    /**
     * Release a database connection
     * @param {string} connectionId - Connection identifier
     */
    releaseConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            try {
                connection.db.close();
                this.connections.delete(connectionId);
                this.activeConnections--;
                this.emit('connectionReleased', { connectionId, activeConnections: this.activeConnections });
            } catch (error) {
                console.error(`Error closing connection ${connectionId}:`, error);
            }
        }
    }

    /**
     * Start health check monitoring
     */
    startHealthCheck() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.healthCheck();
            } catch (error) {
                this.emit('healthCheckFailed', error);
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Perform database health check
     */
    async healthCheck() {
        const { db, connectionId } = await this.getConnection();
        try {
            const result = db.prepare('SELECT 1 as health').get();
            if (result.health !== 1) {
                throw new Error('Health check failed');
            }
            this.emit('healthCheckPassed');
        } finally {
            this.releaseConnection(connectionId);
        }
    }

    /**
     * Get pool statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeConnections: this.activeConnections,
            totalConnectionsInPool: this.connections.size
        };
    }

    /**
     * Gracefully shutdown the connection pool
     */
    async shutdown() {
        this.isShuttingDown = true;
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Close all connections
        const closePromises = Array.from(this.connections.entries()).map(([connectionId, connection]) => {
            return new Promise((resolve) => {
                try {
                    connection.db.close();
                    resolve();
                } catch (error) {
                    console.error(`Error closing connection ${connectionId}:`, error);
                    resolve();
                }
            });
        });

        await Promise.all(closePromises);
        this.connections.clear();
        this.activeConnections = 0;
        this.emit('shutdown');
    }
}

/**
 * Custom Database Error Class
 */
class DatabaseError extends Error {
    constructor(message, originalError = null) {
        super(message);
        this.name = 'DatabaseError';
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * Base Model Class for common database operations
 */
class BaseModel {
    constructor(tableName, db) {
        this.tableName = tableName;
        this.db = db;
        this.fields = ['id', 'created_at', 'updated_at'];
    }

    /**
     * Create a new record
     * @param {Object} data - Record data
     * @returns {Object} Created record
     */
    async create(data) {
        const now = new Date().toISOString();
        const recordData = {
            id: uuidv4(),
            created_at: now,
            updated_at: now,
            ...data
        };

        const fields = Object.keys(recordData);
        const placeholders = fields.map(() => '?').join(', ');
        const values = Object.values(recordData);

        const query = `
            INSERT INTO ${this.tableName} (${fields.join(', ')})
            VALUES (${placeholders})
        `;

        try {
            const stmt = this.db.prepare(query);
            stmt.run(values);
            return this.findById(recordData.id);
        } catch (error) {
            throw new DatabaseError(`Failed to create record in ${this.tableName}: ${error.message}`, error);
        }
    }

    /**
     * Find record by ID
     * @param {string} id - Record ID
     * @returns {Object|null} Found record or null
     */
    async findById(id) {
        try {
            const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
            return stmt.get(id) || null;
        } catch (error) {
            throw new DatabaseError(`Failed to find record by ID in ${this.tableName}: ${error.message}`, error);
        }
    }

    /**
     * Find records with conditions
     * @param {Object} conditions - Where conditions
     * @param {Object} options - Query options (limit, offset, orderBy)
     * @returns {Array} Found records
     */
    async find(conditions = {}, options = {}) {
        try {
            let query = `SELECT * FROM ${this.tableName}`;
            const values = [];

            // Build WHERE clause
            if (Object.keys(conditions).length > 0) {
                const whereClause = Object.keys(conditions)
                    .map(key => `${key} = ?`)
                    .join(' AND ');
                query += ` WHERE ${whereClause}`;
                values.push(...Object.values(conditions));
            }

            // Add ORDER BY
            if (options.orderBy) {
                query += ` ORDER BY ${options.orderBy}`;
            }

            // Add LIMIT and OFFSET
            if (options.limit) {
                query += ` LIMIT ${parseInt(options.limit)}`;
                if (options.offset) {
                    query += ` OFFSET ${parseInt(options.offset)}`;
                }
            }

            const stmt = this.db.prepare(query);
            return stmt.all(values);
        } catch (error) {
            throw new DatabaseError(`Failed to find records in ${this.tableName}: ${error.message}`, error);
        }
    }

    /**
     * Update record by ID
     * @param {string} id - Record ID
     * @param {Object} data - Update data
     * @returns {Object|null} Updated record or null
     */
    async update(id, data) {
        const updateData = {
            ...data,
            updated_at: new Date().toISOString()
        };

        const fields = Object.keys(updateData);
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = [...Object.values(updateData), id];

        const query = `
            UPDATE ${this.tableName}
            SET ${setClause}
            WHERE id = ?
        `;

        try {
            const stmt = this.db.prepare(query);
            const result = stmt.run(values);
            
            if (result.changes === 0) {
                return null;
            }
            
            return this.findById(id);
        } catch (error) {
            throw new DatabaseError(`Failed to update record in ${this.tableName}: ${error.message}`, error);
        }
    }

    /**
     * Delete record by ID
     * @param {string} id - Record ID
     * @returns {boolean} Success status
     */
    async delete(id) {
        try {
            const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
            const result = stmt.run(id);
            return result.changes > 0;
        } catch (error) {
            throw new DatabaseError(`Failed to delete record in ${this.tableName}: ${error.message}`, error);
        }
    }

    /**
     * Count records with conditions
     * @param {Object} conditions - Where conditions
     * @returns {number} Record count
     */
    async count(conditions = {}) {
        try {
            let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
            const values = [];

            if (Object.keys(conditions).length > 0) {
                const whereClause = Object.keys(conditions)
                    .map(key => `${key} = ?`)
                    .join(' AND ');
                query += ` WHERE ${whereClause}`;
                values.push(...Object.values(conditions));
            }

            const stmt = this.db.prepare(query);
            const result = stmt.get(values);
            return result.count;
        } catch (error) {
            throw new DatabaseError(`Failed to count records in ${this.tableName}: ${error.message}`, error);
        }
    }
}

/**
 * Database Manager - Main class for database operations
 */
class DatabaseManager {
    constructor() {
        this.config = new DatabaseConfig();
        this.pool = new DatabasePool(this.config);
        this.isInitialized = false;
        this.currentConnection = null;
        
        // Setup event listeners
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for monitoring
     */
    setupEventListeners() {
        this.pool.on('connectionError', (error) => {
            console.error('Database connection error:', error);
        });

        this.pool.on('healthCheckFailed', (error) => {
            console.error('Database health check failed:', error);
        });

        this.pool.on('shutdown', () => {
            console.log('Database pool shutdown completed');
        });
    }

    /**
     * Initialize database with retry logic
     */
    async initDb() {
        if (this.isInitialized) {
            return;
        }

        let lastError;
        for (let attempt = 1; attempt <= this.config.RETRY_ATTEMPTS; attempt++) {
            try {
                console.log(`Initializing database (attempt ${attempt}/${this.config.RETRY_ATTEMPTS})...`);
                
                // Ensure database directory exists
                const dbDir = path.dirname(this.config.DATABASE_URL);
                await fs.mkdir(dbDir, { recursive: true });

                // Get connection and create tables
                const { db, connectionId } = await this.pool.getConnection();
                this.currentConnection = { db, connectionId };

                await this.createTables(db);
                await this.runMigrations(db);

                this.isInitialized = true;
                this.pool.startHealthCheck();
                
                console.log('Database initialized successfully');
                return;
            } catch (error) {
                lastError = error;
                console.error(`Database initialization attempt ${attempt} failed:`, error.message);
                
                if (attempt < this.config.RETRY_ATTEMPTS) {
                    await this.delay(this.config.RETRY_DELAY * attempt);
                }
            }
        }

        throw new DatabaseError(`Failed to initialize database after ${this.config.RETRY_ATTEMPTS} attempts`, lastError);
    }

    /**
     * Create database tables
     * @param {Database} db - Database instance
     */
    async createTables(db) {
        const tables = [
            // Tasks table example
            `CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'pending',
                priority INTEGER DEFAULT 1,
                due_date TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )`,
            
            // Users table example
            `CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                is_active BOOLEAN DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )`,

            // Sessions table for session management
            `CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                session_data TEXT,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )`
        ];