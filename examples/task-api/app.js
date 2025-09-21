/**
 * Task Management API - Express.js Application
 * Production-ready Express server with authentication, database integration, and comprehensive error handling
 * @version 1.0.0
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import custom modules
import { initializeDatabase, getConnectionStatus, closeDatabase } from './core/database.js';
import { jwtAuthMiddleware, isAuthEndpoint } from './core/auth.js';
import taskRoutes from './api/tasks.js';
import userRoutes from './api/users.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Express application instance
 */
const app = express();

// Application configuration
const APP_CONFIG = {
    title: 'Task Management API',
    version: '1.0.0',
    port: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000'
};

/**
 * Rate limiting configuration for production readiness
 */
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: APP_CONFIG.environment === 'production' ? 100 : 1000, // Limit each IP
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * CORS configuration middleware
 */
const corsOptions = {
    origin: APP_CONFIG.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};

/**
 * Custom JWT authentication middleware wrapper
 * Skips authentication for health endpoint and auth endpoints
 */
const conditionalAuthMiddleware = (req, res, next) => {
    // Skip authentication for health endpoint
    if (req.path === '/health') {
        return next();
    }
    
    // Skip authentication for auth endpoints
    if (isAuthEndpoint(req.path)) {
        return next();
    }
    
    // Apply JWT authentication for all other routes
    return jwtAuthMiddleware(req, res, next);
};

/**
 * Request logging configuration
 */
const morganFormat = APP_CONFIG.environment === 'production' 
    ? 'combined' 
    : ':method :url :status :res[content-length] - :response-time ms';

// Middleware configuration (in exact order as specified)
app.use(helmet()); // Security headers
app.use(limiter); // Rate limiting
app.use(morgan(morganFormat)); // Request logging

// 1. CORS middleware
app.use(cors(corsOptions));

// 2. JSON body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. JWT authentication middleware (conditional)
app.use(conditionalAuthMiddleware);

/**
 * Health check endpoint
 * Returns application status and database connection status
 */
app.get('/health', async (req, res) => {
    try {
        const dbStatus = await getConnectionStatus();
        
        res.status(200).json({
            status: 'healthy',
            database: dbStatus,
            timestamp: new Date().toISOString(),
            version: APP_CONFIG.version,
            environment: APP_CONFIG.environment
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
        });
    }
});

// API Routes mounting
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
    res.json({
        message: `Welcome to ${APP_CONFIG.title}`,
        version: APP_CONFIG.version,
        documentation: '/api/docs',
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
            'GET /health',
            'GET /api/tasks',
            'GET /api/users'
        ]
    });
});

/**
 * Global error handler middleware
 * Handles all unhandled exceptions and errors
 */
app.use((error, req, res, next) => {
    console.error('Global error handler:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    // Authentication errors
    if (error.name === 'UnauthorizedError' || error.status === 401) {
        return res.status(401).json({
            error: 'Authentication failed',
            message: 'Invalid or expired token',
            code: 'AUTH_ERROR'
        });
    }

    // JWT specific errors
    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Invalid token',
            message: 'The provided token is malformed',
            code: 'INVALID_TOKEN'
        });
    }

    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'Token expired',
            message: 'The provided token has expired',
            code: 'TOKEN_EXPIRED'
        });
    }

    // Database errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return res.status(503).json({
            error: 'Database connection failed',
            message: 'Unable to connect to the database',
            code: 'DB_CONNECTION_ERROR'
        });
    }

    // Validation errors
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation failed',
            message: error.message,
            code: 'VALIDATION_ERROR'
        });
    }

    // Default server error
    const statusCode = error.status || error.statusCode || 500;
    const message = APP_CONFIG.environment === 'production' 
        ? 'Internal server error' 
        : error.message;

    res.status(statusCode).json({
        error: 'Server error',
        message: message,
        code: 'INTERNAL_ERROR',
        ...(APP_CONFIG.environment !== 'production' && { stack: error.stack })
    });
});

/**
 * Database initialization with retry logic
 * @param {number} retries - Number of retry attempts
 * @param {number} delay - Delay between retries in milliseconds
 */
async function initializeDatabaseWithRetry(retries = 3, delay = 5000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`🔄 Database connection attempt ${attempt}/${retries}...`);
            await initializeDatabase();
            console.log('✅ Database connected and initialized successfully');
            return;
        } catch (error) {
            console.error(`❌ Database connection attempt ${attempt} failed:`, error.message);
            
            if (attempt === retries) {
                throw new Error(`Failed to connect to database after ${retries} attempts: ${error.message}`);
            }
            
            console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Graceful shutdown handler
 * Closes database connections and stops the server gracefully
 */
async function gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    
    try {
        // Close database connections
        await closeDatabase();
        console.log('✅ Database connections closed');
        
        // Close server
        if (server) {
            server.close(() => {
                console.log('✅ HTTP server closed');
                console.log('👋 Graceful shutdown completed');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    } catch (error) {
        console.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
    }
}

/**
 * Application startup function
 */
async function startApplication() {
    try {
        console.log(`🚀 Starting ${APP_CONFIG.title} v${APP_CONFIG.version}`);
        console.log(`📊 Environment: ${APP_CONFIG.environment}`);
        
        // Initialize database with retry logic
        await initializeDatabaseWithRetry();
        
        // Start HTTP server
        const server = app.listen(APP_CONFIG.port, () => {
            console.log(`🌐 Server running on port ${APP_CONFIG.port}`);
            console.log(`🔗 Health check: http://localhost:${APP_CONFIG.port}/health`);
            console.log(`📚 API Base URL: http://localhost:${APP_CONFIG.port}/api`);
            console.log(`🔒 CORS enabled for: ${APP_CONFIG.corsOrigin}`);
            console.log('✅ Application started successfully');
        });

        // Set server timeout
        server.timeout = 30000; // 30 seconds

        // Store server reference for graceful shutdown
        global.server = server;

        return server;
        
    } catch (error) {
        console.error('❌ Failed to start application:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Process event listeners for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

// Start the application
let server;
if (import.meta.url === `file://${process.argv[1]}`) {
    // Only start server if this file is run directly
    server = await startApplication();
}

export default app;
export { APP_CONFIG, startApplication };