# api.tasks

Task management API endpoints.

Dependencies: fastapi, @models.task, @core.auth, @core.database, typing, datetime

Requirements:

## Endpoints

### GET /api/tasks
- List all tasks for authenticated user
- Query parameters: status, priority, due_before, due_after
- Pagination: page, limit (max 100)
- Return tasks with user info

### GET /api/tasks/{task_id}
- Get single task by ID
- Verify user owns the task
- Return 404 if not found or not authorized

### POST /api/tasks
- Create new task for authenticated user
- Required: title, description
- Optional: priority, due_date
- Return created task with 201

### PUT /api/tasks/{task_id}
- Update existing task
- Verify ownership
- Cannot change user_id
- Return updated task

### DELETE /api/tasks/{task_id}
- Soft delete task
- Verify ownership
- Return 204 No Content

### POST /api/tasks/{task_id}/complete
- Mark task as completed
- Set completed_at timestamp
- Return updated task

## Security
- All endpoints require authentication
- Users can only access their own tasks
- Use dependency injection for current user