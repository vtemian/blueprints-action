I'll generate a complete, production-ready Task model implementation following your specifications. Here's the comprehensive solution:

## 1. Main Model File (models/task.js)

```javascript
/**
 * Task Model Implementation
 * @module models/task
 * @description Production-ready Task model with Sequelize ORM integration
 */

const { DataTypes, Model, Op } = require('sequelize');
const { v4: uuidv4, validate: validateUUID } = require('uuid');
const moment = require('moment-timezone');
const { ValidationError, DatabaseError, BusinessLogicError } = require('../utils/errors');
const { validateTaskInput } = require('../validators/taskValidator');
const sequelize = require('../config/database');

/**
 * Task Status Enumeration
 * @readonly
 * @enum {string}
 */
const TASK_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
});

/**
 * Task Priority Enumeration
 * @readonly
 * @enum {string}
 */
const TASK_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
});

/**
 * Task Model Class
 * @class Task
 * @extends {Model}
 */
class Task extends Model {
  /**
   * Mark task as completed
   * @async
   * @method markComplete
   * @returns {Promise<Task>} Updated task instance
   * @throws {BusinessLogicError} When task is already completed
   * @throws {DatabaseError} When database operation fails
   */
  async markComplete() {
    try {
      if (this.status === TASK_STATUS.COMPLETED) {
        throw new BusinessLogicError('Task is already completed', 'TASK_ALREADY_COMPLETED');
      }

      const transaction = await sequelize.transaction();
      
      try {
        this.status = TASK_STATUS.COMPLETED;
        this.completed_at = moment().utc().toDate();
        
        await this.save({ transaction });
        await transaction.commit();
        
        return this;
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      if (error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to mark task as complete', 'TASK_COMPLETION_FAILED', error);
    }
  }

  /**
   * Check if task is overdue
   * @method isOverdue
   * @returns {boolean} True if task is past due date and not completed
   */
  isOverdue() {
    if (!this.due_date || this.status === TASK_STATUS.COMPLETED) {
      return false;
    }
    
    const now = moment().utc();
    const dueDate = moment(this.due_date).utc();
    
    return now.isAfter(dueDate);
  }

  /**
   * Get formatted due date
   * @method getFormattedDueDate
   * @param {string} [timezone='UTC'] - Timezone for formatting
   * @param {string} [format='YYYY-MM-DD HH:mm:ss'] - Date format
   * @returns {string|null} Formatted due date or null
   */
  getFormattedDueDate(timezone = 'UTC', format = 'YYYY-MM-DD HH:mm:ss') {
    if (!this.due_date) return null;
    return moment(this.due_date).tz(timezone).format(format);
  }

  /**
   * Get task duration (time between creation and completion)
   * @method getDuration
   * @returns {number|null} Duration in milliseconds or null if not completed
   */
  getDuration() {
    if (!this.completed_at) return null;
    return moment(this.completed_at).diff(moment(this.created_at));
  }

  /**
   * Convert task to JSON with computed properties
   * @method toJSON
   * @returns {Object} Task object with additional computed properties
   */
  toJSON() {
    const values = { ...this.dataValues };
    
    return {
      ...values,
      isOverdue: this.isOverdue(),
      duration: this.getDuration(),
      formattedDueDate: this.getFormattedDueDate()
    };
  }

  /**
   * Static method to find overdue tasks
   * @static
   * @async
   * @method findOverdueTasks
   * @param {string} [userId] - Optional user ID filter
   * @returns {Promise<Task[]>} Array of overdue tasks
   */
  static async findOverdueTasks(userId = null) {
    const whereClause = {
      due_date: {
        [Op.lt]: moment().utc().toDate()
      },
      status: {
        [Op.ne]: TASK_STATUS.COMPLETED
      }
    };

    if (userId) {
      whereClause.user_id = userId;
    }

    return await this.findAll({
      where: whereClause,
      order: [['due_date', 'ASC']],
      include: ['User']
    });
  }

  /**
   * Static method to get task statistics for a user
   * @static
   * @async
   * @method getTaskStatistics
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Task statistics object
   */
  static async getTaskStatistics(userId) {
    const stats = await this.findAll({
      where: { user_id: userId },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    const result = {
      total: 0,
      pending: 0,
      in_progress: 0,
      completed: 0,
      overdue: 0
    };

    stats.forEach(stat => {
      result[stat.status] = parseInt(stat.count);
      result.total += parseInt(stat.count);
    });

    // Get overdue count
    const overdueCount = await this.count({
      where: {
        user_id: userId,
        due_date: {
          [Op.lt]: moment().utc().toDate()
        },
        status: {
          [Op.ne]: TASK_STATUS.COMPLETED
        }
      }
    });

    result.overdue = overdueCount;
    return result;
  }
}

/**
 * Initialize Task model with Sequelize
 */
Task.init({
  /**
   * Primary key UUID
   * @type {string}
   */
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
    validate: {
      isUUID: 4
    }
  },

  /**
   * Task title
   * @type {string}
   */
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Title cannot be empty'
      },
      len: {
        args: [1, 200],
        msg: 'Title must be between 1 and 200 characters'
      }
    }
  },

  /**
   * Task description
   * @type {string}
   */
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  /**
   * Task status
   * @type {string}
   */
  status: {
    type: DataTypes.ENUM(...Object.values(TASK_STATUS)),
    allowNull: false,
    defaultValue: TASK_STATUS.PENDING,
    validate: {
      isIn: {
        args: [Object.values(TASK_STATUS)],
        msg: `Status must be one of: ${Object.values(TASK_STATUS).join(', ')}`
      }
    }
  },

  /**
   * Task priority
   * @type {string}
   */
  priority: {
    type: DataTypes.ENUM(...Object.values(TASK_PRIORITY)),
    allowNull: false,
    defaultValue: TASK_PRIORITY.MEDIUM,
    validate: {
      isIn: {
        args: [Object.values(TASK_PRIORITY)],
        msg: `Priority must be one of: ${Object.values(TASK_PRIORITY).join(', ')}`
      }
    }
  },

  /**
   * Foreign key to User model
   * @type {string}
   */
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
    validate: {
      isUUID: 4,
      notNull: {
        msg: 'User ID is required'
      }
    }
  },

  /**
   * Task due date
   * @type {Date}
   */
  due_date: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: {
        msg: 'Due date must be a valid date'
      },
      isFutureDate(value) {
        if (value && moment(value).isBefore(moment())) {
          throw new Error('Due date must be in the future');
        }
      }
    }
  },

  /**
   * Task completion timestamp
   * @type {Date}
   */
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },

  /**
   * Record creation timestamp
   * @type {Date}
   */
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },

  /**
   * Record update timestamp
   * @type {Date}
   */
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'Task',
  tableName: 'tasks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['due_date']
    },
    {
      fields: ['user_id', 'status']
    },
    {
      fields: ['due_date', 'status']
    }
  ],

  hooks: {
    beforeValidate: async (task, options) => {
      // Validate input using external validator
      await validateTaskInput(task.dataValues);
    },

    beforeUpdate: async (task, options) => {
      // Auto-set completed_at when status changes to completed
      if (task.changed('status') && task.status === TASK_STATUS.COMPLETED && !task.completed_at) {
        task.completed_at = moment().utc().toDate();
      }
      
      // Clear completed_at if status changes from completed
      if (task.changed('status') && task.status !== TASK_STATUS.COMPLETED && task.completed_at) {
        task.completed_at = null;
      }
    }
  }
});

/**
 * Define associations
 * @param {Object} models - All models object
 */
Task.associate = function(models) {
  Task.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'User',
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  });
};

// Export constants and model
module.exports = {
  Task,
  TASK_STATUS,
  TASK_PRIORITY
};
```

## 2. Database Migration File (migrations/001-create-tasks-table.js)

```javascript
/**
 * Task Table Migration
 * @description Creates tasks table with proper indexes and constraints
 */

'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  /**
   * Migration up - Create tasks table
   * @param {QueryInterface} queryInterface
   * @param {Sequelize} Sequelize
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Create ENUM types
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_tasks_status" AS ENUM ('pending', 'in_progress', 'completed');
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_tasks_priority" AS ENUM ('low', 'medium', 'high');
      `, { transaction });

      // Create tasks table
      await queryInterface.createTable('tasks', {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        title: {
          type: DataTypes.STRING(200),
          allowNull: false
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        status: {
          type: DataTypes.ENUM('pending', 'in_progress', 'completed'),
          allowNull: false,
          defaultValue: 'pending'
        },
        priority: {
          type: DataTypes.ENUM('low', 'medium', 'high'),
          allowNull: false,
          defaultValue: 'medium'
        },
        user_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        due_date: {
          type: DataTypes.DATE,
          allowNull: true
        },
        completed_at: {
          type: DataTypes.DATE,
          allowNull: true
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      // Create indexes
      await queryInterface.addIndex('tasks', ['user_id'], {
        name: 'idx_tasks_user_id',
        transaction
      });

      await queryInterface.addIndex('tasks', ['status'], {
        name: 'idx_tasks_status',
        transaction
      });

      await queryInterface.addIndex('tasks', ['due_date'], {
        name: 'idx_tasks_due_date',
        transaction
      });

      await queryInterface.addIndex('tasks', ['user_id', 'status'], {
        name: 'idx_tasks_user_status',
        transaction
      });

      await queryInterface.addIndex('tasks', ['due_date', 'status'], {
        name: 'idx_tasks_due_date_status',
        transaction
      });

      // Add constraints
      await queryInterface.sequelize.query(`
        ALTER TABLE tasks ADD CONSTRAINT chk_title_not_empty 
        CHECK (LENGTH(TRIM(title)) > 0);
      `, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE tasks ADD CONSTRAINT chk_due_date_future 
        CHECK (due_date IS NULL OR due_date > created_at);
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();