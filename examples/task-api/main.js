/**
 * Required dependencies (add to package.json):
 * {
 *   "dependencies": {
 *     "express": "^4.18.2"
 *   },
 *   "devDependencies": {
 *     "nodemon": "^3.0.1"
 *   }
 * }
 */

import { createServer } from 'http';
import process from 'process';
import app from './app.js'; // Import main application module

/**
 * Server configuration from environment variables
 */
const config = {
  port: parseInt(process.env.PORT) || 8000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
};

/**
 * Create HTTP server instance
 */
const server = createServer(app);

/**
 * Enhanced error handler for server startup failures
 * @param {Error} error - Server error object
 * @param {number} port - Port number that failed to bind
 */
function handleServerError(error, port) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  switch (error.code) {
    case 'EACCES':
      console.error(`❌ ${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`❌ ${bind} is already in use`);
      process.exit(1);
      break;
    case 'ENOTFOUND':
      console.error(`❌ Host ${config.host} not found`);
      process.exit(1);
      break;
    default:
      console.error(`❌ Server startup failed:`, error.message);
      process.exit(1);
  }
}

/**
 * Server listening event handler
 */
function handleServerListening() {
  const addr = server.address();
  const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
  
  console.log(`🚀 Server running on http://${config.host}:${config.port}`);
  console.log(`📝 Environment: ${config.nodeEnv}`);
  console.log(`🎯 Listening on ${bind}`);
  
  if (config.nodeEnv === 'development') {
    console.log(`🔄 Hot reload enabled - watching for changes`);
    console.log(`📚 API docs available at http://${config.host}:${config.port}/docs`);
  }
}

/**
 * Graceful shutdown handler
 * @param {string} signal - Process signal received
 */
function handleGracefulShutdown(signal) {
  console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);
  
  server.close((error) => {
    if (error) {
      console.error('❌ Error during server shutdown:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Server closed successfully');
    console.log('👋 Goodbye!');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

/**
 * Handle uncaught exceptions and unhandled rejections
 */
function setupProcessHandlers() {
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Graceful shutdown signals
  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
}

/**
 * Validate server configuration
 */
function validateConfig() {
  if (config.port < 1 || config.port > 65535) {
    console.error('❌ Invalid port number. Must be between 1 and 65535');
    process.exit(1);
  }

  if (!config.host) {
    console.error('❌ Invalid host configuration');
    process.exit(1);
  }
}

/**
 * Main server startup function
 * Bootstraps the Express server with proper error handling and configuration
 */
async function startServer() {
  try {
    console.log('🔧 Initializing server...');
    
    // Validate configuration
    validateConfig();
    
    // Setup process handlers
    setupProcessHandlers();
    
    // Configure server event handlers
    server.on('error', (error) => handleServerError(error, config.port));
    server.on('listening', handleServerListening);
    
    // Start listening
    server.listen(config.port, config.host);
    
  } catch (error) {
    console.error('💥 Failed to start server:', error.message);
    process.exit(1);
  }
}

/**
 * Development mode enhancements
 */
if (config.nodeEnv === 'development') {
  // Enable detailed error logging
  process.env.DEBUG = process.env.DEBUG || 'express:*';
  
  // Log unhandled promise rejections in development
  process.on('warning', (warning) => {
    console.warn('⚠️  Warning:', warning.name, warning.message);
  });
}

// Start the server
startServer();

// Export server instance for testing purposes
export default server;