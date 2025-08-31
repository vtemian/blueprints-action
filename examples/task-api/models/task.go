package models

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Status represents the current state of a task
type Status string

// Priority represents the importance level of a task
type Priority string

// Status constants
const (
	StatusPending    Status = "pending"
	StatusInProgress Status = "in_progress"
	StatusCompleted  Status = "completed"
)

// Priority constants
const (
	PriorityLow    Priority = "low"
	PriorityMedium Priority = "medium"
	PriorityHigh   Priority = "high"
)

// Custom error variables
var (
	ErrInvalidTitle       = errors.New("title must be between 1 and 200 characters")
	ErrInvalidStatus      = errors.New("invalid status value")
	ErrInvalidPriority    = errors.New("invalid priority value")
	ErrInvalidUserID      = errors.New("user ID cannot be nil")
	ErrTaskAlreadyComplete = errors.New("task is already completed")
	ErrEmptyTitle         = errors.New("title cannot be empty")
)

// IsValid validates if the status value is one of the allowed values
func (s Status) IsValid() bool {
	switch s {
	case StatusPending, StatusInProgress, StatusCompleted:
		return true
	default:
		return false
	}
}

// IsValid validates if the priority value is one of the allowed values
func (p Priority) IsValid() bool {
	switch p {
	case PriorityLow, PriorityMedium, PriorityHigh:
		return true
	default:
		return false
	}
}

// Task represents a task in the system
type Task struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	Title       string     `json:"title" db:"title"`
	Description *string    `json:"description,omitempty" db:"description"`
	Status      Status     `json:"status" db:"status"`
	Priority    Priority   `json:"priority" db:"priority"`
	UserID      uuid.UUID  `json:"user_id" db:"user_id"`
	DueDate     *time.Time `json:"due_date,omitempty" db:"due_date"`
	CompletedAt *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}

// NewTask creates a new Task instance with the provided title and userID
// It initializes the task with default values and validates the input
func NewTask(title string, userID uuid.UUID) (*Task, error) {
	// Validate title
	if err := validateTitle(title); err != nil {
		return nil, err
	}

	// Validate userID
	if userID == uuid.Nil {
		return nil, ErrInvalidUserID
	}

	now := time.Now().UTC()
	
	task := &Task{
		ID:        uuid.New(),
		Title:     strings.TrimSpace(title),
		Status:    StatusPending,
		Priority:  PriorityMedium,
		UserID:    userID,
		CreatedAt: now,
		UpdatedAt: now,
	}

	return task, nil
}

// Validate performs comprehensive validation on the Task struct
func (t *Task) Validate() error {
	if t == nil {
		return errors.New("task cannot be nil")
	}

	// Validate ID
	if t.ID == uuid.Nil {
		return errors.New("task ID cannot be nil")
	}

	// Validate title
	if err := validateTitle(t.Title); err != nil {
		return err
	}

	// Validate status
	if !t.Status.IsValid() {
		return fmt.Errorf("%w: %s", ErrInvalidStatus, t.Status)
	}

	// Validate priority
	if !t.Priority.IsValid() {
		return fmt.Errorf("%w: %s", ErrInvalidPriority, t.Priority)
	}

	// Validate userID
	if t.UserID == uuid.Nil {
		return ErrInvalidUserID
	}

	// Validate business logic constraints
	if t.Status == StatusCompleted && t.CompletedAt == nil {
		return errors.New("completed tasks must have a completion date")
	}

	if t.Status != StatusCompleted && t.CompletedAt != nil {
		return errors.New("non-completed tasks cannot have a completion date")
	}

	// Validate timestamps
	if t.CreatedAt.IsZero() {
		return errors.New("created_at cannot be zero")
	}

	if t.UpdatedAt.IsZero() {
		return errors.New("updated_at cannot be zero")
	}

	if t.UpdatedAt.Before(t.CreatedAt) {
		return errors.New("updated_at cannot be before created_at")
	}

	return nil
}

// MarkComplete marks the task as completed and sets the completion timestamp
// Returns an error if the task is already completed
func (t *Task) MarkComplete() error {
	if t == nil {
		return errors.New("task cannot be nil")
	}

	if t.Status == StatusCompleted {
		return ErrTaskAlreadyComplete
	}

	now := time.Now().UTC()
	t.Status = StatusCompleted
	t.CompletedAt = &now
	t.UpdatedAt = now

	return nil
}

// IsOverdue returns true if the task has a due date that has passed
// and the task is not yet completed
func (t *Task) IsOverdue() bool {
	if t == nil {
		return false
	}

	// Task is not overdue if it's already completed
	if t.Status == StatusCompleted {
		return false
	}

	// Task is not overdue if there's no due date
	if t.DueDate == nil {
		return false
	}

	// Check if due date has passed
	return time.Now().UTC().After(*t.DueDate)
}

// SetDescription sets the task description
func (t *Task) SetDescription(description string) {
	if t == nil {
		return
	}

	if description == "" {
		t.Description = nil
	} else {
		trimmed := strings.TrimSpace(description)
		t.Description = &trimmed
	}
	
	t.UpdatedAt = time.Now().UTC()
}

// SetDueDate sets the task due date
func (t *Task) SetDueDate(dueDate *time.Time) {
	if t == nil {
		return
	}

	t.DueDate = dueDate
	t.UpdatedAt = time.Now().UTC()
}

// SetPriority sets the task priority after validation
func (t *Task) SetPriority(priority Priority) error {
	if t == nil {
		return errors.New("task cannot be nil")
	}

	if !priority.IsValid() {
		return fmt.Errorf("%w: %s", ErrInvalidPriority, priority)
	}

	t.Priority = priority
	t.UpdatedAt = time.Now().UTC()
	
	return nil
}

// SetStatus sets the task status after validation
func (t *Task) SetStatus(status Status) error {
	if t == nil {
		return errors.New("task cannot be nil")
	}

	if !status.IsValid() {
		return fmt.Errorf("%w: %s", ErrInvalidStatus, status)
	}

	// Handle completion logic
	if status == StatusCompleted && t.Status != StatusCompleted {
		return t.MarkComplete()
	}

	// Handle uncompleting a task
	if status != StatusCompleted && t.Status == StatusCompleted {
		t.CompletedAt = nil
	}

	t.Status = status
	t.UpdatedAt = time.Now().UTC()
	
	return nil
}

// UpdateTitle updates the task title after validation
func (t *Task) UpdateTitle(title string) error {
	if t == nil {
		return errors.New("task cannot be nil")
	}

	if err := validateTitle(title); err != nil {
		return err
	}

	t.Title = strings.TrimSpace(title)
	t.UpdatedAt = time.Now().UTC()
	
	return nil
}

// validateTitle validates the title field according to business rules
func validateTitle(title string) error {
	trimmed := strings.TrimSpace(title)
	
	if trimmed == "" {
		return ErrEmptyTitle
	}

	if len(trimmed) > 200 {
		return ErrInvalidTitle
	}

	return nil
}

// String returns a string representation of the task
func (t *Task) String() string {
	if t == nil {
		return "<nil>"
	}
	
	return fmt.Sprintf("Task{ID: %s, Title: %s, Status: %s, Priority: %s}", 
		t.ID.String(), t.Title, t.Status, t.Priority)
}