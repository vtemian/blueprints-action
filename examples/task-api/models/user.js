/**
 * User Model
 * @module models/user
 * @description User model definition with Sequelize ORM
 */

const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../core/database');

/**
 * User Model Class
 * @class User
 * @extends {Model}
 */
class User extends Model {
  /**
   * Hash and set user password
   * @param {string} password - Plain text password
   * @throws {Error} When password is invalid or hashing fails
   * @returns {Promise<void>}
   */
  async setPassword(password) {
    try {
      // Validate password input
      if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Hash password with salt rounds of 12
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Store hashed password
      this.password_hash = hashedPassword;
    } catch (error) {
      if (error.message.includes('Password must be')) {
        throw error;
      }
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Check if provided password matches stored hash
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} True if password matches, false otherwise
   * @throws {Error} When password comparison fails
   */
  async checkPassword(password) {
    try {
      // Validate input
      if (!password || typeof password !== 'string') {
        return false;
      }

      if (!this.password_hash) {
        throw new Error('No password hash found for user');
      }

      // Compare password with stored hash
      const isMatch = await bcrypt.compare(password, this.password_hash);
      return isMatch;
    } catch (error) {
      if (error.message.includes('No password hash')) {
        throw error;
      }
      throw new Error(`Password verification failed: ${error.message}`);
    }
  }

  /**
   * Convert user instance to plain object (excluding sensitive data)
   * @returns {Object} User object without password_hash
   */
  toDict() {
    try {
      const userObject = this.toJSON();
      
      // Remove sensitive information
      delete userObject.password_hash;
      
      return userObject;
    } catch (error) {
      throw new Error(`Failed to convert user to dictionary: ${error.message}`);
    }
  }

  /**
   * Update last login timestamp
   * @returns {Promise<void>}
   */
  async updateLastLogin() {
    try {
      this.last_login = new Date();
      await this.save();
    } catch (error) {
      throw new Error(`Failed to update last login: ${error.message}`);
    }
  }

  /**
   * Define model associations
   * @param {Object} models - All models object
   */
  static associate(models) {
    // User has many Tasks
    User.hasMany(models.Task, {
      foreignKey: 'user_id',
      as: 'tasks',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  }
}

// Initialize User model
User.init(
  {
    // Primary key with UUID
    id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
      allowNull: false,
      validate: {
        isUUID: 4
      }
    },

    // Email field with validation
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: {
        name: 'users_email_unique',
        msg: 'Email address already exists'
      },
      validate: {
        notNull: {
          msg: 'Email is required'
        },
        notEmpty: {
          msg: 'Email cannot be empty'
        },
        isEmail: {
          msg: 'Must be a valid email address'
        },
        len: {
          args: [1, 255],
          msg: 'Email must be between 1 and 255 characters'
        }
      }
    },

    // Password hash field
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Password hash is required'
        },
        notEmpty: {
          msg: 'Password hash cannot be empty'
        }
      }
    },

    // User name field
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Name is required'
        },
        notEmpty: {
          msg: 'Name cannot be empty'
        },
        len: {
          args: [1, 100],
          msg: 'Name must be between 1 and 100 characters'
        }
      }
    },

    // Active status flag
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      validate: {
        isIn: {
          args: [[true, false]],
          msg: 'is_active must be true or false'
        }
      }
    },

    // Last login timestamp
    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: {
          msg: 'last_login must be a valid date'
        }
      }
    }
  },
  {
    // Model configuration
    sequelize,
    modelName: 'User',
    tableName: 'users',
    
    // Enable automatic timestamps
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    // Indexes
    indexes: [
      {
        unique: true,
        fields: ['email'],
        name: 'users_email_index'
      },
      {
        fields: ['is_active'],
        name: 'users_is_active_index'
      },
      {
        fields: ['created_at'],
        name: 'users_created_at_index'
      }
    ],

    // Hooks for additional validation and processing
    hooks: {
      beforeValidate: (user, options) => {
        // Normalize email to lowercase
        if (user.email) {
          user.email = user.email.toLowerCase().trim();
        }

        // Trim name
        if (user.name) {
          user.name = user.name.trim();
        }
      },

      beforeCreate: (user, options) => {
        // Ensure UUID is set
        if (!user.id) {
          user.id = uuidv4();
        }
      }
    },

    // Default scope excludes password_hash
    defaultScope: {
      attributes: {
        exclude: ['password_hash']
      }
    },

    // Scopes for different query needs
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

module.exports = User;