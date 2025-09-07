/**
 * Authentication and Authorization Module
 * Provides JWT token management and password security utilities
 * @module core.auth
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration constants
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';
const BCRYPT_SALT_ROUNDS = 12;
const TOKEN_ALGORITHM = 'HS256';

// Validate required environment variables
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (JWT_SECRET.length < 32) {
  console.warn('Warning: JWT_SECRET should be at least 32 characters long for security');
}

/**
 * Logs security events without exposing sensitive data
 * @private
 * @param {string} event - Event type
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata (sensitive data will be filtered)
 */
const logSecurityEvent = (event, message, metadata = {}) => {
  const sanitizedMetadata = { ...metadata };
  // Remove sensitive fields from logs
  delete sanitizedMetadata.password;
  delete sanitizedMetadata.token;
  delete sanitizedMetadata.hash;
  
  console.log(`[AUTH:${event}] ${message}`, sanitizedMetadata);
};

/**
 * Validates input parameters
 * @private
 * @param {*} value - Value to validate
 * @param {string} name - Parameter name for error messages
 * @param {string} type - Expected type
 * @throws {Error} If validation fails
 */
const validateInput = (value, name, type = 'string') => {
  if (value === null || value === undefined) {
    throw new Error(`${name} is required`);
  }
  
  if (type === 'string' && (typeof value !== 'string' || value.trim().length === 0)) {
    throw new Error(`${name} must be a non-empty string`);
  }
  
  if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
    throw new Error(`${name} must be an object`);
  }
};

/**
 * Creates a JWT access token with 24-hour expiration
 * @param {Object} data - User data to encode in the token
 * @param {string|number} data.userId - User identifier
 * @param {string} [data.email] - User email
 * @param {string} [data.role] - User role
 * @returns {Promise<Object>} Success object with token or error object
 * 
 * @example
 * const result = await createAccessToken({ userId: 123, email: 'user@example.com', role: 'user' });
 * if (result.success) {
 *   console.log('Token:', result.data.token);
 * }
 */
export const createAccessToken = async (data) => {
  try {
    validateInput(data, 'data', 'object');
    validateInput(data.userId, 'data.userId');

    // Create payload with standard JWT claims
    const payload = {
      userId: data.userId,
      email: data.email || null,
      role: data.role || 'user',
      iat: Math.floor(Date.now() / 1000),
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      algorithm: TOKEN_ALGORITHM,
      issuer: 'core.auth',
      audience: 'app-users'
    });

    logSecurityEvent('TOKEN_CREATED', 'Access token created successfully', {
      userId: data.userId,
      role: data.role
    });

    return {
      success: true,
      data: {
        token,
        expiresIn: JWT_EXPIRES_IN,
        tokenType: 'Bearer'
      }
    };

  } catch (error) {
    logSecurityEvent('TOKEN_CREATE_ERROR', 'Failed to create access token', {
      error: error.message
    });

    return {
      success: false,
      error: error.message || 'Failed to create access token'
    };
  }
};

/**
 * Verifies and decodes a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Success object with decoded data or error object
 * 
 * @example
 * const result = await verifyToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 * if (result.success) {
 *   console.log('User ID:', result.data.userId);
 * }
 */
export const verifyToken = async (token) => {
  try {
    validateInput(token, 'token');

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace(/^Bearer\s+/, '');

    const decoded = jwt.verify(cleanToken, JWT_SECRET, {
      algorithms: [TOKEN_ALGORITHM],
      issuer: 'core.auth',
      audience: 'app-users'
    });

    logSecurityEvent('TOKEN_VERIFIED', 'Token verified successfully', {
      userId: decoded.userId
    });

    return {
      success: true,
      data: {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        iat: decoded.iat,
        exp: decoded.exp
      }
    };

  } catch (error) {
    let errorMessage = 'Invalid token';
    let logMessage = 'Token verification failed';

    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token has expired';
      logMessage = 'Token expired';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid token format';
      logMessage = 'Invalid token format';
    } else if (error.name === 'NotBeforeError') {
      errorMessage = 'Token not active yet';
      logMessage = 'Token not active';
    }

    logSecurityEvent('TOKEN_VERIFY_ERROR', logMessage, {
      error: error.name,
      hasToken: !!token
    });

    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * Hashes a password using bcrypt with 12 salt rounds
 * @param {string} password - Plain text password to hash
 * @returns {Promise<Object>} Success object with hash or error object
 * 
 * @example
 * const result = await getPasswordHash('mySecurePassword123');
 * if (result.success) {
 *   console.log('Hash:', result.data.hash);
 * }
 */
export const getPasswordHash = async (password) => {
  try {
    validateInput(password, 'password');

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    if (password.length > 128) {
      throw new Error('Password must be less than 128 characters long');
    }

    const hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    logSecurityEvent('PASSWORD_HASHED', 'Password hashed successfully');

    return {
      success: true,
      data: {
        hash,
        saltRounds: BCRYPT_SALT_ROUNDS
      }
    };

  } catch (error) {
    logSecurityEvent('PASSWORD_HASH_ERROR', 'Failed to hash password', {
      error: error.message
    });

    return {
      success: false,
      error: error.message || 'Failed to hash password'
    };
  }
};

/**
 * Verifies a plain password against a bcrypt hash
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Bcrypt hash to compare against
 * @returns {Promise<Object>} Success object with match result or error object
 * 
 * @example
 * const result = await verifyPassword('myPassword', '$2b$12$...');
 * if (result.success && result.data.isMatch) {
 *   console.log('Password is correct');
 * }
 */
export const verifyPassword = async (plainPassword, hashedPassword) => {
  try {
    validateInput(plainPassword, 'plainPassword');
    validateInput(hashedPassword, 'hashedPassword');

    // Validate hash format (bcrypt hashes start with $2a$, $2b$, or $2y$)
    if (!/^\$2[aby]\$\d{2}\$.{53}$/.test(hashedPassword)) {
      throw new Error('Invalid hash format');
    }

    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);

    logSecurityEvent('PASSWORD_VERIFIED', 'Password verification completed', {
      isMatch
    });

    return {
      success: true,
      data: {
        isMatch
      }
    };

  } catch (error) {
    logSecurityEvent('PASSWORD_VERIFY_ERROR', 'Password verification failed', {
      error: error.message
    });

    return {
      success: false,
      error: error.message || 'Failed to verify password'
    };
  }
};

/**
 * Extracts current user data from a valid JWT token
 * @param {string} token - JWT token containing user data
 * @returns {Promise<Object>} Success object with user data or error object
 * 
 * @example
 * const result = await getCurrentUser('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 * if (result.success) {
 *   console.log('Current user:', result.data.user);
 * }
 */
export const getCurrentUser = async (token) => {
  try {
    validateInput(token, 'token');

    const verificationResult = await verifyToken(token);
    
    if (!verificationResult.success) {
      return verificationResult;
    }

    const userData = verificationResult.data;
    
    // Calculate token expiration info
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = userData.exp - now;
    const expiresAt = new Date(userData.exp * 1000);

    logSecurityEvent('USER_DATA_RETRIEVED', 'User data retrieved from token', {
      userId: userData.userId
    });

    return {
      success: true,
      data: {
        user: {
          userId: userData.userId,
          email: userData.email,
          role: userData.role
        },
        tokenInfo: {
          issuedAt: new Date(userData.iat * 1000),
          expiresAt,
          timeUntilExpiry,
          isExpiringSoon: timeUntilExpiry < 3600 // Less than 1 hour
        }
      }
    };

  } catch (error) {
    logSecurityEvent('GET_USER_ERROR', 'Failed to get current user', {
      error: error.message
    });

    return {
      success: false,
      error: error.message || 'Failed to get current user'
    };
  }
};

/**
 * Utility function to check if a token is expiring soon (within 1 hour)
 * @param {string} token - JWT token to check
 * @returns {Promise<Object>} Success object with expiration info or error object
 */
export const isTokenExpiringSoon = async (token) => {
  try {
    const userResult = await getCurrentUser(token);
    
    if (!userResult.success) {
      return userResult;
    }

    return {
      success: true,
      data: {
        isExpiringSoon: userResult.data.tokenInfo.isExpiringSoon,
        timeUntilExpiry: userResult.data.tokenInfo.timeUntilExpiry,
        expiresAt: userResult.data.tokenInfo.expiresAt
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to check token expiration'
    };
  }
};

// Export configuration for testing purposes
export const config = {
  JWT_EXPIRES_IN,
  BCRYPT_SALT_ROUNDS,
  TOKEN_ALGORITHM
};

/**
 * USAGE EXAMPLES:
 * 
 * // Create a new access token
 * const tokenResult = await createAccessToken({
 *   userId: 12345,
 *   email: 'user@example.com',
 *   role: 'admin'
 * });
 * 
 * // Verify an existing token
 * const verifyResult = await verifyToken('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 * 
 * // Hash a password
 * const hashResult = await getPasswordHash('userPassword123');
 * 
 * // Verify a password
 * const passwordResult = await verifyPassword('userPassword123', hashResult.data.hash);
 * 
 * // Get current user from token
 * const currentUser = await getCurrentUser('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 * 
 * // Check if token is expiring soon
 * const expirationCheck = await isTokenExpiringSoon('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 */