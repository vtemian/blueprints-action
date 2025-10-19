/**
 * FastAPI Task Management API Module
 * Provides CRUD operations for user tasks with authentication and authorization
 */

import { FastAPI, APIRouter, HTTPException, Depends, Query, Path, Body, status } from 'fastapi-js';
import { Task, TaskCreate, TaskUpdate, TaskStatus, TaskPriority } from '@models/task';
import { getCurrentUser, User } from '@core/auth';
import { DatabaseSession, getDatabase } from '@core/database';
import { Optional, List } from 'typing';
import { DateTime } from 'datetime';
import { v4 as uuidv4, validate as validateUUID } from 'uuid';
import { Logger } from '@core/logging';

const logger = new Logger('api.tasks');
const router = new APIRouter();

// Request/Response Models
interface TaskListQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  due_before?: string; // ISO date string
  due_after?: string;  // ISO date string
  page?: number;
  limit?: number;
}

interface TaskResponse {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface TaskListResponse {
  tasks: TaskResponse[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

interface ErrorResponse {
  detail: string;
  error_code?: string;
  field_errors?: Record<string, string[]>;
}

interface TaskCreateRequest {
  title: string;
  description: string;
  priority?: TaskPriority;
  due_date?: string; // ISO date string
}

interface TaskUpdateRequest {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  due_date?: string;
  status?: TaskStatus;
}

// Utility Functions
function validateDateString(dateStr: string): Date {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return date;
  } catch (error) {
    throw new HTTPException(
      status.HTTP_422_UNPROCESSABLE_ENTITY,
      { detail: `Invalid date format: ${dateStr}. Expected ISO 8601 format.` }
    );
  }
}

function validateTaskId(taskId: string): void {
  if (!validateUUID(taskId)) {
    throw new HTTPException(
      status.HTTP_422_UNPROCESSABLE_ENTITY,
      { detail: 'Invalid task ID format. Expected UUID.' }
    );
  }
}

function validatePagination(page?: number, limit?: number): { page: number; limit: number } {
  const validatedPage = Math.max(1, page || 1);
  const validatedLimit = Math.min(100, Math.max(1, limit || 20));
  
  return { page: validatedPage, limit: validatedLimit };
}

async function getTaskByIdAndUser(
  taskId: string, 
  userId: string, 
  db: DatabaseSession
): Promise<Task> {
  try {
    const task = await db.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [taskId, userId]
    );
    
    if (!task || task.length === 0) {
      throw new HTTPException(
        status.HTTP_404_NOT_FOUND,
        { detail: 'Task not found or access denied' }
      );
    }
    
    return task[0];
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error(`Database error fetching task ${taskId}:`, error);
    throw new HTTPException(
      status.HTTP_500_INTERNAL_SERVER_ERROR,
      { detail: 'Internal server error' }
    );
  }
}

// Endpoints

/**
 * GET /api/tasks - List user's tasks with filtering and pagination
 * 
 * Example request: GET /api/tasks?status=pending&priority=high&page=1&limit=10
 * Example response: {
 *   "tasks": [...],
 *   "total": 25,
 *   "page": 1,
 *   "limit": 10,
 *   "total_pages": 3
 * }
 */
router.get('/api/tasks', {
  response_model: TaskListResponse,
  status_code: status.HTTP_200_OK
})
async function listTasks(
  status: Optional<TaskStatus> = Query(null, description="Filter by task status"),
  priority: Optional<TaskPriority> = Query(null, description="Filter by task priority"),
  due_before: Optional<string> = Query(null, description="Filter tasks due before this date (ISO format)"),
  due_after: Optional<string> = Query(null, description="Filter tasks due after this date (ISO format)"),
  page: Optional<number> = Query(1, ge=1, description="Page number"),
  limit: Optional<number> = Query(20, ge=1, le=100, description="Items per page (max 100)"),
  current_user: User = Depends(getCurrentUser),
  db: DatabaseSession = Depends(getDatabase)
): Promise<TaskListResponse> {
  
  logger.info(`Listing tasks for user ${current_user.id}`);
  
  try {
    // Validate pagination
    const { page: validPage, limit: validLimit } = validatePagination(page, limit);
    
    // Validate date filters
    let dueBefore: Date | null = null;
    let dueAfter: Date | null = null;
    
    if (due_before) {
      dueBefore = validateDateString(due_before);
    }
    
    if (due_after) {
      dueAfter = validateDateString(due_after);
    }
    
    // Build query conditions
    const conditions: string[] = ['user_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [current_user.id];
    let paramIndex = 2;
    
    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    
    if (priority) {
      conditions.push(`priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }
    
    if (dueBefore) {
      conditions.push(`due_date < $${paramIndex}`);
      params.push(dueBefore.toISOString());
      paramIndex++;
    }
    
    if (dueAfter) {
      conditions.push(`due_date > $${paramIndex}`);
      params.push(dueAfter.toISOString());
      paramIndex++;
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM tasks WHERE ${whereClause}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult[0].total);
    
    // Get paginated tasks
    const offset = (validPage - 1) * validLimit;
    const tasksQuery = `
      SELECT * FROM tasks 
      WHERE ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const tasks = await db.query(tasksQuery, [...params, validLimit, offset]);
    
    const totalPages = Math.ceil(total / validLimit);
    
    return {
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date?.toISOString(),
        completed_at: task.completed_at?.toISOString(),
        created_at: task.created_at.toISOString(),
        updated_at: task.updated_at.toISOString(),
        user_id: task.user_id
      })),
      total,
      page: validPage,
      limit: validLimit,
      total_pages: totalPages
    };
    
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Error listing tasks:', error);
    throw new HTTPException(
      status.HTTP_500_INTERNAL_SERVER_ERROR,
      { detail: 'Internal server error' }
    );
  }
}

/**
 * GET /api/tasks/{task_id} - Get single task by ID
 * 
 * Example request: GET /api/tasks/123e4567-e89b-12d3-a456-426614174000
 * Example response: {
 *   "id": "123e4567-e89b-12d3-a456-426614174000",
 *   "title": "Complete project",
 *   "description": "Finish the task management API",
 *   "status": "pending",
 *   "priority": "high",
 *   ...
 * }
 */
router.get('/api/tasks/{task_id}', {
  response_model: TaskResponse,
  status_code: status.HTTP_200_OK
})
async function getTask(
  task_id: string = Path(..., description="Task ID"),
  current_user: User = Depends(getCurrentUser),
  db: DatabaseSession = Depends(getDatabase)
): Promise<TaskResponse> {
  
  logger.info(`Getting task ${task_id} for user ${current_user.id}`);
  
  validateTaskId(task_id);
  
  const task = await getTaskByIdAndUser(task_id, current_user.id, db);
  
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date?.toISOString(),
    completed_at: task.completed_at?.toISOString(),
    created_at: task.created_at.toISOString(),
    updated_at: task.updated_at.toISOString(),
    user_id: task.user_id
  };
}

/**
 * POST /api/tasks - Create new task
 * 
 * Example request: {
 *   "title": "New task",
 *   "description": "Task description",
 *   "priority": "medium",
 *   "due_date": "2024-12-31T23:59:59Z"
 * }
 */
router.post('/api/tasks', {
  response_model: TaskResponse,
  status_code: status.HTTP_201_CREATED
})
async function createTask(
  task_data: TaskCreateRequest = Body(...),
  current_user: User = Depends(getCurrentUser),
  db: DatabaseSession = Depends(getDatabase)
): Promise<TaskResponse> {
  
  logger.info(`Creating task for user ${current_user.id}`);
  
  try {
    // Validate required fields
    if (!task_data.title?.trim()) {
      throw new HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        { 
          detail: 'Validation error',
          field_errors: { title: ['Title is required and cannot be empty'] }
        }
      );
    }
    
    if (!task_data.description?.trim()) {
      throw new HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        { 
          detail: 'Validation error',
          field_errors: { description: ['Description is required and cannot be empty'] }
        }
      );
    }
    
    // Validate title length
    if (task_data.title.length > 200) {
      throw new HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        { 
          detail: 'Validation error',
          field_errors: { title: ['Title must be 200 characters or less'] }
        }
      );
    }
    
    // Validate due date if provided
    let dueDate: Date | null = null;
    if (task_data.due_date) {
      dueDate = validateDateString(task_data.due_date);
      
      // Ensure due date is in the future
      if (dueDate <= new Date()) {
        throw new HTTPException(
          status.HTTP_422_UNPROCESSABLE_ENTITY,
          { 
            detail: 'Validation error',
            field_errors: { due_date: ['Due date must be in the future'] }
          }
        );
      }
    }
    
    const taskId = uuidv4();
    const now = new Date();
    
    const query = `
      INSERT INTO tasks (id, title, description, status, priority, due_date, user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const params = [
      taskId,
      task_data.title.trim(),
      task_data.description.trim(),
      TaskStatus.PENDING,
      task_data.priority || TaskPriority.MEDIUM,
      dueDate?.toISOString(),
      current_user.id,
      now.toISOString(),
      now.toISOString()
    ];
    
    const result = await db.query(query, params);
    const task = result[0];
    
    logger.info(`Task ${taskId} created successfully`);
    
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date?.toISOString(),
      completed_at: task.completed_at?.toISOString(),
      created_at: task.created_at.toISOString(),
      updated_at: task.updated_at.toISOString(),
      user_id: task.user_id
    };
    
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Error creating task:', error);
    throw new HTTPException(
      status.HTTP_500_INTERNAL_SERVER_ERROR,
      { detail: 'Internal server error' }
    );
  }
}

/**
 * PUT /api/tasks/{task_id} - Update existing task
 * 
 * Example request: {
 *   "title": "Updated task title",
 *   "status": "in_progress",
 *   "priority": "high"
 * }
 */
router.put('/api/tasks/{task_id}', {
  response_model: TaskResponse,
  status_code: status.HTTP_200_OK
})
async function updateTask(
  task_id: string = Path(..., description="Task ID"),
  task_data: TaskUpdateRequest = Body(...),
  current_user: User = Depends(getCurrentUser),
  db: DatabaseSession = Depends(getDatabase)
): Promise<TaskResponse> {
  
  logger.info(`Updating task ${task_id} for user ${current_user.id}`);
  
  validateTaskId(task_id);
  
  // Verify task exists and user owns it
  await getTaskByIdAndUser(task_id, current_user.id, db);
  
  try {
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex