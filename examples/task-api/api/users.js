/**
 * User Management and Authentication API Module
 * Production-ready Express.js implementation with comprehensive security
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const rateLimit = require('express-rate-limit');

// Database model imports (replace with your actual model imports)
const User = require('../models/User'); // Mongoose/Sequelize User model

const router = express.Router();

// Environment variables with defaults
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

// Rate limiting middleware
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  }
});

// Apply rate limiting to auth routes
router.use('/login', authLimiter);
router.use('/register', authLimiter);
router.use('/change-password', authLimiter);

// Apply general rate limiting to all routes
router.use(generalLimiter);

/**
 * Utility Functions
 */

// Standardized API response format
const sendResponse = (res, statusCode, success, message, data = null) => {
  return res.status(statusCode).json({
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

// Password validation
const validatePassword = (password) => {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
};

// Input sanitization
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

// Hash password
const hashPassword = async (password) => {
  try {
    return await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  } catch (error) {
    throw new Error('Error hashing password');
  }
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    throw new Error('Error comparing passwords');
  }
};

// Generate JWT token
const generateToken = (userId) => {
  try {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  } catch (error) {
    throw new Error('Error generating token');
  }
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Authentication Middleware
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return sendResponse(res, 401, false, 'Access token required');
    }

    const decoded = verifyToken(token);
    
    // Fetch user from database
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return sendResponse(res, 401, false, 'User not found');
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return sendResponse(res, 401, false, 'Invalid or expired token');
  }
};

/**
 * ENDPOINT IMPLEMENTATIONS
 */

/**
 * POST /api/users/register
 * Register a new user
 */
router.post('/register', async (req, res) => {
  try {
    let { email, password, name } = req.body;

    // Input validation
    if (!email || !password || !name) {
      return sendResponse(res, 400, false, 'Email, password, and name are required');
    }

    // Sanitize inputs
    email = sanitizeInput(email).toLowerCase();
    name = sanitizeInput(name);

    // Validate email format
    if (!validator.isEmail(email)) {
      return sendResponse(res, 400, false, 'Please provide a valid email address');
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      return sendResponse(res, 400, false, passwordError);
    }

    // Validate name
    if (!name || name.length < 1) {
      return sendResponse(res, 400, false, 'Name cannot be empty');
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendResponse(res, 409, false, 'User with this email already exists');
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = new User({
      email,
      password: hashedPassword,
      name,
      createdAt: new Date(),
      lastLogin: new Date()
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Return user info (excluding password)
    const userResponse = {
      id: user._id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };

    return sendResponse(res, 201, true, 'User registered successfully', {
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    return sendResponse(res, 500, false, 'Internal server error during registration');
  }
});

/**
 * POST /api/users/login
 * Authenticate user and return token
 */
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return sendResponse(res, 400, false, 'Email and password are required');
    }

    // Sanitize email
    email = sanitizeInput(email).toLowerCase();

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return sendResponse(res, 401, false, 'Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return sendResponse(res, 401, false, 'Invalid email or password');
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Return user info (excluding password)
    const userResponse = {
      id: user._id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };

    return sendResponse(res, 200, true, 'Login successful', {
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    return sendResponse(res, 500, false, 'Internal server error during login');
  }
});

/**
 * GET /api/users/me
 * Get authenticated user's profile
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userResponse = {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      createdAt: req.user.createdAt,
      lastLogin: req.user.lastLogin
    };

    return sendResponse(res, 200, true, 'Profile retrieved successfully', {
      user: userResponse
    });

  } catch (error) {
    console.error('Profile retrieval error:', error);
    return sendResponse(res, 500, false, 'Internal server error');
  }
});

/**
 * PUT /api/users/me
 * Update authenticated user's profile
 */
router.put('/me', authenticateToken, async (req, res) => {
  try {
    let { name, email, password } = req.body;
    const userId = req.user._id;

    // At least one field must be provided
    if (!name && !email) {
      return sendResponse(res, 400, false, 'At least one field (name or email) must be provided');
    }

    const updateFields = {};

    // Validate and update name
    if (name !== undefined) {
      name = sanitizeInput(name);
      if (!name || name.length < 1) {
        return sendResponse(res, 400, false, 'Name cannot be empty');
      }
      updateFields.name = name;
    }

    // Validate and update email
    if (email !== undefined) {
      email = sanitizeInput(email).toLowerCase();
      
      // Validate email format
      if (!validator.isEmail(email)) {
        return sendResponse(res, 400, false, 'Please provide a valid email address');
      }

      // For email changes, require password confirmation
      if (email !== req.user.email) {
        if (!password) {
          return sendResponse(res, 400, false, 'Password confirmation required for email changes');
        }

        // Verify current password
        const user = await User.findById(userId);
        const isPasswordValid = await comparePassword(password, user.password);
        if (!isPasswordValid) {
          return sendResponse(res, 401, false, 'Invalid password confirmation');
        }

        // Check email uniqueness
        const existingUser = await User.findOne({ email, _id: { $ne: userId } });
        if (existingUser) {
          return sendResponse(res, 409, false, 'Email already in use by another account');
        }
      }

      updateFields.email = email;
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return sendResponse(res, 404, false, 'User not found');
    }

    const userResponse = {
      id: updatedUser._id,
      email: updatedUser.email,
      name: updatedUser.name,
      createdAt: updatedUser.createdAt,
      lastLogin: updatedUser.lastLogin
    };

    return sendResponse(res, 200, true, 'Profile updated successfully', {
      user: userResponse
    });

  } catch (error) {
    console.error('Profile update error:', error);
    return sendResponse(res, 500, false, 'Internal server error during profile update');
  }
});

/**
 * POST /api/users/change-password
 * Change user's password
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user._id;

    // Input validation
    if (!current_password || !new_password) {
      return sendResponse(res, 400, false, 'Current password and new password are required');
    }

    // Validate new password
    const passwordError = validatePassword(new_password);
    if (passwordError) {
      return sendResponse(res, 400, false, passwordError);
    }

    // Check if new password is different from current
    if (current_password === new_password) {
      return sendResponse(res, 400, false, 'New password must be different from current password');
    }

    // Get user with password
    const user = await User.findById(userId);
    if (!user) {
      return sendResponse(res, 404, false, 'User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(current_password, user.password);
    if (!isCurrentPasswordValid) {
      return sendResponse(res, 401, false, 'Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(new_password);

    // Update password
    await User.findByIdAndUpdate(userId, { password: hashedNewPassword });

    return sendResponse(res, 200, true, 'Password changed successfully');

  } catch (error) {
    console.error('Password change error:', error);
    return sendResponse(res, 500, false, 'Internal server error during password change');
  }
});

/**
 * Error handling middleware for this router
 */
router.use((error, req, res, next) => {
  console.error('Unhandled error in users API:', error);
  return sendResponse(res, 500, false, 'Internal server error');
});

module.exports = router;

/**
 * USAGE INSTRUCTIONS:
 * 
 * 1. Install required dependencies:
 *    npm install express bcrypt jsonwebtoken validator express-rate-limit
 * 
 * 2. Set environment variables:
 *    JWT_SECRET=your-super-secret-jwt-key-here
 *    JWT_EXPIRES_IN=7d
 *    BCRYPT_SALT_ROUNDS=12
 * 
 * 3. Import and use in your main app:
 *    const userRoutes = require('./routes/users');
 *    app.use('/api/users', userRoutes);
 * 
 * 4. Ensure your User model has the following fields:
 *    - email (String, required, unique)
 *    - password (String, required)
 *    - name (String, required)
 *    - createdAt (Date)
 *    - lastLogin (Date)
 * 
 * 5. For production deployment:
 *    - Use HTTPS only
 *    - Set secure JWT_SECRET (32+ characters)
 *    - Configure proper CORS settings
 *    - Set up proper logging
 *    - Configure database connection pooling
 *    - Set up monitoring and health checks
 * 
 * SECURITY CONSIDERATIONS:
 * - All passwords are hashed with bcrypt (salt rounds: 12)
 * - JWT tokens are used for authentication
 * - Input validation and sanitization implemented
 * - Rate limiting applied to prevent abuse
 * - Proper HTTP status codes used
 * - No sensitive data in responses
 * - Password confirmation required for email changes
 */