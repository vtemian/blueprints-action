/**
 * @fileoverview Database connection and session management module
 * @module core/database
 * @version 1.0.0
 * 
 * Setup Instructions:
 * 1. npm install better-sqlite3 uuid
 * 2. Set DATABASE_URL environment variable (optional)
 * 3. Call initDb() on application startup
 * 4. Call closeDb() on application shutdown
 * 
 * Usage Example:
 * import { getDb, initDb, closeDb } from './core/database.js';
 * 
 * // Initialize database
 * await initDb();
 * 
 * // Use in route handlers
 * app.get('/api/data', async (req, res) => {
 *   const db = await getDb();
 *   const result = db.prepare('SELECT * FROM users').all();
 *   res.json(result);
 * });
 * 
 * // Cleanup on shutdown
 * process.on('SIGINT', async () => {
 *   await closeDb();
 *   process.exit(0);
 * });
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * @typedef {Object} DatabaseConfig
 * @property {string} url - Database file path
 * @property {boolean} verbose - Enable verbose logging
 * @property {number} timeout - Connection timeout in milliseconds
 * @property {boolean} readonly - Open database in readonly mode
 * @property {boolean} fileMustExist - Database file must exist
 * @property {number} maxConnections - Maximum number of connections in pool
 */

/**
 * @typedef {Object} BaseModel
 * @property {string} id - UUID primary key
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string} updatedAt - ISO timestamp of last update
 */

class DatabaseManager {
  constructor() {
    /** @type {Database|null} */
    this.db = null;
    
    /** @type {Set<Database>} */
    this.connectionPool = new Set();
    
    /** @type {DatabaseConfig} */
    this.config = this._loadConfig();
    
    /** @type {boolean} */
    this.isInitialized = false;
    
    /** @type {Map<string, any>} */
    this.preparedStatements = new Map();
    
    this._setupGracefulShutdown();
  }

  /**
   * Load database configuration from environment variables
   * @private
   * @returns {DatabaseConfig}
   */
  _loadConfig() {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const dbUrl = process.env.DATABASE_URL || './tasks.db';
    
    return {
      url: dbUrl,
      verbose: isDevelopment && process.env.DB_VERBOSE === 'true',
      timeout: parseInt(process.env.DB_TIMEOUT || '5000', 10),
      readonly: process.env.DB_READONLY === 'true',
      fileMustExist: false,
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10)
    };
  }

  /**
   * Setup graceful shutdown handlers
   * @private
   */
  _setupGracefulShutdown() {
    const shutdownHandler = async (signal) => {
      console.log(`Received ${signal}. Closing database connections...`);
      await this.closeDb();
      process.exit(0);
    };

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught Exception:', error);
      await this.closeDb();
      process.exit(1);
    });
  }

  /**
   * Ensure database directory exists
   * @private
   * @param {string} dbPath - Database file path
   */
  _ensureDirectoryExists(dbPath) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Create database connection with retry logic
   * @private
   * @param {number} retries - Number of retry attempts
   * @returns {Promise<Database>}
   * @throws {Error} When connection fails after all retries
   */
  async _createConnection(retries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this._ensureDirectoryExists(this.config.url);
        
        const db = new Database(this.config.url, {
          verbose: this.config.verbose ? console.log : null,
          timeout: this.config.timeout,
          readonly: this.config.readonly,
          fileMustExist: this.config.fileMustExist
        });

        // Configure database settings
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('cache_size = 1000');
        db.pragma('temp_store = memory');
        db.pragma('mmap_size = 268435456'); // 256MB

        // Test connection
        db.prepare('SELECT 1').get();
        
        if (this.config.verbose) {
          console.log(`Database connection established (attempt ${attempt})`);
        }
        
        return db;
      } catch (error) {
        lastError = error;
        console.error(`Database connection attempt ${attempt} failed:`, error.message);
        
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Failed to connect to database after ${retries} attempts: ${lastError.message}`);
  }

  /**
   * Initialize database and create tables
   * @async
   * @returns {Promise<void>}
   * @throws {Error} When initialization fails
   */
  async initDb() {
    if (this.isInitialized) {
      console.warn('Database already initialized');
      return;
    }

    try {
      console.log('Initializing database...');
      
      this.db = await this._createConnection();
      
      // Create base tables with common fields
      this._createBaseTables();
      
      // Prepare common statements
      this._prepareStatements();
      
      this.isInitialized = true;
      console.log('Database initialized successfully');
      
    } catch (error) {
      console.error('Database initialization failed:', error);
      await this.closeDb();
      throw error;
    }
  }

  /**
   * Create base database tables
   * @private
   */
  _createBaseTables() {
    const createTablesSQL = `
      -- Users table example
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1
      );

      -- Tasks table example
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER DEFAULT 0,
        user_id TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
      
      -- Create triggers for updated_at timestamps
      CREATE TRIGGER IF NOT EXISTS users_updated_at 
        AFTER UPDATE ON users
        BEGIN
          UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
        END;

      CREATE TRIGGER IF NOT EXISTS tasks_updated_at 
        AFTER UPDATE ON tasks
        BEGIN
          UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
        END;
    `;

    this.db.exec(createTablesSQL);
  }

  /**
   * Prepare commonly used SQL statements
   * @private
   */
  _prepareStatements() {
    const statements = {
      healthCheck: 'SELECT 1 as healthy',
      getUserById: 'SELECT * FROM users WHERE id = ?',
      getTaskById: 'SELECT * FROM tasks WHERE id = ?',
      getUserTasks: 'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC'
    };

    for (const [name, sql] of Object.entries(statements)) {
      try {
        this.preparedStatements.set(name, this.db.prepare(sql));
      } catch (error) {
        console.error(`Failed to prepare statement ${name}:`, error);
      }
    }
  }

  /**
   * Get database connection for dependency injection
   * @async
   * @returns {Promise<Database>} Database connection
   * @throws {Error} When database is not initialized
   */
  async getDb() {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized. Call initDb() first.');
    }

    try {
      // Health check
      this.preparedStatements.get('healthCheck')?.get();
      return this.db;
    } catch (error) {
      console.error('Database health check failed:', error);
      
      // Attempt to reconnect
      try {
        await this.closeDb();
        await this.initDb();
        return this.db;
      } catch (reconnectError) {
        console.error('Database reconnection failed:', reconnectError);
        throw new Error('Database connection lost and reconnection failed');
      }
    }
  }

  /**
   * Execute a transaction with automatic rollback on error
   * @async
   * @param {Function} callback - Transaction callback function
   * @returns {Promise<any>} Transaction result
   * @throws {Error} When transaction fails
   */
  async transaction(callback) {
    const db = await this.getDb();
    const transaction = db.transaction(callback);
    
    try {
      return transaction();
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  }

  /**
   * Create a new record with base model fields
   * @param {string} table - Table name
   * @param {Object} data - Record data
   * @returns {BaseModel} Created record with generated fields
   */
  createRecord(table, data) {
    const record = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data
    };

    return record;
  }

  /**
   * Update a record's updatedAt timestamp
   * @param {Object} data - Record data to update
   * @returns {Object} Updated record data
   */
  updateRecord(data) {
    return {
      ...data,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Get database health status
   * @async
   * @returns {Promise<Object>} Health status information
   */
  async getHealthStatus() {
    try {
      const db = await this.getDb();
      const startTime = Date.now();
      
      // Execute health check query
      const result = this.preparedStatements.get('healthCheck')?.get();
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        database: 'connected',
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
        config: {
          url: this.config.url,
          readonly: this.config.readonly,
          maxConnections: this.config.maxConnections
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Close database connections and cleanup resources
   * @async
   * @returns {Promise<void>}
   */
  async closeDb() {
    console.log('Closing database connections...');
    
    try {
      // Close prepared statements
      for (const [name, stmt] of this.preparedStatements) {
        try {
          stmt.finalize?.();
        } catch (error) {
          console.error(`Error closing prepared statement ${name}:`, error);
        }
      }
      this.preparedStatements.clear();

      // Close main connection
      if (this.db) {
        try {
          this.db.close();
          console.log('Main database connection closed');
        } catch (error) {
          console.error('Error closing main database connection:', error);
        }
        this.db = null;
      }

      // Close connection pool
      for (const connection of this.connectionPool) {
        try {
          connection.close();
        } catch (error) {
          console.error('Error closing pooled connection:', error);
        }
      }
      this.connectionPool.clear();

      this.isInitialized = false;
      console.log('Database cleanup completed');
      
    } catch (error) {
      console.error('Error during database cleanup:', error);
      throw error;
    }
  }
}

// Create singleton instance
const dbManager = new DatabaseManager();

/**
 * Get database connection for dependency injection
 * @async
 * @returns {Promise<Database>} Database connection
 */
export const getDb = () => dbManager.getDb();

/**
 * Initialize database and create tables
 * @async
 * @returns {Promise<void>}
 */
export const initDb = () => dbManager.initDb();

/**
 * Close database connections and cleanup resources
 * @async
 * @returns {Promise<void>}
 */
export const closeDb = () => dbManager.closeDb();

/**
 * Execute a database transaction
 * @async
 * @param {Function} callback - Transaction callback
 * @returns {Promise<any>} Transaction result
 */
export const transaction = (callback) => dbManager.transaction(callback);

/**
 * Create a new record with base model fields
 * @param {string} table - Table name
 * @param {Object} data - Record data
 * @returns {BaseModel} Created record
 */
export const createRecord = (table, data) => dbManager.createRecord(table, data);

/**
 * Update a record's timestamp
 * @param {Object} data - Record data
 * @returns {Object} Updated record
 */
export const updateRecord = (data