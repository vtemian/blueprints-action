/**
 * User Model - Production-ready user authentication model
 * @module models/user
 * @description Secure user model with authentication capabilities
 */

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const { DataTypes, Model } = require('sequelize');

// Password validation constants
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const BCRYPT_SALT_ROUNDS = 12;

// Email validation regex (RFC 5322 compliant)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * User Model Class
 * @class User
 * @extends {Model}
 */
class User extends Model {
  /**
   * Initialize User model with database connection
   * @param {Object} sequelize - Sequelize database connection instance
   * @returns {User} User model class
   */
  static init(sequelize) {
    return super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: () => uuidv4(),
          primaryKey: true,
          allowNull: false,
          comment: 'Unique identifier for user'
        },
        email: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: {
            name: 'users_email_unique',
            msg: 'Email address already exists'
          },
          validate: {
            notEmpty: {
              msg: 'Email is required'
            },
            len: {
              args: [1, 255],
              msg: 'Email must be between 1 and 255 characters'
            },
            isEmail: {
              msg: 'Please provide a valid email address'
            },
            customEmailValidation(value) {
              if (!EMAIL_REGEX.test(value)) {
                throw new Error('Invalid email format');
              }
            }
          },
          set(value) {
            // Sanitize and normalize email
            if (value) {
              this.setDataValue('email', value.toLowerCase().trim());
            }
          }
        },
        password_hash: {
          type: DataTypes.STRING(255),
          allowNull: false,
          validate: {
            notEmpty: {
              msg: 'Password hash is required'
            }
          },
          comment: 'Bcrypt hashed password - never store plain text passwords'
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
          validate: {
            notEmpty: {
              msg: 'Name is required'
            },
            len: {
              args: [1, 100],
              msg: 'Name must be between 1 and 100 characters'
            }
          },
          set(value) {
            // Sanitize name input
            if (value) {
              this.setDataValue('name', value.trim().replace(/\s+/g, ' '));
            }
          }
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'User account status - false for deactivated accounts'
        },
        last_login: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: 'Timestamp of user\'s last successful login'
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          comment: 'Account creation timestamp'
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          comment: 'Last account modification timestamp'
        }
      },
      {
        sequelize,
        modelName: 'User',
        tableName: 'users',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
          {
            unique: true,
            fields: ['email'],
            name: 'users_email_unique_idx'
          },
          {
            fields: ['is_active'],
            name: 'users_is_active_idx'
          },
          {
            fields: ['created_at'],
            name: 'users_created_at_idx'
          }
        ],
        hooks: {
          beforeValidate: (user) => {
            // Additional sanitization before validation
            if (user.email) {
              user.email = user.email.toLowerCase().trim();
            }
            if (user.name) {
              user.name = user.name.trim().replace(/\s+/g, ' ');
            }
          }
        }
      }
    );
  }

  /**
   * Define associations with other models
   * @param {Object} models - Object containing all model definitions
   */
  static associate(models) {
    // One-to-many relationship with Tasks
    User.hasMany(models.Task, {
      foreignKey: 'user_id',
      as: 'tasks',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  }

  /**
   * Hash and set user password securely
   * @param {string} password - Plain text password to hash
   * @throws {Error} If password validation fails
   * @returns {Promise<void>}
   */
  async setPassword(password) {
    try {
      // Validate password strength
      this.validatePassword(password);

      // Hash password with bcrypt
      const saltRounds = BCRYPT_SALT_ROUNDS;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      this.password_hash = hashedPassword;
    } catch (error) {
      throw new Error(`Password setting failed: ${error.message}`);
    }
  }

  /**
   * Verify password against stored hash
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} True if password matches, false otherwise
   * @throws {Error} If password checking fails
   */
  async checkPassword(password) {
    try {
      if (!password || typeof password !== 'string') {
        return false;
      }

      if (!this.password_hash) {
        throw new Error('No password hash found for user');
      }

      return await bcrypt.compare(password, this.password_hash);
    } catch (error) {
      throw new Error(`Password verification failed: ${error.message}`);
    }
  }

  /**
   * Validate password strength and format
   * @param {string} password - Password to validate
   * @throws {Error} If password doesn't meet requirements
   * @private
   */
  validatePassword(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      throw new Error(`Password must not exceed ${PASSWORD_MAX_LENGTH} characters`);
    }

    // Check for at least one uppercase, lowercase, number, and special character
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      throw new Error('Password must contain at least one uppercase letter, lowercase letter, number, and special character');
    }
  }

  /**
   * Update last login timestamp
   * @returns {Promise<void>}
   */
  async updateLastLogin() {
    try {
      this.last_login = new Date();
      await this.save({ fields: ['last_login', 'updated_at'] });
    } catch (error) {
      throw new Error(`Failed to update last login: ${error.message}`);
    }
  }

  /**
   * Deactivate user account
   * @returns {Promise<void>}
   */
  async deactivate() {
    try {
      this.is_active = false;
      await this.save({ fields: ['is_active', 'updated_at'] });
    } catch (error) {
      throw new Error(`Failed to deactivate user: ${error.message}`);
    }
  }

  /**
   * Activate user account
   * @returns {Promise<void>}
   */
  async activate() {
    try {
      this.is_active = true;
      await this.save({ fields: ['is_active', 'updated_at'] });
    } catch (error) {
      throw new Error(`Failed to activate user: ${error.message}`);
    }
  }

  /**
   * Serialize user data for API responses (excludes sensitive information)
   * @param {Object} options - Serialization options
   * @param {boolean} options.includeTimestamps - Include created_at and updated_at
   * @param {boolean} options.includeLastLogin - Include last_login timestamp
   * @returns {Object} Sanitized user object
   */
  toDict(options = {}) {
    const {
      includeTimestamps = true,
      includeLastLogin = false
    } = options;

    const userData = {
      id: this.id,
      email: this.email,
      name: this.name,
      is_active: this.is_active
    };

    if (includeTimestamps) {
      userData.created_at = this.created_at;
      userData.updated_at = this.updated_at;
    }

    if (includeLastLogin && this.last_login) {
      userData.last_login = this.last_login;
    }

    return userData;
  }

  /**
   * Override toJSON to prevent password hash exposure
   * @returns {Object} Safe JSON representation
   */
  toJSON() {
    return this.toDict();
  }

  /**
   * Find user by email address
   * @param {string} email - Email address to search for
   * @returns {Promise<User|null>} User instance or null if not found
   * @static
   */
  static async findByEmail(email) {
    try {
      if (!email || !validator.isEmail(email)) {
        throw new Error('Valid email address is required');
      }

      return await User.findOne({
        where: {
          email: email.toLowerCase().trim()
        }
      });
    } catch (error) {
      throw new Error(`Failed to find user by email: ${error.message}`);
    }
  }

  /**
   * Create new user with password
   * @param {Object} userData - User data object
   * @param {string} userData.email - User email
   * @param {string} userData.password - Plain text password
   * @param {string} userData.name - User name
   * @returns {Promise<User>} Created user instance
   * @static
   */
  static async createUser(userData) {
    const { email, password, name } = userData;

    try {
      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Create new user instance
      const user = User.build({
        email,
        name
      });

      // Set password (this will hash it)
      await user.setPassword(password);

      // Save to database
      await user.save();

      return user;
    } catch (error) {
      throw new Error(`User creation failed: ${error.message}`);
    }
  }
}

module.exports = User;

/**
 * MIGRATION SCHEMA (for reference):
 * 
 * CREATE TABLE users (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   email VARCHAR(255) NOT NULL UNIQUE,
 *   password_hash VARCHAR(255) NOT NULL,
 *   name VARCHAR(100) NOT NULL,
 *   is_active BOOLEAN NOT NULL DEFAULT true,
 *   last_login TIMESTAMP NULL,
 *   created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *   updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
 * );
 * 
 * CREATE UNIQUE INDEX users_email_unique_idx ON users(email);
 * CREATE INDEX users_is_active_idx ON users(is_active);
 * CREATE INDEX users_created_at_idx ON users(created_at);
 */

/**
 * USAGE EXAMPLES:
 * 
 * // Initialize model with database connection
 * const sequelize = require('./database');
 * User.init(sequelize);
 * 
 * // Create new user
 * const newUser = await User.createUser({
 *   email: 'user@example.com',
 *   password: 'SecurePass123!',
 *   name: 'John Doe'
 * });
 * 
 * // Find user and verify password
 * const user = await User.findByEmail('user@example.com');
 * const isValidPassword = await user.checkPassword('SecurePass123!');
 * 
 * // Update last login
 * if (isValidPassword) {
 *   await user.updateLastLogin();
 * }
 * 
 * // Serialize for API response
 * const userResponse = user.toDict({ includeLastLogin: true });
 * 
 * // Change password
 * await user.setPassword('NewSecurePass456!');
 * await user.save();
 */