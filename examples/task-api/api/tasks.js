/**
 * Task Management API Module
 * Provides RESTful endpoints for task CRUD operations
 * @module api/tasks
 */

import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { Task } from '../models/task.js';
import { requireAuth, getCurrentUser } from '../core/auth.js';
import { db } from '../core/database.js';
import logger from '../core/logger.js';

const router = express.Router();

/**
 * Validation middleware to check for validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
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
    const taskId = req.params.task_id;
    const userId = req.user.id;

    const task = await Task.findById(taskId);
    
    if (!task) {
      return res.status(404).json({
        error: 'Task not found',
        message: 'The requested task does not exist'
      });
    }

    if (task.user_id !== userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this task'
      });
    }

    req.task = task;
    next();
  } catch (error) {
    logger.error('Error verifying task ownership:', error);
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
  requireAuth,
  [
    query('status').optional().isIn(['pending', 'in_progress', 'completed', 'cancelled'])
      .withMessage('Status must be one of: pending, in_progress, completed, cancelled'),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent'),
    query('due_before').optional().isISO8601()
      .withMessage('due_before must be a valid ISO 8601 date'),
    query('due_after').optional().isISO8601()
      .withMessage('due_after must be a valid ISO 8601 date'),
    query('page').optional().isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const {
        status,
        priority,
        due_before: dueBefore,
        due_after: dueAfter,
        page = 1,
        limit = 20
      } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Build dynamic query
      let whereClause = 'WHERE t.user_id = ? AND t.deleted_at IS NULL';
      const queryParams = [userId];

      if (status) {
        whereClause += ' AND t.status = ?';
        queryParams.push(status);
      }

      if (priority) {
        whereClause += ' AND t.priority = ?';
        queryParams.push(priority);
      }

      if (dueBefore) {
        whereClause += ' AND t.due_date <= ?';
        queryParams.push(dueBefore);
      }

      if (dueAfter) {
        whereClause += ' AND t.due_date >= ?';
        queryParams.push(dueAfter);
      }

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM tasks t 
        ${whereClause}
      `;
      
      const countResult = await db.query(countQuery, queryParams);
      const total = countResult[0].total;

      // Get tasks with user info
      const tasksQuery = `
        SELECT 
          t.id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.due_date,
          t.completed_at,
          t.created_at,
          t.updated_at,
          u.id as user_id,
          u.username,
          u.email
        FROM tasks t
        JOIN users u ON t.user_id = u.id
        ${whereClause}
        ORDER BY t.created_at DESC
        LIMIT ? OFFSET ?
      `;

      queryParams.push(parseInt(limit), offset);
      const tasks = await db.query(tasksQuery, queryParams);

      // Format response
      const formattedTasks = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        completed_at: task.completed_at,
        created_at: task.created_at,
        updated_at: task.updated_at,
        user: {
          id: task.user_id,
          username: task.username,
          email: task.email
        }
      }));

      const totalPages = Math.ceil(total / parseInt(limit));

      res.json({
        tasks: formattedTasks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      });

    } catch (error) {
      logger.error('Error fetching tasks:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch tasks'
      });
    }
  }
);

/**
 * GET /api/tasks/:task_id
 * Get single task by ID
 */
router.get('/tasks/:task_id',
  requireAuth,
  [
    param('task_id').isUUID().withMessage('Task ID must be a valid UUID')
  ],
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    try {
      const task = req.task;

      // Get task with user info
      const query = `
        SELECT 
          t.id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.due_date,
          t.completed_at,
          t.created_at,
          t.updated_at,
          u.id as user_id,
          u.username,
          u.email
        FROM tasks t
        JOIN users u ON t.user_id = u.id
        WHERE t.id = ? AND t.deleted_at IS NULL
      `;

      const result = await db.query(query, [task.id]);
      
      if (result.length === 0) {
        return res.status(404).json({
          error: 'Task not found',
          message: 'The requested task does not exist'
        });
      }

      const taskData = result[0];

      res.json({
        id: taskData.id,
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        priority: taskData.priority,
        due_date: taskData.due_date,
        completed_at: taskData.completed_at,
        created_at: taskData.created_at,
        updated_at: taskData.updated_at,
        user: {
          id: taskData.user_id,
          username: taskData.username,
          email: taskData.email
        }
      });

    } catch (error) {
      logger.error('Error fetching task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch task'
      });
    }
  }
);

/**
 * POST /api/tasks
 * Create a new task
 */
router.post('/tasks',
  requireAuth,
  [
    body('title').trim().notEmpty().isLength({ min: 1, max: 255 })
      .withMessage('Title is required and must be between 1 and 255 characters'),
    body('description').trim().notEmpty().isLength({ min: 1, max: 2000 })
      .withMessage('Description is required and must be between 1 and 2000 characters'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent'),
    body('due_date').optional().isISO8601()
      .withMessage('Due date must be a valid ISO 8601 date')
  ],
  handleValidationErrors,
  async (req, res) => {
    const transaction = await db.beginTransaction();
    
    try {
      const userId = req.user.id;
      const { title, description, priority = 'medium', due_date } = req.body;

      // Validate due_date is not in the past
      if (due_date && new Date(due_date) < new Date()) {
        return res.status(422).json({
          error: 'Validation failed',
          message: 'Due date cannot be in the past'
        });
      }

      const taskId = crypto.randomUUID();
      const now = new Date().toISOString();

      const query = `
        INSERT INTO tasks (
          id, user_id, title, description, status, priority, due_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
      `;

      await db.query(query, [
        taskId,
        userId,
        title,
        description,
        priority,
        due_date || null,
        now,
        now
      ], { transaction });

      await transaction.commit();

      // Fetch the created task with user info
      const createdTaskQuery = `
        SELECT 
          t.id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.due_date,
          t.completed_at,
          t.created_at,
          t.updated_at,
          u.id as user_id,
          u.username,
          u.email
        FROM tasks t
        JOIN users u ON t.user_id = u.id
        WHERE t.id = ?
      `;

      const createdTask = await db.query(createdTaskQuery, [taskId]);
      const taskData = createdTask[0];

      logger.info(`Task created successfully: ${taskId} by user: ${userId}`);

      res.status(201).json({
        id: taskData.id,
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        priority: taskData.priority,
        due_date: taskData.due_date,
        completed_at: taskData.completed_at,
        created_at: taskData.created_at,
        updated_at: taskData.updated_at,
        user: {
          id: taskData.user_id,
          username: taskData.username,
          email: taskData.email
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create task'
      });
    }
  }
);

/**
 * PUT /api/tasks/:task_id
 * Update an existing task
 */
router.put('/tasks/:task_id',
  requireAuth,
  [
    param('task_id').isUUID().withMessage('Task ID must be a valid UUID'),
    body('title').optional().trim().isLength({ min: 1, max: 255 })
      .withMessage('Title must be between 1 and 255 characters'),
    body('description').optional().trim().isLength({ min: 1, max: 2000 })
      .withMessage('Description must be between 1 and 2000 characters'),
    body('status').optional().isIn(['pending', 'in_progress', 'completed', 'cancelled'])
      .withMessage('Status must be one of: pending, in_progress, completed, cancelled'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent'),
    body('due_date').optional().isISO8601()
      .withMessage('Due date must be a valid ISO 8601 date'),
    body('user_id').not().exists()
      .withMessage('User ID cannot be modified')
  ],
  handleValidationErrors,
  verifyTaskOwnership,
  async (req, res) => {
    const transaction = await db.beginTransaction();
    
    try {
      const taskId = req.params.task_id;
      const { title, description, status, priority, due_date } = req.body;

      // Validate due_date is not in the past (if provided)
      if (due_date && new Date(due_date) < new Date()) {
        return res.status(422).json({
          error: 'Validation failed',
          message: 'Due date cannot be in the past'
        });
      }

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [];

      if (title !== undefined) {
        updateFields.push('title = ?');
        updateValues.push(title);
      }

      if (description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(description);
      }

      if (status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(status);
        
        // Set completed_at when status changes to completed
        if (status === 'completed') {
          updateFields.push('completed_at = ?');
          updateValues.push(new Date().toISOString());
        } else if (req.task.status === 'completed' && status !== 'completed') {
          // Clear completed_at if moving away from completed status
          updateFields.push('completed_at = NULL');
        }
      }

      if (priority !== undefined) {
        updateFields.push('priority = ?');
        updateValues.push(priority);
      }

      if (due_date !== undefined) {
        updateFields.push('due_date = ?');
        updateValues.push(due_date);
      }

      if (updateFields.length === 0) {
        return res.status(422).json({
          error: 'Validation failed',
          message: 'At least one field must be provided for update'
        });
      }

      updateFields.push('updated_at = ?');
      updateValues.push(new Date().toISOString());
      updateValues.push(taskId);

      const updateQuery = `
        UPDATE tasks 
        SET ${updateFields.join(', ')} 
        WHERE id = ? AND deleted_at IS NULL
      `;

      await db.query(updateQuery, updateValues, { transaction });
      await transaction.commit();

      //