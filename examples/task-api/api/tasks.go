I'll generate a complete, production-ready Go REST API for task management following all your requirements. Here's the implementation:

## 1. models/task.go

```go
package models

import (
	"time"

	"gorm.io/gorm"
)

// TaskStatus represents the status of a task
type TaskStatus string

const (
	TaskStatusPending    TaskStatus = "pending"
	TaskStatusInProgress TaskStatus = "in_progress"
	TaskStatusCompleted  TaskStatus = "completed"
)

// TaskPriority represents the priority level of a task
type TaskPriority string

const (
	TaskPriorityLow    TaskPriority = "low"
	TaskPriorityMedium TaskPriority = "medium"
	TaskPriorityHigh   TaskPriority = "high"
)

// Task represents the task model in the database
type Task struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	UserID      uint           `json:"user_id" gorm:"not null;index"`
	Title       string         `json:"title" gorm:"not null;size:255"`
	Description *string        `json:"description" gorm:"type:text"`
	Priority    TaskPriority   `json:"priority" gorm:"not null;default:'medium';index"`
	Status      TaskStatus     `json:"status" gorm:"not null;default:'pending';index"`
	DueDate     *time.Time     `json:"due_date" gorm:"index"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	CompletedAt *time.Time     `json:"completed_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// CreateTaskRequest represents the request payload for creating a task
type CreateTaskRequest struct {
	Title       string        `json:"title" binding:"required,min=1,max=255" validate:"required,min=1,max=255"`
	Description *string       `json:"description" validate:"omitempty,max=1000"`
	Priority    *TaskPriority `json:"priority" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time    `json:"due_date"`
}

// UpdateTaskRequest represents the request payload for updating a task
type UpdateTaskRequest struct {
	Title       *string       `json:"title" validate:"omitempty,min=1,max=255"`
	Description *string       `json:"description" validate:"omitempty,max=1000"`
	Priority    *TaskPriority `json:"priority" validate:"omitempty,oneof=low medium high"`
	Status      *TaskStatus   `json:"status" validate:"omitempty,oneof=pending in_progress completed"`
	DueDate     *time.Time    `json:"due_date"`
}

// TaskResponse represents the response payload for a task
type TaskResponse struct {
	ID          uint         `json:"id"`
	UserID      uint         `json:"user_id"`
	Title       string       `json:"title"`
	Description *string      `json:"description"`
	Priority    TaskPriority `json:"priority"`
	Status      TaskStatus   `json:"status"`
	DueDate     *time.Time   `json:"due_date"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
	CompletedAt *time.Time   `json:"completed_at"`
}

// TaskListResponse represents the response payload for task list
type TaskListResponse struct {
	Tasks      []TaskResponse   `json:"tasks"`
	Pagination PaginationMeta   `json:"pagination"`
}

// PaginationMeta represents pagination metadata
type PaginationMeta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

// TaskFilters represents filters for task queries
type TaskFilters struct {
	Status    *TaskStatus `form:"status" validate:"omitempty,oneof=pending in_progress completed"`
	Priority  *TaskPriority `form:"priority" validate:"omitempty,oneof=low medium high"`
	DueBefore *time.Time  `form:"due_before" time_format:"2006-01-02T15:04:05Z07:00"`
	DueAfter  *time.Time  `form:"due_after" time_format:"2006-01-02T15:04:05Z07:00"`
	Page      int         `form:"page,default=1" validate:"min=1"`
	Limit     int         `form:"limit,default=20" validate:"min=1,max=100"`
}

// ErrorResponse represents the standard error response format
type ErrorResponse struct {
	Error   string                 `json:"error"`
	Message string                 `json:"message"`
	Details map[string]interface{} `json:"details,omitempty"`
}

// ToResponse converts Task model to TaskResponse
func (t *Task) ToResponse() TaskResponse {
	return TaskResponse{
		ID:          t.ID,
		UserID:      t.UserID,
		Title:       t.Title,
		Description: t.Description,
		Priority:    t.Priority,
		Status:      t.Status,
		DueDate:     t.DueDate,
		CreatedAt:   t.CreatedAt,
		UpdatedAt:   t.UpdatedAt,
		CompletedAt: t.CompletedAt,
	}
}
```

## 2. repositories/task_repository.go

```go
package repositories

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
	"your-app/models"
)

// TaskRepository defines the interface for task data operations
type TaskRepository interface {
	Create(ctx context.Context, task *models.Task) error
	GetByID(ctx context.Context, id, userID uint) (*models.Task, error)
	Update(ctx context.Context, task *models.Task) error
	Delete(ctx context.Context, id, userID uint) error
	List(ctx context.Context, userID uint, filters models.TaskFilters) ([]models.Task, models.PaginationMeta, error)
	MarkCompleted(ctx context.Context, id, userID uint) error
}

// taskRepository implements TaskRepository interface
type taskRepository struct {
	db     *gorm.DB
	logger *logrus.Logger
}

// NewTaskRepository creates a new task repository instance
func NewTaskRepository(db *gorm.DB, logger *logrus.Logger) TaskRepository {
	return &taskRepository{
		db:     db,
		logger: logger,
	}
}

// Create creates a new task in the database
func (r *taskRepository) Create(ctx context.Context, task *models.Task) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := r.db.WithContext(ctx).Create(task).Error; err != nil {
		r.logger.WithError(err).Error("Failed to create task")
		return fmt.Errorf("failed to create task: %w", err)
	}

	r.logger.WithFields(logrus.Fields{
		"task_id": task.ID,
		"user_id": task.UserID,
	}).Info("Task created successfully")

	return nil
}

// GetByID retrieves a task by ID and user ID
func (r *taskRepository) GetByID(ctx context.Context, id, userID uint) (*models.Task, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var task models.Task
	err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&task).Error
	
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("task not found")
		}
		r.logger.WithError(err).WithFields(logrus.Fields{
			"task_id": id,
			"user_id": userID,
		}).Error("Failed to get task")
		return nil, fmt.Errorf("failed to get task: %w", err)
	}

	return &task, nil
}

// Update updates an existing task
func (r *taskRepository) Update(ctx context.Context, task *models.Task) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	result := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", task.ID, task.UserID).Updates(task)
	
	if result.Error != nil {
		r.logger.WithError(result.Error).WithFields(logrus.Fields{
			"task_id": task.ID,
			"user_id": task.UserID,
		}).Error("Failed to update task")
		return fmt.Errorf("failed to update task: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("task not found or no changes made")
	}

	r.logger.WithFields(logrus.Fields{
		"task_id": task.ID,
		"user_id": task.UserID,
	}).Info("Task updated successfully")

	return nil
}

// Delete soft deletes a task
func (r *taskRepository) Delete(ctx context.Context, id, userID uint) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	result := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&models.Task{})
	
	if result.Error != nil {
		r.logger.WithError(result.Error).WithFields(logrus.Fields{
			"task_id": id,
			"user_id": userID,
		}).Error("Failed to delete task")
		return fmt.Errorf("failed to delete task: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("task not found")
	}

	r.logger.WithFields(logrus.Fields{
		"task_id": id,
		"user_id": userID,
	}).Info("Task deleted successfully")

	return nil
}

// List retrieves tasks with filtering and pagination
func (r *taskRepository) List(ctx context.Context, userID uint, filters models.TaskFilters) ([]models.Task, models.PaginationMeta, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var tasks []models.Task
	var total int64

	// Build query with filters
	query := r.db.WithContext(ctx).Model(&models.Task{}).Where("user_id = ?", userID)

	if filters.Status != nil {
		query = query.Where("status = ?", *filters.Status)
	}

	if filters.Priority != nil {
		query = query.Where("priority = ?", *filters.Priority)
	}

	if filters.DueBefore != nil {
		query = query.Where("due_date < ?", *filters.DueBefore)
	}

	if filters.DueAfter != nil {
		query = query.Where("due_date > ?", *filters.DueAfter)
	}

	// Count total records
	if err := query.Count(&total).Error; err != nil {
		r.logger.WithError(err).WithField("user_id", userID).Error("Failed to count tasks")
		return nil, models.PaginationMeta{}, fmt.Errorf("failed to count tasks: %w", err)
	}

	// Apply pagination
	offset := (filters.Page - 1) * filters.Limit
	if err := query.Offset(offset).Limit(filters.Limit).Order("created_at DESC").Find(&tasks).Error; err != nil {
		r.logger.WithError(err).WithField("user_id", userID).Error("Failed to list tasks")
		return nil, models.PaginationMeta{}, fmt.Errorf("failed to list tasks: %w", err)
	}

	// Calculate pagination metadata
	totalPages := int(math.Ceil(float64(total) / float64(filters.Limit)))
	pagination := models.PaginationMeta{
		Page:       filters.Page,
		Limit:      filters.Limit,
		Total:      total,
		TotalPages: totalPages,
	}

	return tasks, pagination, nil
}

// MarkCompleted marks a task as completed
func (r *taskRepository) MarkCompleted(ctx context.Context, id, userID uint) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	now := time.Now()
	result := r.db.WithContext(ctx).Model(&models.Task{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(map[string]interface{}{
			"status":       models.TaskStatusCompleted,
			"completed_at": &now,
			"updated_at":   now,
		})

	if result.Error != nil {
		r.logger.WithError(result.Error).WithFields(logrus.Fields{
			"task_id": id,
			"user_id": userID,
		}).Error("Failed to mark task as completed")
		return fmt.Errorf("failed to mark task as completed: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("task not found")
	}

	r.logger.WithFields(logrus.Fields{
		"task_id": id,
		"user_id": userID,
	}).Info("Task marked as completed")

	return nil
}
```

## 3. services/task_service.go

```go
package services

import (
	"context"
	"fmt"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/sirupsen/logrus"
	"your-app/models"
	"your-app/repositories"
)

// Custom error types
type DomainError struct {
	Type    string
	Message string
	Details map[string]interface{}
}

func (e DomainError) Error() string {
	return e.Message
}

var (
	ErrTaskNotFound    = DomainError{Type: "NOT_FOUND", Message: "Task not found"}
	ErrUnauthorized    = DomainError{Type: "UNAUTHORIZED", Message: "Unauthorized access"}
	ErrValidationError = DomainError{Type: "VALIDATION_ERROR", Message: "Validation failed"}
)

// TaskService defines the interface for task business logic
type TaskService interface {
	CreateTask(ctx context.Context, userID uint, req models.CreateTaskRequest) (*models.TaskResponse, error)
	GetTask(ctx context.Context, id, userID uint) (*models.TaskResponse, error)
	UpdateTask(ctx context.Context, id, userID uint, req models.UpdateTaskRequest) (*models.TaskResponse, error)
	DeleteTask(ctx context.Context, id, userID uint) error
	ListTasks(ctx context.Context, userID uint, filters models.TaskFilters) (*models.TaskListResponse, error)
	CompleteTask(ctx context.Context, id, userID uint) (*models.TaskResponse, error)
}

// taskService implements TaskService interface
type taskService struct {
	repo      repositories.TaskRepository
	validator *validator.Validate
	logger    *logrus.Logger
}

// NewTaskService creates a new task service instance
func NewTaskService(repo repositories.TaskRepository, validator