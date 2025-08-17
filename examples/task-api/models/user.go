package models

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// User represents a user in the system with authentication and profile information
type User struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id" validate:"required"`
	Email        string     `gorm:"type:varchar(255);uniqueIndex;not null" json:"email" validate:"required,email,max=255"`
	PasswordHash string     `gorm:"type:varchar(255);not null;column:password_hash" json:"-" validate:"required,max=255"`
	Name         string     `gorm:"type:varchar(100);not null" json:"name" validate:"required,max=100"`
	IsActive     bool       `gorm:"default:true;not null" json:"is_active"`
	LastLogin    *time.Time `gorm:"type:timestamp" json:"last_login"`
	CreatedAt    time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
}

const (
	// BcryptCost defines the cost factor for bcrypt password hashing
	BcryptCost = 12
	// MinPasswordLength defines the minimum password length
	MinPasswordLength = 8
)

// TableName returns the table name for the User model
func (User) TableName() string {
	return "users"
}

// BeforeCreate is a GORM hook that runs before creating a user record
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// SetPassword hashes the provided password using bcrypt and stores it in PasswordHash
// Returns an error if the password is too short or hashing fails
func (u *User) SetPassword(password string) error {
	if len(password) < MinPasswordLength {
		return errors.New("password must be at least 8 characters long")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return errors.New("failed to hash password")
	}

	u.PasswordHash = string(hashedPassword)
	return nil
}

// CheckPassword verifies if the provided password matches the stored password hash
// Returns true if the password is correct, false otherwise
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	return err == nil
}

// ToDict converts the User struct to a map[string]interface{} excluding sensitive fields
// This method is useful for API responses and logging
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

	return result
}

// MarshalJSON implements the json.Marshaler interface to ensure password is never serialized
func (u User) MarshalJSON() ([]byte, error) {
	type Alias User
	return json.Marshal(&struct {
		PasswordHash string `json:"-"`
		*Alias
	}{
		Alias: (*Alias)(&u),
	})
}

// UpdateLastLogin updates the LastLogin field to the current time
func (u *User) UpdateLastLogin() {
	now := time.Now()
	u.LastLogin = &now
}

// IsValidForCreation checks if the user has all required fields for creation
func (u *User) IsValidForCreation() error {
	if u.Email == "" {
		return errors.New("email is required")
	}
	if u.Name == "" {
		return errors.New("name is required")
	}
	if u.PasswordHash == "" {
		return errors.New("password hash is required")
	}
	return nil
}

// Deactivate sets the user's IsActive status to false
func (u *User) Deactivate() {
	u.IsActive = false
}

// Activate sets the user's IsActive status to true
func (u *User) Activate() {
	u.IsActive = true
}

// GetDisplayName returns the user's name for display purposes
func (u *User) GetDisplayName() string {
	if u.Name != "" {
		return u.Name
	}
	return u.Email
}

// HasValidEmail checks if the user has a non-empty email address
func (u *User) HasValidEmail() bool {
	return u.Email != ""
}

// GetID returns the user's ID as a string
func (u *User) GetID() string {
	return u.ID.String()
}

// Clone creates a deep copy of the user (excluding sensitive data)
func (u *User) Clone() *User {
	clone := &User{
		ID:        u.ID,
		Email:     u.Email,
		Name:      u.Name,
		IsActive:  u.IsActive,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}

	if u.LastLogin != nil {
		lastLogin := *u.LastLogin
		clone.LastLogin = &lastLogin
	}

	return clone
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

// NewUser creates a new User instance with default values
func NewUser(email, name, password string) (*User, error) {
	user := &User{
		ID:       uuid.New(),
		Email:    email,
		Name:     name,
		IsActive: true,
	}

	if err := user.SetPassword(password); err != nil {
		return nil, err
	}

	return user, nil
}