Here's a complete JavaScript/Node.js equivalent of a Python FastAPI application entry point:

## main.js (Entry Point)

```javascript
import app from './app.js';
import { createServer } from 'http';

// Configuration with environment variable overrides
const CONFIG = {
    port: parseInt(process.env.PORT) || 8000,
    host: process.env.HOST || '0.0.0.0',
    isDevelopment: process.env.NODE_ENV !== 'production'
};

// Validate port number
function validatePort(port) {
    if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port number: ${port}. Port must be between 1 and 65535.`);
    }
    return port;
}

// Enhanced error handler for server startup
function handleServerError(error) {
    const { port, host } = CONFIG;
    
    switch (error.code) {
        case 'EADDRINUSE':
            console.error(`❌ Error: Port ${port} is already in use`);
            console.error(`   Try using a different port: PORT=3000 node main.js`);
            break;
        case 'EACCES':
            console.error(`❌ Error: Permission denied to bind to ${host}:${port}`);
            console.error(`   Try using a port number above 1024 or run with elevated privileges`);
            break;
        case 'ENOTFOUND':
            console.error(`❌ Error: Host ${host} not found`);
            break;
        case 'ECONNREFUSED':
            console.error(`❌ Error: Connection refused on ${host}:${port}`);
            break;
        default:
            console.error(`❌ Server startup error:`, error.message);
            console.error(`   Code: ${error.code || 'UNKNOWN'}`);
    }
    
    console.error(`\n🔧 Troubleshooting tips:`);
    console.error(`   • Check if another process is using port ${port}: lsof -i :${port}`);
    console.error(`   • Try a different port: PORT=3001 node main.js`);
    console.error(`   • Ensure you have proper network permissions\n`);
    
    process.exit(1);
}

// Graceful shutdown handler
function setupGracefulShutdown(server) {
    const shutdown = (signal) => {
        console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
        
        server.close((err) => {
            if (err) {
                console.error('❌ Error during server shutdown:', err.message);
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
    };
    
    // Handle different termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('💥 Uncaught Exception:', error);
        shutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
        shutdown('UNHANDLED_REJECTION');
    });
}

// Development mode features
function setupDevelopmentMode() {
    if (!CONFIG.isDevelopment) return;
    
    console.log('🔧 Development mode enabled');
    
    // Enhanced logging for development
    app.use((req, res, next) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${req.method} ${req.url}`);
        next();
    });
    
    // Development error handler with detailed stack traces
    app.use((err, req, res, next) => {
        console.error('💥 Development Error:', err.stack);
        res.status(500).json({
            error: err.message,
            stack: err.stack,
            timestamp: new Date().toISOString()
        });
    });
}

// Main server startup function
async function startServer() {
    try {
        // Validate configuration
        const port = validatePort(CONFIG.port);
        const { host, isDevelopment } = CONFIG;
        
        console.log('🚀 Starting server...');
        console.log(`📊 Environment: ${isDevelopment ? 'development' : 'production'}`);
        console.log(`🌐 Host: ${host}`);
        console.log(`🔌 Port: ${port}`);
        
        // Setup development features
        setupDevelopmentMode();
        
        // Create HTTP server
        const server = createServer(app);
        
        // Setup graceful shutdown
        setupGracefulShutdown(server);
        
        // Start listening
        server.listen(port, host, () => {
            console.log('\n✅ Server started successfully!');
            console.log(`🌍 Server running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
            
            if (isDevelopment) {
                console.log('🔄 Auto-reload enabled (restart server to see changes)');
                console.log('📝 Detailed logging enabled');
            }
            
            console.log('\n📋 Available endpoints:');
            console.log(`   • Health check: http://localhost:${port}/health`);
            console.log(`   • API docs: http://localhost:${port}/docs`);
            console.log('\n⏹️  Press Ctrl+C to stop the server\n');
        });
        
        // Handle server errors
        server.on('error', handleServerError);
        
        // Handle client errors
        server.on('clientError', (err, socket) => {
            console.warn('⚠️  Client error:', err.message);
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        });
        
    } catch (error) {
        console.error('💥 Failed to start server:', error.message);
        process.exit(1);
    }
}

// Start the server
startServer().catch((error) => {
    console.error('💥 Unexpected error during server startup:', error);
    process.exit(1);
});
```

## app.js (Express Application)

```javascript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : true,
    credentials: true
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint (equivalent to FastAPI's automatic health check)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API documentation endpoint
app.get('/docs', (req, res) => {
    res.json({
        message: 'API Documentation',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            docs: '/docs'
        }
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to the API',
        version: '1.0.0',
        documentation: '/docs'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((err, req, res, next) => {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    console.error('💥 Error:', err.message);
    
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(isDevelopment && { stack: err.stack }),
        timestamp: new Date().toISOString()
    });
});

export default app;
```

## package.json

```json
{
  "name": "express-fastapi-equivalent",
  "version": "1.0.0",
  "type": "module",
  "description": "Express.js equivalent of FastAPI application",
  "main": "main.js",
  "scripts": {
    "start": "node main.js",
    "dev": "NODE_ENV=development nodemon main.js",
    "prod": "NODE_ENV=production node main.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "compression": "^1.7.4"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "engines": {
    "node": ">=16.0.0"
  }
}
```

## Usage Examples

### Basic startup:
```bash
node main.js
```

### Development mode with auto-reload:
```bash
npm run dev
```

### Production mode:
```bash
npm run prod
```

### Custom port and host:
```bash
PORT=3000 HOST=127.0.0.1 node main.js
```

## Key Features

1. **FastAPI Equivalent**: Mirrors FastAPI's functionality with Express.js
2. **Container Ready**: Uses `0.0.0.0` host for Docker compatibility
3. **Development Mode**: Auto-reload equivalent with enhanced logging
4. **Error Handling**: Comprehensive error handling for all common scenarios
5. **Graceful Shutdown**: Proper cleanup on SIGTERM/SIGINT
6. **Environment Support**: Development vs production configuration
7. **Security**: Includes helmet, CORS, and compression middleware
8. **Health Checks**: Built-in health and documentation endpoints

This implementation provides a production-ready Express.js server that closely matches the functionality and robustness of a FastAPI application.