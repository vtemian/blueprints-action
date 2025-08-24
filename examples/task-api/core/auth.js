/**
 * Authentication and Authorization Utility Module
 * Provides JWT token management, password handling, and security utilities
 * 
 * Environment Variables Required:
 * - JWT_SECRET: Secret key for JWT signing (minimum 32 characters recommended)
 * 
 * Usage Examples:
 * import { createAccessToken, verifyToken, getPasswordHash } from './auth-utils.js';
 * 
 * // Generate token
 * const token = await createAccessToken({ userId: 123, email: 'user@example.com' });
 * 
 * // Verify token
 * const payload = await verifyToken(token);
 * 
 * // Hash password
 * const hash = await getPasswordHash('userPassword123');
 * 
 * Rate Limiting Considerations:
 * - Implement rate limiting on login endpoints (5 attempts per 15 minutes)
 * - Consider progressive delays for failed authentication attempts
 * - Monitor and log suspicious authentication patterns
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { User } from '@models/user';

// Configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';
const BCRYPT_SALT_ROUNDS = 12;
const TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours in seconds

// Validate JWT secret on module load
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}

if (JWT_SECRET.length < 32) {
    console.warn('WARNING: JWT_SECRET should be at least 32 characters for security');
}

/**
 * Custom Error Classes for Authentication
 */
export class AuthenticationError extends Error {
    constructor(message = 'Authentication failed') {
        super(message);
        this.name = 'AuthenticationError';
        this.statusCode = 401;
    }
}

export class TokenExpiredError extends Error {
    constructor(message = 'Token has expired') {
        super(message);
        this.name = 'TokenExpiredError';
        this.statusCode = 401;
    }
}

export class InvalidTokenError extends Error {
    constructor(message = 'Invalid token provided') {
        super(message);
        this.name = 'InvalidTokenError';
        this.statusCode = 401;
    }
}

/**
 * Input validation utilities
 */
const validateInput = {
    /**
     * Validates that a value is a non-empty string
     * @param {any} value - Value to validate
     * @param {string} fieldName - Name of the field for error messages
     * @throws {Error} If validation fails
     */
    nonEmptyString(value, fieldName) {
        if (typeof value !== 'string' || value.trim().length === 0) {
            throw new Error(`${fieldName} must be a non-empty string`);
        }
    },

    /**
     * Validates that a value is a non-null object
     * @param {any} value - Value to validate
     * @param {string} fieldName - Name of the field for error messages
     * @throws {Error} If validation fails
     */
    nonNullObject(value, fieldName) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`${fieldName} must be a valid object`);
        }
    },

    /**
     * Validates password strength
     * @param {string} password - Password to validate
     * @throws {Error} If password doesn't meet requirements
     */
    passwordStrength(password) {
        if (typeof password !== 'string') {
            throw new Error('Password must be a string');
        }
        
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
        
        if (password.length > 128) {
            throw new Error('Password must not exceed 128 characters');
        }
        
        // Check for at least one number, one lowercase, one uppercase letter
        const hasNumber = /\d/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasUppercase = /[A-Z]/.test(password);
        
        if (!hasNumber || !hasLowercase || !hasUppercase) {
            throw new Error('Password must contain at least one number, one lowercase letter, and one uppercase letter');
        }
    }
};

/**
 * Creates a JWT access token with user data
 * @param {Object} data - User data to include in token payload
 * @param {string|number} data.userId - User ID (required)
 * @param {string} data.email - User email (required)
 * @param {string} [data.role] - User role
 * @param {Object} [data.permissions] - User permissions
 * @returns {Promise<string>} JWT token
 * @throws {Error} If data validation fails or token creation fails
 * 
 * @example
 * const token = await createAccessToken({
 *   userId: 123,
 *   email: 'user@example.com',
 *   role: 'user'
 * });
 */
export async function createAccessToken(data) {
    try {
        // Validate input
        validateInput.nonNullObject(data, 'Token data');
        
        if (!data.userId) {
            throw new Error('userId is required in token data');
        }
        
        if (!data.email || typeof data.email !== 'string') {
            throw new Error('Valid email is required in token data');
        }

        // Create token payload
        const payload = {
            userId: data.userId,
            email: data.email.toLowerCase().trim(),
            role: data.role || 'user',
            permissions: data.permissions || {},
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS
        };

        // Generate token
        const token = jwt.sign(payload, JWT_SECRET, {
            algorithm: 'HS256',
            expiresIn: JWT_EXPIRES_IN
        });

        return token;

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw new AuthenticationError('Failed to create access token');
        }
        throw error;
    }
}

/**
 * Verifies and decodes a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Promise<Object>} Decoded token payload
 * @throws {InvalidTokenError} If token is malformed or invalid
 * @throws {TokenExpiredError} If token has expired
 * @throws {AuthenticationError} For other authentication failures
 * 
 * @example
 * try {
 *   const payload = await verifyToken(userToken);
 *   console.log('User ID:', payload.userId);
 * } catch (error) {
 *   if (error instanceof TokenExpiredError) {
 *     // Handle expired token
 *   }
 * }
 */
export async function verifyToken(token) {
    try {
        // Validate input
        validateInput.nonEmptyString(token, 'Token');

        // Clean token (remove Bearer prefix if present)
        const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
        
        if (!cleanToken) {
            throw new InvalidTokenError('Token cannot be empty');
        }

        // Verify token structure (basic JWT format check)
        const tokenParts = cleanToken.split('.');
        if (tokenParts.length !== 3) {
            throw new InvalidTokenError('Malformed token structure');
        }

        // Verify and decode token
        const decoded = jwt.verify(cleanToken, JWT_SECRET, {
            algorithms: ['HS256']
        });

        // Additional payload validation
        if (!decoded.userId || !decoded.email) {
            throw new InvalidTokenError('Token payload is missing required fields');
        }

        return decoded;

    } catch (error) {
        // Handle specific JWT errors
        if (error.name === 'TokenExpiredError') {
            throw new TokenExpiredError('Token has expired');
        }
        
        if (error.name === 'JsonWebTokenError') {
            throw new InvalidTokenError('Invalid token signature or format');
        }
        
        if (error.name === 'NotBeforeError') {
            throw new InvalidTokenError('Token not active yet');
        }

        // Re-throw custom errors
        if (error instanceof InvalidTokenError || 
            error instanceof TokenExpiredError || 
            error instanceof AuthenticationError) {
            throw error;
        }

        // Generic authentication error for unexpected issues
        throw new AuthenticationError('Token verification failed');
    }
}

/**
 * Hashes a password using bcrypt with salt rounds
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password
 * @throws {Error} If password validation fails or hashing fails
 * 
 * @example
 * const hashedPassword = await getPasswordHash('userPassword123');
 * // Store hashedPassword in database
 */
export async function getPasswordHash(password) {
    try {
        // Validate password
        validateInput.passwordStrength(password);

        // Generate hash
        const hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
        
        if (!hash) {
            throw new Error('Failed to generate password hash');
        }

        return hash;

    } catch (error) {
        // Don't log the actual password for security
        if (error.message.includes('Password')) {
            throw error; // Re-throw validation errors
        }
        
        throw new Error('Password hashing failed');
    }
}

/**
 * Verifies a plain password against a hashed password
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 * @throws {Error} If input validation fails
 * 
 * @example
 * const isValid = await verifyPassword('userInput', storedHashFromDB);
 * if (isValid) {
 *   // Password is correct
 * }
 */
export async function verifyPassword(plainPassword, hashedPassword) {
    try {
        // Validate inputs
        validateInput.nonEmptyString(plainPassword, 'Plain password');
        validateInput.nonEmptyString(hashedPassword, 'Hashed password');

        // Verify password using constant-time comparison
        const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
        
        return Boolean(isMatch);

    } catch (error) {
        // Don't log passwords for security
        if (error.message.includes('password')) {
            throw error; // Re-throw validation errors
        }
        
        // For bcrypt errors, return false instead of throwing
        // This prevents timing attacks and handles corrupted hashes gracefully
        console.error('Password verification error:', error.message);
        return false;
    }
}

/**
 * Extracts and validates current user from JWT token
 * @param {string} token - JWT token containing user information
 * @returns {Promise<Object>} User object with validated data
 * @throws {InvalidTokenError} If token is invalid
 * @throws {TokenExpiredError} If token has expired
 * @throws {AuthenticationError} If user validation fails
 * 
 * @example
 * const currentUser = await getCurrentUser(authToken);
 * console.log('Current user:', currentUser.email);
 */
export async function getCurrentUser(token) {
    try {
        // Verify token and get payload
        const payload = await verifyToken(token);

        // Extract user data from payload
        const userData = {
            userId: payload.userId,
            email: payload.email,
            role: payload.role || 'user',
            permissions: payload.permissions || {},
            tokenIssuedAt: payload.iat,
            tokenExpiresAt: payload.exp
        };

        // Optional: Validate user still exists in database
        // Uncomment if you want to check user existence on every request
        /*
        try {
            const dbUser = await User.findById(userData.userId);
            if (!dbUser || !dbUser.isActive) {
                throw new AuthenticationError('User account is no longer valid');
            }
            
            // Merge database user data if needed
            userData.isActive = dbUser.isActive;
            userData.lastLoginAt = dbUser.lastLoginAt;
        } catch (dbError) {
            throw new AuthenticationError('User validation failed');
        }
        */

        return userData;

    } catch (error) {
        // Re-throw token-related errors
        if (error instanceof InvalidTokenError || 
            error instanceof TokenExpiredError || 
            error instanceof AuthenticationError) {
            throw error;
        }

        // Generic error for unexpected issues
        throw new AuthenticationError('Failed to get current user');
    }
}

/**
 * Utility function to extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null if not found
 * 
 * @example
 * const token = extractTokenFromHeader(req.headers.authorization);
 * if (token) {
 *   const user = await getCurrentUser(token);
 * }
 */
export function extractTokenFromHeader(authHeader) {
    if (!authHeader || typeof authHeader !== 'string') {
        return null;
    }

    const matches = authHeader.match(/^Bearer\s+(.+)$/i);
    return matches ? matches[1].trim() : null;
}

/**
 * Middleware factory for protecting routes with JWT authentication
 * @param {Object} options - Middleware options
 * @param {boolean} [options.required=true] - Whether authentication is required
 * @param {Array<string>} [options.roles] - Required roles for access
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Protect route - authentication required
 * app.get('/protected', createAuthMiddleware(), (req, res) => {
 *   res.json({ user: req.user });
 * });
 * 
 * // Admin only route
 * app.get('/admin', createAuthMiddleware({ roles: ['admin'] }), (req, res) => {
 *   res.json({ message: 'Admin access granted' });
 * });
 */
export function createAuthMiddleware(options = {}) {
    const { required = true, roles = [] } = options;

    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            const token = extractTokenFromHeader(authHeader);

            if (!token) {
                if (required) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        message: 'No token provided'
                    });
                }
                return next();
            }

            // Get current user from token
            const user = await getCurrentUser(token);
            
            // Check role requirements
            if (roles.length > 0 && !roles.includes(user.role)) {
                return res.status(403).json({
                    error: 'Insufficient permissions',
                    message: 'Access denied for current role'
                });
            }

            // Attach user to request object
            req.user = user;
            req.token = token;
            
            next();

        } catch (error) {
            let statusCode = 401;
            let errorType = 'Authentication failed';

            if (error instanceof TokenExpiredError) {
                errorType = 'Token expired';
            } else if (error instanceof InvalidTokenError) {
                errorType = 'Invalid token';
            }

            res.status(statusCode).json({
                error: errorType,