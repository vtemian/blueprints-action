import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import { createServer } from 'http';

// Import custom modules
import { connectDatabase, closeDatabaseConnection, checkDatabaseHealth, initializeTables } from './utils/database.js';
import { authenticateToken } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';
import tasksRouter from './routes/tasks.js';
import usersRouter from './routes/users.js';

// Load environment variables
config();

class TaskManagementAPI {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = process.env.PORT || 3000;
    this.isDatabaseConnected = false;
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.setupGracefulShutdown();
  }

  /**
   * Initialize all middleware in correct order
   */
  initializeMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api', limiter);

    // CORS configuration
    const corsOptions = {
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000'
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true,
      optionsSuccessStatus: 200
    };
    this.app.use(cors(corsOptions));

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '10mb',
      type: 'application/json'
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // Request logging
    this.app.use(requestLogger);

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
  }

  /**
   * Initialize all application routes
   */
  initializeRoutes() {
    // Health check endpoint (public)
    this.app.get('/health', this.healthCheck.bind(this));

    // API information endpoint (public)
    this.app.get('/api', (req, res) => {
      res.json({
        title: 'Task Management API',
        version: '1.0.0',
        description: 'A comprehensive task and user management system',
        endpoints: {
          health: '/health',
          tasks: '/api/tasks',
          users: '/api/users'
        },
        status: 'operational'
      });
    });

    // Mount API routers with authentication middleware
    this.app.use('/api/users', usersRouter);
    this.app.use('/api/tasks', authenticateToken, tasksRouter);

    // 404 handler for undefined routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        message: `The requested endpoint ${req.originalUrl} does not exist`,
        availableEndpoints: ['/health', '/api', '/api/users', '/api/tasks']
      });
    });
  }

  /**
   * Health check endpoint implementation
   */
  async healthCheck(req, res) {
    try {
      const startTime = Date.now();
      
      // Check database connectivity
      const dbHealth = await checkDatabaseHealth();
      
      const responseTime = Date.now() - startTime;
      
      const healthStatus = {
        status: dbHealth.connected ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        services: {
          database: {
            status: dbHealth.connected ? 'up' : 'down',
            responseTime: dbHealth.responseTime || null,
            lastChecked: new Date().toISOString()
          },
          api: {
            status: 'up',
            responseTime: `${responseTime}ms`
          }
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          unit: 'MB'
        }
      };

      const statusCode = dbHealth.connected ? 200 : 503;
      res.status(statusCode).json(healthStatus);

    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        message: error.message
      });
    }
  }

  /**
   * Initialize error handling middleware
   */
  initializeErrorHandling() {
    // Global error handler (must be last middleware)
    this.app.use(errorHandler);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('UNHANDLED_REJECTION');
    });
  }

  /**
   * Initialize database connection and tables
   */
  async initializeDatabase() {
    try {
      console.log('🔄 Initializing database connection...');
      
      // Connect to database
      await connectDatabase();
      console.log('✅ Database connection established');

      // Initialize tables
      await initializeTables();
      console.log('✅ Database tables initialized');

      this.isDatabaseConnected = true;
      return true;

    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      this.isDatabaseConnected = false;
      throw error;
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        console.log(`\n📡 Received ${signal}, starting graceful shutdown...`);
        this.gracefulShutdown(signal);
      });
    });
  }

  /**
   * Graceful shutdown implementation
   */
  async gracefulShutdown(signal) {
    console.log(`🔄 Shutting down server (${signal})...`);
    
    try {
      // Stop accepting new requests
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        console.log('✅ HTTP server closed');
      }

      // Close database connections
      if (this.isDatabaseConnected) {
        await closeDatabaseConnection();
        console.log('✅ Database connections closed');
      }

      console.log('✅ Graceful shutdown completed');
      process.exit(0);

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Initialize database first
      await this.initializeDatabase();

      // Create HTTP server
      this.server = createServer(this.app);

      // Start listening
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      console.log(`
🚀 Task Management API Server Started Successfully!
📋 Title: Task Management API v1.0.0
🌐 Server: http://localhost:${this.port}
🏥 Health: http://localhost:${this.port}/health
📚 API Info: http://localhost:${this.port}/api
🔒 Environment: ${process.env.NODE_ENV || 'development'}
⏰ Started at: ${new Date().toISOString()}
      `);

      return this.server;

    } catch (error) {
      console.error('❌ Failed to start server:', error.message);
      
      // Attempt cleanup
      try {
        if (this.isDatabaseConnected) {
          await closeDatabaseConnection();
        }
      } catch (cleanupError) {
        console.error('❌ Cleanup failed:', cleanupError.message);
      }
      
      process.exit(1);
    }
  }
}

// Create and start the application
const app = new TaskManagementAPI();

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  app.start().catch((error) => {
    console.error('❌ Application startup failed:', error);
    process.exit(1);
  });
}

// Export for testing purposes
export default app;
export { TaskManagementAPI };