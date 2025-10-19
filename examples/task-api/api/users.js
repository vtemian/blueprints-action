/**
 * User Management and Authentication API Module
 * Complete production-ready implementation with Express.js
 * 
 * @module api.users
 * @requires express
 * @requires bcrypt
 * @requires jsonwebtoken
 * @requires express-validator
 * @requires mongoose
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

// Environment configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_SALT_ROUNDS = 12;

/**
 * User Schema Definition
 */
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  lastLogin: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update updatedAt
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const User = mongoose.model('User', userSchema);

// Create Express router
const router = express.Router();

/**
 * Rate limiting configuration
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  }
});

/**
 * Validation schemas
 */
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .if(body('email').exists())
    .notEmpty()
    .withMessage('Password confirmation is required when changing email')
];

const changePasswordValidation = [
  body('current_password')
    .notEmpty()
    .withMessage('Current password is required'),
  body('new_password')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
];

/**
 * Utility Functions
 */

/**
 * Generate JWT token for user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user._id, 
      email: user.email 
    },
    JWT_SECRET,
    { 
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'user-api',
      audience: 'user-client'
    }
  );
};

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
  return await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
};

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} Comparison result
 */
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Format user object for response (exclude sensitive data)
 * @param {Object} user - User document
 * @returns {Object} Sanitized user object
 */
const formatUserResponse = (user) => {
  const { password, __v, ...userResponse } = user.toObject();
  return userResponse;
};

/**
 * Handle validation errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {boolean} True if errors exist
 */
const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg
      }))
    });
  }
  return false;
};

/**
 * Authentication Middleware
 */

/**
 * JWT Authentication middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'user-api',
      audience: 'user-client'
    });

    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }
    
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Route Handlers
 */

/**
 * POST /api/users/register
 * Register a new user
 */
router.post('/register', authLimiter, registerValidation, async (req, res) => {
  try {
    // Handle validation errors
    if (handleValidationErrors(req, res)) return;

    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create new user
    const user = new User({
      name,
      email,
      password: hashedPassword
    });

    await user.save();

    // Generate token
    const token = generateToken(user);

    // Return success response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: formatUserResponse(user),
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle duplicate key error (additional safety net)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
});

/**
 * POST /api/users/login
 * Authenticate user and return token
 */
router.post('/login', authLimiter, loginValidation, async (req, res) => {
  try {
    // Handle validation errors
    if (handleValidationErrors(req, res)) return;

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    
    // Use consistent timing to prevent timing attacks
    const isValidPassword = user ? 
      await comparePassword(password, user.password) : 
      await bcrypt.compare(password, '$2b$12$dummy.hash.to.prevent.timing.attacks');

    if (!user || !isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      data: formatUserResponse(user),
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get('/me', generalLimiter, authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      data: formatUserResponse(req.user)
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user profile'
    });
  }
});

/**
 * PUT /api/users/me
 * Update current user profile
 */
router.put('/me', generalLimiter, authenticateToken, updateProfileValidation, async (req, res) => {
  try {
    // Handle validation errors
    if (handleValidationErrors(req, res)) return;

    const { name, email, password } = req.body;
    const user = req.user;

    // If email is being changed, verify password
    if (email && email !== user.email) {
      if (!password) {
        return res.status(400).json({
          success: false,
          message: 'Password confirmation is required when changing email'
        });
      }

      const currentUser = await User.findById(user._id);
      const isValidPassword = await comparePassword(password, currentUser.password);
      
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Check if new email is already taken
      const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'This email is already associated with another account'
        });
      }
    }

    // Update user fields
    const updateFields = {};
    if (name) updateFields.name = name;
    if (email) updateFields.email = email;

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      updateFields,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: formatUserResponse(updatedUser)
    });

  } catch (error) {
    console.error('Update profile error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This email is already associated with another account'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update profile. Please try again.'
    });
  }
});

/**
 * POST /api/users/change-password
 * Change user password
 */
router.post('/change-password', generalLimiter, authenticateToken, changePasswordValidation, async (req, res) => {
  try {
    // Handle validation errors
    if (handleValidationErrors(req, res)) return;

    const { current_password, new_password } = req.body;
    const userId = req.user._id;

    // Get user with password
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isValidPassword = await comparePassword(current_password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is different from current
    const isSamePassword = await comparePassword(new_password, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Hash new password and update
    const hashedNewPassword = await hashPassword(new_