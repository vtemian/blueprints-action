package models

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// User represents a user in the system
type User struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email        string     `gorm:"type:varchar(255);uniqueIndex;not null" json:"email" validate:"required,email,max=255"`
	PasswordHash string     `gorm:"type:varchar(255);not null" json:"-" validate:"required,max=255"`
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
	ID     uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	Title  string    `gorm:"type:varchar(255);not null" json:"title"`
	// Add other task fields as needed
}

// Constants for validation and security
const (
	MinPasswordLength = 8
	BcryptCost       = 12
	MaxEmailLength   = 255
	MaxNameLength    = 100
	MaxPasswordLength = 255
)

// Regular expression for email validation
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// Custom errors
var (
	ErrInvalidEmail      = errors.New("invalid email format")
	ErrEmailTooLong      = errors.New("email exceeds maximum length of 255 characters")
	ErrNameRequired      = errors.New("name is required")
	ErrNameTooLong       = errors.New("name exceeds maximum length of 100 characters")
	ErrPasswordTooShort  = errors.New("password must be at least 8 characters long")
	ErrPasswordTooLong   = errors.New("password exceeds maximum length of 255 characters")
	ErrPasswordRequired  = errors.New("password is required")
	ErrHashingPassword   = errors.New("failed to hash password")
	ErrInvalidPassword   = errors.New("invalid password")
)

// TableName specifies the table name for GORM
func (User) TableName() string {
	return "users"
}

// BeforeCreate is a GORM hook that runs before creating a user
func (u *User) BeforeCreate(tx *gorm.DB) error {
	// Generate UUID if not set
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	
	// Validate the user data
	if err := u.Validate(); err != nil {
		return err
	}
	
	// Set timestamps
	now := time.Now()
	u.CreatedAt = now
	u.UpdatedAt = now
	
	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a user
func (u *User) BeforeUpdate(tx *gorm.DB) error {
	// Validate the user data
	if err := u.Validate(); err != nil {
		return err
	}
	
	// Update timestamp
	u.UpdatedAt = time.Now()
	
	return nil
}

// Validate performs comprehensive validation on user data
func (u *User) Validate() error {
	// Validate email
	if err := u.validateEmail(); err != nil {
		return err
	}
	
	// Validate name
	if err := u.validateName(); err != nil {
		return err
	}
	
	// Validate password hash (should exist if user is being created/updated)
	if strings.TrimSpace(u.PasswordHash) == "" {
		return ErrPasswordRequired
	}
	
	if len(u.PasswordHash) > MaxPasswordLength {
		return ErrPasswordTooLong
	}
	
	return nil
}

// validateEmail validates the email field
func (u *User) validateEmail() error {
	email := strings.TrimSpace(u.Email)
	if email == "" {
		return ErrInvalidEmail
	}
	
	if len(email) > MaxEmailLength {
		return ErrEmailTooLong
	}
	
	if !emailRegex.MatchString(email) {
		return ErrInvalidEmail
	}
	
	// Normalize email to lowercase
	u.Email = strings.ToLower(email)
	
	return nil
}

// validateName validates the name field
func (u *User) validateName() error {
	name := strings.TrimSpace(u.Name)
	if name == "" {
		return ErrNameRequired
	}
	
	if len(name) > MaxNameLength {
		return ErrNameTooLong
	}
	
	// Normalize name
	u.Name = name
	
	return nil
}

// SetPassword hashes the provided password and stores it in PasswordHash
func (u *User) SetPassword(password string) error {
	// Validate password
	if err := validatePassword(password); err != nil {
		return err
	}
	
	// Hash the password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrHashingPassword, err)
	}
	
	u.PasswordHash = string(hashedPassword)
	return nil
}

// CheckPassword verifies the provided password against the stored hash
func (u *User) CheckPassword(password string) bool {
	if password == "" || u.PasswordHash == "" {
		return false
	}
	
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	return err == nil
}

// ToDict serializes user data to a map, excluding sensitive fields
func (u *User) ToDict() map[string]interface{} {
	result := map[string]interface{}{
		"id":         u.ID,
		"email":      u.Email,
		"name":       u.Name,
		"is_active":  u.IsActive,
		"created_at": u.CreatedAt,
		"updated_at": u.UpdatedAt,
	}
	
	// Include last_login only if it's not nil
	if u.LastLogin != nil {
		result["last_login"] = *u.LastLogin
	}
	
	return result
}

// UpdateLastLogin updates the LastLogin timestamp to the current time
func (u *User) UpdateLastLogin() {
	now := time.Now()
	u.LastLogin = &now
}

// IsValidForCreation checks if the user has all required fields for creation
func (u *User) IsValidForCreation() error {
	if u.Email == "" {
		return ErrInvalidEmail
	}
	
	if u.Name == "" {
		return ErrNameRequired
	}
	
	if u.PasswordHash == "" {
		return ErrPasswordRequired
	}
	
	return u.Validate()
}

// Deactivate sets the user as inactive
func (u *User) Deactivate() {
	u.IsActive = false
}

// Activate sets the user as active
func (u *User) Activate() {
	u.IsActive = true
}

// validatePassword validates password strength and requirements
func validatePassword(password string) error {
	if password == "" {
		return ErrPasswordRequired
	}
	
	if len(password) < MinPasswordLength {
		return ErrPasswordTooShort
	}
	
	if len(password) > MaxPasswordLength {
		return ErrPasswordTooLong
	}
	
	return nil
}

// NewUser creates a new user with the provided details
func NewUser(email, password, name string) (*User, error) {
	user := &User{
		ID:       uuid.New(),
		Email:    email,
		Name:     name,
		IsActive: true,
	}
	
	// Set password (this will validate and hash it)
	if err := user.SetPassword(password); err != nil {
		return nil, err
	}
	
	// Validate the user
	if err := user.IsValidForCreation(); err != nil {
		return nil, err
	}
	
	return user, nil
}

// UserRepository defines the interface for user database operations
type UserRepository interface {
	Create(user *User) error
	GetByID(id uuid.UUID) (*User, error)
	GetByEmail(email string) (*User, error)
	Update(user *User) error
	Delete(id uuid.UUID) error
	List(limit, offset int) ([]*User, error)
}

// Migration function to create the users table with proper indexes
func MigrateUser(db *gorm.DB) error {
	// Auto migrate the User model
	if err := db.AutoMigrate(&User{}); err != nil {
		return fmt.Errorf("failed to migrate User model: %w", err)
	}
	
	// Create additional indexes if needed
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)").Error; err != nil {
		return fmt.Errorf("failed to create is_active index: %w", err)
	}
	
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)").Error; err != nil {
		return fmt.Errorf("failed to create created_at index: %w", err)
	}
	
	return nil
}