package models

import (
	"errors"
	"regexp"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// User represents a user in the system with authentication and profile information.
// It includes fields for authentication, user metadata, and audit timestamps.
type User struct {
	// ID is the unique identifier for the user using UUID v4
	ID uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	
	// Email is the user's email address, must be unique and valid format
	Email string `gorm:"type:varchar(255);uniqueIndex;not null" json:"email" validate:"required,email,max=255"`
	
	// PasswordHash stores the bcrypt hash of the user's password
	PasswordHash string `gorm:"type:varchar(255);not null;column:password_hash" json:"-" validate:"required,max=255"`
	
	// Name is the user's display name
	Name string `gorm:"type:varchar(100);not null" json:"name" validate:"required,max=100"`
	
	// IsActive indicates whether the user account is active
	IsActive bool `gorm:"default:true;not null" json:"is_active"`
	
	// LastLogin tracks the user's most recent login time (nullable)
	LastLogin *time.Time `gorm:"type:timestamp" json:"last_login"`
	
	// CreatedAt is automatically set when the record is created
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	
	// UpdatedAt is automatically updated when the record is modified
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
	
	// Tasks represents the one-to-many relationship with Task model
	Tasks []Task `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"tasks,omitempty"`
}

// Task represents a task associated with a user (for relationship demonstration)
type Task struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	Title       string     `gorm:"type:varchar(255);not null" json:"title"`
	Description string     `gorm:"type:text" json:"description"`
	Completed   bool       `gorm:"default:false" json:"completed"`
	CreatedAt   time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
	User        User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// TableName specifies the table name for the User model
func (User) TableName() string {
	return "users"
}

// TableName specifies the table name for the Task model
func (Task) TableName() string {
	return "tasks"
}

// BeforeCreate is a GORM hook that runs before creating a new user record
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// SetPassword hashes the provided password and stores it in PasswordHash field.
// It validates the email format and password strength before hashing.
//
// Parameters:
//   - password: The plain text password to hash and store
//
// Returns:
//   - error: Returns an error if validation fails or hashing encounters an issue
func (u *User) SetPassword(password string) error {
	// Validate password length
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters long")
	}
	
	// Validate email format if email is set
	if u.Email != "" {
		if err := u.validateEmail(); err != nil {
			return err
		}
	}
	
	// Hash the password using bcrypt with cost factor 12
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return errors.New("failed to hash password")
	}
	
	u.PasswordHash = string(hashedPassword)
	return nil
}

// CheckPassword verifies if the provided password matches the stored hash.
//
// Parameters:
//   - password: The plain text password to verify
//
// Returns:
//   - bool: Returns true if password matches, false otherwise
func (u *User) CheckPassword(password string) bool {
	if u.PasswordHash == "" || password == "" {
		return false
	}
	
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	return err == nil
}

// ToDict converts the User struct to a map representation for serialization.
// The password hash is excluded for security reasons.
//
// Returns:
//   - map[string]interface{}: A map containing all user fields except password_hash
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
				"id":          task.ID,
				"title":       task.Title,
				"description": task.Description,
				"completed":   task.Completed,
				"created_at":  task.CreatedAt,
				"updated_at":  task.UpdatedAt,
			}
		}
		result["tasks"] = tasks
	}
	
	return result
}

// validateEmail checks if the email field contains a valid email format
func (u *User) validateEmail() error {
	if u.Email == "" {
		return errors.New("email is required")
	}
	
	// Regular expression for basic email validation
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	if !emailRegex.MatchString(u.Email) {
		return errors.New("invalid email format")
	}
	
	if len(u.Email) > 255 {
		return errors.New("email must not exceed 255 characters")
	}
	
	return nil
}

// Validate performs comprehensive validation on the User struct
func (u *User) Validate() error {
	// Validate email
	if err := u.validateEmail(); err != nil {
		return err
	}
	
	// Validate name
	if u.Name == "" {
		return errors.New("name is required")
	}
	if len(u.Name) > 100 {
		return errors.New("name must not exceed 100 characters")
	}
	
	// Validate password hash exists (for existing users)
	if u.PasswordHash == "" {
		return errors.New("password hash is required")
	}
	if len(u.PasswordHash) > 255 {
		return errors.New("password hash must not exceed 255 characters")
	}
	
	return nil
}

// UpdateLastLogin sets the LastLogin field to the current time
func (u *User) UpdateLastLogin() {
	now := time.Now()
	u.LastLogin = &now
}

// IsValidForCreation checks if the user has all required fields for creation
func (u *User) IsValidForCreation() error {
	if u.Email == "" {
		return errors.New("email is required for user creation")
	}
	if u.Name == "" {
		return errors.New("name is required for user creation")
	}
	if u.PasswordHash == "" {
		return errors.New("password must be set before user creation")
	}
	
	return u.Validate()
}