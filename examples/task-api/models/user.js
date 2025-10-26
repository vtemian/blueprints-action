/**
 * User Model
 * Sequelize model for user management with authentication capabilities
 * 
 * @module models/user
 * @requires sequelize
 * @requires bcrypt
 * @requires uuid
 */

import { DataTypes, Model } from 'sequelize';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

/**
 * User model class extending Sequelize Model
 * Handles user authentication, password management, and data validation
 */
class User extends Model {
  /**
   * Hash and set user password with strength validation
   * 
   * @param {string} password - Plain text password to hash
   * @throws {Error} When password doesn't meet requirements
   * @returns {Promise<void>}
   * 
   * @example
   * const user = new User();
   * await user.setPassword('mySecurePassword123!');
   */
  async setPassword(password) {
    try {
      // Validate password strength
      if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
      }

      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      // Additional password strength validation
      const hasUpperCase = /[A-Z]/.test(password);
      const hasLowerCase = /[a-z]/.test(password);
      const hasNumbers = /\d/.test(password);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

      if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
        throw new Error('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
      }

      // Hash password with salt rounds of 12 for security
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      this.password_hash = hashedPassword;

    } catch (error) {
      if (error.message.includes('Password')) {
        throw error; // Re-throw validation errors
      }
      throw new Error(`Failed to hash password: ${error.message}`);
    }
  }

  /**
   * Verify password against stored hash
   * 
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} True if password matches, false otherwise
   * @throws {Error} When password verification fails due to system error
   * 
   * @example
   * const isValid = await user.checkPassword('mySecurePassword123!');
   * if (isValid) {
   *   // Password is correct
   * }
   */
  async checkPassword(password) {
    try {
      // Handle null/undefined cases
      if (!password || typeof password !== 'string') {
        return false;
      }

      if (!this.password_hash) {
        return false;
      }

      // Compare password with hash
      const isMatch = await bcrypt.compare(password, this.password_hash);
      return isMatch;

    } catch (error) {
      throw new Error(`Password verification failed: ${error.message}`);
    }
  }

  /**
   * Convert user instance to plain object without sensitive data
   * 
   * @returns {Object} User data without password_hash field
   * 
   * @example
   * const userData = user.toDict();
   * // Returns: { id, email, name, is_active, last_login, created_at, updated_at }
   */
  toDict() {
    const userData = this.toJSON();
    
    // Remove sensitive information
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
   * Update last login timestamp
   * 
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
   * Define associations with other models
   * This method should be called after all models are loaded
   * 
   * @param {Object} models - Object containing all Sequelize models
   * @static
   */
  static associate(models) {
    // Define association with Tasks model (one-to-many relationship)
    // User.hasMany(models.Task, {
    //   foreignKey: 'user_id',
    //   as: 'tasks',
    //   onDelete: 'CASCADE'
    // });
    
    // Add other associations here as needed
  }
}

/**
 * Initialize User model with Sequelize instance
 * 
 * @param {Sequelize} sequelize - Sequelize instance
 * @returns {Model} Initialized User model
 */
export default function initUserModel(sequelize) {
  User.init({
    /**
     * Primary key - UUID v4
     */
    id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
      allowNull: false,
      comment: 'Unique identifier for the user'
    },

    /**
     * User email address - unique and validated
     */
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
          args: [5, 255],
          msg: 'Email must be between 5 and 255 characters'
        },
        notEmpty: {
          msg: 'Email cannot be empty'
        }
      },
      comment: 'User email address - must be unique'
    },

    /**
     * Hashed password - never store plain text
     */
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Password hash cannot be empty'
        },
        len: {
          args: [8, 255],
          msg: 'Password hash must be between 8 and 255 characters'
        }
      },
      comment: 'Bcrypt hashed password'
    },

    /**
     * User display name
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
        // Prevent XSS by validating name format
        is: {
          args: /^[a-zA-Z0-9\s\-'\.]+$/,
          msg: 'Name contains invalid characters'
        }
      },
      comment: 'User display name'
    },

    /**
     * Account status flag
     */
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether the user account is active'
    },

    /**
     * Last login timestamp
     */
    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: {
          msg: 'Last login must be a valid date'
        }
      },
      comment: 'Timestamp of user\'s last login'
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    
    // Enable timestamps
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    // Database indexes for performance
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

    // Model hooks
    hooks: {
      /**
       * Before validation hook - sanitize email
       */
      beforeValidate: (user) => {
        if (user.email) {
          user.email = user.email.toLowerCase().trim();
        }
        if (user.name) {
          user.name = user.name.trim();
        }
      },

      /**
       * Before create hook - ensure password is hashed
       */
      beforeCreate: (user) => {
        if (!user.id) {
          user.id = uuidv4();
        }
      },

      /**
       * After create hook - log user creation (optional)
       */
      afterCreate: (user) => {
        console.log(`New user created: ${user.email} (ID: ${user.id})`);
      }
    },

    // Paranoid mode for soft deletes (optional)
    // paranoid: true,
    // deletedAt: 'deleted_at',

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

      // Recently created users
      recent: {
        order: [['created_at', 'DESC']],
        limit: 10
      }
    }
  });

  return User;
}

/**
 * Security Notes:
 * 
 * 1. Rate Limiting: Implement rate limiting on login endpoints to prevent brute force attacks
 * 2. Password Policy: Consider implementing additional password policies based on requirements
 * 3. Session Management: Use secure session management with proper expiration
 * 4. Input Sanitization: All inputs are validated and sanitized to prevent XSS and injection
 * 5. SQL Injection: Sequelize provides built-in protection against SQL injection
 * 6. GDPR Compliance: Consider implementing data retention and deletion policies
 * 
 * Usage Example:
 * 
 * import sequelize from '../config/database.js';
 * import initUserModel from './user.js';
 * 
 * const User = initUserModel(sequelize);
 * 
 * // Create new user
 * const user = await User.create({
 *   email: 'user@example.com',
 *   name: 'John Doe'
 * });
 * 
 * await user.setPassword('SecurePassword123!');
 * await user.save();
 * 
 * // Authenticate user
 * const foundUser = await User.scope('withPassword').findOne({
 *   where: { email: 'user@example.com' }
 * });
 * 
 * const isValid = await foundUser.checkPassword('SecurePassword123!');
 * if (isValid) {
 *   await foundUser.updateLastLogin();
 *   return foundUser.toDict();
 * }
 */