/**
 * Task Management API - Main Application Entry Point
 * Express.js FastAPI-equivalent implementation
 * Version: 1.0.0
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
require('dotenv').config();

// Import custom modules
const { initializeDatabase, getDbConnection, testDbConnection } = require('./core/database');
const { authenticateToken, optionalAuth } = require('./core/auth');
const tasksRouter = require('./api/tasks');
const usersRouter = require('./api/users');
const logger = require('./core/logger');

/**
 * Application Configuration
 */
const APP_CONFIG = {
  title: 'Task Management API',
  version: '1.0.0',
  port: process.env.PORT || 8000,
  nodeEnv: process.env.NODE_ENV || 'development'
};

/**
 * Create Express application instance
 */
const app = express();

/**
 * Security Middleware Configuration
 */
// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // requests per window
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

/**
 * CORS Configuration
 */
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
    ];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

/**
 * General Middleware Stack
 */
// Compression middleware
app.use(compression());

// Logging middleware
if (APP_CONFIG.nodeEnv === 'production') {
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
} else {
  app.use(morgan('dev'));
}

// Body parsing middleware with size limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({
        error: 'Invalid JSON',
        message: 'Request body contains invalid JSON'
      });
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Request ID middleware for tracing
app.use((req, res, next) => {
  req.id = require('crypto').randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

/**
 * Health Check Endpoint
 */
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await testDbConnection();
    const healthCheck = {
      status: 'healthy',
      version: APP_CONFIG.version,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus ? 'connected' : 'disconnected',
      environment: APP_CONFIG.nodeEnv,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
      }
    };

    const statusCode = dbStatus ? 200 : 503;
    res.status(statusCode).json(healthCheck);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      version: APP_CONFIG.version,
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: 'Health check failed'
    });
  }
});

/**
 * API Routes Registration
 */
// Public routes (no authentication required)
app.use('/api/users', usersRouter);

// Protected routes (authentication required)
app.use('/api/tasks', authenticateToken, tasksRouter);

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    message: `Welcome to ${APP_CONFIG.title}`,
    version: APP_CONFIG.version,
    documentation: '/api/docs',
    health: '/health',
    timestamp: new Date().toISOString()
  });
});

/**
 * 404 Handler - Must be after all routes
 */
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
});

/**
 * Global Error Handler - Must be last middleware
 */
app.use((error, req, res, next) => {
  // Log error details
  logger.error('Global error handler:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.id
  });

  // Handle specific error types
  let statusCode = 500;
  let message = 'Internal Server Error';

  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (error.name === 'UnauthorizedError' || error.message.includes('jwt')) {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (error.name === 'ForbiddenError') {
    statusCode = 403;
    message = 'Forbidden';
  } else if (error.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Not Found';
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'File too large';
  } else if (error.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  }

  // Prepare error response
  const errorResponse = {
    error: message,
    message: APP_CONFIG.nodeEnv === 'development' ? error.message : message,
    timestamp: new Date().toISOString(),
    requestId: req.id,
    path: req.originalUrl
  };

  // Include stack trace in development
  if (APP_CONFIG.nodeEnv === 'development') {
    errorResponse.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
});

/**
 * Database Initialization and Server Startup
 */
async function startServer() {
  try {
    // Initialize database connection and create tables
    logger.info('Initializing database connection...');
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Create HTTP server
    const server = createServer(app);

    // Start server
    server.listen(APP_CONFIG.port, () => {
      logger.info(`🚀 ${APP_CONFIG.title} v${APP_CONFIG.version} started successfully`);
      logger.info(`📡 Server running on port ${APP_CONFIG.port}`);
      logger.info(`🌍 Environment: ${APP_CONFIG.nodeEnv}`);
      logger.info(`📋 Health check available at: http://localhost:${APP_CONFIG.port}/health`);
      
      if (APP_CONFIG.nodeEnv === 'development') {
        logger.info(`📖 API Base URL: http://localhost:${APP_CONFIG.port}/api`);
      }
    });

    /**
     * Graceful Shutdown Handlers
     */
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          // Close database connections
          const db = getDbConnection();
          if (db) {
            await db.end();
            logger.info('Database connections closed');
          }
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });

      // Force close after 30 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });

    return server;

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Start the application
 */
if (require.main === module) {
  startServer();
}

// Export app for testing
module.exports = { app, startServer, APP_CONFIG };