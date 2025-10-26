/**
 * Task Management API - Main Application Entry Point
 * A production-ready Express.js application with comprehensive middleware setup,
 * database integration, and proper error handling.
 * 
 * @author Task Management Team
 * @version 1.0.0
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

// Import custom modules
import { initializeDatabase, closeDatabaseConnection, checkDatabaseHealth } from './config/database.js';
import { authenticateToken, createAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';
import tasksRouter from './routes/tasks.js';
import usersRouter from './routes/users.js';

// Load environment variables
dotenv.config();

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const packageJson = require('./package.json');

/**
 * Application Configuration
 */
const APP_CONFIG = {
  title: 'Task Management API',
  version: '1.0.0',
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000'
};

/**
 * Create and configure Express application
 * @returns {express.Application} Configured Express app instance
 */
function createApp() {
  const app = express();

  // Set application metadata
  app.set('title', APP_CONFIG.title);
  app.set('version', APP_CONFIG.version);
  app.set('env', APP_CONFIG.nodeEnv);

  // Trust proxy for production deployment
  if (APP_CONFIG.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  return app;
}

/**
 * Configure CORS middleware with environment-specific settings
 * @returns {Function} Configured CORS middleware
 */
function configureCors() {
  const corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        APP_CONFIG.corsOrigin,
        'http://localhost:3000',
        'http://localhost:3001',
        'https://taskmanagement.example.com' // Production domain
      ];

      if (allowedOrigins.includes(origin) || APP_CONFIG.nodeEnv === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS policy'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400 // 24 hours
  };

  return cors(corsOptions);
}

/**
 * Configure security middleware
 * @returns {Function} Configured Helmet middleware
 */
function configureSecurity() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });
}

/**
 * Configure request logging middleware
 * @returns {Function} Configured Morgan middleware
 */
function configureLogging() {
  const logFormat = APP_CONFIG.nodeEnv === 'production' 
    ? 'combined' 
    : 'dev';
  
  return morgan(logFormat, {
    skip: (req, res) => {
      // Skip logging for health checks in production
      return APP_CONFIG.nodeEnv === 'production' && req.url === '/health';
    }
  });
}

/**
 * Setup core middleware stack
 * @param {express.Application} app Express application instance
 */
function setupMiddleware(app) {
  // Security middleware (must be first)
  app.use(configureSecurity());
  
  // CORS middleware (before other middleware)
  app.use(configureCors());
  
  // Request logging
  app.use(configureLogging());
  
  // Custom request logger for debugging
  app.use(requestLogger);
  
  // Body parsing middleware
  app.use(express.json({ 
    limit: '10mb',
    strict: true
  }));
  app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb' 
  }));
  
  // Static file serving (if needed)
  app.use('/static', express.static(join(__dirname, 'public')));
}

/**
 * Setup authentication middleware for protected routes
 * @param {express.Application} app Express application instance
 */
function setupAuthentication(app) {
  // Create authentication middleware that skips certain routes
  const authMiddleware = createAuthMiddleware({
    skipRoutes: ['/health', '/api/auth/login', '/api/auth/register', '/'],
    skipMethods: ['OPTIONS']
  });
  
  app.use(authMiddleware);
}

/**
 * Setup application routes
 * @param {express.Application} app Express application instance
 */
function setupRoutes(app) {
  // Root endpoint with API information
  app.get('/', (req, res) => {
    res.json({
      name: APP_CONFIG.title,
      version: APP_CONFIG.version,
      status: 'running',
      environment: APP_CONFIG.nodeEnv,
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        tasks: '/api/v1/tasks',
        users: '/api/v1/users',
        documentation: '/api/docs'
      }
    });
  });

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const dbHealth = await checkDatabaseHealth();
      const healthStatus = {
        status: 'healthy',
        database: dbHealth.connected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: APP_CONFIG.version
      };

      // Return 503 if database is not connected
      const statusCode = dbHealth.connected ? 200 : 503;
      res.status(statusCode).json(healthStatus);
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // API v1 routes
  app.use('/api/v1/tasks', tasksRouter);
  app.use('/api/v1/users', usersRouter);
  
  // Legacy API routes (for backward compatibility)
  app.use('/api/tasks', tasksRouter);
  app.use('/api/users', usersRouter);
}

/**
 * Setup error handling middleware (must be last)
 * @param {express.Application} app Express application instance
 */
function setupErrorHandling(app) {
  // 404 handler for undefined routes
  app.use(notFoundHandler);
  
  // Global error handler
  app.use(errorHandler);
}

/**
 * Initialize database connection and create tables
 * @returns {Promise<void>}
 */
async function initializeApp() {
  try {
    console.log('🔄 Initializing database connection...');
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

/**
 * Start the Express server
 * @param {express.Application} app Express application instance
 * @returns {Promise<import('http').Server>} HTTP server instance
 */
function startServer(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(APP_CONFIG.port, (error) => {
      if (error) {
        reject(error);
        return;
      }
      
      console.log(`🚀 ${APP_CONFIG.title} v${APP_CONFIG.version}`);
      console.log(`🌍 Server running on port ${APP_CONFIG.port}`);
      console.log(`📊 Environment: ${APP_CONFIG.nodeEnv}`);
      console.log(`🔗 Health check: http://localhost:${APP_CONFIG.port}/health`);
      console.log(`📚 API docs: http://localhost:${APP_CONFIG.port}/api/docs`);
      
      resolve(server);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${APP_CONFIG.port} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      reject(error);
    });
  });
}

/**
 * Setup graceful shutdown handlers
 * @param {import('http').Server} server HTTP server instance
 */
function setupGracefulShutdown(server) {
  const gracefulShutdown = async (signal) => {
    console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(async (error) => {
      if (error) {
        console.error('❌ Error during server shutdown:', error);
        process.exit(1);
      }
      
      try {
        // Close database connections
        await closeDatabaseConnection();
        console.log('✅ Database connections closed');
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (shutdownError) {
        console.error('❌ Error during shutdown:', shutdownError);
        process.exit(1);
      }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
  });
}

/**
 * Main application startup function
 * Initializes database, configures Express app, and starts server
 */
async function main() {
  try {
    console.log(`🚀 Starting ${APP_CONFIG.title}...`);
    
    // Initialize database
    await initializeApp();
    
    // Create and configure Express app
    const app = createApp();
    
    // Setup middleware stack
    setupMiddleware(app);
    setupAuthentication(app);
    setupRoutes(app);
    setupErrorHandling(app);
    
    // Start server
    const server = await startServer(app);
    
    // Setup graceful shutdown
    setupGracefulShutdown(server);
    
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Application startup failed:', error);
    process.exit(1);
  });
}

// Export app for testing
export default createApp;
export { APP_CONFIG, setupMiddleware, setupRoutes };