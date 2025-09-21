I'll provide you with a complete, production-ready user management and authentication API module. Here's the implementation:

## 1. models/user.go

```go
package models

import (
	"time"
	"gorm.io/gorm"
)

// User represents the user model in the database
type User struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Email     string         `json:"email" gorm:"uniqueIndex;not null;size:255"`
	Password  string         `json:"-" gorm:"not null;size:255"` // Never include in JSON responses
	FirstName string         `json:"first_name" gorm:"not null;size:100"`
	LastName  string         `json:"last_name" gorm:"not null;size:100"`
	IsActive  bool           `json:"is_active" gorm:"default:true"`
	LastLogin *time.Time     `json:"last_login"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// TableName specifies the table name for GORM
func (User) TableName() string {
	return "users"
}

// BeforeCreate is a GORM hook that runs before creating a user
func (u *User) BeforeCreate(tx *gorm.DB) error {
	// Additional validation or data manipulation can be added here
	return nil
}
```

## 2. dto/user_dto.go

```go
package dto

import "time"

// RegisterRequest represents the user registration request
type RegisterRequest struct {
	Email     string `json:"email" binding:"required,email" validate:"email"`
	Password  string `json:"password" binding:"required,min=8"`
	FirstName string `json:"first_name" binding:"required,min=2,max=100"`
	LastName  string `json:"last_name" binding:"required,min=2,max=100"`
}

// LoginRequest represents the user login request
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// UpdateProfileRequest represents the profile update request
type UpdateProfileRequest struct {
	Email     string `json:"email" binding:"omitempty,email"`
	FirstName string `json:"first_name" binding:"omitempty,min=2,max=100"`
	LastName  string `json:"last_name" binding:"omitempty,min=2,max=100"`
}

// ChangePasswordRequest represents the password change request
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

// UserResponse represents the user data returned in API responses
type UserResponse struct {
	ID        uint       `json:"id"`
	Email     string     `json:"email"`
	FirstName string     `json:"first_name"`
	LastName  string     `json:"last_name"`
	IsActive  bool       `json:"is_active"`
	LastLogin *time.Time `json:"last_login"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// LoginResponse represents the login response with token
type LoginResponse struct {
	User  UserResponse `json:"user"`
	Token string       `json:"token"`
}

// ErrorResponse represents error response structure
type ErrorResponse struct {
	Error   string            `json:"error"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

// SuccessResponse represents success response structure
type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}
```

## 3. repositories/user_repository.go

```go
package repositories

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"your-app/models"
)

// UserRepositoryInterface defines the contract for user repository
type UserRepositoryInterface interface {
	Create(user *models.User) error
	GetByEmail(email string) (*models.User, error)
	GetByID(id uint) (*models.User, error)
	Update(user *models.User) error
	UpdateLastLogin(userID uint) error
	EmailExists(email string) (bool, error)
}

// UserRepository implements UserRepositoryInterface
type UserRepository struct {
	db *gorm.DB
}

// NewUserRepository creates a new user repository instance
func NewUserRepository(db *gorm.DB) UserRepositoryInterface {
	return &UserRepository{db: db}
}

// Create creates a new user in the database
func (r *UserRepository) Create(user *models.User) error {
	if err := r.db.Create(user).Error; err != nil {
		// Check for unique constraint violation
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return errors.New("email already exists")
		}
		return err
	}
	return nil
}

// GetByEmail retrieves a user by email
func (r *UserRepository) GetByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.db.Where("email = ? AND is_active = ?", email, true).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return &user, nil
}

// GetByID retrieves a user by ID
func (r *UserRepository) GetByID(id uint) (*models.User, error) {
	var user models.User
	err := r.db.Where("id = ? AND is_active = ?", id, true).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return &user, nil
}

// Update updates user information
func (r *UserRepository) Update(user *models.User) error {
	err := r.db.Save(user).Error
	if err != nil {
		// Check for unique constraint violation
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return errors.New("email already exists")
		}
		return err
	}
	return nil
}

// UpdateLastLogin updates the user's last login timestamp
func (r *UserRepository) UpdateLastLogin(userID uint) error {
	now := time.Now()
	return r.db.Model(&models.User{}).Where("id = ?", userID).Update("last_login", now).Error
}

// EmailExists checks if an email already exists in the database
func (r *UserRepository) EmailExists(email string) (bool, error) {
	var count int64
	err := r.db.Model(&models.User{}).Where("email = ?", email).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
```

## 4. services/user_service.go

```go
package services

import (
	"errors"
	"regexp"
	"time"

	"golang.org/x/crypto/bcrypt"
	"github.com/golang-jwt/jwt/v5"
	"your-app/dto"
	"your-app/models"
	"your-app/repositories"
)

// UserServiceInterface defines the contract for user service
type UserServiceInterface interface {
	Register(req *dto.RegisterRequest) (*dto.UserResponse, error)
	Login(req *dto.LoginRequest) (*dto.LoginResponse, error)
	GetProfile(userID uint) (*dto.UserResponse, error)
	UpdateProfile(userID uint, req *dto.UpdateProfileRequest) (*dto.UserResponse, error)
	ChangePassword(userID uint, req *dto.ChangePasswordRequest) error
	ValidateToken(tokenString string) (*jwt.Token, error)
	GenerateToken(userID uint) (string, error)
}

// UserService implements UserServiceInterface
type UserService struct {
	userRepo  repositories.UserRepositoryInterface
	jwtSecret []byte
}

// NewUserService creates a new user service instance
func NewUserService(userRepo repositories.UserRepositoryInterface, jwtSecret string) UserServiceInterface {
	return &UserService{
		userRepo:  userRepo,
		jwtSecret: []byte(jwtSecret),
	}
}

// Register handles user registration
func (s *UserService) Register(req *dto.RegisterRequest) (*dto.UserResponse, error) {
	// Validate email format
	if !s.isValidEmail(req.Email) {
		return nil, errors.New("invalid email format")
	}

	// Check if email already exists
	exists, err := s.userRepo.EmailExists(req.Email)
	if err != nil {
		return nil, errors.New("failed to check email existence")
	}
	if exists {
		return nil, errors.New("email already registered")
	}

	// Hash password
	hashedPassword, err := s.hashPassword(req.Password)
	if err != nil {
		return nil, errors.New("failed to process password")
	}

	// Create user model
	user := &models.User{
		Email:     req.Email,
		Password:  hashedPassword,
		FirstName: req.FirstName,
		LastName:  req.LastName,
		IsActive:  true,
	}

	// Save user to database
	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	// Convert to response DTO
	return s.userToResponse(user), nil
}

// Login handles user authentication
func (s *UserService) Login(req *dto.LoginRequest) (*dto.LoginResponse, error) {
	// Get user by email
	user, err := s.userRepo.GetByEmail(req.Email)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	// Verify password
	if !s.checkPasswordHash(req.Password, user.Password) {
		return nil, errors.New("invalid credentials")
	}

	// Update last login
	if err := s.userRepo.UpdateLastLogin(user.ID); err != nil {
		// Log error but don't fail the login
		// In production, you might want to use a proper logger
	}

	// Generate JWT token
	token, err := s.GenerateToken(user.ID)
	if err != nil {
		return nil, errors.New("failed to generate token")
	}

	// Update user with current timestamp for response
	now := time.Now()
	user.LastLogin = &now

	return &dto.LoginResponse{
		User:  *s.userToResponse(user),
		Token: token,
	}, nil
}

// GetProfile retrieves user profile
func (s *UserService) GetProfile(userID uint) (*dto.UserResponse, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}

	return s.userToResponse(user), nil
}

// UpdateProfile updates user profile
func (s *UserService) UpdateProfile(userID uint, req *dto.UpdateProfileRequest) (*dto.UserResponse, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}

	// Update fields if provided
	if req.Email != "" {
		if !s.isValidEmail(req.Email) {
			return nil, errors.New("invalid email format")
		}
		
		// Check if new email already exists (excluding current user)
		if req.Email != user.Email {
			exists, err := s.userRepo.EmailExists(req.Email)
			if err != nil {
				return nil, errors.New("failed to validate email")
			}
			if exists {
				return nil, errors.New("email already in use")
			}
		}
		user.Email = req.Email
	}

	if req.FirstName != "" {
		user.FirstName = req.FirstName
	}

	if req.LastName != "" {
		user.LastName = req.LastName
	}

	// Save updated user
	if err := s.userRepo.Update(user); err != nil {
		return nil, err
	}

	return s.userToResponse(user), nil
}

// ChangePassword handles password change
func (s *UserService) ChangePassword(userID uint, req *dto.ChangePasswordRequest) error {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}

	// Verify current password
	if !s.checkPasswordHash(req.CurrentPassword, user.Password) {
		return errors.New("current password is incorrect")
	}

	// Hash new password
	hashedPassword, err := s.hashPassword(req.NewPassword)
	if err != nil {
		return errors.New("failed to process new password")
	}

	// Update password
	user.Password = hashedPassword
	return s.userRepo.Update(user)
}

// GenerateToken generates a JWT token for the user
func (s *UserService) GenerateToken(userID uint) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour * 24).Unix(), // 24 hours
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

// ValidateToken validates a JWT token
func (s *UserService) ValidateToken(tokenString string) (*jwt.Token, error) {
	return jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("invalid token signing method")
		}
		return s.jwtSecret, nil
	})
}

// Helper methods

func (s *UserService) hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(bytes), err
}

func (s *UserService) checkPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func (s *UserService) isValidEmail(email string) bool {
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	return emailRegex.MatchString(email)
}

func (s *UserService) userToResponse(user *models.User) *dto.UserResponse {
	return &dto.UserResponse{
		ID:        user.ID,
		Email:     user.Email,
		FirstName: user.FirstName,
		LastName:  user.LastName,
		IsActive:  user.IsActive,
		LastLogin: user.LastLogin,
		CreatedAt: user.CreatedAt,
		UpdatedAt: user.UpdatedAt,
	}
}
```

## 5. middleware/auth.go

```go
package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"your-app/dto"
	"your-app/services"
)

// AuthMiddleware creates JWT authentication middleware
func