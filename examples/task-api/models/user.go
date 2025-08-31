// Package models provides data models for the application.
package models

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	// MinPasswordLength defines the minimum password length
	MinPasswordLength = 8
	// BcryptCost defines the bcrypt hashing cost
	BcryptCost = 12
	// MaxEmailLength defines the maximum email length
	MaxEmailLength = 255
	// MaxPasswordHashLength defines the maximum password hash length
	MaxPasswordHashLength = 255
	// MaxNameLength defines the maximum name length
	MaxNameLength = 100
)

// emailRegex is used to validate email format
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// Custom error types for validation failures
var (
	// ErrInvalidEmail is returned when email format is invalid
	ErrInvalidEmail = fmt.Errorf("invalid email format")
	// ErrEmailRequired is returned when email is empty
	ErrEmailRequired = fmt.Errorf("email is required")
	// ErrEmailTooLong is returned when email exceeds maximum length
	ErrEmailTooLong = fmt.Errorf("email must not exceed %d characters", MaxEmailLength)
	// ErrNameRequired is returned when name is empty
	ErrNameRequired = fmt.Errorf("name is required")
	// ErrNameTooLong is returned when name exceeds maximum length
	ErrNameTooLong = fmt.Errorf("name must not exceed %d characters", MaxNameLength)
	// ErrPasswordRequired is returned when password is empty
	ErrPasswordRequired = fmt.Errorf("password is required")
	// ErrPasswordTooShort is returned when password is too short
	ErrPasswordTooShort = fmt.Errorf("password must be at least %d characters", MinPasswordLength)
	// ErrPasswordHashTooLong is returned when password hash exceeds maximum length
	ErrPasswordHashTooLong = fmt.Errorf("password hash must not exceed %d characters", MaxPasswordHashLength)
	// ErrInvalidPassword is returned when password verification fails
	ErrInvalidPassword = fmt.Errorf("invalid password")
)

// User represents a user in the system.
//
// Example usage:
//
//	user := &User{
//		Email: "user@example.com",
//		Name:  "John Doe",
//	}
//	
//	if err := user.SetPassword("mypassword123"); err != nil {
//		log.Fatal(err)
//	}
//	
//	if err := user.Validate(); err != nil {
//		log.Fatal(err)
//	}
//	
//	// Save to database using GORM
//	db.Create(user)
type User struct {
	// ID is the unique identifier for the user
	ID uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	
	// Email is the user's email address
	Email string `gorm:"type:varchar(255);uniqueIndex;not null" json:"email" validate:"required,email,max=255"`
	
	// PasswordHash stores the bcrypt hash of the user's password
	// This field is never serialized to JSON for security
	PasswordHash string `gorm:"type:varchar(255);not null" json:"-" validate:"required,max=255"`
	
	// Name is the user's display name
	Name string `gorm:"type:varchar(100);not null" json:"name" validate:"required,max=100"`
	
	// IsActive indicates whether the user account is active
	IsActive bool `gorm:"default:true;not null" json:"is_active"`
	
	// LastLogin stores the timestamp of the user's last login
	LastLogin *time.Time `gorm:"type:timestamp" json:"last_login,omitempty"`
	
	// CreatedAt stores when the user was created
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	
	// UpdatedAt stores when the user was last updated
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
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
	return u.Validate()
}

// BeforeUpdate is a GORM hook that runs before updating a user
func (u *User) BeforeUpdate(tx *gorm.DB) error {
	return u.Validate()
}

// SetPassword hashes the provided password using bcrypt and stores it in PasswordHash.
// The password must be at least 8 characters long.
func (u *User) SetPassword(password string) error {
	if password == "" {
		return fmt.Errorf("setting password: %w", ErrPasswordRequired)
	}
	
	if len(password) < MinPasswordLength {
		return fmt.Errorf("setting password: %w", ErrPasswordTooShort)
	}
	
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return fmt.Errorf("setting password: failed to hash password: %w", err)
	}
	
	if len(hashedPassword) > MaxPasswordHashLength {
		return fmt.Errorf("setting password: %w", ErrPasswordHashTooLong)
	}
	
	u.PasswordHash = string(hashedPassword)
	return nil
}

// CheckPassword verifies the provided password against the stored hash.
func (u *User) CheckPassword(password string) error {
	if password == "" {
		return fmt.Errorf("checking password: %w", ErrPasswordRequired)
	}
	
	if u.PasswordHash == "" {
		return fmt.Errorf("checking password: no password hash stored")
	}
	
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	if err != nil {
		if err == bcrypt.ErrMismatchedHashAndPassword {
			return fmt.Errorf("checking password: %w", ErrInvalidPassword)
		}
		return fmt.Errorf("checking password: %w", err)
	}
	
	return nil
}

// ToDict serializes the user to a map, excluding sensitive fields like password_hash.
func (u *User) ToDict() map[string]interface{} {
	result := map[string]interface{}{
		"id":         u.ID,
		"email":      u.Email,
		"name":       u.Name,
		"is_active":  u.IsActive,
		"created_at": u.CreatedAt,
		"updated_at": u.UpdatedAt,
	}
	
	if u.LastLogin != nil {
		result["last_login"] = *u.LastLogin
	}
	
	return result
}

// Validate validates all user fields and returns detailed error messages.
func (u *User) Validate() error {
	var errors []string
	
	// Validate email
	if u.Email == "" {
		errors = append(errors, ErrEmailRequired.Error())
	} else {
		if len(u.Email) > MaxEmailLength {
			errors = append(errors, ErrEmailTooLong.Error())
		}
		if !emailRegex.MatchString(u.Email) {
			errors = append(errors, ErrInvalidEmail.Error())
		}
	}
	
	// Validate name
	if u.Name == "" {
		errors = append(errors, ErrNameRequired.Error())
	} else if len(u.Name) > MaxNameLength {
		errors = append(errors, ErrNameTooLong.Error())
	}
	
	// Validate password hash (should be set if this is not a new record)
	if u.PasswordHash == "" {
		errors = append(errors, "password hash is required")
	} else if len(u.PasswordHash) > MaxPasswordHashLength {
		errors = append(errors, ErrPasswordHashTooLong.Error())
	}
	
	if len(errors) > 0 {
		return fmt.Errorf("validation failed: %s", strings.Join(errors, ", "))
	}
	
	return nil
}

// String returns a string representation of the user for logging purposes.
// Sensitive information like password hash is excluded.
func (u *User) String() string {
	return fmt.Sprintf("User{ID: %s, Email: %s, Name: %s, IsActive: %t, CreatedAt: %s}",
		u.ID.String(), u.Email, u.Name, u.IsActive, u.CreatedAt.Format(time.RFC3339))
}

// UpdateLastLogin updates the user's last login timestamp to the current time.
func (u *User) UpdateLastLogin() {
	now := time.Now()
	u.LastLogin = &now
}

// IsValidEmail checks if the provided email has a valid format.
func IsValidEmail(email string) bool {
	if email == "" || len(email) > MaxEmailLength {
		return false
	}
	return emailRegex.MatchString(email)
}

// Migration function to create the users table with proper constraints
// This should be called during application startup or via migration scripts
func MigrateUser(db *gorm.DB) error {
	if err := db.AutoMigrate(&User{}); err != nil {
		return fmt.Errorf("failed to migrate User model: %w", err)
	}
	
	// Ensure unique index on email exists
	if err := db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)").Error; err != nil {
		return fmt.Errorf("failed to create unique index on email: %w", err)
	}
	
	return nil
}

// UserRepository provides database operations for User model
type UserRepository struct {
	db *gorm.DB
}

// NewUserRepository creates a new UserRepository
func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

// FindByEmail finds a user by email address
func (r *UserRepository) FindByEmail(email string) (*User, error) {
	var user User
	err := r.db.Where("email = ?", email).First(&user).Error
	if err != nil {
		return nil, fmt.Errorf("finding user by email: %w", err)
	}
	return &user, nil
}

// Create creates a new user in the database
func (r *UserRepository) Create(user *User) error {
	if err := r.db.Create(user).Error; err != nil {
		return fmt.Errorf("creating user: %w", err)
	}
	return nil
}

// Update updates an existing user in the database
func (r *UserRepository) Update(user *User) error {
	if err := r.db.Save(user).Error; err != nil {
		return fmt.Errorf("updating user: %w", err)
	}
	return nil
}

// Delete soft deletes a user from the database
func (r *UserRepository) Delete(id uuid.UUID) error {
	if err := r.db.Delete(&User{}, id).Error; err != nil {
		return fmt.Errorf("deleting user: %w", err)
	}
	return nil
}

// FindByID finds a user by ID
func (r *UserRepository) FindByID(id uuid.UUID) (*User, error) {
	var user User
	err := r.db.First(&user, id).Error
	if err != nil {
		return nil, fmt.Errorf("finding user by ID: %w", err)
	}
	return &user, nil
}

// EmailExists checks if an email already exists in the database
func (r *UserRepository) EmailExists(email string) (bool, error) {
	var count int64
	err := r.db.Model(&User{}).Where("email = ?", email).Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("checking email existence: %w", err)
	}
	return count > 0, nil
}