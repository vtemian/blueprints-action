/**
 * Task Model - JavaScript implementation based on SQLAlchemy blueprint
 * Production-ready Task management with comprehensive validation and business logic
 */

import { v4 as uuidv4, validate as validateUUID } from 'uuid';

// ==================== ENUMS ====================

/**
 * Task Status Enumeration
 * @readonly
 * @enum {string}
 */
const TaskStatus = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
});

/**
 * Task Priority Enumeration
 * @readonly
 * @enum {string}
 */
const TaskPriority = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
});

// ==================== CUSTOM ERRORS ====================

/**
 * Base Task Error Class
 */
class TaskError extends Error {
  constructor(message, code = 'TASK_ERROR') {
    super(message);
    this.name = 'TaskError';
    this.code = code;
  }
}

/**
 * Task Validation Error
 */
class TaskValidationError extends TaskError {
  constructor(field, message) {
    super(`Validation error for field '${field}': ${message}`);
    this.name = 'TaskValidationError';
    this.code = 'VALIDATION_ERROR';
    this.field = field;
  }
}

/**
 * Task Business Logic Error
 */
class TaskBusinessError extends TaskError {
  constructor(message) {
    super(message);
    this.name = 'TaskBusinessError';
    this.code = 'BUSINESS_ERROR';
  }
}

// ==================== MAIN TASK CLASS ====================

/**
 * Task Model Class
 * Represents a task with comprehensive validation and business logic
 * 
 * Database Table: tasks
 * Indexes: user_id, status, due_date
 */
class Task {
  // Private fields
  #id;
  #title;
  #description;
  #status;
  #priority;
  #userId;
  #dueDate;
  #completedAt;
  #createdAt;
  #updatedAt;

  /**
   * Create a new Task instance
   * @param {Object} data - Task data
   * @param {string} [data.id] - UUID (auto-generated if not provided)
   * @param {string} data.title - Task title (required, max 200 chars)
   * @param {string} [data.description] - Task description (optional)
   * @param {string} [data.status='pending'] - Task status
   * @param {string} [data.priority='medium'] - Task priority
   * @param {string} data.userId - User ID (foreign key, required)
   * @param {Date|string} [data.dueDate] - Due date (optional)
   * @param {Date|string} [data.completedAt] - Completion timestamp
   * @param {Date|string} [data.createdAt] - Creation timestamp (auto-set)
   * @param {Date|string} [data.updatedAt] - Update timestamp (auto-set)
   */
  constructor(data = {}) {
    const now = new Date();
    
    // Set timestamps first
    this.#createdAt = data.createdAt ? this._parseDate(data.createdAt) : now;
    this.#updatedAt = data.updatedAt ? this._parseDate(data.updatedAt) : now;
    
    // Initialize with validation
    this.id = data.id || uuidv4();
    this.title = data.title;
    this.description = data.description || null;
    this.status = data.status || TaskStatus.PENDING;
    this.priority = data.priority || TaskPriority.MEDIUM;
    this.userId = data.userId;
    this.dueDate = data.dueDate || null;
    this.completedAt = data.completedAt || null;
  }

  // ==================== GETTERS ====================

  /**
   * Get task ID
   * @returns {string} UUID
   */
  get id() {
    return this.#id;
  }

  /**
   * Get task title
   * @returns {string} Task title
   */
  get title() {
    return this.#title;
  }

  /**
   * Get task description
   * @returns {string|null} Task description
   */
  get description() {
    return this.#description;
  }

  /**
   * Get task status
   * @returns {string} Task status
   */
  get status() {
    return this.#status;
  }

  /**
   * Get task priority
   * @returns {string} Task priority
   */
  get priority() {
    return this.#priority;
  }

  /**
   * Get user ID
   * @returns {string} User ID
   */
  get userId() {
    return this.#userId;
  }

  /**
   * Get due date
   * @returns {Date|null} Due date
   */
  get dueDate() {
    return this.#dueDate;
  }

  /**
   * Get completion timestamp
   * @returns {Date|null} Completion timestamp
   */
  get completedAt() {
    return this.#completedAt;
  }

  /**
   * Get creation timestamp
   * @returns {Date} Creation timestamp
   */
  get createdAt() {
    return this.#createdAt;
  }

  /**
   * Get update timestamp
   * @returns {Date} Update timestamp
   */
  get updatedAt() {
    return this.#updatedAt;
  }

  // ==================== SETTERS ====================

  /**
   * Set task ID
   * @param {string} value - UUID string
   */
  set id(value) {
    if (!value) {
      throw new TaskValidationError('id', 'ID is required');
    }
    if (typeof value !== 'string') {
      throw new TaskValidationError('id', 'ID must be a string');
    }
    if (!validateUUID(value)) {
      throw new TaskValidationError('id', 'ID must be a valid UUID');
    }
    this.#id = value;
  }

  /**
   * Set task title
   * @param {string} value - Task title
   */
  set title(value) {
    if (!value) {
      throw new TaskValidationError('title', 'Title is required');
    }
    if (typeof value !== 'string') {
      throw new TaskValidationError('title', 'Title must be a string');
    }
    if (value.trim().length === 0) {
      throw new TaskValidationError('title', 'Title cannot be empty');
    }
    if (value.length > 200) {
      throw new TaskValidationError('title', 'Title cannot exceed 200 characters');
    }
    this.#title = value.trim();
    this._updateTimestamp();
  }

  /**
   * Set task description
   * @param {string|null} value - Task description
   */
  set description(value) {
    if (value !== null && typeof value !== 'string') {
      throw new TaskValidationError('description', 'Description must be a string or null');
    }
    this.#description = value ? value.trim() : null;
    this._updateTimestamp();
  }

  /**
   * Set task status
   * @param {string} value - Task status
   */
  set status(value) {
    if (!value) {
      throw new TaskValidationError('status', 'Status is required');
    }
    if (!Object.values(TaskStatus).includes(value)) {
      throw new TaskValidationError('status', 
        `Status must be one of: ${Object.values(TaskStatus).join(', ')}`);
    }
    
    const oldStatus = this.#status;
    this.#status = value;
    
    // Auto-set completedAt when status changes to completed
    if (value === TaskStatus.COMPLETED && oldStatus !== TaskStatus.COMPLETED) {
      this.#completedAt = new Date();
    }
    // Clear completedAt when status changes from completed
    else if (value !== TaskStatus.COMPLETED && oldStatus === TaskStatus.COMPLETED) {
      this.#completedAt = null;
    }
    
    this._updateTimestamp();
  }

  /**
   * Set task priority
   * @param {string} value - Task priority
   */
  set priority(value) {
    if (!value) {
      throw new TaskValidationError('priority', 'Priority is required');
    }
    if (!Object.values(TaskPriority).includes(value)) {
      throw new TaskValidationError('priority', 
        `Priority must be one of: ${Object.values(TaskPriority).join(', ')}`);
    }
    this.#priority = value;
    this._updateTimestamp();
  }

  /**
   * Set user ID
   * @param {string} value - User ID
   */
  set userId(value) {
    if (!value) {
      throw new TaskValidationError('userId', 'User ID is required');
    }
    if (typeof value !== 'string') {
      throw new TaskValidationError('userId', 'User ID must be a string');
    }
    // Validate UUID format for user ID
    if (!validateUUID(value)) {
      throw new TaskValidationError('userId', 'User ID must be a valid UUID');
    }
    this.#userId = value;
    this._updateTimestamp();
  }

  /**
   * Set due date
   * @param {Date|string|null} value - Due date
   */
  set dueDate(value) {
    if (value === null || value === undefined) {
      this.#dueDate = null;
    } else {
      const date = this._parseDate(value);
      this.#dueDate = date;
    }
    this._updateTimestamp();
  }

  /**
   * Set completion timestamp
   * @param {Date|string|null} value - Completion timestamp
   */
  set completedAt(value) {
    if (value === null || value === undefined) {
      this.#completedAt = null;
    } else {
      const date = this._parseDate(value);
      this.#completedAt = date;
    }
    this._updateTimestamp();
  }

  // ==================== BUSINESS METHODS ====================

  /**
   * Mark task as complete
   * Updates status to 'completed' and sets completion timestamp
   * @throws {TaskBusinessError} If task is already completed
   */
  markComplete() {
    if (this.#status === TaskStatus.COMPLETED) {
      throw new TaskBusinessError('Task is already completed');
    }
    
    this.#status = TaskStatus.COMPLETED;
    this.#completedAt = new Date();
    this._updateTimestamp();
  }

  /**
   * Check if task is overdue
   * @returns {boolean} True if task is overdue, false otherwise
   */
  isOverdue() {
    // No due date means not overdue
    if (!this.#dueDate) {
      return false;
    }
    
    // Completed tasks are not considered overdue
    if (this.#status === TaskStatus.COMPLETED) {
      return false;
    }
    
    const now = new Date();
    return this.#dueDate < now;
  }

  /**
   * Get days until due date
   * @returns {number|null} Days until due (negative if overdue), null if no due date
   */
  getDaysUntilDue() {
    if (!this.#dueDate) {
      return null;
    }
    
    const now = new Date();
    const diffTime = this.#dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  /**
   * Check if task is completed
   * @returns {boolean} True if task is completed
   */
  isCompleted() {
    return this.#status === TaskStatus.COMPLETED;
  }

  /**
   * Reset task to pending status
   * Clears completion timestamp and sets status to pending
   */
  resetToPending() {
    this.#status = TaskStatus.PENDING;
    this.#completedAt = null;
    this._updateTimestamp();
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Parse date from various formats
   * @private
   * @param {Date|string|number} value - Date value
   * @returns {Date} Parsed date
   * @throws {TaskValidationError} If date is invalid
   */
  _parseDate(value) {
    let date;
    
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
      date = new Date(value);
    } else {
      throw new TaskValidationError('date', 'Date must be a Date object, string, or number');
    }
    
    if (isNaN(date.getTime())) {
      throw new TaskValidationError('date', 'Invalid date value');
    }
    
    return date;
  }

  /**
   * Update the updatedAt timestamp
   * @private
   */
  _updateTimestamp() {
    this.#updatedAt = new Date();
  }

  /**
   * Convert task to plain object
   * @returns {Object} Plain object representation
   */
  toJSON() {
    return {
      id: this.#id,
      title: this.#title,
      description: this.#description,
      status: this.#status,
      priority: this.#priority,
      userId: this.#userId,
      dueDate: this.#dueDate ? this.#dueDate.toISOString() : null,
      completedAt: this.#completedAt ? this.#completedAt.toISOString() : null,
      createdAt: this.#createdAt.toISOString(),
      updatedAt: this.#updatedAt.toISOString()
    };
  }

  /**
   * String representation of task
   * @returns {string} String representation
   */
  toString() {
    return `Task(${this.#id}): "${this.#title}" [${this.#status}]`;
  }

  /**
   * Create a copy of the task
   * @returns {Task} New task instance with same data
   */
  clone() {
    return new Task(this.toJSON());
  }

  // ==================== STATIC FACTORY METHODS ====================

  /**
   * Create a new task with minimal required data
   * @static
   * @param {string} title - Task title
   * @param {string} userId - User ID
   * @param {Object} [options={}] - Additional options
   * @returns {Task} New task instance
   */
  static create(title, userId, options = {}) {
    return new Task({
      title,
      userId,
      ...options
    });
  }

  /**
   * Create task from database row
   * @static
   * @param {Object} row - Database row object
   * @returns {Task} New task instance
   */
  static fromDatabase(row) {
    return new Task({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      userId: row.user_id, // Convert snake_case to camelCase
      dueDate: row.due_date,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  /**
   *