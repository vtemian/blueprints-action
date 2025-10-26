/**
 * Core Authentication Module
 * Provides JWT token management, password security, and Express middleware
 * for authentication and authorization in Node.js applications.
 * 
 * @module core.auth
 * @requires jsonwebtoken
 * @requires bcryptjs
 * @requires ../models/user.js
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/user.js';

// Constants
const SALT_ROUNDS = 12;
const TOKEN_EXPIRATION = '24h';
const JWT_ALGORITHM = 'HS256';

// Validate JWT_SECRET on module load
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Generate JWT access token with 24-hour expiration
 * 
 * @param {Object} data - Payload data to include in token
 * @returns {Promise<Object>} Response object with success status and token or error
 * 
 * @example
 * const result = await createAccessToken({ userId: '123', email: 'user@example.com' });
 * if (result.success) {
 *   console.log('Token:', result.data.token);
 * }
 */
export const createAccessToken = async (data) => {
  try {
    // Validate input
    if (!data || typeof data !== 'object') {
      return {
        success: false,
        error: 'INVALID_PAYLOAD',
        message: 'Token payload must be a valid object'
      };
    }

    // Generate token with expiration and algorithm
    const token = jwt.sign(
      { ...data, iat: Math.floor(Date.now() / 1000) },
      process.env.JWT_SECRET,
      { 
        expiresIn: TOKEN_EXPIRATION,
        algorithm: JWT_ALGORITHM
      }
    );

    return {
      success: true,
      data: {
        token,
        expiresIn: TOKEN_EXPIRATION,
        tokenType: 'Bearer'
      },
      message: 'Access token created successfully'
    };

  } catch (error) {
    return {
      success: false,
      error: 'TOKEN_GENERATION_FAILED',
      message: `Failed to generate access token: ${error.message}`
    };
  }
};

/**
 * Verify and decode JWT token
 * 
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Response object with success status and decoded payload or error
 * 
 * @example
 * const result = await verifyToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 * if (result.success) {
 *   console.log('User ID:', result.data.userId);
 * }
 */
export const verifyToken = async (token) => {
  try {
    // Validate input
    if (!token || typeof token !== 'string') {
      return {
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Token must be a valid string'
      };
    }

    // Remove Bearer prefix if present
    const cleanToken = token.replace(/^Bearer\s+/, '');

    if (!cleanToken) {
      return {
        success: false,
        error: 'EMPTY_TOKEN',
        message: 'Token cannot be empty'
      };
    }

    // Verify token
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM]
    });

    return {
      success: true,
      data: decoded,
      message: 'Token verified successfully'
    };

  } catch (error) {
    let errorCode = 'TOKEN_VERIFICATION_FAILED';
    let message = 'Failed to verify token';

    if (error.name === 'TokenExpiredError') {
      errorCode = 'TOKEN_EXPIRED';
      message = 'Token has expired';
    } else if (error.name === 'JsonWebTokenError') {
      errorCode = 'INVALID_TOKEN';
      message = 'Invalid token format or signature';
    } else if (error.name === 'NotBeforeError') {
      errorCode = 'TOKEN_NOT_ACTIVE';
      message = 'Token is not active yet';
    }

    return {
      success: false,
      error: errorCode,
      message: `${message}: ${error.message}`
    };
  }
};

/**
 * Hash password using bcrypt with 12 salt rounds
 * 
 * @param {string} password - Plain text password to hash
 * @returns {Promise<Object>} Response object with success status and hashed password or error
 * 
 * @example
 * const result = await getPasswordHash('mySecurePassword123');
 * if (result.success) {
 *   console.log('Hashed password:', result.data.hash);
 * }
 */
export const getPasswordHash = async (password) => {
  try {
    // Validate input
    if (!password || typeof password !== 'string') {
      return {
        success: false,
        error: 'INVALID_PASSWORD',
        message: 'Password must be a valid non-empty string'
      };
    }

    if (password.length < 1) {
      return {
        success: false,
        error: 'EMPTY_PASSWORD',
        message: 'Password cannot be empty'
      };
    }

    // Generate salt and hash password
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);

    return {
      success: true,
      data: {
        hash,
        saltRounds: SALT_ROUNDS
      },
      message: 'Password hashed successfully'
    };

  } catch (error) {
    return {
      success: false,
      error: 'PASSWORD_HASH_FAILED',
      message: `Failed to hash password: ${error.message}`
    };
  }
};

/**
 * Verify plain password against hashed password
 * 
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Hashed password to compare against
 * @returns {Promise<Object>} Response object with success status and verification result
 * 
 * @example
 * const result = await verifyPassword('myPassword', '$2a$12$...');
 * if (result.success && result.data.isValid) {
 *   console.log('Password is correct');
 * }
 */
export const verifyPassword = async (plainPassword, hashedPassword) => {
  try {
    // Validate inputs
    if (!plainPassword || typeof plainPassword !== 'string') {
      return {
        success: false,
        error: 'INVALID_PLAIN_PASSWORD',
        message: 'Plain password must be a valid non-empty string'
      };
    }

    if (!hashedPassword || typeof hashedPassword !== 'string') {
      return {
        success: false,
        error: 'INVALID_HASHED_PASSWORD',
        message: 'Hashed password must be a valid non-empty string'
      };
    }

    // Verify password
    const isValid = await bcrypt.compare(plainPassword, hashedPassword);

    return {
      success: true,
      data: {
        isValid,
        verified: isValid
      },
      message: isValid ? 'Password verification successful' : 'Password verification failed'
    };

  } catch (error) {
    return {
      success: false,
      error: 'PASSWORD_VERIFICATION_FAILED',
      message: `Failed to verify password: ${error.message}`
    };
  }
};

/**
 * Extract user information from JWT token and fetch from database
 * 
 * @param {string} token - JWT token containing user information
 * @returns {Promise<Object>} Response object with success status and user data or error
 * 
 * @example
 * const result = await getCurrentUser('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 * if (result.success) {
 *   console.log('Current user:', result.data.user);
 * }
 */
export const getCurrentUser = async (token) => {
  try {
    // Verify token first
    const tokenResult = await verifyToken(token);
    if (!tokenResult.success) {
      return tokenResult;
    }

    const { userId } = tokenResult.data;

    if (!userId) {
      return {
        success: false,
        error: 'MISSING_USER_ID',
        message: 'Token does not contain user ID'
      };
    }

    // Fetch user from database
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return {
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found in database'
      };
    }

    return {
      success: true,
      data: {
        user,
        tokenData: tokenResult.data
      },
      message: 'Current user retrieved successfully'
    };

  } catch (error) {
    return {
      success: false,
      error: 'GET_CURRENT_USER_FAILED',
      message: `Failed to get current user: ${error.message}`
    };
  }
};

/**
 * Express middleware to authenticate JWT tokens from Authorization header
 * Expects Bearer token format: "Bearer <token>"
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * 
 * @example
 * app.get('/protected', authenticateToken, (req, res) => {
 *   res.json({ user: req.user });
 * });
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'MISSING_AUTHORIZATION_HEADER',
        message: 'Authorization header is required'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_AUTHORIZATION_FORMAT',
        message: 'Authorization header must use Bearer token format'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: 'Bearer token is required'
      });
    }

    // Verify token
    const result = await verifyToken(token);

    if (!result.success) {
      const statusCode = result.error === 'TOKEN_EXPIRED' ? 401 : 403;
      return res.status(statusCode).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

    // Attach token data to request
    req.tokenData = result.data;
    req.userId = result.data.userId;

    next();

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'AUTHENTICATION_ERROR',
      message: `Authentication failed: ${error.message}`
    });
  }
};

/**
 * Express middleware to ensure user exists and is active
 * Must be used after authenticateToken middleware
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * 
 * @example
 * app.get('/admin', authenticateToken, requireActiveUser, (req, res) => {
 *   res.json({ message: 'Welcome active user!', user: req.user });
 * });
 */
export const requireActiveUser = async (req, res, next) => {
  try {
    // Check if token data exists (should be set by authenticateToken)
    if (!req.tokenData || !req.userId) {
      return res.status(401).json({
        success: false,
        error: 'MISSING_TOKEN_DATA',
        message: 'Token authentication required. Use authenticateToken middleware first.'
      });
    }

    // Fetch user from database
    const user = await User.findById(req.userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User account not found'
      });
    }

    // Check if user is active (assuming User model has isActive field)
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        error: 'USER_INACTIVE',
        message: 'User account is inactive'
      });
    }

    // Check if user is deleted/soft deleted
    if (user.deletedAt) {
      return res.status(403).json({
        success: false,
        error: 'USER_DELETED',
        message: 'User account has been deleted'
      });
    }

    // Attach user to request
    req.user = user;

    next();

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'USER_VERIFICATION_ERROR',
      message: `Failed to verify user status: ${error.message}`
    });
  }
};

/**
 * Export all authentication functions and middleware
 * 
 * @example
 * // Import specific functions
 * import { createAccessToken, verifyToken } from './core/auth.js';
 * 
 * // Import all functions
 * import * as auth from './core/auth.js';
 * 
 * // Use middleware in Express routes
 * app.use('/api/protected', auth.authenticateToken, auth.requireActiveUser);
 */
export default {
  createAccessToken,
  verifyToken,
  getPasswordHash,
  verifyPassword,
  getCurrentUser,
  authenticateToken,
  requireActiveUser
};

/* 
USAGE EXAMPLES:

// 1. Creating and verifying tokens
const tokenResult = await createAccessToken({ userId: '123', email: 'user@example.com' });
const verifyResult = await verifyToken(tokenResult.data.token);

// 2. Password operations
const hashResult = await getPasswordHash('myPassword123');
const verifyResult = await verifyPassword('myPassword123', hashResult.data.hash);

// 3. Express route protection
app.get('/profile', authenticateToken, requireActiveUser, (req, res) => {
  res.json({ user: req.user });
});

// 4. Manual user retrieval
const userResult = await getCurrentUser(req.headers.authorization);

// 5. Error handling pattern
const result = await createAccessToken(userData);
if (!result.success) {
  return res.status(400).json(result);
}
res.json(result);
*/