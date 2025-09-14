Here's a complete Node.js application entry point that mirrors FastAPI structure with modern ES6+ syntax:

## main.js

```javascript
import { createServer } from 'http';
import process from 'process';
import app from './app/index.js';

// Configuration from environment variables
const config = {
  port: parseInt(process.env.PORT) || 8000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development'
};

// Create HTTP server
const server = createServer(app);

// Server startup function
async function startServer() {
  try {
    // Start listening on configured host and port
    await new Promise((resolve, reject) => {
      server.listen(config.port, config.host, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    console.log(`🚀 Server running on http://${config.host}:${config.port}`);
    console.log(`📦 Environment: ${config.nodeEnv}`);
    
    if (config.nodeEnv === 'development') {
      console.log('🔄 Development mode: Auto-restart enabled');
      console.log('💡 Press Ctrl+C to stop the server');
    }

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    
    // Handle specific error cases
    if (error.code === 'EADDRINUSE') {
      console.error(`🔴 Port ${config.port} is already in use`);
      console.error('💡 Try using a different port: PORT=3000 npm start');
    } else if (error.code === 'EACCES') {
      console.error(`🔴 Permission denied to bind to port ${config.port}`);
      console.error('💡 Try using a port number above 1024 or run with sudo');
    }
    
    process.exit(1);
  }
}

// Graceful shutdown function
function gracefulShutdown(signal) {
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
    console.error('⏰ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
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

// Start the server
startServer();
```

## Supporting Files

### package.json
```json
{
  "name": "nodejs-fastapi-structure",
  "version": "1.0.0",
  "type": "module",
  "description": "Node.js application with FastAPI-like structure",
  "main": "main.js",
  "scripts": {
    "start": "node main.js",
    "dev": "nodemon main.js",
    "prod": "NODE_ENV=production node main.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "engines": {
    "node": ">=16.0.0"
  }
}
```

### app/index.js (Example app structure)
```javascript
import express from 'express';
import cors from 'cors';

// Create Express application
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Node.js FastAPI-style application',
    version: '1.0.0',
    docs: '/docs'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    statusCode: 404
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('🔴 Application Error:', error);
  
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message,
    statusCode: error.status || 500,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  });
});

export default app;
```

### .env (Environment variables example)
```env
# Server Configuration
PORT=8000
HOST=0.0.0.0
NODE_ENV=development

# Application Configuration
APP_NAME=nodejs-fastapi-app
APP_VERSION=1.0.0
```

### Alternative CommonJS Version (main.js)
```javascript
const { createServer } = require('http');
const app = require('./app');

// Configuration from environment variables
const config = {
  port: parseInt(process.env.PORT) || 8000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development'
};

// Create HTTP server
const server = createServer(app);

// Server startup function
async function startServer() {
  try {
    await new Promise((resolve, reject) => {
      server.listen(config.port, config.host, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    console.log(`🚀 Server running on http://${config.host}:${config.port}`);
    console.log(`📦 Environment: ${config.nodeEnv}`);
    
    if (config.nodeEnv === 'development') {
      console.log('🔄 Development mode: Auto-restart enabled');
    }

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    
    if (error.code === 'EADDRINUSE') {
      console.error(`🔴 Port ${config.port} is already in use`);
    }
    
    process.exit(1);
  }
}

// Graceful shutdown function
function gracefulShutdown(signal) {
  console.log(`\n📡 Received ${signal}. Shutting down gracefully...`);
  
  server.close((error) => {
    if (error) {
      console.error('❌ Error during shutdown:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Server closed successfully');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⏰ Forced shutdown');
    process.exit(1);
  }, 10000);
}

// Event listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
startServer();
```

## Key Features:

1. **Environment Configuration**: Uses environment variables with sensible defaults
2. **Error Handling**: Comprehensive error handling for startup failures and runtime errors
3. **Graceful Shutdown**: Proper cleanup on process termination signals
4. **Development Features**: Auto-restart capability with nodemon
5. **Container Ready**: Configured for Docker deployment with 0.0.0.0 host
6. **Modern Syntax**: ES6+ modules with async/await
7. **Production Ready**: Includes proper logging and error reporting
8. **Separation of Concerns**: Clean separation between app logic and server startup

This structure mirrors FastAPI's approach while leveraging Node.js and Express.js best practices.