/**
 * Task Management API - Main Application Entry Point
 * FastAPI-equivalent web server using Express.js
 * 
 * @fileoverview Complete Express.js application with JWT auth, CORS, database integration
 * @version 1.0.0
 * @author Task Management Team
 */

// Framework and core dependencies
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

// Authentication and validation middleware
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';

// Database and utilities
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Local route modules
import taskRoutes from './routes/tasks.js';
import userRoutes from './routes/users.js';

// Load environment variables
dotenv.config();

/**
 * Express application instance with FastAPI-equivalent configuration
 * @type {express.Application}
 */
const app = express();

// Application metadata (FastAPI equivalent)
app.locals.title = 'Task Management API';
app.locals.version = '1.0.0';
app.locals.description = 'A comprehensive task management system with user authentication';

// Database connection pool
let dbPool = null;

/**
 * Initialize database connection pool
 * @async
 * @function initializeDatabase
 * @returns {Promise<mysql.Pool>} Database connection pool
 * @throws {Error} Database connection error
 */
const initializeDatabase = async () => {
  try {
    dbPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'task_management',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true
    });

    // Test connection
    const connection = await dbPool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    
    return dbPool;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw new Error(`Database initialization failed: ${error.message}`);
  }
};

/**
 * JWT Authentication middleware for protected routes
 * @async
 * @function authenticateToken
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        message: 'Please provide a valid JWT token in Authorization header',
        statusCode: 401
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    
    // Attach user information to request object
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role || 'user'
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'JWT token has expired, please login again',
        statusCode: 401
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        error: 'Invalid token',
        message: 'JWT token is malformed or invalid',
        statusCode: 403
      });
    }

    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication',
      statusCode: 500
    });
  }
};

/**
 * Request validation middleware
 * @function validateRequest
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 * @returns {void}
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Request validation errors occurred',
      details: errors.array(),
      statusCode: 400
    });
  }
  next();
};

/**
 * Global error handling middleware
 * @function errorHandler
 * @param {Error} err - Error object
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 * @returns {void}
 */
const errorHandler = (err, req, res, next) => {
  // Log error for debugging
  console.error('🚨 Global Error Handler:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Default error response
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific error types
  if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = 'Database connection unavailable';
  } else if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'Duplicate entry - resource already exists';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Request validation failed';
  }

  // Don't expose sensitive error details in production
  const errorResponse = {
    error: err.name || 'ServerError',
    message: message,
    statusCode: statusCode,
    timestamp: new Date().toISOString(),
    path: req.url
  };

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Request logging middleware
 * @function requestLogger
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 * @returns {void}
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    };
    
    console.log('📝 Request Log:', JSON.stringify(logData));
  });
  
  next();
};

// Security middleware configuration
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

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded, please try again later',
    statusCode: 429
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// CORS configuration for development
const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400 // 24 hours
};
app.use(cors(corsOptions));

// Body parsing middleware with size limits
app.use(express.json({ 
  limit: '10mb',
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Request logging
app.use(requestLogger);

// Make database pool available to routes
app.use((req, res, next) => {
  req.db = dbPool;
  next();
});

// Health check endpoint (FastAPI equivalent)
app.get('/health', async (req, res) => {
  try {
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      application: {
        name: app.locals.title,
        version: app.locals.version
      },
      database: {
        status: 'disconnected',
        latency: null
      },
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    };

    // Check database connection
    if (dbPool) {
      const start = Date.now();
      try {
        const connection = await dbPool.getConnection();
        await connection.ping();
        connection.release();
        
        healthCheck.database.status = 'connected';
        healthCheck.database.latency = `${Date.now() - start}ms`;
      } catch (dbError) {
        healthCheck.database.status = 'error';
        healthCheck.database.error = dbError.message;
        healthCheck.status = 'degraded';
      }
    }

    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthCheck);
    
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API documentation endpoint (FastAPI equivalent)
app.get('/docs', (req, res) => {
  res.json({
    title: app.locals.title,
    version: app.locals.version,
    description: app.locals.description,
    endpoints: {
      health: 'GET /health',
      tasks: 'GET|POST|PUT|DELETE /api/tasks',
      users: 'GET|POST|PUT|DELETE /api/users'
    },
    authentication: 'Bearer JWT Token required for protected routes',
    cors: 'Enabled for localhost:3000'
  });
});

// Mount API routers with authentication
app.use('/api/tasks', authenticateToken, taskRoutes);
app.use('/api/users', userRoutes); // Some user routes may not require auth (like registration)

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
    statusCode: 404,
    availableEndpoints: ['/health', '/docs', '/api/tasks', '/api/users']
  });
});

// Global error handling middleware (must be last)
app.use(errorHandler);

/**
 * Initialize the application with database connection
 * @async
 * @function initializeApp
 * @returns {Promise<express.Application>} Configured Express application
 */
const initializeApp = async () => {
  try {
    await initializeDatabase();
    console.log(`🚀 ${app.locals.title} v${app.locals.version} initialized successfully`);
    return app;
  } catch (error) {
    console.error('❌ Application initialization failed:', error.message);
    throw error;
  }
};

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  if (dbPool) {
    await dbPool.end();
    console.log('✅ Database connections closed');
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  if (dbPool) {
    await dbPool.end();
    console.log('✅ Database connections closed');
  }
  process.exit(0);
});

// Export the configured application and initialization function
export default app;
export { initializeApp, authenticateToken, validateRequest };