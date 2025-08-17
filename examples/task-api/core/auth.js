/**
 * Authentication and Authorization Module
 * Provides JWT token management, password security, and Express middleware
 * @module core.auth
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Configuration constants
const SALT_ROUNDS = 12;
const TOKEN_EXPIRATION = '24h';
const JWT_ALGORITHM = 'HS256';
const BEARER_PREFIX = 'Bearer ';

// Environment variable validation
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}

/**
 * Custom error classes for better error handling
 */
class AuthenticationError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = 'AuthenticationError';
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
 * Validates input parameters for null, undefined, or empty values
 * @param {*} value - Value to validate
 * @param {string} paramName - Parameter name for error messages
 * @throws {ValidationError} When validation fails
 */
const validateInput = (value, paramName) => {
  if (value === null || value === undefined) {
    throw new ValidationError(`${paramName} is required and cannot be null or undefined`);
  }
  
  if (typeof value === 'string' && value.trim().length === 0) {
    throw new ValidationError(`${paramName} cannot be empty`);
  }
};

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @throws {ValidationError} When password doesn't meet requirements
 */
const validatePassword = (password) => {
  validateInput(password, 'Password');
  
  if (typeof password !== 'string') {
    throw new ValidationError('Password must be a string');
  }
  
  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long');
  }
  
  if (password.length > 128) {
    throw new ValidationError('Password must not exceed 128 characters');
  }
};

/**
 * Creates a JWT access token with the provided data
 * @param {Object} data - Payload data to include in the token
 * @param {string|number} data.userId - User identifier
 * @param {string} [data.email] - User email
 * @param {string} [data.role] - User role
 * @returns {Promise<string>} JWT access token
 * @throws {ValidationError} When data is invalid
 * @throws {Error} When token generation fails
 */
export const createAccessToken = async (data) => {
  try {
    validateInput(data, 'Token data');
    
    if (typeof data !== 'object' || Array.isArray(data)) {
      throw new ValidationError('Token data must be an object');
    }
    
    validateInput(data.userId, 'User ID');
    
    const payload = {
      userId: data.userId,
      email: data.email || null,
      role: data.role || 'user',
      iat: Math.floor(Date.now() / 1000),
      type: 'access'
    };
    
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRATION,
      algorithm: JWT_ALGORITHM,
      issuer: 'core.auth',
      audience: 'api'
    });
    
    return token;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new Error(`Failed to create access token: ${error.message}`);
  }
};

/**
 * Verifies and decodes a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Decoded token payload
 * @throws {ValidationError} When token format is invalid
 * @throws {AuthenticationError} When token is invalid or expired
 */
export const verifyToken = async (token) => {
  try {
    validateInput(token, 'Token');
    
    if (typeof token !== 'string') {
      throw new ValidationError('Token must be a string');
    }
    
    // Remove Bearer prefix if present
    const cleanToken = token.startsWith(BEARER_PREFIX) 
      ? token.slice(BEARER_PREFIX.length) 
      : token;
    
    if (!cleanToken) {
      throw new ValidationError('Token cannot be empty after removing Bearer prefix');
    }
    
    const decoded = jwt.verify(cleanToken, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
      issuer: 'core.auth',
      audience: 'api'
    });
    
    // Validate token type
    if (decoded.type !== 'access') {
      throw new AuthenticationError('Invalid token type');
    }
    
    return decoded;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid token format');
      }
      if (error.name === 'NotBeforeError') {
        throw new AuthenticationError('Token not active yet');
      }
    }
    
    throw new AuthenticationError(`Token verification failed: ${error.message}`);
  }
};

/**
 * Hashes a password using bcrypt
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password
 * @throws {ValidationError} When password is invalid
 * @throws {Error} When hashing fails
 */
export const getPasswordHash = async (password) => {
  try {
    validatePassword(password);
    
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    return hash;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new Error(`Failed to hash password: ${error.message}`);
  }
};

/**
 * Verifies a plain password against a hashed password
 * @param {string} plainPassword - Plain text password
 * @param {string} hashedPassword - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 * @throws {ValidationError} When parameters are invalid
 * @throws {Error} When verification fails
 */
export const verifyPassword = async (plainPassword, hashedPassword) => {
  try {
    validateInput(plainPassword, 'Plain password');
    validateInput(hashedPassword, 'Hashed password');
    
    if (typeof plainPassword !== 'string') {
      throw new ValidationError('Plain password must be a string');
    }
    
    if (typeof hashedPassword !== 'string') {
      throw new ValidationError('Hashed password must be a string');
    }
    
    // Basic bcrypt hash format validation
    if (!hashedPassword.startsWith('$2') || hashedPassword.length < 59) {
      throw new ValidationError('Invalid hash format');
    }
    
    const isValid = await bcrypt.compare(plainPassword, hashedPassword);
    return isValid;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new Error(`Failed to verify password: ${error.message}`);
  }
};

/**
 * Extracts and validates user information from a JWT token
 * @param {string} token - JWT token containing user data
 * @returns {Promise<Object>} User information from token
 * @throws {ValidationError|AuthenticationError} When token is invalid
 */
export const getCurrentUser = async (token) => {
  try {
    const decoded = await verifyToken(token);
    
    const user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      iat: decoded.iat,
      exp: decoded.exp
    };
    
    return user;
  } catch (error) {
    throw error; // Re-throw validation and authentication errors
  }
};

/**
 * Extracts Bearer token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null if not found
 */
const extractBearerToken = (authHeader) => {
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
 * Express middleware to authenticate requests using JWT tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);
    
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Bearer token must be provided in Authorization header'
      });
    }
    
    const decoded = await verifyToken(token);
    req.user = decoded;
    req.token = token;
    
    next();
  } catch (error) {
    const statusCode = error.statusCode || 401;
    return res.status(statusCode).json({
      error: error.name || 'AuthenticationError',
      message: error.message
    });
  }
};

/**
 * Express middleware to verify user authentication and attach user data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);
    
    if (!token) {
      return res.status(401).json({
        error: 'AuthenticationRequired',
        message: 'Valid authentication token is required'
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
};

/**
 * Express middleware to verify active user status
 * Requires user to be authenticated first
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const requireActiveUser = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'AuthenticationRequired',
        message: 'User authentication required before checking active status'
      });
    }
    
    // Check if token is not expired (additional safety check)
    const currentTime = Math.floor(Date.now() / 1000);
    if (req.user.exp && req.user.exp < currentTime) {
      return res.status(401).json({
        error: 'TokenExpired',
        message: 'Authentication token has expired'
      });
    }
    
    // Verify user has required fields
    if (!req.user.userId) {
      return res.status(401).json({
        error: 'InvalidUser',
        message: 'User information is incomplete'
      });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      error: 'AuthorizationError',
      message: 'Failed to verify user status'
    });
  }
};

/**
 * Express middleware factory for role-based authorization
 * @param {string|string[]} allowedRoles - Role or array of roles allowed to access the route
 * @returns {Function} Express middleware function
 */
export const requireRole = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'AuthenticationRequired',
          message: 'User authentication required for role verification'
        });
      }
      
      const userRole = req.user.role;
      if (!userRole || !roles.includes(userRole)) {
        return res.status(403).json({
          error: 'InsufficientPermissions',
          message: `Access denied. Required roles: ${roles.join(', ')}`
        });
      }
      
      next();
    } catch (error) {
      return res.status(500).json({
        error: 'AuthorizationError',
        message: 'Failed to verify user role'
      });
    }
  };
};

// Export error classes for external use
export { AuthenticationError, ValidationError };

// Export configuration constants
export const AUTH_CONFIG = {
  SALT_ROUNDS,
  TOKEN_EXPIRATION,
  JWT_ALGORITHM,
  BEARER_PREFIX
};