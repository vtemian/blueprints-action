// Package models provides data models for the task management system.
// This package includes the Task entity with proper validation, database integration,
// and business logic methods.
package models

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Custom error variables for validation failures
var (
	ErrInvalidTaskStatus   = errors.New("invalid task status")
	ErrInvalidTaskPriority = errors.New("invalid task priority")
	ErrEmptyTitle         = errors.New("task title cannot be empty")
	ErrTitleTooLong       = errors.New("task title cannot exceed 200 characters")
	ErrInvalidUserID      = errors.New("invalid user ID")
)

// TaskStatus represents the status of a task
type TaskStatus string

// TaskStatus constants
const (
	TaskStatusPending    TaskStatus = "pending"
	TaskStatusInProgress TaskStatus = "in_progress"
	TaskStatusCompleted  TaskStatus = "completed"
)

// String returns the string representation of TaskStatus
func (ts TaskStatus) String() string {
	return string(ts)
}

// IsValid validates if the TaskStatus is a valid enum value
func (ts TaskStatus) IsValid() bool {
	switch ts {
	case TaskStatusPending, TaskStatusInProgress, TaskStatusCompleted:
		return true
	default:
		return false
	}
}

// Validate returns an error if the TaskStatus is invalid
func (ts TaskStatus) Validate() error {
	if !ts.IsValid() {
		return fmt.Errorf("%w: %s", ErrInvalidTaskStatus, string(ts))
	}
	return nil
}

// TaskPriority represents the priority level of a task
type TaskPriority string

// TaskPriority constants
const (
	TaskPriorityLow    TaskPriority = "low"
	TaskPriorityMedium TaskPriority = "medium"
	TaskPriorityHigh   TaskPriority = "high"
)

// String returns the string representation of TaskPriority
func (tp TaskPriority) String() string {
	return string(tp)
}

// IsValid validates if the TaskPriority is a valid enum value
func (tp TaskPriority) IsValid() bool {
	switch tp {
	case TaskPriorityLow, TaskPriorityMedium, TaskPriorityHigh:
		return true
	default:
		return false
	}
}

// Validate returns an error if the TaskPriority is invalid
func (tp TaskPriority) Validate() error {
	if !tp.IsValid() {
		return fmt.Errorf("%w: %s", ErrInvalidTaskPriority, string(tp))
	}
	return nil
}

// Task represents a task entity in the system
type Task struct {
	ID          uuid.UUID     `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Title       string        `json:"title" gorm:"type:varchar(200);not null" validate:"required,max=200"`
	Description string        `json:"description" gorm:"type:text"`
	Status      TaskStatus    `json:"status" gorm:"type:varchar(20);not null;index:idx_tasks_status;default:'pending'"`
	Priority    TaskPriority  `json:"priority" gorm:"type:varchar(10);not null;default:'medium'"`
	UserID      uuid.UUID     `json:"user_id" gorm:"type:uuid;not null;index:idx_tasks_user_id"`
	DueDate     *time.Time    `json:"due_date,omitempty" gorm:"index:idx_tasks_due_date"`
	CompletedAt *time.Time    `json:"completed_at,omitempty"`
	CreatedAt   time.Time     `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt   time.Time     `json:"updated_at" gorm:"autoUpdateTime"`
}

// TableName specifies the table name for the Task model
func (Task) TableName() string {
	return "tasks"
}

// BeforeCreate is a GORM hook that runs before creating a task
func (t *Task) BeforeCreate(tx *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return t.Validate()
}

// BeforeUpdate is a GORM hook that runs before updating a task
func (t *Task) BeforeUpdate(tx *gorm.DB) error {
	return t.Validate()
}

// Validate performs comprehensive validation on the Task struct
func (t *Task) Validate() error {
	// Validate title
	if err := t.validateTitle(); err != nil {
		return err
	}

	// Validate status
	if err := t.Status.Validate(); err != nil {
		return err
	}

	// Validate priority
	if err := t.Priority.Validate(); err != nil {
		return err
	}

	// Validate UserID
	if err := t.validateUserID(); err != nil {
		return err
	}

	return nil
}

// validateTitle validates the task title
func (t *Task) validateTitle() error {
	title := strings.TrimSpace(t.Title)
	if title == "" {
		return ErrEmptyTitle
	}
	if len(title) > 200 {
		return ErrTitleTooLong
	}
	t.Title = title
	return nil
}

// validateUserID validates the user ID
func (t *Task) validateUserID() error {
	if t.UserID == uuid.Nil {
		return ErrInvalidUserID
	}
	return nil
}

// MarkComplete sets the task status to completed and sets the CompletedAt timestamp
func (t *Task) MarkComplete() {
	t.Status = TaskStatusCompleted
	now := time.Now()
	t.CompletedAt = &now
}

// IsOverdue returns true if the task has a due date that is in the past
// and the task status is not completed
func (t *Task) IsOverdue() bool {
	// If there's no due date, the task cannot be overdue
	if t.DueDate == nil {
		return false
	}

	// If the task is completed, it's not considered overdue
	if t.Status == TaskStatusCompleted {
		return false
	}

	// Check if the due date is in the past
	return t.DueDate.Before(time.Now())
}

// IsCompleted returns true if the task status is completed
func (t *Task) IsCompleted() bool {
	return t.Status == TaskStatusCompleted
}

// IsPending returns true if the task status is pending
func (t *Task) IsPending() bool {
	return t.Status == TaskStatusPending
}

// IsInProgress returns true if the task status is in progress
func (t *Task) IsInProgress() bool {
	return t.Status == TaskStatusInProgress
}

// SetStatus sets the task status with validation
func (t *Task) SetStatus(status TaskStatus) error {
	if err := status.Validate(); err != nil {
		return err
	}
	
	t.Status = status
	
	// If setting to completed, mark as complete
	if status == TaskStatusCompleted && t.CompletedAt == nil {
		now := time.Now()
		t.CompletedAt = &now
	}
	
	// If changing from completed to another status, clear CompletedAt
	if status != TaskStatusCompleted && t.CompletedAt != nil {
		t.CompletedAt = nil
	}
	
	return nil
}

// SetPriority sets the task priority with validation
func (t *Task) SetPriority(priority TaskPriority) error {
	if err := priority.Validate(); err != nil {
		return err
	}
	t.Priority = priority
	return nil
}

// SetDueDate sets the due date for the task
func (t *Task) SetDueDate(dueDate *time.Time) {
	t.DueDate = dueDate
}

// GetDaysUntilDue returns the number of days until the task is due
// Returns 0 if no due date is set, negative if overdue
func (t *Task) GetDaysUntilDue() int {
	if t.DueDate == nil {
		return 0
	}
	
	duration := t.DueDate.Sub(time.Now())
	return int(duration.Hours() / 24)
}

// NewTask creates a new Task instance with default values
func NewTask(title, description string, userID uuid.UUID) *Task {
	return &Task{
		ID:          uuid.New(),
		Title:       strings.TrimSpace(title),
		Description: description,
		Status:      TaskStatusPending,
		Priority:    TaskPriorityMedium,
		UserID:      userID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
}

// TaskFilter represents filtering options for tasks
type TaskFilter struct {
	UserID   *uuid.UUID    `json:"user_id,omitempty"`
	Status   *TaskStatus   `json:"status,omitempty"`
	Priority *TaskPriority `json:"priority,omitempty"`
	Overdue  *bool         `json:"overdue,omitempty"`
}

// ApplyFilter applies the filter to a GORM query
func (tf *TaskFilter) ApplyFilter(db *gorm.DB) *gorm.DB {
	query := db
	
	if tf.UserID != nil {
		query = query.Where("user_id = ?", *tf.UserID)
	}
	
	if tf.Status != nil {
		query = query.Where("status = ?", *tf.Status)
	}
	
	if tf.Priority != nil {
		query = query.Where("priority = ?", *tf.Priority)
	}
	
	if tf.Overdue != nil && *tf.Overdue {
		query = query.Where("due_date < ? AND status != ?", time.Now(), TaskStatusCompleted)
	}
	
	return query
}