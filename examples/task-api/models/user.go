package user

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// User represents a user entity in the system with authentication and profile information.
// This model is designed for production use with proper security considerations,
// validation, and database constraints.
type User struct {
	// ID is the primary key using UUID for better security and distribution
	ID uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`

	// Email must be unique and is used for authentication
	Email string `gorm:"type:varchar(255);uniqueIndex;not null" json:"email" validate:"required,email,max=255"`

	// PasswordHash stores the bcrypt hash of the user's password
	// Never exposed in JSON responses for security
	PasswordHash string `gorm:"type:varchar(255);not null" json:"-" validate:"required,max=255"`

	// Name is the user's display name
	Name string `gorm:"type:varchar(100);not null" json:"name" validate:"required,min=1,max=100"`

	// IsActive indicates whether the user account is active
	IsActive bool `gorm:"default:true;not null" json:"is_active"`

	// LastLogin tracks the user's last login time (nullable)
	LastLogin *time.Time `gorm:"type:timestamp" json:"last_login,omitempty"`

	// CreatedAt is automatically managed by GORM
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`

	// UpdatedAt is automatically managed by GORM
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName specifies the table name for GORM
func (User) TableName() string {
	return "users"
}

// BeforeCreate is a GORM hook that runs before creating a new user
func (u *User) BeforeCreate(tx *gorm.DB) error {
	// Generate UUID if not set
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}

	// Normalize email to lowercase
	u.Email = strings.ToLower(strings.TrimSpace(u.Email))

	// Validate email format
	if err := u.validateEmail(); err != nil {
		return err
	}

	// Validate name
	if err := u.validateName(); err != nil {
		return err
	}

	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a user
func (u *User) BeforeUpdate(tx *gorm.DB) error {
	// Normalize email to lowercase
	u.Email = strings.ToLower(strings.TrimSpace(u.Email))

	// Validate email format
	if err := u.validateEmail(); err != nil {
		return err
	}

	// Validate name
	if err := u.validateName(); err != nil {
		return err
	}

	return nil
}

// SetPassword hashes the provided password using bcrypt and stores it in PasswordHash.
// It validates password strength before hashing.
func (u *User) SetPassword(password string) error {
	if err := validatePasswordStrength(password); err != nil {
		return fmt.Errorf("password validation failed: %w", err)
	}

	// Use bcrypt cost of 12 for good security/performance balance
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	u.PasswordHash = string(hashedPassword)
	return nil
}

// CheckPassword verifies if the provided password matches the stored hash.
// Uses constant-time comparison to prevent timing attacks.
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	return err == nil
}

// ToDict converts the user struct to a map representation, excluding sensitive fields.
// This is useful for API responses and logging.
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

// UpdateLastLogin sets the LastLogin field to the current time
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

// validateEmail validates the email format using regex
func (u *User) validateEmail() error {
	if u.Email == "" {
		return errors.New("email is required")
	}

	if len(u.Email) > 255 {
		return errors.New("email must be less than 255 characters")
	}

	// RFC 5322 compliant email regex (simplified)
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if !emailRegex.MatchString(u.Email) {
		return errors.New("invalid email format")
	}

	return nil
}

// validateName validates the user's name
func (u *User) validateName() error {
	if u.Name == "" {
		return errors.New("name is required")
	}

	if len(u.Name) > 100 {
		return errors.New("name must be less than 100 characters")
	}

	// Check if name contains only valid characters (letters, spaces, hyphens, apostrophes)
	nameRegex := regexp.MustCompile(`^[a-zA-Z\s\-'\.]+$`)
	if !nameRegex.MatchString(u.Name) {
		return errors.New("name contains invalid characters")
	}

	return nil
}

// validatePasswordStrength validates password strength requirements
func validatePasswordStrength(password string) error {
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters long")
	}

	if len(password) > 128 {
		return errors.New("password must be less than 128 characters long")
	}

	var (
		hasUpper   bool
		hasLower   bool
		hasNumber  bool
		hasSpecial bool
	)

	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsNumber(char):
			hasNumber = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if !hasUpper {
		return errors.New("password must contain at least one uppercase letter")
	}

	if !hasLower {
		return errors.New("password must contain at least one lowercase letter")
	}

	if !hasNumber {
		return errors.New("password must contain at least one number")
	}

	if !hasSpecial {
		return errors.New("password must contain at least one special character")
	}

	// Check for common weak passwords
	commonPasswords := []string{
		"password", "123456", "password123", "admin", "qwerty",
		"letmein", "welcome", "monkey", "dragon", "master",
	}

	lowerPassword := strings.ToLower(password)
	for _, common := range commonPasswords {
		if lowerPassword == common {
			return errors.New("password is too common")
		}
	}

	return nil
}

// String returns a string representation of the user (without sensitive data)
func (u *User) String() string {
	return fmt.Sprintf("User{ID: %s, Email: %s, Name: %s, IsActive: %t}",
		u.ID.String(), u.Email, u.Name, u.IsActive)
}

// GetMigration returns the GORM migration function for the User model
// This can be used to create the table with proper indexes and constraints
func GetMigration() func(*gorm.DB) error {
	return func(db *gorm.DB) error {
		// Auto migrate the User model
		if err := db.AutoMigrate(&User{}); err != nil {
			return fmt.Errorf("failed to migrate User model: %w", err)
		}

		// Create additional indexes if needed
		if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)").Error; err != nil {
			return fmt.Errorf("failed to create is_active index: %w", err)
		}

		if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login)").Error; err != nil {
			return fmt.Errorf("failed to create last_login index: %w", err)
		}

		return nil
	}
}