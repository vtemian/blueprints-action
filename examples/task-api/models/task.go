// Package task provides the Task model and related functionality for task management.
// It includes CRUD operations, validation, and business logic methods.
package task

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jinzhu/gorm"
)

// Status represents the current state of a task
type Status string

const (
	StatusPending    Status = "pending"
	StatusInProgress Status = "in_progress"
	StatusCompleted  Status = "completed"
)

// String returns the string representation of Status
func (s Status) String() string {
	return string(s)
}

// IsValid checks if the status is a valid enum value
func (s Status) IsValid() bool {
	switch s {
	case StatusPending, StatusInProgress, StatusCompleted:
		return true
	default:
		return false
	}
}

// Priority represents the importance level of a task
type Priority string

const (
	PriorityLow    Priority = "low"
	PriorityMedium Priority = "medium"
	PriorityHigh   Priority = "high"
)

// String returns the string representation of Priority
func (p Priority) String() string {
	return string(p)
}

// IsValid checks if the priority is a valid enum value
func (p Priority) IsValid() bool {
	switch p {
	case PriorityLow, PriorityMedium, PriorityHigh:
		return true
	default:
		return false
	}
}

// Custom error types for validation failures
var (
	ErrInvalidTitle       = errors.New("title is required and cannot be empty")
	ErrTitleTooLong      = errors.New("title cannot exceed 200 characters")
	ErrInvalidStatus     = errors.New("invalid status value")
	ErrInvalidPriority   = errors.New("invalid priority value")
	ErrInvalidUserID     = errors.New("user ID is required and must be a valid UUID")
	ErrInvalidDueDate    = errors.New("due date must be in the future for new tasks")
	ErrTaskAlreadyCompleted = errors.New("task is already completed")
)

// ValidationError wraps multiple validation errors
type ValidationError struct {
	Errors []error
}

func (ve *ValidationError) Error() string {
	if len(ve.Errors) == 0 {
		return "validation failed"
	}
	
	var messages []string
	for _, err := range ve.Errors {
		messages = append(messages, err.Error())
	}
	return fmt.Sprintf("validation failed: %s", strings.Join(messages, "; "))
}

// AddError adds an error to the validation error collection
func (ve *ValidationError) AddError(err error) {
	if err != nil {
		ve.Errors = append(ve.Errors, err)
	}
}

// HasErrors returns true if there are validation errors
func (ve *ValidationError) HasErrors() bool {
	return len(ve.Errors) > 0
}

// User represents the user model (assumed to exist)
// This is a minimal definition for the relationship
type User struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Task represents a task in the system with full CRUD capabilities
type Task struct {
	// ID is the unique identifier for the task
	ID uuid.UUID `gorm:"type:uuid;primary_key;default:uuid_generate_v4()" json:"id"`
	
	// Title is the task name (required, max 200 chars)
	Title string `gorm:"type:varchar(200);not null;index" json:"title" validate:"required,max=200"`
	
	// Description provides additional details about the task (optional)
	Description *string `gorm:"type:text" json:"description,omitempty"`
	
	// Status indicates the current state of the task
	Status Status `gorm:"type:varchar(20);not null;index;default:'pending'" json:"status"`
	
	// Priority indicates the importance level of the task
	Priority Priority `gorm:"type:varchar(10);not null;default:'medium'" json:"priority"`
	
	// UserID is the foreign key to the user who owns this task
	UserID uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	
	// User is the relationship to the User model
	User User `gorm:"foreignkey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"user,omitempty"`
	
	// DueDate is when the task should be completed (optional)
	DueDate *time.Time `gorm:"index" json:"due_date,omitempty"`
	
	// CompletedAt is when the task was marked as completed (nullable)
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	
	// CreatedAt is automatically managed by GORM
	CreatedAt time.Time `gorm:"not null" json:"created_at"`
	
	// UpdatedAt is automatically managed by GORM
	UpdatedAt time.Time `gorm:"not null" json:"updated_at"`
}

// TableName specifies the table name for the Task model
func (Task) TableName() string {
	return "tasks"
}

// BeforeCreate is a GORM hook that runs before creating a new task
func (t *Task) BeforeCreate(scope *gorm.Scope) error {
	// Generate UUID if not set
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	
	// Set default status if not provided
	if t.Status == "" {
		t.Status = StatusPending
	}
	
	// Set default priority if not provided
	if t.Priority == "" {
		t.Priority = PriorityMedium
	}
	
	// Ensure timestamps are in UTC
	now := time.Now().UTC()
	if t.CreatedAt.IsZero() {
		t.CreatedAt = now
	}
	if t.UpdatedAt.IsZero() {
		t.UpdatedAt = now
	}
	
	// Convert due date to UTC if set
	if t.DueDate != nil {
		utcDueDate := t.DueDate.UTC()
		t.DueDate = &utcDueDate
	}
	
	// Validate the task
	return t.validate(true)
}

// BeforeUpdate is a GORM hook that runs before updating a task
func (t *Task) BeforeUpdate(scope *gorm.Scope) error {
	// Ensure updated timestamp is in UTC
	t.UpdatedAt = time.Now().UTC()
	
	// Convert due date to UTC if set
	if t.DueDate != nil {
		utcDueDate := t.DueDate.UTC()
		t.DueDate = &utcDueDate
	}
	
	// Convert completed at to UTC if set
	if t.CompletedAt != nil {
		utcCompletedAt := t.CompletedAt.UTC()
		t.CompletedAt = &utcCompletedAt
	}
	
	// Validate the task
	return t.validate(false)
}

// validate performs comprehensive validation of the task
func (t *Task) validate(isCreate bool) error {
	ve := &ValidationError{}
	
	// Validate title
	if strings.TrimSpace(t.Title) == "" {
		ve.AddError(ErrInvalidTitle)
	} else if len(t.Title) > 200 {
		ve.AddError(ErrTitleTooLong)
	}
	
	// Validate status
	if !t.Status.IsValid() {
		ve.AddError(ErrInvalidStatus)
	}
	
	// Validate priority
	if !t.Priority.IsValid() {
		ve.AddError(ErrInvalidPriority)
	}
	
	// Validate user ID
	if t.UserID == uuid.Nil {
		ve.AddError(ErrInvalidUserID)
	}
	
	// Validate due date (only for new tasks)
	if isCreate && t.DueDate != nil {
		now := time.Now().UTC()
		if t.DueDate.Before(now) {
			ve.AddError(ErrInvalidDueDate)
		}
	}
	
	// Return validation errors if any
	if ve.HasErrors() {
		return ve
	}
	
	return nil
}

// MarkComplete sets the task status to completed and records the completion timestamp
func (t *Task) MarkComplete() error {
	if t.Status == StatusCompleted {
		return ErrTaskAlreadyCompleted
	}
	
	now := time.Now().UTC()
	t.Status = StatusCompleted
	t.CompletedAt = &now
	t.UpdatedAt = now
	
	return nil
}

// IsOverdue returns true if the task is past its due date and not completed
func (t *Task) IsOverdue() bool {
	// Task is not overdue if it has no due date
	if t.DueDate == nil {
		return false
	}
	
	// Task is not overdue if it's already completed
	if t.Status == StatusCompleted {
		return false
	}
	
	// Check if current time is past the due date
	now := time.Now().UTC()
	return now.After(*t.DueDate)
}

// IsCompleted returns true if the task is marked as completed
func (t *Task) IsCompleted() bool {
	return t.Status == StatusCompleted
}

// GetTimeUntilDue returns the duration until the task is due
// Returns nil if no due date is set
func (t *Task) GetTimeUntilDue() *time.Duration {
	if t.DueDate == nil {
		return nil
	}
	
	now := time.Now().UTC()
	duration := t.DueDate.Sub(now)
	return &duration
}

// SetDueDate sets the due date for the task, converting to UTC
func (t *Task) SetDueDate(dueDate time.Time) {
	utcDueDate := dueDate.UTC()
	t.DueDate = &utcDueDate
}

// ClearDueDate removes the due date from the task
func (t *Task) ClearDueDate() {
	t.DueDate = nil
}

// UpdateStatus updates the task status with validation
func (t *Task) UpdateStatus(status Status) error {
	if !status.IsValid() {
		return ErrInvalidStatus
	}
	
	t.Status = status
	t.UpdatedAt = time.Now().UTC()
	
	// Clear completed timestamp if status is not completed
	if status != StatusCompleted {
		t.CompletedAt = nil
	}
	
	return nil
}

// UpdatePriority updates the task priority with validation
func (t *Task) UpdatePriority(priority Priority) error {
	if !priority.IsValid() {
		return ErrInvalidPriority
	}
	
	t.Priority = priority
	t.UpdatedAt = time.Now().UTC()
	
	return nil
}

/*
Example Usage:

// Create a new task
task := &Task{
    Title:    "Complete project documentation",
    Priority: PriorityHigh,
    UserID:   userUUID,
}

// Set due date (optional)
dueDate := time.Now().AddDate(0, 0, 7) // Due in 7 days
task.SetDueDate(dueDate)

// Save to database (assuming db is *gorm.DB)
if err := db.Create(task).Error; err != nil {
    log.Printf("Failed to create task: %v", err)
    return err
}

// Mark task as complete
if err := task.MarkComplete(); err != nil {
    log.Printf("Failed to mark task complete: %v", err)
    return err
}

// Save the updated task
if err := db.Save(task).Error; err != nil {
    log.Printf("Failed to save task: %v", err)
    return err
}

// Check if task is overdue
if task.IsOverdue() {
    log.Printf("Task %s is overdue!", task.Title)
}

// Query tasks by status
var pendingTasks []Task
if err := db.Where("status = ?", StatusPending).Find(&pendingTasks).Error; err != nil {
    log.Printf("Failed to fetch pending tasks: %v", err)
    return err
}

// Query tasks with relationships
var tasksWithUsers []Task
if err := db.Preload("User").Find(&tasksWithUsers).Error; err != nil {
    log.Printf("Failed to fetch tasks with users: %v", err)
    return err
}
*/