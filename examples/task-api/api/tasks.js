/**
 * Task Management API Module
 * Provides RESTful endpoints for task CRUD operations with authentication and authorization
 * @module api.tasks
 */

const express = require('express');
const Joi = require('joi');
const { StatusCodes } = require('http-status-codes');
const { Task } = require('@models/task');
const { authenticateUser } = require('@core/auth');
const { getDatabase } = require('@core/database');

const router = express.Router();

// Validation Schemas
const taskIdSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .required()
  .messages({
    'string.pattern.base': 'Invalid task ID format'
  });

const createTaskSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .trim()
    .required()
    .messages({
      'string.min': 'Title must be at least 1 character long',
      'string.max': 'Title cannot exceed 200 characters',
      'any.required': 'Title is required'
    }),
  description: Joi.string()
    .min(1)
    .max(1000)
    .trim()
    .required()
    .messages({
      'string.min': 'Description must be at least 1 character long',
      'string.max': 'Description cannot exceed 1000 characters',
      'any.required': 'Description is required'
    }),
  priority: Joi.string()
    .valid('low', 'medium', 'high')
    .optional()
    .default('medium'),
  due_date: Joi.date()
    .iso()
    .optional()
    .messages({
      'date.format': 'Due date must be a valid ISO date string'
    })
});

const updateTaskSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .trim()
    .optional(),
  description: Joi.string()
    .min(1)
    .max(1000)
    .trim()
    .optional(),
  priority: Joi.string()
    .valid('low', 'medium', 'high')
    .optional(),
  due_date: Joi.date()
    .iso()
    .optional()
    .allow(null),
  status: Joi.string()
    .valid('pending', 'in_progress', 'completed')
    .optional()
}).min(1);

const querySchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'in_progress', 'completed')
    .optional(),
  priority: Joi.string()
    .valid('low', 'medium', 'high')
    .optional(),
  due_before: Joi.date()
    .iso()
    .optional(),
  due_after: Joi.date()
    .iso()
    .optional(),
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .optional(),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .optional()
});

// Middleware Functions

/**
 * Request logging middleware
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const { method, originalUrl, ip } = req;
  const userId = req.user?.id || 'anonymous';
  
  console.log(`[${new Date().toISOString()}] ${method} ${originalUrl} - User: ${userId} - IP: ${ip}`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${method} ${originalUrl} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

/**
 * Validation middleware factory
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'params', 'query')
 * @returns {Function} Express middleware function
 */
const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { 
      abortEarly: false,
      stripUnknown: true 
    });
    
    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Validation Error',
        message: errorMessages.join(', '),
        statusCode: StatusCodes.BAD_REQUEST
      });
    }
    
    req[property] = value;
    next();
  };
};

/**
 * Task ownership verification middleware
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express next function
 */
const verifyTaskOwnership = async (req, res, next) => {
  try {
    const { task_id } = req.params;
    const userId = req.user.id;
    
    const task = await Task.findOne({ 
      _id: task_id, 
      user_id: userId,
      deleted_at: null 
    });
    
    if (!task) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: 'Task Not Found',
        message: 'Task not found or you do not have permission to access it',
        statusCode: StatusCodes.NOT_FOUND
      });
    }
    
    req.task = task;
    next();
  } catch (error) {
    console.error('Task ownership verification error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal Server Error',
      message: 'An error occurred while verifying task ownership',
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR
    });
  }
};

/**
 * Global error handler for async routes
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Apply middleware to all routes
router.use(requestLogger);
router.use(authenticateUser);

// Route Handlers

/**
 * GET /api/tasks - List user tasks with filtering and pagination
 * @route GET /api/tasks
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.get('/', 
  validateRequest(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { status, priority, due_before, due_after, page, limit } = req.query;
    const userId = req.user.id;
    
    // Build filter object
    const filter = { 
      user_id: userId,
      deleted_at: null 
    };
    
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    
    if (due_before || due_after) {
      filter.due_date = {};
      if (due_before) filter.due_date.$lte = new Date(due_before);
      if (due_after) filter.due_date.$gte = new Date(due_after);
    }
    
    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Execute queries
    const [tasks, totalCount] = await Promise.all([
      Task.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'name email'),
      Task.countDocuments(filter)
    ]);
    
    const totalPages = Math.ceil(totalCount / limit);
    
    res.status(StatusCodes.OK).json({
      tasks,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalCount,
        items_per_page: limit,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  })
);

/**
 * GET /api/tasks/:task_id - Get single task with ownership verification
 * @route GET /api/tasks/:task_id
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.get('/:task_id',
  validateRequest(Joi.object({ task_id: taskIdSchema }), 'params'),
  verifyTaskOwnership,
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.task._id)
      .populate('user_id', 'name email');
    
    res.status(StatusCodes.OK).json({ task });
  })
);

/**
 * POST /api/tasks - Create new task
 * @route POST /api/tasks
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.post('/',
  validateRequest(createTaskSchema),
  asyncHandler(async (req, res) => {
    const { title, description, priority, due_date } = req.body;
    const userId = req.user.id;
    
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
      taskData.due_date = new Date(due_date);
    }
    
    const task = new Task(taskData);
    await task.save();
    
    const populatedTask = await Task.findById(task._id)
      .populate('user_id', 'name email');
    
    res.status(StatusCodes.CREATED).json({ 
      task: populatedTask,
      message: 'Task created successfully'
    });
  })
);

/**
 * PUT /api/tasks/:task_id - Update task with ownership check
 * @route PUT /api/tasks/:task_id
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.put('/:task_id',
  validateRequest(Joi.object({ task_id: taskIdSchema }), 'params'),
  validateRequest(updateTaskSchema),
  verifyTaskOwnership,
  asyncHandler(async (req, res) => {
    const updateData = { ...req.body };
    
    // Prevent user_id modification
    delete updateData.user_id;
    delete updateData.created_at;
    delete updateData.deleted_at;
    
    updateData.updated_at = new Date();
    
    const updatedTask = await Task.findByIdAndUpdate(
      req.task._id,
      updateData,
      { new: true, runValidators: true }
    ).populate('user_id', 'name email');
    
    res.status(StatusCodes.OK).json({ 
      task: updatedTask,
      message: 'Task updated successfully'
    });
  })
);

/**
 * DELETE /api/tasks/:task_id - Soft delete with ownership verification
 * @route DELETE /api/tasks/:task_id
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.delete('/:task_id',
  validateRequest(Joi.object({ task_id: taskIdSchema }), 'params'),
  verifyTaskOwnership,
  asyncHandler(async (req, res) => {
    await Task.findByIdAndUpdate(req.task._id, {
      deleted_at: new Date(),
      updated_at: new Date()
    });
    
    res.status(StatusCodes.NO_CONTENT).send();
  })
);

/**
 * POST /api/tasks/:task_id/complete - Mark task completed
 * @route POST /api/tasks/:task_id/complete
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.post('/:task_id/complete',
  validateRequest(Joi.object({ task_id: taskIdSchema }), 'params'),
  verifyTaskOwnership,
  asyncHandler(async (req, res) => {
    if (req.task.status === 'completed') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Task Already Completed',
        message: 'This task is already marked as completed',
        statusCode: StatusCodes.BAD_REQUEST
      });
    }
    
    const completedTask = await Task.findByIdAndUpdate(
      req.task._id,
      {
        status: 'completed',
        completed_at: new Date(),
        updated_at: new Date()
      },
      { new: true, runValidators: true }
    ).populate('user_id', 'name email');
    
    res.status(StatusCodes.OK).json({ 
      task: completedTask,
      message: 'Task marked as completed successfully'
    });
  })
);

// Global error handler for this router
router.use((error, req, res, next) => {
  console.error('Task API Error:', error);
  
  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: 'Validation Error',
      message: error.message,
      statusCode: StatusCodes.BAD_REQUEST
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: 'Invalid ID Format',
      message: 'The provided ID is not in a valid format',
      statusCode: StatusCodes.BAD_REQUEST
    });
  }
  
  // Database connection errors
  if (error.name === 'MongoNetworkError' || error.name === 'MongooseServerSelectionError') {
    return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
      error: 'Database Connection Error',
      message: 'Unable to connect to the database. Please try again later.',
      statusCode: StatusCodes.SERVICE_UNAVAILABLE
    });
  }
  
  // Default error response
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred. Please try again later.',
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR
  });
});

module.exports = router;