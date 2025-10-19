#!/usr/bin/env node

/**
 * Main entry point for the Node.js web application
 * Mirrors FastAPI application structure with Express.js
 * 
 * @fileoverview Application server startup and configuration
 * @author Your Name
 * @version 1.0.0
 */

import { createRequire } from 'module';
import process from 'process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import the main application instance
import app from './app.js';

// ES6 module compatibility helpers
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Server configuration constants
 */
const CONFIG = {
    PORT: process.env.PORT || 8000,
    HOST: process.env.HOST || '0.0.0.0',
    NODE_ENV: process.env.NODE_ENV || 'development',
    SHUTDOWN_TIMEOUT: 10000 // 10 seconds
};

/**
 * Server instance holder
 */
let server = null;

/**
 * Starts the Express server with proper error handling
 * @async
 * @function startServer
 * @returns {Promise<void>}
 */
async function startServer() {
    try {
        // Start the server
        server = app.listen(CONFIG.PORT, CONFIG.HOST, () => {
            console.log(`🚀 Server running on http://${CONFIG.HOST}:${CONFIG.PORT}`);
            console.log(`📝 Environment: ${CONFIG.NODE_ENV}`);
            console.log(`🔄 Hot reload: ${CONFIG.NODE_ENV === 'development' ? 'enabled' : 'disabled'}`);
            
            if (CONFIG.NODE_ENV === 'development') {
                console.log(`📚 API Documentation available at http://${CONFIG.HOST}:${CONFIG.PORT}/docs`);
            }
            
            console.log('✅ Server startup completed successfully');
        });

        // Handle server errors
        server.on('error', handleServerError);
        
        // Set server timeout for long-running requests
        server.timeout = 30000; // 30 seconds
        
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

/**
 * Handles server startup errors
 * @param {Error} error - The server error
 */
function handleServerError(error) {
    switch (error.code) {
        case 'EADDRINUSE':
            console.error(`❌ Port ${CONFIG.PORT} is already in use`);
            console.error('💡 Try using a different port or stop the process using this port');
            console.error(`💡 You can set a different port using: PORT=3001 node ${__filename}`);
            break;
            
        case 'EACCES':
            console.error(`❌ Permission denied to bind to port ${CONFIG.PORT}`);
            console.error('💡 Try using a port number above 1024 or run with elevated privileges');
            break;
            
        case 'ENOTFOUND':
            console.error(`❌ Host ${CONFIG.HOST} not found`);
            console.error('💡 Check your host configuration');
            break;
            
        default:
            console.error('❌ Server error:', error.message);
            console.error('📋 Error details:', error);
    }
    
    process.exit(1);
}

/**
 * Gracefully shuts down the server
 * @async
 * @function gracefulShutdown
 * @param {string} signal - The shutdown signal received
 * @returns {Promise<void>}
 */
async function gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    
    if (!server) {
        console.log('✅ No server instance to close');
        process.exit(0);
    }
    
    // Set shutdown timeout
    const shutdownTimer = setTimeout(() => {
        console.error('❌ Graceful shutdown timeout exceeded. Forcing exit...');
        process.exit(1);
    }, CONFIG.SHUTDOWN_TIMEOUT);
    
    try {
        // Stop accepting new connections and close existing ones
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
        
        clearTimeout(shutdownTimer);
        console.log('✅ Server closed successfully');
        console.log('👋 Goodbye!');
        process.exit(0);
        
    } catch (error) {
        clearTimeout(shutdownTimer);
        console.error('❌ Error during graceful shutdown:', error.message);
        process.exit(1);
    }
}

/**
 * Sets up process signal handlers for graceful shutdown
 */
function setupSignalHandlers() {
    // Handle different shutdown signals
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
        process.on(signal, () => gracefulShutdown(signal));
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
        gracefulShutdown('UNHANDLED_REJECTION');
    });
}

/**
 * Development mode enhancements
 */
function setupDevelopmentMode() {
    if (CONFIG.NODE_ENV === 'development') {
        // Enable detailed error logging
        process.env.DEBUG = process.env.DEBUG || 'express:*';
        
        // Log memory usage periodically in development
        if (process.env.LOG_MEMORY === 'true') {
            setInterval(() => {
                const memUsage = process.memoryUsage();
                console.log('📊 Memory Usage:', {
                    rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
                    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
                    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`
                });
            }, 30000); // Every 30 seconds
        }
    }
}

/**
 * Main application bootstrap function
 * @async
 * @function main
 * @returns {Promise<void>}
 */
async function main() {
    console.log('🔧 Initializing application...');
    console.log(`📦 Node.js version: ${process.version}`);
    console.log(`🏠 Working directory: ${process.cwd()}`);
    
    // Setup signal handlers for graceful shutdown
    setupSignalHandlers();
    
    // Setup development mode enhancements
    setupDevelopmentMode();
    
    // Start the server
    await startServer();
}

/**
 * Run the application only when this file is executed directly
 * (not when imported as a module)
 */
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error('❌ Application startup failed:', error);
        process.exit(1);
    });
}

// Export for testing purposes
export { startServer, gracefulShutdown, CONFIG };