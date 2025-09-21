package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// User represents a user in the system
type User struct {
	ID           uuid.UUID  `json:"id" db:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Email        string     `json:"email" db:"email" gorm:"uniqueIndex;not null" validate:"required,email"`
	PasswordHash string     `json:"-" db:"password_hash" gorm:"not null" validate:"required"`
	Name         string     `json:"name" db:"name" gorm:"not null" validate:"required"`
	IsActive     bool       `json:"is_active" db:"is_active" gorm:"default:true"`
	LastLogin    *time.Time `json:"last_login,omitempty" db:"last_login" gorm:"type:timestamp"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt    time.Time  `json:"updated_at" db:"updated_at" gorm:"autoUpdateTime"`
	Tasks        []Task     `json:"tasks,omitempty" gorm:"foreignKey:UserID"`
}

// Task represents a task associated with a user
type Task struct {
	ID          uuid.UUID `json:"id" db:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	UserID      uuid.UUID `json:"user_id" db:"user_id" gorm:"type:uuid;not null;index"`
	Title       string    `json:"title" db:"title" gorm:"not null"`
	Description string    `json:"description" db:"description"`
	Completed   bool      `json:"completed" db:"completed" gorm:"default:false"`
	CreatedAt   time.Time `json:"created_at" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at" gorm:"autoUpdateTime"`
}

// UserDict represents the dictionary format of a user for API responses
type UserDict struct {
	ID        string     `json:"id"`
	Email     string     `json:"email"`
	Name      string     `json:"name"`
	IsActive  bool       `json:"is_active"`
	LastLogin *time.Time `json:"last_login,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	Tasks     []Task     `json:"tasks,omitempty"`
}

var (
	// ErrInvalidEmail is returned when email format is invalid
	ErrInvalidEmail = errors.New("invalid email format")
	// ErrEmptyPassword is returned when password is empty
	ErrEmptyPassword = errors.New("password cannot be empty")
	// ErrEmptyName is returned when name is empty
	ErrEmptyName = errors.New("name cannot be empty")
	// ErrInvalidPassword is returned when password verification fails
	ErrInvalidPassword = errors.New("invalid password")
)

// Email validation regex pattern
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// NewUser creates a new User instance with generated UUID and current timestamps
func NewUser(email, name, password string) (*User, error) {
	user := &User{
		ID:        uuid.New(),
		Email:     email,
		Name:      name,
		IsActive:  true,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	if err := user.Validate(); err != nil {
		return nil, err
	}

	if err := user.SetPassword(password); err != nil {
		return nil, err
	}

	return user, nil
}

// Validate validates the user fields
func (u *User) Validate() error {
	if u.Email == "" {
		return ErrInvalidEmail
	}

	if !emailRegex.MatchString(u.Email) {
		return ErrInvalidEmail
	}

	if u.Name == "" {
		return ErrEmptyName
	}

	return nil
}

// SetPassword hashes and sets the user's password
func (u *User) SetPassword(password string) error {
	if password == "" {
		return ErrEmptyPassword
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	u.PasswordHash = string(hashedPassword)
	u.UpdatedAt = time.Now().UTC()
	return nil
}

// CheckPassword verifies if the provided password matches the stored hash
func (u *User) CheckPassword(password string) error {
	if password == "" {
		return ErrEmptyPassword
	}

	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	if err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return ErrInvalidPassword
		}
		return fmt.Errorf("failed to compare password: %w", err)
	}

	return nil
}

// ToDict converts the User struct to a UserDict for API responses
func (u *User) ToDict() UserDict {
	return UserDict{
		ID:        u.ID.String(),
		Email:     u.Email,
		Name:      u.Name,
		IsActive:  u.IsActive,
		LastLogin: u.LastLogin,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
		Tasks:     u.Tasks,
	}
}

// UpdateLastLogin updates the user's last login timestamp
func (u *User) UpdateLastLogin() {
	now := time.Now().UTC()
	u.LastLogin = &now
	u.UpdatedAt = now
}

// Activate sets the user as active
func (u *User) Activate() {
	u.IsActive = true
	u.UpdatedAt = time.Now().UTC()
}

// Deactivate sets the user as inactive
func (u *User) Deactivate() {
	u.IsActive = false
	u.UpdatedAt = time.Now().UTC()
}

// TableName returns the table name for GORM
func (User) TableName() string {
	return "users"
}

// TableName returns the table name for GORM
func (Task) TableName() string {
	return "tasks"
}

// Value implements the driver.Valuer interface for database storage
func (u User) Value() (driver.Value, error) {
	return json.Marshal(u)
}

// Scan implements the sql.Scanner interface for database retrieval
func (u *User) Scan(value interface{}) error {
	if value == nil {
		return nil
	}

	switch v := value.(type) {
	case []byte:
		return json.Unmarshal(v, u)
	case string:
		return json.Unmarshal([]byte(v), u)
	default:
		return fmt.Errorf("cannot scan %T into User", value)
	}
}

// BeforeCreate is a GORM hook that runs before creating a user
func (u *User) BeforeCreate() error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	
	now := time.Now().UTC()
	u.CreatedAt = now
	u.UpdatedAt = now
	
	return u.Validate()
}

// BeforeUpdate is a GORM hook that runs before updating a user
func (u *User) BeforeUpdate() error {
	u.UpdatedAt = time.Now().UTC()
	return u.Validate()
}

// String returns a string representation of the user
func (u *User) String() string {
	return fmt.Sprintf("User{ID: %s, Email: %s, Name: %s, IsActive: %t}", 
		u.ID.String(), u.Email, u.Name, u.IsActive)
}

// IsPasswordSet checks if the user has a password set
func (u *User) IsPasswordSet() bool {
	return u.PasswordHash != ""
}

// GetTasks returns the user's tasks (for lazy loading scenarios)
func (u *User) GetTasks() []Task {
	if u.Tasks == nil {
		return []Task{}
	}
	return u.Tasks
}

// AddTask adds a task to the user's task list
func (u *User) AddTask(task Task) {
	task.UserID = u.ID
	if u.Tasks == nil {
		u.Tasks = []Task{}
	}
	u.Tasks = append(u.Tasks, task)
}