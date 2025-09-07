package models

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// User represents a user in the system with authentication and profile information
type User struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email        string     `gorm:"type:varchar(255);uniqueIndex;not null" json:"email" validate:"required,email,max=255"`
	PasswordHash string     `gorm:"type:varchar(255);not null;column:password_hash" json:"-" validate:"required"`
	Name         string     `gorm:"type:varchar(100);not null" json:"name" validate:"required,max=100"`
	IsActive     bool       `gorm:"default:true;not null" json:"is_active"`
	LastLogin    *time.Time `gorm:"column:last_login" json:"last_login"`
	CreatedAt    time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
	
	// One-to-many relationship with Tasks
	Tasks []Task `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"tasks,omitempty"`
}

// Task represents a task associated with a user (referenced for relationship)
type Task struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	Title       string    `gorm:"type:varchar(255);not null" json:"title"`
	Description string    `gorm:"type:text" json:"description"`
	Completed   bool      `gorm:"default:false" json:"completed"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName specifies the table name for the User model
func (User) TableName() string {
	return "users"
}

// BeforeCreate is a GORM hook that runs before creating a new user record
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	u.CreatedAt = time.Now()
	u.UpdatedAt = time.Now()
	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a user record
func (u *User) BeforeUpdate(tx *gorm.DB) error {
	u.UpdatedAt = time.Now()
	return nil
}

// SetPassword hashes the provided password using bcrypt and stores it in PasswordHash
func (u *User) SetPassword(password string) error {
	if password == "" {
		return errors.New("password cannot be empty")
	}
	
	if len(password) < 6 {
		return errors.New("password must be at least 6 characters long")
	}
	
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("failed to hash password")
	}
	
	u.PasswordHash = string(hashedPassword)
	return nil
}

// CheckPassword verifies if the provided password matches the stored password hash
func (u *User) CheckPassword(password string) bool {
	if password == "" || u.PasswordHash == "" {
		return false
	}
	
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	return err == nil
}

// ToDict serializes the User model to a map, excluding sensitive fields like password_hash
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

// IsValidEmail checks if the user has a valid email format
func (u *User) IsValidEmail() bool {
	return u.Email != "" && len(u.Email) <= 255
}

// Activate sets the user's active status to true
func (u *User) Activate() {
	u.IsActive = true
}

// Deactivate sets the user's active status to false
func (u *User) Deactivate() {
	u.IsActive = false
}

// GetFullName returns the user's full name (alias for Name field)
func (u *User) GetFullName() string {
	return u.Name
}

// HasLoggedIn returns true if the user has logged in at least once
func (u *User) HasLoggedIn() bool {
	return u.LastLogin != nil
}

// UserRepository defines the interface for user database operations
type UserRepository interface {
	Create(user *User) error
	GetByID(id uuid.UUID) (*User, error)
	GetByEmail(email string) (*User, error)
	Update(user *User) error
	Delete(id uuid.UUID) error
	List(limit, offset int) ([]*User, error)
	Count() (int64, error)
}

// UserService provides business logic for user operations
type UserService struct {
	repo UserRepository
}

// NewUserService creates a new UserService instance
func NewUserService(repo UserRepository) *UserService {
	return &UserService{
		repo: repo,
	}
}

// CreateUser creates a new user with the provided details
func (s *UserService) CreateUser(email, password, name string) (*User, error) {
	user := &User{
		Email:    email,
		Name:     name,
		IsActive: true,
	}
	
	if err := user.SetPassword(password); err != nil {
		return nil, err
	}
	
	if err := s.repo.Create(user); err != nil {
		return nil, err
	}
	
	return user, nil
}

// AuthenticateUser verifies user credentials and returns the user if valid
func (s *UserService) AuthenticateUser(email, password string) (*User, error) {
	user, err := s.repo.GetByEmail(email)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}
	
	if !user.IsActive {
		return nil, errors.New("user account is deactivated")
	}
	
	if !user.CheckPassword(password) {
		return nil, errors.New("invalid credentials")
	}
	
	// Update last login timestamp
	user.UpdateLastLogin()
	if err := s.repo.Update(user); err != nil {
		// Log error but don't fail authentication
		// In production, you might want to use a proper logger here
	}
	
	return user, nil
}

// GetUserByID retrieves a user by their ID
func (s *UserService) GetUserByID(id uuid.UUID) (*User, error) {
	return s.repo.GetByID(id)
}

// UpdateUser updates user information
func (s *UserService) UpdateUser(user *User) error {
	return s.repo.Update(user)
}

// ChangePassword changes a user's password
func (s *UserService) ChangePassword(userID uuid.UUID, oldPassword, newPassword string) error {
	user, err := s.repo.GetByID(userID)
	if err != nil {
		return err
	}
	
	if !user.CheckPassword(oldPassword) {
		return errors.New("current password is incorrect")
	}
	
	if err := user.SetPassword(newPassword); err != nil {
		return err
	}
	
	return s.repo.Update(user)
}