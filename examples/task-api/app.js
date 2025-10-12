/**
 * Task Management API - Main Application Entry Point
 * Express.js application with authentication, rate limiting, and database integration
 * @version 1.0.0
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Local module imports
import tasksRouter from './api/tasks.js';
import usersRouter from './api/users.js';
import { initializeDatabase, checkDatabaseConnection } from './core/database.js';
import { authenticateJWT, createAuthMiddleware } from './core/auth.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Application configuration
 */
const APP_CONFIG = {
  title: 'Task Management API',
  version: '1.0.0',
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development'
};

/**
 * Create Express application instance
 */
const app = express();

/**
 * Set application metadata
 */
app.set('title', APP_CONFIG.title);
app.set('version', APP_CONFIG.version);

/**
 * Rate limiting configuration
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * CORS configuration
 */
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      ...(process.env.ALLOWED_ORIGINS?.split(',') || [])
    ];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

/**
 * Security and parsing middleware (order is critical)
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors(corsOptions));
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Request logging middleware (development only)
 */
if (APP_CONFIG.nodeEnv === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

/**
 * Health check endpoint
 * @route GET /health
 * @returns {Object} Health status and database connection status
 */
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await checkDatabaseConnection();
    
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: APP_CONFIG.version,
      database: dbStatus ? 'connected' : 'disconnected',
      environment: APP_CONFIG.nodeEnv
    };

    if (!dbStatus) {
      return res.status(503).json({
        ...healthCheck,
        status: 'unhealthy',
        message: 'Database connection failed'
      });
    }

    res.status(200).json(healthCheck);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error.message
    });
  }
});

/**
 * API route registration
 * Protected routes use JWT authentication middleware
 */
app.use('/api/users', usersRouter);
app.use('/api/tasks', authenticateJWT, tasksRouter);

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    message: `Welcome to ${APP_CONFIG.title}`,
    version: APP_CONFIG.version,
    documentation: '/api/docs', // TODO: Add API documentation endpoint
    health: '/health'
  });
});

/**
 * 404 handler for undefined routes
 */
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'POST /api/users/register',
      'POST /api/users/login',
      'GET /api/tasks',
      'POST /api/tasks'
    ]
  });
});

/**
 * Async error wrapper utility
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Global error handling middleware (must be last)
 */
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  // CORS error
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed by CORS policy'
    });
  }

  // JWT authentication errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Authentication Error',
      message: 'Invalid token'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Authentication Error',
      message: 'Token expired'
    });
  }

  // Validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      details: error.details || null
    });
  }

  // Database errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return res.status(503).json({
      error: 'Database Error',
      message: 'Database connection failed'
    });
  }

  // Default server error
  const statusCode = error.statusCode || error.status || 500;
  res.status(statusCode).json({
    error: 'Internal Server Error',
    message: APP_CONFIG.nodeEnv === 'development' ? error.message : 'Something went wrong',
    ...(APP_CONFIG.nodeEnv === 'development' && { stack: error.stack })
  });
});

/**
 * Database initialization and server startup
 */
const startServer = async () => {
  try {
    console.log(`🚀 Starting ${APP_CONFIG.title} v${APP_CONFIG.version}...`);
    
    // Initialize database connection and create tables
    console.log('📊 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized successfully');

    // Start the server
    const server = app.listen(APP_CONFIG.port, () => {
      console.log(`🌟 Server running on port ${APP_CONFIG.port}`);
      console.log(`📍 Environment: ${APP_CONFIG.nodeEnv}`);
      console.log(`🔗 Health check: http://localhost:${APP_CONFIG.port}/health`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async (err) => {
        if (err) {
          console.error('❌ Error during server shutdown:', err);
          process.exit(1);
        }
        
        try {
          // TODO: Close database connections
          // await closeDatabaseConnections();
          console.log('✅ Graceful shutdown completed');
          process.exit(0);
        } catch (shutdownError) {
          console.error('❌ Error during shutdown:', shutdownError);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

// Export app instance for testing and deployment
export default app;

/* 
TODO: Create the following files for complete functionality:
- ./api/tasks.js - Tasks router with CRUD operations
- ./api/users.js - Users router with authentication endpoints
- ./core/database.js - Database connection and initialization
- ./core/auth.js - JWT authentication middleware
- package.json - Dependencies and scripts configuration
- .env - Environment variables configuration
*/