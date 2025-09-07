/**
 * Main entry point for the Node.js/Express server application
 * Handles server startup, configuration, and graceful shutdown
 */

import app from './app.js';
import { createServer } from 'http';

// Configuration
const PORT = process.env.PORT || 8000;
const HOST = '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV === 'development';

// Global server instance for graceful shutdown
let server = null;

/**
 * Enhanced logging for development mode
 * @param {string} message - Log message
 * @param {string} level - Log level (info, error, warn)
 */
function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = isDevelopment ? `[${timestamp}] [${level.toUpperCase()}]` : `[${level.toUpperCase()}]`;
    console.log(`${prefix} ${message}`);
}

/**
 * Handle server startup errors with specific error codes
 * @param {Error} error - Server startup error
 */
function handleServerError(error) {
    if (error.code === 'EADDRINUSE') {
        log(`Port ${PORT} is already in use. Please choose a different port or stop the conflicting process.`, 'error');
        process.exit(1);
    } else if (error.code === 'EACCES') {
        log(`Permission denied to bind to port ${PORT}. Try using a port number above 1024 or run with elevated privileges.`, 'error');
        process.exit(2);
    } else if (error.code === 'ENOTFOUND') {
        log(`Host ${HOST} not found. Check your network configuration.`, 'error');
        process.exit(3);
    } else {
        log(`Failed to start server: ${error.message}`, 'error');
        if (isDevelopment) {
            console.error(error.stack);
        }
        process.exit(4);
    }
}

/**
 * Graceful shutdown handler
 * @param {string} signal - Process signal received
 */
async function gracefulShutdown(signal) {
    log(`Received ${signal}. Starting graceful shutdown...`, 'info');
    
    if (server) {
        // Set a timeout for forceful shutdown
        const shutdownTimeout = setTimeout(() => {
            log('Forceful shutdown due to timeout', 'warn');
            process.exit(1);
        }, 10000); // 10 seconds timeout
        
        try {
            // Close server and stop accepting new connections
            await new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            
            clearTimeout(shutdownTimeout);
            log('Server closed successfully', 'info');
            
            // Perform any additional cleanup here
            // e.g., close database connections, clear caches, etc.
            
            log('Graceful shutdown completed', 'info');
            process.exit(0);
            
        } catch (error) {
            clearTimeout(shutdownTimeout);
            log(`Error during graceful shutdown: ${error.message}`, 'error');
            process.exit(1);
        }
    } else {
        log('No active server to shutdown', 'info');
        process.exit(0);
    }
}

/**
 * Start the Express server with proper error handling and logging
 */
async function startServer() {
    try {
        // Create HTTP server
        server = createServer(app);
        
        // Handle server errors
        server.on('error', handleServerError);
        
        // Handle client errors
        server.on('clientError', (err, socket) => {
            if (isDevelopment) {
                log(`Client error: ${err.message}`, 'warn');
            }
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        });
        
        // Start listening with timeout
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Server startup timeout'));
            }, 30000); // 30 seconds timeout
            
            server.listen(PORT, HOST, () => {
                clearTimeout(timeout);
                resolve();
            });
            
            server.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
        
        // Success logging
        log(`🚀 Server successfully started!`, 'info');
        log(`📍 Server running at http://${HOST}:${PORT}`, 'info');
        log(`🌍 Environment: ${NODE_ENV}`, 'info');
        
        if (isDevelopment) {
            log(`🔧 Development mode: Enhanced logging enabled`, 'info');
            log(`📊 Process ID: ${process.pid}`, 'info');
            log(`💾 Node.js version: ${process.version}`, 'info');
        }
        
        // Log available routes in development
        if (isDevelopment && app._router) {
            log('📋 Available routes:', 'info');
            app._router.stack.forEach((middleware) => {
                if (middleware.route) {
                    const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
                    log(`   ${methods} ${middleware.route.path}`, 'info');
                }
            });
        }
        
    } catch (error) {
        log(`❌ Failed to start server: ${error.message}`, 'error');
        
        if (isDevelopment) {
            console.error('Stack trace:', error.stack);
        }
        
        handleServerError(error);
    }
}

/**
 * Setup process signal handlers for graceful shutdown
 */
function setupSignalHandlers() {
    // Handle graceful shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        log(`Uncaught Exception: ${error.message}`, 'error');
        if (isDevelopment) {
            console.error('Stack trace:', error.stack);
        }
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
        if (isDevelopment) {
            console.error('Full error:', reason);
        }
        gracefulShutdown('UNHANDLED_REJECTION');
    });
}

/**
 * Main application entry point
 */
async function main() {
    try {
        log('🔄 Starting application...', 'info');
        
        // Setup signal handlers first
        setupSignalHandlers();
        
        // Validate environment
        if (isDevelopment) {
            log('⚠️  Running in development mode', 'warn');
        }
        
        // Start the server
        await startServer();
        
    } catch (error) {
        log(`💥 Application startup failed: ${error.message}`, 'error');
        
        if (isDevelopment) {
            console.error('Startup error stack:', error.stack);
        }
        
        process.exit(5);
    }
}

// Start the application
main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(6);
});

// Export for testing purposes
export { server, startServer, gracefulShutdown };