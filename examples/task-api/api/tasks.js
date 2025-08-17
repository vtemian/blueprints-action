/**
 * Task Management API Module
 * Provides CRUD operations and task management functionality
 * 
 * @module api/tasks
 * @requires express
 * @requires ../models/task
 * @requires ../core/auth
 * @requires ../core/database
 */

const express = require('express');
const { Task } = require('../models/task');
const { authenticateToken, requireAuth } = require('../core/auth');
const { getConnection, isValidObjectId } = require('../core/database');

// Configuration constants
const CONFIG = {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    VALID_STATUSES: ['pending', 'in_progress', 'completed', 'cancelled'],
    VALID_PRIORITIES: ['low', 'medium', 'high', 'urgent'],
    DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/
};

const router = express.Router();

/**
 * Middleware to validate task ownership
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateTaskOwnership = async (req, res, next) => {
    try {
        const { task_id } = req.params;
        const userId = req.user.id;

        if (!isValidObjectId(task_id)) {
            return res.status(400).json({
                error: 'Invalid task ID format',
                code: 'INVALID_TASK_ID'
            });
        }

        const task = await Task.findById(task_id);
        
        if (!task || task.deleted_at) {
            return res.status(404).json({
                error: 'Task not found',
                code: 'TASK_NOT_FOUND'
            });
        }

        if (task.user_id.toString() !== userId.toString()) {
            return res.status(403).json({
                error: 'Access denied. You can only access your own tasks.',
                code: 'ACCESS_DENIED'
            });
        }

        req.task = task;
        next();
    } catch (error) {
        console.error('Error validating task ownership:', error);
        res.status(500).json({
            error: 'Internal server error during ownership validation',
            code: 'OWNERSHIP_VALIDATION_ERROR'
        });
    }
};

/**
 * Helper function to build query filters
 * @param {Object} queryParams - Query parameters from request
 * @param {string} userId - Authenticated user ID
 * @returns {Object} MongoDB query object
 */
const buildTaskQuery = (queryParams, userId) => {
    const query = {
        user_id: userId,
        deleted_at: null
    };

    // Status filter
    if (queryParams.status && CONFIG.VALID_STATUSES.includes(queryParams.status)) {
        query.status = queryParams.status;
    }

    // Priority filter
    if (queryParams.priority && CONFIG.VALID_PRIORITIES.includes(queryParams.priority)) {
        query.priority = queryParams.priority;
    }

    // Date range filters
    const dateFilters = {};
    
    if (queryParams.due_before) {
        const dueBeforeDate = new Date(queryParams.due_before);
        if (!isNaN(dueBeforeDate.getTime())) {
            dateFilters.$lte = dueBeforeDate;
        }
    }

    if (queryParams.due_after) {
        const dueAfterDate = new Date(queryParams.due_after);
        if (!isNaN(dueAfterDate.getTime())) {
            dateFilters.$gte = dueAfterDate;
        }
    }

    if (Object.keys(dateFilters).length > 0) {
        query.due_date = dateFilters;
    }

    return query;
};

/**
 * Helper function to validate and sanitize task data
 * @param {Object} taskData - Task data to validate
 * @param {boolean} isUpdate - Whether this is an update operation
 * @returns {Object} Validation result with errors and sanitized data
 */
const validateTaskData = (taskData, isUpdate = false) => {
    const errors = [];
    const sanitized = {};

    // Title validation
    if (!isUpdate && (!taskData.title || typeof taskData.title !== 'string' || taskData.title.trim().length === 0)) {
        errors.push('Title is required and must be a non-empty string');
    } else if (taskData.title) {
        sanitized.title = taskData.title.trim().substring(0, 200);
    }

    // Description validation
    if (!isUpdate && (!taskData.description || typeof taskData.description !== 'string' || taskData.description.trim().length === 0)) {
        errors.push('Description is required and must be a non-empty string');
    } else if (taskData.description) {
        sanitized.description = taskData.description.trim().substring(0, 1000);
    }

    // Priority validation
    if (taskData.priority !== undefined) {
        if (!CONFIG.VALID_PRIORITIES.includes(taskData.priority)) {
            errors.push(`Priority must be one of: ${CONFIG.VALID_PRIORITIES.join(', ')}`);
        } else {
            sanitized.priority = taskData.priority;
        }
    }

    // Due date validation
    if (taskData.due_date !== undefined) {
        if (taskData.due_date === null) {
            sanitized.due_date = null;
        } else {
            const dueDate = new Date(taskData.due_date);
            if (isNaN(dueDate.getTime())) {
                errors.push('Due date must be a valid date');
            } else {
                sanitized.due_date = dueDate;
            }
        }
    }

    // Status validation (for updates)
    if (taskData.status !== undefined) {
        if (!CONFIG.VALID_STATUSES.includes(taskData.status)) {
            errors.push(`Status must be one of: ${CONFIG.VALID_STATUSES.join(', ')}`);
        } else {
            sanitized.status = taskData.status;
        }
    }

    return { errors, sanitized };
};

/**
 * GET /api/tasks - List tasks with filtering and pagination
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            status,
            priority,
            due_before,
            due_after,
            page = 1,
            limit = CONFIG.DEFAULT_PAGE_SIZE
        } = req.query;

        // Validate and sanitize pagination parameters
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(CONFIG.MAX_PAGE_SIZE, Math.max(1, parseInt(limit) || CONFIG.DEFAULT_PAGE_SIZE));
        const skip = (pageNum - 1) * limitNum;

        // Build query
        const query = buildTaskQuery(req.query, userId);

        // Execute queries in parallel
        const [tasks, totalCount] = await Promise.all([
            Task.find(query)
                .sort({ created_at: -1, _id: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Task.countDocuments(query)
        ]);

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalCount / limitNum);
        const hasNext = pageNum < totalPages;
        const hasPrev = pageNum > 1;

        res.json({
            tasks,
            pagination: {
                current_page: pageNum,
                total_pages: totalPages,
                total_count: totalCount,
                page_size: limitNum,
                has_next: hasNext,
                has_previous: hasPrev
            },
            filters: {
                status: status || null,
                priority: priority || null,
                due_before: due_before || null,
                due_after: due_after || null
            }
        });

    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({
            error: 'Failed to fetch tasks',
            code: 'FETCH_TASKS_ERROR'
        });
    }
});

/**
 * GET /api/tasks/:task_id - Get single task
 */
router.get('/:task_id', requireAuth, validateTaskOwnership, async (req, res) => {
    try {
        res.json({
            task: req.task
        });
    } catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({
            error: 'Failed to fetch task',
            code: 'FETCH_TASK_ERROR'
        });
    }
});

/**
 * POST /api/tasks - Create new task
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Validate request body
        const validation = validateTaskData(req.body, false);
        if (validation.errors.length > 0) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors,
                code: 'VALIDATION_ERROR'
            });
        }

        // Create task data
        const taskData = {
            ...validation.sanitized,
            user_id: userId,
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date()
        };

        // Set default priority if not provided
        if (!taskData.priority) {
            taskData.priority = 'medium';
        }

        // Create task
        const task = new Task(taskData);
        await task.save();

        res.status(201).json({
            message: 'Task created successfully',
            task: task.toObject()
        });

    } catch (error) {
        console.error('Error creating task:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Database validation failed',
                details: Object.values(error.errors).map(err => err.message),
                code: 'DB_VALIDATION_ERROR'
            });
        }

        res.status(500).json({
            error: 'Failed to create task',
            code: 'CREATE_TASK_ERROR'
        });
    }
});

/**
 * PUT /api/tasks/:task_id - Update task
 */
router.put('/:task_id', requireAuth, validateTaskOwnership, async (req, res) => {
    try {
        const task = req.task;
        
        // Prevent user_id modification
        if (req.body.user_id) {
            return res.status(400).json({
                error: 'Cannot modify user_id',
                code: 'IMMUTABLE_FIELD'
            });
        }

        // Validate request body
        const validation = validateTaskData(req.body, true);
        if (validation.errors.length > 0) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors,
                code: 'VALIDATION_ERROR'
            });
        }

        // Update task
        Object.assign(task, validation.sanitized);
        task.updated_at = new Date();

        await task.save();

        res.json({
            message: 'Task updated successfully',
            task: task.toObject()
        });

    } catch (error) {
        console.error('Error updating task:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Database validation failed',
                details: Object.values(error.errors).map(err => err.message),
                code: 'DB_VALIDATION_ERROR'
            });
        }

        res.status(500).json({
            error: 'Failed to update task',
            code: 'UPDATE_TASK_ERROR'
        });
    }
});

/**
 * DELETE /api/tasks/:task_id - Soft delete task
 */
router.delete('/:task_id', requireAuth, validateTaskOwnership, async (req, res) => {
    try {
        const task = req.task;
        
        // Soft delete by setting deleted_at timestamp
        task.deleted_at = new Date();
        task.updated_at = new Date();
        
        await task.save();

        res.status(204).send();

    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({
            error: 'Failed to delete task',
            code: 'DELETE_TASK_ERROR'
        });
    }
});

/**
 * POST /api/tasks/:task_id/complete - Mark task as complete
 */
router.post('/:task_id/complete', requireAuth, validateTaskOwnership, async (req, res) => {
    try {
        const task = req.task;
        
        // Check if task is already completed
        if (task.status === 'completed') {
            return res.status(400).json({
                error: 'Task is already completed',
                code: 'ALREADY_COMPLETED'
            });
        }

        // Mark as completed
        task.status = 'completed';
        task.completed_at = new Date();
        task.updated_at = new Date();
        
        await task.save();

        res.json({
            message: 'Task marked as completed',
            task: task.toObject()
        });

    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).json({
            error: 'Failed to complete task',
            code: 'COMPLETE_TASK_ERROR'
        });
    }
});

/**
 * Error handling middleware for this router
 */
router.use((error, req, res, next) => {
    console.error('Unhandled error in tasks API:', error);
    
    if (res.headersSent) {
        return next(error);
    }
    
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
    });
});

module.exports = router;