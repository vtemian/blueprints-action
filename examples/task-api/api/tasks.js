/**
 * Task Management API Module
 * FastAPI-style task management endpoints implemented with Express.js
 * 
 * @module api/tasks
 * @requires express
 * @requires joi
 * @requires ../models/Task
 * @requires ../middleware/auth
 * @requires ../utils/database
 * @requires ../utils/errors
 */

const express = require('express');
const Joi = require('joi');
const Task = require('../models/Task');
const { authenticateToken, requireAuth } = require('../middleware/auth');
const { getDbConnection, handleDbError } = require('../utils/database');
const { AppError, handleAsync, validateRequest } = require('../utils/errors');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Validation schemas
 */
const schemas = {
  createTask: Joi.object({
    title: Joi.string().trim().min(1).max(255).required()
      .messages({
        'string.empty': 'Title is required',
        'string.max': 'Title must not exceed 255 characters'
      }),
    description: Joi.string().trim().min(1).max(2000).required()
      .messages({
        'string.empty': 'Description is required',
        'string.max': 'Description must not exceed 2000 characters'
      }),
    priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
    due_date: Joi.date().iso().min('now').optional()
      .messages({
        'date.min': 'Due date must be in the future'
      })
  }),

  updateTask: Joi.object({
    title: Joi.string().trim().min(1).max(255).optional(),
    description: Joi.string().trim().min(1).max(2000).optional(),
    priority: Joi.string().valid('low', 'medium', 'high').optional(),
    due_date: Joi.date().iso().allow(null).optional(),
    status: Joi.string().valid('pending', 'in_progress', 'completed').optional(),
    user_id: Joi.forbidden().messages({
      'any.unknown': 'Cannot modify user_id field'
    })
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update'
  }),

  queryParams: Joi.object({
    status: Joi.string().valid('pending', 'in_progress', 'completed').optional(),
    priority: Joi.string().valid('low', 'medium', 'high').optional(),
    due_before: Joi.date().iso().optional(),
    due_after: Joi.date().iso().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),

  taskId: Joi.object({
    taskId: Joi.string().uuid().required().messages({
      'string.guid': 'Invalid task ID format'
    })
  })
};

/**
 * Helper function to verify task ownership
 * @param {string} taskId - Task ID to verify
 * @param {string} userId - User ID from authentication
 * @returns {Promise<Object>} Task object if owned by user
 * @throws {AppError} If task not found or not owned by user
 */
const verifyTaskOwnership = async (taskId, userId) => {
  try {
    const task = await Task.findById(taskId);
    
    if (!task) {
      throw new AppError('Task not found', 404);
    }
    
    if (task.user_id !== userId) {
      throw new AppError('Access denied: Task not owned by user', 403);
    }
    
    if (task.deleted_at) {
      throw new AppError('Task not found', 404);
    }
    
    return task;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw handleDbError(error);
  }
};

/**
 * Build database query filters from request parameters
 * @param {Object} queryParams - Validated query parameters
 * @param {string} userId - User ID from authentication
 * @returns {Object} Database query filters and pagination
 */
const buildTaskFilters = (queryParams, userId) => {
  const filters = {
    user_id: userId,
    deleted_at: null
  };
  
  if (queryParams.status) {
    filters.status = queryParams.status;
  }
  
  if (queryParams.priority) {
    filters.priority = queryParams.priority;
  }
  
  const dateFilters = {};
  if (queryParams.due_before) {
    dateFilters.due_date = { ...dateFilters.due_date, $lte: queryParams.due_before };
  }
  
  if (queryParams.due_after) {
    dateFilters.due_date = { ...dateFilters.due_date, $gte: queryParams.due_after };
  }
  
  return {
    filters: { ...filters, ...dateFilters },
    pagination: {
      page: queryParams.page,
      limit: queryParams.limit,
      offset: (queryParams.page - 1) * queryParams.limit
    }
  };
};

/**
 * GET /api/tasks
 * List user tasks with filtering and pagination
 */
router.get('/', 
  validateRequest({ query: schemas.queryParams }),
  handleAsync(async (req, res) => {
    const { filters, pagination } = buildTaskFilters(req.query, req.user.id);
    
    try {
      const [tasks, totalCount] = await Promise.all([
        Task.find(filters)
          .sort({ created_at: -1 })
          .limit(pagination.limit)
          .skip(pagination.offset),
        Task.countDocuments(filters)
      ]);
      
      const totalPages = Math.ceil(totalCount / pagination.limit);
      const hasNext = pagination.page < totalPages;
      const hasPrev = pagination.page > 1;
      
      res.status(200).json({
        success: true,
        data: {
          tasks: tasks.map(task => task.toJSON()),
          pagination: {
            current_page: pagination.page,
            per_page: pagination.limit,
            total_items: totalCount,
            total_pages: totalPages,
            has_next: hasNext,
            has_previous: hasPrev
          }
        }
      });
    } catch (error) {
      throw handleDbError(error);
    }
  })
);

/**
 * GET /api/tasks/:taskId
 * Get single task with ownership verification
 */
router.get('/:taskId',
  validateRequest({ params: schemas.taskId }),
  handleAsync(async (req, res) => {
    const task = await verifyTaskOwnership(req.params.taskId, req.user.id);
    
    res.status(200).json({
      success: true,
      data: {
        task: task.toJSON()
      }
    });
  })
);

/**
 * POST /api/tasks
 * Create new task with validation
 */
router.post('/',
  validateRequest({ body: schemas.createTask }),
  handleAsync(async (req, res) => {
    const taskData = {
      ...req.body,
      user_id: req.user.id,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    };
    
    try {
      const task = await Task.create(taskData);
      
      res.status(201).json({
        success: true,
        message: 'Task created successfully',
        data: {
          task: task.toJSON()
        }
      });
    } catch (error) {
      throw handleDbError(error);
    }
  })
);

/**
 * PUT /api/tasks/:taskId
 * Update task with ownership verification
 */
router.put('/:taskId',
  validateRequest({ 
    params: schemas.taskId,
    body: schemas.updateTask 
  }),
  handleAsync(async (req, res) => {
    await verifyTaskOwnership(req.params.taskId, req.user.id);
    
    const updateData = {
      ...req.body,
      updated_at: new Date()
    };
    
    try {
      const updatedTask = await Task.findByIdAndUpdate(
        req.params.taskId,
        updateData,
        { 
          new: true,
          runValidators: true
        }
      );
      
      res.status(200).json({
        success: true,
        message: 'Task updated successfully',
        data: {
          task: updatedTask.toJSON()
        }
      });
    } catch (error) {
      throw handleDbError(error);
    }
  })
);

/**
 * DELETE /api/tasks/:taskId
 * Soft delete task with ownership verification
 */
router.delete('/:taskId',
  validateRequest({ params: schemas.taskId }),
  handleAsync(async (req, res) => {
    await verifyTaskOwnership(req.params.taskId, req.user.id);
    
    try {
      await Task.findByIdAndUpdate(
        req.params.taskId,
        { 
          deleted_at: new Date(),
          updated_at: new Date()
        }
      );
      
      res.status(204).send();
    } catch (error) {
      throw handleDbError(error);
    }
  })
);

/**
 * POST /api/tasks/:taskId/complete
 * Mark task as completed with timestamp
 */
router.post('/:taskId/complete',
  validateRequest({ params: schemas.taskId }),
  handleAsync(async (req, res) => {
    const task = await verifyTaskOwnership(req.params.taskId, req.user.id);
    
    if (task.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Task is already completed',
          code: 'TASK_ALREADY_COMPLETED'
        }
      });
    }
    
    try {
      const completedTask = await Task.findByIdAndUpdate(
        req.params.taskId,
        {
          status: 'completed',
          completed_at: new Date(),
          updated_at: new Date()
        },
        { 
          new: true,
          runValidators: true
        }
      );
      
      res.status(200).json({
        success: true,
        message: 'Task marked as completed',
        data: {
          task: completedTask.toJSON()
        }
      });
    } catch (error) {
      throw handleDbError(error);
    }
  })
);

/**
 * Error handling middleware for this router
 */
router.use((error, req, res, next) => {
  // Handle Joi validation errors
  if (error.isJoi) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      }
    });
  }
  
  // Handle custom AppError instances
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        message: error.message,
        code: error.code || 'APPLICATION_ERROR'
      }
    });
  }
  
  // Handle database connection errors
  if (error.name === 'MongoError' || error.name === 'MongooseError') {
    return res.status(500).json({
      success: false,
      error: {
        message: 'Database operation failed',
        code: 'DATABASE_ERROR'
      }
    });
  }
  
  // Handle unexpected errors
  console.error('Unexpected error in tasks API:', error);
  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }
  });
});

module.exports = router;