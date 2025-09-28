/**
 * @fileoverview Task management API endpoints with Express.js
 * @module api/tasks
 * @requires express
 * @requires express-validator
 * @requires ../middleware/auth
 * @requires ../middleware/validation
 * @requires ../services/taskService
 * @requires ../utils/logger
 * @requires ../utils/responses
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * @typedef {Object} Task
 * @property {string} id - Task unique identifier
 * @property {string} title - Task title
 * @property {string} description - Task description
 * @property {string} priority - Task priority (low, medium, high)
 * @property {string} status - Task status (pending, in_progress, completed)
 * @property {string|null} due_date - Task due date in ISO format
 * @property {string} user_id - Task owner ID
 * @property {boolean} is_deleted - Soft delete flag
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 * @property {string|null} completed_at - Completion timestamp
 */

/**
 * @typedef {Object} PaginationParams
 * @property {number} page - Page number (default: 1)
 * @property {number} limit - Items per page (default: 10, max: 100)
 * @property {number} offset - Calculated offset for database query
 */

/**
 * @typedef {Object} TaskFilters
 * @property {string} status - Filter by task status
 * @property {string} priority - Filter by task priority
 * @property {string} due_before - Filter tasks due before date
 * @property {string} due_after - Filter tasks due after date
 */

/**
 * Creates Express router with task management endpoints
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.taskService - Task service instance
 * @param {Object} dependencies.authService - Authentication service instance
 * @returns {express.Router} Configured Express router
 */
function createTaskRouter(dependencies) {
  const router = express.Router();
  const { taskService, authService } = dependencies;

  // Apply authentication middleware to all routes
  router.use(authMiddleware(authService));

  /**
   * Validation rules for task creation
   */
  const createTaskValidation = [
    body('title')
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be a string between 1 and 200 characters'),
    
    body('description')
      .isString()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Description must be a string between 1 and 1000 characters'),
    
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Priority must be one of: low, medium, high'),
    
    body('due_date')
      .optional()
      .isISO8601()
      .withMessage('Due date must be a valid ISO 8601 date format'),
    
    handleValidationErrors
  ];

  /**
   * Validation rules for task updates
   */
  const updateTaskValidation = [
    param('task_id')
      .isUUID()
      .withMessage('Task ID must be a valid UUID'),
    
    body('title')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be a string between 1 and 200 characters'),
    
    body('description')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Description must be a string between 1 and 1000 characters'),
    
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Priority must be one of: low, medium, high'),
    
    body('status')
      .optional()
      .isIn(['pending', 'in_progress', 'completed'])
      .withMessage('Status must be one of: pending, in_progress, completed'),
    
    body('due_date')
      .optional()
      .isISO8601()
      .withMessage('Due date must be a valid ISO 8601 date format'),
    
    body('user_id')
      .not()
      .exists()
      .withMessage('User ID cannot be modified'),
    
    handleValidationErrors
  ];

  /**
   * Validation rules for pagination and filtering
   */
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
      .isIn(['pending', 'in_progress', 'completed'])
      .withMessage('Status must be one of: pending, in_progress, completed'),
    
    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Priority must be one of: low, medium, high'),
    
    query('due_before')
      .optional()
      .isISO8601()
      .withMessage('due_before must be a valid ISO 8601 date format'),
    
    query('due_after')
      .optional()
      .isISO8601()
      .withMessage('due_after must be a valid ISO 8601 date format'),
    
    handleValidationErrors
  ];

  /**
   * Validation rules for task ID parameter
   */
  const taskIdValidation = [
    param('task_id')
      .isUUID()
      .withMessage('Task ID must be a valid UUID'),
    
    handleValidationErrors
  ];

  /**
   * Middleware to verify task ownership
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   * @param {express.NextFunction} next - Express next function
   */
  const verifyTaskOwnership = async (req, res, next) => {
    try {
      const { task_id } = req.params;
      const userId = req.user.id;

      const task = await taskService.getTaskById(task_id, userId);
      
      if (!task) {
        logger.warn(`Task not found or access denied: ${task_id} for user: ${userId}`);
        return res.status(404).json(
          errorResponse('Task not found or you do not have permission to access it', 'TASK_NOT_FOUND')
        );
      }

      req.task = task;
      next();
    } catch (error) {
      logger.error('Error verifying task ownership:', error);
      res.status(500).json(
        errorResponse('Internal server error', 'INTERNAL_ERROR')
      );
    }
  };

  /**
   * Helper function to extract pagination parameters
   * @param {Object} query - Request query parameters
   * @returns {PaginationParams} Pagination parameters
   */
  const extractPaginationParams = (query) => {
    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 10, 100);
    const offset = (page - 1) * limit;

    return { page, limit, offset };
  };

  /**
   * Helper function to extract filter parameters
   * @param {Object} query - Request query parameters
   * @returns {TaskFilters} Filter parameters
   */
  const extractFilterParams = (query) => {
    const filters = {};
    
    if (query.status) filters.status = query.status;
    if (query.priority) filters.priority = query.priority;
    if (query.due_before) filters.due_before = query.due_before;
    if (query.due_after) filters.due_after = query.due_after;

    return filters;
  };

  /**
   * GET /api/tasks - List tasks with filtering and pagination
   * @route GET /api/tasks
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   */
  router.get('/', listTasksValidation, async (req, res) => {
    try {
      const userId = req.user.id;
      const pagination = extractPaginationParams(req.query);
      const filters = extractFilterParams(req.query);

      logger.info(`Fetching tasks for user: ${userId}`, { pagination, filters });

      const result = await taskService.getTasks(userId, filters, pagination);

      const response = {
        tasks: result.tasks,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: result.total,
          pages: Math.ceil(result.total / pagination.limit),
          has_next: pagination.page < Math.ceil(result.total / pagination.limit),
          has_prev: pagination.page > 1
        }
      };

      res.json(successResponse(response, 'Tasks retrieved successfully'));
    } catch (error) {
      logger.error('Error fetching tasks:', error);
      res.status(500).json(
        errorResponse('Failed to retrieve tasks', 'FETCH_TASKS_ERROR')
      );
    }
  });

  /**
   * GET /api/tasks/:task_id - Get single task with ownership verification
   * @route GET /api/tasks/:task_id
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   */
  router.get('/:task_id', taskIdValidation, verifyTaskOwnership, async (req, res) => {
    try {
      const task = req.task;
      
      logger.info(`Task retrieved: ${task.id} for user: ${req.user.id}`);
      
      res.json(successResponse(task, 'Task retrieved successfully'));
    } catch (error) {
      logger.error('Error retrieving task:', error);
      res.status(500).json(
        errorResponse('Failed to retrieve task', 'GET_TASK_ERROR')
      );
    }
  });

  /**
   * POST /api/tasks - Create new task with validation
   * @route POST /api/tasks
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   */
  router.post('/', createTaskValidation, async (req, res) => {
    try {
      const userId = req.user.id;
      const taskData = {
        ...req.body,
        user_id: userId,
        status: 'pending',
        priority: req.body.priority || 'medium'
      };

      logger.info(`Creating task for user: ${userId}`, { title: taskData.title });

      const task = await taskService.createTask(taskData);

      logger.info(`Task created successfully: ${task.id}`);

      res.status(201).json(successResponse(task, 'Task created successfully'));
    } catch (error) {
      logger.error('Error creating task:', error);
      
      if (error.name === 'ValidationError') {
        return res.status(400).json(
          errorResponse('Invalid task data', 'VALIDATION_ERROR', error.details)
        );
      }

      res.status(500).json(
        errorResponse('Failed to create task', 'CREATE_TASK_ERROR')
      );
    }
  });

  /**
   * PUT /api/tasks/:task_id - Update task with ownership verification
   * @route PUT /api/tasks/:task_id
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   */
  router.put('/:task_id', updateTaskValidation, verifyTaskOwnership, async (req, res) => {
    try {
      const { task_id } = req.params;
      const userId = req.user.id;
      const updateData = req.body;

      // Remove any attempt to modify user_id
      delete updateData.user_id;

      logger.info(`Updating task: ${task_id} for user: ${userId}`, updateData);

      const updatedTask = await taskService.updateTask(task_id, updateData, userId);

      logger.info(`Task updated successfully: ${task_id}`);

      res.json(successResponse(updatedTask, 'Task updated successfully'));
    } catch (error) {
      logger.error('Error updating task:', error);
      
      if (error.name === 'ValidationError') {
        return res.status(400).json(
          errorResponse('Invalid update data', 'VALIDATION_ERROR', error.details)
        );
      }

      res.status(500).json(
        errorResponse('Failed to update task', 'UPDATE_TASK_ERROR')
      );
    }
  });

  /**
   * DELETE /api/tasks/:task_id - Soft delete task with ownership verification
   * @route DELETE /api/tasks/:task_id
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   */
  router.delete('/:task_id', taskIdValidation, verifyTaskOwnership, async (req, res) => {
    try {
      const { task_id } = req.params;
      const userId = req.user.id;

      logger.info(`Soft deleting task: ${task_id} for user: ${userId}`);

      await taskService.softDeleteTask(task_id, userId);

      logger.info(`Task soft deleted successfully: ${task_id}`);

      res.json(successResponse(null, 'Task deleted successfully'));
    } catch (error) {
      logger.error('Error deleting task:', error);
      res.status(500).json(
        errorResponse('Failed to delete task', 'DELETE_TASK_ERROR')
      );
    }
  });

  /**
   * POST /api/tasks/:task_id/complete - Mark task as completed with timestamp
   * @route POST /api/tasks/:task_id/complete
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   */
  router.post('/:task_id/complete', taskIdValidation, verifyTaskOwnership, async (req, res) => {
    try {
      const { task_id } = req.params;
      const userId = req.user.id;

      logger.info(`Marking task as completed: ${task_id} for user: ${userId}`);

      const completedTask = await taskService.completeTask(task_id, userId);

      logger.info(`Task marked as completed: ${task_id}`);

      res.json(successResponse(completedTask, 'Task marked as completed successfully'));
    } catch (error) {
      logger.error('Error completing task:', error);
      
      if (error.message === 'Task already completed') {
        return res.status(400).json(
          errorResponse('Task is already completed', 'TASK_ALREADY_COMPLETED')
        );
      }

      res.status(500).json(
        errorResponse('Failed to complete task', 'COMPLETE_TASK_ERROR')
      );
    }
  });

  return router;
}

module.exports = createTaskRouter