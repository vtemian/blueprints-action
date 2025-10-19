const { DataTypes, Model } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../config/database');

/**
 * Task model representing user tasks with status tracking and due dates
 */
class Task extends Model {
  /**
   * Mark task as completed and set completion timestamp
   * @returns {Promise<Task>} Updated task instance
   * @throws {Error} If task is already completed or validation fails
   */
  async markComplete() {
    try {
      if (this.status === 'completed') {
        throw new Error('Task is already completed');
      }

      this.status = 'completed';
      this.completed_at = new Date();
      
      await this.save();
      return this;
    } catch (error) {
      throw new Error(`Failed to mark task as complete: ${error.message}`);
    }
  }

  /**
   * Check if task is overdue based on due_date
   * @returns {boolean} True if task is overdue, false otherwise
   */
  isOverdue() {
    try {
      // Handle null due_date gracefully
      if (!this.due_date) {
        return false;
      }

      // Handle timezone considerations by comparing UTC times
      const now = new Date();
      const dueDate = new Date(this.due_date);
      
      return dueDate < now && this.status !== 'completed';
    } catch (error) {
      console.error('Error checking overdue status:', error);
      return false;
    }
  }

  /**
   * Get formatted status with overdue indication
   * @returns {string} Status with overdue flag if applicable
   */
  getStatusDisplay() {
    const baseStatus = this.status;
    return this.isOverdue() ? `${baseStatus} (overdue)` : baseStatus;
  }
}

// Initialize the model with Sequelize
Task.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: () => uuidv4(),
    primaryKey: true,
    allowNull: false
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
    set(value) {
      // Input sanitization - trim whitespace
      this.setDataValue('title', value ? value.trim() : value);
    }
  },

  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    set(value) {
      // Input sanitization for description
      this.setDataValue('description', value ? value.trim() : null);
    }
  },

  status: {
    type: DataTypes.ENUM('pending', 'in_progress', 'completed'),
    allowNull: false,
    defaultValue: 'pending',
    validate: {
      isIn: {
        args: [['pending', 'in_progress', 'completed']],
        msg: 'Status must be one of: pending, in_progress, completed'
      }
    }
  },

  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    allowNull: false,
    defaultValue: 'medium',
    validate: {
      isIn: {
        args: [['low', 'medium', 'high']],
        msg: 'Priority must be one of: low, medium, high'
      }
    }
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
    validate: {
      notNull: {
        msg: 'Task must be assigned to a user'
      },
      isUUID: {
        args: 4,
        msg: 'User ID must be a valid UUID'
      }
    }
  },

  due_date: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: {
        msg: 'Due date must be a valid date'
      },
      isFuture(value) {
        if (value && new Date(value) < new Date()) {
          throw new Error('Due date cannot be in the past');
        }
      }
    }
  },

  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: {
        msg: 'Completed date must be a valid date'
      }
    }
  },

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
  modelName: 'Task',
  tableName: 'tasks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  // Define indexes for performance
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

  // Model-level validations
  validate: {
    completedStatusCheck() {
      if (this.status === 'completed' && !this.completed_at) {
        throw new Error('Completed tasks must have a completion date');
      }
      if (this.status !== 'completed' && this.completed_at) {
        throw new Error('Only completed tasks can have a completion date');
      }
    }
  },

  // Hooks for additional business logic
  hooks: {
    beforeUpdate: async (task, options) => {
      // Auto-set completed_at when status changes to completed
      if (task.changed('status') && task.status === 'completed' && !task.completed_at) {
        task.completed_at = new Date();
      }
      
      // Clear completed_at if status changes from completed
      if (task.changed('status') && task.status !== 'completed' && task.completed_at) {
        task.completed_at = null;
      }
    },

    beforeSave: async (task, options) => {
      // Ensure title is properly sanitized
      if (task.title) {
        task.title = task.title.trim();
      }
    }
  }
});

/**
 * Define associations
 * @param {Object} models - All models for association setup
 */
Task.associate = (models) => {
  // Task belongs to User
  Task.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user',
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  });
};

/**
 * Static method to find overdue tasks
 * @param {Object} options - Query options
 * @returns {Promise<Array<Task>>} Array of overdue tasks
 */
Task.findOverdue = async function(options = {}) {
  try {
    const { Op } = require('sequelize');
    
    return await this.findAll({
      where: {
        due_date: {
          [Op.lt]: new Date()
        },
        status: {
          [Op.ne]: 'completed'
        },
        ...options.where
      },
      ...options
    });
  } catch (error) {
    throw new Error(`Failed to find overdue tasks: ${error.message}`);
  }
};

/**
 * Static method to find tasks by priority
 * @param {string} priority - Priority level
 * @param {Object} options - Query options
 * @returns {Promise<Array<Task>>} Array of tasks with specified priority
 */
Task.findByPriority = async function(priority, options = {}) {
  try {
    if (!['low', 'medium', 'high'].includes(priority)) {
      throw new Error('Invalid priority level');
    }

    return await this.findAll({
      where: {
        priority,
        ...options.where
      },
      ...options
    });
  } catch (error) {
    throw new Error(`Failed to find tasks by priority: ${error.message}`);
  }
};

module.exports = Task;