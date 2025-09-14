/**
 * Core Authentication Module
 * Provides JWT token management, password hashing, and user authentication
 * @module core.auth
 * @version 1.0.0
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { promisify } from 'util';

// Configuration constants
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRES_IN = '24h';
const BCRYPT_SALT_ROUNDS = 12;
const BEARER_PREFIX = 'Bearer ';

// Validate JWT_SECRET on module load
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Custom Authentication Error Classes
 */
export class AuthenticationError extends Error {
  constructor(message, code = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
    this.statusCode = 401;
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor(message = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED');
    this.name = 'TokenExpiredError';
  }
}

export class InvalidTokenError extends AuthenticationError {
  constructor(message = 'Invalid token provided') {
    super(message, 'INVALID_TOKEN');
    this.name = 'InvalidTokenError';
  }
}

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

/**
 * Validates input parameters
 * @private
 * @param {*} value - Value to validate
 * @param {string} name - Parameter name for error messages
 * @param {string} type - Expected type
 * @throws {ValidationError} When validation fails
 */
const validateInput = (value, name, type = 'string') => {
  if (value === null || value === undefined) {
    throw new ValidationError(`${name} is required`, name);
  }
  
  if (type === 'string' && (typeof value !== 'string' || value.trim().length === 0)) {
    throw new ValidationError(`${name} must be a non-empty string`, name);
  }
  
  if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
    throw new ValidationError(`${name} must be an object`, name);
  }
};

/**
 * Sanitizes user data for JWT payload
 * @private
 * @param {Object} userData - Raw user data
 * @returns {Object} Sanitized user data
 */
const sanitizeUserData = (userData) => {
  const { password, ...sanitizedData } = userData;
  return sanitizedData;
};

/**
 * Creates a JWT access token with 24-hour expiration
 * @async
 * @param {Object} data - User data to encode in token
 * @param {string|number} data.id - User ID
 * @param {string} data.email - User email
 * @param {string} data.username - Username
 * @param {boolean} [data.isActive=true] - User active status
 * @returns {Promise<string>} JWT access token
 * @throws {ValidationError} When input validation fails
 * @throws {AuthenticationError} When token creation fails
 * 
 * @example
 * const token = await createAccessToken({
 *   id: 123,
 *   email: 'user@example.com',
 *   username: 'johndoe',
 *   isActive: true
 * });
 */
export const createAccessToken = async (data) => {
  try {
    validateInput(data, 'data', 'object');
    validateInput(data.id, 'data.id');
    validateInput(data.email, 'data.email');
    validateInput(data.username, 'data.username');

    // Sanitize data to remove sensitive information
    const payload = sanitizeUserData(data);
    
    // Add token metadata
    const tokenPayload = {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      type: 'access_token'
    };

    const signAsync = promisify(jwt.sign);
    const token = await signAsync(tokenPayload, JWT_SECRET, {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'core.auth',
      audience: 'api'
    });

    return token;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new AuthenticationError(`Failed to create access token: ${error.message}`, 'TOKEN_CREATION_FAILED');
  }
};

/**
 * Verifies and decodes a JWT token
 * @async
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Decoded token payload
 * @throws {ValidationError} When token format is invalid
 * @throws {TokenExpiredError} When token has expired
 * @throws {InvalidTokenError} When token is invalid or malformed
 * 
 * @example
 * try {
 *   const decoded = await verifyToken(token);
 *   console.log('User ID:', decoded.id);
 * } catch (error) {
 *   console.error('Token verification failed:', error.message);
 * }
 */
export const verifyToken = async (token) => {
  try {
    validateInput(token, 'token');

    // Remove Bearer prefix if present
    const cleanToken = token.startsWith(BEARER_PREFIX) 
      ? token.slice(BEARER_PREFIX.length) 
      : token;

    if (!cleanToken) {
      throw new InvalidTokenError('Token is empty after processing');
    }

    const verifyAsync = promisify(jwt.verify);
    const decoded = await verifyAsync(cleanToken, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
      issuer: 'core.auth',
      audience: 'api'
    });

    // Validate token type
    if (decoded.type !== 'access_token') {
      throw new InvalidTokenError('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    
    if (error.name === 'TokenExpiredError') {
      throw new TokenExpiredError('Token has expired');
    }
    
    if (error.name === 'JsonWebTokenError') {
      throw new InvalidTokenError(`Invalid token: ${error.message}`);
    }
    
    if (error.name === 'NotBeforeError') {
      throw new InvalidTokenError('Token not active yet');
    }

    throw new InvalidTokenError(`Token verification failed: ${error.message}`);
  }
};

/**
 * Hashes a password using bcrypt with 12 salt rounds
 * @async
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password
 * @throws {ValidationError} When password validation fails
 * @throws {AuthenticationError} When hashing fails
 * 
 * @example
 * const hashedPassword = await getPasswordHash('mySecurePassword123');
 */
export const getPasswordHash = async (password) => {
  try {
    validateInput(password, 'password');
    
    if (password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters long', 'password');
    }
    
    if (password.length > 128) {
      throw new ValidationError('Password must be less than 128 characters', 'password');
    }

    const hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    return hash;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new AuthenticationError(`Password hashing failed: ${error.message}`, 'HASH_FAILED');
  }
};

/**
 * Verifies a plain text password against a hashed password
 * @async
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 * @throws {ValidationError} When input validation fails
 * @throws {AuthenticationError} When verification process fails
 * 
 * @example
 * const isValid = await verifyPassword('userInput123', storedHashedPassword);
 * if (isValid) {
 *   console.log('Password is correct');
 * }
 */
export const verifyPassword = async (plainPassword, hashedPassword) => {
  try {
    validateInput(plainPassword, 'plainPassword');
    validateInput(hashedPassword, 'hashedPassword');

    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new AuthenticationError(`Password verification failed: ${error.message}`, 'VERIFY_FAILED');
  }
};

/**
 * Extracts and returns current user data from a valid JWT token
 * @async
 * @param {string} token - JWT token (with or without Bearer prefix)
 * @returns {Promise<Object>} User data from token
 * @throws {ValidationError} When token format is invalid
 * @throws {TokenExpiredError} When token has expired
 * @throws {InvalidTokenError} When token is invalid
 * @throws {AuthenticationError} When user is inactive
 * 
 * @example
 * const currentUser = await getCurrentUser(authHeader);
 * console.log(`Welcome, ${currentUser.username}!`);
 */
export const getCurrentUser = async (token) => {
  try {
    const decoded = await verifyToken(token);
    
    // Check if user is active
    if (decoded.hasOwnProperty('isActive') && !decoded.isActive) {
      throw new AuthenticationError('User account is inactive', 'USER_INACTIVE');
    }

    // Return user data without JWT metadata
    const { iat, exp, iss, aud, type, ...userData } = decoded;
    
    return {
      id: userData.id,
      email: userData.email,
      username: userData.username,
      isActive: userData.isActive !== false, // Default to true if not specified
      ...userData // Include any additional user properties
    };
  } catch (error) {
    // Re-throw authentication errors as-is
    if (error instanceof AuthenticationError || 
        error instanceof TokenExpiredError || 
        error instanceof InvalidTokenError ||
        error instanceof ValidationError) {
      throw error;
    }
    
    throw new AuthenticationError(`Failed to get current user: ${error.message}`, 'GET_USER_FAILED');
  }
};

/**
 * Utility function to extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null if invalid format
 * 
 * @example
 * const token = extractTokenFromHeader(req.headers.authorization);
 * if (token) {
 *   const user = await getCurrentUser(token);
 * }
 */
export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  
  if (!authHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }
  
  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  return token || null;
};

/**
 * Middleware helper for Express.js applications
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
        code: 'NO_TOKEN'
      });
    }
    
    const user = await getCurrentUser(token);
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    const statusCode = error.statusCode || 401;
    res.status(statusCode).json({
      error: error.message,
      code: error.code || 'AUTH_ERROR'
    });
  }
};

// Export configuration constants for external use
export const AUTH_CONFIG = {
  JWT_ALGORITHM,
  JWT_EXPIRES_IN,
  BCRYPT_SALT_ROUNDS,
  BEARER_PREFIX
};

/**
 * Module health check - validates configuration
 * @returns {Object} Health status and configuration info
 */
export const getModuleHealth = () => {
  return {
    status: 'healthy',
    config: {
      jwtConfigured: !!JWT_SECRET,
      algorithm: JWT_ALGORITHM,
      tokenExpiry: JWT_EXPIRES_IN,
      saltRounds: BCRYPT_SALT_ROUNDS
    },
    timestamp: new Date().toISOString()
  };
};