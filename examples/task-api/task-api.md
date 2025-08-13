# Task Management API

Build a RESTful API for managing tasks with categories, due dates, and priority levels.

## Core Requirements

### Data Models

**Task**
- id: unique identifier
- title: string (required, max 200 chars)
- description: text (optional)
- status: enum (pending, in_progress, completed, cancelled)
- priority: enum (low, medium, high, urgent)
- category_id: foreign key to Category
- due_date: datetime (optional)
- created_at: datetime
- updated_at: datetime
- completed_at: datetime (nullable)

**Category**
- id: unique identifier
- name: string (required, unique, max 50 chars)
- color: string (hex color code)
- description: text (optional)
- created_at: datetime

## API Endpoints

### Tasks

**GET /api/tasks**
- Query parameters:
  - status: filter by status
  - priority: filter by priority
  - category_id: filter by category
  - due_before: filter tasks due before date
  - due_after: filter tasks due after date
  - sort: sort by field (created_at, due_date, priority)
  - order: asc or desc
  - page: pagination page number
  - limit: items per page (max 100)
- Returns: paginated list of tasks with category details

**GET /api/tasks/:id**
- Returns: single task with full details

**POST /api/tasks**
- Body: task creation data
- Validation: title required, valid category_id if provided
- Returns: created task

**PUT /api/tasks/:id**
- Body: task update data
- Validation: cannot change completed_at directly
- Returns: updated task

**DELETE /api/tasks/:id**
- Soft delete or move to trash
- Returns: success message

**POST /api/tasks/:id/complete**
- Mark task as completed
- Sets completed_at timestamp
- Returns: updated task

**POST /api/tasks/:id/reopen**
- Reopen completed task
- Clears completed_at
- Returns: updated task

### Categories

**GET /api/categories**
- Returns: list of all categories with task count

**GET /api/categories/:id**
- Returns: single category with tasks

**POST /api/categories**
- Body: category creation data
- Validation: unique name required
- Returns: created category

**PUT /api/categories/:id**
- Body: category update data
- Returns: updated category

**DELETE /api/categories/:id**
- Only if no tasks assigned
- Returns: success message

### Statistics

**GET /api/stats/overview**
- Returns:
  - Total tasks by status
  - Tasks by priority
  - Overdue tasks count
  - Tasks completed today/week/month
  - Average completion time

**GET /api/stats/categories**
- Returns task distribution across categories

## Technical Requirements

- Input validation on all endpoints
- Proper HTTP status codes
- JSON request/response format
- Error handling with meaningful messages
- Request logging
- Basic rate limiting (optional)
- CORS support for web clients

## Database

Use appropriate database for the language:
- Python: SQLite with SQLAlchemy
- Node.js: SQLite with Sequelize or Prisma
- Go: SQLite with GORM or sqlx
- Others: appropriate embedded database

## Testing

Include basic tests for:
- CRUD operations
- Validation rules
- Edge cases (non-existent IDs, invalid data)
- Status transitions