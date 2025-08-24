const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

/**
 * User Model
 * Represents a user in the system with authentication capabilities
 * 
 * @param {Object} sequelize - Sequelize instance
 * @returns {Object} User model
 */
module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    /**
     * Unique identifier for the user
     */
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },

    /**
     * User's email address - must be unique and valid
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
        notEmpty: {
          msg: 'Email cannot be empty'
        },
        len: {
          args: [1, 255],
          msg: 'Email must be between 1 and 255 characters'
        }
      },
      set(value) {
        // Normalize email to lowercase
        this.setDataValue('email', value ? value.toLowerCase().trim() : value);
      }
    },

    /**
     * Hashed password - never store plain text passwords
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
      }
    },

    /**
     * User's display name
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
        }
      },
      set(value) {
        // Trim whitespace from name
        this.setDataValue('name', value ? value.trim() : value);
      }
    },

    /**
     * Whether the user account is active
     */
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },

    /**
     * Timestamp of user's last login
     */
    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: {
          msg: 'Last login must be a valid date'
        }
      }
    }
  }, {
    // Table configuration
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    
    // Indexes
    indexes: [
      {
        unique: true,
        fields: ['email']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['created_at']
      }
    ],

    // Model options
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
    }
  });

  /**
   * Hash and set user password
   * @param {string} password - Plain text password
   * @throws {Error} If password is invalid or hashing fails
   * @returns {Promise<void>}
   */
  User.prototype.setPassword = async function(password) {
    try {
      // Validate password
      if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      if (password.length > 128) {
        throw new Error('Password must be less than 128 characters long');
      }

      // Hash password with salt rounds of 12
      const saltRounds = 12;
      const hash = await bcrypt.hash(password, saltRounds);
      
      this.password_hash = hash;
    } catch (error) {
      if (error.message.includes('Password must be')) {
        throw error;
      }
      throw new Error(`Failed to hash password: ${error.message}`);
    }
  };

  /**
   * Check if provided password matches stored hash
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} True if password matches, false otherwise
   * @throws {Error} If password verification fails
   */
  User.prototype.checkPassword = async function(password) {
    try {
      // Validate input
      if (!password || typeof password !== 'string') {
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
      throw new Error(`Password verification failed: ${error.message}`);
    }
  };

  /**
   * Update user's last login timestamp
   * @returns {Promise<void>}
   */
  User.prototype.updateLastLogin = async function() {
    try {
      this.last_login = new Date();
      await this.save({ fields: ['last_login', 'updated_at'] });
    } catch (error) {
      throw new Error(`Failed to update last login: ${error.message}`);
    }
  };

  /**
   * Convert user instance to dictionary/JSON representation
   * Excludes sensitive information like password_hash
   * @param {Object} options - Serialization options
   * @param {boolean} options.includeTimestamps - Include created_at/updated_at
   * @param {Array<string>} options.exclude - Additional fields to exclude
   * @returns {Object} User data as plain object
   */
  User.prototype.toDict = function(options = {}) {
    const {
      includeTimestamps = true,
      exclude = []
    } = options;

    // Get plain object representation
    const userData = this.get({ plain: true });

    // Always exclude sensitive data
    const defaultExcludes = ['password_hash'];
    
    // Optionally exclude timestamps
    if (!includeTimestamps) {
      defaultExcludes.push('created_at', 'updated_at');
    }

    // Combine default and custom excludes
    const fieldsToExclude = [...defaultExcludes, ...exclude];

    // Remove excluded fields
    fieldsToExclude.forEach(field => {
      delete userData[field];
    });

    return userData;
  };

  /**
   * Find user by email address
   * @param {string} email - Email address to search for
   * @param {Object} options - Query options
   * @returns {Promise<User|null>} User instance or null if not found
   */
  User.findByEmail = async function(email, options = {}) {
    try {
      if (!email || typeof email !== 'string') {
        return null;
      }

      return await this.findOne({
        where: { email: email.toLowerCase().trim() },
        ...options
      });
    } catch (error) {
      throw new Error(`Failed to find user by email: ${error.message}`);
    }
  };

  /**
   * Create user with hashed password
   * @param {Object} userData - User data including plain password
   * @param {Object} options - Creation options
   * @returns {Promise<User>} Created user instance
   */
  User.createWithPassword = async function(userData, options = {}) {
    const transaction = options.transaction;
    
    try {
      const { password, ...userFields } = userData;
      
      // Create user instance
      const user = this.build(userFields);
      
      // Set password (this will hash it)
      if (password) {
        await user.setPassword(password);
      }
      
      // Save user
      await user.save({ transaction });
      
      return user;
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  };

  /**
   * Define associations with other models
   * @param {Object} models - Object containing all models
   */
  User.associate = function(models) {
    // User has many Tasks
    User.hasMany(models.Task, {
      foreignKey: 'user_id',
      as: 'tasks',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    // Add any other associations here as needed
    // Example: User.belongsToMany(models.Role, { through: 'UserRoles' });
  };

  // Hooks
  User.addHook('beforeValidate', (user) => {
    // Ensure email is lowercase and trimmed
    if (user.email) {
      user.email = user.email.toLowerCase().trim();
    }
    
    // Ensure name is trimmed
    if (user.name) {
      user.name = user.name.trim();
    }
  });

  User.addHook('beforeCreate', (user) => {
    // Set default values
    if (user.is_active === undefined) {
      user.is_active = true;
    }
  });

  return User;
};