/**
 * Task Model Definition
 * Production-ready database model with relationships, methods, and indexes
 * @module models/task
 */

const { DataTypes, Model } = require('sequelize');
const { v4: uuidv4, validate: validateUUID } = require('uuid');
const { database } = require('@core/database');
const logger = require('@core/logger');

/**
 * Task status enumeration
 * @readonly
 * @enum {string}
 */
const TaskStatus = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
});

/**
 * Task priority enumeration
 * @readonly
 * @enum {string}
 */
const TaskPriority = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
});

/**
 * Task Model Class
 * Represents a task entity with full CRUD operations and business logic
 * @class Task
 * @extends {Model}
 */
class Task extends Model {
  /**
   * Initialize the Task model
   * @param {Object} attributes - Task attributes
   * @param {Object} options - Model options
   */
  constructor(attributes = {}, options = {}) {
    super(attributes, options);
    this.validateAttributes(attributes);
  }

  /**
   * Validate task attributes during construction
   * @private
   * @param {Object} attributes - Attributes to validate
   * @throws {Error} When validation fails
   */
  validateAttributes(attributes) {
    try {
      if (attributes.id && !validateUUID(attributes.id)) {
        throw new Error('Invalid UUID format for task ID');
      }

      if (attributes.status && !Object.values(TaskStatus).includes(attributes.status)) {
        throw new Error(`Invalid status. Must be one of: ${Object.values(TaskStatus).join(', ')}`);
      }

      if (attributes.priority && !Object.values(TaskPriority).includes(attributes.priority)) {
        throw new Error(`Invalid priority. Must be one of: ${Object.values(TaskPriority).join(', ')}`);
      }

      if (attributes.due_date && !(attributes.due_date instanceof Date) && isNaN(Date.parse(attributes.due_date))) {
        throw new Error('Invalid due_date format. Must be a valid Date object or ISO string');
      }

      if (attributes.title && (typeof attributes.title !== 'string' || attributes.title.trim().length === 0)) {
        throw new Error('Title must be a non-empty string');
      }

    } catch (error) {
      logger.error('Task validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Mark task as completed
   * Updates status to 'completed' and sets completed_at timestamp
   * @returns {Promise<Task>} Updated task instance
   * @throws {Error} When task is already completed or update fails
   */
  async markComplete() {
    try {
      if (this.status === TaskStatus.COMPLETED) {
        throw new Error('Task is already completed');
      }

      const now = new Date();
      
      await this.update({
        status: TaskStatus.COMPLETED,
        completed_at: now,
        updated_at: now
      });

      logger.info(`Task ${this.id} marked as completed`);
      return this;

    } catch (error) {
      logger.error(`Failed to mark task ${this.id} as complete:`, error.message);
      throw new Error(`Failed to mark task as complete: ${error.message}`);
    }
  }

  /**
   * Check if task is overdue
   * Compares current date with due_date, handles null due_date gracefully
   * @returns {boolean} True if task is overdue, false otherwise
   */
  isOverdue() {
    try {
      // Handle null or undefined due_date
      if (!this.due_date) {
        return false;
      }

      // Handle completed tasks
      if (this.status === TaskStatus.COMPLETED) {
        return false;
      }

      const now = new Date();
      const dueDate = new Date(this.due_date);

      // Validate due_date
      if (isNaN(dueDate.getTime())) {
        logger.warn(`Invalid due_date for task ${this.id}`);
        return false;
      }

      // Compare dates (ignoring time for day-level comparison)
      const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

      return nowDate > dueDateOnly;

    } catch (error) {
      logger.error(`Error checking overdue status for task ${this.id}:`, error.message);
      return false;
    }
  }

  /**
   * Get formatted due date string
   * @returns {string|null} Formatted due date or null
   */
  getFormattedDueDate() {
    if (!this.due_date) return null;
    
    try {
      return new Date(this.due_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      logger.warn(`Failed to format due date for task ${this.id}:`, error.message);
      return null;
    }
  }

  /**
   * Get task summary object
   * @returns {Object} Task summary with key information
   */
  getSummary() {
    return {
      id: this.id,
      title: this.title,
      status: this.status,
      priority: this.priority,
      due_date: this.due_date,
      is_overdue: this.isOverdue(),
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  /**
   * Static method to create a new task with validation
   * @static
   * @param {Object} taskData - Task creation data
   * @returns {Promise<Task>} Created task instance
   */
  static async createTask(taskData) {
    try {
      const taskId = taskData.id || uuidv4();
      const now = new Date();

      const task = await this.create({
        id: taskId,
        title: taskData.title,
        description: taskData.description || null,
        status: taskData.status || TaskStatus.PENDING,
        priority: taskData.priority || TaskPriority.MEDIUM,
        due_date: taskData.due_date || null,
        user_id: taskData.user_id,
        created_at: now,
        updated_at: now,
        completed_at: null
      });

      logger.info(`Task created successfully: ${task.id}`);
      return task;

    } catch (error) {
      logger.error('Failed to create task:', error.message);
      throw new Error(`Task creation failed: ${error.message}`);
    }
  }
}

/**
 * Initialize Task model with database connection
 */
Task.init({
  // Primary key - UUID
  id: {
    type: DataTypes.UUID,
    defaultValue: () => uuidv4(),
    primaryKey: true,
    allowNull: false,
    validate: {
      isUUID: 4
    }
  },

  // Task title - required
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Title cannot be empty'
      },
      len: {
        args: [1, 255],
        msg: 'Title must be between 1 and 255 characters'
      }
    }
  },

  // Task description - optional
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  // Task status - enum with default
  status: {
    type: DataTypes.ENUM(...Object.values(TaskStatus)),
    allowNull: false,
    defaultValue: TaskStatus.PENDING,
    validate: {
      isIn: {
        args: [Object.values(TaskStatus)],
        msg: `Status must be one of: ${Object.values(TaskStatus).join(', ')}`
      }
    }
  },

  // Task priority - enum with default
  priority: {
    type: DataTypes.ENUM(...Object.values(TaskPriority)),
    allowNull: false,
    defaultValue: TaskPriority.MEDIUM,
    validate: {
      isIn: {
        args: [Object.values(TaskPriority)],
        msg: `Priority must be one of: ${Object.values(TaskPriority).join(', ')}`
      }
    }
  },

  // Due date - optional
  due_date: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: {
        msg: 'Due date must be a valid date'
      }
    }
  },

  // Foreign key to User model
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

  // Timestamp fields
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },

  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },

  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize: database,
  modelName: 'Task',
  tableName: 'tasks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  // Indexes for performance optimization
  indexes: [
    {
      name: 'idx_tasks_user_id',
      fields: ['user_id']
    },
    {
      name: 'idx_tasks_status',
      fields: ['status']
    },
    {
      name: 'idx_tasks_due_date',
      fields: ['due_date']
    },
    {
      name: 'idx_tasks_priority',
      fields: ['priority']
    },
    {
      name: 'idx_tasks_user_status',
      fields: ['user_id', 'status']
    },
    {
      name: 'idx_tasks_created_at',
      fields: ['created_at']
    }
  ],

  // Model hooks
  hooks: {
    beforeUpdate: (task, options) => {
      task.updated_at = new Date();
    },
    
    beforeValidate: (task, options) => {
      // Trim title if it exists
      if (task.title && typeof task.title === 'string') {
        task.title = task.title.trim();
      }
    }
  }
});

/**
 * Define model associations
 * @param {Object} models - All models for association setup
 */
Task.associate = function(models) {
  // Many-to-one relationship with User
  Task.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });
};

// Export the model and enums
module.exports = {
  Task,
  TaskStatus,
  TaskPriority
};