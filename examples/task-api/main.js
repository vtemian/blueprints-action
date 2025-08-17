Here's a complete Node.js application entry point that mirrors FastAPI structure with Express.js:

## Main Entry Point (server.js)

```javascript
#!/usr/bin/env node

/**
 * Node.js Server Entry Point
 * Mirrors FastAPI structure with Express.js
 */

import { createServer } from 'http';
import process from 'process';
import { app } from './app.js';
import { logger } from './utils/logger.js';

// Environment configuration with defaults
const config = {
  port: parseInt(process.env.PORT, 10) || 8000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
};

// Development mode detection
const isDevelopment = config.nodeEnv === 'development';
const isProduction = config.nodeEnv === 'production';

/**
 * Create HTTP server instance
 */
const server = createServer(app);

/**
 * Server startup with proper error handling
 */
async function startServer() {
  try {
    // Server startup promise wrapper
    await new Promise((resolve, reject) => {
      server.listen(config.port, config.host, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });

      // Handle server errors during startup
      server.once('error', reject);
    });

    // Remove the error listener after successful startup
    server.removeAllListeners('error');

    // Add runtime error handling
    server.on('error', handleServerError);

    // Log successful startup
    logger.info(`🚀 Server running in ${config.nodeEnv} mode`);
    logger.info(`📡 Listening on http://${config.host}:${config.port}`);
    
    if (isDevelopment) {
      logger.info('🔧 Development mode: Hot reload enabled');
      logger.info(`📋 API Documentation: http://${config.host}:${config.port}/docs`);
    }

  } catch (error) {
    logger.error('❌ Failed to start server:', error.message);
    
    // Handle specific error cases
    if (error.code === 'EADDRINUSE') {
      logger.error(`💥 Port ${config.port} is already in use`);
      logger.info('💡 Try using a different port with: PORT=3001 npm start');
    } else if (error.code === 'EACCES') {
      logger.error(`🔒 Permission denied to bind to port ${config.port}`);
      logger.info('💡 Try using a port > 1024 or run with sudo (not recommended)');
    }

    process.exit(1);
  }
}

/**
 * Handle server runtime errors
 */
function handleServerError(error) {
  logger.error('🔥 Server runtime error:', error);
  
  if (error.code === 'EADDRINUSE') {
    logger.error(`💥 Port ${config.port} is already in use`);
  }
  
  // Don't exit on runtime errors, just log them
  // The process manager should handle restarts
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  logger.info(`📡 Received ${signal}. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async (error) => {
    if (error) {
      logger.error('❌ Error during server shutdown:', error);
      process.exit(1);
    }

    try {
      // Perform cleanup operations
      await performCleanup();
      
      logger.info('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (cleanupError) {
      logger.error('❌ Error during cleanup:', cleanupError);
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('⏰ Forced shutdown due to timeout');
    process.exit(1);
  }, 10000); // 10 second timeout
}

/**
 * Cleanup operations before shutdown
 */
async function performCleanup() {
  logger.info('🧹 Performing cleanup operations...');
  
  // Add your cleanup logic here:
  // - Close database connections
  // - Clear intervals/timeouts
  // - Save application state
  // - Close file handles
  
  // Example cleanup operations
  try {
    // Simulate async cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Add actual cleanup calls here
    // await database.close();
    // await redis.disconnect();
    // clearInterval(someInterval);
    
    logger.info('✅ Cleanup completed successfully');
  } catch (error) {
    logger.error('❌ Cleanup failed:', error);
    throw error;
  }
}

/**
 * Process signal handlers for graceful shutdown
 */
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', error);
  
  if (isProduction) {
    // In production, attempt graceful shutdown
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  } else {
    // In development, exit immediately for debugging
    process.exit(1);
  }
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  
  if (isProduction) {
    // In production, attempt graceful shutdown
    gracefulShutdown('UNHANDLED_REJECTION');
  } else {
    // In development, exit immediately for debugging
    process.exit(1);
  }
});

/**
 * Development mode enhancements
 */
if (isDevelopment) {
  // Enable detailed error logging
  process.env.DEBUG = process.env.DEBUG || 'app:*';
  
  // Log environment variables (excluding sensitive ones)
  logger.debug('🔧 Environment configuration:', {
    NODE_ENV: config.nodeEnv,
    PORT: config.port,
    HOST: config.host,
  });
}

/**
 * Start the server
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  // Only start server if this file is run directly
  startServer().catch((error) => {
    logger.error('💥 Fatal error during server startup:', error);
    process.exit(1);
  });
}

// Export server instance for testing
export { server, config };
```

## Supporting Logger Utility (utils/logger.js)

```javascript
/**
 * Logger utility for consistent logging across the application
 */

import util from 'util';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Simple logger with different levels
 */
export const logger = {
  info: (...args) => {
    console.log(`[${new Date().toISOString()}] INFO:`, ...args);
  },
  
  error: (...args) => {
    console.error(`[${new Date().toISOString()}] ERROR:`, ...args);
  },
  
  warn: (...args) => {
    console.warn(`[${new Date().toISOString()}] WARN:`, ...args);
  },
  
  debug: (...args) => {
    if (isDevelopment) {
      console.debug(`[${new Date().toISOString()}] DEBUG:`, ...args);
    }
  },
};
```

## Package.json Scripts

```json
{
  "name": "express-fastapi-structure",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "start:prod": "NODE_ENV=production node server.js",
    "test": "NODE_ENV=test node --test",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "eslint": "^8.50.0",
    "prettier": "^3.0.3"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

## Environment Configuration (.env.example)

```bash
# Server Configuration
NODE_ENV=development
PORT=8000
HOST=0.0.0.0

# Development Settings
DEBUG=app:*

# Add your application-specific environment variables here
# DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
# REDIS_URL=redis://localhost:6379
# JWT_SECRET=your-secret-key
```

## Docker Support (Dockerfile)

```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start the application
CMD ["npm", "start"]
```

## Key Features:

1. **Container Compatibility**: Binds to `0.0.0.0:8000` for proper container networking
2. **Environment Configuration**: Supports PORT and HOST environment variables
3. **Graceful Shutdown**: Handles SIGTERM/SIGINT with proper cleanup
4. **Error Handling**: Comprehensive error handling for startup and runtime
5. **Development Mode**: Enhanced logging and debugging in development
6. **Production Ready**: Optimized for production deployment
7. **Modern JavaScript**: Uses ES6 modules and async/await patterns
8. **Process Management**: Handles uncaught exceptions and unhandled rejections
9. **Logging**: Structured logging with timestamps and levels
10. **Health Monitoring**: Ready for container health checks

This structure provides a robust, production-ready entry point that mirrors FastAPI's reliability and ease of deployment.