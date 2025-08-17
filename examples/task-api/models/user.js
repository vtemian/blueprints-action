/**
 * User Model
 * Sequelize model for user management with authentication capabilities
 * 
 * @module models/user
 * @requires sequelize
 * @requires bcrypt
 * @requires uuid
 */

const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../core/database');

/**
 * User Model Class
 * Handles user authentication, profile management, and database operations
 */
class User extends Model {
  /**
   * Hash and set user password
   * @param {string} password - Plain text password to hash
   * @returns {Promise<void>}
   * @throws {Error} If password is invalid or hashing fails
   */
  async setPassword(password) {
    try {
      if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
      }
      
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      const saltRounds = 12;
      this.password_hash = await bcrypt.hash(password, saltRounds);
    } catch (error) {
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Verify user password against stored hash
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} True if password matches, false otherwise
   * @throws {Error} If password comparison fails
   */
  async checkPassword(password) {
    try {
      if (!password || typeof password !== 'string') {
        return false;
      }

      if (!this.password_hash) {
        return false;
      }

      return await bcrypt.compare(password, this.password_hash);
    } catch (error) {
      throw new Error(`Password verification failed: ${error.message}`);
    }
  }

  /**
   * Convert user instance to dictionary/object without sensitive data
   * @returns {Object} User object without password_hash
   */
  toDict() {
    const userObject = this.toJSON();
    
    // Remove sensitive fields
    delete userObject.password_hash;
    
    return {
      id: userObject.id,
      email: userObject.email,
      name: userObject.name,
      is_active: userObject.is_active,
      last_login: userObject.last_login,
      created_at: userObject.created_at,
      updated_at: userObject.updated_at
    };
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
   * Deactivate user account
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
}

// Initialize User model with Sequelize
User.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
    comment: 'Unique identifier for the user'
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
        args: [5, 255],
        msg: 'Email must be between 5 and 255 characters'
      },
      notEmpty: {
        msg: 'Email cannot be empty'
      }
    },
    comment: 'User email address - must be unique'
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Password hash cannot be empty'
      },
      len: {
        args: [6, 255],
        msg: 'Password hash must be between 6 and 255 characters'
      }
    },
    comment: 'Bcrypt hashed password'
  },
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
      is: {
        args: /^[a-zA-Z\s'-]+$/,
        msg: 'Name can only contain letters, spaces, hyphens, and apostrophes'
      }
    },
    comment: 'User full name'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether the user account is active'
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: {
        msg: 'Last login must be a valid date'
      }
    },
    comment: 'Timestamp of user last login'
  }
}, {
  sequelize,
  modelName: 'User',
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
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
  hooks: {
    /**
     * Before validation hook to normalize email
     */
    beforeValidate: (user, options) => {
      if (user.email) {
        user.email = user.email.toLowerCase().trim();
      }
      if (user.name) {
        user.name = user.name.trim();
      }
    },

    /**
     * Before create hook to ensure UUID is set
     */
    beforeCreate: (user, options) => {
      if (!user.id) {
        user.id = uuidv4();
      }
    }
  },
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
    },
    inactive: {
      where: {
        is_active: false
      }
    }
  }
});

/**
 * Define associations
 * Note: Uncomment and modify when Task model is available
 */
User.associate = (models) => {
  // One-to-many relationship with Tasks
  // User.hasMany(models.Task, {
  //   foreignKey: 'user_id',
  //   as: 'tasks',
  //   onDelete: 'CASCADE',
  //   onUpdate: 'CASCADE'
  // });
};

/**
 * Static method to find user by email with password
 * @param {string} email - User email address
 * @returns {Promise<User|null>} User instance or null if not found
 */
User.findByEmailWithPassword = async function(email) {
  try {
    return await this.scope('withPassword').findOne({
      where: { email: email.toLowerCase().trim() }
    });
  } catch (error) {
    throw new Error(`Failed to find user by email: ${error.message}`);
  }
};

/**
 * Static method to find active users
 * @param {Object} options - Query options
 * @returns {Promise<User[]>} Array of active users
 */
User.findActiveUsers = async function(options = {}) {
  try {
    return await this.scope('active').findAll(options);
  } catch (error) {
    throw new Error(`Failed to find active users: ${error.message}`);
  }
};

/**
 * Static method to create user with hashed password
 * @param {Object} userData - User data object
 * @param {string} userData.email - User email
 * @param {string} userData.password - Plain text password
 * @param {string} userData.name - User name
 * @returns {Promise<User>} Created user instance
 */
User.createWithPassword = async function(userData) {
  const transaction = await sequelize.transaction();
  
  try {
    const { email, password, name, ...otherData } = userData;
    
    // Create user instance
    const user = this.build({
      email,
      name,
      ...otherData
    });
    
    // Set password (this will hash it)
    await user.setPassword(password);
    
    // Save user
    await user.save({ transaction });
    
    await transaction.commit();
    
    // Return user without password hash
    return user.toDict();
  } catch (error) {
    await transaction.rollback();
    throw new Error(`Failed to create user: ${error.message}`);
  }
};

module.exports = User;