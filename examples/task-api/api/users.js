// api/users.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import User from '../models/User.js'; // Assuming mongoose User model exists
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Constants
const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Validation Schemas
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().trim(),
  email: Joi.string().email().required().lowercase().trim(),
  password: Joi.string().min(8).required()
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)'))
    .message('Password must contain at least one uppercase letter, one lowercase letter, and one number')
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().lowercase().trim(),
  password: Joi.string().required()
});

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50).trim(),
  email: Joi.string().email().lowercase().trim(),
  currentPassword: Joi.string().when('email', {
    is: Joi.exist(),
    then: Joi.required(),
    otherwise: Joi.optional()
  })
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required()
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)'))
    .message('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
  confirmPassword: Joi.string().required().valid(Joi.ref('newPassword'))
    .messages({ 'any.only': 'Password confirmation does not match' })
});

// Utility Functions
const generateToken = (userId) => {
  return jwt.sign(
    { userId, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : user;
  const { password, __v, ...sanitizedUser } = userObj;
  return sanitizedUser;
};

const handleError = (res, error, defaultMessage = 'Internal server error') => {
  console.error('API Error:', error);
  
  // Handle specific mongoose/database errors
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'Email already exists',
      message: 'An account with this email address already exists'
    });
  }
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: Object.values(error.errors).map(e => e.message).join(', ')
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid data format',
      message: 'Invalid user ID format'
    });
  }
  
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: defaultMessage
  });
};

// ENDPOINTS

/**
 * POST /api/users/register
 * Register a new user with email uniqueness check
 * Rate limiting recommended: 5 requests per 15 minutes per IP
 */
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: error.details[0].message
      });
    }

    const { name, email, password } = value;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Email already exists',
        message: 'An account with this email address already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      createdAt: new Date(),
      lastLogin: null
    });

    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Return success response (exclude password)
    res.status(201).json({
      success: true,
      data: {
        user: sanitizeUser(user),
        token
      },
      message: 'User registered successfully'
    });

  } catch (error) {
    handleError(res, error, 'Failed to register user');
  }
});

/**
 * POST /api/users/login
 * Authenticate user with password verification
 * Rate limiting recommended: 10 requests per 15 minutes per IP
 */
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: error.details[0].message
      });
    }

    const { email, password } = value;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Invalid email or password'
      });
    }

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Return success response
    res.status(200).json({
      success: true,
      data: {
        user: sanitizeUser(user),
        token
      },
      message: 'Login successful'
    });

  } catch (error) {
    handleError(res, error, 'Failed to authenticate user');
  }
});

/**
 * GET /api/users/me
 * Get current user profile (authenticated)
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // User ID is available from auth middleware
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: 'User account no longer exists'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: sanitizeUser(user)
      },
      message: 'User profile retrieved successfully'
    });

  } catch (error) {
    handleError(res, error, 'Failed to retrieve user profile');
  }
});

/**
 * PUT /api/users/me
 * Update user profile with email change confirmation
 */
router.put('/me', authenticateToken, async (req, res) => {
  try {
    // Validate input
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: error.details[0].message
      });
    }

    const { name, email, currentPassword } = value;
    const userId = req.user.userId;

    // Get current user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: 'User account no longer exists'
      });
    }

    // If email is being changed, verify current password
    if (email && email !== user.email) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          error: 'Password required',
          message: 'Current password is required to change email address'
        });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid password',
          message: 'Current password is incorrect'
        });
      }

      // Check if new email already exists
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Email already exists',
          message: 'An account with this email address already exists'
        });
      }
    }

    // Update user fields
    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (email !== undefined) updateFields.email = email;
    updateFields.updatedAt = new Date();

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: {
        user: sanitizeUser(updatedUser)
      },
      message: 'Profile updated successfully'
    });

  } catch (error) {
    handleError(res, error, 'Failed to update user profile');
  }
});

/**
 * POST /api/users/change-password
 * Change password with current password verification
 * Rate limiting recommended: 5 requests per hour per user
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    // Validate input
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: error.details[0].message
      });
    }

    const { currentPassword, newPassword } = value;
    const userId = req.user.userId;

    // Get current user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: 'User account no longer exists'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password',
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'Same password',
        message: 'New password must be different from current password'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await User.findByIdAndUpdate(userId, {
      password: hashedNewPassword,
      updatedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    handleError(res, error, 'Failed to change password');
  }
});

export { router as usersRouter };