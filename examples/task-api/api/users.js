/**
 * User Management and Authentication API Module
 * Provides comprehensive user registration, authentication, and profile management
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Configuration constants
const SALT_ROUNDS = 12;
const JWT_EXPIRATION = '24h';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Authentication middleware to protect routes
 * Validates JWT bearer tokens and attaches user info to request
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch user from database (placeholder)
    const user = await getUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        error: 'Invalid token - user not found',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        code: 'TOKEN_INVALID'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

/**
 * Input validation middleware
 */
const validateInput = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array()
    });
  }
  next();
};

/**
 * POST /register
 * Register a new user account
 */
router.post('/register', [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('name')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Name is required')
], validateInput, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'Email already registered',
        code: 'EMAIL_EXISTS'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user in database
    const newUser = await createUser({
      email,
      password: hashedPassword,
      name,
      createdAt: new Date(),
      lastLogin: null
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    // Return user data without password
    const { password: _, ...userResponse } = newUser;

    res.status(201).json({
      message: 'User registered successfully',
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === 'DB_CONNECTION_ERROR') {
      return res.status(500).json({
        error: 'Database connection failed',
        code: 'DB_CONNECTION_ERROR'
      });
    }

    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
});

/**
 * POST /login
 * Authenticate user and return JWT token
 */
router.post('/login', [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required')
], validateInput, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login timestamp
    await updateUserLastLogin(user.id, new Date());

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    // Return user data without password
    const { password: _, ...userResponse } = user;
    userResponse.lastLogin = new Date();

    res.json({
      message: 'Login successful',
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    
    if (error.code === 'DB_CONNECTION_ERROR') {
      return res.status(500).json({
        error: 'Database connection failed',
        code: 'DB_CONNECTION_ERROR'
      });
    }

    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

/**
 * GET /me
 * Get current user profile information
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // User is already attached to request by authenticateToken middleware
    const { password, ...userResponse } = req.user;

    res.json({
      user: userResponse
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to retrieve profile',
      code: 'PROFILE_RETRIEVAL_ERROR'
    });
  }
});

/**
 * PUT /me
 * Update current user profile information
 */
router.put('/me', authenticateToken, [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Name cannot be empty'),
  body('currentPassword')
    .if(body('email').exists())
    .isLength({ min: 1 })
    .withMessage('Current password required for email changes')
], validateInput, async (req, res) => {
  try {
    const { email, name, currentPassword } = req.body;
    const userId = req.user.id;

    // If email is being changed, verify current password
    if (email && email !== req.user.email) {
      if (!currentPassword) {
        return res.status(400).json({
          error: 'Current password required for email changes',
          code: 'PASSWORD_REQUIRED'
        });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, req.user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          error: 'Current password is incorrect',
          code: 'INVALID_PASSWORD'
        });
      }

      // Check if new email is already taken
      const existingUser = await getUserByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(409).json({
          error: 'Email already in use',
          code: 'EMAIL_EXISTS'
        });
      }
    }

    // Prepare update data
    const updateData = {};
    if (email) updateData.email = email;
    if (name) updateData.name = name;
    updateData.updatedAt = new Date();

    // Update user in database
    const updatedUser = await updateUser(userId, updateData);

    // Return updated user data without password
    const { password, ...userResponse } = updatedUser;

    res.json({
      message: 'Profile updated successfully',
      user: userResponse
    });

  } catch (error) {
    console.error('Profile update error:', error);
    
    if (error.code === 'DB_CONNECTION_ERROR') {
      return res.status(500).json({
        error: 'Database connection failed',
        code: 'DB_CONNECTION_ERROR'
      });
    }

    res.status(500).json({
      error: 'Profile update failed',
      code: 'PROFILE_UPDATE_ERROR'
    });
  }
});

/**
 * POST /change-password
 * Change user password with current password verification
 */
router.post('/change-password', authenticateToken, [
  body('currentPassword')
    .isLength({ min: 1 })
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
], validateInput, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, req.user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Check if new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, req.user.password);
    if (isSamePassword) {
      return res.status(400).json({
        error: 'New password must be different from current password',
        code: 'SAME_PASSWORD'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password in database
    await updateUser(userId, {
      password: hashedNewPassword,
      updatedAt: new Date()
    });

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    
    if (error.code === 'DB_CONNECTION_ERROR') {
      return res.status(500).json({
        error: 'Database connection failed',
        code: 'DB_CONNECTION_ERROR'
      });
    }

    res.status(500).json({
      error: 'Password change failed',
      code: 'PASSWORD_CHANGE_ERROR'
    });
  }
});

// Database operation placeholders
// These should be replaced with actual database implementations

/**
 * Get user by email from database
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserByEmail(email) {
  try {
    // Placeholder for database query
    // Example: return await db.users.findOne({ email });
    console.log(`Database query: getUserByEmail(${email})`);
    return null; // Replace with actual implementation
  } catch (error) {
    error.code = 'DB_CONNECTION_ERROR';
    throw error;
  }
}

/**
 * Get user by ID from database
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserById(userId) {
  try {
    // Placeholder for database query
    // Example: return await db.users.findById(userId);
    console.log(`Database query: getUserById(${userId})`);
    return null; // Replace with actual implementation
  } catch (error) {
    error.code = 'DB_CONNECTION_ERROR';
    throw error;
  }
}

/**
 * Create new user in database
 * @param {Object} userData - User data object
 * @returns {Promise<Object>} Created user object
 */
async function createUser(userData) {
  try {
    // Placeholder for database insertion
    // Example: return await db.users.create(userData);
    console.log('Database query: createUser', userData);
    return { id: 'generated-id', ...userData }; // Replace with actual implementation
  } catch (error) {
    error.code = 'DB_CONNECTION_ERROR';
    throw error;
  }
}

/**
 * Update user in database
 * @param {string} userId - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated user object
 */
async function updateUser(userId, updateData) {
  try {
    // Placeholder for database update
    // Example: return await db.users.findByIdAndUpdate(userId, updateData, { new: true });
    console.log(`Database query: updateUser(${userId})`, updateData);
    return { id: userId, ...updateData }; // Replace with actual implementation
  } catch (error) {
    error.code = 'DB_CONNECTION_ERROR';
    throw error;
  }
}

/**
 * Update user's last login timestamp
 * @param {string} userId - User ID
 * @param {Date} timestamp - Login timestamp
 * @returns {Promise<void>}
 */
async function updateUserLastLogin(userId, timestamp) {
  try {
    // Placeholder for database update
    // Example: await db.users.findByIdAndUpdate(userId, { lastLogin: timestamp });
    console.log(`Database query: updateUserLastLogin(${userId}, ${timestamp})`);
  } catch (error) {
    error.code = 'DB_CONNECTION_ERROR';
    throw error;
  }
}

module.exports = router;