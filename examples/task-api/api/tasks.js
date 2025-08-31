/**
 * Task Management API Module
 * Provides RESTful endpoints for task CRUD operations with authentication and authorization
 */

import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { Task } from '../models/task.js';
import { authenticateUser, getCurrentUser } from '../core/auth.js';
import { getDatabase } from '../core/database.js';

const router = express.Router();

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
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
    const currentUser = getCurrentUser(req);
    const db = getDatabase();
    
    const task = await Task.findById(db, taskId);
    
    if (!task) {
      return res.status(404).json({
        error: 'Task not found',
        message: 'The requested task does not exist'
      });
    }
    
    if (task.user_id !== currentUser.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this task'
      });
    }
    
    req.task = task;
    next();
  } catch (error) {
    console.error('Error verifying task ownership:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to verify task ownership'
    });
  }
};

/**
 * GET /api/tasks
 * List tasks with filtering and pagination
 */
router.get('/tasks',
  authenticateUser,
  [
    query('status')
      .optional()
      .isIn(['pending', 'in_progress', 'completed'])
      .withMessage('Status must be one of: pending, in_progress, completed'),
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
      .withMessage('due_after must be a valid ISO 8601 date'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const currentUser = getCurrentUser(req);
      const db = getDatabase();
      
      const {
        status,
        priority,
        due_before: dueBefore,
        due_after: dueAfter,
        page = 1,
        limit = 20
      } = req.query;
      
      const filters = {
        user_id: currentUser.id,
        deleted_at: null // Only non-deleted tasks
      };
      
      // Apply optional filters
      if (status) filters.status = status;
      if (priority) filters.priority = priority;
      if (dueBefore) filters.due_date = { ...filters.due_date, $lte: new Date(dueBefore) };
      if (dueAfter) filters.due_date = { ...filters.due_date, $gte: new Date(dueAfter) };
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      const [tasks, totalCount] = await Promise.all([
        Task.findMany(db, filters, {
          limit: parseInt(limit),
          offset,
          orderBy: { created_at: 'desc' }
        }),
        Task.count(db, filters)
      ]);
      
      const totalPages = Math.ceil(totalCount / parseInt(limit));
      
      res.json({
        tasks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total_count: totalCount,
          total_pages: totalPages,
          has_next: parseInt(page) < totalPages,
          has_prev: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve tasks'
      });
    }
  }
);

/**
 * GET /api/tasks/:taskId
 * Get a single task by ID
 */
router.get('/tasks/:taskId',
  authenticateUser,
  [
    param('taskId')
      .isUUID()
      .withMessage('Task ID must be a valid UUID')
  ],
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      res.json({ task: req.task });
    } catch (error) {
      console.error('Error fetching task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve task'
      });
    }
  }
);

/**
 * POST /api/tasks
 * Create a new task
 */
router.post('/tasks',
  authenticateUser,
  [
    body('title')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title is required and must be between 1 and 200 characters'),
    body('description')
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Description is required and must be between 1 and 2000 characters'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent'),
    body('due_date')
      .optional()
      .isISO8601()
      .withMessage('Due date must be a valid ISO 8601 date')
      .custom((value) => {
        if (value && new Date(value) <= new Date()) {
          throw new Error('Due date must be in the future');
        }
        return true;
      })
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const currentUser = getCurrentUser(req);
      const db = getDatabase();
      
      const { title, description, priority = 'medium', due_date: dueDate } = req.body;
      
      const taskData = {
        title,
        description,
        priority,
        status: 'pending',
        user_id: currentUser.id,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      if (dueDate) {
        taskData.due_date = new Date(dueDate);
      }
      
      const task = await Task.create(db, taskData);
      
      res.status(201).json({
        message: 'Task created successfully',
        task
      });
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create task'
      });
    }
  }
);

/**
 * PUT /api/tasks/:taskId
 * Update an existing task
 */
router.put('/tasks/:taskId',
  authenticateUser,
  [
    param('taskId')
      .isUUID()
      .withMessage('Task ID must be a valid UUID'),
    body('title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Description must be between 1 and 2000 characters'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent'),
    body('status')
      .optional()
      .isIn(['pending', 'in_progress', 'completed'])
      .withMessage('Status must be one of: pending, in_progress, completed'),
    body('due_date')
      .optional()
      .isISO8601()
      .withMessage('Due date must be a valid ISO 8601 date'),
    body('user_id')
      .not()
      .exists()
      .withMessage('User ID cannot be modified')
  ],
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      const db = getDatabase();
      const { taskId } = req.params;
      
      // Extract only allowed fields for update
      const allowedFields = ['title', 'description', 'priority', 'status', 'due_date'];
      const updateData = {};
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = field === 'due_date' ? new Date(req.body[field]) : req.body[field];
        }
      });
      
      // Add completion timestamp if status is being set to completed
      if (updateData.status === 'completed' && req.task.status !== 'completed') {
        updateData.completed_at = new Date();
      }
      
      updateData.updated_at = new Date();
      
      const updatedTask = await Task.update(db, taskId, updateData);
      
      res.json({
        message: 'Task updated successfully',
        task: updatedTask
      });
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update task'
      });
    }
  }
);

/**
 * DELETE /api/tasks/:taskId
 * Soft delete a task
 */
router.delete('/tasks/:taskId',
  authenticateUser,
  [
    param('taskId')
      .isUUID()
      .withMessage('Task ID must be a valid UUID')
  ],
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      const db = getDatabase();
      const { taskId } = req.params;
      
      await Task.softDelete(db, taskId, {
        deleted_at: new Date(),
        updated_at: new Date()
      });
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete task'
      });
    }
  }
);

/**
 * POST /api/tasks/:taskId/complete
 * Mark a task as completed
 */
router.post('/tasks/:taskId/complete',
  authenticateUser,
  [
    param('taskId')
      .isUUID()
      .withMessage('Task ID must be a valid UUID')
  ],
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      const db = getDatabase();
      const { taskId } = req.params;
      
      // Check if task is already completed
      if (req.task.status === 'completed') {
        return res.status(400).json({
          error: 'Task already completed',
          message: 'This task has already been marked as completed'
        });
      }
      
      const completedTask = await Task.update(db, taskId, {
        status: 'completed',
        completed_at: new Date(),
        updated_at: new Date()
      });
      
      res.json({
        message: 'Task marked as completed successfully',
        task: completedTask
      });
    } catch (error) {
      console.error('Error completing task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to complete task'
      });
    }
  }
);

/**
 * Global error handler for unhandled promise rejections
 */
router.use((error, req, res, next) => {
  console.error('Unhandled error in tasks API:', error);
  
  if (res.headersSent) {
    return next(error);
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

export default router;