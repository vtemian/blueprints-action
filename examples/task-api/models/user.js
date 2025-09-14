/**
 * User Model Class
 * Production-ready User model with comprehensive validation and security features
 * 
 * @author Your Name
 * @version 1.0.0
 */

import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import validator from 'validator';
// import db from './database/connection.js'; // Uncomment for actual database integration

// Constants
const SALT_ROUNDS = 12;
const MAX_EMAIL_LENGTH = 255;
const MAX_PASSWORD_LENGTH = 255;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;

// Password complexity regex: at least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

/**
 * Custom Error Classes
 */
class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

class DatabaseError extends Error {
    constructor(message, operation = null) {
        super(message);
        this.name = 'DatabaseError';
        this.operation = operation;
    }
}

/**
 * User Model Class
 * Handles user data management with security best practices
 */
class User {
    // Static properties for database integration
    static tableName = 'users';
    static collectionName = 'users';

    /**
     * Database Schema Definition (for reference)
     * 
     * SQL Schema:
     * CREATE TABLE users (
     *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     *   email VARCHAR(255) UNIQUE NOT NULL,
     *   password_hash VARCHAR(255) NOT NULL,
     *   name VARCHAR(100) NOT NULL,
     *   is_active BOOLEAN DEFAULT true,
     *   last_login TIMESTAMP NULL,
     *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     *   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     * );
     * 
     * Indexes:
     * CREATE UNIQUE INDEX idx_users_email ON users(email);
     * CREATE INDEX idx_users_active ON users(is_active);
     * CREATE INDEX idx_users_created_at ON users(created_at);
     * 
     * MongoDB Schema:
     * {
     *   _id: ObjectId,
     *   id: String (UUID),
     *   email: { type: String, unique: true, required: true, maxLength: 255 },
     *   password_hash: { type: String, required: true, maxLength: 255 },
     *   name: { type: String, required: true, maxLength: 100 },
     *   is_active: { type: Boolean, default: true },
     *   last_login: { type: Date, default: null },
     *   created_at: { type: Date, default: Date.now },
     *   updated_at: { type: Date, default: Date.now }
     * }
     */

    /**
     * Constructor - Initialize User instance
     * @param {Object} userData - User data object
     * @param {string} userData.email - User email address
     * @param {string} userData.name - User full name
     * @param {string} [userData.id] - User ID (auto-generated if not provided)
     * @param {boolean} [userData.is_active=true] - User active status
     * @param {Date} [userData.last_login=null] - Last login timestamp
     * @param {Date} [userData.created_at] - Creation timestamp
     * @param {Date} [userData.updated_at] - Last update timestamp
     */
    constructor(userData = {}) {
        try {
            // Auto-generate ID if not provided
            this._id = userData.id || uuidv4();
            
            // Set timestamps
            const now = new Date();
            this._created_at = userData.created_at || now;
            this._updated_at = userData.updated_at || now;
            
            // Initialize other fields
            this._password_hash = null;
            this._last_login = userData.last_login || null;
            this._is_active = userData.is_active !== undefined ? userData.is_active : true;
            
            // Set validated fields through setters
            this.email = userData.email;
            this.name = userData.name;
            
        } catch (error) {
            throw new ValidationError(`User initialization failed: ${error.message}`);
        }
    }

    /**
     * Getters and Setters
     */
    
    get id() {
        return this._id;
    }

    get email() {
        return this._email;
    }

    set email(value) {
        if (!value) {
            throw new ValidationError('Email is required', 'email');
        }
        
        const sanitizedEmail = this._sanitizeString(value).toLowerCase();
        
        if (sanitizedEmail.length > MAX_EMAIL_LENGTH) {
            throw new ValidationError(`Email must not exceed ${MAX_EMAIL_LENGTH} characters`, 'email');
        }
        
        if (!validator.isEmail(sanitizedEmail)) {
            throw new ValidationError('Invalid email format', 'email');
        }
        
        this._email = sanitizedEmail;
        this._updateTimestamp();
    }

    get name() {
        return this._name;
    }

    set name(value) {
        if (!value) {
            throw new ValidationError('Name is required', 'name');
        }
        
        const sanitizedName = this._sanitizeString(value).trim();
        
        if (sanitizedName.length === 0) {
            throw new ValidationError('Name cannot be empty', 'name');
        }
        
        if (sanitizedName.length > MAX_NAME_LENGTH) {
            throw new ValidationError(`Name must not exceed ${MAX_NAME_LENGTH} characters`, 'name');
        }
        
        this._name = sanitizedName;
        this._updateTimestamp();
    }

    get is_active() {
        return this._is_active;
    }

    set is_active(value) {
        this._is_active = Boolean(value);
        this._updateTimestamp();
    }

    get last_login() {
        return this._last_login;
    }

    get created_at() {
        return this._created_at;
    }

    get updated_at() {
        return this._updated_at;
    }

    /**
     * Hash and set user password
     * @param {string} password - Plain text password
     * @returns {Promise<void>}
     * @throws {ValidationError} If password validation fails
     */
    async setPassword(password) {
        try {
            // Validate password
            this._validatePassword(password);
            
            // Hash password with bcrypt
            const hash = await bcrypt.hash(password, SALT_ROUNDS);
            this._password_hash = hash;
            this._updateTimestamp();
            
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new ValidationError(`Password hashing failed: ${error.message}`, 'password');
        }
    }

    /**
     * Verify password against stored hash
     * @param {string} password - Plain text password to verify
     * @returns {Promise<boolean>} True if password matches
     * @throws {ValidationError} If password is invalid or hash is missing
     */
    async checkPassword(password) {
        try {
            if (!password) {
                throw new ValidationError('Password is required for verification', 'password');
            }
            
            if (!this._password_hash) {
                throw new ValidationError('No password hash found for user', 'password_hash');
            }
            
            return await bcrypt.compare(password, this._password_hash);
            
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new ValidationError(`Password verification failed: ${error.message}`, 'password');
        }
    }

    /**
     * Update last login timestamp to current time
     * @returns {void}
     */
    updateLastLogin() {
        this._last_login = new Date();
        this._updateTimestamp();
    }

    /**
     * Deactivate user account
     * @returns {void}
     */
    deactivate() {
        this._is_active = false;
        this._updateTimestamp();
    }

    /**
     * Activate user account
     * @returns {void}
     */
    activate() {
        this._is_active = true;
        this._updateTimestamp();
    }

    /**
     * Convert user instance to plain object (excluding sensitive data)
     * @param {boolean} [includeTimestamps=true] - Include timestamp fields
     * @returns {Object} User data object without sensitive fields
     */
    toDict(includeTimestamps = true) {
        const userData = {
            id: this._id,
            email: this._email,
            name: this._name,
            is_active: this._is_active,
            last_login: this._last_login
        };

        if (includeTimestamps) {
            userData.created_at = this._created_at;
            userData.updated_at = this._updated_at;
        }

        return userData;
    }

    /**
     * Convert to JSON (alias for toDict)
     * @returns {Object} JSON-serializable user data
     */
    toJSON() {
        return this.toDict();
    }

    /**
     * Get user data for database storage (includes password hash)
     * @returns {Object} Complete user data for database operations
     * @private
     */
    _toDatabaseObject() {
        return {
            id: this._id,
            email: this._email,
            password_hash: this._password_hash,
            name: this._name,
            is_active: this._is_active,
            last_login: this._last_login,
            created_at: this._created_at,
            updated_at: this._updated_at
        };
    }

    /**
     * Static Methods for Database Operations
     */

    /**
     * Find user by email address
     * @param {string} email - Email address to search for
     * @returns {Promise<User|null>} User instance or null if not found
     * @throws {DatabaseError} If database operation fails
     * @static
     */
    static async findByEmail(email) {
        try {
            if (!email || !validator.isEmail(email)) {
                throw new ValidationError('Valid email is required for search', 'email');
            }

            const sanitizedEmail = email.toLowerCase().trim();

            // Example SQL query (uncomment and modify for your database)
            /*
            const query = 'SELECT * FROM users WHERE email = $1 LIMIT 1';
            const result = await db.query(query, [sanitizedEmail]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return User.fromDatabaseRow(result.rows[0]);
            */

            // Example MongoDB query (uncomment and modify for your database)
            /*
            const userData = await db.collection('users').findOne({ email: sanitizedEmail });
            
            if (!userData) {
                return null;
            }
            
            return User.fromDatabaseDocument(userData);
            */

            // Placeholder return for example
            console.log(`Searching for user with email: ${sanitizedEmail}`);
            return null;

        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new DatabaseError(`Failed to find user by email: ${error.message}`, 'findByEmail');
        }
    }

    /**
     * Find user by ID
     * @param {string} id - User ID to search for
     * @returns {Promise<User|null>} User instance or null if not found
     * @static
     */
    static async findById(id) {
        try {
            if (!id) {
                throw new ValidationError('User ID is required for search', 'id');
            }

            // Validate UUID format
            if (!validator.isUUID(id, 4)) {
                throw new ValidationError('Invalid UUID format', 'id');
            }

            // Database query implementation would go here
            console.log(`Searching for user with ID: ${id}`);
            return null;

        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new DatabaseError(`Failed to find user by ID: ${error.message}`, 'findById');
        }
    }

    /**
     * Create user from database row (SQL)
     * @param {Object} row - Database row object
     * @returns {User} User instance
     * @static
     */
    static fromDatabaseRow(row) {
        const user = new User({
            id: row.id,
            email: row.email,
            name: row.name,
            is_active: row.is_active,
            last_login: row.last_login,
            created_at: row.created_at,
            updated_at: row.updated_at
        });
        
        user._password_hash = row.password_hash;
        return user;
    }

    /**
     * Create user from database document (MongoDB)
     * @param {Object} doc - Database document object
     * @returns {User} User instance
     * @static
     */
    static fromDatabaseDocument(doc) {
        const user = new User({
            id: doc.id,
            email: doc.email,
            name: doc.name,
            is_active: doc.is_active,
            last_login: doc.last_login,
            created_at: doc.created_at,
            updated_at: doc.updated_at
        });
        
        user._password_hash = doc.password_hash;
        return user;
    }

    /**
     * Private Helper Methods
     */

    /**
     * Validate password strength and format
     * @param {string} password - Password to validate
     * @throws {ValidationError} If password is invalid
     * @private
     */
    _validatePassword(password) {
        if (!password) {
            throw new ValidationError('Password is required', 'password');
        }

        if (typeof password !== 'string') {
            throw new ValidationError('Password must be a string', 'password');
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`, 'password');
        }

        if (password.length > MAX_PASSWORD_LENGTH) {
            throw new ValidationError(`Password must not exceed ${MAX_PASSWORD_LENGTH} characters`, 'password');
        }

        if (!PASSWORD_REGEX.test(password)) {
            throw new ValidationError(
                'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
                'password'
            );
        }
    }

    /**
     * Sanitize string input to prevent injection attacks
     * @param {string} input - String to sanitize
     * @returns {string} Sanitized string
     * @private
     */
    _sanitizeString(input) {
        if (typeof input !== 'string') {
            return String(input);
        }
        
        // Remove null bytes and control characters
        return input.replace(/[\x00-\x1F\x7F]/g, '');
    }

    /**
     * Update the updated_at timestamp
     * @private
     */
    _updateTimestamp() {
        this._updated_at = new Date();
    }

    /**
     * Save user to database
     * @returns {Promise<User>} Saved user instance
     * @throws {DatabaseError} If save