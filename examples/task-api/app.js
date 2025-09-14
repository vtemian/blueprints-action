import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Import custom modules
import tasksRouter from '@api/tasks';
import usersRouter from '@api/users';
import { initializeDatabase, getConnection, createTables } from '@core/database';
import { verifyToken } from '@core/auth';

// Load environment variables
dotenv.config();

class TaskManagementAPI {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.databaseUrl = process.env.DATABASE_URL || 'sqlite://./database.db';
    
    // Application metadata
    this.appInfo = {
      title: 'Task Management API',
      version: '1.0.0',
      description: 'A comprehensive task management API with user authentication'
    };
  }

  /**
   * Configure CORS middleware with specific origin and credentials support
   */
  configureCORS() {
    const corsOptions = {
      origin: this.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count', 'X-Page-Count']
    };

    this.app.use(cors(corsOptions));
    console.log(`✓ CORS configured for origin: ${this.corsOrigin}`);
  }

  /**
   * Configure request logging middleware
   */
  configureLogging() {
    const logFormat = process.env.NODE_ENV === 'production' 
      ? 'combined' 
      : 'dev';
    
    this.app.use(morgan(logFormat));
    console.log('✓ Request logging middleware configured');
  }

  /**
   * Configure rate limiting middleware
   */
  configureRateLimit() {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 100 : 1000, // requests per window
      message: {
        error: 'Too many requests from this IP',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use('/api', limiter);
    console.log('✓ Rate limiting configured');
  }

  /**
   * Configure basic middleware (JSON parsing, URL encoding)
   */
  configureBasicMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    console.log('✓ Basic middleware configured');
  }

  /**
   * JWT Authentication middleware for protected routes
   */
  configureJWTMiddleware() {
    const jwtMiddleware = async (req, res, next) => {
      try {
        // Skip authentication for public routes
        const publicRoutes = [
          '/health',
          '/api/users/register',
          '/api/users/login',
          '/api/users/refresh-token'
        ];

        if (publicRoutes.includes(req.path)) {
          return next();
        }

        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Access denied',
            message: 'No token provided or invalid token format'
          });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        try {
          const decoded = jwt.verify(token, this.jwtSecret);
          req.user = decoded;
          next();
        } catch (jwtError) {
          if (jwtError.name === 'TokenExpiredError') {
            return res.status(401).json({
              error: 'Token expired',
              message: 'Please refresh your token or login again'
            });
          } else if (jwtError.name === 'JsonWebTokenError') {
            return res.status(401).json({
              error: 'Invalid token',
              message: 'Token is malformed or invalid'
            });
          } else {
            throw jwtError;
          }
        }
      } catch (error) {
        console.error('JWT Middleware Error:', error);
        return res.status(500).json({
          error: 'Authentication error',
          message: 'Internal server error during authentication'
        });
      }
    };

    // Apply JWT middleware to all routes except public ones
    this.app.use(jwtMiddleware);
    console.log('✓ JWT authentication middleware configured');
  }

  /**
   * Configure health check endpoint with database connectivity test
   */
  configureHealthCheck() {
    this.app.get('/health', async (req, res) => {
      try {
        // Test database connection
        const connection = await getConnection();
        await connection.query('SELECT 1');
        
        const healthStatus = {
          status: 'healthy',
          database: 'connected',
          timestamp: new Date().toISOString(),
          version: this.appInfo.version,
          uptime: process.uptime()
        };

        res.status(200).json(healthStatus);
      } catch (error) {
        console.error('Health check failed:', error);
        
        const healthStatus = {
          status: 'unhealthy',
          database: 'disconnected',
          timestamp: new Date().toISOString(),
          version: this.appInfo.version,
          error: error.message
        };

        res.status(503).json(healthStatus);
      }
    });

    console.log('✓ Health check endpoint configured at /health');
  }

  /**
   * Mount API routers with proper prefixes
   */
  configureRoutes() {
    try {
      // Mount routers with API prefix
      this.app.use('/api/tasks', tasksRouter);
      this.app.use('/api/users', usersRouter);

      // API info endpoint
      this.app.get('/api', (req, res) => {
        res.json({
          ...this.appInfo,
          endpoints: {
            health: '/health',
            tasks: '/api/tasks',
            users: '/api/users'
          },
          documentation: '/api/docs'
        });
      });

      // 404 handler for undefined routes
      this.app.use('*', (req, res) => {
        res.status(404).json({
          error: 'Route not found',
          message: `The requested route ${req.originalUrl} does not exist`,
          availableEndpoints: ['/health', '/api', '/api/tasks', '/api/users']
        });
      });

      console.log('✓ API routes configured');
      console.log('  - /api/tasks (Task management endpoints)');
      console.log('  - /api/users (User management endpoints)');
    } catch (error) {
      console.error('Error configuring routes:', error);
      throw error;
    }
  }

  /**
   * Configure global error handling middleware
   */
  configureErrorHandling() {
    this.app.use((error, req, res, next) => {
      console.error('Global Error Handler:', error);

      // Handle specific error types
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.message,
          details: error.details || null
        });
      }

      if (error.name === 'UnauthorizedError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }

      // Default server error
      const statusCode = error.statusCode || 500;
      const message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message;

      res.status(statusCode).json({
        error: 'Server Error',
        message: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
      });
    });

    console.log('✓ Global error handling configured');
  }

  /**
   * Initialize database connection and create tables
   */
  async initializeDatabase() {
    try {
      console.log('🔄 Initializing database connection...');
      
      // Initialize database connection pool
      await initializeDatabase(this.databaseUrl);
      console.log('✓ Database connection pool initialized');

      // Create tables if they don't exist
      console.log('🔄 Creating database tables...');
      await createTables();
      console.log('✓ Database tables created/verified');

      // Test connection
      const connection = await getConnection();
      await connection.query('SELECT 1');
      console.log('✓ Database connection test successful');

    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  /**
   * Configure all middleware in the correct order
   */
  configureMiddleware() {
    console.log('🔄 Configuring middleware...');
    
    // Order is critical: CORS → logging → rate limiting → basic → auth → routes
    this.configureCORS();
    this.configureLogging();
    this.configureRateLimit();
    this.configureBasicMiddleware();
    this.configureHealthCheck(); // Before JWT to keep it public
    this.configureJWTMiddleware();
    this.configureRoutes();
    this.configureErrorHandling();
    
    console.log('✓ All middleware configured successfully');
  }

  /**
   * Start the server with graceful startup sequence
   */
  async startServer() {
    try {
      console.log(`🚀 Starting ${this.appInfo.title} v${this.appInfo.version}...`);
      
      // Step 1: Initialize database
      await this.initializeDatabase();
      
      // Step 2: Configure middleware
      this.configureMiddleware();
      
      // Step 3: Start HTTP server
      const server = this.app.listen(this.port, () => {
        console.log('✅ Server started successfully!');
        console.log(`📍 Server running on port ${this.port}`);
        console.log(`🌐 API available at: http://localhost:${this.port}/api`);
        console.log(`❤️  Health check: http://localhost:${this.port}/health`);
        console.log(`🔒 CORS enabled for: ${this.corsOrigin}`);
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown(server);

      return server;
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown(server) {
    const gracefulShutdown = async (signal) => {
      console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        console.log('✓ HTTP server closed');
        
        try {
          // Close database connections
          const connection = await getConnection();
          if (connection && connection.end) {
            await connection.end();
            console.log('✓ Database connections closed');
          }
        } catch (error) {
          console.error('Error closing database connections:', error);
        }
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// Create and start the application
const api = new TaskManagementAPI();

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  api.startServer().catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}

// Export for testing or programmatic use
export default api;
export { TaskManagementAPI };