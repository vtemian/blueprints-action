/**
 * Task Management API Module
 * Implements CRUD operations for tasks with authentication and authorization
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import Task from '../models/Task.js';
import { authenticateToken } from '../middleware/auth.js';
import { DatabaseError } from '../utils/errors.js';
import { isValidDate, parseISO } from 'date-fns';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * Middleware to validate request and return errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
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

    const task = await Task.findByIdAndUser(taskId, userId);
    
    if (!task || task.deleted_at) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    req.task = task;
    next();
  } catch (error) {
    console.error('Error verifying task ownership:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
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
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description must be between 1 and 1000 characters'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Priority must be one of: low, medium, high'),
  body('due_date')
    .optional()
    .custom((value) => {
      if (value && !isValidDate(parseISO(value))) {
        throw new Error('Due date must be a valid ISO date string');
      }
      return true;
    })
];

/**
 * Validation rules for task updates
 */
const updateTaskValidation = [
  param('taskId')
    .isInt({ min: 1 })
    .withMessage('Task ID must be a valid positive integer'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description must be between 1 and 1000 characters'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Priority must be one of: low, medium, high'),
  body('due_date')
    .optional()
    .custom((value) => {
      if (value && !isValidDate(parseISO(value))) {
        throw new Error('Due date must be a valid ISO date string');
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
    .isIn(['pending', 'completed'])
    .withMessage('Status must be either pending or completed'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Priority must be one of: low, medium, high'),
  query('due_before')
    .optional()
    .custom((value) => {
      if (value && !isValidDate(parseISO(value))) {
        throw new Error('due_before must be a valid ISO date string');
      }
      return true;
    }),
  query('due_after')
    .optional()
    .custom((value) => {
      if (value && !isValidDate(parseISO(value))) {
        throw new Error('due_after must be a valid ISO date string');
      }
      return true;
    })
];

/**
 * GET /api/tasks - List user's tasks with filtering and pagination
 */
router.get('/', listTasksValidation, handleValidationErrors, async (req, res) => {
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

    const filters = {
      user_id: userId,
      deleted_at: null
    };

    // Apply filters
    if (status) {
      if (status === 'completed') {
        filters.completed_at = { $ne: null };
      } else {
        filters.completed_at = null;
      }
    }

    if (priority) {
      filters.priority = priority;
    }

    if (due_before || due_after) {
      filters.due_date = {};
      if (due_before) {
        filters.due_date.$lt = parseISO(due_before);
      }
      if (due_after) {
        filters.due_date.$gt = parseISO(due_after);
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const [tasks, totalCount] = await Promise.all([
      Task.findWithFilters(filters, {
        limit: parseInt(limit),
        offset,
        orderBy: 'created_at DESC'
      }),
      Task.countWithFilters(filters)
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        tasks: tasks.map(task => task.toJSON()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tasks'
    });
  }
});

/**
 * GET /api/tasks/:taskId - Get single task with ownership verification
 */
router.get('/:taskId', 
  param('taskId').isInt({ min: 1 }).withMessage('Task ID must be a valid positive integer'),
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      res.status(200).json({
        success: true,
        data: {
          task: req.task.toJSON()
        }
      });
    } catch (error) {
      console.error('Error fetching task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch task'
      });
    }
  }
);

/**
 * POST /api/tasks - Create new task
 */
router.post('/', createTaskValidation, handleValidationErrors, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, priority, due_date } = req.body;

    const taskData = {
      title: title.trim(),
      description: description.trim(),
      user_id: userId,
      priority: priority || 'medium',
      due_date: due_date ? parseISO(due_date) : null,
      created_at: new Date(),
      updated_at: new Date()
    };

    const task = await Task.create(taskData);

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: {
        task: task.toJSON()
      }
    });
  } catch (error) {
    console.error('Error creating task:', error);
    
    if (error instanceof DatabaseError) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create task'
    });
  }
});

/**
 * PUT /api/tasks/:taskId - Update task with ownership verification
 */
router.put('/:taskId', 
  updateTaskValidation, 
  handleValidationErrors, 
  verifyTaskOwnership, 
  async (req, res) => {
    try {
      const { title, description, priority, due_date } = req.body;
      const updateData = {
        updated_at: new Date()
      };

      // Only update provided fields
      if (title !== undefined) {
        updateData.title = title.trim();
      }
      if (description !== undefined) {
        updateData.description = description.trim();
      }
      if (priority !== undefined) {
        updateData.priority = priority;
      }
      if (due_date !== undefined) {
        updateData.due_date = due_date ? parseISO(due_date) : null;
      }

      const updatedTask = await Task.updateById(req.task.id, updateData);

      res.status(200).json({
        success: true,
        message: 'Task updated successfully',
        data: {
          task: updatedTask.toJSON()
        }
      });
    } catch (error) {
      console.error('Error updating task:', error);
      
      if (error instanceof DatabaseError) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update task'
      });
    }
  }
);

/**
 * DELETE /api/tasks/:taskId - Soft delete task with ownership verification
 */
router.delete('/:taskId',
  param('taskId').isInt({ min: 1 }).withMessage('Task ID must be a valid positive integer'),
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      await Task.softDelete(req.task.id);

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete task'
      });
    }
  }
);

/**
 * POST /api/tasks/:taskId/complete - Mark task as completed
 */
router.post('/:taskId/complete',
  param('taskId').isInt({ min: 1 }).withMessage('Task ID must be a valid positive integer'),
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      // Check if task is already completed
      if (req.task.completed_at) {
        return res.status(400).json({
          success: false,
          message: 'Task is already completed'
        });
      }

      const updatedTask = await Task.updateById(req.task.id, {
        completed_at: new Date(),
        updated_at: new Date()
      });

      res.status(200).json({
        success: true,
        message: 'Task marked as completed',
        data: {
          task: updatedTask.toJSON()
        }
      });
    } catch (error) {
      console.error('Error completing task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete task'
      });
    }
  }
);

export default router;