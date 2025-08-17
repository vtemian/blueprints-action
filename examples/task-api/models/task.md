# models.task

Task model definition.

Dependencies: sqlalchemy, @core.database, datetime, uuid

Requirements:

## Task Model
Fields:
- id: UUID primary key
- title: String(200), required
- description: Text, optional
- status: Enum (pending, in_progress, completed)
- priority: Enum (low, medium, high)
- user_id: Foreign key to User
- due_date: DateTime, optional
- completed_at: DateTime, nullable
- created_at: DateTime, auto
- updated_at: DateTime, auto-update

## Relationships
- Belongs to User (many-to-one)
- User can have many tasks

## Methods
- mark_complete(): Set status and completed_at
- is_overdue(): Check if past due date

## Database
- Table name: "tasks"
- Indexes: user_id, status, due_date