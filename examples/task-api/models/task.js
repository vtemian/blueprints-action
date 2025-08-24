/**
 * Task Model
 * Sequelize model definition for Task entity with comprehensive validation,
 * relationships, and business logic methods.
 * 
 * @module models/task
 * @requires sequelize
 * @requires @core/database
 * @requires crypto
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('@core/database');
const { randomUUID } = require('crypto');

/**
 * Task Model Class
 * Represents a task entity with status tracking, priority management,
 * and user association capabilities.
 * 
 * @class Task
 * @extends {Model}
 */
class Task extends Model {
  /**
   * Mark task as completed
   * Sets status to 'completed' and updates completed_at timestamp
   * 
   * @async
   * @method markComplete
   * @returns {Promise<Task>} Updated task instance
   * @throws {Error} Database operation errors
   * 
   * @example
   * const task = await Task.findByPk(taskId);
   * await task.markComplete();
   */
  async markComplete() {
    try {
      // Validate current state
      if (this.status === 'completed') {
        throw new Error('Task is already completed');
      }

      // Update task properties
      this.status = 'completed';
      this.completed_at = new Date();
      
      // Save changes to database
      await this.save();
      
      return this;
    } catch (error) {
      throw new Error(`Failed to mark task as complete: ${error.message}`);
    }
  }

  /**
   * Check if task is overdue
   * Compares due_date with current date, considering timezone
   * 
   * @method isOverdue
   * @returns {boolean} True if task is past due date and not completed
   * 
   * @example
   * const task = await Task.findByPk(taskId);
   * if (task.isOverdue()) {
   *   console.log('Task is overdue!');
   * }
   */
  isOverdue() {
    try {
      // Return false if no due date set or task is completed
      if (!this.due_date || this.status === 'completed') {
        return false;
      }

      // Compare due date with current date (normalize to start of day)
      const currentDate = new Date();
      const dueDate = new Date(this.due_date);
      
      // Set time to start of day for accurate comparison
      currentDate.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);
      
      return dueDate < currentDate;
    } catch (error) {
      console.error(`Error checking overdue status: ${error.message}`);
      return false;
    }
  }

  /**
   * Get formatted due date string
   * 
   * @method getFormattedDueDate
   * @returns {string|null} Formatted due date or null if not set
   */
  getFormattedDueDate() {
    if (!this.due_date) return null;
    
    try {
      return new Date(this.due_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error(`Error formatting due date: ${error.message}`);
      return null;
    }
  }

  /**
   * Get task summary object
   * 
   * @method getSummary
   * @returns {Object} Task summary with key information
   */
  getSummary() {
    return {
      id: this.id,
      title: this.title,
      status: this.status,
      priority: this.priority,
      isOverdue: this.isOverdue(),
      dueDate: this.getFormattedDueDate(),
      createdAt: this.created_at
    };
  }
}

// Initialize Task model with field definitions and constraints
Task.init({
  /**
   * Primary key - UUID
   */
  id: {
    type: DataTypes.UUID,
    defaultValue: () => randomUUID(),
    primaryKey: true,
    allowNull: false,
    comment: 'Unique identifier for the task'
  },

  /**
   * Task title with validation
   */
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
      },
      notNull: {
        msg: 'Task title is required'
      }
    },
    comment: 'Task title or summary'
  },

  /**
   * Task description - optional detailed information
   */
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    validate: {
      len: {
        args: [0, 5000],
        msg: 'Task description cannot exceed 5000 characters'
      }
    },
    comment: 'Detailed task description'
  },

  /**
   * Task status with enum validation
   */
  status: {
    type: DataTypes.ENUM('pending', 'in_progress', 'completed'),
    allowNull: false,
    defaultValue: 'pending',
    validate: {
      isIn: {
        args: [['pending', 'in_progress', 'completed']],
        msg: 'Status must be one of: pending, in_progress, completed'
      }
    },
    comment: 'Current status of the task'
  },

  /**
   * Task priority with enum validation
   */
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    allowNull: false,
    defaultValue: 'medium',
    validate: {
      isIn: {
        args: [['low', 'medium', 'high']],
        msg: 'Priority must be one of: low, medium, high'
      }
    },
    comment: 'Task priority level'
  },

  /**
   * Foreign key reference to User model
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
      notNull: {
        msg: 'User ID is required'
      },
      isUUID: {
        args: 4,
        msg: 'User ID must be a valid UUID'
      }
    },
    comment: 'Reference to the user who owns this task'
  },

  /**
   * Optional due date
   */
  due_date: {
    type: DataTypes.DATEONLY,
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
    },
    comment: 'Optional due date for the task'
  },

  /**
   * Completion timestamp - set when task is marked complete
   */
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: {
        msg: 'Completed date must be a valid date'
      }
    },
    comment: 'Timestamp when task was completed'
  },

  /**
   * Creation timestamp
   */
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Task creation timestamp'
  },

  /**
   * Last update timestamp
   */
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Last modification timestamp'
  }
}, {
  sequelize,
  modelName: 'Task',
  tableName: 'tasks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  
  // Database indexes for performance optimization
  indexes: [
    {
      fields: ['user_id'],
      name: 'idx_tasks_user_id',
      comment: 'Index for user-based task queries'
    },
    {
      fields: ['status'],
      name: 'idx_tasks_status',
      comment: 'Index for status-based filtering'
    },
    {
      fields: ['due_date'],
      name: 'idx_tasks_due_date',
      comment: 'Index for due date queries and sorting'
    },
    {
      fields: ['priority', 'status'],
      name: 'idx_tasks_priority_status',
      comment: 'Composite index for priority and status queries'
    },
    {
      fields: ['user_id', 'status'],
      name: 'idx_tasks_user_status',
      comment: 'Composite index for user-specific status queries'
    }
  ],

  // Model-level validations
  validate: {
    /**
     * Validate completion logic
     */
    completionLogic() {
      if (this.status === 'completed' && !this.completed_at) {
        throw new Error('Completed tasks must have a completion timestamp');
      }
      if (this.status !== 'completed' && this.completed_at) {
        throw new Error('Only completed tasks can have a completion timestamp');
      }
    },

    /**
     * Validate due date logic
     */
    dueDateLogic() {
      if (this.due_date && this.completed_at && 
          new Date(this.due_date) < new Date(this.completed_at)) {
        // This is acceptable - task can be completed after due date
        // Just log for tracking purposes
        console.warn(`Task ${this.id} was completed after due date`);
      }
    }
  },

  // Hooks for additional business logic
  hooks: {
    /**
     * Before validation hook
     */
    beforeValidate: (task, options) => {
      // Trim whitespace from title
      if (task.title) {
        task.title = task.title.trim();
      }
      
      // Trim whitespace from description
      if (task.description) {
        task.description = task.description.trim();
      }
    },

    /**
     * Before update hook
     */
    beforeUpdate: (task, options) => {
      // Auto-set completed_at when status changes to completed
      if (task.changed('status') && task.status === 'completed' && !task.completed_at) {
        task.completed_at = new Date();
      }
      
      // Clear completed_at when status changes from completed
      if (task.changed('status') && task.status !== 'completed' && task.completed_at) {
        task.completed_at = null;
      }
    }
  },

  comment: 'Task management table with status tracking and user association'
});

/**
 * Define model associations
 * This should be called after all models are defined
 * 
 * @static
 * @method associate
 * @param {Object} models - Object containing all defined models
 */
Task.associate = function(models) {
  try {
    // Many-to-one relationship with User
    Task.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
  } catch (error) {
    console.error('Error defining Task associations:', error.message);
  }
};

/**
 * Static method to find overdue tasks
 * 
 * @static
 * @async
 * @method findOverdueTasks
 * @param {string} [userId] - Optional user ID to filter by
 * @returns {Promise<Task[]>} Array of overdue tasks
 */
Task.findOverdueTasks = async function(userId = null) {
  try {
    const whereClause = {
      due_date: {
        [sequelize.Sequelize.Op.lt]: new Date()
      },
      status: {
        [sequelize.Sequelize.Op.ne]: 'completed'
      }
    };

    if (userId) {
      whereClause.user_id = userId;
    }

    return await this.findAll({
      where: whereClause,
      order: [['due_date', 'ASC']],
      include: [{
        model: sequelize.models.User,
        as: 'user',
        attributes: ['id', 'name', 'email']
      }]
    });
  } catch (error) {
    throw new Error(`Failed to find overdue tasks: ${error.message}`);
  }
};

/**
 * Static method to get task statistics
 * 
 * @static
 * @async
 * @method getTaskStats
 * @param {string} userId - User ID to get stats for
 * @returns {Promise<Object>} Task statistics object
 */
Task.getTaskStats = async function(userId) {
  try {
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
      pending: 0,
      in_progress: 0,
      completed: 0,
      total: 0
    };

    stats.forEach(stat => {
      result[stat.status] = parseInt(stat.count);
      result.total += parseInt(stat.count);
    });

    return result;
  } catch (error) {
    throw new Error(`Failed to get task statistics: ${error.message}`);
  }
};

// Export the Task model as default
module.exports = Task;