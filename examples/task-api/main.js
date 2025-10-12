I'll create a Node.js server application using Express.js that mirrors FastAPI functionality. Here's the complete implementation:

## Main Entry Point (server.js)

```javascript
/**
 * Express.js Server Entry Point
 * Equivalent to Python FastAPI uvicorn server configuration
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import app from './app/index.js';

// Environment configuration with defaults
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV === 'development';

// Create HTTP server instance
const server = createServer(app);

/**
 * Configure Express middleware for production readiness
 */
function configureMiddleware() {
    // Security middleware
    app.use(helmet({
        contentSecurityPolicy: isDevelopment ? false : undefined,
    }));
    
    // CORS configuration
    app.use(cors({
        origin: isDevelopment ? true : process.env.ALLOWED_ORIGINS?.split(',') || false,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));
    
    // Compression middleware
    app.use(compression());
    
    // Request parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Development-specific middleware
    if (isDevelopment) {
        // Request logging in development
        app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }
}

/**
 * Global error handler
 */
function configureErrorHandling() {
    // 404 handler
    app.use('*', (req, res) => {
        res.status(404).json({
            error: 'Not Found',
            message: `Route ${req.method} ${req.originalUrl} not found`,
            timestamp: new Date().toISOString(),
        });
    });
    
    // Global error handler
    app.use((err, req, res, next) => {
        console.error('Unhandled error:', err);
        
        const statusCode = err.statusCode || err.status || 500;
        const message = isDevelopment ? err.message : 'Internal Server Error';
        
        res.status(statusCode).json({
            error: 'Server Error',
            message,
            ...(isDevelopment && { stack: err.stack }),
            timestamp: new Date().toISOString(),
        });
    });
}

/**
 * Handle server startup errors gracefully
 */
function handleServerErrors() {
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${PORT} is already in use`);
            console.log('💡 Try using a different port with: PORT=3001 npm start');
            process.exit(1);
        } else if (error.code === 'EACCES') {
            console.error(`❌ Permission denied to bind to port ${PORT}`);
            console.log('💡 Try using a port number above 1024 or run with sudo');
            process.exit(1);
        } else {
            console.error('❌ Server startup error:', error);
            process.exit(1);
        }
    });
}

/**
 * Graceful shutdown handling
 */
function configureGracefulShutdown() {
    const gracefulShutdown = (signal) => {
        console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);
        
        server.close((err) => {
            if (err) {
                console.error('❌ Error during server shutdown:', err);
                process.exit(1);
            }
            
            console.log('✅ Server closed successfully');
            
            // Close database connections, cleanup resources, etc.
            // Add your cleanup logic here
            
            console.log('🔄 Cleanup completed');
            process.exit(0);
        });
        
        // Force shutdown after 10 seconds
        setTimeout(() => {
            console.error('⚠️  Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    };
    
    // Handle different termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('💥 Uncaught Exception:', error);
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
        gracefulShutdown('UNHANDLED_REJECTION');
    });
}

/**
 * Start the server
 */
async function startServer() {
    try {
        // Configure middleware and error handling
        configureMiddleware();
        configureErrorHandling();
        handleServerErrors();
        configureGracefulShutdown();
        
        // Start listening
        server.listen(PORT, HOST, () => {
            console.log('🚀 Server Configuration:');
            console.log(`   ├─ Environment: ${NODE_ENV}`);
            console.log(`   ├─ Host: ${HOST}`);
            console.log(`   ├─ Port: ${PORT}`);
            console.log(`   └─ URL: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
            
            if (isDevelopment) {
                console.log('🔧 Development mode features enabled:');
                console.log('   ├─ Request logging');
                console.log('   ├─ Detailed error messages');
                console.log('   └─ Relaxed CORS policy');
                console.log('\n💡 Use nodemon for auto-reload: npm run dev');
            }
            
            console.log('\n✅ Server is ready to accept connections');
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

export default server;
```

## App Module (app/index.js)

```javascript
/**
 * Main Express Application
 * Equivalent to FastAPI app instance
 */

import express from 'express';
import apiRoutes from './routes/index.js';

const app = express();

// Health check endpoint (equivalent to FastAPI automatic /docs)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
    });
});

// API routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Express.js API Server',
        documentation: '/api/docs',
        health: '/health',
        timestamp: new Date().toISOString(),
    });
});

export default app;
```

## Example Routes (app/routes/index.js)

```javascript
/**
 * API Routes
 */

import express from 'express';

const router = express.Router();

// Example route equivalent to FastAPI endpoint
router.get('/users', async (req, res) => {
    try {
        // Your business logic here
        const users = [
            { id: 1, name: 'John Doe', email: 'john@example.com' },
            { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
        ];
        
        res.json({
            data: users,
            count: users.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch users',
            message: error.message,
        });
    }
});

// Example POST route
router.post('/users', async (req, res) => {
    try {
        const { name, email } = req.body;
        
        // Validation
        if (!name || !email) {
            return res.status(400).json({
                error: 'Validation Error',
                message: 'Name and email are required',
            });
        }
        
        // Your business logic here
        const newUser = {
            id: Date.now(),
            name,
            email,
            createdAt: new Date().toISOString(),
        };
        
        res.status(201).json({
            data: newUser,
            message: 'User created successfully',
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to create user',
            message: error.message,
        });
    }
});

export default router;
```

## Package.json

```json
{
  "name": "express-fastapi-equivalent",
  "version": "1.0.0",
  "description": "Express.js server equivalent to FastAPI application",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "compression": "^1.7.4"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "eslint": "^8.55.0",
    "jest": "^29.7.0"
  },
  "engines": {
    "node": ">=16.0.0",
    "npm": ">=8.0.0"
  },
  "keywords": [
    "express",
    "nodejs",
    "api",
    "server",
    "fastapi-equivalent"
  ]
}
```

## Environment Configuration (.env.example)

```bash
# Server Configuration
NODE_ENV=development
PORT=8000
HOST=0.0.0.0

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Database (example)
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Security
JWT_SECRET=your-super-secret-jwt-key
```

## Development Script (nodemon.json)

```json
{
  "watch": ["app", "server.js"],
  "ext": "js,json",
  "ignore": ["node_modules", "*.test.js"],
  "env": {
    "NODE_ENV": "development"
  },
  "delay": "1000"
}
```

## Installation and Usage

```bash
# Install dependencies
npm install

# Development mode (with auto-reload)
npm run dev

# Production mode
npm start

# With custom port
PORT=3001 npm start

# With environment file
cp .env.example .env
# Edit .env with your configuration
npm start
```

## Key Features Implemented

1. **FastAPI Equivalent Features:**
   - Auto-reload in development (via nodemon)
   - Host and port configuration
   - Health check endpoint
   - Structured error responses
   - Environment-based configuration

2. **Production Ready:**
   - Graceful shutdown handling
   - Security middleware (Helmet)
   - CORS configuration
   - Request compression
   - Error handling
   - Process signal handling

3. **Development Features:**
   - Request logging
   - Detailed error messages
   - Hot reload with nodemon
   - Environment variable support

4. **Container Compatible:**
   - Listens on 0.0.0.0 by default
   - Proper signal handling for Docker
   - Health check endpoint
   - Graceful shutdown

This implementation provides a robust, production-ready Express.js server that mirrors the functionality and ease of use of a FastAPI application.