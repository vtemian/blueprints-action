/**
 * Node.js Application Entry Point
 * 
 * Required dependencies in package.json:
 * {
 *   "type": "module",
 *   "dependencies": {
 *     "express": "^4.18.2"
 *   },
 *   "devDependencies": {
 *     "nodemon": "^3.0.1"
 *   },
 *   "scripts": {
 *     "start": "node main.js",
 *     "dev": "nodemon main.js"
 *   }
 * }
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import process from 'process';

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
    HOST: '0.0.0.0',
    PORT: 8000,
    NODE_ENV: process.env.NODE_ENV || 'development'
};

// Global server reference for cleanup
let server = null;

/**
 * Import the Express app with error handling
 */
async function importApp() {
    try {
        const appModule = await import('./app.js');
        return appModule.default || appModule.app;
    } catch (error) {
        console.error('❌ Failed to import app module:', error.message);
        console.error('   Make sure ./app.js exists and exports an Express app');
        process.exit(1);
    }
}

/**
 * Start the server with comprehensive error handling
 */
async function startServer() {
    try {
        // Import the Express app
        const app = await importApp();
        
        if (!app) {
            throw new Error('App module did not export a valid Express application');
        }

        // Create server with promise wrapper for better error handling
        const startServerPromise = new Promise((resolve, reject) => {
            server = app.listen(CONFIG.PORT, CONFIG.HOST, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(server);
                }
            });

            // Handle server errors
            server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${CONFIG.PORT} is already in use. Please choose a different port or stop the conflicting service.`));
                } else if (error.code === 'EACCES') {
                    reject(new Error(`Permission denied to bind to port ${CONFIG.PORT}. Try using a port number above 1024.`));
                } else {
                    reject(error);
                }
            });
        });

        // Wait for server to start
        await startServerPromise;

        // Success logging
        console.log('🚀 Server started successfully!');
        console.log(`📍 Server running at: http://${CONFIG.HOST}:${CONFIG.PORT}`);
        console.log(`🌍 Environment: ${CONFIG.NODE_ENV}`);
        
        if (CONFIG.NODE_ENV === 'development') {
            console.log('🔄 Development mode: Use "npm run dev" for auto-reload');
            console.log('💡 API docs typically available at: http://localhost:8000/docs');
        }
        
        console.log('⏹️  Press Ctrl+C to stop the server');

    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
    console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);
    
    if (server) {
        try {
            // Close server with timeout
            const shutdownPromise = new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            // Set shutdown timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Shutdown timeout')), 10000);
            });

            await Promise.race([shutdownPromise, timeoutPromise]);
            console.log('✅ Server closed successfully');
            
        } catch (error) {
            console.error('⚠️  Error during shutdown:', error.message);
            console.log('🔄 Forcing shutdown...');
        }
    }
    
    console.log('👋 Goodbye!');
    process.exit(0);
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers() {
    // Handle different termination signals
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
}

/**
 * Main execution function - equivalent to Python's if __name__ == "__main__"
 */
async function main() {
    // Check if this file is being run directly
    if (process.argv[1] === __filename || process.argv[1].endsWith('main.js')) {
        console.log('🌟 Starting Node.js application...');
        console.log(`📦 Node.js version: ${process.version}`);
        console.log(`📁 Working directory: ${process.cwd()}`);
        
        // Setup graceful shutdown
        setupSignalHandlers();
        
        // Start the server
        await startServer();
    }
}

/**
 * Export for testing or programmatic use
 */
export { startServer, gracefulShutdown, CONFIG };

/**
 * Execute main function if this file is run directly
 * This is the ES6 equivalent of Python's if __name__ == "__main__"
 */
main().catch((error) => {
    console.error('💥 Fatal error in main():', error);
    process.exit(1);
});