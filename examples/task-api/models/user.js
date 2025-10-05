/**
 * User Model - Production-ready User management with authentication
 * @fileoverview Complete User model with Sequelize ORM, authentication, and validation
 */

import { DataTypes, Model } from 'sequelize';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import validator from 'validator';
import { sequelize } from '@core/database';
import logger from '@utils/logger';

// Constants
const SALT_ROUNDS = 12;
const PASSWORD_MIN_LENGTH = 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * User Model Class
 * Handles user authentication, profile management, and database operations
 */
class User extends Model {
  /**
   * Hash and set user password
   * @param {string} password - Plain text password
   * @throws {Error} If password doesn't meet requirements
   * @returns {Promise<void>}
   */
  async setPassword(password) {
    try {
      // Validate password strength
      if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
      }
      
      if (password.length < PASSWORD_MIN_LENGTH) {
        throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
      }

      // Additional password strength validation
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        throw new Error('Password must contain at least one uppercase letter, one lowercase letter, and one number');
      }

      // Hash password with salt
      const saltRounds = SALT_ROUNDS;
      this.password_hash = await bcrypt.hash(password, saltRounds);
      
      logger.info(`Password updated for user: ${this.email}`);
    } catch (error) {
      logger.error(`Password setting failed for user ${this.email}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify user password
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} True if password matches
   */
  async checkPassword(password) {
    try {
      if (!password || !this.password_hash) {
        logger.warn(`Password check failed - missing data for user: ${this.email}`);
        return false;
      }

      const isValid = await bcrypt.compare(password, this.password_hash);
      
      if (isValid) {
        // Update last login timestamp
        await this.updateLastLogin();
        logger.info(`Successful authentication for user: ${this.email}`);
      } else {
        logger.warn(`Failed authentication attempt for user: ${this.email}`);
      }

      return isValid;
    } catch (error) {
      logger.error(`Password verification error for user ${this.email}: ${error.message}`);
      return false;
    }
  }

  /**
   * Update last login timestamp
   * @returns {Promise<void>}
   */
  async updateLastLogin() {
    try {
      this.last_login = new Date();
      await this.save({ fields: ['last_login'] });
    } catch (error) {
      logger.error(`Failed to update last login for user ${this.email}: ${error.message}`);
    }
  }

  /**
   * Serialize user data for API responses
   * @param {boolean} includeTimestamps - Include created_at/updated_at
   * @returns {Object} Sanitized user object
   */
  toDict(includeTimestamps = true) {
    const baseData = {
      id: this.id,
      email: this.email,
      name: this.name,
      is_active: this.is_active,
      last_login: this.last_login
    };

    if (includeTimestamps) {
      baseData.created_at = this.created_at;
      baseData.updated_at = this.updated_at;
    }

    return baseData;
  }

  /**
   * Get user's public profile data
   * @returns {Object} Public user data
   */
  getPublicProfile() {
    return {
      id: this.id,
      name: this.name,
      is_active: this.is_active
    };
  }

  /**
   * Check if user account is active and valid
   * @returns {boolean} True if user can authenticate
   */
  canAuthenticate() {
    return this.is_active && this.password_hash;
  }

  // Static Methods

  /**
   * Find user by email address
   * @param {string} email - User email
   * @returns {Promise<User|null>} User instance or null
   */
  static async findByEmail(email) {
    try {
      if (!email || !validator.isEmail(email)) {
        return null;
      }

      const user = await this.findOne({
        where: { 
          email: email.toLowerCase().trim() 
        }
      });

      return user;
    } catch (error) {
      logger.error(`Error finding user by email ${email}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find active users only
   * @param {Object} options - Query options
   * @returns {Promise<User[]>} Array of active users
   */
  static async findActiveUsers(options = {}) {
    try {
      return await this.findAll({
        where: { is_active: true },
        ...options
      });
    } catch (error) {
      logger.error(`Error finding active users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create new user with validation
   * @param {Object} userData - User data object
   * @returns {Promise<User>} Created user instance
   */
  static async createUser(userData) {
    try {
      const { email, password, name } = userData;

      // Validate required fields
      if (!email || !password || !name) {
        throw new Error('Email, password, and name are required');
      }

      // Check if user already exists
      const existingUser = await this.findByEmail(email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Create user instance
      const user = await this.create({
        id: uuidv4(),
        email: email.toLowerCase().trim(),
        name: name.trim(),
        is_active: true
      });

      // Set password (will be hashed)
      await user.setPassword(password);
      await user.save();

      logger.info(`New user created: ${user.email}`);
      return user;
    } catch (error) {
      logger.error(`User creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<User|null>} Authenticated user or null
   */
  static async authenticate(email, password) {
    try {
      const user = await this.findByEmail(email);
      
      if (!user || !user.canAuthenticate()) {
        logger.warn(`Authentication failed - user not found or inactive: ${email}`);
        return null;
      }

      const isValidPassword = await user.checkPassword(password);
      return isValidPassword ? user : null;
    } catch (error) {
      logger.error(`Authentication error for ${email}: ${error.message}`);
      return null;
    }
  }
}

// Model Definition and Configuration
User.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: {
      name: 'users_email_unique',
      msg: 'Email address already exists'
    },
    validate: {
      isEmail: {
        msg: 'Must be a valid email address'
      },
      len: {
        args: [1, 255],
        msg: 'Email must be between 1 and 255 characters'
      }
    },
    set(value) {
      // Always store email in lowercase
      this.setDataValue('email', value ? value.toLowerCase().trim() : value);
    }
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      len: {
        args: [1, 255],
        msg: 'Password hash is required'
      }
    }
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: {
        args: [1, 100],
        msg: 'Name must be between 1 and 100 characters'
      },
      notEmpty: {
        msg: 'Name cannot be empty'
      }
    },
    set(value) {
      // Always trim whitespace
      this.setDataValue('name', value ? value.trim() : value);
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: {
        msg: 'Last login must be a valid date'
      }
    }
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
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
      name: 'users_email_idx'
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
  defaultScope: {
    attributes: {
      exclude: ['password_hash']
    }
  },
  scopes: {
    withPassword: {
      attributes: {}
    },
    active: {
      where: {
        is_active: true
      }
    }
  },
  hooks: {
    beforeValidate: (user) => {
      // Ensure email is lowercase and trimmed
      if (user.email) {
        user.email = user.email.toLowerCase().trim();
      }
      // Ensure name is trimmed
      if (user.name) {
        user.name = user.name.trim();
      }
    },
    afterCreate: (user) => {
      logger.info(`User created successfully: ${user.email}`);
    },
    afterUpdate: (user) => {
      logger.info(`User updated: ${user.email}`);
    },
    afterDestroy: (user) => {
      logger.info(`User deleted: ${user.email}`);
    }
  }
});

// Define Associations
User.associate = (models) => {
  // One-to-many relationship with Tasks
  User.hasMany(models.Task, {
    foreignKey: 'user_id',
    as: 'tasks',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });
};

// Export the model
export default User;

// Named export for convenience
export { User };

/**
 * Migration Schema Definition
 * Use this for creating the users table migration
 */
export const userMigrationSchema = {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
};