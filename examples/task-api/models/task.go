// Package models provides data models for the application
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

// TaskPriority represents the priority level of a task
type TaskPriority string

const (
	TaskPriorityLow    TaskPriority = "low"
	TaskPriorityMedium TaskPriority = "medium"
	TaskPriorityHigh   TaskPriority = "high"
)

// Task represents a task in the system
type Task struct {
	ID          uuid.UUID     `gorm:"type:uuid;primaryKey" json:"id"`
	Title       string        `gorm:"size:200;not null" json:"title" validate:"required,max=200"`
	Description *string       `gorm:"type:text" json:"description,omitempty"`
	Status      TaskStatus    `gorm:"type:varchar(20);not null;index:idx_task_status;default:'pending'" json:"status" validate:"required"`
	Priority    TaskPriority  `gorm:"type:varchar(10);not null;default:'medium'" json:"priority" validate:"required"`
	UserID      uuid.UUID     `gorm:"type:uuid;not null;index:idx_task_user_id" json:"user_id" validate:"required"`
	User        User          `gorm:"foreignKey:UserID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"user,omitempty"`
	DueDate     *time.Time    `gorm:"index:idx_task_due_date" json:"due_date,omitempty"`
	CompletedAt *time.Time    `json:"completed_at,omitempty"`
	CreatedAt   time.Time     `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time     `gorm:"autoUpdateTime" json:"updated_at"`
}

// User represents a user in the system (referenced by Task)
type User struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	Email     string    `gorm:"size:255;not null;uniqueIndex" json:"email"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
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
	
	if err := t.Status.Validate(); err != nil {
		return err
	}
	
	if err := t.Priority.Validate(); err != nil {
		return err
	}
	
	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a task
func (t *Task) BeforeUpdate(tx *gorm.DB) error {
	if err := t.Status.Validate(); err != nil {
		return err
	}
	
	if err := t.Priority.Validate(); err != nil {
		return err
	}
	
	return nil
}

// MarkComplete marks the task as completed and sets the completion timestamp
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
	
	// Don't consider completed tasks as overdue
	if t.Status == TaskStatusCompleted {
		return false
	}
	
	return time.Now().After(*t.DueDate)
}

// IsCompleted checks if the task is completed
func (t *Task) IsCompleted() bool {
	if t == nil {
		return false
	}
	return t.Status == TaskStatusCompleted
}

// SetStatus sets the task status with validation
func (t *Task) SetStatus(status TaskStatus) error {
	if t == nil {
		return errors.New("task is nil")
	}
	
	if err := status.Validate(); err != nil {
		return err
	}
	
	t.Status = status
	
	// Clear completed_at if status is not completed
	if status != TaskStatusCompleted {
		t.CompletedAt = nil
	}
	
	return nil
}

// SetPriority sets the task priority with validation
func (t *Task) SetPriority(priority TaskPriority) error {
	if t == nil {
		return errors.New("task is nil")
	}
	
	if err := priority.Validate(); err != nil {
		return err
	}
	
	t.Priority = priority
	return nil
}

// Validate validates the TaskStatus enum value
func (ts TaskStatus) Validate() error {
	switch ts {
	case TaskStatusPending, TaskStatusInProgress, TaskStatusCompleted:
		return nil
	default:
		return errors.New("invalid task status: must be one of 'pending', 'in_progress', or 'completed'")
	}
}

// String returns the string representation of TaskStatus
func (ts TaskStatus) String() string {
	return string(ts)
}

// IsValid checks if the TaskStatus is valid
func (ts TaskStatus) IsValid() bool {
	return ts.Validate() == nil
}

// Validate validates the TaskPriority enum value
func (tp TaskPriority) Validate() error {
	switch tp {
	case TaskPriorityLow, TaskPriorityMedium, TaskPriorityHigh:
		return nil
	default:
		return errors.New("invalid task priority: must be one of 'low', 'medium', or 'high'")
	}
}

// String returns the string representation of TaskPriority
func (tp TaskPriority) String() string {
	return string(tp)
}

// IsValid checks if the TaskPriority is valid
func (tp TaskPriority) IsValid() bool {
	return tp.Validate() == nil
}

// TaskRepository provides database operations for tasks
type TaskRepository struct {
	db *gorm.DB
}

// NewTaskRepository creates a new task repository
func NewTaskRepository(db *gorm.DB) *TaskRepository {
	return &TaskRepository{db: db}
}

// Create creates a new task in the database
func (r *TaskRepository) Create(task *Task) error {
	if task == nil {
		return errors.New("task cannot be nil")
	}
	
	if task.ID == uuid.Nil {
		task.ID = uuid.New()
	}
	
	return r.db.Create(task).Error
}

// GetByID retrieves a task by its ID
func (r *TaskRepository) GetByID(id uuid.UUID) (*Task, error) {
	var task Task
	err := r.db.Preload("User").First(&task, "id = ?", id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("task not found")
		}
		return nil, err
	}
	return &task, nil
}

// GetByUserID retrieves all tasks for a specific user
func (r *TaskRepository) GetByUserID(userID uuid.UUID) ([]*Task, error) {
	var tasks []*Task
	err := r.db.Preload("User").Where("user_id = ?", userID).Find(&tasks).Error
	return tasks, err
}

// GetOverdueTasks retrieves all overdue tasks
func (r *TaskRepository) GetOverdueTasks() ([]*Task, error) {
	var tasks []*Task
	err := r.db.Preload("User").
		Where("due_date < ? AND status != ?", time.Now(), TaskStatusCompleted).
		Find(&tasks).Error
	return tasks, err
}

// Update updates a task in the database
func (r *TaskRepository) Update(task *Task) error {
	if task == nil {
		return errors.New("task cannot be nil")
	}
	
	return r.db.Save(task).Error
}

// Delete deletes a task from the database
func (r *TaskRepository) Delete(id uuid.UUID) error {
	result := r.db.Delete(&Task{}, "id = ?", id)
	if result.Error != nil {
		return result.Error
	}
	
	if result.RowsAffected == 0 {
		return errors.New("task not found")
	}
	
	return nil
}

// GetTasksByStatus retrieves tasks by status
func (r *TaskRepository) GetTasksByStatus(status TaskStatus) ([]*Task, error) {
	if err := status.Validate(); err != nil {
		return nil, err
	}
	
	var tasks []*Task
	err := r.db.Preload("User").Where("status = ?", status).Find(&tasks).Error
	return tasks, err
}

// GetTasksByPriority retrieves tasks by priority
func (r *TaskRepository) GetTasksByPriority(priority TaskPriority) ([]*Task, error) {
	if err := priority.Validate(); err != nil {
		return nil, err
	}
	
	var tasks []*Task
	err := r.db.Preload("User").Where("priority = ?", priority).Find(&tasks).Error
	return tasks, err
}

// AutoMigrate creates the tasks table with proper indexes
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(&Task{}, &User{})
}