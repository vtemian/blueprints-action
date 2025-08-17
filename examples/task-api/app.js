/**
 * FastAPI-equivalent Express.js Application Setup Module
 * Production-ready application entry point with comprehensive middleware and routing
 * @version 1.0.0
 */

import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { taskRoutes } from './api/tasks.js';
import { userRoutes } from './api/users.js';
import { connectDatabase, createTables, getConnectionStatus, closeConnection } from './core/database.js';
import { authenticateToken } from './core/auth.js';

/**
 * Initialize and configure Express application
 * @returns {express.Application} Configured Express app instance
 */
function createApp() {
    const app = express();
    
    // Application metadata
    app.set('title', 'FastAPI Express Equivalent');
    app.set('version', '1.0.0');
    
    // Trust proxy for production deployment
    app.set('trust proxy', 1);
    
    // Core middleware configuration (order is critical)
    
    // 1. CORS configuration - must be first
    app.use(cors({
        origin: 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));
    
    // 2. Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // 3. Health check endpoint (before authentication middleware)
    app.get('/health', async (req, res) => {
        try {
            const dbStatus = await getConnectionStatus();
            res.status(200).json({
                status: 'healthy',
                database: dbStatus,
                timestamp: new Date().toISOString(),
                version: app.get('version')
            });
        } catch (error) {
            res.status(503).json({
                status: 'unhealthy',
                database: 'disconnected',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // 4. JWT Authentication middleware for protected routes
    app.use('/api', authenticateToken);
    
    // 5. Route mounting
    app.use('/api/tasks', taskRoutes);
    app.use('/api/users', userRoutes);
    
    // 6. 404 handler for unmatched routes
    app.use('*', (req, res) => {
        res.status(404).json({
            error: 'Not Found',
            message: `Route ${req.method} ${req.originalUrl} not found`,
            timestamp: new Date().toISOString()
        });
    });
    
    // 7. Global error handling middleware (must be last)
    app.use((error, req, res, next) => {
        console.error('Global Error Handler:', {
            error: error.message,
            stack: error.stack,
            url: req.originalUrl,
            method: req.method,
            timestamp: new Date().toISOString()
        });
        
        // Handle specific error types
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation Error',
                message: error.message,
                details: error.details || null
            });
        }
        
        if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or missing authentication token'
            });
        }
        
        if (error.name === 'DatabaseError') {
            return res.status(503).json({
                error: 'Service Unavailable',
                message: 'Database connection error'
            });
        }
        
        // Default server error
        res.status(500).json({
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'production' 
                ? 'An unexpected error occurred' 
                : error.message,
            timestamp: new Date().toISOString()
        });
    });
    
    return app;
}

/**
 * Application startup function
 * Initializes database connection and creates necessary tables
 * @returns {Promise<void>}
 */
async function startup() {
    try {
        console.log('🚀 Starting application initialization...');
        
        // Initialize database connection
        console.log('📊 Connecting to database...');
        await connectDatabase();
        
        // Create database tables
        console.log('🔧 Creating database tables...');
        await createTables();
        
        console.log('✅ Application startup completed successfully');
        
    } catch (error) {
        console.error('❌ Application startup failed:', error);
        throw new Error(`Startup failed: ${error.message}`);
    }
}

/**
 * Graceful shutdown handler
 * Closes database connections and performs cleanup
 * @returns {Promise<void>}
 */
async function shutdown() {
    try {
        console.log('🔄 Initiating graceful shutdown...');
        
        // Close database connections
        await closeConnection();
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

// Handle process termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown();
});

// Create application instance
const app = createApp();

// Port configuration with environment variable fallback
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Start the server
 * @returns {Promise<void>}
 */
async function startServer() {
    try {
        // Run startup procedures
        await startup();
        
        // Start HTTP server
        const server = app.listen(PORT, HOST, () => {
            console.log(`🌟 Server running on http://${HOST}:${PORT}`);
            console.log(`📋 Health check available at http://${HOST}:${PORT}/health`);
            console.log(`🔗 API endpoints available at http://${HOST}:${PORT}/api`);
        });
        
        // Configure server timeouts
        server.timeout = 30000; // 30 seconds
        server.keepAliveTimeout = 65000; // 65 seconds
        server.headersTimeout = 66000; // 66 seconds
        
        return server;
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Export configured app and utility functions
export { 
    app as default, 
    startup, 
    shutdown, 
    startServer,
    PORT,
    HOST
};

// Auto-start server if this module is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    startServer();
}