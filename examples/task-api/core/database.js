/**
 * Database Connection and Session Management Module
 * Provides SQLite database connectivity with connection pooling,
 * session management, and base model functionality.
 */

import { Sequelize, DataTypes, Model } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

/**
 * Database configuration and connection management
 */
class DatabaseManager {
  constructor() {
    this.sequelize = null;
    this.isInitialized = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
    this.retryDelay = 1000; // Start with 1 second
  }

  /**
   * Initialize database connection with retry logic
   * @returns {Promise<Sequelize>} Database connection instance
   */
  async initialize() {
    if (this.isInitialized && this.sequelize) {
      return this.sequelize;
    }

    const dbUrl = process.env.DATABASE_URL || './tasks.db';
    const isProduction = process.env.NODE_ENV === 'production';

    try {
      // Ensure database directory exists
      if (dbUrl.startsWith('./') || dbUrl.startsWith('/')) {
        const dbDir = path.dirname(path.resolve(dbUrl));
        await fs.mkdir(dbDir, { recursive: true });
      }

      this.sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: dbUrl,
        logging: isProduction ? false : console.log,
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000,
        },
        retry: {
          match: [
            /SQLITE_BUSY/,
            /SQLITE_LOCKED/,
            /database is locked/,
          ],
          max: 3,
        },
        dialectOptions: {
          // Enable foreign keys for SQLite
          options: '--enable-fkey',
        },
        define: {
          // Global model options
          underscored: true,
          freezeTableName: true,
          charset: 'utf8',
          dialectOptions: {
            collate: 'utf8_general_ci',
          },
        },
      });

      await this.testConnection();
      this.isInitialized = true;
      this.connectionRetries = 0;

      console.log('✅ Database connection established successfully');
      return this.sequelize;

    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        const delay = this.retryDelay * Math.pow(2, this.connectionRetries - 1);
        
        console.log(`🔄 Retrying connection in ${delay}ms (attempt ${this.connectionRetries}/${this.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.initialize();
      }

      throw new Error(`Failed to connect to database after ${this.maxRetries} attempts: ${error.message}`);
    }
  }

  /**
   * Test database connection
   * @private
   */
  async testConnection() {
    try {
      await this.sequelize.authenticate();
      console.log('🔍 Database connection test passed');
    } catch (error) {
      throw new Error(`Database authentication failed: ${error.message}`);
    }
  }

  /**
   * Get database instance (for dependency injection)
   * @returns {Promise<Sequelize>} Database connection instance
   */
  async getConnection() {
    if (!this.isInitialized || !this.sequelize) {
      await this.initialize();
    }
    return this.sequelize;
  }

  /**
   * Close database connection gracefully
   * @returns {Promise<void>}
   */
  async close() {
    if (this.sequelize) {
      try {
        await this.sequelize.close();
        console.log('🔒 Database connection closed successfully');
      } catch (error) {
        console.error('❌ Error closing database connection:', error.message);
        throw error;
      } finally {
        this.sequelize = null;
        this.isInitialized = false;
        this.connectionRetries = 0;
      }
    }
  }

  /**
   * Check database health
   * @returns {Promise<Object>} Health status object
   */
  async healthCheck() {
    try {
      if (!this.sequelize) {
        return { status: 'disconnected', message: 'No database connection' };
      }

      const startTime = Date.now();
      await this.sequelize.authenticate();
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        connection: 'active',
        dialect: this.sequelize.getDialect(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connection: 'failed',
      };
    }
  }
}

// Singleton instance
const dbManager = new DatabaseManager();

/**
 * Base Model class with common fields and functionality
 * Provides UUID primary keys and automatic timestamps
 */
class BaseModel extends Model {
  /**
   * Initialize base model with common attributes
   * @param {Sequelize} sequelize - Database connection instance
   * @returns {void}
   */
  static initBaseModel(sequelize) {
    return super.init({
      id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    }, {
      sequelize,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      hooks: {
        beforeUpdate: (instance) => {
          instance.updated_at = new Date();
        },
      },
    });
  }

  /**
   * Convert model instance to JSON with custom formatting
   * @returns {Object} JSON representation of the model
   */
  toJSON() {
    const values = { ...this.get() };
    
    // Format dates to ISO strings
    if (values.created_at) {
      values.created_at = values.created_at.toISOString();
    }
    if (values.updated_at) {
      values.updated_at = values.updated_at.toISOString();
    }
    
    return values;
  }
}

/**
 * Transaction wrapper for database operations
 * @param {Function} operation - Async function to execute within transaction
 * @returns {Promise<any>} Result of the operation
 */
async function withTransaction(operation) {
  const sequelize = await getDb();
  const transaction = await sequelize.transaction();
  
  try {
    const result = await operation(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    console.error('🔄 Transaction rolled back:', error.message);
    throw error;
  }
}

/**
 * Initialize database and create tables
 * @param {Object} options - Initialization options
 * @param {boolean} options.force - Force recreate tables (development only)
 * @param {boolean} options.alter - Alter existing tables to match models
 * @returns {Promise<void>}
 */
async function initDb(options = {}) {
  const { force = false, alter = false } = options;
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (force && isProduction) {
    throw new Error('Cannot use force=true in production environment');
  }

  try {
    console.log('🚀 Initializing database...');
    
    const sequelize = await dbManager.initialize();
    
    // Sync all models
    await sequelize.sync({ 
      force, 
      alter: alter && !isProduction,
      logging: !isProduction ? console.log : false,
    });
    
    console.log('✅ Database initialization completed');
    
    // Run health check
    const health = await dbManager.healthCheck();
    console.log('🏥 Database health:', health);
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  }
}

/**
 * Get database connection instance (for dependency injection)
 * @returns {Promise<Sequelize>} Database connection instance
 * 
 * @example
 * // In Express.js route handler
 * app.get('/api/health', async (req, res) => {
 *   try {
 *     const db = await getDb();
 *     await db.authenticate();
 *     res.json({ status: 'healthy' });
 *   } catch (error) {
 *     res.status(500).json({ status: 'unhealthy', error: error.message });
 *   }
 * });
 */
async function getDb() {
  return dbManager.getConnection();
}

/**
 * Close database connection gracefully
 * @returns {Promise<void>}
 * 
 * @example
 * // Graceful shutdown
 * process.on('SIGTERM', async () => {
 *   console.log('Received SIGTERM, shutting down gracefully');
 *   await closeDb();
 *   process.exit(0);
 * });
 */
async function closeDb() {
  return dbManager.close();
}

/**
 * Get database health status
 * @returns {Promise<Object>} Health status object
 */
async function getDbHealth() {
  return dbManager.healthCheck();
}

/**
 * Create a new model class extending BaseModel
 * @param {string} modelName - Name of the model
 * @param {Object} attributes - Model attributes definition
 * @param {Object} options - Model options
 * @returns {Promise<Model>} Model class
 * 
 * @example
 * const Task = await createModel('Task', {
 *   title: {
 *     type: DataTypes.STRING,
 *     allowNull: false,
 *   },
 *   description: {
 *     type: DataTypes.TEXT,
 *     allowNull: true,
 *   },
 *   completed: {
 *     type: DataTypes.BOOLEAN,
 *     defaultValue: false,
 *   },
 * });
 */
async function createModel(modelName, attributes = {}, options = {}) {
  const sequelize = await getDb();
  
  class CustomModel extends BaseModel {}
  
  // Merge base attributes with custom attributes
  const allAttributes = {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    ...attributes,
  };

  const modelOptions = {
    sequelize,
    modelName,
    tableName: options.tableName || modelName.toLowerCase() + 's',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeUpdate: (instance) => {
        instance.updated_at = new Date();
      },
      ...options.hooks,
    },
    ...options,
  };

  CustomModel.init(allAttributes, modelOptions);
  
  return CustomModel;
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  try {
    await closeDb();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  try {
    await closeDb();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('💥 Uncaught Exception:', error);
  try {
    await closeDb();
  } catch (closeError) {
    console.error('❌ Error closing database during exception:', closeError.message);
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    await closeDb();
  } catch (closeError) {
    console.error('❌ Error closing database during rejection:', closeError.message);
  }
  process.exit(1);
});

// Named exports
export {
  getDb,
  initDb,
  closeDb,
  getDbHealth,
  BaseModel,
  createModel,
  withTransaction,
  DataTypes,
};

// Default export for convenience
export default {
  getDb,
  initDb,
  closeDb,
  getDbHealth,
  BaseModel,
  createModel,
  withTransaction,
  DataTypes,
};

/**
 * USAGE EXAMPLES:
 * 
 * // 1. Initialize database
 * import { initDb } from './database.js';
 * await initDb({ alter: true });
 * 
 * // 2. Create a model
 * import { createModel, DataTypes } from './database.js';
 * const User = await createModel('User', {
 *   name: { type: DataTypes.STRING, allowNull: false },
 *   email: { type: DataTypes.STRING, unique: true },
 * });
 * 
 * // 3. Use in Express.js middleware
 * import { getDb } from './database.js';
 * app.use(async (req, res, next) => {
 *   req.db = await getDb();
 *   next();
 * });
 * 
 * // 4. Transaction example
 * import { withTransaction } from './database.js';
 * const result = await withTransaction(async (transaction) => {
 *   const user = await User.create({ name: 'John' }, { transaction });
 *   const profile = await Profile.create({ userId: user.id }, { transaction });
 *   return { user, profile };
 * });
 * 
 * // 5. Health check endpoint
 * import { getDbHealth } from './database.js';
 * app.get('/health/db', async (req, res) => {
 *   const health = await getDbHealth();
 *   res.json(health);
 * });
 */