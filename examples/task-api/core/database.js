I'll create a comprehensive database connection and session management module for you. Here's the complete implementation:

## package.json dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^8.7.0",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.6",
    "@types/uuid": "^9.0.6"
  }
}
```

## core/database.js

```javascript
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Custom database error classes for better error handling
 */
export class DatabaseError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {Error} [originalError] - Original error object
   */
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message, originalError = null) {
    super(message, 'CONNECTION_ERROR', originalError);
    this.name = 'ConnectionError';
  }
}

export class TransactionError extends DatabaseError {
  constructor(message, originalError = null) {
    super(message, 'TRANSACTION_ERROR', originalError);
    this.name = 'TransactionError';
  }
}

export class ValidationError extends DatabaseError {
  constructor(message, originalError = null) {
    super(message, 'VALIDATION_ERROR', originalError);
    this.name = 'ValidationError';
  }
}

/**
 * Database configuration with validation and defaults
 */
class DatabaseConfig {
  constructor() {
    this.databaseUrl = process.env.DATABASE_URL || './tasks.db';
    this.maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS) || 10;
    this.connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000;
    this.maxRetries = parseInt(process.env.DB_MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.DB_RETRY_DELAY) || 1000;
    this.enableWAL = process.env.DB_ENABLE_WAL !== 'false';
    this.busyTimeout = parseInt(process.env.DB_BUSY_TIMEOUT) || 10000;
    
    this.validate();
  }

  validate() {
    if (!this.databaseUrl) {
      throw new ValidationError('Database URL is required');
    }
    if (this.maxConnections < 1 || this.maxConnections > 50) {
      throw new ValidationError('Max connections must be between 1 and 50');
    }
    if (this.connectionTimeout < 1000) {
      throw new ValidationError('Connection timeout must be at least 1000ms');
    }
  }
}

/**
 * Connection pool manager for SQLite database connections
 */
class ConnectionPool {
  constructor(config) {
    this.config = config;
    this.connections = new Set();
    this.availableConnections = [];
    this.waitingQueue = [];
    this.isShuttingDown = false;
  }

  /**
   * Get a connection from the pool with retry logic
   * @returns {Promise<Database>} Database connection
   */
  async getConnection() {
    if (this.isShuttingDown) {
      throw new ConnectionError('Connection pool is shutting down');
    }

    // Return available connection if exists
    if (this.availableConnections.length > 0) {
      const connection = this.availableConnections.pop();
      if (this.isConnectionHealthy(connection)) {
        return connection;
      }
      // Remove unhealthy connection
      this.connections.delete(connection);
      try {
        connection.close();
      } catch (error) {
        console.error('Error closing unhealthy connection:', error);
      }
    }

    // Create new connection if under limit
    if (this.connections.size < this.config.maxConnections) {
      return await this.createConnection();
    }

    // Wait for available connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new ConnectionError('Connection timeout: No available connections'));
      }, this.config.connectionTimeout);

      this.waitingQueue.push({
        resolve: (connection) => {
          clearTimeout(timeout);
          resolve(connection);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  /**
   * Release a connection back to the pool
   * @param {Database} connection - Database connection to release
   */
  releaseConnection(connection) {
    if (!this.connections.has(connection)) {
      return;
    }

    // Serve waiting requests first
    if (this.waitingQueue.length > 0) {
      const { resolve } = this.waitingQueue.shift();
      resolve(connection);
      return;
    }

    // Return to available pool
    this.availableConnections.push(connection);
  }

  /**
   * Create a new database connection with retry logic
   * @returns {Promise<Database>} New database connection
   */
  async createConnection() {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.ensureDatabaseDirectory();
        
        const connection = new Database(this.config.databaseUrl, {
          timeout: this.config.busyTimeout,
          verbose: process.env.NODE_ENV === 'development' ? console.log : null
        });

        // Configure connection
        this.configureConnection(connection);
        this.connections.add(connection);
        
        console.log(`Database connection created (attempt ${attempt}/${this.config.maxRetries})`);
        return connection;
        
      } catch (error) {
        lastError = error;
        console.error(`Connection attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }
    
    throw new ConnectionError(
      `Failed to create database connection after ${this.config.maxRetries} attempts`,
      lastError
    );
  }

  /**
   * Configure database connection settings
   * @param {Database} connection - Database connection to configure
   */
  configureConnection(connection) {
    // Enable WAL mode for better concurrency
    if (this.config.enableWAL) {
      connection.pragma('journal_mode = WAL');
    }
    
    // Set other pragmas for performance and reliability
    connection.pragma('synchronous = NORMAL');
    connection.pragma('cache_size = 1000');
    connection.pragma('temp_store = memory');
    connection.pragma('mmap_size = 268435456'); // 256MB
    
    // Set busy timeout
    connection.pragma(`busy_timeout = ${this.config.busyTimeout}`);
  }

  /**
   * Check if connection is healthy
   * @param {Database} connection - Connection to check
   * @returns {boolean} True if connection is healthy
   */
  isConnectionHealthy(connection) {
    try {
      connection.prepare('SELECT 1').get();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Ensure database directory exists
   * @returns {Promise<void>}
   */
  async ensureDatabaseDirectory() {
    if (this.config.databaseUrl === ':memory:') {
      return;
    }
    
    const dbDir = path.dirname(path.resolve(this.config.databaseUrl));
    try {
      await fs.access(dbDir);
    } catch (error) {
      await fs.mkdir(dbDir, { recursive: true });
    }
  }

  /**
   * Close all connections and cleanup
   * @returns {Promise<void>}
   */
  async closeAll() {
    this.isShuttingDown = true;
    
    // Reject all waiting requests
    this.waitingQueue.forEach(({ reject }) => {
      reject(new ConnectionError('Connection pool is shutting down'));
    });
    this.waitingQueue.length = 0;

    // Close all connections
    const closePromises = Array.from(this.connections).map(connection => {
      return new Promise((resolve) => {
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
    
    console.log('All database connections closed');
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main database manager class
 * 
 * @example
 * ```javascript
 * // Initialize database
 * await initDb();
 * 
 * // Get connection and execute query
 * const db = await getDb();
 * const result = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
 * 
 * // Use transaction
 * await withTransaction(async (db) => {
 *   db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(uuidv4(), 'John');
 *   db.prepare('INSERT INTO profiles (user_id, bio) VALUES (?, ?)').run(userId, 'Bio');
 * });
 * ```
 */
class DatabaseManager {
  constructor() {
    this.config = new DatabaseConfig();
    this.pool = new ConnectionPool(this.config);
    this.isInitialized = false;
    this.setupGracefulShutdown();
  }

  /**
   * Initialize database with tables and migrations
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      const connection = await this.pool.getConnection();
      
      // Create system tables
      await this.createSystemTables(connection);
      
      // Run migrations
      await this.runMigrations(connection);
      
      this.pool.releaseConnection(connection);
      this.isInitialized = true;
      
      console.log('Database initialized successfully');
    } catch (error) {
      throw new DatabaseError('Failed to initialize database', 'INIT_ERROR', error);
    }
  }

  /**
   * Create system tables for metadata and migrations
   * @param {Database} connection - Database connection
   */
  createSystemTables(connection) {
    const createMigrationsTable = `
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    connection.exec(createMigrationsTable);
  }

  /**
   * Run database migrations
   * @param {Database} connection - Database connection
   */
  async runMigrations(connection) {
    // Example initial migration - create tasks table
    const migrations = [
      {
        id: '001_create_tasks_table',
        name: 'Create tasks table',
        sql: `
          CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
            priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
            due_date DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
          CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
          CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
          
          CREATE TRIGGER IF NOT EXISTS update_tasks_updated_at 
          AFTER UPDATE ON tasks
          BEGIN
            UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
          END;
        `
      }
    ];

    for (const migration of migrations) {
      const existing = connection.prepare('SELECT id FROM migrations WHERE id = ?').get(migration.id);
      
      if (!existing) {
        console.log(`Running migration: ${migration.name}`);
        connection.exec(migration.sql);
        connection.prepare('INSERT INTO migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
      }
    }
  }

  /**
   * Get database connection from pool
   * @returns {Promise<Database>} Database connection
   */
  async getConnection() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return await this.pool.getConnection();
  }

  /**
   * Release connection back to pool
   * @param {Database} connection - Connection to release
   */
  releaseConnection(connection) {
    this.pool.releaseConnection(connection);
  }

  /**
   * Execute function within a database transaction
   * @param {Function} fn - Async function to execute in transaction
   * @returns {Promise<any>} Result of the function
   */
  async withTransaction(fn) {
    const connection = await this.getConnection();
    const transaction = connection.transaction(fn);
    
    try {
      const result = transaction(connection);
      this.releaseConnection(connection);
      return result;
    } catch (error) {
      this.releaseConnection(connection);
      throw new TransactionError('Transaction failed', error);
    }
  }

  /**
   * Close all database connections
   * @returns {Promise<void>}
   */
  async close() {
    await this.pool.closeAll();
    this.isInitialized = false;
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`Received ${signal}, closing database connections...`);
      try {
        await this.close();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.