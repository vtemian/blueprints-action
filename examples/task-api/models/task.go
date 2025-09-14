// Package models provides data models for the task management system.
// This package contains the Task model and related types for managing
// tasks with proper database integration using GORM.
package models

import (
	"database/sql/driver"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Custom error types for validation
var (
	ErrInvalidStatus   = errors.New("invalid task status")
	ErrInvalidPriority = errors.New("invalid task priority")
	ErrTaskCompleted   = errors.New("task is already completed")
	ErrEmptyTitle      = errors.New("task title cannot be empty")
)

// TaskStatus represents the current state of a task
type TaskStatus string

// TaskStatus constants
const (
	StatusPending    TaskStatus = "pending"
	StatusInProgress TaskStatus = "in_progress"
	StatusCompleted  TaskStatus = "completed"
)

// String returns the string representation of TaskStatus
func (ts TaskStatus) String() string {
	return string(ts)
}

// IsValid checks if the TaskStatus is valid
func (ts TaskStatus) IsValid() bool {
	switch ts {
	case StatusPending, StatusInProgress, StatusCompleted:
		return true
	default:
		return false
	}
}

// Scan implements the sql.Scanner interface for database reads
func (ts *TaskStatus) Scan(value interface{}) error {
	if value == nil {
		*ts = StatusPending
		return nil
	}

	switch v := value.(type) {
	case string:
		*ts = TaskStatus(v)
	case []byte:
		*ts = TaskStatus(string(v))
	default:
		return fmt.Errorf("cannot scan %T into TaskStatus", value)
	}

	if !ts.IsValid() {
		return ErrInvalidStatus
	}

	return nil
}

// Value implements the driver.Valuer interface for database writes
func (ts TaskStatus) Value() (driver.Value, error) {
	if !ts.IsValid() {
		return nil, ErrInvalidStatus
	}
	return string(ts), nil
}

// TaskPriority represents the priority level of a task
type TaskPriority string

// TaskPriority constants
const (
	PriorityLow    TaskPriority = "low"
	PriorityMedium TaskPriority = "medium"
	PriorityHigh   TaskPriority = "high"
)

// String returns the string representation of TaskPriority
func (tp TaskPriority) String() string {
	return string(tp)
}

// IsValid checks if the TaskPriority is valid
func (tp TaskPriority) IsValid() bool {
	switch tp {
	case PriorityLow, PriorityMedium, PriorityHigh:
		return true
	default:
		return false
	}
}

// Scan implements the sql.Scanner interface for database reads
func (tp *TaskPriority) Scan(value interface{}) error {
	if value == nil {
		*tp = PriorityMedium
		return nil
	}

	switch v := value.(type) {
	case string:
		*tp = TaskPriority(v)
	case []byte:
		*tp = TaskPriority(string(v))
	default:
		return fmt.Errorf("cannot scan %T into TaskPriority", value)
	}

	if !tp.IsValid() {
		return ErrInvalidPriority
	}

	return nil
}

// Value implements the driver.Valuer interface for database writes
func (tp TaskPriority) Value() (driver.Value, error) {
	if !tp.IsValid() {
		return nil, ErrInvalidPriority
	}
	return string(tp), nil
}

// Task represents a task in the system with all necessary fields
// and relationships for task management functionality.
type Task struct {
	// ID is the unique identifier for the task
	ID uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`

	// Title is the task title with a maximum length of 200 characters
	Title string `gorm:"type:varchar(200);not null;index" json:"title" validate:"required,max=200"`

	// Description is an optional detailed description of the task
	Description *string `gorm:"type:text" json:"description,omitempty"`

	// Status represents the current state of the task
	Status TaskStatus `gorm:"type:varchar(20);not null;default:'pending';index" json:"status" validate:"required"`

	// Priority represents the priority level of the task
	Priority TaskPriority `gorm:"type:varchar(10);not null;default:'medium';index" json:"priority" validate:"required"`

	// UserID is the foreign key reference to the user who owns this task
	UserID uuid.UUID `gorm:"type:uuid;not null;index:idx_user_tasks" json:"user_id" validate:"required"`

	// DueDate is the optional deadline for the task
	DueDate *time.Time `gorm:"index:idx_due_date" json:"due_date,omitempty"`

	// CompletedAt is set when the task is marked as completed
	CompletedAt *time.Time `gorm:"index:idx_completed_at" json:"completed_at,omitempty"`

	// CreatedAt is automatically managed by GORM
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`

	// UpdatedAt is automatically managed by GORM
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName specifies the table name for the Task model
func (Task) TableName() string {
	return "tasks"
}

// BeforeCreate is a GORM hook that runs before creating a new task
func (t *Task) BeforeCreate(tx *gorm.DB) error {
	// Generate UUID if not provided
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}

	// Validate required fields
	if err := t.Validate(); err != nil {
		return err
	}

	// Set default values
	if t.Status == "" {
		t.Status = StatusPending
	}
	if t.Priority == "" {
		t.Priority = PriorityMedium
	}

	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a task
func (t *Task) BeforeUpdate(tx *gorm.DB) error {
	return t.Validate()
}

// Validate performs validation on the task fields
func (t *Task) Validate() error {
	// Validate title
	if strings.TrimSpace(t.Title) == "" {
		return ErrEmptyTitle
	}
	if len(t.Title) > 200 {
		return errors.New("title cannot exceed 200 characters")
	}

	// Validate status
	if !t.Status.IsValid() {
		return ErrInvalidStatus
	}

	// Validate priority
	if !t.Priority.IsValid() {
		return ErrInvalidPriority
	}

	// Validate UserID
	if t.UserID == uuid.Nil {
		return errors.New("user_id is required")
	}

	return nil
}

// MarkComplete marks the task as completed and sets the completion timestamp.
// Returns an error if the task is already completed.
func (t *Task) MarkComplete() error {
	if t.Status == StatusCompleted {
		return ErrTaskCompleted
	}

	now := time.Now()
	t.Status = StatusCompleted
	t.CompletedAt = &now

	return nil
}

// IsOverdue checks if the task is past its due date and not completed.
// Returns false if the task has no due date or is already completed.
func (t *Task) IsOverdue() bool {
	// Task cannot be overdue if it has no due date
	if t.DueDate == nil {
		return false
	}

	// Completed tasks are not considered overdue
	if t.Status == StatusCompleted {
		return false
	}

	// Check if current time is past the due date
	return time.Now().After(*t.DueDate)
}

// IsCompleted returns true if the task is marked as completed
func (t *Task) IsCompleted() bool {
	return t.Status == StatusCompleted
}

// GetDaysUntilDue returns the number of days until the task is due.
// Returns 0 if the task has no due date or is already overdue.
// Returns negative values for overdue tasks.
func (t *Task) GetDaysUntilDue() int {
	if t.DueDate == nil {
		return 0
	}

	duration := t.DueDate.Sub(time.Now())
	return int(duration.Hours() / 24)
}

// SetDueDate sets the due date for the task
func (t *Task) SetDueDate(dueDate time.Time) {
	t.DueDate = &dueDate
}

// ClearDueDate removes the due date from the task
func (t *Task) ClearDueDate() {
	t.DueDate = nil
}

// SetDescription sets the task description
func (t *Task) SetDescription(description string) {
	if strings.TrimSpace(description) == "" {
		t.Description = nil
	} else {
		t.Description = &description
	}
}

// GetDescription returns the task description or empty string if nil
func (t *Task) GetDescription() string {
	if t.Description == nil {
		return ""
	}
	return *t.Description
}

// HasDescription returns true if the task has a description
func (t *Task) HasDescription() bool {
	return t.Description != nil && strings.TrimSpace(*t.Description) != ""
}

// Clone creates a deep copy of the task
func (t *Task) Clone() *Task {
	clone := *t

	// Handle pointer fields
	if t.Description != nil {
		desc := *t.Description
		clone.Description = &desc
	}
	if t.DueDate != nil {
		due := *t.DueDate
		clone.DueDate = &due
	}
	if t.CompletedAt != nil {
		completed := *t.CompletedAt
		clone.CompletedAt = &completed
	}

	return &clone
}