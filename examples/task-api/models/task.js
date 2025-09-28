// models/task.js
import { DataTypes, Model } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database.js';
import User from './user.js';

/**
 * Task Model
 * Represents a task with status tracking, priority levels, and user assignment
 */
class Task extends Model {
  /**
   * Mark task as completed
   * Sets status to 'completed' and records completion timestamp
   * @returns {Promise<Task>} Updated task instance
   * @throws {Error} If task is already completed
   */
  async markComplete() {
    try {
      if (this.status === 'completed') {
        throw new Error('Task is already completed');
      }

      // Use transaction to ensure atomicity
      const transaction = await sequelize.transaction();
      
      try {
        this.status = 'completed';
        this.completed_at = new Date();
        
        await this.save({ transaction });
        await transaction.commit();
        
        return this;
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to mark task as complete: ${error.message}`);
    }
  }

  /**
   * Check if task is overdue
   * Compares due_date with current date/time
   * @returns {boolean} True if task is overdue, false otherwise
   */
  isOverdue() {
    try {
      // Handle null due_date gracefully
      if (!this.due_date) {
        return false;
      }

      const now = new Date();
      const dueDate = new Date(this.due_date);
      
      // Only consider incomplete tasks as potentially overdue
      return this.status !== 'completed' && dueDate < now;
    } catch (error) {
      // Handle invalid date formats gracefully
      console.error('Error checking overdue status:', error.message);
      return false;
    }
  }
}

// Initialize Task model with Sequelize
Task.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
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
  description: {
    type: DataTypes.TEXT,
    allowNull: true
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
      model: User,
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
    }
  },
  due_date: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: {
        msg: 'Due date must be a valid date'
      },
      isAfterToday(value) {
        if (value && new Date(value) < new Date()) {
          // Allow past dates for existing tasks, but warn for new ones
          if (this.isNewRecord) {
            throw new Error('Due date should not be in the past');
          }
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
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'Task',
  tableName: 'tasks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  // Database indexes for performance optimization
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
      fields: ['status', 'due_date'],
      name: 'idx_tasks_status_due_date'
    }
  ],

  // Model-level validations
  validate: {
    // Ensure completed tasks have completed_at timestamp
    completedTasksHaveTimestamp() {
      if (this.status === 'completed' && !this.completed_at) {
        throw new Error('Completed tasks must have a completion timestamp');
      }
    },
    
    // Ensure non-completed tasks don't have completed_at timestamp
    incompleteTasksNoTimestamp() {
      if (this.status !== 'completed' && this.completed_at) {
        throw new Error('Only completed tasks can have a completion timestamp');
      }
    }
  },

  // Hooks for automatic data management
  hooks: {
    beforeUpdate: async (task, options) => {
      // Automatically set completed_at when status changes to completed
      if (task.changed('status') && task.status === 'completed' && !task.completed_at) {
        task.completed_at = new Date();
      }
      
      // Clear completed_at when status changes from completed
      if (task.changed('status') && task.status !== 'completed' && task.completed_at) {
        task.completed_at = null;
      }
    },

    beforeCreate: async (task, options) => {
      // Ensure new tasks don't have completed_at unless they're completed
      if (task.status !== 'completed') {
        task.completed_at = null;
      }
    }
  }
});

// Define associations
Task.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});

// Add association to User model (assuming it exists)
User.hasMany(Task, {
  foreignKey: 'user_id',
  as: 'tasks'
});

export default Task;