package models

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Status represents the possible states of a task
type Status string

// Task status constants
const (
	StatusPending    Status = "pending"
	StatusInProgress Status = "in_progress"
	StatusCompleted  Status = "completed"
	StatusCancelled  Status = "cancelled"
)

// Priority represents the importance level of a task
type Priority string

// Task priority constants
const (
	PriorityLow    Priority = "low"
	PriorityMedium Priority = "medium"
	PriorityHigh   Priority = "high"
	PriorityUrgent Priority = "urgent"
)

// Task represents a task in the system with all its properties and relationships
type Task struct {
	ID          string         `json:"id" db:"id"`
	Title       string         `json:"title" db:"title"`
	Description *string        `json:"description" db:"description"`
	Status      Status         `json:"status" db:"status"`
	Priority    Priority       `json:"priority" db:"priority"`
	DueDate     sql.NullTime   `json:"due_date" db:"due_date"`
	CompletedAt sql.NullTime   `json:"completed_at" db:"completed_at"`
	UserID      string         `json:"user_id" db:"user_id"`
	CreatedAt   time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at" db:"updated_at"`
}

// TaskValidationError represents validation errors for task operations
type TaskValidationError struct {
	Field   string
	Message string
}

// Error implements the error interface for TaskValidationError
func (e TaskValidationError) Error() string {
	return fmt.Sprintf("validation error for field '%s': %s", e.Field, e.Message)
}

// NewTask creates a new task with the provided parameters and sets default values
func NewTask(title string, userID string) (*Task, error) {
	if err := validateTitle(title); err != nil {
		return nil, err
	}

	if strings.TrimSpace(userID) == "" {
		return nil, TaskValidationError{
			Field:   "user_id",
			Message: "user ID is required",
		}
	}

	now := time.Now().UTC()
	
	return &Task{
		ID:        uuid.New().String(),
		Title:     strings.TrimSpace(title),
		Status:    StatusPending,
		Priority:  PriorityMedium,
		UserID:    userID,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

// MarkComplete marks the task as completed and sets the completion timestamp
func (t *Task) MarkComplete() {
	t.Status = StatusCompleted
	t.CompletedAt = sql.NullTime{
		Time:  time.Now().UTC(),
		Valid: true,
	}
	t.UpdatedAt = time.Now().UTC()
}

// IsOverdue checks if the task is overdue based on its due date and current status
func (t *Task) IsOverdue() bool {
	// Task is not overdue if it's already completed or cancelled
	if t.Status == StatusCompleted || t.Status == StatusCancelled {
		return false
	}

	// Task is not overdue if no due date is set
	if !t.DueDate.Valid {
		return false
	}

	// Task is overdue if the due date has passed
	return time.Now().UTC().After(t.DueDate.Time)
}

// SetDescription sets the task description
func (t *Task) SetDescription(description string) {
	trimmed := strings.TrimSpace(description)
	if trimmed == "" {
		t.Description = nil
	} else {
		t.Description = &trimmed
	}
	t.UpdatedAt = time.Now().UTC()
}

// SetDueDate sets the due date for the task
func (t *Task) SetDueDate(dueDate *time.Time) {
	if dueDate == nil {
		t.DueDate = sql.NullTime{Valid: false}
	} else {
		t.DueDate = sql.NullTime{
			Time:  dueDate.UTC(),
			Valid: true,
		}
	}
	t.UpdatedAt = time.Now().UTC()
}

// SetPriority sets the task priority after validation
func (t *Task) SetPriority(priority Priority) error {
	if err := validatePriority(priority); err != nil {
		return err
	}
	t.Priority = priority
	t.UpdatedAt = time.Now().UTC()
	return nil
}

// SetStatus sets the task status after validation
func (t *Task) SetStatus(status Status) error {
	if err := validateStatus(status); err != nil {
		return err
	}
	
	// If setting status to completed, also set completion timestamp
	if status == StatusCompleted && t.Status != StatusCompleted {
		t.CompletedAt = sql.NullTime{
			Time:  time.Now().UTC(),
			Valid: true,
		}
	}
	
	// If changing from completed to another status, clear completion timestamp
	if status != StatusCompleted && t.Status == StatusCompleted {
		t.CompletedAt = sql.NullTime{Valid: false}
	}
	
	t.Status = status
	t.UpdatedAt = time.Now().UTC()
	return nil
}

// Validate performs comprehensive validation of the task
func (t *Task) Validate() error {
	if err := validateTitle(t.Title); err != nil {
		return err
	}

	if err := validateStatus(t.Status); err != nil {
		return err
	}

	if err := validatePriority(t.Priority); err != nil {
		return err
	}

	if strings.TrimSpace(t.UserID) == "" {
		return TaskValidationError{
			Field:   "user_id",
			Message: "user ID is required",
		}
	}

	if strings.TrimSpace(t.ID) == "" {
		return TaskValidationError{
			Field:   "id",
			Message: "task ID is required",
		}
	}

	return nil
}

// IsCompleted returns true if the task is marked as completed
func (t *Task) IsCompleted() bool {
	return t.Status == StatusCompleted
}

// GetDescription returns the task description or empty string if nil
func (t *Task) GetDescription() string {
	if t.Description == nil {
		return ""
	}
	return *t.Description
}

// GetDueDate returns the due date as a pointer to time.Time, or nil if not set
func (t *Task) GetDueDate() *time.Time {
	if !t.DueDate.Valid {
		return nil
	}
	return &t.DueDate.Time
}

// GetCompletedAt returns the completion timestamp as a pointer to time.Time, or nil if not completed
func (t *Task) GetCompletedAt() *time.Time {
	if !t.CompletedAt.Valid {
		return nil
	}
	return &t.CompletedAt.Time
}

// validateTitle validates the task title
func validateTitle(title string) error {
	trimmed := strings.TrimSpace(title)
	if trimmed == "" {
		return TaskValidationError{
			Field:   "title",
			Message: "title is required",
		}
	}
	if len(trimmed) > 200 {
		return TaskValidationError{
			Field:   "title",
			Message: "title must not exceed 200 characters",
		}
	}
	return nil
}

// validateStatus validates the task status
func validateStatus(status Status) error {
	switch status {
	case StatusPending, StatusInProgress, StatusCompleted, StatusCancelled:
		return nil
	default:
		return TaskValidationError{
			Field:   "status",
			Message: fmt.Sprintf("invalid status '%s', must be one of: pending, in_progress, completed, cancelled", status),
		}
	}
}

// validatePriority validates the task priority
func validatePriority(priority Priority) error {
	switch priority {
	case PriorityLow, PriorityMedium, PriorityHigh, PriorityUrgent:
		return nil
	default:
		return TaskValidationError{
			Field:   "priority",
			Message: fmt.Sprintf("invalid priority '%s', must be one of: low, medium, high, urgent", priority),
		}
	}
}

// GetValidStatuses returns all valid status values
func GetValidStatuses() []Status {
	return []Status{StatusPending, StatusInProgress, StatusCompleted, StatusCancelled}
}

// GetValidPriorities returns all valid priority values
func GetValidPriorities() []Priority {
	return []Priority{PriorityLow, PriorityMedium, PriorityHigh, PriorityUrgent}
}