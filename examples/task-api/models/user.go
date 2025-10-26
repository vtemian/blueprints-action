package models

import (
	"encoding/json"
	"errors"
	"regexp"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Constants for password hashing
const (
	DefaultBcryptCost = 12
	MinPasswordLength = 8
)

// Email validation regex
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// Custom errors
var (
	ErrInvalidEmail    = errors.New("invalid email format")
	ErrPasswordTooShort = errors.New("password must be at least 8 characters long")
	ErrEmptyName       = errors.New("name cannot be empty")
)

// User represents a user in the system
type User struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email        string     `gorm:"type:varchar(255);uniqueIndex:idx_users_email;not null" json:"email" validate:"required,email"`
	PasswordHash string     `gorm:"type:varchar(255);not null" json:"-"`
	Name         string     `gorm:"type:varchar(255);not null" json:"name" validate:"required"`
	IsActive     bool       `gorm:"type:boolean;not null;default:true" json:"is_active"`
	LastLogin    *time.Time `gorm:"type:timestamp" json:"last_login"`
	CreatedAt    time.Time  `gorm:"type:timestamp;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"type:timestamp;not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
	
	// One-to-many relationship with Tasks
	Tasks []Task `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"tasks,omitempty"`
}

// Task represents a task associated with a user
// This is a placeholder - you should define this struct according to your needs
type Task struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	Title     string    `gorm:"type:varchar(255);not null" json:"title"`
	CreatedAt time.Time `gorm:"type:timestamp;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt time.Time `gorm:"type:timestamp;not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

// TableName specifies the table name for the User model
func (User) TableName() string {
	return "users"
}

// TableName specifies the table name for the Task model
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

// Validate performs validation on the User struct
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

// SetPassword hashes a plain text password and stores it in PasswordHash
func (u *User) SetPassword(plainPassword string) error {
	if len(plainPassword) < MinPasswordLength {
		return ErrPasswordTooShort
	}
	
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(plainPassword), DefaultBcryptCost)
	if err != nil {
		return err
	}
	
	u.PasswordHash = string(hashedPassword)
	return nil
}

// CheckPassword compares a plain text password against the stored hash
func (u *User) CheckPassword(plainPassword string) error {
	return bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(plainPassword))
}

// IsPasswordValid checks if the provided password is valid for this user
func (u *User) IsPasswordValid(plainPassword string) bool {
	return u.CheckPassword(plainPassword) == nil
}

// ToDict converts the User struct to a map[string]interface{} excluding sensitive fields
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
	
	// Include tasks if they are loaded
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

// ToJSON converts the User struct to JSON bytes excluding sensitive fields
func (u *User) ToJSON() ([]byte, error) {
	return json.Marshal(u.ToDict())
}

// UpdateLastLogin updates the LastLogin field to the current time
func (u *User) UpdateLastLogin() {
	now := time.Now()
	u.LastLogin = &now
}

// IsEmailTaken checks if the email is already taken by another user
func IsEmailTaken(db *gorm.DB, email string, excludeUserID ...uuid.UUID) (bool, error) {
	var count int64
	query := db.Model(&User{}).Where("email = ?", email)
	
	// Exclude current user if updating
	if len(excludeUserID) > 0 && excludeUserID[0] != uuid.Nil {
		query = query.Where("id != ?", excludeUserID[0])
	}
	
	err := query.Count(&count).Error
	if err != nil {
		return false, err
	}
	
	return count > 0, nil
}

// GetUserByEmail retrieves a user by email address
func GetUserByEmail(db *gorm.DB, email string) (*User, error) {
	var user User
	err := db.Where("email = ?", email).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetUserByID retrieves a user by ID
func GetUserByID(db *gorm.DB, id uuid.UUID) (*User, error) {
	var user User
	err := db.Where("id = ?", id).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetUserWithTasks retrieves a user with their associated tasks
func GetUserWithTasks(db *gorm.DB, id uuid.UUID) (*User, error) {
	var user User
	err := db.Preload("Tasks").Where("id = ?", id).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// CreateUser creates a new user with the provided details
func CreateUser(db *gorm.DB, email, password, name string) (*User, error) {
	user := &User{
		Email:    email,
		Name:     name,
		IsActive: true,
	}
	
	if err := user.SetPassword(password); err != nil {
		return nil, err
	}
	
	if err := db.Create(user).Error; err != nil {
		return nil, err
	}
	
	return user, nil
}

// Activate sets the user as active
func (u *User) Activate() {
	u.IsActive = true
}

// Deactivate sets the user as inactive
func (u *User) Deactivate() {
	u.IsActive = false
}

// String returns a string representation of the user
func (u *User) String() string {
	return u.Name + " <" + u.Email + ">"
}