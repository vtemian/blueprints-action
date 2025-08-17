/**
 * Task Model - Production-ready implementation
 * Handles task management with full validation and database operations
 */

const { v4: uuidv4, validate: validateUUID } = require('uuid');
const db = require('./database'); // Assuming database connection module

/**
 * Custom error classes for validation failures
 */
class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

class DatabaseError extends Error {
    constructor(message, operation = null) {
        super(message);
        this.name = 'DatabaseError';
        this.operation = operation;
    }
}

/**
 * Task Model Class
 * Represents a task with full validation and database operations
 * 
 * Database Indexes Recommended:
 * - CREATE INDEX idx_tasks_user_id ON tasks(user_id);
 * - CREATE INDEX idx_tasks_status ON tasks(status);
 * - CREATE INDEX idx_tasks_due_date ON tasks(due_date);
 * - CREATE INDEX idx_tasks_created_at ON tasks(created_at);
 */
class Task {
    // Enum definitions
    static STATUS_ENUM = ['pending', 'in_progress', 'completed'];
    static PRIORITY_ENUM = ['low', 'medium', 'high'];
    static TABLE_NAME = 'tasks';

    /**
     * Task constructor
     * @param {Object} data - Task data object
     * @param {string} [data.id] - UUID, auto-generated if not provided
     * @param {string} data.title - Task title (required, 1-200 chars)
     * @param {string} [data.description] - Task description (optional)
     * @param {string} [data.status='pending'] - Task status
     * @param {string} [data.priority='medium'] - Task priority
     * @param {string} data.user_id - User UUID (required)
     * @param {Date} [data.due_date] - Due date (optional)
     * @param {Date} [data.completed_at] - Completion timestamp
     * @param {Date} [data.created_at] - Creation timestamp
     * @param {Date} [data.updated_at] - Update timestamp
     */
    constructor(data = {}) {
        const now = new Date();
        
        // Set defaults and validate
        this.id = data.id || uuidv4();
        this.title = this._sanitizeString(data.title);
        this.description = data.description ? this._sanitizeString(data.description) : null;
        this.status = data.status || 'pending';
        this.priority = data.priority || 'medium';
        this.user_id = data.user_id;
        this.due_date = data.due_date || null;
        this.completed_at = data.completed_at || null;
        this.created_at = data.created_at || now;
        this.updated_at = data.updated_at || now;

        // Validate all fields
        this._validateFields();
    }

    /**
     * Sanitize string input to prevent XSS and trim whitespace
     * @param {string} str - Input string
     * @returns {string} - Sanitized string
     * @private
     */
    _sanitizeString(str) {
        if (typeof str !== 'string') return str;
        return str.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }

    /**
     * Validate all model fields
     * @private
     */
    _validateFields() {
        this._validateId();
        this._validateTitle();
        this._validateStatus();
        this._validatePriority();
        this._validateUserId();
        this._validateDates();
    }

    /**
     * Validate ID field
     * @private
     */
    _validateId() {
        if (!validateUUID(this.id)) {
            throw new ValidationError('Invalid UUID format for id', 'id');
        }
    }

    /**
     * Validate title field
     * @private
     */
    _validateTitle() {
        if (!this.title || typeof this.title !== 'string') {
            throw new ValidationError('Title is required and must be a string', 'title');
        }
        if (this.title.length < 1 || this.title.length > 200) {
            throw new ValidationError('Title must be between 1 and 200 characters', 'title');
        }
    }

    /**
     * Validate status field
     * @private
     */
    _validateStatus() {
        if (!Task.STATUS_ENUM.includes(this.status)) {
            throw new ValidationError(
                `Status must be one of: ${Task.STATUS_ENUM.join(', ')}`, 
                'status'
            );
        }
    }

    /**
     * Validate priority field
     * @private
     */
    _validatePriority() {
        if (!Task.PRIORITY_ENUM.includes(this.priority)) {
            throw new ValidationError(
                `Priority must be one of: ${Task.PRIORITY_ENUM.join(', ')}`, 
                'priority'
            );
        }
    }

    /**
     * Validate user_id field
     * @private
     */
    _validateUserId() {
        if (!this.user_id) {
            throw new ValidationError('user_id is required', 'user_id');
        }
        if (!validateUUID(this.user_id)) {
            throw new ValidationError('Invalid UUID format for user_id', 'user_id');
        }
    }

    /**
     * Validate date fields
     * @private
     */
    _validateDates() {
        const dateFields = ['due_date', 'completed_at', 'created_at', 'updated_at'];
        
        dateFields.forEach(field => {
            if (this[field] !== null && this[field] !== undefined) {
                if (!(this[field] instanceof Date) || isNaN(this[field].getTime())) {
                    throw new ValidationError(`${field} must be a valid Date object`, field);
                }
            }
        });
    }

    /**
     * Mark task as completed
     * Sets status to 'completed' and sets completed_at timestamp
     */
    markComplete() {
        this.status = 'completed';
        this.completed_at = new Date();
        this.updated_at = new Date();
    }

    /**
     * Check if task is overdue
     * @returns {boolean} - True if current date > due_date
     */
    isOverdue() {
        if (!this.due_date || this.status === 'completed') {
            return false;
        }
        return new Date() > this.due_date;
    }

    /**
     * Update task fields with validation
     * @param {Object} updates - Fields to update
     */
    update(updates = {}) {
        const allowedFields = [
            'title', 'description', 'status', 'priority', 'due_date'
        ];

        // Apply updates
        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                if (key === 'title' || key === 'description') {
                    this[key] = updates[key] ? this._sanitizeString(updates[key]) : updates[key];
                } else {
                    this[key] = updates[key];
                }
            }
        });

        this.updated_at = new Date();
        this._validateFields();
    }

    /**
     * Convert task to plain object for JSON serialization
     * @returns {Object} - Plain object representation
     */
    toJSON() {
        return {
            id: this.id,
            title: this.title,
            description: this.description,
            status: this.status,
            priority: this.priority,
            user_id: this.user_id,
            due_date: this.due_date,
            completed_at: this.completed_at,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    // Static Factory Methods

    /**
     * Create a new task instance
     * @param {Object} data - Task data
     * @returns {Task} - New task instance
     */
    static create(data) {
        return new Task(data);
    }

    /**
     * Create task from database row
     * @param {Object} row - Database row object
     * @returns {Task} - Task instance
     */
    static fromDatabaseRow(row) {
        return new Task({
            id: row.id,
            title: row.title,
            description: row.description,
            status: row.status,
            priority: row.priority,
            user_id: row.user_id,
            due_date: row.due_date ? new Date(row.due_date) : null,
            completed_at: row.completed_at ? new Date(row.completed_at) : null,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        });
    }

    // Database Operations

    /**
     * Save task to database (insert or update)
     * @returns {Promise<Task>} - Saved task instance
     */
    async save() {
        try {
            const exists = await Task.findById(this.id);
            
            if (exists) {
                return await this._update();
            } else {
                return await this._insert();
            }
        } catch (error) {
            throw new DatabaseError(`Failed to save task: ${error.message}`, 'save');
        }
    }

    /**
     * Insert new task into database
     * @returns {Promise<Task>} - Inserted task instance
     * @private
     */
    async _insert() {
        const query = `
            INSERT INTO ${Task.TABLE_NAME} (
                id, title, description, status, priority, user_id, 
                due_date, completed_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            this.id,
            this.title,
            this.description,
            this.status,
            this.priority,
            this.user_id,
            this.due_date,
            this.completed_at,
            this.created_at,
            this.updated_at
        ];

        await db.execute(query, params);
        return this;
    }

    /**
     * Update existing task in database
     * @returns {Promise<Task>} - Updated task instance
     * @private
     */
    async _update() {
        this.updated_at = new Date();
        
        const query = `
            UPDATE ${Task.TABLE_NAME} 
            SET title = ?, description = ?, status = ?, priority = ?, 
                due_date = ?, completed_at = ?, updated_at = ?
            WHERE id = ?
        `;

        const params = [
            this.title,
            this.description,
            this.status,
            this.priority,
            this.due_date,
            this.completed_at,
            this.updated_at,
            this.id
        ];

        const result = await db.execute(query, params);
        
        if (result.affectedRows === 0) {
            throw new DatabaseError('Task not found for update', 'update');
        }

        return this;
    }

    /**
     * Find task by ID
     * @param {string} id - Task UUID
     * @returns {Promise<Task|null>} - Task instance or null
     */
    static async findById(id) {
        try {
            if (!validateUUID(id)) {
                throw new ValidationError('Invalid UUID format', 'id');
            }

            const query = `SELECT * FROM ${Task.TABLE_NAME} WHERE id = ?`;
            const [rows] = await db.execute(query, [id]);

            return rows.length > 0 ? Task.fromDatabaseRow(rows[0]) : null;
        } catch (error) {
            throw new DatabaseError(`Failed to find task by ID: ${error.message}`, 'findById');
        }
    }

    /**
     * Find tasks by user ID
     * @param {string} userId - User UUID
     * @param {Object} options - Query options
     * @param {number} [options.limit=50] - Limit results
     * @param {number} [options.offset=0] - Offset for pagination
     * @param {string} [options.status] - Filter by status
     * @param {string} [options.priority] - Filter by priority
     * @returns {Promise<Task[]>} - Array of task instances
     */
    static async findByUserId(userId, options = {}) {
        try {
            if (!validateUUID(userId)) {
                throw new ValidationError('Invalid UUID format for userId', 'userId');
            }

            const { limit = 50, offset = 0, status, priority } = options;
            
            let query = `SELECT * FROM ${Task.TABLE_NAME} WHERE user_id = ?`;
            const params = [userId];

            if (status && Task.STATUS_ENUM.includes(status)) {
                query += ' AND status = ?';
                params.push(status);
            }

            if (priority && Task.PRIORITY_ENUM.includes(priority)) {
                query += ' AND priority = ?';
                params.push(priority);
            }

            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const [rows] = await db.execute(query, params);
            return rows.map(row => Task.fromDatabaseRow(row));
        } catch (error) {
            throw new DatabaseError(`Failed to find tasks by user ID: ${error.message}`, 'findByUserId');
        }
    }

    /**
     * Find overdue tasks
     * @param {string} [userId] - Optional user ID filter
     * @returns {Promise<Task[]>} - Array of overdue task instances
     */
    static async findOverdue(userId = null) {
        try {
            let query = `
                SELECT * FROM ${Task.TABLE_NAME} 
                WHERE due_date < ? AND status != 'completed'
            `;
            const params = [new Date()];

            if (userId) {
                if (!validateUUID(userId)) {
                    throw new ValidationError('Invalid UUID format for userId', 'userId');
                }
                query += ' AND user_id = ?';
                params.push(userId);
            }

            query += ' ORDER BY due_date ASC';

            const [rows] = await db.execute(query, params);
            return rows.map(row => Task.fromDatabaseRow(row));
        } catch (error) {
            throw new DatabaseError(`Failed to find overdue tasks: ${error.message}`, 'findOverdue');
        }
    }

    /**
     * Delete task by ID
     * @param {string} id - Task UUID
     * @returns {Promise<boolean>} - True if deleted, false if not found
     */
    static async deleteById(id) {
        try {
            if (!validateUUID(id)) {
                throw new ValidationError('Invalid UUID format', 'id');
            }

            const query = `DELETE FROM ${Task.TABLE_NAME} WHERE id = ?`;
            const result = await db.execute(query, [id]);

            return result.affectedRows > 0;
        } catch (error) {
            throw new DatabaseError(`Failed to delete task: ${error.message}`, 'deleteById');
        }
    }

    /**
     * Get task statistics for a user
     * @param {string} userId - User UUID
     * @returns {Promise<Object>} - Statistics object
     */
    static async getStatsByUs