# api.categories

REST API endpoints for category management.

Dependencies: fastapi, @models.category, @models.task, typing

Requirements:
- GET /api/categories
  - Return all categories with task_count
  - Order by name alphabetically
  - Include count of tasks per status

- GET /api/categories/{category_id}
  - Return single category with associated tasks
  - Include tasks grouped by status
  - 404 if category not found

- POST /api/categories
  - Required fields: name, color
  - Optional fields: description
  - Validate color is valid hex format
  - Ensure name uniqueness (case-insensitive)
  - Return created category with 201 status

- PUT /api/categories/{category_id}
  - Update category fields
  - Maintain name uniqueness
  - Return updated category

- DELETE /api/categories/{category_id}
  - Only allow if no tasks assigned
  - Return 409 Conflict if tasks exist
  - Return 204 No Content on success

Error Handling:
- 400 for invalid color format
- 409 for delete with existing tasks
- 422 for duplicate category name