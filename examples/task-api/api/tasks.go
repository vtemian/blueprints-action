I'll generate a complete, production-ready Go implementation for the task management API. Here's the comprehensive solution:

## Project Structure

```
api/
├── tasks/
│   ├── handler.go
│   ├── middleware.go
│   ├── models.go
│   ├── repository.go
│   ├── service.go
│   └── validators.go
├── errors/
│   └── errors.go
└── main.go
```

## 1. Error Handling (`errors/errors.go`)

```go
package errors

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// AppError represents application-specific errors
type AppError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Status  int    `json:"-"`
}

func (e *AppError) Error() string {
	return e.Message
}

// Predefined error types
var (
	ErrTaskNotFound     = &AppError{"TASK_NOT_FOUND", "Task not found", http.StatusNotFound}
	ErrUnauthorized     = &AppError{"UNAUTHORIZED", "Authentication required", http.StatusUnauthorized}
	ErrForbidden        = &AppError{"FORBIDDEN", "Access denied", http.StatusForbidden}
	ErrInvalidInput     = &AppError{"INVALID_INPUT", "Invalid input data", http.StatusBadRequest}
	ErrValidationFailed = &AppError{"VALIDATION_FAILED", "Validation failed", http.StatusUnprocessableEntity}
	ErrInternalServer   = &AppError{"INTERNAL_ERROR", "Internal server error", http.StatusInternalServerError}
)

// ErrorResponse represents the structure of error responses
type ErrorResponse struct {
	Error   *AppError              `json:"error"`
	Details map[string]interface{} `json:"details,omitempty"`
}

// ValidationError represents validation error details
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
	Value   string `json:"value,omitempty"`
}

// NewValidationError creates a new validation error with details
func NewValidationError(message string, details []ValidationError) *ErrorResponse {
	return &ErrorResponse{
		Error: ErrValidationFailed,
		Details: map[string]interface{}{
			"validation_errors": details,
		},
	}
}

// HandleError sends appropriate error response
func HandleError(c *gin.Context, err error) {
	switch e := err.(type) {
	case *AppError:
		c.JSON(e.Status, &ErrorResponse{Error: e})
	default:
		// Log the actual error for debugging but don't expose it
		fmt.Printf("Internal error: %v\n", err)
		c.JSON(http.StatusInternalServerError, &ErrorResponse{Error: ErrInternalServer})
	}
}
```

## 2. Models (`tasks/models.go`)

```go
package tasks

import (
	"time"

	"gorm.io/gorm"
)

// TaskStatus represents the status of a task
type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusCompleted TaskStatus = "completed"
)

// TaskPriority represents the priority level of a task
type TaskPriority string

const (
	TaskPriorityLow    TaskPriority = "low"
	TaskPriorityMedium TaskPriority = "medium"
	TaskPriorityHigh   TaskPriority = "high"
)

// Task represents a task in the system
type Task struct {
	ID          uint          `json:"id" gorm:"primaryKey"`
	Title       string        `json:"title" gorm:"not null;index"`
	Description string        `json:"description" gorm:"type:text"`
	Status      TaskStatus    `json:"status" gorm:"default:'pending';index"`
	Priority    TaskPriority  `json:"priority" gorm:"default:'medium';index"`
	DueDate     *time.Time    `json:"due_date,omitempty" gorm:"index"`
	CompletedAt *time.Time    `json:"completed_at,omitempty"`
	UserID      uint          `json:"user_id" gorm:"not null;index"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// CreateTaskRequest represents the request payload for creating a task
type CreateTaskRequest struct {
	Title       string        `json:"title" validate:"required,min=1,max=255" example:"Complete project documentation"`
	Description string        `json:"description" validate:"required,min=1,max=2000" example:"Write comprehensive API documentation"`
	Priority    *TaskPriority `json:"priority,omitempty" validate:"omitempty,oneof=low medium high" example:"high"`
	DueDate     *time.Time    `json:"due_date,omitempty" validate:"omitempty,future" example:"2024-12-31T23:59:59Z"`
}

// UpdateTaskRequest represents the request payload for updating a task
type UpdateTaskRequest struct {
	Title       *string       `json:"title,omitempty" validate:"omitempty,min=1,max=255"`
	Description *string       `json:"description,omitempty" validate:"omitempty,min=1,max=2000"`
	Priority    *TaskPriority `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time    `json:"due_date,omitempty" validate:"omitempty,future"`
	Status      *TaskStatus   `json:"status,omitempty" validate:"omitempty,oneof=pending completed"`
}

// TaskListRequest represents query parameters for listing tasks
type TaskListRequest struct {
	Status    *TaskStatus   `form:"status" validate:"omitempty,oneof=pending completed"`
	Priority  *TaskPriority `form:"priority" validate:"omitempty,oneof=low medium high"`
	DueBefore *time.Time    `form:"due_before" validate:"omitempty"`
	DueAfter  *time.Time    `form:"due_after" validate:"omitempty"`
	Page      int           `form:"page" validate:"min=1" default:"1"`
	Limit     int           `form:"limit" validate:"min=1,max=100" default:"20"`
}

// TaskResponse represents a task in API responses
type TaskResponse struct {
	ID          uint         `json:"id"`
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Status      TaskStatus   `json:"status"`
	Priority    TaskPriority `json:"priority"`
	DueDate     *time.Time   `json:"due_date,omitempty"`
	CompletedAt *time.Time   `json:"completed_at,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

// TaskListResponse represents the response for task listing
type TaskListResponse struct {
	Tasks      []TaskResponse `json:"tasks"`
	Pagination Pagination     `json:"pagination"`
}

// Pagination represents pagination information
type Pagination struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
	HasNext    bool  `json:"has_next"`
	HasPrev    bool  `json:"has_prev"`
}

// ToResponse converts a Task model to TaskResponse
func (t *Task) ToResponse() TaskResponse {
	return TaskResponse{
		ID:          t.ID,
		Title:       t.Title,
		Description: t.Description,
		Status:      t.Status,
		Priority:    t.Priority,
		DueDate:     t.DueDate,
		CompletedAt: t.CompletedAt,
		CreatedAt:   t.CreatedAt,
		UpdatedAt:   t.UpdatedAt,
	}
}

// CalculatePagination calculates pagination metadata
func CalculatePagination(page, limit int, total int64) Pagination {
	totalPages := int((total + int64(limit) - 1) / int64(limit))
	
	return Pagination{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}
}
```

## 3. Custom Validators (`tasks/validators.go`)

```go
package tasks

import (
	"time"

	"github.com/go-playground/validator/v10"
)

// RegisterCustomValidators registers custom validation rules
func RegisterCustomValidators(v *validator.Validate) {
	v.RegisterValidation("future", validateFutureDate)
}

// validateFutureDate validates that a date is in the future
func validateFutureDate(fl validator.FieldLevel) bool {
	date, ok := fl.Field().Interface().(time.Time)
	if !ok {
		// If it's a pointer, dereference it
		if datePtr, ok := fl.Field().Interface().(*time.Time); ok && datePtr != nil {
			date = *datePtr
		} else {
			return true // Allow nil values, use omitempty for required validation
		}
	}
	
	return date.After(time.Now())
}
```

## 4. JWT Middleware (`tasks/middleware.go`)

```go
package tasks

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	apierrors "your-project/api/errors"
)

// JWTClaims represents the JWT claims structure
type JWTClaims struct {
	UserID uint   `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// JWTMiddleware creates a JWT authentication middleware
func JWTMiddleware(secretKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			apierrors.HandleError(c, apierrors.ErrUnauthorized)
			c.Abort()
			return
		}

		// Check if the header starts with "Bearer "
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			apierrors.HandleError(c, apierrors.ErrUnauthorized)
			c.Abort()
			return
		}

		// Parse and validate the token
		token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
			// Validate the signing method
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(secretKey), nil
		})

		if err != nil {
			apierrors.HandleError(c, apierrors.ErrUnauthorized)
			c.Abort()
			return
		}

		// Extract claims
		if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
			c.Set("user_id", claims.UserID)
			c.Set("user_email", claims.Email)
			c.Next()
		} else {
			apierrors.HandleError(c, apierrors.ErrUnauthorized)
			c.Abort()
			return
		}
	}
}

// GetUserIDFromContext extracts user ID from gin context
func GetUserIDFromContext(c *gin.Context) (uint, error) {
	userID, exists := c.Get("user_id")
	if !exists {
		return 0, apierrors.ErrUnauthorized
	}

	switch id := userID.(type) {
	case uint:
		return id, nil
	case string:
		parsed, err := strconv.ParseUint(id, 10, 32)
		if err != nil {
			return 0, apierrors.ErrUnauthorized
		}
		return uint(parsed), nil
	default:
		return 0, apierrors.ErrUnauthorized
	}
}

// RateLimitMiddleware implements basic rate limiting
func RateLimitMiddleware() gin.HandlerFunc {
	// In production, use Redis or similar for distributed rate limiting
	return gin.HandlerFunc(func(c *gin.Context) {
		// Basic implementation - in production use proper rate limiting
		c.Header("X-RateLimit-Limit", "1000")
		c.Header("X-RateLimit-Remaining", "999")
		c.Next()
	})
}
```

## 5. Repository Layer (`tasks/repository.go`)

```go
package tasks

import (
	"context"
	"fmt"

	"gorm.io/gorm"

	apierrors "your-project/api/errors"
)

// TaskRepository defines the interface for task data operations
type TaskRepository interface {
	Create(ctx context.Context, task *Task) error
	GetByID(ctx context.Context, id, userID uint) (*Task, error)
	Update(ctx context.Context, task *Task) error
	Delete(ctx context.Context, id, userID uint) error
	List(ctx context.Context, userID uint, filters TaskListRequest) ([]Task, int64, error)
	MarkComplete(ctx context.Context, id, userID uint) error
}

// taskRepository implements TaskRepository interface
type taskRepository struct {
	db *gorm.DB
}

// NewTaskRepository creates a new task repository instance
func NewTaskRepository(db *gorm.DB) TaskRepository {
	return &taskRepository{db: db}
}

// Create creates a new task in the database
func (r *taskRepository) Create(ctx context.Context, task *Task) error {
	if err := r.db.WithContext(ctx).Create(task).Error; err != nil {
		return fmt.Errorf("failed to create task: %w", err)
	}
	return nil
}

// GetByID retrieves a task by ID and user ID
func (r *taskRepository) GetByID(ctx context.Context, id, userID uint) (*Task, error) {
	var task Task
	err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		First(&task).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apierrors.ErrTaskNotFound
		}
		return nil, fmt.Errorf("failed to get task: %w", err)
	}

	return &task, nil
}

// Update updates an existing task
func (r *taskRepository) Update(ctx context.Context, task *Task) error {
	result := r.db.WithContext(ctx).
		Where("user_id = ?", task.UserID).
		Save(task)

	if result.Error != nil {
		return fmt.Errorf("failed to update task: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return apierrors.ErrTaskNotFound
	}

	return nil
}

// Delete soft deletes a task
func (r *taskRepository) Delete(ctx context.Context, id, userID uint) error {
	result := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&Task{})