/**
 * Task Model - Production-ready Task management with database integration
 * @fileoverview Comprehensive Task model with validation, database operations, and business logic
 */

import { v4 as uuidv4, validate as validateUUID } from 'uuid';
import { Database, Model, DataTypes, Op } from '@core/database';
import { ValidationError, DatabaseError } from '@core/errors';

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
 * Represents a task with comprehensive validation and business logic
 */
class Task extends Model {
  /**
   * Creates a new Task instance
   * @param {Object} data - Task data object
   * @param {string} [data.id] - UUID primary key (auto-generated if not provided)
   * @param {string} data.title - Task title (required, max 200 chars)
   * @param {string} [data.description] - Task description (optional)
   * @param {string} [data.status='pending'] - Task status
   * @param {string} [data.priority='medium'] - Task priority
   * @param {string} data.user_id - User UUID foreign key (required)
   * @param {Date|string} [data.due_date] - Due date (optional)
   * @param {Date|string} [data.completed_at] - Completion timestamp
   * @param {Date|string} [data.created_at] - Creation timestamp (auto-set)
   * @param {Date|string} [data.updated_at] - Last update timestamp (auto-set)
   */
  constructor(data = {}) {
    super();
    
    const now = new Date();
    
    this._id = data.id || uuidv4();
    this._title = data.title || '';
    this._description = data.description || null;
    this._status = data.status || TaskStatus.PENDING;
    this._priority = data.priority || TaskPriority.MEDIUM;
    this._user_id = data.user_id || null;
    this._due_date = data.due_date ? this._parseDate(data.due_date) : null;
    this._completed_at = data.completed_at ? this._parseDate(data.completed_at) : null;
    this._created_at = data.created_at ? this._parseDate(data.created_at) : now;
    this._updated_at = data.updated_at ? this._parseDate(data.updated_at) : now;
    
    // Validate on construction
    this.validate();
  }

  /**
   * Parses date input into Date object
   * @private
   * @param {Date|string|number} dateInput - Date input to parse
   * @returns {Date} Parsed date object
   * @throws {ValidationError} If date is invalid
   */
  _parseDate(dateInput) {
    if (dateInput instanceof Date) {
      if (isNaN(dateInput.getTime())) {
        throw new ValidationError('Invalid date provided');
      }
      return dateInput;
    }
    
    const parsed = new Date(dateInput);
    if (isNaN(parsed.getTime())) {
      throw new ValidationError(`Invalid date format: ${dateInput}`);
    }
    
    return parsed;
  }

  // Getters and Setters with validation
  get id() { return this._id; }
  
  get title() { return this._title; }
  set title(value) {
    if (typeof value !== 'string') {
      throw new TypeError('Title must be a string');
    }
    this._title = value;
    this._updated_at = new Date();
  }

  get description() { return this._description; }
  set description(value) {
    if (value !== null && typeof value !== 'string') {
      throw new TypeError('Description must be a string or null');
    }
    this._description = value;
    this._updated_at = new Date();
  }

  get status() { return this._status; }
  set status(value) {
    if (!Object.values(TaskStatus).includes(value)) {
      throw new ValidationError(`Invalid status: ${value}. Must be one of: ${Object.values(TaskStatus).join(', ')}`);
    }
    this._status = value;
    this._updated_at = new Date();
  }

  get priority() { return this._priority; }
  set priority(value) {
    if (!Object.values(TaskPriority).includes(value)) {
      throw new ValidationError(`Invalid priority: ${value}. Must be one of: ${Object.values(TaskPriority).join(', ')}`);
    }
    this._priority = value;
    this._updated_at = new Date();
  }

  get user_id() { return this._user_id; }
  set user_id(value) {
    if (typeof value !== 'string' || !validateUUID(value)) {
      throw new ValidationError('User ID must be a valid UUID');
    }
    this._user_id = value;
    this._updated_at = new Date();
  }

  get due_date() { return this._due_date; }
  set due_date(value) {
    this._due_date = value ? this._parseDate(value) : null;
    this._updated_at = new Date();
  }

  get completed_at() { return this._completed_at; }
  set completed_at(value) {
    this._completed_at = value ? this._parseDate(value) : null;
    this._updated_at = new Date();
  }

  get created_at() { return this._created_at; }
  get updated_at() { return this._updated_at; }

  /**
   * Marks the task as completed
   * Sets status to 'completed', sets completed_at to current timestamp, updates updated_at
   * @returns {Task} Returns this instance for method chaining
   */
  mark_complete() {
    const now = new Date();
    this._status = TaskStatus.COMPLETED;
    this._completed_at = now;
    this._updated_at = now;
    return this;
  }

  /**
   * Checks if the task is overdue
   * @returns {boolean} True if due_date exists, is in the past, and status is not 'completed'
   */
  is_overdue() {
    if (!this._due_date || this._status === TaskStatus.COMPLETED) {
      return false;
    }
    return this._due_date < new Date();
  }

  /**
   * Validates all task fields
   * @throws {ValidationError} If any validation fails
   * @throws {TypeError} If any field has wrong type
   */
  validate() {
    // Validate ID
    if (!validateUUID(this._id)) {
      throw new ValidationError('ID must be a valid UUID');
    }

    // Validate title
    if (typeof this._title !== 'string') {
      throw new TypeError('Title must be a string');
    }
    
    const trimmedTitle = this._title.trim();
    if (trimmedTitle.length === 0) {
      throw new ValidationError('Title is required and cannot be empty');
    }
    
    if (trimmedTitle.length > 200) {
      throw new ValidationError('Title cannot exceed 200 characters');
    }

    // Validate description
    if (this._description !== null && typeof this._description !== 'string') {
      throw new TypeError('Description must be a string or null');
    }

    // Validate status
    if (!Object.values(TaskStatus).includes(this._status)) {
      throw new ValidationError(`Invalid status: ${this._status}. Must be one of: ${Object.values(TaskStatus).join(', ')}`);
    }

    // Validate priority
    if (!Object.values(TaskPriority).includes(this._priority)) {
      throw new ValidationError(`Invalid priority: ${this._priority}. Must be one of: ${Object.values(TaskPriority).join(', ')}`);
    }

    // Validate user_id
    if (!this._user_id) {
      throw new ValidationError('User ID is required');
    }
    
    if (typeof this._user_id !== 'string' || !validateUUID(this._user_id)) {
      throw new ValidationError('User ID must be a valid UUID');
    }

    // Validate dates
    if (this._due_date && !(this._due_date instanceof Date)) {
      throw new TypeError('Due date must be a Date object or null');
    }
    
    if (this._completed_at && !(this._completed_at instanceof Date)) {
      throw new TypeError('Completed at must be a Date object or null');
    }
    
    if (!(this._created_at instanceof Date)) {
      throw new TypeError('Created at must be a Date object');
    }
    
    if (!(this._updated_at instanceof Date)) {
      throw new TypeError('Updated at must be a Date object');
    }

    // Business logic validation
    if (this._status === TaskStatus.COMPLETED && !this._completed_at) {
      throw new ValidationError('Completed tasks must have a completion timestamp');
    }
    
    if (this._status !== TaskStatus.COMPLETED && this._completed_at) {
      throw new ValidationError('Only completed tasks can have a completion timestamp');
    }
  }

  /**
   * Returns a clean JSON representation of the task
   * @returns {Object} Clean object representation
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
      updated_at: this._updated_at.toISOString(),
      is_overdue: this.is_overdue()
    };
  }

  /**
   * Saves the task to the database
   * @returns {Promise<Task>} The saved task instance
   * @throws {DatabaseError} If database operation fails
   */
  async save() {
    try {
      this.validate();
      
      const existingTask = await TaskModel.findByPk(this._id);
      
      if (existingTask) {
        // Update existing task
        await TaskModel.update(this.toJSON(), {
          where: { id: this._id }
        });
      } else {
        // Create new task
        await TaskModel.create(this.toJSON());
      }
      
      return this;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError(`Failed to save task: ${error.message}`);
    }
  }

  /**
   * Deletes the task from the database
   * @returns {Promise<boolean>} True if task was deleted
   * @throws {DatabaseError} If database operation fails
   */
  async delete() {
    try {
      const result = await TaskModel.destroy({
        where: { id: this._id }
      });
      return result > 0;
    } catch (error) {
      throw new DatabaseError(`Failed to delete task: ${error.message}`);
    }
  }

  /**
   * Finds tasks by user ID
   * @static
   * @param {string} userId - User UUID to search for
   * @param {Object} [options={}] - Query options
   * @param {string} [options.status] - Filter by status
   * @param {string} [options.priority] - Filter by priority
   * @param {boolean} [options.overdue_only=false] - Only return overdue tasks
   * @param {string} [options.order_by='created_at'] - Order by field
   * @param {string} [options.order_direction='DESC'] - Order direction
   * @param {number} [options.limit] - Limit results
   * @param {number} [options.offset] - Offset for pagination
   * @returns {Promise<Task[]>} Array of Task instances
   * @throws {ValidationError} If userId is invalid
   * @throws {DatabaseError} If database operation fails
   */
  static async findByUserId(userId, options = {}) {
    if (!validateUUID(userId)) {
      throw new ValidationError('User ID must be a valid UUID');
    }

    try {
      const whereClause = { user_id: userId };
      
      if (options.status) {
        if (!Object.values(TaskStatus).includes(options.status)) {
          throw new ValidationError(`Invalid status filter: ${options.status}`);
        }
        whereClause.status = options.status;
      }
      
      if (options.priority) {
        if (!Object.values(TaskPriority).includes(options.priority)) {
          throw new ValidationError(`Invalid priority filter: ${options.priority}`);
        }
        whereClause.priority = options.priority;
      }
      
      if (options.overdue_only) {
        whereClause.due_date = { [Op.lt]: new Date() };
        whereClause.status = { [Op.ne]: TaskStatus.COMPLETED };
      }

      const queryOptions = {
        where: whereClause,
        order: [[options.order_by || 'created_at', options.order_direction || 'DESC']]
      };
      
      if (options.limit) {
        queryOptions.limit = options.limit;
      }
      
      if (options.offset) {
        queryOptions.offset = options.offset;
      }

      const tasks = await TaskModel.findAll(queryOptions);
      
      return tasks.map(taskData => new Task(taskData.toJSON()));
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError(`Failed to find tasks by user ID: ${error.message}`);
    }
  }

  /**
   * Finds a task by ID
   * @static
   * @param {string} taskId - Task UUID to find
   * @returns {Promise<Task|null>} Task instance or null if not found
   * @throws {ValidationError} If taskId is invalid
   * @throws {DatabaseError} If database operation fails
   */
  static async findById(taskId) {
    if (!validateUUID(taskId)) {
      throw new ValidationError('Task ID must be a valid UUID');
    }

    try {
      const taskData = await TaskModel.findByPk(taskId);
      return taskData ? new Task(taskData.toJSON()) : null;
    } catch (error) {
      throw new DatabaseError(`Failed to find task by ID: ${error.message}`);
    }
  }

  /**
   * Gets task statistics for a user
   * @static
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Statistics object
   * @throws {ValidationError} If userId is invalid
   * @throws {DatabaseError} If database operation fails
   */
  static async getStatsByUserId(userId) {
    if (!validateUUID(userId)) {
      throw new ValidationError('User ID must be a valid UUID');
    }

    try {
      const [total, pending, inProgress, completed, overdue] = await Promise.all([
        TaskModel.count({ where: { user_id: userId } }),
        TaskModel.count({ where: { user_id: userId, status: TaskStatus.PENDING