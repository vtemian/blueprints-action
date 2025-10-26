Here's a complete Node.js application entry point following modern best practices:

## server.js

```javascript
/**
 * Main server entry point
 * 
 * Recommended package.json scripts:
 * "scripts": {
 *   "start": "node server.js",
 *   "dev": "nodemon server.js",
 *   "prod": "NODE_ENV=production node server.js"
 * }
 */

import { createServer } from 'http';
import process from 'process';
import app from './app.js';

// Environment configuration with defaults
const config = {
  port: parseInt(process.env.PORT, 10) || 8000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development'
};

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to exit the process
  if (config.nodeEnv === 'production') {
    process.exit(1);
  }
});

// Create HTTP server
const server = createServer(app);

// Enhanced error handling for server startup
const startServer = async () => {
  try {
    // Attempt to start the server
    await new Promise((resolve, reject) => {
      server.listen(config.port, config.host, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    // Success logging
    console.log('🚀 Server started successfully!');
    console.log(`📍 Server running at http://${config.host}:${config.port}`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);
    console.log(`🕐 Started at: ${new Date().toISOString()}`);
    
    if (config.nodeEnv === 'development') {
      console.log('🔥 Hot reload enabled (if using nodemon)');
      console.log('📝 Development mode features active');
    }

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    
    // Handle specific error cases
    if (error.code === 'EADDRINUSE') {
      console.error(`🚫 Port ${config.port} is already in use`);
      console.error('💡 Try using a different port or stop the conflicting process');
      
      // Attempt to start on alternative port in development
      if (config.nodeEnv === 'development') {
        console.log('🔄 Attempting to start on alternative port...');
        config.port = config.port + 1;
        setTimeout(startServer, 1000);
        return;
      }
    } else if (error.code === 'EACCES') {
      console.error(`🚫 Permission denied to bind to port ${config.port}`);
      console.error('💡 Try using a port number above 1024 or run with elevated privileges');
    } else if (error.code === 'EADDRNOTAVAIL') {
      console.error(`🚫 Address ${config.host} is not available`);
      console.error('💡 Check if the host address is correct');
    }
    
    process.exit(1);
  }
};

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  const shutdownTimeout = setTimeout(() => {
    console.error('⏰ Shutdown timeout reached. Forcing exit...');
    process.exit(1);
  }, 10000); // 10 second timeout

  server.close(async (error) => {
    clearTimeout(shutdownTimeout);
    
    if (error) {
      console.error('❌ Error during server shutdown:', error.message);
      process.exit(1);
    }

    try {
      // Perform cleanup operations here
      console.log('🧹 Cleaning up resources...');
      
      // Example: Close database connections
      // await database.close();
      
      // Example: Clear intervals/timeouts
      // clearInterval(someInterval);
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (cleanupError) {
      console.error('❌ Error during cleanup:', cleanupError.message);
      process.exit(1);
    }
  });
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle Windows specific signals
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK'));
}

// Start the server
startServer();

// Export server instance for testing purposes
export default server;
```

## app.js

```javascript
/**
 * Express application configuration
 * Separated from server.js for better modularity and testing
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

const app = express();
const isDevelopment = process.env.NODE_ENV !== 'production';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: isDevelopment ? false : undefined,
}));

// CORS configuration
const corsOptions = {
  origin: isDevelopment 
    ? ['http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:3000']
    : process.env.ALLOWED_ORIGINS?.split(',') || false,
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : 100, // Limit each IP
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (isDevelopment) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Example API route
app.get('/api/status', (req, res) => {
  res.json({
    status: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('🚨 Application Error:', error);
  
  // Don't leak error details in production
  const errorResponse = {
    error: 'Internal server error',
    ...(isDevelopment && {
      message: error.message,
      stack: error.stack
    })
  };
  
  res.status(error.status || 500).json(errorResponse);
});

export default app;
```

## package.json (recommended dependencies)

```json
{
  "name": "nodejs-server-app",
  "version": "1.0.0",
  "type": "module",
  "description": "Node.js server application with Express",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "prod": "NODE_ENV=production node server.js",
    "test": "jest",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "morgan": "^1.10.0",
    "compression": "^1.7.4",
    "express-rate-limit": "^6.8.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.6.1",
    "eslint": "^8.45.0",
    "prettier": "^3.0.0"
  },
  "engines": {
    "node": ">=16.0.0"
  }
}
```

## .env.example

```env
# Server Configuration
PORT=8000
HOST=0.0.0.0
NODE_ENV=development

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Add other environment variables as needed
# DATABASE_URL=postgresql://user:password@localhost:5432/dbname
# JWT_SECRET=your-secret-key
```

## Key Features:

1. **Modern ES6+ Modules**: Uses import/export syntax
2. **Comprehensive Error Handling**: Handles uncaught exceptions, unhandled rejections, and server startup errors
3. **Graceful Shutdown**: Properly handles SIGTERM and SIGINT signals
4. **Port Conflict Resolution**: Attempts alternative ports in development
5. **Security Middleware**: Helmet, CORS, rate limiting
6. **Development Features**: Morgan logging, relaxed CORS in dev mode
7. **Health Check Endpoint**: `/health` for monitoring
8. **Environment Configuration**: Flexible config via environment variables
9. **Clean Architecture**: Separated app logic from server startup
10. **Production Ready**: Includes compression, security headers, and proper logging

To run the application:

```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Production mode
npm run prod

# Standard start
npm start
```

This setup provides a robust, production-ready Node.js server entry point that follows modern best practices and handles common deployment scenarios.