/**
 * User Management and Authentication API Module
 * Provides complete user registration, authentication, and profile management
 * @module api.users
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';

const router = express.Router();

// Constants
const SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '24h';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// User Schema (assuming Mongoose model)
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
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

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

const User = mongoose.model('User', userSchema);

/**
 * Standard API response formatter
 * @param {boolean} success - Operation success status
 * @param {Object} data - Response data or error information
 * @returns {Object} Formatted response object
 */
const formatResponse = (success, data) => ({
  success,
  ...(success ? { data } : { error: data })
});

/**
 * Validation middleware for user registration
 */
export const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters')
];

/**
 * Validation middleware for user login
 */
export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

/**
 * Validation middleware for profile updates
 */
export const validateProfileUpdate = [
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be less than 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be less than 50 characters'),
  body('currentPassword')
    .if(body('email').exists())
    .notEmpty()
    .withMessage('Current password is required when changing email address')
];

/**
 * Validation middleware for password change
 */
export const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    })
];

/**
 * Middleware to handle validation errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().reduce((acc, error) => {
      acc[error.path] = error.msg;
      return acc;
    }, {});
    
    return res.status(400).json(formatResponse(false, {
      message: 'Validation failed',
      fields: errorMessages
    }));
  }
  next();
};

/**
 * Authentication middleware to verify JWT tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json(formatResponse(false, {
        message: 'Access token required'
      }));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json(formatResponse(false, {
        message: 'Invalid token - user not found'
      }));
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json(formatResponse(false, {
        message: 'Invalid token'
      }));
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json(formatResponse(false, {
        message: 'Token expired'
      }));
    }
    
    console.error('Authentication error:', error);
    return res.status(500).json(formatResponse(false, {
      message: 'Authentication service error'
    }));
  }
};

/**
 * Generate JWT token for user
 * @param {string} userId - User ID
 * @returns {string} JWT token
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
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
 * POST /api/users/register
 * Register a new user with email uniqueness check
 * Rate limiting recommended: 5 requests per 15 minutes per IP
 */
router.post('/register', 
  validateRegistration,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json(formatResponse(false, {
          message: 'Email address is already registered',
          field: 'email'
        }));
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create new user
      const user = new User({
        email,
        password: hashedPassword,
        firstName,
        lastName
      });

      await user.save();

      // Generate token
      const token = generateToken(user._id);

      res.status(201).json(formatResponse(true, {
        message: 'User registered successfully',
        user: user.toJSON(),
        token
      }));

    } catch (error) {
      console.error('Registration error:', error);
      
      // Handle MongoDB duplicate key error
      if (error.code === 11000) {
        return res.status(409).json(formatResponse(false, {
          message: 'Email address is already registered',
          field: 'email'
        }));
      }

      res.status(500).json(formatResponse(false, {
        message: 'Registration failed due to server error'
      }));
    }
  }
);

/**
 * POST /api/users/login
 * Authenticate user with password verification
 * Rate limiting recommended: 10 requests per 15 minutes per IP
 */
router.post('/login',
  validateLogin,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json(formatResponse(false, {
          message: 'Invalid email or password'
        }));
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json(formatResponse(false, {
          message: 'Invalid email or password'
        }));
      }

      // Update last login timestamp
      user.lastLogin = new Date();
      await user.save();

      // Generate token
      const token = generateToken(user._id);

      res.json(formatResponse(true, {
        message: 'Login successful',
        user: user.toJSON(),
        token
      }));

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json(formatResponse(false, {
        message: 'Login failed due to server error'
      }));
    }
  }
);

/**
 * GET /api/users/me
 * Get authenticated user profile
 */
router.get('/me',
  authenticateToken,
  async (req, res) => {
    try {
      res.json(formatResponse(true, {
        user: req.user.toJSON()
      }));
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json(formatResponse(false, {
        message: 'Failed to retrieve user profile'
      }));
    }
  }
);

/**
 * PUT /api/users/me
 * Update user profile with email change validation
 */
router.put('/me',
  authenticateToken,
  validateProfileUpdate,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, firstName, lastName, currentPassword } = req.body;
      const user = req.user;

      // If email is being changed, verify current password
      if (email && email !== user.email) {
        if (!currentPassword) {
          return res.status(400).json(formatResponse(false, {
            message: 'Current password is required when changing email address',
            field: 'currentPassword'
          }));
        }

        // Verify current password
        const userWithPassword = await User.findById(user._id).select('+password');
        const isValidPassword = await comparePassword(currentPassword, userWithPassword.password);
        
        if (!isValidPassword) {
          return res.status(401).json(formatResponse(false, {
            message: 'Current password is incorrect',
            field: 'currentPassword'
          }));
        }

        // Check if new email is already taken
        const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
        if (existingUser) {
          return res.status(409).json(formatResponse(false, {
            message: 'Email address is already in use',
            field: 'email'
          }));
        }
      }

      // Update user fields
      const updateFields = {};
      if (email) updateFields.email = email;
      if (firstName) updateFields.firstName = firstName;
      if (lastName) updateFields.lastName = lastName;
      updateFields.updatedAt = new Date();

      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        updateFields,
        { new: true, runValidators: true }
      );

      res.json(formatResponse(true, {
        message: 'Profile updated successfully',
        user: updatedUser.toJSON()
      }));

    } catch (error) {
      console.error('Profile update error:', error);
      
      // Handle MongoDB duplicate key error
      if (error.code === 11000) {
        return res.status(409).json(formatResponse(false, {
          message: 'Email address is already in use',
          field: 'email'
        }));
      }

      res.status(500).json(formatResponse(false, {
        message: 'Profile update failed due to server error'
      }));
    }
  }
);

/**
 * POST /api/users/change-password
 * Change password with current password verification
 * Rate limiting recommended: 5 requests per hour per user
 */
router.post('/change-password',
  authenticateToken,
  validatePasswordChange,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user._id;

      // Get user with password
      const user = await User.findById(userId).select('+password');
      if (!user) {
        return res.status(404).json(formatResponse(false, {
          message: 'User not found'
        }));
      }

      // Verify current password
      const isValidPassword = await comparePassword(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json(formatResponse(false, {
          message: 'Current password is incorrect',
          field: 'currentPassword'
        }));
      }

      // Check if new password is different from current
      const isSamePassword = await comparePassword(newPassword, user.password);
      if (isSamePassword) {
        return res.status(400).json(formatResponse(false, {
          message: 'New password must be different from current password',
          field: 'newPassword'
        }));
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);

      // Update password
      await User.findByIdAndUpdate(userId, {
        password: hashedNewPassword,
        updatedAt: new Date()
      });

      res.json(formatResponse(true, {
        message: 'Password changed successfully'
      }));