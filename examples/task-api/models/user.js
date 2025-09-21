/**
 * User Model Implementation
 * Production-ready User model with Sequelize ORM
 * @fileoverview User model with authentication, validation, and security features
 */

import { DataTypes, Model } from 'sequelize';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { sequelize } from '@core/database';

/**
 * Custom validation error class
 */
class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Custom authentication error class
 */
class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * User Model Class
 * Handles user authentication, validation, and database operations
 * 
 * @class User
 * @extends {Model}
 */
class User extends Model {
  /**
   * Hash and set user password
   * @async
   * @param {string} password - Plain text password to hash
   * @throws {ValidationError} When password doesn't meet requirements
   * @throws {Error} When bcrypt hashing fails
   * @returns {Promise<void>}
   */
  async setPassword(password) {
    try {
      // Validate password requirements
      if (!password || typeof password !== 'string') {
        throw new ValidationError('Password must be a non-empty string', 'password');
      }

      if (password.length < 8) {
        throw new ValidationError('Password must be at least 8 characters long', 'password');
      }

      // Additional password strength validation
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
      if (!passwordRegex.test(password)) {
        throw new ValidationError(
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
          'password'
        );
      }

      // Hash password with salt rounds 12
      const saltRounds = 12;
      this.password_hash = await bcrypt.hash(password, saltRounds);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new Error(`Failed to hash password: ${error.message}`);
    }
  }

  /**
   * Verify user password against stored hash
   * @async
   * @param {string} password - Plain text password to verify
   * @throws {AuthenticationError} When password verification fails
   * @throws {Error} When bcrypt comparison fails
   * @returns {Promise<boolean>} True if password matches, false otherwise
   */
  async checkPassword(password) {
    try {
      if (!password || typeof password !== 'string') {
        throw new AuthenticationError('Invalid password format');
      }

      if (!this.password_hash) {
        throw new AuthenticationError('No password hash found for user');
      }

      const isValid = await bcrypt.compare(password, this.password_hash);
      return isValid;
    } catch (error) {
      if (error instanceof AuthenticationError) {
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
   * @async
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
   * Deactivate user account
   * @async
   * @returns {Promise<void>}
   */
  async deactivate() {
    try {
      this.is_active = false;
      await this.save();
    } catch (error) {
      throw new Error(`Failed to deactivate user: ${error.message}`);
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
    } catch (error) {
      throw new Error(`Failed to activate user: ${error.message}`);
    }
  }

  /**
   * Static method to find user by email
   * @static
   * @async
   * @param {string} email - User email address
   * @returns {Promise<User|null>} User instance or null if not found
   */
  static async findByEmail(email) {
    try {
      if (!email || typeof email !== 'string') {
        throw new ValidationError('Email must be a non-empty string', 'email');
      }

      return await User.findOne({
        where: { email: email.toLowerCase().trim() }
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new Error(`Failed to find user by email: ${error.message}`);
    }
  }

  /**
   * Static method to create new user with validation
   * @static
   * @async
   * @param {Object} userData - User data object
   * @param {string} userData.email - User email
   * @param {string} userData.password - User password
   * @param {string} userData.name - User name
   * @returns {Promise<User>} Created user instance
   */
  static async createUser(userData) {
    try {
      const { email, password, name } = userData;

      // Create new user instance
      const user = User.build({
        id: uuidv4(),
        email: email.toLowerCase().trim(),
        name: name.trim(),
        is_active: true
      });

      // Set password (includes validation)
      await user.setPassword(password);

      // Save to database
      await user.save();

      return user;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }
}

// Initialize User model with Sequelize
User.init(
  {
    // Primary key with UUID
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
      comment: 'Unique identifier for the user'
    },

    // Email field with validation and uniqueness
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
        },
        notEmpty: {
          msg: 'Email cannot be empty'
        }
      },
      comment: 'User email address (unique)'
    },

    // Password hash field
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

    // User name field
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
        },
        is: {
          args: /^[a-zA-Z\s\-'\.]+$/,
          msg: 'Name can only contain letters, spaces, hyphens, apostrophes, and periods'
        }
      },
      comment: 'User full name'
    },

    // Active status flag
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether the user account is active'
    },

    // Last login timestamp
    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp of last successful login'
    },

    // Creation timestamp
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Timestamp when user was created'
    },

    // Update timestamp
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Timestamp when user was last updated'
    }
  },
  {
    // Sequelize model options
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

    // Hooks for additional processing
    hooks: {
      beforeValidate: (user) => {
        // Normalize email to lowercase
        if (user.email) {
          user.email = user.email.toLowerCase().trim();
        }
        
        // Trim name
        if (user.name) {
          user.name = user.name.trim();
        }
      },

      beforeCreate: (user) => {
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

// Define associations (for future use with Tasks)
User.associate = (models) => {
  // One-to-many relationship with Tasks (when implemented)
  // User.hasMany(models.Task, {
  //   foreignKey: 'user_id',
  //   as: 'tasks'
  // });
};

// Export the model and custom error classes
export { User, ValidationError, AuthenticationError };
export default User;