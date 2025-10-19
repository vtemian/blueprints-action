package models

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
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

// IsValid validates if the TaskStatus is valid
func (ts TaskStatus) IsValid() bool {
	switch ts {
	case TaskStatusPending, TaskStatusInProgress, TaskStatusCompleted:
		return true
	default:
		return false
	}
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

// IsValid validates if the TaskPriority is valid
func (tp TaskPriority) IsValid() bool {
	switch tp {
	case TaskPriorityLow, TaskPriorityMedium, TaskPriorityHigh:
		return true
	default:
		return false
	}
}

// Task represents a task in the system
type Task struct {
	ID          uuid.UUID     `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Title       string        `json:"title" gorm:"type:varchar(200);not null;index"`
	Description *string       `json:"description,omitempty" gorm:"type:text"`
	Status      TaskStatus    `json:"status" gorm:"type:varchar(20);not null;index;default:'pending'"`
	Priority    TaskPriority  `json:"priority" gorm:"type:varchar(10);not null;index;default:'medium'"`
	UserID      uuid.UUID     `json:"user_id" gorm:"type:uuid;not null;index;constraint:OnDelete:CASCADE"`
	DueDate     *time.Time    `json:"due_date,omitempty" gorm:"index"`
	CompletedAt *time.Time    `json:"completed_at,omitempty"`
	CreatedAt   time.Time     `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt   time.Time     `json:"updated_at" gorm:"autoUpdateTime"`
}

// TableName returns the table name for GORM
func (Task) TableName() string {
	return "tasks"
}

// TaskCreateParams holds parameters for creating a new task
type TaskCreateParams struct {
	Title       string
	Description *string
	Status      TaskStatus
	Priority    TaskPriority
	UserID      uuid.UUID
	DueDate     *time.Time
}

// NewTask creates a new Task instance with validation
func NewTask(params TaskCreateParams) (*Task, error) {
	// Validate title
	if err := validateTitle(params.Title); err != nil {
		return nil, err
	}

	// Validate status
	if !params.Status.IsValid() {
		return nil, errors.New("invalid task status")
	}

	// Validate priority
	if !params.Priority.IsValid() {
		return nil, errors.New("invalid task priority")
	}

	// Validate user ID
	if params.UserID == uuid.Nil {
		return nil, errors.New("user_id is required")
	}

	now := time.Now()
	task := &Task{
		ID:          uuid.New(),
		Title:       strings.TrimSpace(params.Title),
		Description: params.Description,
		Status:      params.Status,
		Priority:    params.Priority,
		UserID:      params.UserID,
		DueDate:     params.DueDate,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	return task, nil
}

// validateTitle validates the task title
func validateTitle(title string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return errors.New("title is required")
	}
	if len(title) > 200 {
		return errors.New("title must not exceed 200 characters")
	}
	return nil
}

// MarkComplete marks the task as completed and sets the completed_at timestamp
func (t *Task) MarkComplete() {
	t.Status = TaskStatusCompleted
	now := time.Now()
	t.CompletedAt = &now
	t.UpdatedAt = now
}

// IsOverdue returns true if the task is past its due date
func (t *Task) IsOverdue() bool {
	// If no due date is set, task cannot be overdue
	if t.DueDate == nil {
		return false
	}

	// If task is already completed, it's not considered overdue
	if t.Status == TaskStatusCompleted {
		return false
	}

	// Check if current time is after due date
	return time.Now().After(*t.DueDate)
}

// SetTitle updates the task title with validation
func (t *Task) SetTitle(title string) error {
	if err := validateTitle(title); err != nil {
		return err
	}
	t.Title = strings.TrimSpace(title)
	t.UpdatedAt = time.Now()
	return nil
}

// SetStatus updates the task status with validation
func (t *Task) SetStatus(status TaskStatus) error {
	if !status.IsValid() {
		return errors.New("invalid task status")
	}
	
	// If setting to completed, use MarkComplete method instead
	if status == TaskStatusCompleted {
		t.MarkComplete()
		return nil
	}
	
	// If changing from completed to another status, clear completed_at
	if t.Status == TaskStatusCompleted && status != TaskStatusCompleted {
		t.CompletedAt = nil
	}
	
	t.Status = status
	t.UpdatedAt = time.Now()
	return nil
}

// SetPriority updates the task priority with validation
func (t *Task) SetPriority(priority TaskPriority) error {
	if !priority.IsValid() {
		return errors.New("invalid task priority")
	}
	t.Priority = priority
	t.UpdatedAt = time.Now()
	return nil
}

// SetDescription updates the task description
func (t *Task) SetDescription(description *string) {
	t.Description = description
	t.UpdatedAt = time.Now()
}

// SetDueDate updates the task due date
func (t *Task) SetDueDate(dueDate *time.Time) {
	t.DueDate = dueDate
	t.UpdatedAt = time.Now()
}

// IsCompleted returns true if the task is completed
func (t *Task) IsCompleted() bool {
	return t.Status == TaskStatusCompleted
}

// GetDescription returns the description value or empty string if nil
func (t *Task) GetDescription() string {
	if t.Description == nil {
		return ""
	}
	return *t.Description
}

// HasDescription returns true if the task has a description
func (t *Task) HasDescription() bool {
	return t.Description != nil && *t.Description != ""
}

// DaysUntilDue returns the number of days until the due date
// Returns 0 if no due date is set or if past due
func (t *Task) DaysUntilDue() int {
	if t.DueDate == nil {
		return 0
	}
	
	days := int(time.Until(*t.DueDate).Hours() / 24)
	if days < 0 {
		return 0
	}
	return days
}

// Validate performs comprehensive validation on the task
func (t *Task) Validate() error {
	if err := validateTitle(t.Title); err != nil {
		return err
	}
	
	if !t.Status.IsValid() {
		return errors.New("invalid task status")
	}
	
	if !t.Priority.IsValid() {
		return errors.New("invalid task priority")
	}
	
	if t.UserID == uuid.Nil {
		return errors.New("user_id is required")
	}
	
	// Validate that completed tasks have completed_at timestamp
	if t.Status == TaskStatusCompleted && t.CompletedAt == nil {
		return errors.New("completed tasks must have completed_at timestamp")
	}
	
	// Validate that non-completed tasks don't have completed_at timestamp
	if t.Status != TaskStatusCompleted && t.CompletedAt != nil {
		return errors.New("non-completed tasks cannot have completed_at timestamp")
	}
	
	return nil
}