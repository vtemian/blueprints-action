I'll generate a production-ready Go task management API following clean architecture principles. Here's the complete implementation:

## Project Structure

```
/api/tasks/
├── handlers.go
├── models.go
├── repository.go
├── service.go
├── routes.go
├── middleware.go
├── errors.go
└── handlers_test.go
```

## 1. errors.go - Custom Error Types

```go
package tasks

import (
	"fmt"
	"net/http"
)

// DomainError represents application-specific errors
type DomainError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Status  int    `json:"-"`
}

func (e DomainError) Error() string {
	return e.Message
}

// Predefined domain errors
var (
	ErrTaskNotFound = DomainError{
		Code:    "TASK_NOT_FOUND",
		Message: "Task not found or access denied",
		Status:  http.StatusNotFound,
	}
	
	ErrInvalidTaskID = DomainError{
		Code:    "INVALID_TASK_ID",
		Message: "Invalid task ID format",
		Status:  http.StatusBadRequest,
	}
	
	ErrUnauthorized = DomainError{
		Code:    "UNAUTHORIZED",
		Message: "Authentication required",
		Status:  http.StatusUnauthorized,
	}
	
	ErrValidationFailed = DomainError{
		Code:    "VALIDATION_FAILED",
		Message: "Request validation failed",
		Status:  http.StatusBadRequest,
	}
	
	ErrTaskAlreadyCompleted = DomainError{
		Code:    "TASK_ALREADY_COMPLETED",
		Message: "Task is already completed",
		Status:  http.StatusConflict,
	}
)

// ErrorResponse represents the JSON error response format
type ErrorResponse struct {
	Error     DomainError `json:"error"`
	RequestID string      `json:"request_id,omitempty"`
	Timestamp string      `json:"timestamp"`
}

// NewValidationError creates a validation error with details
func NewValidationError(message string) DomainError {
	return DomainError{
		Code:    "VALIDATION_FAILED",
		Message: message,
		Status:  http.StatusBadRequest,
	}
}
```

## 2. models.go - Request/Response Models

```go
package tasks

import (
	"time"
	"github.com/go-playground/validator/v10"
)

// Task represents the task entity
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
	User        *User      `json:"user,omitempty"`
}

// User represents embedded user information
type User struct {
	ID       int    `json:"id" db:"id"`
	Username string `json:"username" db:"username"`
	Email    string `json:"email" db:"email"`
}

// CreateTaskRequest represents the request to create a new task
type CreateTaskRequest struct {
	Title       string     `json:"title" validate:"required,min=1,max=255"`
	Description string     `json:"description" validate:"required,min=1,max=1000"`
	Priority    string     `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
}

// UpdateTaskRequest represents the request to update a task
type UpdateTaskRequest struct {
	Title       *string    `json:"title,omitempty" validate:"omitempty,min=1,max=255"`
	Description *string    `json:"description,omitempty" validate:"omitempty,min=1,max=1000"`
	Status      *string    `json:"status,omitempty" validate:"omitempty,oneof=pending in_progress completed"`
	Priority    *string    `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
}

// TaskListRequest represents query parameters for listing tasks
type TaskListRequest struct {
	Status    string     `form:"status" validate:"omitempty,oneof=pending in_progress completed"`
	Priority  string     `form:"priority" validate:"omitempty,oneof=low medium high"`
	DueBefore *time.Time `form:"due_before"`
	DueAfter  *time.Time `form:"due_after"`
	Page      int        `form:"page" validate:"omitempty,min=1"`
	Limit     int        `form:"limit" validate:"omitempty,min=1,max=100"`
}

// TaskListResponse represents the paginated response for task listing
type TaskListResponse struct {
	Tasks      []Task     `json:"tasks"`
	Pagination Pagination `json:"pagination"`
}

// Pagination represents pagination metadata
type Pagination struct {
	Page       int  `json:"page"`
	Limit      int  `json:"limit"`
	Total      int  `json:"total"`
	TotalPages int  `json:"total_pages"`
	HasNext    bool `json:"has_next"`
	HasPrev    bool `json:"has_prev"`
}

// UserContext represents the authenticated user context
type UserContext struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

// Validate validates the request using the validator package
func (r *CreateTaskRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(r)
}

func (r *UpdateTaskRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(r)
}

func (r *TaskListRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(r)
}

// SetDefaults sets default values for pagination
func (r *TaskListRequest) SetDefaults() {
	if r.Page <= 0 {
		r.Page = 1
	}
	if r.Limit <= 0 {
		r.Limit = 20
	}
	if r.Limit > 100 {
		r.Limit = 100
	}
}
```

## 3. repository.go - Data Access Interface

```go
package tasks

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"go.uber.org/zap"
)

// Repository defines the interface for task data operations
type Repository interface {
	GetByID(ctx context.Context, taskID, userID int) (*Task, error)
	List(ctx context.Context, userID int, req TaskListRequest) ([]Task, int, error)
	Create(ctx context.Context, task *Task) error
	Update(ctx context.Context, task *Task) error
	Delete(ctx context.Context, taskID, userID int) error
	MarkCompleted(ctx context.Context, taskID, userID int) (*Task, error)
}

// PostgreSQLRepository implements Repository using PostgreSQL
type PostgreSQLRepository struct {
	db     *sqlx.DB
	logger *zap.Logger
}

// NewPostgreSQLRepository creates a new PostgreSQL repository
func NewPostgreSQLRepository(db *sqlx.DB, logger *zap.Logger) Repository {
	return &PostgreSQLRepository{
		db:     db,
		logger: logger,
	}
}

// GetByID retrieves a task by ID and user ID
func (r *PostgreSQLRepository) GetByID(ctx context.Context, taskID, userID int) (*Task, error) {
	query := `
		SELECT t.id, t.user_id, t.title, t.description, t.status, t.priority,
			   t.due_date, t.completed_at, t.created_at, t.updated_at,
			   u.id as "user.id", u.username as "user.username", u.email as "user.email"
		FROM tasks t
		JOIN users u ON t.user_id = u.id
		WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NULL`

	var task Task
	err := r.db.GetContext(ctx, &task, query, taskID, userID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrTaskNotFound
		}
		r.logger.Error("Failed to get task by ID", 
			zap.Error(err), 
			zap.Int("task_id", taskID), 
			zap.Int("user_id", userID))
		return nil, fmt.Errorf("failed to get task: %w", err)
	}

	return &task, nil
}

// List retrieves tasks with filtering and pagination
func (r *PostgreSQLRepository) List(ctx context.Context, userID int, req TaskListRequest) ([]Task, int, error) {
	// Build WHERE clause
	conditions := []string{"t.user_id = $1", "t.deleted_at IS NULL"}
	args := []interface{}{userID}
	argIndex := 2

	if req.Status != "" {
		conditions = append(conditions, fmt.Sprintf("t.status = $%d", argIndex))
		args = append(args, req.Status)
		argIndex++
	}

	if req.Priority != "" {
		conditions = append(conditions, fmt.Sprintf("t.priority = $%d", argIndex))
		args = append(args, req.Priority)
		argIndex++
	}

	if req.DueBefore != nil {
		conditions = append(conditions, fmt.Sprintf("t.due_date < $%d", argIndex))
		args = append(args, *req.DueBefore)
		argIndex++
	}

	if req.DueAfter != nil {
		conditions = append(conditions, fmt.Sprintf("t.due_date > $%d", argIndex))
		args = append(args, *req.DueAfter)
		argIndex++
	}

	whereClause := strings.Join(conditions, " AND ")

	// Count total records
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*) 
		FROM tasks t 
		WHERE %s`, whereClause)

	var total int
	err := r.db.GetContext(ctx, &total, countQuery, args...)
	if err != nil {
		r.logger.Error("Failed to count tasks", zap.Error(err))
		return nil, 0, fmt.Errorf("failed to count tasks: %w", err)
	}

	// Get paginated results
	offset := (req.Page - 1) * req.Limit
	dataQuery := fmt.Sprintf(`
		SELECT t.id, t.user_id, t.title, t.description, t.status, t.priority,
			   t.due_date, t.completed_at, t.created_at, t.updated_at,
			   u.id as "user.id", u.username as "user.username", u.email as "user.email"
		FROM tasks t
		JOIN users u ON t.user_id = u.id
		WHERE %s
		ORDER BY t.created_at DESC
		LIMIT $%d OFFSET $%d`, whereClause, argIndex, argIndex+1)

	args = append(args, req.Limit, offset)

	var tasks []Task
	err = r.db.SelectContext(ctx, &tasks, dataQuery, args...)
	if err != nil {
		r.logger.Error("Failed to list tasks", zap.Error(err))
		return nil, 0, fmt.Errorf("failed to list tasks: %w", err)
	}

	return tasks, total, nil
}

// Create creates a new task
func (r *PostgreSQLRepository) Create(ctx context.Context, task *Task) error {
	query := `
		INSERT INTO tasks (user_id, title, description, status, priority, due_date, created_at, updated_at)
		VALUES (:user_id, :title, :description, :status, :priority, :due_date, :created_at, :updated_at)
		RETURNING id`

	now := time.Now().UTC()
	task.CreatedAt = now
	task.UpdatedAt = now
	task.Status = "pending" // Default status

	rows, err := r.db.NamedQueryContext(ctx, query, task)
	if err != nil {
		r.logger.Error("Failed to create task", zap.Error(err))
		return fmt.Errorf("failed to create task: %w", err)
	}
	defer rows.Close()

	if rows.Next() {
		err = rows.Scan(&task.ID)
		if err != nil {
			return fmt.Errorf("failed to scan task ID: %w", err)
		}
	}

	return nil
}

// Update updates an existing task
func (r *PostgreSQLRepository) Update(ctx context.Context, task *Task) error {
	task.UpdatedAt = time.Now().UTC()

	query := `
		UPDATE tasks 
		SET title = :title, description = :description, status = :status, 
			priority = :priority, due_date = :due_date, updated_at = :updated_at
		WHERE id = :id AND user_id = :user_id AND deleted_at IS NULL`

	result, err := r.db.NamedExecContext(ctx, query, task)
	if err != nil {
		r.logger.Error("Failed to update task", zap.Error(err))
		return fmt.Errorf("failed to update task: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrTaskNotFound
	}

	return nil
}

// Delete soft deletes a task
func (r *PostgreSQLRepository) Delete(ctx context.Context, taskID, userID int) error {
	query := `
		UPDATE tasks 
		SET deleted_at = $1, updated_at = $1
		WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL`

	now := time.Now().UTC()
	result, err := r.db.ExecContext(ctx, query, now, taskID, userID)
	if err != nil {
		r.logger.Error("Failed to delete task", zap.Error(err))
		return fmt.Errorf("failed to delete task: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrTaskNotFound
	}

	return nil
}

// MarkCompleted marks a task as completed
func (r *PostgreSQLRepository) MarkCompleted(ctx context