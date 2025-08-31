Here's a complete Node.js application entry point that mirrors FastAPI functionality:

## main.js
```javascript
#!/usr/bin/env node

/**
 * Main entry point for Node.js/Express application
 * Equivalent to FastAPI's uvicorn server setup
 */

import { createServer } from 'http';
import process from 'process';
import { app } from './app.js';

// Configuration with environment variable fallbacks
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Create HTTP server instance
 */
const server = createServer(app);

/**
 * Enhanced error handling for server startup
 */
const handleServerError = (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof PORT === 'string' ? `Pipe ${PORT}` : `Port ${PORT}`;

  switch (error.code) {
    case 'EACCES':
      console.error(`❌ ${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`❌ ${bind} is already in use`);
      process.exit(1);
      break;
    default:
      console.error(`❌ Server error:`, error.message);
      throw error;
  }
};

/**
 * Server listening event handler
 */
const handleServerListening = () => {
  const addr = server.address();
  const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
  
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📝 Environment: ${NODE_ENV}`);
  console.log(`🎯 Listening on ${bind}`);
  
  if (NODE_ENV === 'development') {
    console.log(`🔄 Development mode: Hot reload enabled`);
    console.log(`📚 API docs available at http://${HOST}:${PORT}/docs`);
  }
};

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = (signal) => {
  console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async (err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
      process.exit(1);
    }
    
    console.log('✅ HTTP server closed');
    
    // Add any cleanup operations here (database connections, etc.)
    try {
      // Example: await database.close();
      // Example: await redis.disconnect();
      console.log('✅ All connections closed');
    } catch (cleanupError) {
      console.error('❌ Error during cleanup:', cleanupError);
      process.exit(1);
    }
    
    console.log('👋 Graceful shutdown completed');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

/**
 * Global error handlers
 */
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

/**
 * Graceful shutdown signal handlers
 */
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Start server function
 */
const startServer = async () => {
  try {
    // Validate port
    const portNum = parseInt(PORT, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error(`Invalid port number: ${PORT}`);
    }

    // Set up server event listeners
    server.on('error', handleServerError);
    server.on('listening', handleServerListening);

    // Start listening
    server.listen(portNum, HOST);

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

/**
 * Main execution - only run if this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🌟 Starting Node.js application...');
  startServer();
}

// Export server for testing purposes
export { server, startServer };
```

## package.json (scripts section)
```json
{
  "name": "nodejs-fastapi-equivalent",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=16.0.0"
  },
  "scripts": {
    "start": "node main.js",
    "dev": "NODE_ENV=development nodemon main.js",
    "prod": "NODE_ENV=production node main.js",
    "test": "NODE_ENV=test jest",
    "lint": "eslint *.js",
    "docker:start": "HOST=0.0.0.0 PORT=8000 node main.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.7.0",
    "eslint": "^8.50.0"
  }
}
```

## Example app.js (companion file)
```javascript
/**
 * Express application setup
 * Equivalent to FastAPI app instance
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (equivalent to FastAPI automatic /health)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API documentation endpoint (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/docs', (req, res) => {
    res.json({
      message: 'API Documentation',
      endpoints: {
        'GET /health': 'Health check endpoint',
        'GET /docs': 'This documentation'
      }
    });
  });
}

// Example API routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Node.js FastAPI equivalent!',
    version: '1.0.0'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Application Error:', err);
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

export { app };
```

## Docker support (.dockerignore)
```
node_modules
npm-debug.log
.git
.gitignore
README.md
.env
coverage
.nyc_output
```

## Key Features:

1. **🚀 FastAPI Equivalent**: Mirrors uvicorn server functionality
2. **🔧 Environment Configuration**: PORT, HOST, NODE_ENV support
3. **🛡️ Production Ready**: Error handling, graceful shutdown, security
4. **🔄 Development Features**: Hot reload support with nodemon
5. **📊 Health Checks**: Built-in health endpoint
6. **🐳 Container Ready**: 0.0.0.0 host binding for Docker
7. **⚡ Modern Syntax**: ES6+ modules, async/await
8. **🧪 Test Ready**: Conditional execution for testing

## Usage:

```bash
# Development
npm run dev

# Production
npm run prod

# Docker
npm run docker:start

# Direct execution
chmod +x main.js
./main.js
```

This setup provides a robust, production-ready Node.js application entry point that closely mirrors FastAPI's functionality and development experience.