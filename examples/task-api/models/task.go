package models

import (
	"errors"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Task status constants
const (
	TaskStatusPending    = "pending"
	TaskStatusInProgress = "in_progress"
	TaskStatusCompleted  = "completed"
)

// Task priority constants
const (
	TaskPriorityLow    = "low"
	TaskPriorityMedium = "medium"
	TaskPriorityHigh   = "high"
)

// Task represents a task in the system
type Task struct {
	// ID is the unique identifier for the task
	ID uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id" validate:"required"`

	// Title is the task title with maximum 200 characters
	Title string `gorm:"type:varchar(200);not null;index" json:"title" validate:"required,max=200"`

	// Description is the optional task description
	Description *string `gorm:"type:text" json:"description,omitempty"`

	// Status represents the current status of the task
	Status string `gorm:"type:varchar(20);not null;default:'pending';index" json:"status" validate:"required,oneof=pending in_progress completed"`

	// Priority represents the priority level of the task
	Priority string `gorm:"type:varchar(10);not null;default:'medium'" json:"priority" validate:"required,oneof=low medium high"`

	// UserID is the foreign key referencing the users table
	UserID uuid.UUID `gorm:"type:uuid;not null;index;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"user_id" validate:"required"`

	// DueDate is the optional due date for the task
	DueDate *time.Time `gorm:"type:timestamp;index" json:"due_date,omitempty"`

	// CompletedAt is set when the task is marked as completed
	CompletedAt *time.Time `gorm:"type:timestamp" json:"completed_at,omitempty"`

	// CreatedAt is automatically set when the record is created
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`

	// UpdatedAt is automatically updated when the record is modified
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`

	// User represents the relationship to the User model
	User User `gorm:"foreignKey:UserID;references:ID" json:"user,omitempty"`
}

// User represents a simplified user model for the relationship
// This should match your actual User model structure
type User struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`
	Email     string    `gorm:"uniqueIndex" json:"email"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName specifies the table name for the Task model
func (Task) TableName() string {
	return "tasks"
}

// NewTask creates a new Task instance with default values
func NewTask(title string, userID uuid.UUID) *Task {
	return &Task{
		ID:       uuid.New(),
		Title:    title,
		Status:   TaskStatusPending,
		Priority: TaskPriorityMedium,
		UserID:   userID,
	}
}

// MarkComplete marks the task as completed and sets the completed_at timestamp
func (t *Task) MarkComplete() error {
	if t == nil {
		return errors.New("task is nil")
	}

	now := time.Now()
	t.Status = TaskStatusCompleted
	t.CompletedAt = &now

	return nil
}

// IsOverdue returns true if the task has a due date and it has passed
func (t *Task) IsOverdue() bool {
	if t == nil || t.DueDate == nil {
		return false
	}

	return time.Now().After(*t.DueDate) && t.Status != TaskStatusCompleted
}

// IsCompleted returns true if the task status is completed
func (t *Task) IsCompleted() bool {
	if t == nil {
		return false
	}
	return t.Status == TaskStatusCompleted
}

// SetDueDate sets the due date for the task
func (t *Task) SetDueDate(dueDate time.Time) error {
	if t == nil {
		return errors.New("task is nil")
	}

	t.DueDate = &dueDate
	return nil
}

// ClearDueDate removes the due date from the task
func (t *Task) ClearDueDate() error {
	if t == nil {
		return errors.New("task is nil")
	}

	t.DueDate = nil
	return nil
}

// SetPriority sets the priority of the task with validation
func (t *Task) SetPriority(priority string) error {
	if t == nil {
		return errors.New("task is nil")
	}

	if !isValidPriority(priority) {
		return errors.New("invalid priority: must be low, medium, or high")
	}

	t.Priority = priority
	return nil
}

// SetStatus sets the status of the task with validation
func (t *Task) SetStatus(status string) error {
	if t == nil {
		return errors.New("task is nil")
	}

	if !isValidStatus(status) {
		return errors.New("invalid status: must be pending, in_progress, or completed")
	}

	t.Status = status

	// If setting to completed, set completed_at timestamp
	if status == TaskStatusCompleted && t.CompletedAt == nil {
		now := time.Now()
		t.CompletedAt = &now
	}

	// If changing from completed to another status, clear completed_at
	if status != TaskStatusCompleted {
		t.CompletedAt = nil
	}

	return nil
}

// Validate validates the task using the validator package
func (t *Task) Validate() error {
	if t == nil {
		return errors.New("task is nil")
	}

	validate := validator.New()
	if err := validate.Struct(t); err != nil {
		return err
	}

	// Additional custom validations
	if !isValidStatus(t.Status) {
		return errors.New("invalid status")
	}

	if !isValidPriority(t.Priority) {
		return errors.New("invalid priority")
	}

	return nil
}

// BeforeCreate is a GORM hook that runs before creating a record
func (t *Task) BeforeCreate(tx *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}

	return t.Validate()
}

// BeforeUpdate is a GORM hook that runs before updating a record
func (t *Task) BeforeUpdate(tx *gorm.DB) error {
	return t.Validate()
}

// Helper functions

// isValidStatus checks if the provided status is valid
func isValidStatus(status string) bool {
	validStatuses := []string{TaskStatusPending, TaskStatusInProgress, TaskStatusCompleted}
	for _, validStatus := range validStatuses {
		if status == validStatus {
			return true
		}
	}
	return false
}

// isValidPriority checks if the provided priority is valid
func isValidPriority(priority string) bool {
	validPriorities := []string{TaskPriorityLow, TaskPriorityMedium, TaskPriorityHigh}
	for _, validPriority := range validPriorities {
		if priority == validPriority {
			return true
		}
	}
	return false
}

// GetValidStatuses returns all valid status values
func GetValidStatuses() []string {
	return []string{TaskStatusPending, TaskStatusInProgress, TaskStatusCompleted}
}

// GetValidPriorities returns all valid priority values
func GetValidPriorities() []string {
	return []string{TaskPriorityLow, TaskPriorityMedium, TaskPriorityHigh}
}

// TaskFilter represents filtering options for tasks
type TaskFilter struct {
	UserID    *uuid.UUID `json:"user_id,omitempty"`
	Status    *string    `json:"status,omitempty" validate:"omitempty,oneof=pending in_progress completed"`
	Priority  *string    `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	Overdue   *bool      `json:"overdue,omitempty"`
	Completed *bool      `json:"completed,omitempty"`
}

// ApplyFilter applies the filter to a GORM query
func (f *TaskFilter) ApplyFilter(db *gorm.DB) *gorm.DB {
	if f == nil {
		return db
	}

	if f.UserID != nil {
		db = db.Where("user_id = ?", *f.UserID)
	}

	if f.Status != nil {
		db = db.Where("status = ?", *f.Status)
	}

	if f.Priority != nil {
		db = db.Where("priority = ?", *f.Priority)
	}

	if f.Overdue != nil && *f.Overdue {
		db = db.Where("due_date < ? AND status != ?", time.Now(), TaskStatusCompleted)
	}

	if f.Completed != nil {
		if *f.Completed {
			db = db.Where("status = ?", TaskStatusCompleted)
		} else {
			db = db.Where("status != ?", TaskStatusCompleted)
		}
	}

	return db
}