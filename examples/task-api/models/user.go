package models

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// User represents a user in the system
type User struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id" validate:"required"`
	Email        string     `gorm:"type:varchar(255);uniqueIndex;not null" json:"email" validate:"required,email,max=255"`
	PasswordHash string     `gorm:"type:varchar(255);not null" json:"-" validate:"required,max=255"`
	Name         string     `gorm:"type:varchar(100);not null" json:"name" validate:"required,max=100"`
	IsActive     bool       `gorm:"default:true" json:"is_active"`
	LastLogin    *time.Time `gorm:"type:timestamp" json:"last_login"`
	CreatedAt    time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
	
	// Relationships
	Tasks []Task `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"tasks,omitempty"`
}

// Task represents a task associated with a user
type Task struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null" json:"user_id"`
	Title     string    `gorm:"type:varchar(255);not null" json:"title"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName specifies the table name for the User model
func (User) TableName() string {
	return "users"
}

// TableName specifies the table name for the Task model
func (Task) TableName() string {
	return "tasks"
}

// NewUser creates a new User instance with default values
func NewUser(email, name string) *User {
	return &User{
		ID:        uuid.New(),
		Email:     strings.ToLower(strings.TrimSpace(email)),
		Name:      strings.TrimSpace(name),
		IsActive:  true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

// SetPassword hashes the provided password and stores it in PasswordHash
func (u *User) SetPassword(password string) error {
	// Validate input
	if password == "" {
		return errors.New("password cannot be empty")
	}
	
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters long")
	}
	
	if len(password) > 72 {
		return errors.New("password cannot exceed 72 characters")
	}
	
	// Validate email format if not already set
	if u.Email != "" {
		if err := u.validateEmail(); err != nil {
			return err
		}
	}
	
	// Hash the password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("failed to hash password: " + err.Error())
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

// ToDict serializes user data to a map, excluding sensitive information
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
	} else {
		result["last_login"] = nil
	}
	
	return result
}

// UpdateLastLogin updates the user's last login timestamp
func (u *User) UpdateLastLogin() {
	now := time.Now()
	u.LastLogin = &now
}

// validateEmail validates the email format
func (u *User) validateEmail() error {
	if u.Email == "" {
		return errors.New("email cannot be empty")
	}
	
	// Basic email regex pattern
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if !emailRegex.MatchString(u.Email) {
		return errors.New("invalid email format")
	}
	
	if len(u.Email) > 255 {
		return errors.New("email cannot exceed 255 characters")
	}
	
	return nil
}

// BeforeCreate is a GORM hook that runs before creating a user
func (u *User) BeforeCreate(tx *gorm.DB) error {
	// Generate UUID if not set
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	
	// Validate and sanitize email
	u.Email = strings.ToLower(strings.TrimSpace(u.Email))
	if err := u.validateEmail(); err != nil {
		return err
	}
	
	// Sanitize name
	u.Name = strings.TrimSpace(u.Name)
	if u.Name == "" {
		return errors.New("name cannot be empty")
	}
	
	if len(u.Name) > 100 {
		return errors.New("name cannot exceed 100 characters")
	}
	
	// Validate password hash exists
	if u.PasswordHash == "" {
		return errors.New("password hash is required")
	}
	
	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a user
func (u *User) BeforeUpdate(tx *gorm.DB) error {
	// Validate and sanitize email if it's being updated
	if u.Email != "" {
		u.Email = strings.ToLower(strings.TrimSpace(u.Email))
		if err := u.validateEmail(); err != nil {
			return err
		}
	}
	
	// Sanitize name if it's being updated
	if u.Name != "" {
		u.Name = strings.TrimSpace(u.Name)
		if len(u.Name) > 100 {
			return errors.New("name cannot exceed 100 characters")
		}
	}
	
	return nil
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
		return errors.New("password is required")
	}
	
	return u.validateEmail()
}

// Deactivate sets the user as inactive
func (u *User) Deactivate() {
	u.IsActive = false
}

// Activate sets the user as active
func (u *User) Activate() {
	u.IsActive = true
}