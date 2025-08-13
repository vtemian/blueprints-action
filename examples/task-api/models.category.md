# models.category

Category model for organizing tasks.

Dependencies: sqlalchemy, typing

Requirements:
- Category table with fields:
  - id: unique identifier
  - name: string, required, unique, max 50 chars
  - color: string, hex color code (#RRGGBB format)
  - description: text, optional
  - task_count: computed field (count of associated tasks)
  - created_at: datetime

- Model methods:
  - get_task_count(): Return number of tasks in this category
  - get_tasks_by_status(status): Get tasks filtered by status
  - can_delete(): Check if category has no tasks

- Validations:
  - Name must be unique (case-insensitive)
  - Color must be valid hex format
  - Cannot delete category with existing tasks

- Relationships:
  - Has many Tasks