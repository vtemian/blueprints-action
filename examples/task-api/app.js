/**
 * Task Management API - FastAPI equivalent using Express.js
 * Version: 1.0.0
 * 
 * This Express.js application mirrors FastAPI functionality with:
 * - Automatic API documentation equivalent
 * - Dependency injection patterns
 * - Async route handlers
 * - Comprehensive error handling
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

// Import custom modules (FastAPI equivalent of dependency injection)
const tasksRouter = require('./api/tasks');
const usersRouter = require('./api/users');
const { initializeDatabase, getConnectionPool, closeDatabaseConnection } = require('./core/database');
const { authenticateJWT, optionalAuth } = require('./core/auth');

/**
 * Application Configuration
 * Equivalent to FastAPI app configuration
 */
const APP_CONFIG = {
    title: "Task Management API",
    version: "1.0.0",
    description: "A comprehensive task management system built with Express.js",
    port: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development'
};

/**
 * Create Express application instance
 * Equivalent to FastAPI() constructor
 */
const app = express();

/**
 * Security Middleware Configuration
 * FastAPI equivalent: automatic security headers
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

/**
 * Rate Limiting Configuration
 * FastAPI equivalent: custom rate limiting dependency
 */
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // requests per window
    message: {
        error: "Too many requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: "15 minutes"
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(limiter);

/**
 * CORS Configuration
 * FastAPI equivalent: CORSMiddleware
 */
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://yourdomain.com'
        ];
        
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS policy'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};

app.use(cors(corsOptions));

/**
 * Body Parsing Middleware
 * FastAPI equivalent: automatic request body parsing
 */
app.use(compression()); // Compress responses
app.use(express.json({ 
    limit: '10mb',
    type: 'application/json'
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb' 
}));

/**
 * Request Logging Middleware
 * FastAPI equivalent: automatic request logging
 */
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.originalUrl;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    console.log(`[${timestamp}] ${method} ${url} - ${req.ip} - ${userAgent}`);
    
    // Log response time
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log(`[${timestamp}] ${method} ${url} - ${res.statusCode} - ${duration}ms`);
    });
    
    next();
});

/**
 * API Documentation Route
 * FastAPI equivalent: automatic /docs endpoint
 */
app.get('/docs', (req, res) => {
    res.json({
        title: APP_CONFIG.title,
        version: APP_CONFIG.version,
        description: APP_CONFIG.description,
        endpoints: {
            health: "GET /health - Health check endpoint",
            tasks: "GET/POST/PUT/DELETE /api/v1/tasks - Task management endpoints",
            users: "GET/POST/PUT/DELETE /api/v1/users - User management endpoints",
            auth: "POST /api/v1/auth/login - Authentication endpoint"
        },
        authentication: "Bearer JWT token required for protected routes"
    });
});

/**
 * Health Check Endpoint
 * FastAPI equivalent: health check dependency
 */
app.get('/health', async (req, res) => {
    try {
        // Check database connection
        const pool = getConnectionPool();
        let databaseStatus = 'disconnected';
        
        if (pool) {
            try {
                // Test database connection with a simple query
                await pool.query('SELECT 1');
                databaseStatus = 'connected';
            } catch (dbError) {
                console.error('Database health check failed:', dbError);
                databaseStatus = 'error';
            }
        }
        
        const healthData = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: APP_CONFIG.version,
            environment: APP_CONFIG.environment,
            database: databaseStatus,
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
            }
        };
        
        // Return 503 if database is not connected
        const statusCode = databaseStatus === 'connected' ? 200 : 503;
        res.status(statusCode).json(healthData);
        
    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Internal server error during health check',
            database: 'unknown'
        });
    }
});

/**
 * API Routes Configuration
 * FastAPI equivalent: APIRouter inclusion
 */

// Public routes (no authentication required)
app.use('/api/v1/users', optionalAuth, usersRouter);

// Protected routes (authentication required)
app.use('/api/v1/tasks', authenticateJWT, tasksRouter);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: `Welcome to ${APP_CONFIG.title}`,
        version: APP_CONFIG.version,
        documentation: '/docs',
        health: '/health',
        timestamp: new Date().toISOString()
    });
});

/**
 * 404 Handler
 * FastAPI equivalent: automatic 404 responses
 */
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `The requested endpoint ${req.method} ${req.originalUrl} was not found`,
        timestamp: new Date().toISOString(),
        availableEndpoints: ['/health', '/docs', '/api/v1/tasks', '/api/v1/users']
    });
});

/**
 * Global Error Handler
 * FastAPI equivalent: automatic exception handling
 */
app.use((error, req, res, next) => {
    console.error('Global error handler:', {
        error: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
        return res.status(422).json({
            error: 'Validation Error',
            message: error.message,
            details: error.details || null
        });
    }
    
    if (error.name === 'UnauthorizedError' || error.message === 'jwt malformed') {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing authentication token'
        });
    }
    
    if (error.name === 'CastError') {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid ID format'
        });
    }
    
    // CORS errors
    if (error.message.includes('CORS')) {
        return res.status(403).json({
            error: 'CORS Error',
            message: 'Cross-origin request blocked by CORS policy'
        });
    }
    
    // Default error response
    const statusCode = error.statusCode || error.status || 500;
    const message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message;
    
    res.status(statusCode).json({
        error: 'Internal Server Error',
        message: message,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});

/**
 * Database Initialization and Server Startup
 * FastAPI equivalent: startup event handlers
 */
async function startServer() {
    try {
        console.log(`🚀 Starting ${APP_CONFIG.title} v${APP_CONFIG.version}...`);
        
        // Initialize database connection
        console.log('📊 Initializing database connection...');
        await initializeDatabase();
        console.log('✅ Database connection established');
        
        // Start the server
        const server = app.listen(APP_CONFIG.port, () => {
            console.log(`🌟 Server running on port ${APP_CONFIG.port}`);
            console.log(`📚 API Documentation: http://localhost:${APP_CONFIG.port}/docs`);
            console.log(`❤️  Health Check: http://localhost:${APP_CONFIG.port}/health`);
            console.log(`🌍 Environment: ${APP_CONFIG.environment}`);
        });
        
        // Graceful shutdown handlers
        const gracefulShutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
            
            server.close(async () => {
                console.log('📡 HTTP server closed');
                
                try {
                    await closeDatabaseConnection();
                    console.log('📊 Database connection closed');
                } catch (error) {
                    console.error('❌ Error closing database connection:', error);
                }
                
                console.log('✅ Graceful shutdown completed');
                process.exit(0);
            });
            
            // Force close after 30 seconds
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
            gracefulShutdown('uncaughtException');
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            gracefulShutdown('unhandledRejection');
        });
        
        return server;
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

/**
 * Start the application
 * Only start server if this file is run directly (not imported)
 */
if (require.main === module) {
    startServer();
}

/**
 * Export app for testing
 * FastAPI equivalent: TestClient compatibility
 */
module.exports = {
    app,
    startServer,
    APP_CONFIG
};