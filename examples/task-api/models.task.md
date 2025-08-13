# models.task

Task model for the task management system.

Dependencies: sqlalchemy, datetime, typing

Requirements:
- Task table with fields:
  - id: unique identifier (UUID or auto-increment)
  - title: string, required, max 200 chars
  - description: text, optional
  - status: enum (pending, in_progress, completed, cancelled)
  - priority: enum (low, medium, high, urgent)
  - category_id: foreign key to Category model
  - due_date: datetime, optional
  - created_at: datetime, auto-set
  - updated_at: datetime, auto-update
  - completed_at: datetime, nullable

- Model methods:
  - mark_complete(): Set status to completed and completed_at to now
  - reopen(): Set status to pending and clear completed_at
  - is_overdue(): Check if due_date has passed and not completed
  - update_priority(new_priority): Change priority with validation

- Validations:
  - Title is required and non-empty
  - Status transitions must be valid (can't go from cancelled to completed)
  - Due date must be in the future when creating
  - Priority must be valid enum value

- Relationships:
  - Belongs to one Category (optional)
  - Has many audit logs (for tracking changes)