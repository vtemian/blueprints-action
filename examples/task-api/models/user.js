/**
 * User Model - Production-ready user authentication and management
 * @module models/user
 * @requires sequelize
 * @requires bcrypt
 * @requires validator
 */

const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcrypt');
const validator = require('validator');
const { sequelize } = require('../core/database');

// Configuration constants
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const PASSWORD_MIN_LENGTH = 8;
const EMAIL_MAX_LENGTH = 255;
const NAME_MAX_LENGTH = 100;

/**
 * User Model Class
 * Handles user authentication, validation, and data management
 */
class User extends Model {
  /**
   * Hash and set user password with strength validation
   * @param {string} password - Plain text password
   * @throws {Error} If password doesn't meet requirements
   * @returns {Promise<void>}
   */
  async setPassword(password) {
    // Validate password strength
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a valid string');
    }
    
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
    }
    
    // Additional password strength checks
    if (!/(?=.*[a-z])/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }
    
    if (!/(?=.*[A-Z])/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }
    
    if (!/(?=.*\d)/.test(password)) {
      throw new Error('Password must contain at least one number');
    }
    
    try {
      // Hash password with salt
      const saltRounds = BCRYPT_ROUNDS;
      this.password_hash = await bcrypt.hash(password, saltRounds);
    } catch (error) {
      throw new Error('Failed to hash password: ' + error.message);
    }
  }

  /**
   * Verify password against stored hash using timing-safe comparison
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} True if password matches
   */
  async checkPassword(password) {
    if (!password || typeof password !== 'string' || !this.password_hash) {
      return false;
    }
    
    try {
      // Use bcrypt's built-in timing-safe comparison
      return await bcrypt.compare(password, this.password_hash);
    } catch (error) {
      // Log error but don't expose details
      console.error('Password verification error:', error.message);
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
      throw new Error('Failed to update last login: ' + error.message);
    }
  }

  /**
   * Convert user instance to safe dictionary representation
   * Excludes sensitive data like password hash
   * @returns {Object} Safe user data object
   */
  toDict() {
    const userData = {
      id: this.id,
      email: this.email,
      name: this.name,
      is_active: this.is_active,
      last_login: this.last_login,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
    
    return userData;
  }

  /**
   * Override toJSON to ensure password_hash is never serialized
   * @returns {Object} Safe JSON representation
   */
  toJSON() {
    return this.toDict();
  }

  /**
   * Static method to find user by email with proper error handling
   * @param {string} email - User email address
   * @returns {Promise<User|null>} User instance or null
   */
  static async findByEmail(email) {
    if (!email || !validator.isEmail(email)) {
      throw new Error('Valid email address is required');
    }
    
    try {
      return await this.findOne({
        where: { email: email.toLowerCase().trim() }
      });
    } catch (error) {
      throw new Error('Database query failed: ' + error.message);
    }
  }

  /**
   * Static method to create user with validation
   * @param {Object} userData - User data object
   * @returns {Promise<User>} Created user instance
   */
  static async createUser(userData) {
    const { email, password, name } = userData;
    
    // Validate required fields
    if (!email || !password || !name) {
      throw new Error('Email, password, and name are required');
    }
    
    try {
      const user = await this.create({
        email: email.toLowerCase().trim(),
        name: name.trim(),
        is_active: true
      });
      
      // Set password after creation to trigger validation
      await user.setPassword(password);
      await user.save();
      
      return user;
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw new Error('Email address is already registered');
      }
      throw error;
    }
  }
}

/**
 * Initialize User model with Sequelize
 */
User.init({
  // Primary key with UUID
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  
  // Email field with validation and unique constraint
  email: {
    type: DataTypes.STRING(EMAIL_MAX_LENGTH),
    allowNull: false,
    unique: {
      name: 'users_email_unique',
      msg: 'Email address is already registered'
    },
    validate: {
      isEmail: {
        msg: 'Must be a valid email address'
      },
      len: {
        args: [1, EMAIL_MAX_LENGTH],
        msg: `Email must be between 1 and ${EMAIL_MAX_LENGTH} characters`
      },
      notEmpty: {
        msg: 'Email cannot be empty'
      }
    },
    set(value) {
      // Sanitize email input
      if (value) {
        this.setDataValue('email', value.toLowerCase().trim());
      }
    }
  },
  
  // Password hash - never exposed in JSON
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Password hash cannot be empty'
      }
    }
  },
  
  // User's display name
  name: {
    type: DataTypes.STRING(NAME_MAX_LENGTH),
    allowNull: false,
    validate: {
      len: {
        args: [1, NAME_MAX_LENGTH],
        msg: `Name must be between 1 and ${NAME_MAX_LENGTH} characters`
      },
      notEmpty: {
        msg: 'Name cannot be empty'
      },
      // Prevent XSS in name field
      isAlphanumeric: {
        args: true,
        msg: 'Name can only contain letters, numbers, and spaces'
      }
    },
    set(value) {
      // Sanitize name input
      if (value) {
        this.setDataValue('name', value.trim());
      }
    }
  },
  
  // Account status flag
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  
  // Last login timestamp
  last_login: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: {
        msg: 'Last login must be a valid date'
      }
    }
  },
  
  // Automatic timestamps
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
  
  // Sequelize options
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
  },
  
  // Hooks for additional processing
  hooks: {
    beforeValidate: (user) => {
      // Additional sanitization before validation
      if (user.email) {
        user.email = validator.normalizeEmail(user.email);
      }
    },
    
    beforeCreate: (user) => {
      // Ensure email is lowercase
      if (user.email) {
        user.email = user.email.toLowerCase();
      }
    },
    
    beforeUpdate: (user) => {
      // Ensure email is lowercase on updates
      if (user.email) {
        user.email = user.email.toLowerCase();
      }
    }
  }
});

/**
 * Define associations
 * This should be called after all models are loaded
 */
User.associate = (models) => {
  // One-to-many relationship with Tasks
  User.hasMany(models.Task, {
    foreignKey: 'user_id',
    as: 'tasks',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });
  
  // Add other associations as needed
  // User.hasMany(models.Session, { foreignKey: 'user_id', as: 'sessions' });
};

module.exports = User;