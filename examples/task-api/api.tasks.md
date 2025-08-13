# api.tasks

REST API endpoints for task management.

Dependencies: fastapi, @models.task, @models.category, @services.validation, typing, datetime

Requirements:
- GET /api/tasks
  - Query parameters: status, priority, category_id, due_before, due_after, sort, order, page, limit
  - Return paginated list with category details included
  - Support sorting by created_at, due_date, priority
  - Max 100 items per page

- GET /api/tasks/{task_id}
  - Return single task with full details
  - Include category information
  - 404 if task not found

- POST /api/tasks
  - Required fields: title
  - Optional fields: description, priority, category_id, due_date
  - Validate category_id exists if provided
  - Return created task with 201 status

- PUT /api/tasks/{task_id}
  - Update any task fields except id, created_at
  - Cannot directly modify completed_at (use complete/reopen endpoints)
  - Validate all inputs
  - Return updated task

- DELETE /api/tasks/{task_id}
  - Soft delete (set deleted_at timestamp)
  - Return 204 No Content on success

- POST /api/tasks/{task_id}/complete
  - Mark task as completed
  - Set completed_at to current timestamp
  - Return updated task

- POST /api/tasks/{task_id}/reopen
  - Reopen completed task
  - Clear completed_at, set status to pending
  - Return updated task

Error Handling:
- 400 for validation errors with detailed messages
- 404 for non-existent resources
- 422 for business logic violations