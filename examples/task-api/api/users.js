/**
 * User Management and Authentication API Module
 * Production-ready Express.js router with comprehensive security measures
 * @module api.users
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';

// Database model - adjust import based on your ORM choice
// For Mongoose: import User from '../models/User.js';
// For Prisma: import { PrismaClient } from '@prisma/client';

const router = express.Router();
const SALT_ROUNDS = 12;

// Environment variables validation
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts, please try again later',
    status: 429
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Standardized error response formatter
 * @param {string} error - Error code
 * @param {string} message - Human readable message
 * @param {number} status - HTTP status code
 * @returns {Object} Formatted error response
 */
const createErrorResponse = (error, message, status) => ({
  success: false,
  error,
  message,
  status
});

/**
 * Standardized success response formatter
 * @param {Object} data - Response data
 * @param {string} message - Success message
 * @returns {Object} Formatted success response
 */
const createSuccessResponse = (data, message = 'Operation successful') => ({
  success: true,
  data,
  message
});

/**
 * Generate JWT token for user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  const payload = {
    id: user._id || user.id,
    email: user.email,
    iat: Math.floor(Date.now() / 1000)
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Sanitize user object by removing sensitive fields
 * @param {Object} user - User object
 * @returns {Object} Sanitized user object
 */
const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.password;
  delete userObj.__v;
  return userObj;
};

/**
 * JWT Authentication Middleware
 * Validates JWT token and attaches user to request
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json(
        createErrorResponse('MISSING_TOKEN', 'Access token is required', 401)
      );
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch user from database to ensure they still exist
    // Adjust based on your ORM:
    // For Mongoose: const user = await User.findById(decoded.id);
    // For Prisma: const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    
    if (!user) {
      return res.status(401).json(
        createErrorResponse('INVALID_TOKEN', 'User not found', 401)
      );
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json(
        createErrorResponse('TOKEN_EXPIRED', 'Token has expired', 401)
      );
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json(
        createErrorResponse('INVALID_TOKEN', 'Invalid token', 401)
      );
    }

    return res.status(500).json(
      createErrorResponse('AUTH_ERROR', 'Authentication failed', 500)
    );
  }
};

/**
 * Validation middleware for user registration
 */
const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces')
];

/**
 * Validation middleware for user login
 */
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

/**
 * Validation middleware for profile update
 */
const validateProfileUpdate = [
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('current_password')
    .if(body('email').exists())
    .notEmpty()
    .withMessage('Current password is required when changing email')
];

/**
 * Validation middleware for password change
 */
const validatePasswordChange = [
  body('current_password')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('new_password')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
];

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg).join(', ');
    return res.status(400).json(
      createErrorResponse('VALIDATION_ERROR', errorMessages, 400)
    );
  }
  next();
};

/**
 * POST /api/users/register
 * Register a new user account
 */
router.post('/register', authLimiter, validateRegistration, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Check if user already exists
    // Adjust based on your ORM:
    // For Mongoose: const existingUser = await User.findOne({ email });
    // For Prisma: const existingUser = await prisma.user.findUnique({ where: { email } });
    
    if (existingUser) {
      console.log(`Registration attempt with existing email: ${email}`);
      return res.status(409).json(
        createErrorResponse('EMAIL_EXISTS', 'An account with this email already exists', 409)
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    // Adjust based on your ORM:
    // For Mongoose:
    // const user = new User({
    //   email,
    //   password: hashedPassword,
    //   name: name.trim(),
    //   createdAt: new Date(),
    //   lastLogin: null
    // });
    // await user.save();

    // For Prisma:
    // const user = await prisma.user.create({
    //   data: {
    //     email,
    //     password: hashedPassword,
    //     name: name.trim(),
    //     createdAt: new Date(),
    //     lastLogin: null
    //   }
    // });

    // Generate JWT token
    const token = generateToken(user);
    
    // Return sanitized user data with token
    const sanitizedUser = sanitizeUser(user);
    
    console.log(`New user registered: ${email}`);
    
    res.status(201).json(
      createSuccessResponse(
        { user: sanitizedUser, token },
        'Account created successfully'
      )
    );

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle database constraint errors
    if (error.code === 11000 || error.code === 'P2002') {
      return res.status(409).json(
        createErrorResponse('EMAIL_EXISTS', 'An account with this email already exists', 409)
      );
    }

    res.status(500).json(
      createErrorResponse('REGISTRATION_ERROR', 'Failed to create account', 500)
    );
  }
});

/**
 * POST /api/users/login
 * Authenticate user and return JWT token
 */
router.post('/login', authLimiter, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    // Adjust based on your ORM:
    // For Mongoose: const user = await User.findOne({ email });
    // For Prisma: const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      console.log(`Login attempt with non-existent email: ${email}`);
      return res.status(401).json(
        createErrorResponse('INVALID_CREDENTIALS', 'Invalid email or password', 401)
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      console.log(`Failed login attempt for email: ${email}`);
      return res.status(401).json(
        createErrorResponse('INVALID_CREDENTIALS', 'Invalid email or password', 401)
      );
    }

    // Update last login timestamp
    // Adjust based on your ORM:
    // For Mongoose: await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
    // For Prisma: await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    // Generate JWT token
    const token = generateToken(user);
    
    // Return sanitized user data with token
    const sanitizedUser = sanitizeUser(user);
    sanitizedUser.lastLogin = new Date();
    
    console.log(`Successful login for email: ${email}`);
    
    res.json(
      createSuccessResponse(
        { user: sanitizedUser, token },
        'Login successful'
      )
    );

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(
      createErrorResponse('LOGIN_ERROR', 'Login failed', 500)
    );
  }
});

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const sanitizedUser = sanitizeUser(req.user);
    
    res.json(
      createSuccessResponse(sanitizedUser, 'Profile retrieved successfully')
    );

  } catch (error) {
    console.error('Profile retrieval error:', error);
    res.status(500).json(
      createErrorResponse('PROFILE_ERROR', 'Failed to retrieve profile', 500)
    );
  }
});

/**
 * PUT /api/users/me
 * Update current user profile
 */
router.put('/me', authenticateToken, validateProfileUpdate, handleValidationErrors, async (req, res) => {
  try {
    const { email, name, current_password } = req.body;
    const userId = req.user._id || req.user.id;
    const updateData = {};

    // If email is being changed, verify current password
    if (email && email !== req.user.email) {
      if (!current_password) {
        return res.status(400).json(
          createErrorResponse('PASSWORD_REQUIRED', 'Current password is required to change email', 400)
        );
      }

      const isPasswordValid = await bcrypt.compare(current_password, req.user.password);
      if (!isPasswordValid) {
        return res.status(401).json(
          createErrorResponse('INVALID_PASSWORD', 'Current password is incorrect', 401)
        );
      }

      // Check if new email is already taken
      // Adjust based on your ORM:
      // For Mongoose: const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      // For Prisma: const existingUser = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
      
      if (existingUser) {
        return res.status(409).json(
          createErrorResponse('EMAIL_EXISTS', 'This email is already in use', 409)
        );
      }

      updateData.email = email;
    }

    if (name && name.trim() !== req.user.name) {
      updateData.name = name.trim();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json(
        createErrorResponse('NO_CHANGES', 'No changes provided', 400)
      );
    }

    updateData.updatedAt = new Date();

    // Update user
    // Adjust based on your ORM:
    // For Mongoose: const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
    // For Prisma: const updatedUser = await prisma.user.update({ where: { id: userId }, data: updateData });

    const sanitizedUser = sanitizeUser(updatedUser);
    
    console.log(`Profile updated for user: ${req.user.email}`);
    
    res.json(
      createSuccessResponse(sanitizedUser, 'Profile updated successfully')
    );

  } catch (error) {
    console.error('Profile update error:', error);
    
    if (error.code === 11000 || error.code === 'P2002') {
      return res.status