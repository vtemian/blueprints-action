/**
 * User Model
 * Defines the User entity with authentication capabilities and relationships
 * @module models/user
 */

import { DataTypes, Model } from 'sequelize';
import bcrypt from 'bcrypt';
import { sequelize } from '@core/database';

/**
 * User Model Class
 * @class User
 * @extends {Model}
 */
class User extends Model {
  /**
   * Hash and set user password
   * @param {string} password - Plain text password to hash
   * @throws {Error} When password is invalid or hashing fails
   * @returns {Promise<void>}
   */
  async setPassword(password) {
    try {
      // Input validation
      if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
      }

      if (password.trim().length === 0) {
        throw new Error('Password cannot be empty or whitespace only');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Hash password with salt rounds of 12
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Set the hashed password
      this.password_hash = hashedPassword;
    } catch (error) {
      if (error.message.includes('Password')) {
        throw error; // Re-throw validation errors
      }
      throw new Error(`Failed to hash password: ${error.message}`);
    }
  }

  /**
   * Check if provided password matches stored hash
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} True if password matches, false otherwise
   * @throws {Error} When password is invalid or comparison fails
   */
  async checkPassword(password) {
    try {
      // Input validation
      if (!password || typeof password !== 'string') {
        return false;
      }

      if (password.trim().length === 0) {
        return false;
      }

      if (!this.password_hash) {
        throw new Error('No password hash found for user');
      }

      // Compare password with hash
      const isMatch = await bcrypt.compare(password, this.password_hash);
      return isMatch;
    } catch (error) {
      if (error.message.includes('No password hash')) {
        throw error;
      }
      throw new Error(`Failed to verify password: ${error.message}`);
    }
  }

  /**
   * Convert user instance to dictionary/object representation
   * Excludes sensitive information like password_hash
   * @returns {Object} Serialized user object
   */
  toDict() {
    try {
      const userObject = {
        id: this.id,
        email: this.email,
        name: this.name,
        is_active: this.is_active,
        last_login: this.last_login,
        created_at: this.created_at || this.createdAt,
        updated_at: this.updated_at || this.updatedAt
      };

      // Remove any undefined values
      Object.keys(userObject).forEach(key => {
        if (userObject[key] === undefined) {
          delete userObject[key];
        }
      });

      return userObject;
    } catch (error) {
      throw new Error(`Failed to serialize user: ${error.message}`);
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
}

/**
 * Initialize User Model
 */
User.init(
  {
    // Primary key - UUID
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
      validate: {
        isUUID: {
          args: 4,
          msg: 'ID must be a valid UUID v4'
        }
      }
    },

    // Email field with validation and unique constraint
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
      },
      set(value) {
        // Normalize email to lowercase
        if (value && typeof value === 'string') {
          this.setDataValue('email', value.toLowerCase().trim());
        } else {
          this.setDataValue('email', value);
        }
      }
    },

    // Password hash - never exposed in API responses
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Password hash is required'
        },
        notEmpty: {
          msg: 'Password hash cannot be empty'
        },
        len: {
          args: [1, 255],
          msg: 'Password hash must be between 1 and 255 characters'
        }
      }
    },

    // User's display name
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
      },
      set(value) {
        // Trim whitespace from name
        if (value && typeof value === 'string') {
          this.setDataValue('name', value.trim());
        } else {
          this.setDataValue('name', value);
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
    // Model options
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true, // Enables createdAt and updatedAt
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true, // Use snake_case for automatically added attributes
    
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

    // Default scope excludes password_hash
    defaultScope: {
      attributes: {
        exclude: ['password_hash']
      }
    },

    // Named scopes
    scopes: {
      // Include password hash for authentication
      withPassword: {
        attributes: {}
      },
      // Only active users
      active: {
        where: {
          is_active: true
        }
      },
      // Recently created users (last 30 days)
      recent: {
        where: {
          created_at: {
            [sequelize.Sequelize.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      }
    },

    // Hooks
    hooks: {
      // Before validation hook
      beforeValidate: (user, options) => {
        // Ensure email is lowercase if provided
        if (user.email && typeof user.email === 'string') {
          user.email = user.email.toLowerCase().trim();
        }
        
        // Ensure name is trimmed if provided
        if (user.name && typeof user.name === 'string') {
          user.name = user.name.trim();
        }
      }
    }
  }
);

/**
 * Define associations
 * This should be called after all models are defined
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

export default User;