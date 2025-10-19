/**
 * Core Authentication and Authorization Module
 * Provides JWT token management, password security, and Express middleware
 * for user authentication and authorization.
 * 
 * @module core.auth
 * @requires jsonwebtoken
 * @requires bcrypt
 * @requires @models/user
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { User } from '@models/user.js';

// Constants
const TOKEN_EXPIRATION = '24h';
const JWT_ALGORITHM = 'HS256';
const BCRYPT_SALT_ROUNDS = 12;
const BEARER_PREFIX = 'Bearer ';

// Environment variables with validation
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Custom error classes for authentication
 */
export class AuthenticationError extends Error {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'Authorization failed') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}

export class TokenError extends Error {
  constructor(message = 'Token error') {
    super(message);
    this.name = 'TokenError';
    this.statusCode = 401;
  }
}

/**
 * Generates a JWT access token with user data payload
 * 
 * @param {Object} data - User data to include in token payload
 * @param {string|number} data.id - User ID
 * @param {string} data.email - User email
 * @param {string} [data.role] - User role
 * @param {Object} [options] - Additional JWT options
 * @param {string} [options.expiresIn] - Token expiration time
 * @returns {Promise<string>} JWT access token
 * @throws {Error} When token generation fails or data is invalid
 * 
 * @example
 * const token = await createAccessToken({ 
 *   id: 123, 
 *   email: 'user@example.com',
 *   role: 'user' 
 * });
 */
export async function createAccessToken(data, options = {}) {
  try {
    // Input validation
    if (!data || typeof data !== 'object') {
      throw new Error('Token data must be a valid object');
    }

    if (!data.id || !data.email) {
      throw new Error('Token data must include id and email');
    }

    // Sanitize payload - only include necessary user data
    const payload = {
      id: data.id,
      email: data.email,
      role: data.role || 'user',
      iat: Math.floor(Date.now() / 1000)
    };

    const tokenOptions = {
      algorithm: JWT_ALGORITHM,
      expiresIn: options.expiresIn || TOKEN_EXPIRATION,
      issuer: process.env.JWT_ISSUER || 'auth-service',
      audience: process.env.JWT_AUDIENCE || 'api-users'
    };

    return jwt.sign(payload, JWT_SECRET, tokenOptions);
  } catch (error) {
    throw new TokenError(`Failed to create access token: ${error.message}`);
  }
}

/**
 * Verifies and decodes a JWT token
 * 
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Decoded token payload
 * @throws {TokenError} When token is invalid, expired, or malformed
 * 
 * @example
 * try {
 *   const payload = await verifyToken(token);
 *   console.log('User ID:', payload.id);
 * } catch (error) {
 *   console.error('Token verification failed:', error.message);
 * }
 */
export async function verifyToken(token) {
  try {
    if (!token || typeof token !== 'string') {
      throw new TokenError('Token must be a valid string');
    }

    const options = {
      algorithms: [JWT_ALGORITHM],
      issuer: process.env.JWT_ISSUER || 'auth-service',
      audience: process.env.JWT_AUDIENCE || 'api-users'
    };

    return jwt.verify(token, JWT_SECRET, options);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenError('Token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new TokenError('Invalid token format');
    } else if (error instanceof jwt.NotBeforeError) {
      throw new TokenError('Token not active yet');
    } else {
      throw new TokenError(`Token verification failed: ${error.message}`);
    }
  }
}

/**
 * Hashes a password using bcrypt with secure salt rounds
 * 
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password
 * @throws {Error} When password hashing fails or password is invalid
 * 
 * @example
 * const hashedPassword = await getPasswordHash('userPassword123');
 * // Store hashedPassword in database
 */
export async function getPasswordHash(password) {
  try {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a valid string');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
      throw new Error('Password must be less than 128 characters');
    }

    return await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  } catch (error) {
    if (error.message.includes('Password must be')) {
      throw error;
    }
    throw new Error(`Password hashing failed: ${error.message}`);
  }
}

/**
 * Verifies a plain password against a hashed password
 * Uses timing-safe comparison to prevent timing attacks
 * 
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 * @throws {Error} When password verification fails
 * 
 * @example
 * const isValid = await verifyPassword('userInput', storedHashedPassword);
 * if (isValid) {
 *   // Password is correct
 * }
 */
export async function verifyPassword(plainPassword, hashedPassword) {
  try {
    if (!plainPassword || typeof plainPassword !== 'string') {
      throw new Error('Plain password must be a valid string');
    }

    if (!hashedPassword || typeof hashedPassword !== 'string') {
      throw new Error('Hashed password must be a valid string');
    }

    // Use bcrypt.compare for timing-safe comparison
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (error) {
    // Always return false for verification errors to prevent information leakage
    // Log the actual error for debugging purposes
    console.error('Password verification error:', error.message);
    return false;
  }
}

/**
 * Extracts and validates user from JWT token
 * 
 * @param {string} token - JWT token containing user data
 * @returns {Promise<Object>} User object from database
 * @throws {AuthenticationError} When token is invalid or user not found
 * @throws {TokenError} When token verification fails
 * 
 * @example
 * try {
 *   const user = await getCurrentUser(token);
 *   console.log('Current user:', user.email);
 * } catch (error) {
 *   console.error('User retrieval failed:', error.message);
 * }
 */
export async function getCurrentUser(token) {
  try {
    // Verify and decode the token
    const payload = await verifyToken(token);

    // Fetch user from database
    const user = await User.findById(payload.id);
    
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Remove sensitive data before returning
    const { password, ...userWithoutPassword } = user.toObject ? user.toObject() : user;
    
    return userWithoutPassword;
  } catch (error) {
    if (error instanceof TokenError) {
      throw error;
    }
    throw new AuthenticationError(`Failed to get current user: ${error.message}`);
  }
}

/**
 * Extracts Bearer token from Authorization header
 * 
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null if not found
 * 
 * @example
 * const token = extractTokenFromHeader(req.headers.authorization);
 */
function extractTokenFromHeader(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (!authHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  return token || null;
}

/**
 * Express middleware for extracting and validating JWT tokens
 * Equivalent to OAuth2PasswordBearer - extracts token but doesn't require it
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * 
 * @example
 * app.get('/optional-auth', tokenExtractor, (req, res) => {
 *   if (req.user) {
 *     // User is authenticated
 *   } else {
 *     // Anonymous access
 *   }
 * });
 */
export function tokenExtractor(req, res, next) {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (token) {
      req.token = token;
    }
    
    next();
  } catch (error) {
    // Don't fail the request, just log the error
    console.error('Token extraction error:', error.message);
    next();
  }
}

/**
 * Express middleware that requires valid authentication
 * Extracts user from JWT token and adds to request object
 * 
 * Rate limiting consideration: Implement rate limiting before this middleware
 * to prevent brute force attacks on token validation
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * 
 * @example
 * app.get('/protected', requireAuth, (req, res) => {
 *   res.json({ user: req.user });
 * });
 */
export async function requireAuth(req, res, next) {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided'
      });
    }

    const user = await getCurrentUser(token);
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    const statusCode = error.statusCode || 401;
    return res.status(statusCode).json({
      error: error.name || 'AuthenticationError',
      message: error.message
    });
  }
}

/**
 * Express middleware that requires active user authentication
 * Similar to requireAuth but also checks if user account is active
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * 
 * @example
 * app.get('/admin', requireActiveUser, (req, res) => {
 *   res.json({ message: 'Admin access granted' });
 * });
 */
export async function requireActiveUser(req, res, next) {
  try {
    // First run the standard auth check
    await new Promise((resolve, reject) => {
      requireAuth(req, res, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Check if user is active
    if (!req.user.isActive && req.user.isActive !== undefined) {
      return res.status(403).json({
        error: 'AuthorizationError',
        message: 'Account is not active'
      });
    }

    // Check if user account is not suspended
    if (req.user.isSuspended) {
      return res.status(403).json({
        error: 'AuthorizationError',
        message: 'Account is suspended'
      });
    }

    next();
  } catch (error) {
    const statusCode = error.statusCode || 401;
    return res.status(statusCode).json({
      error: error.name || 'AuthenticationError',
      message: error.message
    });
  }
}

/**
 * Express middleware for role-based authorization
 * 
 * @param {string|string[]} allowedRoles - Role or array of roles allowed
 * @returns {Function} Express middleware function
 * 
 * @example
 * app.delete('/users/:id', requireAuth, requireRole(['admin', 'moderator']), (req, res) => {
 *   // Only admin or moderator can access
 * });
 */
export function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'AuthenticationError',
          message: 'Authentication required'
        });
      }

      if (!req.user.role || !roles.includes(req.user.role)) {
        return res.status(403).json({
          error: 'AuthorizationError',
          message: 'Insufficient permissions'
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        error: 'InternalServerError',
        message: 'Authorization check failed'
      });
    }
  };
}

/**
 * Utility function to refresh a token (generate new token with updated data)
 * 
 * @param {string} oldToken - Current valid token
 * @param {Object} [additionalData] - Additional data to include in new token
 * @returns {Promise<string>} New JWT token
 * 
 * @example
 * const newToken = await refreshToken(currentToken, { lastLogin: new Date() });
 */
export async function refreshToken(oldToken, additionalData = {}) {
  try {
    const payload = await verifyToken(oldToken);
    const user = await getCurrentUser(oldToken);
    
    const newTokenData = {
      ...user,
      ...additionalData
    };
    
    return await createAccessToken(newTokenData);
  } catch (error) {
    throw new TokenError(`Token refresh failed: ${error.message}`);
  }
}

// Export all functions and middleware
export {
  // Core functions
  createAccessToken,
  verifyToken,
  getPasswordHash,
  verifyPassword,
  getCurrentUser,
  
  // Middleware
  tokenExtractor,
  requireAuth,
  requireActiveUser,
  requireRole,
  
  // Utilities
  refreshToken,
  
  // Error classes
  AuthenticationError,
  AuthorizationError,
  TokenError
};