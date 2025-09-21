I'll provide a complete implementation of the user management and authentication API module. Here's the full code structure:

## Package.json

```json
{
  "name": "user-auth-api",
  "version": "1.0.0",
  "description": "User management and authentication API",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "express-validator": "^7.0.1",
    "express-rate-limit": "^6.10.0",
    "helmet": "^7.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

## .env

```env
NODE_ENV=development
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=12
```

## server.js

```javascript
/**
 * Main server file for User Authentication API
 * @author Your Name
 * @version 1.0.0
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const userRoutes = require('./routes/users');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});

app.use(limiter);

// Logging middleware
app.use(morgan('combined', {
  skip: (req, res) => {
    // Don't log sensitive endpoints in production
    return process.env.NODE_ENV === 'production' && 
           (req.url.includes('/login') || req.url.includes('/register'));
  }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;
```

## models/User.js

```javascript
/**
 * User model with in-memory storage simulation
 * In production, this would be replaced with actual database models
 * @module models/User
 */

/**
 * In-memory user storage (replace with actual database in production)
 */
let users = [];
let nextId = 1;

/**
 * User class representing user entity
 */
class User {
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {string} userData.name - User's full name
   * @param {string} userData.email - User's email address
   * @param {string} userData.password - User's hashed password
   */
  constructor({ name, email, password }) {
    this.id = nextId++;
    this.name = name;
    this.email = email.toLowerCase();
    this.password = password;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.lastLogin = null;
  }

  /**
   * Convert user to JSON, excluding sensitive fields
   * @param {boolean} includeSensitive - Whether to include sensitive data
   * @returns {Object} User object without sensitive data
   */
  toJSON(includeSensitive = false) {
    const userObj = { ...this };
    if (!includeSensitive) {
      delete userObj.password;
    }
    return userObj;
  }

  /**
   * Update user data
   * @param {Object} updateData - Data to update
   */
  update(updateData) {
    Object.assign(this, updateData);
    this.updatedAt = new Date();
  }
}

/**
 * User repository methods
 */
const UserModel = {
  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {User|null} User object or null
   */
  findByEmail: async (email) => {
    return users.find(user => user.email === email.toLowerCase()) || null;
  },

  /**
   * Find user by ID
   * @param {number} id - User ID
   * @returns {User|null} User object or null
   */
  findById: async (id) => {
    return users.find(user => user.id === parseInt(id)) || null;
  },

  /**
   * Create new user
   * @param {Object} userData - User data
   * @returns {User} Created user object
   */
  create: async (userData) => {
    const user = new User(userData);
    users.push(user);
    return user;
  },

  /**
   * Update user by ID
   * @param {number} id - User ID
   * @param {Object} updateData - Data to update
   * @returns {User|null} Updated user or null
   */
  updateById: async (id, updateData) => {
    const user = await UserModel.findById(id);
    if (user) {
      user.update(updateData);
      return user;
    }
    return null;
  },

  /**
   * Delete user by ID
   * @param {number} id - User ID
   * @returns {boolean} Success status
   */
  deleteById: async (id) => {
    const index = users.findIndex(user => user.id === parseInt(id));
    if (index !== -1) {
      users.splice(index, 1);
      return true;
    }
    return false;
  }
};

module.exports = { User, UserModel };
```

## utils/errors.js

```javascript
/**
 * Custom error classes for the application
 * @module utils/errors
 */

/**
 * Base application error class
 */
class AppError extends Error {
  /**
   * Create an application error
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {boolean} isOperational - Whether error is operational
   */
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error class
 */
class ValidationError extends AppError {
  /**
   * Create a validation error
   * @param {string} message - Error message
   * @param {Array} errors - Validation errors array
   */
  constructor(message, errors = []) {
    super(message, 400);
    this.errors = errors;
  }
}

/**
 * Authentication error class
 */
class AuthenticationError extends AppError {
  /**
   * Create an authentication error
   * @param {string} message - Error message
   */
  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

/**
 * Authorization error class
 */
class AuthorizationError extends AppError {
  /**
   * Create an authorization error
   * @param {string} message - Error message
   */
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

/**
 * Not found error class
 */
class NotFoundError extends AppError {
  /**
   * Create a not found error
   * @param {string} message - Error message
   */
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * Conflict error class
 */
class ConflictError extends AppError {
  /**
   * Create a conflict error
   * @param {string} message - Error message
   */
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError
};
```

## middleware/errorMiddleware.js

```javascript
/**
 * Error handling middleware
 * @module middleware/errorMiddleware
 */

const { AppError } = require('../utils/errors');

/**
 * Handle 404 not found errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const notFound = (req, res, next) => {
  const error = new AppError(`Not found - ${req.originalUrl}`, 404);
  next(error);
};

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error (exclude sensitive information)
  if (process.env.NODE_ENV === 'development') {
    console.error(err);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new AppError(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = new AppError(message, 409);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = new AppError(message, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new AppError(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new AppError(message, 401);
  }

  const response = {
    success: false,
    message: error.message || 'Server Error'
  };

  // Include validation errors if present
  if (error.errors) {
    response.errors = error.errors;
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(error.statusCode || 500).json(response);
};

module.exports = {
  notFound,
  errorHandler
};
```

## middleware/auth.js

```javascript
/**
 * Authentication middleware
 * @module middleware/auth
 */

const jwt = require('jsonwebtoken');
const { UserModel } = require('../models/User');
const { AuthenticationError } = require('../utils/errors');

/**
 * JWT authentication middleware
 * Verifies JWT token and adds user to request object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check for token in cookies (if using cookie-based auth)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      throw new AuthenticationError('Access denied. No token provided.');
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const user = await UserModel.findById(decoded.id);
      
      if (!user) {
        throw new AuthenticationError('Token is valid but user no longer exists.');
      }

      // Add user to request object (exclude password)
      req.user = user.toJSON();
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        throw new AuthenticationError('Token has expired.');
      } else if (jwtError.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid token.');
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Generate JWT token for user
 * @param {number} userId - User ID
 * @returns {string} JWT token
 */
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'user-auth-api',
      audience: 'user-auth-api-users'
    }
  );
};

/**
 * Optional authentication middleware
 * Similar to authenticate but doesn't throw error if no token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await UserModel.findById(decoded.id);
        
        if (user) {
          req.user = user.toJSON();
        }
      } catch (jwtError) {
        // Silently fail for optional auth
        console.log('Optional auth failed:', jwtError.message);
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  generateToken,
  optionalAuth
};
```

## middleware/validation.js

```javascript
/**
 * Validation middleware using express-validator
 * @module middleware/