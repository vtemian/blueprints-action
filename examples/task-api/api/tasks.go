I'll create a production-ready Task management API in Go with proper structure, error handling, and security. Here's the complete implementation:

## Project Structure
```
api/
├── tasks/
│   ├── handlers.go
│   ├── models.go
│   ├── repository.go
│   ├── service.go
│   └── errors.go
├── middleware/
│   └── auth.go
└── main.go
```

## 1. Task Models and DTOs (`api/tasks/models.go`)

```go
package tasks

import (
	"time"
)

// Task represents the main task entity
type Task struct {
	ID          int        `json:"id" db:"id"`
	UserID      int        `json:"user_id" db:"user_id"`
	Title       string     `json:"title" db:"title"`
	Description string     `json:"description" db:"description"`
	Status      string     `json:"status" db:"status"`
	Priority    string     `json:"priority" db:"priority"`
	DueDate     *time.Time `json:"due_date,omitempty" db:"due_date"`
	CompletedAt *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt   *time.Time `json:"-" db:"deleted_at"`
}

// CreateTaskRequest represents the request payload for creating a task
type CreateTaskRequest struct {
	Title       string     `json:"title" validate:"required,min=1,max=255"`
	Description string     `json:"description" validate:"required,min=1,max=1000"`
	Priority    string     `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
}

// UpdateTaskRequest represents the request payload for updating a task
type UpdateTaskRequest struct {
	Title       *string    `json:"title,omitempty" validate:"omitempty,min=1,max=255"`
	Description *string    `json:"description,omitempty" validate:"omitempty,min=1,max=1000"`
	Status      *string    `json:"status,omitempty" validate:"omitempty,oneof=pending in_progress completed"`
	Priority    *string    `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	UserID      *int       `json:"user_id,omitempty"` // This will be ignored in updates
}

// TaskListQuery represents query parameters for listing tasks
type TaskListQuery struct {
	Status    string     `json:"status,omitempty" validate:"omitempty,oneof=pending in_progress completed"`
	Priority  string     `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueBefore *time.Time `json:"due_before,omitempty"`
	DueAfter  *time.Time `json:"due_after,omitempty"`
	Page      int        `json:"page" validate:"min=1"`
	Limit     int        `json:"limit" validate:"min=1,max=100"`
}

// TaskListResponse represents the paginated response for task listing
type TaskListResponse struct {
	Tasks      []Task           `json:"tasks"`
	Pagination PaginationMeta   `json:"pagination"`
}

// PaginationMeta contains pagination metadata
type PaginationMeta struct {
	Page       int `json:"page"`
	Limit      int `json:"limit"`
	Total      int `json:"total"`
	TotalPages int `json:"total_pages"`
}

// ErrorResponse represents a standard error response
type ErrorResponse struct {
	Error   string            `json:"error"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

// User represents the authenticated user context
type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}
```

## 2. Custom Errors (`api/tasks/errors.go`)

```go
package tasks

import (
	"fmt"
	"net/http"
)

// Custom error types
type AppError struct {
	Type    string
	Message string
	Code    int
	Details map[string]string
}

func (e *AppError) Error() string {
	return e.Message
}

// Error constructors
func NewNotFoundError(resource string, id interface{}) *AppError {
	return &AppError{
		Type:    "NOT_FOUND",
		Message: fmt.Sprintf("%s with id %v not found", resource, id),
		Code:    http.StatusNotFound,
	}
}

func NewForbiddenError(message string) *AppError {
	return &AppError{
		Type:    "FORBIDDEN",
		Message: message,
		Code:    http.StatusForbidden,
	}
}

func NewValidationError(message string, details map[string]string) *AppError {
	return &AppError{
		Type:    "VALIDATION_ERROR",
		Message: message,
		Code:    http.StatusBadRequest,
		Details: details,
	}
}

func NewUnauthorizedError(message string) *AppError {
	return &AppError{
		Type:    "UNAUTHORIZED",
		Message: message,
		Code:    http.StatusUnauthorized,
	}
}

func NewInternalError(message string) *AppError {
	return &AppError{
		Type:    "INTERNAL_ERROR",
		Message: message,
		Code:    http.StatusInternalServerError,
	}
}
```

## 3. Repository Interface (`api/tasks/repository.go`)

```go
package tasks

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/lib/pq" // PostgreSQL driver
)

// TaskRepository defines the interface for task data operations
type TaskRepository interface {
	Create(ctx context.Context, task *Task) (*Task, error)
	GetByID(ctx context.Context, id int) (*Task, error)
	Update(ctx context.Context, task *Task) (*Task, error)
	Delete(ctx context.Context, id int) error
	List(ctx context.Context, userID int, query TaskListQuery) ([]Task, int, error)
	MarkCompleted(ctx context.Context, id int, completedAt time.Time) error
}

// PostgreSQLTaskRepository implements TaskRepository for PostgreSQL
type PostgreSQLTaskRepository struct {
	db *sql.DB
}

// NewPostgreSQLTaskRepository creates a new PostgreSQL task repository
func NewPostgreSQLTaskRepository(db *sql.DB) *PostgreSQLTaskRepository {
	return &PostgreSQLTaskRepository{db: db}
}

// Create inserts a new task into the database
func (r *PostgreSQLTaskRepository) Create(ctx context.Context, task *Task) (*Task, error) {
	query := `
		INSERT INTO tasks (user_id, title, description, status, priority, due_date, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, updated_at`

	now := time.Now()
	task.CreatedAt = now
	task.UpdatedAt = now
	task.Status = "pending" // Default status

	err := r.db.QueryRowContext(ctx, query,
		task.UserID, task.Title, task.Description, task.Status,
		task.Priority, task.DueDate, task.CreatedAt, task.UpdatedAt,
	).Scan(&task.ID, &task.CreatedAt, &task.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	return task, nil
}

// GetByID retrieves a task by its ID
func (r *PostgreSQLTaskRepository) GetByID(ctx context.Context, id int) (*Task, error) {
	query := `
		SELECT id, user_id, title, description, status, priority, due_date, 
		       completed_at, created_at, updated_at
		FROM tasks 
		WHERE id = $1 AND deleted_at IS NULL`

	task := &Task{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&task.ID, &task.UserID, &task.Title, &task.Description,
		&task.Status, &task.Priority, &task.DueDate, &task.CompletedAt,
		&task.CreatedAt, &task.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, NewNotFoundError("Task", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get task: %w", err)
	}

	return task, nil
}

// Update modifies an existing task
func (r *PostgreSQLTaskRepository) Update(ctx context.Context, task *Task) (*Task, error) {
	query := `
		UPDATE tasks 
		SET title = $1, description = $2, status = $3, priority = $4, 
		    due_date = $5, updated_at = $6
		WHERE id = $7 AND deleted_at IS NULL
		RETURNING updated_at`

	task.UpdatedAt = time.Now()

	err := r.db.QueryRowContext(ctx, query,
		task.Title, task.Description, task.Status, task.Priority,
		task.DueDate, task.UpdatedAt, task.ID,
	).Scan(&task.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, NewNotFoundError("Task", task.ID)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update task: %w", err)
	}

	return task, nil
}

// Delete soft deletes a task
func (r *PostgreSQLTaskRepository) Delete(ctx context.Context, id int) error {
	query := `UPDATE tasks SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL`

	result, err := r.db.ExecContext(ctx, query, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to delete task: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if rowsAffected == 0 {
		return NewNotFoundError("Task", id)
	}

	return nil
}

// List retrieves tasks with filtering and pagination
func (r *PostgreSQLTaskRepository) List(ctx context.Context, userID int, query TaskListQuery) ([]Task, int, error) {
	// Build WHERE clause
	whereConditions := []string{"user_id = $1", "deleted_at IS NULL"}
	args := []interface{}{userID}
	argIndex := 2

	if query.Status != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("status = $%d", argIndex))
		args = append(args, query.Status)
		argIndex++
	}

	if query.Priority != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("priority = $%d", argIndex))
		args = append(args, query.Priority)
		argIndex++
	}

	if query.DueBefore != nil {
		whereConditions = append(whereConditions, fmt.Sprintf("due_date < $%d", argIndex))
		args = append(args, *query.DueBefore)
		argIndex++
	}

	if query.DueAfter != nil {
		whereConditions = append(whereConditions, fmt.Sprintf("due_date > $%d", argIndex))
		args = append(args, *query.DueAfter)
		argIndex++
	}

	whereClause := strings.Join(whereConditions, " AND ")

	// Count total records
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM tasks WHERE %s", whereClause)
	var total int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count tasks: %w", err)
	}

	// Get paginated results
	offset := (query.Page - 1) * query.Limit
	listQuery := fmt.Sprintf(`
		SELECT id, user_id, title, description, status, priority, due_date, 
		       completed_at, created_at, updated_at
		FROM tasks 
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d`, whereClause, argIndex, argIndex+1)

	args = append(args, query.Limit, offset)

	rows, err := r.db.QueryContext(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list tasks: %w", err)
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		var task Task
		err := rows.Scan(
			&task.ID, &task.UserID, &task.Title, &task.Description,
			&task.Status, &task.Priority, &task.DueDate, &task.CompletedAt,
			&task.CreatedAt, &task.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan task: %w", err)
		}
		tasks = append(tasks, task)
	}

	return tasks, total, nil
}

// MarkCompleted marks a task as completed
func (r *PostgreSQLTaskRepository) MarkCompleted(ctx context.Context, id int, completedAt time.Time) error {
	query := `
		UPDATE tasks 
		SET status = 'completed', completed_at = $1, updated_at = $2
		WHERE id = $3 AND deleted_at IS NULL`

	result, err := r.db.ExecContext(ctx, query, completedAt, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to mark task as completed: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if rowsAffected == 0 {
		return NewNotFoundError("Task", id)
	}

	return nil
}
```

## 4. Service Layer (`api/tasks/service.go`)

```go
package tasks

import (
	"context"
	"math"
	"time"
)

// TaskService handles business logic for tasks
type TaskService struct {
	repo TaskRepository
}

// NewTaskService creates a new task service
func NewTaskService(repo TaskRepository) *TaskService {
	return &TaskService{repo: repo}
}

// CreateTask creates a new task
func (s *TaskService) CreateTask(ctx context.Context, userID int, req CreateTaskRequest) (*Task, error) {
	// Set default priority if not provided
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	task := &Task{
		UserID:      userID,
		Title:       req.Title,
		Description: req.Description,
		Priority:    priority,
		DueDate:     req.DueDate,
	}

	return s