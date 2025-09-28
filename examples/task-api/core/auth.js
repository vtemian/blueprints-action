/**
 * Core Authentication and Authorization Module
 * @module core.auth
 * @description Production-ready authentication utilities for Node.js/Express applications
 * @version 1.0.0
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Configuration object for authentication settings
 */
const AUTH_CONFIG = {
  JWT_EXPIRATION: '24h',
  BCRYPT_SALT_ROUNDS: 12,
  MIN_SECRET_LENGTH: 32,
  TOKEN_ALGORITHM: 'HS256'
};

/**
 * Custom error classes for authentication failures
 */
class AuthenticationError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

class TokenExpiredError extends Error {
  constructor(message = 'Token has expired') {
    super(message);
    this.name = 'TokenExpiredError';
    this.statusCode = 401;
    this.isOperational = true;
  }
}

class InvalidTokenError extends Error {
  constructor(message = 'Invalid token provided') {
    super(message);
    this.name = 'InvalidTokenError';
    this.statusCode = 401;
    this.isOperational = true;
  }
}

/**
 * Validates JWT secret configuration
 * @private
 * @throws {Error} If JWT_SECRET is missing or insufficient
 */
const validateJWTSecret = () => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  
  if (secret.length < AUTH_CONFIG.MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${AUTH_CONFIG.MIN_SECRET_LENGTH} characters long`);
  }
  
  return secret;
};

/**
 * Validates password input
 * @private
 * @param {string} password - Password to validate
 * @throws {Error} If password is invalid
 */
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  
  if (password.trim().length === 0) {
    throw new Error('Password cannot be empty or whitespace only');
  }
};

/**
 * Creates a JWT access token with specified data
 * @async
 * @param {Object} data - User data to encode in token
 * @param {string|number} data.id - User ID
 * @param {string} data.email - User email
 * @param {boolean} [data.isActive=true] - User active status
 * @returns {Promise<string>} JWT token
 * @throws {AuthenticationError} If token creation fails
 * 
 * @example
 * const token = await createAccessToken({ id: 123, email: 'user@example.com' });
 */
export const createAccessToken = async (data) => {
  try {
    const secret = validateJWTSecret();
    
    if (!data || typeof data !== 'object') {
      throw new AuthenticationError('Token data must be a valid object', 400);
    }
    
    if (!data.id || !data.email) {
      throw new AuthenticationError('Token data must include id and email', 400);
    }
    
    const payload = {
      id: data.id,
      email: data.email,
      isActive: data.isActive !== undefined ? data.isActive : true,
      iat: Math.floor(Date.now() / 1000)
    };
    
    const token = jwt.sign(payload, secret, {
      expiresIn: AUTH_CONFIG.JWT_EXPIRATION,
      algorithm: AUTH_CONFIG.TOKEN_ALGORITHM
    });
    
    return token;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Failed to create access token');
  }
};

/**
 * Generates a secure hash for the provided password
 * @async
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Bcrypt hash of the password
 * @throws {Error} If password validation fails or hashing fails
 * 
 * @example
 * const hash = await getPasswordHash('mySecurePassword123');
 */
export const getPasswordHash = async (password) => {
  try {
    validatePassword(password);
    
    const hash = await bcrypt.hash(password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
    return hash;
  } catch (error) {
    if (error.message.includes('Password')) {
      throw error;
    }
    throw new Error('Failed to hash password');
  }
};

/**
 * Verifies a plain password against a bcrypt hash
 * @async
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Bcrypt hash to compare against
 * @returns {Promise<boolean>} True if password matches, false otherwise
 * @throws {Error} If validation fails
 * 
 * @example
 * const isValid = await verifyPassword('userInput', storedHash);
 */
export const verifyPassword = async (plainPassword, hashedPassword) => {
  try {
    validatePassword(plainPassword);
    
    if (!hashedPassword || typeof hashedPassword !== 'string') {
      throw new Error('Hashed password must be a non-empty string');
    }
    
    // Use bcrypt.compare to prevent timing attacks
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    if (error.message.includes('Password') || error.message.includes('Hashed')) {
      throw error;
    }
    throw new Error('Failed to verify password');
  }
};

/**
 * Verifies and decodes a JWT token
 * @async
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Decoded token payload
 * @throws {TokenExpiredError} If token is expired
 * @throws {InvalidTokenError} If token is invalid or malformed
 * 
 * @example
 * const payload = await verifyToken(userToken);
 */
export const verifyToken = async (token) => {
  try {
    const secret = validateJWTSecret();
    
    if (!token || typeof token !== 'string') {
      throw new InvalidTokenError('Token must be a non-empty string');
    }
    
    const decoded = jwt.verify(token, secret, {
      algorithms: [AUTH_CONFIG.TOKEN_ALGORITHM]
    });
    
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError('Token has expired');
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      throw new InvalidTokenError('Invalid token signature or format');
    }
    
    if (error instanceof InvalidTokenError) {
      throw error;
    }
    
    throw new InvalidTokenError('Token verification failed');
  }
};

/**
 * Extracts user data from a JWT token
 * @async
 * @param {string} token - JWT token containing user data
 * @returns {Promise<Object>} User data from token
 * @throws {TokenExpiredError|InvalidTokenError} If token is invalid
 * 
 * @example
 * const user = await getCurrentUser(authToken);
 * console.log(user.email); // user@example.com
 */
export const getCurrentUser = async (token) => {
  try {
    const decoded = await verifyToken(token);
    
    return {
      id: decoded.id,
      email: decoded.email,
      isActive: decoded.isActive,
      iat: decoded.iat,
      exp: decoded.exp
    };
  } catch (error) {
    throw error; // Re-throw token verification errors
  }
};

/**
 * Extracts user data and verifies the user is active
 * @async
 * @param {string} token - JWT token containing user data
 * @returns {Promise<Object>} Active user data from token
 * @throws {AuthenticationError} If user is inactive
 * @throws {TokenExpiredError|InvalidTokenError} If token is invalid
 * 
 * @example
 * const activeUser = await getCurrentActiveUser(authToken);
 */
export const getCurrentActiveUser = async (token) => {
  try {
    const user = await getCurrentUser(token);
    
    if (!user.isActive) {
      throw new AuthenticationError('User account is inactive', 403);
    }
    
    return user;
  } catch (error) {
    throw error; // Re-throw all errors
  }
};

/**
 * Express middleware for authenticating JWT tokens
 * Extracts Bearer token from Authorization header and validates it
 * Attaches user data to req.user on successful authentication
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
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
        error: 'Authorization header required',
        code: 'MISSING_AUTH_HEADER'
      });
    }
    
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Invalid authorization header format. Expected: Bearer <token>',
        code: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const token = parts[1];
    
    if (!token) {
      return res.status(401).json({
        error: 'Token not provided',
        code: 'MISSING_TOKEN'
      });
    }
    
    // Verify token and get active user
    const user = await getCurrentActiveUser(token);
    
    // Attach user to request object
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    let statusCode = 401;
    let errorCode = 'AUTH_FAILED';
    let message = 'Authentication failed';
    
    if (error instanceof TokenExpiredError) {
      errorCode = 'TOKEN_EXPIRED';
      message = 'Token has expired';
    } else if (error instanceof InvalidTokenError) {
      errorCode = 'INVALID_TOKEN';
      message = 'Invalid token';
    } else if (error instanceof AuthenticationError) {
      statusCode = error.statusCode;
      errorCode = 'USER_INACTIVE';
      message = error.message;
    }
    
    // In production, avoid exposing detailed error information
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return res.status(statusCode).json({
      error: isDevelopment ? message : 'Authentication failed',
      code: errorCode,
      ...(isDevelopment && { details: error.message })
    });
  }
};

/**
 * Optional middleware for routes that work with or without authentication
 * Similar to authenticateToken but doesn't fail if no token is provided
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next(); // Continue without authentication
    }
    
    const parts = authHeader.split(' ');
    
    if (parts.length === 2 && parts[0] === 'Bearer' && parts[1]) {
      const token = parts[1];
      const user = await getCurrentActiveUser(token);
      req.user = user;
      req.token = token;
    }
    
    next();
  } catch (error) {
    // For optional auth, we continue even if token is invalid
    // but we could log the error for monitoring
    next();
  }
};

// Export error classes for external use
export {
  AuthenticationError,
  TokenExpiredError,
  InvalidTokenError,
  AUTH_CONFIG
};

/**
 * USAGE EXAMPLE:
 * 
 * import express from 'express';
 * import {
 *   createAccessToken,
 *   getPasswordHash,
 *   verifyPassword,
 *   authenticateToken,
 *   AuthenticationError
 * } from './core.auth.js';
 * 
 * const app = express();
 * app.use(express.json());
 * 
 * // Login route
 * app.post('/login', async (req, res) => {
 *   try {
 *     const { email, password } = req.body;
 *     
 *     // Get user from database (pseudo-code)
 *     const user = await getUserByEmail(email);
 *     if (!user) {
 *       return res.status(401).json({ error: 'Invalid credentials' });
 *     }
 *     
 *     // Verify password
 *     const isValidPassword = await verifyPassword(password, user.passwordHash);
 *     if (!isValidPassword) {
 *       return res.status(401).json({ error: 'Invalid credentials' });
 *     }
 *     
 *     // Create token
 *     const token = await createAccessToken({
 *       id: user.id,
 *       email: user.email,
 *       isActive: user.isActive
 *     });
 *     
 *     res.json({ token, user: { id: user.id, email: user.email } });
 *   } catch (error) {
 *     res.status(500).json({ error: 'Login failed' });
 *   }
 * });
 * 
 * // Register route
 * app.post('/register', async (req, res) => {
 *   try {
 *     const { email, password } = req.body;
 *     
 *     // Hash password
 *     const passwordHash = await getPasswordHash(password);
 *     
 *     // Save user to database (pseudo-code)
 *     const user = await createUser({ email, passwordHash });
 *     
 *     // Create token
 *     const token = await createAccessToken({
 *       id: user.id,
 *       email: user.email,
 *       isActive: true
 *     });
 *     
 *     res.status(201).json({ token, user: { id: user.id, email: user.email } });
 *   } catch (error) {
 *     res.status(500).json({ error: 'Registration failed' });
 *   }
 * });
 * 
 * // Protected route
 * app.get('/profile', authenticateToken, (req, res) => {
 *   res.json({
 *     message: 'Protected data',
 *     user: req.user
 *   });
 * });
 * 
 * // Rate limiting considerations:
 * // - Implement rate limiting on login/register routes
 * // - Consider using