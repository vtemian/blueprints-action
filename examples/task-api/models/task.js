/**
 * Task Model - Production-ready Task management model
 * Implements SQLAlchemy-style ORM patterns for JavaScript/Node.js
 * 
 * @fileoverview Task model with comprehensive validation and business logic
 * @author Generated Task Model
 * @version 1.0.0
 */

const { DataTypes, Model } = require('sequelize');
const { v4: uuidv4, validate: validateUUID } = require('uuid');

/**
 * Task status enumeration
 * @readonly
 * @enum {string}
 */
const TASK_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
});

/**
 * Task priority enumeration
 * @readonly
 * @enum {string}
 */
const TASK_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
});

/**
 * Custom validation error class for Task operations
 */
class TaskValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'TaskValidationError';
    this.field = field;
  }
}

/**
 * Task Model Class
 * Represents a task entity with comprehensive validation and business logic
 * 
 * @class Task
 * @extends {Model}
 * 
 * @example
 * // Create a new task
 * const task = await Task.create({
 *   title: 'Complete project documentation',
 *   description: 'Write comprehensive docs for the API',
 *   user_id: 'user-uuid-here',
 *   priority: 'high',
 *   due_date: new Date('2024-12-31')
 * });
 * 
 * // Mark task as complete
 * await task.mark_complete();
 * 
 * // Check if task is overdue
 * const overdue = task.is_overdue();
 */
class Task extends Model {
  /**
   * Initialize the Task model with Sequelize
   * @param {import('sequelize').Sequelize} sequelize - Sequelize instance
   * @returns {typeof Task} Task model class
   */
  static init(sequelize) {
    return super.init(
      {
        /**
         * Unique identifier for the task
         * @type {string}
         */
        id: {
          type: DataTypes.UUID,
          defaultValue: () => uuidv4(),
          primaryKey: true,
          allowNull: false,
          validate: {
            isUUID: 4
          }
        },

        /**
         * Task title - brief description of the task
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
         * Detailed description of the task
         * @type {string|null}
         */
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
          validate: {
            len: {
              args: [0, 5000],
              msg: 'Description cannot exceed 5000 characters'
            }
          }
        },

        /**
         * Current status of the task
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
         * Priority level of the task
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
         * Foreign key reference to the User who owns this task
         * @type {string}
         */
        user_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          validate: {
            isUUID: {
              args: 4,
              msg: 'User ID must be a valid UUID'
            },
            notNull: {
              msg: 'User ID is required'
            }
          }
        },

        /**
         * Due date for task completion
         * @type {Date|null}
         */
        due_date: {
          type: DataTypes.DATE,
          allowNull: true,
          validate: {
            isDate: {
              msg: 'Due date must be a valid date'
            },
            isAfterToday(value) {
              if (value && new Date(value) < new Date().setHours(0, 0, 0, 0)) {
                throw new Error('Due date cannot be in the past');
              }
            }
          }
        },

        /**
         * Timestamp when the task was completed
         * @type {Date|null}
         */
        completed_at: {
          type: DataTypes.DATE,
          allowNull: true,
          validate: {
            isDate: {
              msg: 'Completed date must be a valid date'
            }
          }
        },

        /**
         * Timestamp when the task was created
         * @type {Date}
         */
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },

        /**
         * Timestamp when the task was last updated
         * @type {Date}
         */
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      },
      {
        sequelize,
        modelName: 'Task',
        tableName: 'tasks',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
          {
            fields: ['user_id'],
            name: 'idx_tasks_user_id'
          },
          {
            fields: ['status'],
            name: 'idx_tasks_status'
          },
          {
            fields: ['due_date'],
            name: 'idx_tasks_due_date'
          },
          {
            fields: ['user_id', 'status'],
            name: 'idx_tasks_user_status'
          },
          {
            fields: ['priority', 'due_date'],
            name: 'idx_tasks_priority_due'
          }
        ],
        hooks: {
          beforeValidate: (task) => {
            // Trim whitespace from string fields
            if (task.title) {
              task.title = task.title.trim();
            }
            if (task.description) {
              task.description = task.description.trim();
            }
          },
          beforeUpdate: (task) => {
            // Validate status transitions
            if (task.changed('status')) {
              task._validateStatusTransition(task._previousDataValues.status, task.status);
            }
          }
        }
      }
    );
  }

  /**
   * Define associations with other models
   * @param {Object} models - Object containing all model definitions
   */
  static associate(models) {
    // Task belongs to User
    this.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  }

  /**
   * Mark the task as completed
   * Sets status to 'completed' and records completion timestamp
   * 
   * @async
   * @returns {Promise<Task>} Updated task instance
   * @throws {TaskValidationError} When task is already completed or validation fails
   * 
   * @example
   * const task = await Task.findByPk('task-id');
   * await task.mark_complete();
   * console.log(task.status); // 'completed'
   * console.log(task.completed_at); // Current timestamp
   */
  async mark_complete() {
    try {
      // Validate current state
      if (this.status === TASK_STATUS.COMPLETED) {
        throw new TaskValidationError(
          'Task is already completed',
          'status'
        );
      }

      // Update task status and completion timestamp
      const now = new Date();
      await this.update({
        status: TASK_STATUS.COMPLETED,
        completed_at: now
      });

      return this;
    } catch (error) {
      if (error instanceof TaskValidationError) {
        throw error;
      }
      throw new TaskValidationError(
        `Failed to mark task as complete: ${error.message}`,
        'mark_complete'
      );
    }
  }

  /**
   * Check if the task is overdue
   * Returns true if task has a due date in the past and is not completed
   * 
   * @returns {boolean} True if task is overdue, false otherwise
   * 
   * @example
   * const task = await Task.findByPk('task-id');
   * if (task.is_overdue()) {
   *   console.log('Task is overdue!');
   *   // Send notification, update priority, etc.
   * }
   */
  is_overdue() {
    // Task is not overdue if it has no due date
    if (!this.due_date) {
      return false;
    }

    // Task is not overdue if it's already completed
    if (this.status === TASK_STATUS.COMPLETED) {
      return false;
    }

    // Check if due date has passed
    const now = new Date();
    const dueDate = new Date(this.due_date);
    
    return dueDate < now;
  }

  /**
   * Get the number of days until due date
   * @returns {number|null} Days until due (negative if overdue), null if no due date
   */
  days_until_due() {
    if (!this.due_date) {
      return null;
    }

    const now = new Date();
    const dueDate = new Date(this.due_date);
    const diffTime = dueDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  /**
   * Validate status transition rules
   * @private
   * @param {string} fromStatus - Current status
   * @param {string} toStatus - Target status
   * @throws {TaskValidationError} When transition is invalid
   */
  _validateStatusTransition(fromStatus, toStatus) {
    const validTransitions = {
      [TASK_STATUS.PENDING]: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.COMPLETED],
      [TASK_STATUS.IN_PROGRESS]: [TASK_STATUS.PENDING, TASK_STATUS.COMPLETED],
      [TASK_STATUS.COMPLETED]: [] // Completed tasks cannot change status
    };

    if (fromStatus === TASK_STATUS.COMPLETED && toStatus !== TASK_STATUS.COMPLETED) {
      throw new TaskValidationError(
        'Cannot change status of completed task. Create a new task instead.',
        'status'
      );
    }

    if (!validTransitions[fromStatus]?.includes(toStatus)) {
      throw new TaskValidationError(
        `Invalid status transition from '${fromStatus}' to '${toStatus}'`,
        'status'
      );
    }
  }

  /**
   * Get formatted task information
   * @returns {Object} Formatted task data
   */
  toJSON() {
    const values = super.toJSON();
    
    return {
      ...values,
      is_overdue: this.is_overdue(),
      days_until_due: this.days_until_due(),
      formatted_due_date: this.due_date ? this.due_date.toISOString().split('T')[0] : null
    };
  }

  /**
   * Static method to find overdue tasks
   * @static
   * @async
   * @param {Object} options - Query options
   * @returns {Promise<Task[]>} Array of overdue tasks
   */
  static async findOverdue(options = {}) {
    const { Op } = require('sequelize');
    
    return this.findAll({
      where: {
        due_date: {
          [Op.lt]: new Date()
        },
        status: {
          [Op.ne]: TASK_STATUS.COMPLETED
        },
        ...options.where
      },
      ...options
    });
  }

  /**
   * Static method to find tasks by user and status
   * @static
   * @async
   * @param {string} userId - User ID
   * @param {string} status - Task status
   * @param {Object} options - Additional query options
   * @returns {Promise<Task[]>} Array of matching tasks
   */
  static async findByUserAndStatus(userId, status, options = {}) {
    if (!validateUUID(userId)) {
      throw new TaskValidationError('Invalid user ID format', 'user_id');
    }

    if (!Object.values(TASK_STATUS).includes(status)) {
      throw new TaskValidationError('Invalid status value', 'status');
    }

    return this.findAll({
      where: {
        user_id: userId,
        status: status
      },
      order: [['created_at', 'DESC']],
      ...options
    });
  }
}

// Export the Task class and related constants
module.exports = {
  Task,
  TASK_STATUS,
  TASK_PRIORITY,
  TaskValidationError
};

/**
 * Usage Examples:
 * 
 * // 1. Initialize the model (in your database setup)
 * const { Task } = require('./models/Task');
 * Task.init(sequelize);
 * 
 * // 2. Create a new task
 * const newTask = await Task.create({
 *   title: 'Review pull request',
 *   description: 'Review and approve the authentication feature PR',
 *   user_id: 'user-uuid-here',
 *   priority: 'high',
 *   due_date: new Date('2024-01-15')
 * });
 * 
 * // 3. Find and complete a task
 * const task = await Task.findByPk('task-uuid');
 * if (task && !task.is_overdue()) {
 *   await task.mark_complete();
 * }
 * 
 * // 4. Find overdue tasks
 * const overdueTasks = await Task.findOverdue({
 *   include: ['user'],
 *   limit: 10
 * });
 * 
 * // 5. Find user's pending tasks
 * const pendingTasks = await Task.findByUserAndStatus(
 *   'user-uuid',
 *   'pending',
 *   { order: [['priority', 'DESC'], ['due_date', 'ASC']] }
 * );
 */