// Package user provides the user model and related functionality.
package user

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

// Validation constants
const (
	MinPasswordLength = 8
	MaxPasswordLength = 128
	MaxEmailLength    = 255
	MaxNameLength     = 100
	BcryptCost        = 12
)

// Custom error types
var (
	ErrInvalidEmail      = errors.New("invalid email format")
	ErrEmailTooLong      = errors.New("email exceeds maximum length")
	ErrNameTooLong       = errors.New("name exceeds maximum length")
	ErrNameRequired      = errors.New("name is required")
	ErrPasswordTooShort  = errors.New("password is too short")
	ErrPasswordTooLong   = errors.New("password is too long")
	ErrPasswordTooWeak   = errors.New("password does not meet strength requirements")
	ErrPasswordRequired  = errors.New("password is required")
	ErrInvalidPassword   = errors.New("invalid password")
)

// Email validation regex
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// Password strength regex (at least one uppercase, one lowercase, one digit)
var passwordStrengthRegex = regexp.MustCompile(`^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$`)

// User represents a user in the system
type User struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email        string     `gorm:"type:varchar(255);uniqueIndex;not null" json:"email" validate:"required,email,max=255"`
	PasswordHash string     `gorm:"type:varchar(255);not null;column:password_hash" json:"-"`
	Name         string     `gorm:"type:varchar(100);not null" json:"name" validate:"required,max=100"`
	IsActive     bool       `gorm:"type:boolean;not null;default:true" json:"is_active"`
	LastLogin    *time.Time `gorm:"type:timestamp" json:"last_login,omitempty"`
	CreatedAt    time.Time  `gorm:"type:timestamp;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"type:timestamp;not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

// TableName returns the table name for the User model
func (User) TableName() string {
	return "users"
}

// BeforeCreate is a GORM hook that runs before creating a user
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	now := time.Now()
	u.CreatedAt = now
	u.UpdatedAt = now
	return u.validate()
}

// BeforeUpdate is a GORM hook that runs before updating a user
func (u *User) BeforeUpdate(tx *gorm.DB) error {
	u.UpdatedAt = time.Now()
	return u.validate()
}

// validate performs comprehensive validation on the user struct
func (u *User) validate() error {
	// Validate email
	if err := u.validateEmail(); err != nil {
		return err
	}

	// Validate name
	if err := u.validateName(); err != nil {
		return err
	}

	// Validate password hash exists
	if strings.TrimSpace(u.PasswordHash) == "" {
		return ErrPasswordRequired
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

	u.Name = name
	return nil
}

// validatePassword validates password strength and length
func validatePassword(password string) error {
	if len(password) < MinPasswordLength {
		return ErrPasswordTooShort
	}

	if len(password) > MaxPasswordLength {
		return ErrPasswordTooLong
	}

	if !passwordStrengthRegex.MatchString(password) {
		return ErrPasswordTooWeak
	}

	return nil
}

// SetPassword hashes the provided password and stores it in PasswordHash
func (u *User) SetPassword(password string) error {
	if password == "" {
		return ErrPasswordRequired
	}

	if err := validatePassword(password); err != nil {
		return fmt.Errorf("password validation failed: %w", err)
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
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

// ToDict serializes the user data to a map, excluding sensitive fields
func (u *User) ToDict() map[string]interface{} {
	result := map[string]interface{}{
		"id":         u.ID,
		"email":      u.Email,
		"name":       u.Name,
		"is_active":  u.IsActive,
		"created_at": u.CreatedAt,
		"updated_at": u.UpdatedAt,
	}

	// Only include last_login if it's not nil
	if u.LastLogin != nil {
		result["last_login"] = *u.LastLogin
	}

	return result
}

// UpdateLastLogin updates the LastLogin field to the current time
func (u *User) UpdateLastLogin() {
	now := time.Now()
	u.LastLogin = &now
	u.UpdatedAt = now
}

// IsValidUUID checks if the user has a valid UUID
func (u *User) IsValidUUID() bool {
	return u.ID != uuid.Nil
}

// String returns a string representation of the user (safe for logging)
func (u *User) String() string {
	return fmt.Sprintf("User{ID: %s, Email: %s, Name: %s, IsActive: %t}",
		u.ID.String(), u.Email, u.Name, u.IsActive)
}

// NewUser creates a new user instance with default values
func NewUser(email, name, password string) (*User, error) {
	user := &User{
		ID:       uuid.New(),
		Email:    email,
		Name:     name,
		IsActive: true,
	}

	if err := user.SetPassword(password); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil
}

// Repository interface for user operations (optional - for dependency injection)
type Repository interface {
	Create(user *User) error
	GetByID(id uuid.UUID) (*User, error)
	GetByEmail(email string) (*User, error)
	Update(user *User) error
	Delete(id uuid.UUID) error
	List(limit, offset int) ([]*User, error)
}

// Migration helper function to auto-migrate the user table
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(&User{})
}