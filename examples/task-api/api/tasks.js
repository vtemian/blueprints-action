/**
 * Task Management API Module
 * FastAPI-style task management endpoints using Express.js
 * 
 * @module api/tasks
 * @requires express
 * @requires express-validator
 * @requires ../middleware/auth
 * @requires ../models/Task
 * @requires ../utils/database
 * @requires ../utils/logger
 */

import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.js';
import Task from '../models/Task.js';
import { DatabaseError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { sanitizeHtml } from '../utils/sanitizer.js';

const router = express.Router();

// Rate limiting middleware
const taskRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.'
  }
});

/**
 * Standard error response formatter
 * @param {string} message - Error message
 * @param {string} [type='error'] - Error type
 * @param {Object} [details=null] - Additional error details
 * @returns {Object} Formatted error response
 */
const formatErrorResponse = (message, type = 'error', details = null) => ({
  success: false,
  error: {
    type,
    message,
    ...(details && { details })
  }
});

/**
 * Standard success response formatter
 * @param {*} data - Response data
 * @param {Object} [meta=null] - Response metadata
 * @returns {Object} Formatted success response
 */
const formatSuccessResponse = (data, meta = null) => ({
  success: true,
  data,
  ...(meta && { meta })
});

/**
 * Validation error handler middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(
      formatErrorResponse(
        'Validation failed',
        'validation_error',
        errors.array()
      )
    );
  }
  next();
};

/**
 * Task ownership verification middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const verifyTaskOwnership = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    const task = await Task.findById(taskId);
    
    if (!task) {
      return res.status(404).json(
        formatErrorResponse('Task not found', 'not_found')
      );
    }

    if (task.userId !== userId) {
      return res.status(403).json(
        formatErrorResponse('Access denied', 'forbidden')
      );
    }

    req.task = task;
    next();
  } catch (error) {
    logger.error('Task ownership verification failed:', error);
    res.status(500).json(
      formatErrorResponse('Internal server error', 'server_error')
    );
  }
};

// Validation schemas
const createTaskValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters')
    .customSanitizer(sanitizeHtml),
  body('description')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Description must be between 1 and 2000 characters')
    .customSanitizer(sanitizeHtml),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be one of: low, medium, high, urgent'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid ISO 8601 date')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Due date must be in the future');
      }
      return true;
    })
];

const updateTaskValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters')
    .customSanitizer(sanitizeHtml),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Description must be between 1 and 2000 characters')
    .customSanitizer(sanitizeHtml),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be one of: low, medium, high, urgent'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid ISO 8601 date'),
  body('status')
    .optional()
    .isIn(['pending', 'in_progress', 'completed', 'cancelled'])
    .withMessage('Status must be one of: pending, in_progress, completed, cancelled')
];

const listTasksValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['pending', 'in_progress', 'completed', 'cancelled'])
    .withMessage('Status must be one of: pending, in_progress, completed, cancelled'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be one of: low, medium, high, urgent'),
  query('dueBefore')
    .optional()
    .isISO8601()
    .withMessage('dueBefore must be a valid ISO 8601 date'),
  query('dueAfter')
    .optional()
    .isISO8601()
    .withMessage('dueAfter must be a valid ISO 8601 date')
];

const taskIdValidation = [
  param('taskId')
    .isMongoId()
    .withMessage('Invalid task ID format')
];

/**
 * GET /api/tasks
 * List tasks with filtering and pagination
 */
router.get(
  '/',
  taskRateLimit,
  authenticateToken,
  listTasksValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        priority,
        dueBefore,
        dueAfter,
        search
      } = req.query;

      const userId = req.user.id;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Build filter object
      const filters = { userId, deletedAt: null };
      
      if (status) filters.status = status;
      if (priority) filters.priority = priority;
      if (dueBefore || dueAfter) {
        filters.dueDate = {};
        if (dueBefore) filters.dueDate.$lte = new Date(dueBefore);
        if (dueAfter) filters.dueDate.$gte = new Date(dueAfter);
      }
      if (search) {
        filters.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      // Execute queries in parallel
      const [tasks, totalCount] = await Promise.all([
        Task.find(filters)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(parseInt(limit))
          .select('-deletedAt -__v'),
        Task.countDocuments(filters)
      ]);

      const totalPages = Math.ceil(totalCount / parseInt(limit));
      const hasNextPage = parseInt(page) < totalPages;
      const hasPrevPage = parseInt(page) > 1;

      const meta = {
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalCount,
          itemsPerPage: parseInt(limit),
          hasNextPage,
          hasPrevPage
        },
        filters: {
          ...(status && { status }),
          ...(priority && { priority }),
          ...(dueBefore && { dueBefore }),
          ...(dueAfter && { dueAfter }),
          ...(search && { search })
        }
      };

      logger.info(`User ${userId} retrieved ${tasks.length} tasks`);
      
      res.json(formatSuccessResponse(tasks, meta));
    } catch (error) {
      logger.error('Error retrieving tasks:', error);
      res.status(500).json(
        formatErrorResponse('Failed to retrieve tasks', 'server_error')
      );
    }
  }
);

/**
 * GET /api/tasks/:taskId
 * Get single task with ownership verification
 */
router.get(
  '/:taskId',
  taskRateLimit,
  authenticateToken,
  taskIdValidation,
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      const task = req.task;
      
      logger.info(`User ${req.user.id} retrieved task ${task._id}`);
      
      res.json(formatSuccessResponse(task));
    } catch (error) {
      logger.error('Error retrieving task:', error);
      res.status(500).json(
        formatErrorResponse('Failed to retrieve task', 'server_error')
      );
    }
  }
);

/**
 * POST /api/tasks
 * Create new task with validation
 */
router.post(
  '/',
  taskRateLimit,
  authenticateToken,
  createTaskValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { title, description, priority = 'medium', dueDate } = req.body;
      const userId = req.user.id;

      const taskData = {
        title,
        description,
        priority,
        userId,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (dueDate) {
        taskData.dueDate = new Date(dueDate);
      }

      const task = await Task.create(taskData);
      
      logger.info(`User ${userId} created task ${task._id}`);
      
      res.status(201).json(formatSuccessResponse(task));
    } catch (error) {
      logger.error('Error creating task:', error);
      
      if (error.name === 'ValidationError') {
        return res.status(400).json(
          formatErrorResponse('Invalid task data', 'validation_error', error.errors)
        );
      }
      
      res.status(500).json(
        formatErrorResponse('Failed to create task', 'server_error')
      );
    }
  }
);

/**
 * PUT /api/tasks/:taskId
 * Update task with ownership verification
 */
router.put(
  '/:taskId',
  taskRateLimit,
  authenticateToken,
  taskIdValidation,
  updateTaskValidation,
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      const task = req.task;
      const updates = req.body;
      
      // Prevent updating completed tasks unless changing status
      if (task.status === 'completed' && updates.status !== 'completed') {
        return res.status(400).json(
          formatErrorResponse(
            'Cannot modify completed task properties except status',
            'business_rule_violation'
          )
        );
      }

      // Update allowed fields
      const allowedUpdates = ['title', 'description', 'priority', 'dueDate', 'status'];
      const updateData = {};
      
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      });

      updateData.updatedAt = new Date();

      // Handle status change to completed
      if (updates.status === 'completed' && task.status !== 'completed') {
        updateData.completedAt = new Date();
      } else if (updates.status !== 'completed') {
        updateData.completedAt = null;
      }

      const updatedTask = await Task.findByIdAndUpdate(
        task._id,
        updateData,
        { new: true, runValidators: true }
      ).select('-deletedAt -__v');

      logger.info(`User ${req.user.id} updated task ${task._id}`);
      
      res.json(formatSuccessResponse(updatedTask));
    } catch (error) {
      logger.error('Error updating task:', error);
      
      if (error.name === 'ValidationError') {
        return res.status(400).json(
          formatErrorResponse('Invalid update data', 'validation_error', error.errors)
        );
      }
      
      res.status(500).json(
        formatErrorResponse('Failed to update task', 'server_error')
      );
    }
  }
);

/**
 * DELETE /api/tasks/:taskId
 * Soft delete task with ownership verification
 */
router.delete(
  '/:taskId',
  taskRateLimit,
  authenticateToken,
  taskIdValidation,
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      const task = req.task;

      // Soft delete by setting deletedAt timestamp
      await Task.findByIdAndUpdate(task._id, {
        deletedAt: new Date(),
        updatedAt: new Date()
      });

      logger.info(`User ${req.user.id} deleted task ${task._id}`);
      
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting task:', error);
      res.status(500).json(
        formatErrorResponse('Failed to delete task', 'server_error')
      );
    }
  }
);

/**
 * POST /api/tasks/:taskId/complete
 * Mark task as complete with timestamp
 */
router.post(
  '/:taskId/complete',
  taskRateLimit,
  authenticateToken,
  taskIdValidation,
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      const task = req.task;

      if (task.status === 'completed') {
        return res.status(400).json(
          formatErrorResponse('Task is already completed', 'business_rule_violation')
        );
      }

      if (task.