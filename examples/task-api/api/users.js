/**
 * User Management and Authentication API Module
 * Framework: Express.js with JWT authentication
 * Security: bcrypt password hashing, input validation, sanitization
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');

// Assume external database module - replace with your actual DB implementation
const db = require('../database/users'); // { findByEmail, create, update, findById }

const router = express.Router();

// Environment variables with fallbacks (use proper env config in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

// ==================== VALIDATION SCHEMAS ====================

const registerSchema = Joi.object({
  email: Joi.string()
    .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net', 'org', 'edu', 'gov', 'mil'] } })
    .required()
    .lowercase()
    .trim()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .min(8)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    }),
  name: Joi.string()
    .min(2)
    .max(50)
    .pattern(new RegExp('^[a-zA-Z\\s]+$'))
    .required()
    .trim()
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 50 characters',
      'string.pattern.base': 'Name can only contain letters and spaces',
      'any.required': 'Name is required'
    })
});

const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .lowercase()
    .trim()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

const updateProfileSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(50)
    .pattern(new RegExp('^[a-zA-Z\\s]+$'))
    .trim()
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 50 characters',
      'string.pattern.base': 'Name can only contain letters and spaces'
    }),
  email: Joi.string()
    .email()
    .lowercase()
    .trim()
    .messages({
      'string.email': 'Please provide a valid email address'
    }),
  current_password: Joi.when('email', {
    is: Joi.exist(),
    then: Joi.string().required().messages({
      'any.required': 'Current password is required when changing email'
    }),
    otherwise: Joi.string().optional()
  })
}).min(1).messages({
  'object.min': 'At least one field (name or email) must be provided for update'
});

const changePasswordSchema = Joi.object({
  current_password: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required'
    }),
  new_password: Joi.string()
    .min(8)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters long',
      'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'New password is required'
    })
});

// ==================== UTILITY FUNCTIONS ====================

/**
 * Generate JWT token for authenticated user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  const payload = {
    userId: user.id,
    email: user.email,
    iat: Math.floor(Date.now() / 1000)
  };
  
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'api.users',
    audience: 'user-management'
  });
};

/**
 * Sanitize user object by removing sensitive fields
 * @param {Object} user - User object from database
 * @returns {Object} Sanitized user object
 */
const sanitizeUser = (user) => {
  const { password, password_hash, ...sanitizedUser } = user;
  return sanitizedUser;
};

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
};

// ==================== AUTHENTICATION MIDDLEWARE ====================

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user info to request object
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required',
        error: 'MISSING_TOKEN'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'api.users',
      audience: 'user-management'
    });

    // Fetch current user data from database
    const user = await db.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found',
        error: 'INVALID_TOKEN'
      });
    }

    // Attach sanitized user info to request
    req.user = sanitizeUser(user);
    next();

  } catch (error) {
    console.error(`[AUTH ERROR] ${error.message}`);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        error: 'INVALID_TOKEN'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: 'AUTH_ERROR'
    });
  }
};

// Apply request logging to all routes
router.use(requestLogger);

// Rate limiting placeholder - implement with express-rate-limit in production
// router.use('/login', rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 5 }));
// router.use('/register', rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 3 }));

// ==================== ROUTE HANDLERS ====================

/**
 * POST /api/users/register
 * Register a new user account
 */
router.post('/register', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path[0],
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const { email, password, name } = value;

    // Check if user already exists
    const existingUser = await db.findByEmail(email);
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
        error: 'EMAIL_EXISTS'
      });
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Create user in database
    const userData = {
      email,
      password_hash: passwordHash,
      name,
      created_at: new Date(),
      last_login: null,
      is_active: true
    };

    const newUser = await db.create(userData);
    
    // Generate JWT token
    const token = generateToken(newUser);
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: sanitizeUser(newUser),
        token,
        expires_in: JWT_EXPIRES_IN
      }
    });

    console.log(`[REGISTER SUCCESS] New user registered: ${email}`);

  } catch (error) {
    console.error(`[REGISTER ERROR] ${error.message}`, error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Registration failed due to server error',
      error: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/users/login
 * Authenticate user and return JWT token
 */
router.post('/login', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path[0],
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const { email, password } = value;

    // Find user by email
    const user = await db.findByEmail(email);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        error: 'INVALID_CREDENTIALS'
      });
    }

    // Check if user account is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.',
        error: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        error: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login timestamp
    await db.update(user.id, { last_login: new Date() });
    
    // Generate JWT token
    const token = generateToken(user);
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: sanitizeUser({ ...user, last_login: new Date() }),
        token,
        expires_in: JWT_EXPIRES_IN
      }
    });

    console.log(`[LOGIN SUCCESS] User logged in: ${email}`);

  } catch (error) {
    console.error(`[LOGIN ERROR] ${error.message}`, error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Login failed due to server error',
      error: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/users/me
 * Get current user profile (requires authentication)
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // User info is already attached by authenticateToken middleware
    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: req.user
      }
    });

  } catch (error) {
    console.error(`[GET PROFILE ERROR] ${error.message}`, error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile',
      error: 'INTERNAL_ERROR'
    });
  }
});

/**
 * PUT /api/users/me
 * Update current user profile (requires authentication)
 */
router.put('/me', authenticateToken, async (req, res) => {
  try {
    // Validate request body
    const { error, value } = updateProfileSchema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path[0],
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const { name, email, current_password } = value;
    const userId = req.user.id;

    // If email is being changed, verify current password
    if (email && email !== req.user.email) {
      if (!current_password) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required when changing email',
          error: 'PASSWORD_REQUIRED'
        });
      }

      // Get current user with password hash
      const currentUser = await db.findById(userId);
      const isPasswordValid = await bcrypt.compare(current_password, currentUser.password_hash);
      
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect',
          error: 'INVALID_PASSWORD'
        });
      }

      // Check if new email is already taken
      const existingUser = await db.findByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(409).json({
          success: false,
          message: 'Email is already in use by another account',
          error: 'EMAIL_EXISTS'
        });
      }
    }