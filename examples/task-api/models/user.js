/**
 * @fileoverview User model definition with Sequelize ORM
 * @module models/user
 * @requires sequelize
 * @requires bcrypt
 * @requires uuid
 * @requires validator
 */

import { DataTypes, Model } from 'sequelize';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import validator from 'validator';
import { sequelize } from '../core/database.js';
import logger from '../core/logger.js';

/**
 * Custom error classes for User model operations
 */
export class UserValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'UserValidationError';
    this.field = field;
  }
}

export class UserAuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserAuthenticationError';
  }
}

/**
 * User model class extending Sequelize Model
 * Handles user authentication, validation, and data management
 * 
 * @class User
 * @extends {Model}
 */
class User extends Model {
  /**
   * Hash and set user password
   * @async
   * @param {string} password - Plain text password to hash
   * @throws {UserValidationError} When password validation fails
   * @returns {Promise<void>}
   */
  async setPassword(password) {
    try {
      // Validate password strength
      if (!password || typeof password !== 'string') {
        throw new UserValidationError('Password must be a non-empty string', 'password');
      }
      
      if (password.length < 8) {
        throw new UserValidationError('Password must be at least 8 characters long', 'password');
      }

      // Hash password with salt rounds 12
      const saltRounds = 12;
      this.password_hash = await bcrypt.hash(password, saltRounds);
      
      logger.info(`Password set for user: ${this.email}`);
    } catch (error) {
      logger.error(`Failed to set password for user ${this.email}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify password against stored hash
   * @async
   * @param {string} password - Plain text password to verify
   * @throws {UserAuthenticationError} When password verification fails
   * @returns {Promise<boolean>} True if password matches, false otherwise
   */
  async checkPassword(password) {
    try {
      if (!password || typeof password !== 'string') {
        logger.warn(`Invalid password attempt for user: ${this.email}`);
        throw new UserAuthenticationError('Invalid password format');
      }

      if (!this.password_hash) {
        logger.error(`No password hash found for user: ${this.email}`);
        throw new UserAuthenticationError('User has no password set');
      }

      const isValid = await bcrypt.compare(password, this.password_hash);
      
      if (isValid) {
        logger.info(`Successful password verification for user: ${this.email}`);
        // Update last login timestamp
        this.last_login = new Date();
        await this.save();
      } else {
        logger.warn(`Failed password verification for user: ${this.email}`);
      }

      return isValid;
    } catch (error) {
      logger.error(`Password check error for user ${this.email}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convert user instance to plain object, excluding sensitive data
   * @returns {Object} User data without sensitive fields
   */
  toDict() {
    const userData = this.toJSON();
    
    // Remove sensitive fields
    delete userData.password_hash;
    
    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      is_active: userData.is_active,
      last_login: userData.last_login,
      created_at: userData.created_at,
      updated_at: userData.updated_at
    };
  }

  /**
   * Custom JSON serialization that excludes sensitive data
   * @returns {Object} Safe user representation
   */
  toJSON() {
    const values = { ...this.dataValues };
    delete values.password_hash;
    return values;
  }

  /**
   * Update last login timestamp
   * @async
   * @returns {Promise<void>}
   */
  async updateLastLogin() {
    try {
      this.last_login = new Date();
      await this.save();
      logger.info(`Updated last login for user: ${this.email}`);
    } catch (error) {
      logger.error(`Failed to update last login for user ${this.email}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deactivate user account
   * @async
   * @returns {Promise<void>}
   */
  async deactivate() {
    try {
      this.is_active = false;
      await this.save();
      logger.info(`Deactivated user account: ${this.email}`);
    } catch (error) {
      logger.error(`Failed to deactivate user ${this.email}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Activate user account
   * @async
   * @returns {Promise<void>}
   */
  async activate() {
    try {
      this.is_active = true;
      await this.save();
      logger.info(`Activated user account: ${this.email}`);
    } catch (error) {
      logger.error(`Failed to activate user ${this.email}: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Initialize User model with Sequelize
 */
User.init(
  {
    /**
     * @type {string} Unique identifier for the user
     */
    id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
      allowNull: false,
      comment: 'Unique user identifier'
    },

    /**
     * @type {string} User email address
     */
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: {
        name: 'users_email_unique',
        msg: 'Email address already exists'
      },
      validate: {
        notEmpty: {
          msg: 'Email cannot be empty'
        },
        isEmail: {
          msg: 'Must be a valid email address'
        },
        len: {
          args: [1, 255],
          msg: 'Email must be between 1 and 255 characters'
        },
        isValidEmail(value) {
          if (!validator.isEmail(value)) {
            throw new Error('Invalid email format');
          }
        }
      },
      set(value) {
        // Normalize email to lowercase and trim whitespace
        this.setDataValue('email', value ? value.toLowerCase().trim() : value);
      },
      comment: 'User email address (unique)'
    },

    /**
     * @type {string} Hashed password
     */
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Password hash cannot be empty'
        },
        len: {
          args: [1, 255],
          msg: 'Password hash must be between 1 and 255 characters'
        }
      },
      comment: 'Bcrypt hashed password'
    },

    /**
     * @type {string} User display name
     */
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Name cannot be empty'
        },
        len: {
          args: [1, 100],
          msg: 'Name must be between 1 and 100 characters'
        },
        isValidName(value) {
          // Allow letters, spaces, hyphens, and apostrophes
          const nameRegex = /^[a-zA-Z\s\-']+$/;
          if (!nameRegex.test(value)) {
            throw new Error('Name can only contain letters, spaces, hyphens, and apostrophes');
          }
        }
      },
      set(value) {
        // Trim whitespace and normalize spacing
        if (value) {
          const normalized = value.trim().replace(/\s+/g, ' ');
          this.setDataValue('name', normalized);
        }
      },
      comment: 'User display name'
    },

    /**
     * @type {boolean} User account status
     */
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'User account active status'
    },

    /**
     * @type {Date|null} Last login timestamp
     */
    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: {
          msg: 'Last login must be a valid date'
        }
      },
      comment: 'Timestamp of last successful login'
    },

    /**
     * @type {Date} Record creation timestamp
     */
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Record creation timestamp'
    },

    /**
     * @type {Date} Record last update timestamp
     */
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Record last update timestamp'
    }
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    
    // Indexes for performance
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

    // Model-level validations
    validate: {
      /**
       * Ensure email is provided and valid
       */
      emailRequired() {
        if (!this.email) {
          throw new UserValidationError('Email is required', 'email');
        }
      },

      /**
       * Ensure name is provided
       */
      nameRequired() {
        if (!this.name) {
          throw new UserValidationError('Name is required', 'name');
        }
      }
    },

    // Hooks for additional processing
    hooks: {
      /**
       * Before validation hook
       */
      beforeValidate: (user) => {
        // Ensure boolean values are properly set
        if (typeof user.is_active !== 'boolean') {
          user.is_active = true;
        }
      },

      /**
       * Before create hook
       */
      beforeCreate: (user) => {
        logger.info(`Creating new user: ${user.email}`);
      },

      /**
       * After create hook
       */
      afterCreate: (user) => {
        logger.info(`Successfully created user: ${user.email} with ID: ${user.id}`);
      },

      /**
       * Before update hook
       */
      beforeUpdate: (user) => {
        logger.info(`Updating user: ${user.email}`);
      },

      /**
       * After update hook
       */
      afterUpdate: (user) => {
        logger.info(`Successfully updated user: ${user.email}`);
      }
    },

    // Default scope excludes password_hash
    defaultScope: {
      attributes: {
        exclude: ['password_hash']
      }
    },

    // Named scopes for different use cases
    scopes: {
      withPassword: {
        attributes: {}
      },
      active: {
        where: {
          is_active: true
        }
      },
      inactive: {
        where: {
          is_active: false
        }
      }
    }
  }
);

/**
 * Define associations
 * This will be called after all models are loaded
 * @param {Object} models - All loaded models
 */
User.associate = (models) => {
  // One-to-many relationship with Tasks
  User.hasMany(models.Task, {
    foreignKey: 'user_id',
    as: 'tasks',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });
};

/**
 * Static method to find user by email
 * @async
 * @param {string} email - Email to search for
 * @returns {Promise<User|null>} User instance or null
 */
User.findByEmail = async function(email) {
  try {
    if (!email || !validator.isEmail(email)) {
      throw new UserValidationError('Invalid email format', 'email');
    }

    const user = await this.scope('withPassword').findOne({
      where: { email: email.toLowerCase().trim() }
    });

    return user;
  } catch (error) {
    logger.error(`Error finding user by email ${email}: ${error.message}`);
    throw error;
  }
};

/**
 * Static method to create user with password
 * @async
 * @param {Object} userData - User data including password
 * @returns {Promise<User>} Created user instance
 */
User.createWithPassword = async function(userData) {
  const transaction = await sequelize.transaction();
  
  try {
    const { password, ...userFields } = userData;
    
    if (!password) {
      throw new UserValidationError('Password is required', 'password');
    }

    // Create user instance
    const user = this.build(userFields);
    
    // Set password (this will hash it)
    await user.setPassword(password);
    
    // Save user
    await user.save({ transaction });
    
    await transaction.commit();
    
    logger.info(`Successfully created user with password: ${user.email}`);
    return user;
  } catch (error) {
    await transaction.rollback();
    logger.error(`Failed to create user with password: ${error.message}`);
    throw error;
  }
};

export default User;