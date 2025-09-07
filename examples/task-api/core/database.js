/**
 * Core Database Module - Production-ready database connection and session management
 * @module core.database
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Database configuration with environment-based settings
 */
const DB_CONFIG = {
  url: process.env.DATABASE_URL || './tasks.db',
  poolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
  timeout: parseInt(process.env.DB_TIMEOUT) || 5000,
  retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS) || 3,
  retryDelay: parseInt(process.env.DB_RETRY_DELAY) || 1000,
  enableWAL: process.env.DB_ENABLE_WAL !== 'false',
  enableForeignKeys: process.env.DB_ENABLE_FOREIGN_KEYS !== 'false'
};

/**
 * Database connection pool manager
 */
class DatabasePool {
  constructor(config) {
    this.config = config;
    this.connections = new Set();
    this.availableConnections = [];
    this.waitingQueue = [];
    this.isShuttingDown = false;
    this.healthCheckInterval = null;
  }

  /**
   * Initialize the database pool
   */
  async initialize() {
    try {
      // Ensure database directory exists
      const dbDir = dirname(this.config.url);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }

      // Create initial connections
      for (let i = 0; i < Math.min(2, this.config.poolSize); i++) {
        await this._createConnection();
      }

      // Start health check interval
      this._startHealthCheck();
      
      console.log(`Database pool initialized with ${this.connections.size} connections`);
    } catch (error) {
      console.error('Failed to initialize database pool:', error);
      throw error;
    }
  }

  /**
   * Create a new database connection
   * @private
   */
  async _createConnection() {
    return new Promise((resolve, reject) => {
      try {
        const db = new Database(this.config.url, {
          timeout: this.config.timeout,
          verbose: process.env.NODE_ENV === 'development' ? console.log : null
        });

        // Configure database settings
        if (this.config.enableWAL) {
          db.pragma('journal_mode = WAL');
        }
        
        if (this.config.enableForeignKeys) {
          db.pragma('foreign_keys = ON');
        }

        db.pragma('synchronous = NORMAL');
        db.pragma('cache_size = 1000');
        db.pragma('temp_store = memory');

        // Add connection metadata
        db._poolId = randomUUID();
        db._createdAt = Date.now();
        db._lastUsed = Date.now();
        db._inUse = false;

        this.connections.add(db);
        this.availableConnections.push(db);

        resolve(db);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get a connection from the pool
   * @returns {Promise<Database>} Database connection
   */
  async getConnection() {
    if (this.isShuttingDown) {
      throw new Error('Database pool is shutting down');
    }

    return new Promise(async (resolve, reject) => {
      try {
        // Check for available connection
        if (this.availableConnections.length > 0) {
          const connection = this.availableConnections.pop();
          connection._inUse = true;
          connection._lastUsed = Date.now();
          resolve(connection);
          return;
        }

        // Create new connection if under pool limit
        if (this.connections.size < this.config.poolSize) {
          const connection = await this._createConnection();
          connection._inUse = true;
          connection._lastUsed = Date.now();
          this.availableConnections.pop(); // Remove from available since we're using it
          resolve(connection);
          return;
        }

        // Add to waiting queue
        this.waitingQueue.push({ resolve, reject, timestamp: Date.now() });

        // Set timeout for waiting requests
        setTimeout(() => {
          const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
          if (index !== -1) {
            this.waitingQueue.splice(index, 1);
            reject(new Error('Database connection timeout'));
          }
        }, this.config.timeout);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Release a connection back to the pool
   * @param {Database} connection - Database connection to release
   */
  releaseConnection(connection) {
    if (!connection || !this.connections.has(connection)) {
      return;
    }

    connection._inUse = false;
    connection._lastUsed = Date.now();

    // Serve waiting requests first
    if (this.waitingQueue.length > 0) {
      const { resolve } = this.waitingQueue.shift();
      connection._inUse = true;
      resolve(connection);
      return;
    }

    // Return to available pool
    this.availableConnections.push(connection);
  }

  /**
   * Start health check for connections
   * @private
   */
  _startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      const maxIdleTime = 300000; // 5 minutes

      // Close idle connections (keep at least 1)
      for (const connection of this.connections) {
        if (!connection._inUse && 
            this.connections.size > 1 && 
            now - connection._lastUsed > maxIdleTime) {
          this._closeConnection(connection);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Close a specific connection
   * @private
   */
  _closeConnection(connection) {
    try {
      this.connections.delete(connection);
      const index = this.availableConnections.indexOf(connection);
      if (index !== -1) {
        this.availableConnections.splice(index, 1);
      }
      connection.close();
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }

  /**
   * Close all connections and shutdown pool
   */
  async close() {
    this.isShuttingDown = true;

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Reject all waiting requests
    while (this.waitingQueue.length > 0) {
      const { reject } = this.waitingQueue.shift();
      reject(new Error('Database pool is shutting down'));
    }

    // Close all connections
    const closePromises = Array.from(this.connections).map(connection => {
      return new Promise(resolve => {
        try {
          connection.close();
          resolve();
        } catch (error) {
          console.error('Error closing connection:', error);
          resolve();
        }
      });
    });

    await Promise.all(closePromises);
    this.connections.clear();
    this.availableConnections.length = 0;

    console.log('Database pool closed successfully');
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      availableConnections: this.availableConnections.length,
      activeConnections: this.connections.size - this.availableConnections.length,
      waitingRequests: this.waitingQueue.length,
      isShuttingDown: this.isShuttingDown
    };
  }
}

/**
 * Base model class with common fields and operations
 */
class BaseModel {
  constructor(data = {}) {
    this.id = data.id || randomUUID();
    this.createdAt = data.created_at || new Date().toISOString();
    this.updatedAt = data.updated_at || new Date().toISOString();
  }

  /**
   * Convert model to database row format
   */
  toRow() {
    return {
      id: this.id,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }

  /**
   * Update the updatedAt timestamp
   */
  touch() {
    this.updatedAt = new Date().toISOString();
  }
}

/**
 * Main database manager class
 */
class DatabaseManager {
  constructor(config = DB_CONFIG) {
    this.config = config;
    this.pool = new DatabasePool(config);
    this.isInitialized = false;
    this.migrations = new Map();
  }

  /**
   * Initialize the database and create tables
   */
  async initDb() {
    let retryCount = 0;
    
    while (retryCount < this.config.retryAttempts) {
      try {
        await this.pool.initialize();
        await this._runMigrations();
        this.isInitialized = true;
        
        console.log('Database initialized successfully');
        return;
        
      } catch (error) {
        retryCount++;
        console.error(`Database initialization attempt ${retryCount} failed:`, error);
        
        if (retryCount >= this.config.retryAttempts) {
          throw new Error(`Failed to initialize database after ${this.config.retryAttempts} attempts: ${error.message}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * retryCount));
      }
    }
  }

  /**
   * Run database migrations
   * @private
   */
  async _runMigrations() {
    const connection = await this.pool.getConnection();
    
    try {
      // Create migrations table if it doesn't exist
      connection.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Get executed migrations
      const executedMigrations = connection.prepare('SELECT name FROM migrations').all();
      const executedSet = new Set(executedMigrations.map(m => m.name));

      // Run pending migrations
      for (const [name, migration] of this.migrations) {
        if (!executedSet.has(name)) {
          console.log(`Running migration: ${name}`);
          
          const transaction = connection.transaction(() => {
            migration(connection);
            connection.prepare('INSERT INTO migrations (id, name) VALUES (?, ?)').run(randomUUID(), name);
          });
          
          transaction();
        }
      }
      
    } finally {
      this.pool.releaseConnection(connection);
    }
  }

  /**
   * Add a migration
   * @param {string} name - Migration name
   * @param {Function} migration - Migration function
   */
  addMigration(name, migration) {
    this.migrations.set(name, migration);
  }

  /**
   * Execute a database operation with automatic connection management
   * @param {Function} operation - Database operation function
   * @param {boolean} useTransaction - Whether to wrap in transaction
   * @returns {Promise<any>} Operation result
   */
  async execute(operation, useTransaction = false) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized. Call initDb() first.');
    }

    const connection = await this.pool.getConnection();
    
    try {
      if (useTransaction) {
        const transaction = connection.transaction(operation);
        return transaction();
      } else {
        return operation(connection);
      }
    } catch (error) {
      console.error('Database operation failed:', error);
      throw error;
    } finally {
      this.pool.releaseConnection(connection);
    }
  }

  /**
   * Get database connection for dependency injection
   * @returns {Function} Database getter function
   */
  getDb() {
    return async () => {
      if (!this.isInitialized) {
        throw new Error('Database not initialized. Call initDb() first.');
      }
      return this.pool.getConnection();
    };
  }

  /**
   * Health check for database connectivity
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const connection = await this.pool.getConnection();
      
      try {
        // Simple query to test connectivity
        const result = connection.prepare('SELECT 1 as test').get();
        const stats = this.pool.getStats();
        
        return {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          stats,
          testQuery: result
        };
      } finally {
        this.pool.releaseConnection(connection);
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        stats: this.pool.getStats()
      };
    }
  }

  /**
   * Close database connections and cleanup
   */
  async closeDb() {
    try {
      await this.pool.close();
      this.isInitialized = false;
      console.log('Database connections closed successfully');
    } catch (error) {
      console.error('Error closing database:', error);
      throw error;
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return this.pool.getStats();
  }
}

// Global database manager instance
const dbManager = new DatabaseManager();

// Add default migrations
dbManager.addMigration('001_create_sessions', (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)
  `);
});

/**
 * Session management utilities
 */
class SessionManager {
  constructor(dbManager) {
    this.dbManager = dbManager;
    this.cleanupInterval = null;
  }

  /**
   * Start automatic session cleanup
   */
  startCleanup(intervalMs = 3600000) { // 1 hour default
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        console.error('Session cleanup failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop automatic session cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanup() {
    return this.dbManager.execute((db) => {
      const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
      if (result.changes > 0) {
        console.log(`Cleaned up ${result.changes} expired sessions`);
      }
      return result.changes;
    });
  }

  /**
   * Create a new session
   */
  async create(sessionId, data, expiresAt)