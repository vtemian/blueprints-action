I'll generate a complete, production-ready Go user management and authentication API module. Here's the structured implementation:

## Project Structure
```
api/
├── main.go
├── models/
│   └── user.go
├── handlers/
│   └── user_handlers.go
├── middleware/
│   └── auth.go
├── utils/
│   ├── jwt.go
│   ├── password.go
│   └── validation.go
├── dto/
│   └── user_dto.go
└── config/
    └── database.go
```

## 1. Main Application (`main.go`)

```go
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"your-project/config"
	"your-project/handlers"
	"your-project/middleware"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	// Initialize database
	db, err := config.InitDB()
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Initialize Gin router
	r := gin.Default()

	// Initialize handlers
	userHandler := handlers.NewUserHandler(db)

	// Public routes
	api := r.Group("/api")
	{
		users := api.Group("/users")
		{
			users.POST("/register", userHandler.Register)
			users.POST("/login", userHandler.Login)
			
			// Protected routes
			protected := users.Group("/")
			protected.Use(middleware.AuthMiddleware())
			{
				protected.GET("/me", userHandler.GetProfile)
				protected.PUT("/me", userHandler.UpdateProfile)
				protected.POST("/change-password", userHandler.ChangePassword)
			}
		}
	}

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
```

## 2. User Model (`models/user.go`)

```go
package models

import (
	"time"

	"gorm.io/gorm"
)

// User represents the user model in the database
type User struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Name      string         `json:"name" gorm:"not null;size:100"`
	Email     string         `json:"email" gorm:"uniqueIndex;not null;size:255"`
	Password  string         `json:"-" gorm:"not null;size:255"` // "-" excludes from JSON
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
	// Additional validation or processing can be added here
	return nil
}
```

## 3. DTOs (`dto/user_dto.go`)

```go
package dto

import "time"

// RegisterRequest represents the request payload for user registration
type RegisterRequest struct {
	Name            string `json:"name" binding:"required,min=2,max=100"`
	Email           string `json:"email" binding:"required,email"`
	Password        string `json:"password" binding:"required,min=8"`
	ConfirmPassword string `json:"confirm_password" binding:"required"`
}

// LoginRequest represents the request payload for user login
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// UpdateProfileRequest represents the request payload for updating user profile
type UpdateProfileRequest struct {
	Name            string `json:"name" binding:"omitempty,min=2,max=100"`
	Email           string `json:"email" binding:"omitempty,email"`
	ConfirmPassword string `json:"confirm_password" binding:"omitempty"`
}

// ChangePasswordRequest represents the request payload for changing password
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
	ConfirmPassword string `json:"confirm_password" binding:"required"`
}

// UserResponse represents the user data returned in responses
type UserResponse struct {
	ID        uint       `json:"id"`
	Name      string     `json:"name"`
	Email     string     `json:"email"`
	LastLogin *time.Time `json:"last_login"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// AuthResponse represents the response after successful authentication
type AuthResponse struct {
	User  UserResponse `json:"user"`
	Token string       `json:"token"`
}

// ErrorResponse represents error response structure
type ErrorResponse struct {
	Error   string      `json:"error"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

// SuccessResponse represents success response structure
type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}
```

## 4. Database Configuration (`config/database.go`)

```go
package config

import (
	"fmt"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"your-project/models"
)

// InitDB initializes the database connection and runs migrations
func InitDB() (*gorm.DB, error) {
	// Database configuration from environment variables
	host := getEnv("DB_HOST", "localhost")
	port := getEnv("DB_PORT", "5432")
	user := getEnv("DB_USER", "postgres")
	password := getEnv("DB_PASSWORD", "")
	dbname := getEnv("DB_NAME", "userapi")
	sslmode := getEnv("DB_SSLMODE", "disable")

	// Construct DSN
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslmode)

	// Open database connection
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Run auto migration
	if err := db.AutoMigrate(&models.User{}); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return db, nil
}

// getEnv gets environment variable with fallback
func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
```

## 5. JWT Utilities (`utils/jwt.go`)

```go
package utils

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims represents JWT claims
type Claims struct {
	UserID uint   `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

var jwtSecret = []byte(getJWTSecret())

// GenerateToken generates a JWT token for the user
func GenerateToken(userID uint, email string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour) // Token expires in 24 hours

	claims := &Claims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "user-api",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// ValidateToken validates and parses a JWT token
func ValidateToken(tokenString string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("invalid signing method")
		}
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}

// getJWTSecret gets JWT secret from environment or uses default
func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		// In production, this should always be set via environment variable
		return "your-super-secret-jwt-key-change-this-in-production"
	}
	return secret
}
```

## 6. Password Utilities (`utils/password.go`)

```go
package utils

import (
	"golang.org/x/crypto/bcrypt"
)

// HashPassword hashes a password using bcrypt
func HashPassword(password string) (string, error) {
	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashedBytes), nil
}

// CheckPassword compares a password with its hash
func CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
```

## 7. Validation Utilities (`utils/validation.go`)

```go
package utils

import (
	"regexp"
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// IsValidEmail validates email format using regex
func IsValidEmail(email string) bool {
	return emailRegex.MatchString(email)
}

// IsValidPassword validates password requirements
func IsValidPassword(password string) bool {
	return len(password) >= 8
}
```

## 8. Authentication Middleware (`middleware/auth.go`)

```go
package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"your-project/dto"
	"your-project/utils"
)

// AuthMiddleware validates JWT tokens for protected routes
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, dto.ErrorResponse{
				Error:   "unauthorized",
				Message: "Authorization header is required",
			})
			c.Abort()
			return
		}

		// Check if the header starts with "Bearer "
		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, dto.ErrorResponse{
				Error:   "unauthorized",
				Message: "Invalid authorization header format",
			})
			c.Abort()
			return
		}

		tokenString := tokenParts[1]
		claims, err := utils.ValidateToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, dto.ErrorResponse{
				Error:   "unauthorized",
				Message: "Invalid or expired token",
			})
			c.Abort()
			return
		}

		// Store user information in context
		c.Set("user_id", claims.UserID)
		c.Set("user_email", claims.Email)
		c.Next()
	}
}
```

## 9. User Handlers (`handlers/user_handlers.go`)

```go
package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"your-project/dto"
	"your-project/models"
	"your-project/utils"
)

// UserHandler handles user-related HTTP requests
type UserHandler struct {
	db *gorm.DB
}

// NewUserHandler creates a new user handler
func NewUserHandler(db *gorm.DB) *UserHandler {
	return &UserHandler{db: db}
}

// Register handles user registration
func (h *UserHandler) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{
			Error:   "validation_error",
			Message: "Invalid request data",
			Details: err.Error(),
		})
		return
	}

	// Validate password confirmation
	if req.Password != req.ConfirmPassword {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{
			Error:   "validation_error",
			Message: "Passwords do not match",
		})
		return
	}

	// Additional email validation
	if !utils.IsValidEmail(req.Email) {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{
			Error:   "validation_error",
			Message: "Invalid email format",
		})
		return
	}

	// Check if user already exists
	var existingUser models.User
	if err := h.db.Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
		c.JSON(http.StatusConflict, dto.ErrorResponse{
			Error:   "duplicate_email",
			Message: "User with this email already exists",
		})
		return
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, dto.ErrorResponse{
			Error:   "internal_error",
			Message: "Failed to process password",
		})
		return
	}

	// Create user
	user := models.User{
		Name:     req.Name,
		Email:    req.Email,
		Password: hashedPassword,
	}

	if err := h.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, dto.ErrorResponse{
			Error:   "database_error",
			Message: "Failed to create user",
		})
		return
	}

	// Generate JWT token
	token, err := utils.GenerateToken(