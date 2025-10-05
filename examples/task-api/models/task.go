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

// Task represents a task in the system
type Task struct {
	ID          uuid.UUID     `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Title       string        `json:"title" gorm:"type:varchar(200);not null" validate:"required,max=200"`
	Description *string       `json:"description,omitempty" gorm:"type:text"`
	Status      TaskStatus    `json:"status" gorm:"type:varchar(20);not null;default:'pending';index" validate:"required"`
	Priority    TaskPriority  `json:"priority" gorm:"type:varchar(10);not null;default:'medium'" validate:"required"`
	UserID      uuid.UUID     `json:"user_id" gorm:"type:uuid;not null;index" validate:"required"`
	DueDate     *time.Time    `json:"due_date,omitempty" gorm:"index"`
	CompletedAt *time.Time    `json:"completed_at,omitempty"`
	CreatedAt   time.Time     `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt   time.Time     `json:"updated_at" gorm:"autoUpdateTime"`
	
	// Relationship
	User        User          `json:"user,omitempty" gorm:"foreignKey:UserID;references:ID"`
}

// User represents a user in the system (minimal definition for relationship)
type User struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;primary_key"`
	Email     string    `json:"email" gorm:"uniqueIndex"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	
	// Relationship
	Tasks     []Task    `json:"tasks,omitempty" gorm:"foreignKey:UserID"`
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
	
	// Validate enum values
	if !t.Status.IsValid() {
		return errors.New("invalid task status")
	}
	
	if !t.Priority.IsValid() {
		return errors.New("invalid task priority")
	}
	
	// Validate required fields
	if t.Title == "" {
		return errors.New("task title is required")
	}
	
	if len(t.Title) > 200 {
		return errors.New("task title cannot exceed 200 characters")
	}
	
	if t.UserID == uuid.Nil {
		return errors.New("user_id is required")
	}
	
	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a task
func (t *Task) BeforeUpdate(tx *gorm.DB) error {
	// Validate enum values
	if !t.Status.IsValid() {
		return errors.New("invalid task status")
	}
	
	if !t.Priority.IsValid() {
		return errors.New("invalid task priority")
	}
	
	// Validate required fields
	if t.Title == "" {
		return errors.New("task title is required")
	}
	
	if len(t.Title) > 200 {
		return errors.New("task title cannot exceed 200 characters")
	}
	
	return nil
}

// MarkComplete sets the task status to completed and records the completion timestamp
func (t *Task) MarkComplete() error {
	if t == nil {
		return errors.New("task is nil")
	}
	
	now := time.Now()
	t.Status = TaskStatusCompleted
	t.CompletedAt = &now
	
	return nil
}

// IsOverdue checks if the task is past its due date
func (t *Task) IsOverdue() bool {
	if t == nil || t.DueDate == nil {
		return false
	}
	
	// Task is overdue if it's not completed and past due date
	if t.Status != TaskStatusCompleted && time.Now().After(*t.DueDate) {
		return true
	}
	
	return false
}

// IsCompleted checks if the task is completed
func (t *Task) IsCompleted() bool {
	if t == nil {
		return false
	}
	return t.Status == TaskStatusCompleted
}

// SetPriority sets the task priority with validation
func (t *Task) SetPriority(priority TaskPriority) error {
	if t == nil {
		return errors.New("task is nil")
	}
	
	if !priority.IsValid() {
		return errors.New("invalid task priority")
	}
	
	t.Priority = priority
	return nil
}

// SetStatus sets the task status with validation
func (t *Task) SetStatus(status TaskStatus) error {
	if t == nil {
		return errors.New("task is nil")
	}
	
	if !status.IsValid() {
		return errors.New("invalid task status")
	}
	
	t.Status = status
	
	// If setting to completed, also set completed timestamp
	if status == TaskStatusCompleted && t.CompletedAt == nil {
		now := time.Now()
		t.CompletedAt = &now
	}
	
	// If changing from completed to another status, clear completed timestamp
	if status != TaskStatusCompleted && t.CompletedAt != nil {
		t.CompletedAt = nil
	}
	
	return nil
}

// Validate performs comprehensive validation on the task
func (t *Task) Validate() error {
	if t == nil {
		return errors.New("task is nil")
	}
	
	if t.Title == "" {
		return errors.New("task title is required")
	}
	
	if len(t.Title) > 200 {
		return errors.New("task title cannot exceed 200 characters")
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
	
	// Validate that completed tasks have completion timestamp
	if t.Status == TaskStatusCompleted && t.CompletedAt == nil {
		return errors.New("completed tasks must have completion timestamp")
	}
	
	// Validate that non-completed tasks don't have completion timestamp
	if t.Status != TaskStatusCompleted && t.CompletedAt != nil {
		return errors.New("non-completed tasks cannot have completion timestamp")
	}
	
	return nil
}

// TaskRepository defines the interface for task database operations
type TaskRepository interface {
	Create(task *Task) error
	GetByID(id uuid.UUID) (*Task, error)
	GetByUserID(userID uuid.UUID) ([]Task, error)
	Update(task *Task) error
	Delete(id uuid.UUID) error
	GetOverdueTasks() ([]Task, error)
	GetTasksByStatus(status TaskStatus) ([]Task, error)
}

// Migration function to create the tasks table with proper indexes
func MigrateTasks(db *gorm.DB) error {
	// Auto migrate the Task model
	if err := db.AutoMigrate(&Task{}); err != nil {
		return err
	}
	
	// Create additional indexes if they don't exist
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_tasks_user_id_status ON tasks(user_id, status)").Error; err != nil {
		return err
	}
	
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_tasks_due_date_status ON tasks(due_date, status) WHERE due_date IS NOT NULL").Error; err != nil {
		return err
	}
	
	return nil
}