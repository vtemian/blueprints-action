/**
 * Task Management API Router
 * Production-ready Express router module for task management operations
 * Implements authentication, authorization, validation, and comprehensive error handling
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

// Core imports
const { authenticateToken, requireAuth } = require('@core/auth');
const { connectDatabase, handleDatabaseError } = require('@core/database');
const Task = require('@models/task');

// Utilities
const { isValidDate, parseDate, sanitizeString } = require('@utils/dateUtils');
const logger = require('@utils/logger');

const router = express.Router();

// Rate limiting middleware
const taskRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all task routes
router.use(taskRateLimit);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Validation middleware for handling validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

/**
 * Middleware to verify task ownership
 */
const verifyTaskOwnership = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        error: 'Invalid task ID format',
        code: 'INVALID_TASK_ID'
      });
    }

    const task = await Task.findById(taskId);
    
    if (!task) {
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
    logger.error('Error in task ownership verification:', error);
    return res.status(500).json({
      error: 'Internal server error during authorization',
      code: 'AUTHORIZATION_ERROR'
    });
  }
};

/**
 * Validation rules for task creation
 */
const createTaskValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title is required and must be between 1 and 200 characters')
    .customSanitizer(sanitizeString),
  
  body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description is required and must be between 1 and 1000 characters')
    .customSanitizer(sanitizeString),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be one of: low, medium, high, urgent'),
  
  body('due_date')
    .optional()
    .custom((value) => {
      if (value && !isValidDate(value)) {
        throw new Error('Due date must be a valid ISO 8601 date string');
      }
      if (value && new Date(value) < new Date()) {
        throw new Error('Due date cannot be in the past');
      }
      return true;
    })
];

/**
 * Validation rules for task updates
 */
const updateTaskValidation = [
  param('taskId')
    .isMongoId()
    .withMessage('Invalid task ID format'),
  
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters')
    .customSanitizer(sanitizeString),
  
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description must be between 1 and 1000 characters')
    .customSanitizer(sanitizeString),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be one of: low, medium, high, urgent'),
  
  body('status')
    .optional()
    .isIn(['pending', 'in_progress', 'completed', 'cancelled'])
    .withMessage('Status must be one of: pending, in_progress, completed, cancelled'),
  
  body('due_date')
    .optional()
    .custom((value) => {
      if (value && !isValidDate(value)) {
        throw new Error('Due date must be a valid ISO 8601 date string');
      }
      return true;
    }),
  
  body('user_id')
    .not()
    .exists()
    .withMessage('User ID cannot be modified')
];

/**
 * Validation rules for query parameters
 */
const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  
  query('status')
    .optional()
    .isIn(['pending', 'in_progress', 'completed', 'cancelled'])
    .withMessage('Status must be one of: pending, in_progress, completed, cancelled'),
  
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be one of: low, medium, high, urgent'),
  
  query('due_before')
    .optional()
    .isISO8601()
    .withMessage('due_before must be a valid ISO 8601 date'),
  
  query('due_after')
    .optional()
    .isISO8601()
    .withMessage('due_after must be a valid ISO 8601 date')
];

/**
 * GET /api/tasks
 * Retrieve tasks with filtering and pagination
 */
router.get('/', queryValidation, handleValidationErrors, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      due_before,
      due_after
    } = req.query;

    // Build filter object
    const filter = { user_id: userId, deleted_at: null };

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    // Date range filtering
    if (due_before || due_after) {
      filter.due_date = {};
      if (due_before) filter.due_date.$lte = new Date(due_before);
      if (due_after) filter.due_date.$gte = new Date(due_after);
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query with pagination
    const [tasks, totalCount] = await Promise.all([
      Task.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Task.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    logger.info(`Retrieved ${tasks.length} tasks for user ${userId}`, {
      userId,
      page,
      limit,
      totalCount,
      filters: { status, priority, due_before, due_after }
    });

    res.status(200).json({
      data: tasks,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_count: totalCount,
        limit,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });

  } catch (error) {
    logger.error('Error retrieving tasks:', error);
    handleDatabaseError(error, res);
  }
});

/**
 * GET /api/tasks/:taskId
 * Retrieve a specific task by ID
 */
router.get('/:taskId',
  param('taskId').isMongoId().withMessage('Invalid task ID format'),
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      const task = req.task;

      logger.info(`Retrieved task ${task._id} for user ${req.user.id}`);

      res.status(200).json({
        data: task
      });

    } catch (error) {
      logger.error('Error retrieving task:', error);
      handleDatabaseError(error, res);
    }
  }
);

/**
 * POST /api/tasks
 * Create a new task
 */
router.post('/', createTaskValidation, handleValidationErrors, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const userId = req.user.id;
      const { title, description, priority = 'medium', due_date } = req.body;

      const taskData = {
        title,
        description,
        priority,
        user_id: userId,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      };

      if (due_date) {
        taskData.due_date = parseDate(due_date);
      }

      const task = new Task(taskData);
      await task.save({ session });

      logger.info(`Created new task ${task._id} for user ${userId}`, {
        taskId: task._id,
        userId,
        title: task.title
      });

      res.status(201).json({
        message: 'Task created successfully',
        data: task
      });
    });

  } catch (error) {
    logger.error('Error creating task:', error);
    handleDatabaseError(error, res);
  } finally {
    await session.endSession();
  }
});

/**
 * PUT /api/tasks/:taskId
 * Update an existing task
 */
router.put('/:taskId',
  updateTaskValidation,
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        const task = req.task;
        const updates = req.body;

        // Remove undefined values and prepare update object
        const updateData = {};
        Object.keys(updates).forEach(key => {
          if (updates[key] !== undefined) {
            updateData[key] = updates[key];
          }
        });

        // Handle due_date parsing
        if (updateData.due_date) {
          updateData.due_date = parseDate(updateData.due_date);
        }

        updateData.updated_at = new Date();

        // Update the task
        const updatedTask = await Task.findByIdAndUpdate(
          task._id,
          { $set: updateData },
          { new: true, session, runValidators: true }
        );

        logger.info(`Updated task ${task._id} for user ${req.user.id}`, {
          taskId: task._id,
          userId: req.user.id,
          updates: Object.keys(updateData)
        });

        res.status(200).json({
          message: 'Task updated successfully',
          data: updatedTask
        });
      });

    } catch (error) {
      logger.error('Error updating task:', error);
      handleDatabaseError(error, res);
    } finally {
      await session.endSession();
    }
  }
);

/**
 * DELETE /api/tasks/:taskId
 * Soft delete a task
 */
router.delete('/:taskId',
  param('taskId').isMongoId().withMessage('Invalid task ID format'),
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        const task = req.task;

        // Soft delete by setting deleted_at timestamp
        await Task.findByIdAndUpdate(
          task._id,
          {
            $set: {
              deleted_at: new Date(),
              updated_at: new Date()
            }
          },
          { session }
        );

        logger.info(`Soft deleted task ${task._id} for user ${req.user.id}`, {
          taskId: task._id,
          userId: req.user.id
        });

        res.status(204).send();
      });

    } catch (error) {
      logger.error('Error deleting task:', error);
      handleDatabaseError(error, res);
    } finally {
      await session.endSession();
    }
  }
);

/**
 * POST /api/tasks/:taskId/complete
 * Mark a task as completed
 */
router.post('/:taskId/complete',
  param('taskId').isMongoId().withMessage('Invalid task ID format'),
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        const task = req.task;

        if (task.status === 'completed') {
          return res.status(400).json({
            error: 'Task is already completed',
            code: 'TASK_ALREADY_COMPLETED'
          });
        }

        if (task.status === 'cancelled') {
          return res.status(400).json({
            error: 'Cannot complete a cancelled task',
            code: 'CANNOT_COMPLETE_CANCELLED_TASK'
          });
        }

        const completedTask = await Task.findByIdAndUpdate(
          task._id,
          {
            $set: {
              status: 'completed',
              completed_at: new Date(),
              updated_at: new Date()
            }
          },
          { new: true, session }
        );

        logger.info(`Completed task ${task._id} for user ${req.user.id}`, {
          taskId: task._id,
          userId: req.user.id
        });

        res.status(200).json({
          message: 'Task marked as completed',
          data: completedTask
        });
      });

    } catch (error) {
      logger.error('Error completing task:', error);
      handleDatabaseError(error, res);
    } finally {
      await session