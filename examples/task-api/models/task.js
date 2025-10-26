/**
 * Task Model - Production-ready Task management class
 * Requires: uuid package for UUID generation
 * Install: npm install uuid
 */

const { v4: uuidv4, validate: validateUUID } = require('uuid');

// Enum constants
const TASK_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
});

const TASK_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
});

/**
 * Custom error class for Task validation failures
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
 * Represents a task with full validation, relationships, and business logic
 */
class Task {
  /**
   * Creates a new Task instance
   * @param {Object} data - Task data object
   * @param {string} [data.id] - UUID primary key (auto-generated if not provided)
   * @param {string} data.title - Task title (required, max 200 chars)
   * @param {string} [data.description] - Task description (optional)
   * @param {string} [data.status='pending'] - Task status (pending, in_progress, completed)
   * @param {string} [data.priority='medium'] - Task priority (low, medium, high)
   * @param {string} data.user_id - Foreign key to User (required UUID)
   * @param {Date|string} [data.due_date] - Due date (optional)
   * @param {Date|string} [data.completed_at] - Completion timestamp (nullable)
   * @param {Date|string} [data.created_at] - Creation timestamp (auto-generated)
   * @param {Date|string} [data.updated_at] - Update timestamp (auto-generated)
   * @throws {TaskValidationError} When validation fails
   */
  constructor(data = {}) {
    // Initialize private properties
    this._id = null;
    this._title = null;
    this._description = null;
    this._status = TASK_STATUS.PENDING;
    this._priority = TASK_PRIORITY.MEDIUM;
    this._user_id = null;
    this._due_date = null;
    this._completed_at = null;
    this._created_at = new Date();
    this._updated_at = new Date();

    // Validate and set properties
    this._validateAndSetProperties(data);
  }

  /**
   * Validates and sets all properties from data object
   * @private
   * @param {Object} data - Data object to validate and set
   */
  _validateAndSetProperties(data) {
    // Set ID (generate if not provided)
    this.id = data.id || uuidv4();
    
    // Set required fields
    this.title = data.title;
    this.user_id = data.user_id;
    
    // Set optional fields with defaults
    if (data.description !== undefined) this.description = data.description;
    if (data.status !== undefined) this.status = data.status;
    if (data.priority !== undefined) this.priority = data.priority;
    if (data.due_date !== undefined) this.due_date = data.due_date;
    if (data.completed_at !== undefined) this.completed_at = data.completed_at;
    if (data.created_at !== undefined) this.created_at = data.created_at;
    if (data.updated_at !== undefined) this.updated_at = data.updated_at;
  }

  /**
   * Sanitizes string input by trimming whitespace
   * @private
   * @param {string} str - String to sanitize
   * @returns {string} Sanitized string
   */
  _sanitizeString(str) {
    return typeof str === 'string' ? str.trim() : str;
  }

  /**
   * Validates and converts date input
   * @private
   * @param {Date|string|null} dateInput - Date to validate
   * @returns {Date|null} Validated Date object or null
   */
  _validateDate(dateInput) {
    if (dateInput === null || dateInput === undefined) return null;
    
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    
    if (isNaN(date.getTime())) {
      throw new TaskValidationError('Invalid date format', 'date');
    }
    
    return date;
  }

  /**
   * Updates the updated_at timestamp
   * @private
   */
  _touch() {
    this._updated_at = new Date();
  }

  // Getters and Setters with validation

  /**
   * Gets the task ID
   * @returns {string} Task UUID
   */
  get id() {
    return this._id;
  }

  /**
   * Sets the task ID
   * @param {string} value - UUID string
   */
  set id(value) {
    if (!value) {
      throw new TaskValidationError('ID is required', 'id');
    }
    if (!validateUUID(value)) {
      throw new TaskValidationError('ID must be a valid UUID', 'id');
    }
    this._id = value;
  }

  /**
   * Gets the task title
   * @returns {string} Task title
   */
  get title() {
    return this._title;
  }

  /**
   * Sets the task title
   * @param {string} value - Task title
   */
  set title(value) {
    const sanitized = this._sanitizeString(value);
    
    if (!sanitized) {
      throw new TaskValidationError('Title is required and cannot be empty', 'title');
    }
    if (sanitized.length > 200) {
      throw new TaskValidationError('Title cannot exceed 200 characters', 'title');
    }
    
    this._title = sanitized;
    this._touch();
  }

  /**
   * Gets the task description
   * @returns {string|null} Task description
   */
  get description() {
    return this._description;
  }

  /**
   * Sets the task description
   * @param {string|null} value - Task description
   */
  set description(value) {
    this._description = value ? this._sanitizeString(value) : null;
    this._touch();
  }

  /**
   * Gets the task status
   * @returns {string} Task status
   */
  get status() {
    return this._status;
  }

  /**
   * Sets the task status
   * @param {string} value - Task status
   */
  set status(value) {
    if (!Object.values(TASK_STATUS).includes(value)) {
      throw new TaskValidationError(
        `Status must be one of: ${Object.values(TASK_STATUS).join(', ')}`, 
        'status'
      );
    }
    this._status = value;
    this._touch();
  }

  /**
   * Gets the task priority
   * @returns {string} Task priority
   */
  get priority() {
    return this._priority;
  }

  /**
   * Sets the task priority
   * @param {string} value - Task priority
   */
  set priority(value) {
    if (!Object.values(TASK_PRIORITY).includes(value)) {
      throw new TaskValidationError(
        `Priority must be one of: ${Object.values(TASK_PRIORITY).join(', ')}`, 
        'priority'
      );
    }
    this._priority = value;
    this._touch();
  }

  /**
   * Gets the user ID
   * @returns {string} User UUID
   */
  get user_id() {
    return this._user_id;
  }

  /**
   * Sets the user ID
   * @param {string} value - User UUID
   */
  set user_id(value) {
    if (!value) {
      throw new TaskValidationError('User ID is required', 'user_id');
    }
    if (!validateUUID(value)) {
      throw new TaskValidationError('User ID must be a valid UUID', 'user_id');
    }
    this._user_id = value;
    this._touch();
  }

  /**
   * Gets the due date
   * @returns {Date|null} Due date
   */
  get due_date() {
    return this._due_date;
  }

  /**
   * Sets the due date
   * @param {Date|string|null} value - Due date
   */
  set due_date(value) {
    const date = this._validateDate(value);
    
    if (date && date <= new Date()) {
      throw new TaskValidationError('Due date must be in the future', 'due_date');
    }
    
    this._due_date = date;
    this._touch();
  }

  /**
   * Gets the completion timestamp
   * @returns {Date|null} Completion timestamp
   */
  get completed_at() {
    return this._completed_at;
  }

  /**
   * Sets the completion timestamp
   * @param {Date|string|null} value - Completion timestamp
   */
  set completed_at(value) {
    this._completed_at = this._validateDate(value);
    this._touch();
  }

  /**
   * Gets the creation timestamp
   * @returns {Date} Creation timestamp
   */
  get created_at() {
    return this._created_at;
  }

  /**
   * Sets the creation timestamp (protected - only for initialization)
   * @param {Date|string} value - Creation timestamp
   */
  set created_at(value) {
    this._created_at = this._validateDate(value) || new Date();
  }

  /**
   * Gets the update timestamp
   * @returns {Date} Update timestamp
   */
  get updated_at() {
    return this._updated_at;
  }

  /**
   * Sets the update timestamp (protected - only for initialization)
   * @param {Date|string} value - Update timestamp
   */
  set updated_at(value) {
    this._updated_at = this._validateDate(value) || new Date();
  }

  // Business Logic Methods

  /**
   * Marks the task as completed
   * Sets status to completed and sets completed_at timestamp
   * @returns {Task} Returns this instance for method chaining
   */
  mark_complete() {
    this._status = TASK_STATUS.COMPLETED;
    this._completed_at = new Date();
    this._touch();
    return this;
  }

  /**
   * Checks if the task is overdue
   * @returns {boolean} True if task is past due date and not completed
   */
  is_overdue() {
    if (!this._due_date || this._status === TASK_STATUS.COMPLETED) {
      return false;
    }
    return new Date() > this._due_date;
  }

  /**
   * Checks if the task is completed
   * @returns {boolean} True if task status is completed
   */
  is_completed() {
    return this._status === TASK_STATUS.COMPLETED;
  }

  /**
   * Gets the number of days until due date
   * @returns {number|null} Days until due (negative if overdue), null if no due date
   */
  days_until_due() {
    if (!this._due_date) return null;
    
    const now = new Date();
    const diffTime = this._due_date.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Serialization Methods

  /**
   * Converts task to JSON-serializable object
   * @returns {Object} Plain object representation of the task
   */
  toJSON() {
    return {
      id: this._id,
      title: this._title,
      description: this._description,
      status: this._status,
      priority: this._priority,
      user_id: this._user_id,
      due_date: this._due_date ? this._due_date.toISOString() : null,
      completed_at: this._completed_at ? this._completed_at.toISOString() : null,
      created_at: this._created_at.toISOString(),
      updated_at: this._updated_at.toISOString()
    };
  }

  /**
   * Creates a Task instance from JSON data
   * @static
   * @param {Object} json - JSON object containing task data
   * @returns {Task} New Task instance
   */
  static fromJSON(json) {
    return new Task(json);
  }

  /**
   * Creates a new Task with validation
   * @static
   * @param {Object} data - Task data
   * @returns {Task} New Task instance
   */
  static create(data) {
    return new Task(data);
  }

  /**
   * Validates task data without creating an instance
   * @static
   * @param {Object} data - Task data to validate
   * @returns {boolean} True if data is valid
   * @throws {TaskValidationError} If validation fails
   */
  static validate(data) {
    try {
      new Task(data);
      return true;
    } catch (error) {
      if (error instanceof TaskValidationError) {
        throw error;
      }
      throw new TaskValidationError('Unknown validation error');
    }
  }

  /**
   * Gets available status options
   * @static
   * @returns {Object} Status enum object
   */
  static get STATUS() {
    return TASK_STATUS;
  }

  /**
   * Gets available priority options
   * @static
   * @returns {Object} Priority enum object
   */
  static get PRIORITY() {
    return TASK_PRIORITY;
  }
}

// Module exports
module.exports = {
  Task,
  TaskValidationError,
  TASK_STATUS,
  TASK_PRIORITY
};

/* 
Example Usage:

// Basic task creation
const { Task, TASK_STATUS, TASK_PRIORITY } = require('./task-model');

try {
  // Create a new task
  const task = new Task({
    title: 'Complete project documentation',
    description: 'Write comprehensive docs for the new API',
    priority: TASK_PRIORITY.HIGH,
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    due_date: new Date('2024-12-31')
  });

  console.log('Task created:', task.toJSON());

  // Mark task as complete
  task.mark_complete();
  console.log('Task completed:', task.is_completed()); // true

  // Check if overdue
  console.log('Is overdue:', task.is_overdue()); // false (completed)

  // Create from JSON
  const taskFromJSON = Task.fromJSON({
    title: 'Another task',
    user_id: '123e4567-e89b-12d3-a456-426614174000'
  });

} catch (error) {
  if (error instanceof TaskValidationError) {
    console.error('Validation error:', error.message, 'Field:', error.field);
  } else {
    console.error('Unexpected error:', error.message);
  }
}

// Validation example
try {
  Task.validate({
    title: '', // This will fail - empty title
    user_id: 'invalid-uuid' // This will fail - invalid UUID
  });
} catch (error) {
  console.error('Validation failed:', error.message);
}
*/