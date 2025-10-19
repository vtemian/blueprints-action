I'll create a complete Go package for the User model with all the specified requirements. Here's the implementation:

## File: `models/user/user.go`

```go
// Package user provides the User model and related functionality for user management
// with database persistence using GORM.
package user

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	// BcryptCost defines the cost factor for bcrypt hashing
	BcryptCost = 12
	// MinPasswordLength defines minimum password length
	MinPasswordLength = 8
	// MaxEmailLength defines maximum email length
	MaxEmailLength = 255
	// MaxPasswordHashLength defines maximum password hash length
	MaxPasswordHashLength = 255
	// MaxNameLength defines maximum name length
	MaxNameLength = 100
)

// User represents a user in the system with authentication and profile information
type User struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email        string     `gorm:"type:varchar(255);uniqueIndex;not null" json:"email" validate:"required,email,max=255"`
	PasswordHash string     `gorm:"type:varchar(255);not null;column:password_hash" json:"-"`
	Name         string     `gorm:"type:varchar(100);not null" json:"name" validate:"required,max=100"`
	IsActive     bool       `gorm:"default:true;not null" json:"is_active"`
	LastLogin    *time.Time `gorm:"type:timestamp" json:"last_login,omitempty"`
	CreatedAt    time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
	
	// Relationships
	Tasks []Task `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"tasks,omitempty"`
}

// Task represents a task associated with a user (placeholder for relationship)
type Task struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	Title     string    `gorm:"type:varchar(255);not null" json:"title"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName returns the table name for the User model
func (User) TableName() string {
	return "users"
}

// TableName returns the table name for the Task model
func (Task) TableName() string {
	return "tasks"
}

// BeforeCreate is a GORM hook that runs before creating a user
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return u.Validate()
}

// BeforeUpdate is a GORM hook that runs before updating a user
func (u *User) BeforeUpdate(tx *gorm.DB) error {
	return u.Validate()
}

// SetPassword hashes the provided password and stores it in PasswordHash field
func (u *User) SetPassword(password string) error {
	if err := ValidatePassword(password); err != nil {
		log.Printf("Password validation failed for user %s: %v", u.Email, err)
		return fmt.Errorf("password validation failed: %w", err)
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		log.Printf("Failed to hash password for user %s: %v", u.Email, err)
		return fmt.Errorf("failed to hash password: %w", err)
	}

	u.PasswordHash = string(hashedPassword)
	log.Printf("Password successfully set for user %s", u.Email)
	return nil
}

// CheckPassword verifies if the provided password matches the stored hash
func (u *User) CheckPassword(password string) bool {
	if u.PasswordHash == "" {
		log.Printf("No password hash found for user %s", u.Email)
		return false
	}

	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	if err != nil {
		log.Printf("Password check failed for user %s: %v", u.Email, err)
		return false
	}

	log.Printf("Password check successful for user %s", u.Email)
	return true
}

// ToDict converts the User model to a map representation, excluding sensitive fields
func (u *User) ToDict() map[string]interface{} {
	result := map[string]interface{}{
		"id":         u.ID,
		"email":      u.Email,
		"name":       u.Name,
		"is_active":  u.IsActive,
		"created_at": u.CreatedAt,
		"updated_at": u.UpdatedAt,
	}

	// Handle nullable LastLogin field
	if u.LastLogin != nil {
		result["last_login"] = *u.LastLogin
	} else {
		result["last_login"] = nil
	}

	// Include tasks if loaded
	if len(u.Tasks) > 0 {
		tasks := make([]map[string]interface{}, len(u.Tasks))
		for i, task := range u.Tasks {
			tasks[i] = map[string]interface{}{
				"id":         task.ID,
				"user_id":    task.UserID,
				"title":      task.Title,
				"created_at": task.CreatedAt,
				"updated_at": task.UpdatedAt,
			}
		}
		result["tasks"] = tasks
	}

	return result
}

// Validate performs comprehensive validation on the User model
func (u *User) Validate() error {
	var errors []string

	// Validate email
	if u.Email == "" {
		errors = append(errors, "email is required")
	} else {
		if len(u.Email) > MaxEmailLength {
			errors = append(errors, fmt.Sprintf("email must not exceed %d characters", MaxEmailLength))
		}
		if !IsValidEmail(u.Email) {
			errors = append(errors, "email format is invalid")
		}
	}

	// Validate name
	if u.Name == "" {
		errors = append(errors, "name is required")
	} else if len(u.Name) > MaxNameLength {
		errors = append(errors, fmt.Sprintf("name must not exceed %d characters", MaxNameLength))
	}

	// Validate password hash (should be set)
	if u.PasswordHash == "" {
		errors = append(errors, "password hash is required")
	} else if len(u.PasswordHash) > MaxPasswordHashLength {
		errors = append(errors, fmt.Sprintf("password hash must not exceed %d characters", MaxPasswordHashLength))
	}

	if len(errors) > 0 {
		return &ValidationError{
			Field:   "user",
			Message: strings.Join(errors, "; "),
			Errors:  errors,
		}
	}

	return nil
}

// UpdateLastLogin updates the LastLogin field to the current time
func (u *User) UpdateLastLogin() {
	now := time.Now()
	u.LastLogin = &now
	log.Printf("Updated last login for user %s to %v", u.Email, now)
}

// IsValidEmail validates email format using regex
func IsValidEmail(email string) bool {
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	return emailRegex.MatchString(email)
}

// ValidatePassword validates password strength requirements
func ValidatePassword(password string) error {
	if len(password) < MinPasswordLength {
		return &ValidationError{
			Field:   "password",
			Message: fmt.Sprintf("password must be at least %d characters long", MinPasswordLength),
		}
	}

	var hasUpper, hasLower, hasDigit, hasSpecial bool
	
	for _, char := range password {
		switch {
		case 'A' <= char && char <= 'Z':
			hasUpper = true
		case 'a' <= char && char <= 'z':
			hasLower = true
		case '0' <= char && char <= '9':
			hasDigit = true
		case strings.ContainsRune("!@#$%^&*()_+-=[]{}|;:,.<>?", char):
			hasSpecial = true
		}
	}

	var errors []string
	if !hasUpper {
		errors = append(errors, "password must contain at least one uppercase letter")
	}
	if !hasLower {
		errors = append(errors, "password must contain at least one lowercase letter")
	}
	if !hasDigit {
		errors = append(errors, "password must contain at least one digit")
	}
	if !hasSpecial {
		errors = append(errors, "password must contain at least one special character")
	}

	if len(errors) > 0 {
		return &ValidationError{
			Field:   "password",
			Message: strings.Join(errors, "; "),
			Errors:  errors,
		}
	}

	return nil
}
```

## File: `models/user/errors.go`

```go
package user

import (
	"errors"
	"fmt"
	"strings"
)

// Common error variables
var (
	ErrUserNotFound     = errors.New("user not found")
	ErrDuplicateEmail   = errors.New("email already exists")
	ErrInvalidPassword  = errors.New("invalid password")
	ErrInvalidEmail     = errors.New("invalid email format")
	ErrUserInactive     = errors.New("user account is inactive")
	ErrDatabaseError    = errors.New("database operation failed")
)

// ValidationError represents validation errors with detailed information
type ValidationError struct {
	Field   string   `json:"field"`
	Message string   `json:"message"`
	Errors  []string `json:"errors,omitempty"`
}

// Error implements the error interface
func (e *ValidationError) Error() string {
	if len(e.Errors) > 0 {
		return fmt.Sprintf("validation failed for %s: %s", e.Field, strings.Join(e.Errors, ", "))
	}
	return fmt.Sprintf("validation failed for %s: %s", e.Field, e.Message)
}

// DatabaseError represents database-related errors
type DatabaseError struct {
	Operation string `json:"operation"`
	Message   string `json:"message"`
	Err       error  `json:"-"`
}

// Error implements the error interface
func (e *DatabaseError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("database error during %s: %s (%v)", e.Operation, e.Message, e.Err)
	}
	return fmt.Sprintf("database error during %s: %s", e.Operation, e.Message)
}

// Unwrap returns the wrapped error
func (e *DatabaseError) Unwrap() error {
	return e.Err
}

// AuthenticationError represents authentication-related errors
type AuthenticationError struct {
	Message string `json:"message"`
	Err     error  `json:"-"`
}

// Error implements the error interface
func (e *AuthenticationError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("authentication error: %s (%v)", e.Message, e.Err)
	}
	return fmt.Sprintf("authentication error: %s", e.Message)
}

// Unwrap returns the wrapped error
func (e *AuthenticationError) Unwrap() error {
	return e.Err
}
```

## File: `models/user/repository.go`

```go
package user

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Repository defines the interface for user data operations
type Repository interface {
	Create(ctx context.Context, user *User) error
	GetByID(ctx context.Context, id uuid.UUID) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	Update(ctx context.Context, user *User) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, limit, offset int) ([]*User, error)
	Count(ctx context.Context) (int64, error)
	GetWithTasks(ctx context.Context, id uuid.UUID) (*User, error)
}

// GormRepository implements Repository interface using GORM
type GormRepository struct {
	db *gorm.DB
}

// NewGormRepository creates a new GORM-based repository
func NewGormRepository(db *gorm.DB) Repository {
	return &GormRepository{db: db}
}

// Create creates a new user in the database
func (r *GormRepository) Create(ctx context.Context, user *User) error {
	if user == nil {
		return &ValidationError{Field: "user", Message: "user cannot be nil"}
	}

	result := r.db.WithContext(ctx).Create(user)
	if result.Error != nil {
		if strings.Contains(result.Error.Error(), "duplicate key") || 
		   strings.Contains(result.Error.Error(), "UNIQUE constraint") {
			log.Printf("Duplicate email attempt: %s", user.Email)
			return &DatabaseError{
				Operation: "create",
				Message:   "email already exists",
				Err:       ErrDuplicateEmail,
			}
		}
		log.Printf("Failed to create user %s: %v", user.Email, result.Error)
		return &DatabaseError{
			Operation: "create",
			Message:   "failed to create user",
			Err:       result.Error,
		}
	}

	log.Printf("Successfully created user %s with ID %s", user.Email, user.ID)
	return nil
}

// GetByID retrieves a user by their ID
func (r *GormRepository) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	if id == uuid.Nil {
		return nil, &ValidationError{Field: "id", Message: "id cannot be nil"}
	}

	var user User
	result := r.db.WithContext(ctx).First(&user, "id = ?", id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			log.Printf("User not found with ID: %s", id)
			return nil, ErrUserNotFound
		}
		log.Printf("Failed to get user by ID %s: %v", id, result.Error)
		return nil, &DatabaseError{
			Operation: "get_by_id",
			Message:   "failed to retrieve user",
			Err:       result.Error,
		}
	}

	return &user, nil
}

// GetByEmail retrieves a user by their email address
func (r *GormRepository) GetByEmail(ctx context.Context, email string) (*User, error) {
	if email == "" {
		return nil, &ValidationError{Field: "email", Message: "email cannot be empty"}
	}

	var