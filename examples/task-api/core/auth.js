/**
 * Core Authentication and Authorization Module
 * Provides JWT token management, password hashing, and user authentication
 * 
 * @module core.auth
 * @version 1.0.0
 * @author Enterprise Development Team
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { User } from '../models/user.js';

// Constants
const SALT_ROUNDS = 12;
const TOKEN_EXPIRATION = 86400; // 24 hours in seconds
const JWT_ALGORITHM = 'HS256';
const BEARER_PREFIX = 'Bearer ';

/**
 * Custom error classes for better error handling and debugging
 */
class AuthenticationError extends Error {
  constructor(message, code = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
  }
}

class AuthorizationError extends Error {
  constructor(message, code = 'AUTHZ_ERROR') {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
  }
}

class ValidationError extends Error {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

/**
 * Validates and retrieves JWT secret from environment variables
 * @private
 * @returns {string} JWT secret key
 * @throws {Error} If JWT_SECRET is not configured
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
  return secret;
}

/**
 * Validates input parameters for null, undefined, or incorrect types
 * @private
 * @param {any} value - Value to validate
 * @param {string} paramName - Parameter name for error messages
 * @param {string} expectedType - Expected type ('string', 'object', etc.)
 * @throws {ValidationError} If validation fails
 */
function validateInput(value, paramName, expectedType = 'string') {
  if (value === null || value === undefined) {
    throw new ValidationError(`${paramName} cannot be null or undefined`);
  }
  
  if (expectedType === 'string' && (typeof value !== 'string' || value.trim() === '')) {
    throw new ValidationError(`${paramName} must be a non-empty string`);
  }
  
  if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
    throw new ValidationError(`${paramName} must be a valid object`);
  }
}

// ============================================================================
// JWT TOKEN MANAGEMENT
// ============================================================================

/**
 * Creates a JWT access token with the provided data payload
 * 
 * @async
 * @function createAccessToken
 * @param {Object} data - Payload data to encode in the token
 * @param {string|number} data.userId - User identifier
 * @param {string} [data.email] - User email address
 * @param {string} [data.role] - User role/permissions
 * @returns {Promise<Object>} Response object with token or error
 * @throws {ValidationError} If data parameter is invalid
 * @throws {Error} If JWT signing fails
 * 
 * @example
 * const result = await createAccessToken({ 
 *   userId: '12345', 
 *   email: 'user@example.com',
 *   role: 'admin' 
 * });
 * if (result.success) {
 *   console.log('Token:', result.data.token);
 * }
 */
export async function createAccessToken(data) {
  try {
    validateInput(data, 'data', 'object');
    
    if (!data.userId) {
      throw new ValidationError('data.userId is required for token creation');
    }

    const secret = getJwtSecret();
    
    // Create payload with standard JWT claims
    const payload = {
      ...data,
      iat: Math.floor(Date.now() / 1000), // Issued at
      exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRATION // Expiration
    };

    const token = jwt.sign(payload, secret, {
      algorithm: JWT_ALGORITHM,
      expiresIn: TOKEN_EXPIRATION
    });

    return {
      success: true,
      data: {
        token,
        expiresIn: TOKEN_EXPIRATION,
        tokenType: 'Bearer'
      }
    };

  } catch (error) {
    // Sanitize error message for client exposure
    const sanitizedMessage = error instanceof ValidationError 
      ? error.message 
      : 'Failed to create access token';
    
    return {
      success: false,
      error: sanitizedMessage
    };
  }
}

/**
 * Verifies and decodes a JWT token
 * 
 * @async
 * @function verifyToken
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Response object with decoded payload or error
 * @throws {ValidationError} If token parameter is invalid
 * 
 * @example
 * const result = await verifyToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 * if (result.success) {
 *   console.log('User ID:', result.data.userId);
 * }
 */
export async function verifyToken(token) {
  try {
    validateInput(token, 'token');
    
    const secret = getJwtSecret();
    
    // Verify token with explicit algorithm specification for security
    const decoded = jwt.verify(token, secret, {
      algorithms: [JWT_ALGORITHM]
    });

    return {
      success: true,
      data: decoded
    };

  } catch (error) {
    let errorMessage = 'Token verification failed';
    
    // Provide specific error messages for different JWT errors
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token has expired';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid token format';
    } else if (error.name === 'NotBeforeError') {
      errorMessage = 'Token not active yet';
    } else if (error instanceof ValidationError) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

// ============================================================================
// PASSWORD SECURITY
// ============================================================================

/**
 * Generates a bcrypt hash for the provided password
 * Uses timing-safe hashing with configurable salt rounds
 * 
 * @async
 * @function getPasswordHash
 * @param {string} password - Plain text password to hash
 * @returns {Promise<Object>} Response object with hash or error
 * @throws {ValidationError} If password parameter is invalid
 * 
 * @example
 * const result = await getPasswordHash('mySecurePassword123');
 * if (result.success) {
 *   console.log('Hash:', result.data.hash);
 * }
 */
export async function getPasswordHash(password) {
  try {
    validateInput(password, 'password');
    
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    // Use async bcrypt.hash for better performance in Node.js
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    return {
      success: true,
      data: { hash }
    };

  } catch (error) {
    const sanitizedMessage = error instanceof ValidationError 
      ? error.message 
      : 'Failed to hash password';
    
    return {
      success: false,
      error: sanitizedMessage
    };
  }
}

/**
 * Verifies a plain text password against a bcrypt hash
 * Uses timing-safe comparison to prevent timing attacks
 * 
 * @async
 * @function verifyPassword
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Bcrypt hash to compare against
 * @returns {Promise<Object>} Response object with verification result
 * @throws {ValidationError} If parameters are invalid
 * 
 * @example
 * const result = await verifyPassword('userInput', storedHash);
 * if (result.success && result.data.isValid) {
 *   console.log('Password is correct');
 * }
 */
export async function verifyPassword(plainPassword, hashedPassword) {
  try {
    validateInput(plainPassword, 'plainPassword');
    validateInput(hashedPassword, 'hashedPassword');

    // bcrypt.compare is inherently timing-safe
    const isValid = await bcrypt.compare(plainPassword, hashedPassword);

    return {
      success: true,
      data: { isValid }
    };

  } catch (error) {
    const sanitizedMessage = error instanceof ValidationError 
      ? error.message 
      : 'Password verification failed';
    
    return {
      success: false,
      error: sanitizedMessage
    };
  }
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * Retrieves current user information from a JWT token
 * Validates token and fetches user data from database
 * 
 * @async
 * @function getCurrentUser
 * @param {string} token - JWT token containing user information
 * @returns {Promise<Object>} Response object with user data or error
 * @throws {ValidationError} If token parameter is invalid
 * 
 * @example
 * const result = await getCurrentUser(userToken);
 * if (result.success) {
 *   console.log('Current user:', result.data.user);
 * }
 */
export async function getCurrentUser(token) {
  try {
    validateInput(token, 'token');

    // First verify the token
    const tokenResult = await verifyToken(token);
    if (!tokenResult.success) {
      throw new AuthenticationError(tokenResult.error);
    }

    const { userId } = tokenResult.data;
    if (!userId) {
      throw new AuthenticationError('Token does not contain valid user information');
    }

    // Fetch user from database
    // Note: Error handling for database operations should be implemented
    // based on your specific User model implementation
    const user = await User.findById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Remove sensitive information before returning
    const { password, ...safeUserData } = user.toObject ? user.toObject() : user;

    return {
      success: true,
      data: { user: safeUserData }
    };

  } catch (error) {
    let errorMessage = 'Failed to retrieve current user';
    
    if (error instanceof AuthenticationError || error instanceof ValidationError) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

// ============================================================================
// EXPRESS.JS MIDDLEWARE
// ============================================================================

/**
 * Express.js middleware for JWT token authentication
 * Validates Bearer tokens and attaches user information to request object
 * 
 * Rate limiting considerations:
 * - Implement rate limiting on authentication endpoints
 * - Consider using Redis for distributed rate limiting
 * - Monitor failed authentication attempts
 * 
 * @function authenticateToken
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * @example
 * // Usage in Express routes
 * app.get('/protected', authenticateToken, (req, res) => {
 *   res.json({ user: req.user });
 * });
 */
export function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    if (!authHeader.startsWith(BEARER_PREFIX)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token format. Use Bearer <token>'
      });
    }

    const token = authHeader.slice(BEARER_PREFIX.length);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    // Verify token asynchronously
    verifyToken(token)
      .then(result => {
        if (!result.success) {
          return res.status(403).json({
            success: false,
            error: result.error
          });
        }

        // Attach user information to request object
        req.user = result.data;
        req.token = token;
        
        next();
      })
      .catch(error => {
        // Log error for debugging (ensure no sensitive data is logged)
        console.error('Token verification error:', error.message);
        
        return res.status(403).json({
          success: false,
          error: 'Token verification failed'
        });
      });

  } catch (error) {
    console.error('Authentication middleware error:', error.message);
    
    return res.status(500).json({
      success: false,
      error: 'Internal authentication error'
    });
  }
}

// ============================================================================
// ADDITIONAL UTILITY FUNCTIONS
// ============================================================================

/**
 * Extracts token from various request sources (header, query, body)
 * Useful for flexible token handling in different scenarios
 * 
 * @function extractToken
 * @param {Object} req - Express request object
 * @returns {string|null} Extracted token or null if not found
 * 
 * @example
 * const token = extractToken(req);
 * if (token) {
 *   // Process token
 * }
 */
export function extractToken(req) {
  // Check Authorization header first (most secure)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith(BEARER_PREFIX)) {
    return authHeader.slice(BEARER_PREFIX.length);
  }

  // Check query parameter (less secure, use with caution)
  if (req.query && req.query.token) {
    return req.query.token;
  }

  // Check request body (for POST requests)
  if (req.body && req.body.token) {
    return req.body.token;
  }

  return null;
}

/**
 * Creates a middleware for role-based authorization
 * Use after authenticateToken middleware
 * 
 * @function requireRole
 * @param {...string} allowedRoles - Roles that are allowed to access the resource
 * @returns {Function} Express middleware function
 * 
 * @example
 * app.delete('/admin/users/:id', 
 *   authenticateToken, 
 *   requireRole('admin', 'superuser'), 
 *   deleteUserHandler
 * );
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const userRole = req.user.role;
      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions'
        });
      }

      next();