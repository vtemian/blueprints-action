import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import User from '../models/user.js';

// Load environment variables
dotenv.config();

// Environment variable validation
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Constants
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRATION = '24h';
const SALT_ROUNDS = 12;
const BEARER_PREFIX = 'Bearer ';

/**
 * Custom error classes for authentication
 */
export class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class TokenExpiredError extends Error {
  constructor(message = 'Token has expired') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class InvalidTokenError extends Error {
  constructor(message = 'Invalid token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

export class UserNotFoundError extends Error {
  constructor(message = 'User not found') {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export class InactiveUserError extends Error {
  constructor(message = 'User account is inactive') {
    super(message);
    this.name = 'InactiveUserError';
  }
}

/**
 * Generate JWT access token with 24-hour expiration
 * @param {Object} data - Payload data to include in token
 * @returns {Promise<string>} Generated JWT token
 * @throws {Error} If data is invalid or token generation fails
 */
export async function createAccessToken(data) {
  try {
    if (!data || typeof data !== 'object') {
      throw new Error('Token data must be a valid object');
    }

    const token = jwt.sign(data, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: TOKEN_EXPIRATION
    });

    return token;
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw new InvalidTokenError('Failed to create token: ' + error.message);
    }
    throw error;
  }
}

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Decoded token payload
 * @throws {TokenExpiredError} If token has expired
 * @throws {InvalidTokenError} If token is invalid or malformed
 */
export async function verifyToken(token) {
  try {
    if (!token || typeof token !== 'string') {
      throw new InvalidTokenError('Token must be a valid string');
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new TokenExpiredError();
    }
    if (error.name === 'JsonWebTokenError') {
      throw new InvalidTokenError('Invalid token: ' + error.message);
    }
    if (error.name === 'NotBeforeError') {
      throw new InvalidTokenError('Token not active yet');
    }
    throw error;
  }
}

/**
 * Hash password using bcrypt with 12 salt rounds
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password
 * @throws {Error} If password is invalid or hashing fails
 */
export async function getPasswordHash(password) {
  try {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a valid string');
    }

    if (password.length === 0) {
      throw new Error('Password cannot be empty');
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    return hashedPassword;
  } catch (error) {
    if (error.message.includes('data and salt arguments required')) {
      throw new Error('Invalid password format');
    }
    throw error;
  }
}

/**
 * Verify plain password against hashed password
 * @param {string} plainPassword - Plain text password
 * @param {string} hashedPassword - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 * @throws {Error} If parameters are invalid or verification fails
 */
export async function verifyPassword(plainPassword, hashedPassword) {
  try {
    if (!plainPassword || typeof plainPassword !== 'string') {
      throw new Error('Plain password must be a valid string');
    }

    if (!hashedPassword || typeof hashedPassword !== 'string') {
      throw new Error('Hashed password must be a valid string');
    }

    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    if (error.message.includes('data and hash arguments required')) {
      throw new Error('Invalid password format for comparison');
    }
    throw error;
  }
}

/**
 * Extract and return user data from JWT token
 * @param {string} token - JWT token containing user data
 * @returns {Promise<Object>} User data from token payload
 * @throws {TokenExpiredError} If token has expired
 * @throws {InvalidTokenError} If token is invalid
 * @throws {UserNotFoundError} If user doesn't exist
 */
export async function getCurrentUser(token) {
  try {
    const payload = await verifyToken(token);
    
    if (!payload.userId && !payload.id) {
      throw new InvalidTokenError('Token does not contain valid user identifier');
    }

    const userId = payload.userId || payload.id;
    const user = await User.findById(userId);
    
    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  } catch (error) {
    if (error instanceof TokenExpiredError || 
        error instanceof InvalidTokenError || 
        error instanceof UserNotFoundError) {
      throw error;
    }
    throw new AuthenticationError('Failed to get current user: ' + error.message);
  }
}

/**
 * OAuth2 Bearer token extraction middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 */
export function oauth2Scheme(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Authorization header missing',
        detail: 'Bearer token required'
      });
    }

    if (!authHeader.startsWith(BEARER_PREFIX)) {
      return res.status(401).json({ 
        error: 'Invalid authorization header format',
        detail: 'Bearer token required'
      });
    }

    const token = authHeader.slice(BEARER_PREFIX.length);
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Token missing',
        detail: 'Bearer token required'
      });
    }

    req.token = token;
    next();
  } catch (error) {
    return res.status(500).json({ 
      error: 'Authentication processing error',
      detail: 'Internal server error'
    });
  }
}

/**
 * Middleware to get current user from token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 */
export async function getCurrentUserMiddleware(req, res, next) {
  try {
    if (!req.token) {
      return res.status(401).json({ 
        error: 'Token not found',
        detail: 'Use oauth2Scheme middleware first'
      });
    }

    const user = await getCurrentUser(req.token);
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return res.status(401).json({ 
        error: 'Token expired',
        detail: error.message
      });
    }
    if (error instanceof InvalidTokenError) {
      return res.status(401).json({ 
        error: 'Invalid token',
        detail: error.message
      });
    }
    if (error instanceof UserNotFoundError) {
      return res.status(404).json({ 
        error: 'User not found',
        detail: error.message
      });
    }
    return res.status(500).json({ 
      error: 'Authentication error',
      detail: 'Internal server error'
    });
  }
}

/**
 * Middleware to get current active user from token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 */
export async function getCurrentActiveUser(req, res, next) {
  try {
    if (!req.token) {
      return res.status(401).json({ 
        error: 'Token not found',
        detail: 'Use oauth2Scheme middleware first'
      });
    }

    const user = await getCurrentUser(req.token);
    
    // Check if user is active (assuming user model has isActive property)
    if (user.isActive === false || user.status === 'inactive') {
      throw new InactiveUserError();
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return res.status(401).json({ 
        error: 'Token expired',
        detail: error.message
      });
    }
    if (error instanceof InvalidTokenError) {
      return res.status(401).json({ 
        error: 'Invalid token',
        detail: error.message
      });
    }
    if (error instanceof UserNotFoundError) {
      return res.status(404).json({ 
        error: 'User not found',
        detail: error.message
      });
    }
    if (error instanceof InactiveUserError) {
      return res.status(403).json({ 
        error: 'User inactive',
        detail: error.message
      });
    }
    return res.status(500).json({ 
      error: 'Authentication error',
      detail: 'Internal server error'
    });
  }
}

/**
 * Utility function to extract token from authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null if invalid
 */
export function extractTokenFromHeader(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (!authHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authHeader.slice(BEARER_PREFIX.length);
  return token || null;
}

// Export all functions and middleware
export default {
  createAccessToken,
  verifyToken,
  getPasswordHash,
  verifyPassword,
  getCurrentUser,
  oauth2Scheme,
  getCurrentUserMiddleware,
  getCurrentActiveUser,
  extractTokenFromHeader,
  // Error classes
  AuthenticationError,
  TokenExpiredError,
  InvalidTokenError,
  UserNotFoundError,
  InactiveUserError
};