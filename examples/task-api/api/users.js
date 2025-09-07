/**
 * User Management and Authentication API Module
 * Provides comprehensive user registration, authentication, and profile management
 * 
 * @author Senior JavaScript Developer
 * @version 1.0.0
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Environment variables - should be loaded from .env file
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/userauth';
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Database Connection Setup
 * MongoDB connection with proper error handling
 */
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

/**
 * User Schema Definition
 * Defines the structure for user documents in MongoDB
 * 
 * Fields:
 * - email: unique identifier, required
 * - password: bcrypt hashed password, required
 * - name: user's display name, required
 * - createdAt: account creation timestamp
 * - updatedAt: last profile update timestamp
 * - lastLogin: last successful login timestamp
 */
const userSchema = new mongoose.Schema({
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
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  }
});

const User = mongoose.model('User', userSchema);

/**
 * Rate Limiting Configuration
 * Implement rate limiting to prevent brute force attacks
 * Recommended: 5 requests per 15 minutes for auth endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many authentication attempts, please try again later',
    statusCode: 429
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Input Validation Schemas
 * Joi schemas for validating request payloads
 */
const validationSchemas = {
  register: Joi.object({
    email: Joi.string().email().required().max(255),
    password: Joi.string().min(8).required().max(128),
    name: Joi.string().required().min(1).max(100).trim()
  }),

  login: Joi.object({
    email: Joi.string().email().required().max(255),
    password: Joi.string().required().max(128)
  }),

  updateProfile: Joi.object({
    name: Joi.string().min(1).max(100).trim(),
    email: Joi.string().email().max(255),
    current_password: Joi.string().when('email', {
      is: Joi.exist(),
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  }).min(1),

  changePassword: Joi.object({
    current_password: Joi.string().required().max(128),
    new_password: Joi.string().min(8).required().max(128)
  })
};

/**
 * JWT Authentication Middleware
 * Validates JWT tokens and attaches user information to request object
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'ACCESS_TOKEN_REQUIRED',
        message: 'Access token is required for this operation',
        statusCode: 401
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify user still exists in database
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Token is invalid or user no longer exists',
        statusCode: 401
      });
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email
    };
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid access token provided',
        statusCode: 401
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Access token has expired',
        statusCode: 401
      });
    }

    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      error: 'AUTHENTICATION_ERROR',
      message: 'An error occurred during authentication',
      statusCode: 500
    });
  }
};

/**
 * Utility function to generate JWT tokens
 * 
 * @param {Object} payload - Token payload containing user information
 * @returns {string} Generated JWT token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Utility function to validate request payload
 * 
 * @param {Object} schema - Joi validation schema
 * @param {Object} data - Data to validate
 * @returns {Object} Validation result
 */
const validateInput = (schema, data) => {
  return schema.validate(data, { abortEarly: false });
};

/**
 * POST /api/users/register
 * Register a new user account
 * 
 * @route POST /api/users/register
 * @param {string} email - User's email address (required, unique)
 * @param {string} password - User's password (required, min 8 characters)
 * @param {string} name - User's display name (required)
 * @returns {Object} JWT token and user information
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    // Validate input data
    const { error, value } = validateInput(validationSchemas.register, req.body);
    if (error) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.details.map(detail => detail.message).join(', '),
        statusCode: 400
      });
    }

    const { email, password, name } = value;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email address already exists',
        statusCode: 409
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Create new user
    const newUser = new User({
      email,
      password: hashedPassword,
      name
    });

    const savedUser = await newUser.save();

    // Generate JWT token
    const token = generateToken({
      userId: savedUser._id,
      email: savedUser.email
    });

    // Return success response
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: savedUser.toJSON()
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email address already exists',
        statusCode: 409
      });
    }

    res.status(500).json({
      error: 'REGISTRATION_FAILED',
      message: 'An error occurred during user registration',
      statusCode: 500
    });
  }
});

/**
 * POST /api/users/login
 * Authenticate user and generate access token
 * 
 * @route POST /api/users/login
 * @param {string} email - User's email address (required)
 * @param {string} password - User's password (required)
 * @returns {Object} JWT token and user information
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    // Validate input data
    const { error, value } = validateInput(validationSchemas.login, req.body);
    if (error) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.details.map(detail => detail.message).join(', '),
        statusCode: 400
      });
    }

    const { email, password } = value;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        statusCode: 401
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        statusCode: 401
      });
    }

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken({
      userId: user._id,
      email: user.email
    });

    // Return success response
    res.status(200).json({
      message: 'Login successful',
      token,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'LOGIN_FAILED',
      message: 'An error occurred during login',
      statusCode: 500
    });
  }
});

/**
 * GET /api/users/me
 * Get current user profile information
 * 
 * @route GET /api/users/me
 * @middleware authenticateToken
 * @returns {Object} Current user information
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User account not found',
        statusCode: 404
      });
    }

    res.status(200).json({
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'PROFILE_FETCH_FAILED',
      message: 'An error occurred while fetching user profile',
      statusCode: 500
    });
  }
});

/**
 * PUT /api/users/me
 * Update current user profile information
 * 
 * @route PUT /api/users/me
 * @middleware authenticateToken
 * @param {string} [name] - Updated user name
 * @param {string} [email] - Updated email address
 * @param {string} [current_password] - Required when updating email
 * @returns {Object} Updated user information
 */
router.put('/me', authenticateToken, async (req, res) => {
  try {
    // Validate input data
    const { error, value } = validateInput(validationSchemas.updateProfile, req.body);
    if (error) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.details.map(detail => detail.message).join(', '),
        statusCode: 400
      });
    }

    const { name, email, current_password } = value;

    // Find current user
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User account not found',
        statusCode: 404
      });
    }

    // If email is being updated, verify current password
    if (email && email !== user.email) {
      if (!current_password) {
        return res.status(400).json({
          error: 'PASSWORD_REQUIRED',
          message: 'Current password is required to change email address',
          statusCode: 400
        });
      }

      const isPasswordValid = await bcrypt.compare(current_password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          error: 'INVALID_PASSWORD',
          message: 'Current password is incorrect',
          statusCode: 401
        });
      }

      // Check if new email is already taken
      const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(409).json({
          error: 'EMAIL_ALREADY_EXISTS',
          message: 'This email address is already in use',
          statusCode: 409
        });
      }

      user.email = email;
    }

    // Update name if provided
    if (name) {
      user.name = name;
    }

    // Save updated user
    const updatedUser = await user.save();

    res.status(200).json({
      message: 'Profile updated successfully',
      user: updatedUser.toJSON()
    });

  } catch (error) {
    console.error('Profile update error:', error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'This email address is already in use',
        statusCode: 409
      });
    }

    res.status(500).json({
      error: 'PROFILE_UPDATE_FAILED',
      message: 'An error occurred while updating profile',
      statusCode: 500
    });
  }
});

/**
 * POST /api/users/change-password
 * Change user password
 * 
 * @route POST /api/users/change-password