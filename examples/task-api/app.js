/**
 * Task Management API - Express.js Application Setup
 * Production-ready FastAPI-equivalent Node.js application
 * @version 1.0.0
 * @author Senior JavaScript Developer
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Import custom modules
import { DatabaseService } from './services/database.js';
import { AuthService } from './services/auth.js';
import { Logger } from './utils/logger.js';
import tasksRouter from './routes/tasks.js';
import usersRouter from './routes/users.js';

// Load environment variables
dotenv.config();

/**
 * Application Configuration Class
 * Manages all application settings and dependencies
 */
class AppConfig {
  constructor() {
    this.port = process.env.PORT || 3000;
    this.corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
    this.jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
    this.dbUrl = process.env.DB_URL || 'postgresql://localhost:5432/taskdb';
    this.nodeEnv = process.env.NODE_ENV || 'development';
  }
}

/**
 * Main Application Class
 * Implements dependency injection and separation of concerns
 */
class TaskManagementApp {
  constructor() {
    this.app = express();
    this.config = new AppConfig();
    this.logger = new Logger();
    this.dbService = new DatabaseService(this.config.dbUrl, this.logger);
    this.authService = new AuthService(this.config.jwtSecret, this.logger);
    
    this.isShuttingDown = false;
    this.server = null;
  }

  /**
   * Configure CORS middleware with security settings
   * @returns {Object} CORS configuration object
   */
  configureCORS() {
    return cors({
      origin: this.config.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
      maxAge: 86400 // 24 hours
    });
  }

  /**
   * Configure rate limiting middleware
   * @returns {Object} Rate limiter middleware
   */
  configureRateLimit() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: this.config.nodeEnv === 'production' ? 100 : 1000,
      message: {
        error: 'Too many requests from this IP',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
  }

  /**
   * JWT Authentication Middleware
   * Validates JWT tokens and handles authentication errors
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  authenticateJWT = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please provide a valid Bearer token'
        });
      }

      const token = authHeader.substring(7);
      const decoded = await this.authService.verifyToken(token);
      
      if (!decoded) {
        return res.status(401).json({
          error: 'Invalid token',
          message: 'The provided token is invalid or malformed'
        });
      }

      // Check if token is expired
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        return res.status(403).json({
          error: 'Token expired',
          message: 'The provided token has expired. Please login again.'
        });
      }

      req.user = decoded;
      next();
    } catch (error) {
      this.logger.error('JWT Authentication Error:', error);
      
      if (error.name === 'TokenExpiredError') {
        return res.status(403).json({
          error: 'Token expired',
          message: 'The provided token has expired. Please login again.'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Invalid token',
          message: 'The provided token is invalid'
        });
      }

      return res.status(500).json({
        error: 'Authentication service error',
        message: 'An error occurred during authentication'
      });
    }
  };

  /**
   * Input Validation Middleware
   * Validates request body and parameters
   * @param {Object} schema - Validation schema
   * @returns {Function} Validation middleware function
   */
  validateInput = (schema) => {
    return (req, res, next) => {
      try {
        const { error, value } = schema.validate(req.body, {
          abortEarly: false,
          stripUnknown: true
        });

        if (error) {
          const validationErrors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }));

          return res.status(400).json({
            error: 'Validation failed',
            details: validationErrors
          });
        }

        req.validatedBody = value;
        next();
      } catch (err) {
        this.logger.error('Validation middleware error:', err);
        res.status(500).json({
          error: 'Validation service error',
          message: 'An error occurred during input validation'
        });
      }
    };
  };

  /**
   * Health Check Endpoint Handler
   * Returns application and database status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  healthCheck = async (req, res) => {
    try {
      const dbStatus = await this.dbService.checkConnection();
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        version: '1.0.0',
        database: {
          status: dbStatus.connected ? 'connected' : 'disconnected',
          responseTime: dbStatus.responseTime || null,
          error: dbStatus.error || null
        },
        memory: {
          used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
        }
      };

      const statusCode = dbStatus.connected ? 200 : 503;
      res.status(statusCode).json(healthStatus);
    } catch (error) {
      this.logger.error('Health check error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        database: { status: 'unknown' }
      });
    }
  };

  /**
   * Global Error Handler Middleware
   * Catches and handles all unhandled errors
   * @param {Error} err - Error object
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  globalErrorHandler = (err, req, res, next) => {
    this.logger.error('Global error handler:', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: err.message
      });
    }

    if (err.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid ID format',
        message: 'The provided ID is not valid'
      });
    }

    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database connection failed'
      });
    }

    // Default error response
    const statusCode = err.statusCode || err.status || 500;
    const message = this.config.nodeEnv === 'production' 
      ? 'An internal server error occurred'
      : err.message;

    res.status(statusCode).json({
      error: 'Internal Server Error',
      message,
      ...(this.config.nodeEnv !== 'production' && { stack: err.stack })
    });
  };

  /**
   * Configure all middleware in correct order
   */
  setupMiddleware() {
    // Security middleware (must be first)
    this.app.use(helmet({
      contentSecurityPolicy: this.config.nodeEnv === 'production',
      crossOriginEmbedderPolicy: false
    }));

    // Request logging
    this.app.use(morgan(this.config.nodeEnv === 'production' ? 'combined' : 'dev'));

    // Compression middleware
    this.app.use(compression());

    // Rate limiting
    this.app.use(this.configureRateLimit());

    // CORS configuration
    this.app.use(this.configureCORS());

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
  }

  /**
   * Setup application routes
   */
  setupRoutes() {
    // Health check endpoint (public)
    this.app.get('/health', this.healthCheck);

    // API routes with authentication
    this.app.use('/api/users', usersRouter(this.dbService, this.authService));
    this.app.use('/api/tasks', this.authenticateJWT, tasksRouter(this.dbService));

    // 404 handler for undefined routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`
      });
    });

    // Global error handler (must be last)
    this.app.use(this.globalErrorHandler);
  }

  /**
   * Initialize database connection and create tables
   * @returns {Promise<boolean>} Success status
   */
  async initializeDatabase() {
    try {
      this.logger.info('Initializing database connection...');
      
      await this.dbService.connect();
      await this.dbService.createTables();
      
      this.logger.info('Database initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Database initialization failed:', error);
      
      // Implement retry logic
      let retries = 3;
      while (retries > 0) {
        this.logger.info(`Retrying database connection... (${retries} attempts left)`);
        
        try {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          await this.dbService.connect();
          await this.dbService.createTables();
          
          this.logger.info('Database connection successful after retry');
          return true;
        } catch (retryError) {
          retries--;
          if (retries === 0) {
            this.logger.error('Database connection failed after all retries:', retryError);
            throw retryError;
          }
        }
      }
      
      return false;
    }
  }

  /**
   * Graceful shutdown handler
   * Closes database connections and stops server
   */
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
      // Stop accepting new connections
      if (this.server) {
        this.server.close(() => {
          this.logger.info('HTTP server closed');
        });
      }

      // Close database connections
      await this.dbService.disconnect();
      this.logger.info('Database connections closed');

      this.logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Initialize and start the application
   * @returns {Promise<Express>} Configured Express application
   */
  async initialize() {
    try {
      this.logger.info('Starting Task Management API v1.0.0...');

      // Initialize database
      await this.initializeDatabase();

      // Setup middleware and routes
      this.setupMiddleware();
      this.setupRoutes();

      // Setup graceful shutdown handlers
      process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

      // Handle unhandled promise rejections
      process.on('unhandledRejection', (reason, promise) => {
        this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      });

      // Handle uncaught exceptions
      process.on('uncaughtException', (error) => {
        this.logger.error('Uncaught Exception:', error);
        this.gracefulShutdown('UNCAUGHT_EXCEPTION');
      });

      this.logger.info(`Application initialized successfully`);
      this.logger.info(`Environment: ${this.config.nodeEnv}`);
      this.logger.info(`CORS Origin: ${this.config.corsOrigin}`);

      return this.app;
    } catch (error) {
      this.logger.error('Application initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start the HTTP server
   * @returns {Promise<void>}
   */
  async start() {
    try {
      await this.initialize();
      
      this.server = this.app.listen(this.config.port, () => {
        this.logger.info(`🚀 Task Management API running on port ${this.config.port}`);
        this.logger.info(`📊 Health check available at http://localhost:${this.config.port}/health`);
        this.logger.info(`📝 API endpoints available at http://localhost:${this.config.port}/api`);
      });

      return this.server;
    } catch (error) {
      this.logger.error('Failed to start server:', error);
      throw error;
    }
  }
}

// Create and export application instance
const taskApp = new TaskManagementApp();

// Export the configured Express app for testing or external use
export default taskApp.app;

// Export the application class for advanced usage
export