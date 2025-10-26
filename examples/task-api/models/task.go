package models

import (
	"database/sql/driver"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TaskStatus represents the status of a task
type TaskStatus string

const (
	TaskStatusPending    TaskStatus = "pending"
	TaskStatusInProgress TaskStatus = "in_progress"
	TaskStatusCompleted  TaskStatus = "completed"
)

// String returns the string representation of TaskStatus
func (ts TaskStatus) String() string {
	return string(ts)
}

// IsValid checks if the TaskStatus is valid
func (ts TaskStatus) IsValid() bool {
	switch ts {
	case TaskStatusPending, TaskStatusInProgress, TaskStatusCompleted:
		return true
	default:
		return false
	}
}

// Value implements the driver.Valuer interface for database storage
func (ts TaskStatus) Value() (driver.Value, error) {
	if !ts.IsValid() {
		return nil, fmt.Errorf("invalid task status: %s", ts)
	}
	return string(ts), nil
}

// Scan implements the sql.Scanner interface for database retrieval
func (ts *TaskStatus) Scan(value interface{}) error {
	if value == nil {
		*ts = TaskStatusPending
		return nil
	}

	switch v := value.(type) {
	case string:
		*ts = TaskStatus(v)
	case []byte:
		*ts = TaskStatus(v)
	default:
		return fmt.Errorf("cannot scan %T into TaskStatus", value)
	}

	if !ts.IsValid() {
		return fmt.Errorf("invalid task status: %s", *ts)
	}
	return nil
}

// TaskPriority represents the priority level of a task
type TaskPriority string

const (
	TaskPriorityLow    TaskPriority = "low"
	TaskPriorityMedium TaskPriority = "medium"
	TaskPriorityHigh   TaskPriority = "high"
)

// String returns the string representation of TaskPriority
func (tp TaskPriority) String() string {
	return string(tp)
}

// IsValid checks if the TaskPriority is valid
func (tp TaskPriority) IsValid() bool {
	switch tp {
	case TaskPriorityLow, TaskPriorityMedium, TaskPriorityHigh:
		return true
	default:
		return false
	}
}

// Value implements the driver.Valuer interface for database storage
func (tp TaskPriority) Value() (driver.Value, error) {
	if !tp.IsValid() {
		return nil, fmt.Errorf("invalid task priority: %s", tp)
	}
	return string(tp), nil
}

// Scan implements the sql.Scanner interface for database retrieval
func (tp *TaskPriority) Scan(value interface{}) error {
	if value == nil {
		*tp = TaskPriorityMedium
		return nil
	}

	switch v := value.(type) {
	case string:
		*tp = TaskPriority(v)
	case []byte:
		*tp = TaskPriority(v)
	default:
		return fmt.Errorf("cannot scan %T into TaskPriority", value)
	}

	if !tp.IsValid() {
		return fmt.Errorf("invalid task priority: %s", *tp)
	}
	return nil
}

// Task represents a task in the system
type Task struct {
	ID          uuid.UUID     `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Title       string        `gorm:"type:varchar(200);not null;index" json:"title" validate:"required,max=200"`
	Description *string       `gorm:"type:text" json:"description,omitempty"`
	Status      TaskStatus    `gorm:"type:varchar(20);not null;default:'pending';index" json:"status" validate:"required"`
	Priority    TaskPriority  `gorm:"type:varchar(10);not null;default:'medium';index" json:"priority" validate:"required"`
	DueDate     *time.Time    `gorm:"type:timestamp" json:"due_date,omitempty"`
	CompletedAt *time.Time    `gorm:"type:timestamp" json:"completed_at,omitempty"`
	UserID      uuid.UUID     `gorm:"type:uuid;not null;index" json:"user_id" validate:"required"`
	User        *User         `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"user,omitempty"`
	CreatedAt   time.Time     `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time     `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
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

// BeforeCreate is a GORM hook that runs before creating a task
func (t *Task) BeforeCreate(tx *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	
	// Validate the task
	if err := t.Validate(); err != nil {
		return err
	}
	
	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a task
func (t *Task) BeforeUpdate(tx *gorm.DB) error {
	return t.Validate()
}

// Validate validates the task fields
func (t *Task) Validate() error {
	validate := validator.New()
	
	// Register custom validators for enums
	validate.RegisterValidation("task_status", validateTaskStatus)
	validate.RegisterValidation("task_priority", validateTaskPriority)
	
	if err := validate.Struct(t); err != nil {
		return fmt.Errorf("task validation failed: %w", err)
	}
	
	// Additional custom validations
	if !t.Status.IsValid() {
		return fmt.Errorf("invalid task status: %s", t.Status)
	}
	
	if !t.Priority.IsValid() {
		return fmt.Errorf("invalid task priority: %s", t.Priority)
	}
	
	if t.UserID == uuid.Nil {
		return errors.New("user_id is required")
	}
	
	if strings.TrimSpace(t.Title) == "" {
		return errors.New("title is required")
	}
	
	return nil
}

// MarkComplete marks the task as completed and sets the completion timestamp
func (t *Task) MarkComplete() error {
	if t.Status == TaskStatusCompleted {
		return errors.New("task is already completed")
	}
	
	now := time.Now()
	t.Status = TaskStatusCompleted
	t.CompletedAt = &now
	
	return nil
}

// IsOverdue checks if the task is overdue based on its due date
func (t *Task) IsOverdue() bool {
	// If no due date is set, task cannot be overdue
	if t.DueDate == nil {
		return false
	}
	
	// If task is completed, it's not considered overdue
	if t.Status == TaskStatusCompleted {
		return false
	}
	
	// Check if current time is past the due date
	return time.Now().After(*t.DueDate)
}

// IsCompleted checks if the task is completed
func (t *Task) IsCompleted() bool {
	return t.Status == TaskStatusCompleted
}

// SetDueDate sets the due date for the task
func (t *Task) SetDueDate(dueDate time.Time) {
	t.DueDate = &dueDate
}

// ClearDueDate removes the due date from the task
func (t *Task) ClearDueDate() {
	t.DueDate = nil
}

// SetDescription sets the description for the task
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

// UpdateStatus updates the task status with validation
func (t *Task) UpdateStatus(status TaskStatus) error {
	if !status.IsValid() {
		return fmt.Errorf("invalid task status: %s", status)
	}
	
	// If marking as completed, set completion timestamp
	if status == TaskStatusCompleted && t.Status != TaskStatusCompleted {
		now := time.Now()
		t.CompletedAt = &now
	}
	
	// If changing from completed to another status, clear completion timestamp
	if t.Status == TaskStatusCompleted && status != TaskStatusCompleted {
		t.CompletedAt = nil
	}
	
	t.Status = status
	return nil
}

// UpdatePriority updates the task priority with validation
func (t *Task) UpdatePriority(priority TaskPriority) error {
	if !priority.IsValid() {
		return fmt.Errorf("invalid task priority: %s", priority)
	}
	
	t.Priority = priority
	return nil
}

// Custom validator functions
func validateTaskStatus(fl validator.FieldLevel) bool {
	status := TaskStatus(fl.Field().String())
	return status.IsValid()
}

func validateTaskPriority(fl validator.FieldLevel) bool {
	priority := TaskPriority(fl.Field().String())
	return priority.IsValid()
}

// User represents a minimal user model for the foreign key relationship
// This should be defined in a separate user package in a real application
type User struct {
	ID        uuid.UUID      `gorm:"type:uuid;primary_key" json:"id"`
	Email     string         `gorm:"uniqueIndex" json:"email"`
	Name      string         `json:"name"`
	CreatedAt time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName specifies the table name for the User model
func (User) TableName() string {
	return "users"
}