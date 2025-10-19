I'll create a complete, production-ready Go user management and authentication API. Here's the implementation:

## Project Structure
```
user-auth-api/
├── main.go
├── config/
│   └── config.go
├── models/
│   └── user.go
├── handlers/
│   └── users.go
├── middleware/
│   └── auth.go
├── utils/
│   └── errors.go
└── go.mod
```

## go.mod
```go
module user-auth-api

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/go-playground/validator/v10 v10.15.5
    golang.org/x/crypto v0.14.0
    gorm.io/gorm v1.25.5
    gorm.io/driver/postgres v1.5.4
    github.com/joho/godotenv v1.4.0
    github.com/sirupsen/logrus v1.9.3
)
```

## main.go
```go
/*
SETUP INSTRUCTIONS:
1. Install dependencies: go mod tidy
2. Set environment variables:
   - JWT_SECRET=your-secret-key
   - DB_HOST=localhost
   - DB_PORT=5432
   - DB_USER=your-db-user
   - DB_PASSWORD=your-db-password
   - DB_NAME=your-db-name
   - PORT=8080
3. Create PostgreSQL database
4. Run: go run main.go
5. API will be available at http://localhost:8080

Example requests:
- Register: POST /api/users/register {"email":"user@example.com","password":"password123","name":"John Doe"}
- Login: POST /api/users/login {"email":"user@example.com","password":"password123"}
- Profile: GET /api/users/me (with Authorization: Bearer <token>)
*/

package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"user-auth-api/config"
	"user-auth-api/handlers"
	"user-auth-api/middleware"
	"user-auth-api/models"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/sirupsen/logrus"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		logrus.Warn("No .env file found, using system environment variables")
	}

	// Initialize configuration
	cfg := config.Load()

	// Setup logger
	setupLogger()

	// Initialize database
	db, err := config.InitDB(cfg)
	if err != nil {
		logrus.Fatal("Failed to connect to database: ", err)
	}

	// Auto-migrate database schema
	if err := db.AutoMigrate(&models.User{}); err != nil {
		logrus.Fatal("Failed to migrate database: ", err)
	}

	// Initialize handlers with dependencies
	userHandler := handlers.NewUserHandler(db, cfg)

	// Setup router
	router := setupRouter(userHandler, cfg)

	// Setup server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		logrus.Infof("Server starting on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logrus.Fatal("Failed to start server: ", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logrus.Info("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logrus.Fatal("Server forced to shutdown: ", err)
	}

	logrus.Info("Server exited")
}

// setupLogger configures the application logger
func setupLogger() {
	logrus.SetFormatter(&logrus.JSONFormatter{})
	logrus.SetLevel(logrus.InfoLevel)
	
	if gin.Mode() == gin.DebugMode {
		logrus.SetLevel(logrus.DebugLevel)
	}
}

// setupRouter configures all routes and middleware
func setupRouter(userHandler *handlers.UserHandler, cfg *config.Config) *gin.Engine {
	if gin.Mode() == gin.ReleaseMode {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Global middleware
	router.Use(middleware.Logger())
	router.Use(middleware.Recovery())
	router.Use(middleware.CORS())
	router.Use(middleware.SecurityHeaders())

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy"})
	})

	// API routes
	api := router.Group("/api")
	{
		users := api.Group("/users")
		{
			// Public routes
			users.POST("/register", userHandler.Register)
			users.POST("/login", userHandler.Login)

			// Protected routes
			protected := users.Group("")
			protected.Use(middleware.AuthMiddleware(cfg.JWTSecret))
			{
				protected.GET("/me", userHandler.GetProfile)
				protected.PUT("/me", userHandler.UpdateProfile)
				protected.POST("/change-password", userHandler.ChangePassword)
			}
		}
	}

	return router
}
```

## config/config.go
```go
package config

import (
	"fmt"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Config holds all application configuration
type Config struct {
	JWTSecret string
	DBConfig  DatabaseConfig
	Port      string
}

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

// Load reads configuration from environment variables
func Load() *Config {
	return &Config{
		JWTSecret: getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
		Port:      getEnv("PORT", "8080"),
		DBConfig: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", "password"),
			DBName:   getEnv("DB_NAME", "userauth"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
	}
}

// InitDB initializes database connection with proper configuration
func InitDB(cfg *Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s TimeZone=UTC",
		cfg.DBConfig.Host,
		cfg.DBConfig.User,
		cfg.DBConfig.Password,
		cfg.DBConfig.DBName,
		cfg.DBConfig.Port,
		cfg.DBConfig.SSLMode,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
	})

	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Configure connection pool
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get database instance: %w", err)
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

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

## models/user.go
```go
package models

import (
	"errors"
	"regexp"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// User represents a user in the system
type User struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Email     string    `json:"email" gorm:"uniqueIndex;not null"`
	Password  string    `json:"-" gorm:"not null"` // Never include in JSON responses
	Name      string    `json:"name" gorm:"not null"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// RegisterRequest represents user registration request
type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email" validate:"required,email"`
	Password string `json:"password" binding:"required,min=8" validate:"required,min=8"`
	Name     string `json:"name" binding:"required,min=2" validate:"required,min=2"`
}

// LoginRequest represents user login request
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email" validate:"required,email"`
	Password string `json:"password" binding:"required" validate:"required"`
}

// UpdateProfileRequest represents profile update request
type UpdateProfileRequest struct {
	Email string `json:"email" binding:"omitempty,email" validate:"omitempty,email"`
	Name  string `json:"name" binding:"omitempty,min=2" validate:"omitempty,min=2"`
}

// ChangePasswordRequest represents password change request
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required" validate:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8" validate:"required,min=8"`
}

// AuthResponse represents authentication response
type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// UserResponse represents user data response
type UserResponse struct {
	ID        uint      `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ToResponse converts User to UserResponse
func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:        u.ID,
		Email:     u.Email,
		Name:      u.Name,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}
}

// HashPassword hashes the user's password using bcrypt
func (u *User) HashPassword() error {
	if err := ValidatePassword(u.Password); err != nil {
		return err
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	u.Password = string(hashedPassword)
	return nil
}

// CheckPassword verifies if the provided password matches the user's password
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
	return err == nil
}

// BeforeCreate is a GORM hook that runs before creating a user
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if err := u.Validate(); err != nil {
		return err
	}
	return u.HashPassword()
}

// BeforeUpdate is a GORM hook that runs before updating a user
func (u *User) BeforeUpdate(tx *gorm.DB) error {
	return u.ValidateUpdate()
}

// Validate validates user data for creation
func (u *User) Validate() error {
	if err := ValidateEmail(u.Email); err != nil {
		return err
	}

	if err := ValidatePassword(u.Password); err != nil {
		return err
	}

	if err := ValidateName(u.Name); err != nil {
		return err
	}

	return nil
}

// ValidateUpdate validates user data for updates
func (u *User) ValidateUpdate() error {
	if u.Email != "" {
		if err := ValidateEmail(u.Email); err != nil {
			return err
		}
	}

	if u.Name != "" {
		if err := ValidateName(u.Name); err != nil {
			return err
		}
	}

	return nil
}

// ValidateEmail validates email format and requirements
func ValidateEmail(email string) error {
	if email == "" {
		return errors.New("email is required")
	}

	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if !emailRegex.MatchString(email) {
		return errors.New("invalid email format")
	}

	if len(email) > 254 {
		return errors.New("email too long")
	}

	return nil
}

// ValidatePassword validates password strength requirements
func ValidatePassword(password string) error {
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters long")
	}

	if len(password) > 128 {
		return errors.New("password too long")
	}

	var (
		hasUpper   = false
		hasLower   = false
		hasNumber  = false
		hasSpecial = false
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

	return nil
}

// ValidateName validates name requirements
func ValidateName(name string) error {
	if name == "" {
		return errors.New("name is required")
	}

	if len(name) < 2 {
		return errors.New("name must be at least 2 characters long")
	}

	if len(name) > 100 {
		return