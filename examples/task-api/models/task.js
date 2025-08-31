/**
 * Task Model
 * Represents a task entity with status tracking, priority levels, and user association
 * @module models/task
 */

const { DataTypes, Model } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../config/database'); // Adjust path as needed

// Define enum constants
const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
};

const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

/**
 * Task Model Class
 * @class Task
 * @extends {Model}
 */
class Task extends Model {
  /**
   * Mark task as completed and set completion timestamp
   * @returns {Promise<Task>} Updated task instance
   * @throws {Error} If task is already completed or save operation fails
   */
  async markComplete() {
    try {
      if (this.status === TASK_STATUS.COMPLETED) {
        throw new Error('Task is already completed');
      }

      this.status = TASK_STATUS.COMPLETED;
      this.completed_at = new Date();
      
      await this.save();
      return this;
    } catch (error) {
      throw new Error(`Failed to mark task as complete: ${error.message}`);
    }
  }

  /**
   * Check if task is overdue
   * @returns {boolean} True if task is past due date and not completed
   */
  isOverdue() {
    if (!this.due_date || this.status === TASK_STATUS.COMPLETED) {
      return false;
    }
    
    const now = new Date();
    return new Date(this.due_date) < now;
  }

  /**
   * Get formatted status for display
   * @returns {string} Formatted status string
   */
  getFormattedStatus() {
    return this.status.replace('_', ' ').toUpperCase();
  }

  /**
   * Get days until due date
   * @returns {number|null} Number of days until due (negative if overdue), null if no due date
   */
  getDaysUntilDue() {
    if (!this.due_date) return null;
    
    const now = new Date();
    const dueDate = new Date(this.due_date);
    const diffTime = dueDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }
}

// Initialize the Task model
Task.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: () => uuidv4(),
    primaryKey: true,
    allowNull: false,
    comment: 'Unique identifier for the task'
  },
  
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Task title cannot be empty'
      },
      len: {
        args: [1, 200],
        msg: 'Task title must be between 1 and 200 characters'
      }
    },
    comment: 'Task title or summary'
  },
  
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Detailed description of the task'
  },
  
  status: {
    type: DataTypes.ENUM(Object.values(TASK_STATUS)),
    allowNull: false,
    defaultValue: TASK_STATUS.PENDING,
    validate: {
      isIn: {
        args: [Object.values(TASK_STATUS)],
        msg: 'Status must be one of: pending, in_progress, completed'
      }
    },
    comment: 'Current status of the task'
  },
  
  priority: {
    type: DataTypes.ENUM(Object.values(TASK_PRIORITY)),
    allowNull: false,
    defaultValue: TASK_PRIORITY.MEDIUM,
    validate: {
      isIn: {
        args: [Object.values(TASK_PRIORITY)],
        msg: 'Priority must be one of: low, medium, high'
      }
    },
    comment: 'Task priority level'
  },
  
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
    comment: 'ID of the user who owns this task'
  },
  
  due_date: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: {
        msg: 'Due date must be a valid date'
      },
      isFutureDate(value) {
        if (value && new Date(value) <= new Date()) {
          throw new Error('Due date must be in the future');
        }
      }
    },
    comment: 'When the task is due to be completed'
  },
  
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when the task was completed'
  },
  
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When the task was created'
  },
  
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When the task was last updated'
  }
}, {
  sequelize,
  modelName: 'Task',
  tableName: 'tasks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  // Add indexes for performance
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
      fields: ['priority', 'status'],
      name: 'idx_tasks_priority_status'
    }
  ],
  
  // Model-level validations and hooks
  hooks: {
    /**
     * Before validation hook to handle status transitions
     */
    beforeValidate: (task, options) => {
      // Ensure completed_at is set when status is completed
      if (task.status === TASK_STATUS.COMPLETED && !task.completed_at) {
        task.completed_at = new Date();
      }
      
      // Clear completed_at if status is not completed
      if (task.status !== TASK_STATUS.COMPLETED && task.completed_at) {
        task.completed_at = null;
      }
    },
    
    /**
     * Before update hook to validate status transitions
     */
    beforeUpdate: (task, options) => {
      const previousStatus = task._previousDataValues?.status;
      const currentStatus = task.status;
      
      // Validate logical status transitions
      if (previousStatus === TASK_STATUS.COMPLETED && 
          currentStatus !== TASK_STATUS.COMPLETED) {
        throw new Error('Cannot change status of a completed task. Create a new task instead.');
      }
    }
  },
  
  // Define scopes for common queries
  scopes: {
    pending: {
      where: { status: TASK_STATUS.PENDING }
    },
    inProgress: {
      where: { status: TASK_STATUS.IN_PROGRESS }
    },
    completed: {
      where: { status: TASK_STATUS.COMPLETED }
    },
    overdue: {
      where: {
        due_date: {
          [sequelize.Sequelize.Op.lt]: new Date()
        },
        status: {
          [sequelize.Sequelize.Op.ne]: TASK_STATUS.COMPLETED
        }
      }
    },
    highPriority: {
      where: { priority: TASK_PRIORITY.HIGH }
    },
    byUser: (userId) => ({
      where: { user_id: userId }
    })
  }
});

/**
 * Define associations
 * This should be called after all models are defined
 */
Task.associate = (models) => {
  // Many-to-one relationship with User
  Task.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });
};

// Static methods for common operations
/**
 * Get tasks by user with optional filters
 * @param {string} userId - User ID
 * @param {Object} filters - Optional filters (status, priority, etc.)
 * @returns {Promise<Task[]>} Array of tasks
 */
Task.getByUser = async function(userId, filters = {}) {
  try {
    const whereClause = { user_id: userId, ...filters };
    
    return await this.findAll({
      where: whereClause,
      order: [
        ['priority', 'DESC'],
        ['due_date', 'ASC'],
        ['created_at', 'DESC']
      ]
    });
  } catch (error) {
    throw new Error(`Failed to fetch user tasks: ${error.message}`);
  }
};

/**
 * Get overdue tasks for a user
 * @param {string} userId - User ID
 * @returns {Promise<Task[]>} Array of overdue tasks
 */
Task.getOverdueByUser = async function(userId) {
  try {
    return await this.scope('overdue').findAll({
      where: { user_id: userId },
      order: [['due_date', 'ASC']]
    });
  } catch (error) {
    throw new Error(`Failed to fetch overdue tasks: ${error.message}`);
  }
};

// Export constants along with the model
Task.STATUS = TASK_STATUS;
Task.PRIORITY = TASK_PRIORITY;

module.exports = Task;