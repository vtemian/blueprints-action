/**
 * Core Authentication Module
 * Provides JWT token management and password security utilities
 * @module core.auth
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration constants
const AUTH_CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  BCRYPT_SALT_ROUNDS: 12,
  JWT_ALGORITHM: 'HS256'
};

// Validate required environment variables
if (!AUTH_CONFIG.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Custom Authentication Error Classes
 */
class AuthenticationError extends Error {
  constructor(message, code = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
  }
}

class TokenError extends AuthenticationError {
  constructor(message, code = 'TOKEN_ERROR') {
    super(message, code);
    this.name = 'TokenError';
  }
}

class PasswordError extends AuthenticationError {
  constructor(message, code = 'PASSWORD_ERROR') {
    super(message, code);
    this.name = 'PasswordError';
  }
}

/**
 * Input validation helper
 * @private
 * @param {*} value - Value to validate
 * @param {string} paramName - Parameter name for error messages
 * @param {string} expectedType - Expected type
 * @throws {AuthenticationError} When validation fails
 */
function validateInput(value, paramName, expectedType = 'string') {
  if (value === null || value === undefined) {
    throw new AuthenticationError(`${paramName} is required`);
  }
  
  if (expectedType === 'string' && (typeof value !== 'string' || value.trim() === '')) {
    throw new AuthenticationError(`${paramName} must be a non-empty string`);
  }
  
  if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
    throw new AuthenticationError(`${paramName} must be an object`);
  }
}

/**
 * Creates a JWT access token with user data
 * @param {Object} data - User data to include in token payload
 * @param {string|number} data.userId - User ID
 * @param {string} data.email - User email
 * @param {string} [data.role] - User role
 * @param {Object} [options] - Additional token options
 * @param {string} [options.expiresIn] - Token expiration time
 * @returns {Promise<string>} JWT access token
 * @throws {AuthenticationError} When data is invalid
 * @throws {TokenError} When token creation fails
 */
export async function createAccessToken(data, options = {}) {
  try {
    validateInput(data, 'data', 'object');
    validateInput(data.userId, 'data.userId');
    validateInput(data.email, 'data.email');

    const payload = {
      userId: data.userId,
      email: data.email,
      role: data.role || 'user',
      iat: Math.floor(Date.now() / 1000),
      type: 'access'
    };

    const tokenOptions = {
      algorithm: AUTH_CONFIG.JWT_ALGORITHM,
      expiresIn: options.expiresIn || AUTH_CONFIG.JWT_EXPIRES_IN,
      issuer: 'core.auth',
      audience: 'api'
    };

    return new Promise((resolve, reject) => {
      jwt.sign(payload, AUTH_CONFIG.JWT_SECRET, tokenOptions, (err, token) => {
        if (err) {
          reject(new TokenError('Failed to create access token', 'TOKEN_CREATION_FAILED'));
        } else {
          resolve(token);
        }
      });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new TokenError('Unexpected error during token creation', 'TOKEN_CREATION_ERROR');
  }
}

/**
 * Verifies and decodes a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Decoded token payload
 * @throws {TokenError} When token is invalid, expired, or malformed
 */
export async function verifyToken(token) {
  try {
    validateInput(token, 'token');

    const verifyOptions = {
      algorithms: [AUTH_CONFIG.JWT_ALGORITHM],
      issuer: 'core.auth',
      audience: 'api'
    };

    return new Promise((resolve, reject) => {
      jwt.verify(token, AUTH_CONFIG.JWT_SECRET, verifyOptions, (err, decoded) => {
        if (err) {
          if (err.name === 'TokenExpiredError') {
            reject(new TokenError('Token has expired', 'TOKEN_EXPIRED'));
          } else if (err.name === 'JsonWebTokenError') {
            reject(new TokenError('Invalid token format', 'TOKEN_INVALID'));
          } else if (err.name === 'NotBeforeError') {
            reject(new TokenError('Token not active yet', 'TOKEN_NOT_ACTIVE'));
          } else {
            reject(new TokenError('Token verification failed', 'TOKEN_VERIFICATION_FAILED'));
          }
        } else {
          // Validate token type
          if (decoded.type !== 'access') {
            reject(new TokenError('Invalid token type', 'TOKEN_TYPE_INVALID'));
          } else {
            resolve(decoded);
          }
        }
      });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new TokenError('Unexpected error during token verification', 'TOKEN_VERIFICATION_ERROR');
  }
}

/**
 * Hashes a password using bcrypt
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password
 * @throws {PasswordError} When password is invalid or hashing fails
 */
export async function getPasswordHash(password) {
  try {
    validateInput(password, 'password');

    if (password.length < 1) {
      throw new PasswordError('Password cannot be empty', 'PASSWORD_EMPTY');
    }

    if (password.length > 128) {
      throw new PasswordError('Password too long (max 128 characters)', 'PASSWORD_TOO_LONG');
    }

    const hash = await bcrypt.hash(password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
    return hash;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new PasswordError('Failed to hash password', 'PASSWORD_HASH_FAILED');
  }
}

/**
 * Verifies a plain password against a hashed password
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 * @throws {PasswordError} When parameters are invalid or verification fails
 */
export async function verifyPassword(plainPassword, hashedPassword) {
  try {
    validateInput(plainPassword, 'plainPassword');
    validateInput(hashedPassword, 'hashedPassword');

    if (plainPassword.length < 1) {
      throw new PasswordError('Password cannot be empty', 'PASSWORD_EMPTY');
    }

    if (plainPassword.length > 128) {
      throw new PasswordError('Password too long (max 128 characters)', 'PASSWORD_TOO_LONG');
    }

    // Validate hash format (bcrypt hashes start with $2a$, $2b$, or $2y$)
    if (!hashedPassword.match(/^\$2[aby]\$\d{2}\$.{53}$/)) {
      throw new PasswordError('Invalid hash format', 'INVALID_HASH_FORMAT');
    }

    const isValid = await bcrypt.compare(plainPassword, hashedPassword);
    return isValid;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new PasswordError('Failed to verify password', 'PASSWORD_VERIFICATION_FAILED');
  }
}

/**
 * Extracts and returns current user data from a valid JWT token
 * @param {string} token - JWT token containing user data
 * @returns {Promise<Object>} User data object
 * @throws {TokenError} When token is invalid or user data extraction fails
 */
export async function getCurrentUser(token) {
  try {
    const decoded = await verifyToken(token);
    
    // Extract user data from token payload
    const userData = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      iat: decoded.iat,
      exp: decoded.exp
    };

    // Validate required user data
    if (!userData.userId || !userData.email) {
      throw new TokenError('Invalid user data in token', 'INVALID_USER_DATA');
    }

    return userData;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new TokenError('Failed to extract user data from token', 'USER_EXTRACTION_FAILED');
  }
}

/**
 * Utility function to check if a token is expired without throwing
 * @param {string} token - JWT token to check
 * @returns {Promise<boolean>} True if token is expired, false if valid
 */
export async function isTokenExpired(token) {
  try {
    await verifyToken(token);
    return false;
  } catch (error) {
    if (error instanceof TokenError && error.code === 'TOKEN_EXPIRED') {
      return true;
    }
    // For other errors, consider token as invalid/expired
    return true;
  }
}

/**
 * Utility function to decode token without verification (for debugging)
 * @param {string} token - JWT token to decode
 * @returns {Object|null} Decoded token payload or null if invalid
 */
export function decodeTokenUnsafe(token) {
  try {
    validateInput(token, 'token');
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
}

// Export error classes for external use
export {
  AuthenticationError,
  TokenError,
  PasswordError,
  AUTH_CONFIG
};

// Default export with all functions
export default {
  createAccessToken,
  verifyToken,
  getPasswordHash,
  verifyPassword,
  getCurrentUser,
  isTokenExpired,
  decodeTokenUnsafe,
  AuthenticationError,
  TokenError,
  PasswordError,
  AUTH_CONFIG
};