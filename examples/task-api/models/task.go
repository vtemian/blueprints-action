package models

import (
	"errors"
	"time"

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

// IsValid validates the task status
func (ts TaskStatus) IsValid() bool {
	switch ts {
	case TaskStatusPending, TaskStatusInProgress, TaskStatusCompleted:
		return true
	default:
		return false
	}
}

// String returns the string representation of TaskStatus
func (ts TaskStatus) String() string {
	return string(ts)
}

// TaskPriority represents the priority level of a task
type TaskPriority string

const (
	TaskPriorityLow    TaskPriority = "low"
	TaskPriorityMedium TaskPriority = "medium"
	TaskPriorityHigh   TaskPriority = "high"
)

// IsValid validates the task priority
func (tp TaskPriority) IsValid() bool {
	switch tp {
	case TaskPriorityLow, TaskPriorityMedium, TaskPriorityHigh:
		return true
	default:
		return false
	}
}

// String returns the string representation of TaskPriority
func (tp TaskPriority) String() string {
	return string(tp)
}

// Task represents a task in the system
type Task struct {
	ID          uuid.UUID     `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Title       string        `gorm:"type:varchar(200);not null" json:"title" validate:"required,max=200"`
	Description *string       `gorm:"type:text" json:"description,omitempty"`
	Status      TaskStatus    `gorm:"type:varchar(20);not null;default:'pending';index:idx_tasks_status" json:"status"`
	Priority    TaskPriority  `gorm:"type:varchar(10);not null;default:'medium'" json:"priority"`
	DueDate     *time.Time    `gorm:"index:idx_tasks_due_date" json:"due_date,omitempty"`
	CompletedAt *time.Time    `json:"completed_at,omitempty"`
	UserID      uuid.UUID     `gorm:"type:uuid;not null;index:idx_tasks_user_id;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"user_id"`
	User        *User         `gorm:"foreignKey:UserID;references:ID" json:"user,omitempty"`
	CreatedAt   time.Time     `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time     `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName returns the table name for the Task model
func (Task) TableName() string {
	return "tasks"
}

// BeforeCreate is a GORM hook that runs before creating a task
func (t *Task) BeforeCreate(tx *gorm.DB) error {
	// Generate UUID if not provided
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}

	// Validate status
	if !t.Status.IsValid() {
		return errors.New("invalid task status")
	}

	// Validate priority
	if !t.Priority.IsValid() {
		return errors.New("invalid task priority")
	}

	// Set default status if empty
	if t.Status == "" {
		t.Status = TaskStatusPending
	}

	// Set default priority if empty
	if t.Priority == "" {
		t.Priority = TaskPriorityMedium
	}

	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a task
func (t *Task) BeforeUpdate(tx *gorm.DB) error {
	// Validate status
	if !t.Status.IsValid() {
		return errors.New("invalid task status")
	}

	// Validate priority
	if !t.Priority.IsValid() {
		return errors.New("invalid task priority")
	}

	return nil
}

// MarkComplete marks the task as completed and sets the completed_at timestamp
func (t *Task) MarkComplete() error {
	if t.Status == TaskStatusCompleted {
		return errors.New("task is already completed")
	}

	now := time.Now()
	t.Status = TaskStatusCompleted
	t.CompletedAt = &now

	return nil
}

// IsOverdue checks if the task is overdue based on the due date
func (t *Task) IsOverdue() bool {
	// If no due date is set, task cannot be overdue
	if t.DueDate == nil {
		return false
	}

	// If task is already completed, it's not overdue
	if t.Status == TaskStatusCompleted {
		return false
	}

	// Check if current time is after the due date
	return time.Now().After(*t.DueDate)
}

// IsCompleted checks if the task is completed
func (t *Task) IsCompleted() bool {
	return t.Status == TaskStatusCompleted
}

// GetDaysUntilDue returns the number of days until the task is due
// Returns nil if no due date is set
func (t *Task) GetDaysUntilDue() *int {
	if t.DueDate == nil {
		return nil
	}

	days := int(time.Until(*t.DueDate).Hours() / 24)
	return &days
}

// SetDueDate sets the due date for the task
func (t *Task) SetDueDate(dueDate time.Time) {
	t.DueDate = &dueDate
}

// ClearDueDate removes the due date from the task
func (t *Task) ClearDueDate() {
	t.DueDate = nil
}

// UpdateStatus updates the task status with validation
func (t *Task) UpdateStatus(status TaskStatus) error {
	if !status.IsValid() {
		return errors.New("invalid task status")
	}

	t.Status = status

	// If marking as completed, set completed_at timestamp
	if status == TaskStatusCompleted && t.CompletedAt == nil {
		now := time.Now()
		t.CompletedAt = &now
	}

	// If changing from completed to another status, clear completed_at
	if status != TaskStatusCompleted && t.CompletedAt != nil {
		t.CompletedAt = nil
	}

	return nil
}

// UpdatePriority updates the task priority with validation
func (t *Task) UpdatePriority(priority TaskPriority) error {
	if !priority.IsValid() {
		return errors.New("invalid task priority")
	}

	t.Priority = priority
	return nil
}