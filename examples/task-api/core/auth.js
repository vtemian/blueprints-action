/**
 * @fileoverview Core Authentication and Authorization Module
 * @module core.auth
 * @version 1.0.0
 * @description Production-ready authentication utilities with JWT token management,
 * password hashing, and user verification capabilities.
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import User from '@models.user';

// Initialize environment variables
dotenv.config();

// Constants
const SALT_ROUNDS = 12;
const TOKEN_EXPIRATION = 86400; // 24 hours in seconds
const JWT_ALGORITHM = 'HS256';

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (process.env.JWT_SECRET.length < 32) {
  console.warn('Warning: JWT_SECRET should be at least 32 characters long for security');
}

/**
 * Custom error classes for authentication failures
 */
class AuthenticationError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
  }
}

class TokenError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = 'TokenError';
    this.statusCode = statusCode;
  }
}

class ValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
  }
}

/**
 * Validates input parameters for authentication functions
 * @private
 * @param {*} value - Value to validate
 * @param {string} paramName - Parameter name for error messages
 * @param {string} expectedType - Expected type ('string', 'object', etc.)
 * @throws {ValidationError} When validation fails
 */
const validateInput = (value, paramName, expectedType = 'string') => {
  if (value === null || value === undefined) {
    throw new ValidationError(`${paramName} is required`);
  }
  
  if (expectedType === 'string' && (typeof value !== 'string' || value.trim().length === 0)) {
    throw new ValidationError(`${paramName} must be a non-empty string`);
  }
  
  if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
    throw new ValidationError(`${paramName} must be a valid object`);
  }
};

/**
 * Creates a JWT access token with 24-hour expiration
 * @async
 * @param {Object} data - Payload data to include in the token
 * @param {string|number} data.userId - User identifier
 * @param {string} [data.email] - User email
 * @param {string} [data.role] - User role
 * @returns {Promise<string>} JWT access token
 * @throws {ValidationError} When data is invalid - HTTP 400
 * @throws {AuthenticationError} When token creation fails - HTTP 500
 * 
 * @example
 * const token = await createAccessToken({ userId: 123, email: 'user@example.com', role: 'user' });
 */
export const createAccessToken = async (data) => {
  try {
    validateInput(data, 'data', 'object');
    
    if (!data.userId) {
      throw new ValidationError('data.userId is required');
    }

    // Create payload with standard JWT claims
    const payload = {
      userId: data.userId,
      email: data.email || null,
      role: data.role || 'user',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRATION
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      algorithm: JWT_ALGORITHM,
      expiresIn: TOKEN_EXPIRATION
    });

    return token;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new AuthenticationError('Failed to create access token', 500);
  }
};

/**
 * Verifies and decodes a JWT token
 * @async
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Decoded token payload
 * @throws {ValidationError} When token format is invalid - HTTP 400
 * @throws {TokenError} When token is invalid or expired - HTTP 401
 * 
 * @example
 * const payload = await verifyToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 */
export const verifyToken = async (token) => {
  try {
    validateInput(token, 'token');
    
    // Basic token format validation
    if (!token.includes('.') || token.split('.').length !== 3) {
      throw new ValidationError('Invalid token format');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM]
    });

    return decoded;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      throw new TokenError('Invalid token');
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenError('Token has expired');
    }
    
    if (error instanceof jwt.NotBeforeError) {
      throw new TokenError('Token not active yet');
    }
    
    throw new TokenError('Token verification failed');
  }
};

/**
 * Hashes a password using bcrypt with 12 salt rounds
 * @async
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password
 * @throws {ValidationError} When password is invalid - HTTP 400
 * @throws {AuthenticationError} When hashing fails - HTTP 500
 * 
 * @example
 * const hashedPassword = await getPasswordHash('mySecurePassword123');
 */
export const getPasswordHash = async (password) => {
  try {
    validateInput(password, 'password');
    
    if (password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters long');
    }
    
    if (password.length > 128) {
      throw new ValidationError('Password must not exceed 128 characters');
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    return hash;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new AuthenticationError('Failed to hash password', 500);
  }
};

/**
 * Verifies a plain password against a hashed password
 * @async
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 * @throws {ValidationError} When parameters are invalid - HTTP 400
 * @throws {AuthenticationError} When verification fails - HTTP 500
 * 
 * @example
 * const isValid = await verifyPassword('myPassword', '$2b$12$...');
 */
export const verifyPassword = async (plainPassword, hashedPassword) => {
  try {
    validateInput(plainPassword, 'plainPassword');
    validateInput(hashedPassword, 'hashedPassword');
    
    // Basic bcrypt hash format validation
    if (!hashedPassword.startsWith('$2b$') && !hashedPassword.startsWith('$2a$')) {
      throw new ValidationError('Invalid hash format');
    }

    // Use constant-time comparison to prevent timing attacks
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new AuthenticationError('Password verification failed', 500);
  }
};

/**
 * Extracts and returns current user data from JWT token
 * @async
 * @param {string} token - JWT token containing user data
 * @returns {Promise<Object|null>} User object or null if not found
 * @throws {ValidationError} When token is invalid - HTTP 400
 * @throws {TokenError} When token verification fails - HTTP 401
 * @throws {AuthenticationError} When user lookup fails - HTTP 500
 * 
 * @example
 * const user = await getCurrentUser('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 */
export const getCurrentUser = async (token) => {
  try {
    validateInput(token, 'token');
    
    // Verify token and extract payload
    const payload = await verifyToken(token);
    
    if (!payload.userId) {
      throw new TokenError('Token does not contain valid user information');
    }

    // Fetch user from database
    try {
      const user = await User.findById(payload.userId);
      
      if (!user) {
        throw new AuthenticationError('User not found');
      }
      
      // Return user data without sensitive information
      const { password, ...userWithoutPassword } = user.toObject ? user.toObject() : user;
      return userWithoutPassword;
    } catch (dbError) {
      if (dbError instanceof AuthenticationError) {
        throw dbError;
      }
      throw new AuthenticationError('Failed to retrieve user data', 500);
    }
  } catch (error) {
    if (error instanceof ValidationError || 
        error instanceof TokenError || 
        error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Failed to get current user', 500);
  }
};

/**
 * Utility function to extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null
 * 
 * @example
 * const token = extractTokenFromHeader('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 */
export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
};

/**
 * Middleware function for Express.js to authenticate requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * 
 * @example
 * app.use('/protected', authenticateMiddleware);
 */
export const authenticateMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No valid token provided'
      });
    }
    
    const user = await getCurrentUser(token);
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    const statusCode = error.statusCode || 401;
    res.status(statusCode).json({
      error: error.name || 'AuthenticationError',
      message: error.message || 'Authentication failed'
    });
  }
};

// Export error classes for use in other modules
export {
  AuthenticationError,
  TokenError,
  ValidationError
};

// Export constants for configuration
export const AUTH_CONSTANTS = {
  SALT_ROUNDS,
  TOKEN_EXPIRATION,
  JWT_ALGORITHM
};