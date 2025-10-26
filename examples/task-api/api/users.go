I'll create a production-ready Go user management and authentication API module using the Gin framework. Here's the complete implementation:

## Project Structure
```
api/
├── users/
│   ├── handlers.go
│   ├── models.go
│   ├── middleware.go
│   ├── routes.go
│   └── errors.go
├── database/
│   └── connection.go
└── main.go
```

## 1. models.go
```go
package users

import (
	"time"
	"unicode"

	"github.com/go-playground/validator/v10"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// User represents the user model in the database
type User struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Email     string         `json:"email" gorm:"uniqueIndex;not null" validate:"required,email"`
	Password  string         `json:"-" gorm:"not null"` // Never include in JSON responses
	Name      string         `json:"name" gorm:"not null" validate:"required,min=2,max=100"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// UserRegisterRequest represents the registration request payload
type UserRegisterRequest struct {
	Email           string `json:"email" validate:"required,email"`
	Password        string `json:"password" validate:"required,min=8,password_complexity"`
	ConfirmPassword string `json:"confirm_password" validate:"required,eqfield=Password"`
	Name            string `json:"name" validate:"required,min=2,max=100"`
}

// UserLoginRequest represents the login request payload
type UserLoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// UserUpdateRequest represents the profile update request payload
type UserUpdateRequest struct {
	Name  string `json:"name" validate:"omitempty,min=2,max=100"`
	Email string `json:"email" validate:"omitempty,email"`
}

// ChangePasswordRequest represents the password change request payload
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8,password_complexity"`
	ConfirmPassword string `json:"confirm_password" validate:"required,eqfield=NewPassword"`
}

// UserResponse represents the user data returned in API responses
type UserResponse struct {
	ID        uint      `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// LoginResponse represents the login response with JWT token
type LoginResponse struct {
	User  UserResponse `json:"user"`
	Token string       `json:"token"`
}

// APIResponse represents a standard API response structure
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// HashPassword hashes the user's password using bcrypt
func (u *User) HashPassword() error {
	// Use cost 12 for production-level security
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(u.Password), 12)
	if err != nil {
		return err
	}
	u.Password = string(hashedPassword)
	return nil
}

// CheckPassword verifies if the provided password matches the hashed password
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
	return err == nil
}

// ToResponse converts User model to UserResponse (excludes sensitive data)
func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:        u.ID,
		Email:     u.Email,
		Name:      u.Name,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}
}

// Custom validator for password complexity
func passwordComplexity(fl validator.FieldLevel) bool {
	password := fl.Field().String()
	
	var (
		hasMinLen  = len(password) >= 8
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

	return hasMinLen && hasUpper && hasLower && hasNumber && hasSpecial
}

// RegisterCustomValidators registers custom validation rules
func RegisterCustomValidators(v *validator.Validate) {
	v.RegisterValidation("password_complexity", passwordComplexity)
}
```

## 2. errors.go
```go
package users

import (
	"errors"
	"net/http"
)

// Custom error types for better error handling
var (
	ErrUserNotFound       = errors.New("user not found")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrEmailAlreadyExists = errors.New("email already exists")
	ErrInvalidToken       = errors.New("invalid or expired token")
	ErrUnauthorized       = errors.New("unauthorized access")
	ErrInvalidInput       = errors.New("invalid input data")
	ErrInternalServer     = errors.New("internal server error")
	ErrInvalidPassword    = errors.New("current password is incorrect")
)

// APIError represents an API error with HTTP status code
type APIError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

func (e APIError) Error() string {
	return e.Message
}

// NewAPIError creates a new API error
func NewAPIError(code int, message, details string) APIError {
	return APIError{
		Code:    code,
		Message: message,
		Details: details,
	}
}

// Common API errors
var (
	ErrBadRequest          = NewAPIError(http.StatusBadRequest, "Bad Request", "")
	ErrUnauthorizedAccess  = NewAPIError(http.StatusUnauthorized, "Unauthorized", "")
	ErrForbiddenAccess     = NewAPIError(http.StatusForbidden, "Forbidden", "")
	ErrNotFound            = NewAPIError(http.StatusNotFound, "Not Found", "")
	ErrConflict            = NewAPIError(http.StatusConflict, "Conflict", "")
	ErrInternalServerError = NewAPIError(http.StatusInternalServerError, "Internal Server Error", "")
)
```

## 3. middleware.go
```go
package users

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// JWTClaims represents the JWT token claims
type JWTClaims struct {
	UserID uint   `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// AuthMiddleware provides JWT authentication middleware
type AuthMiddleware struct {
	db        *gorm.DB
	jwtSecret []byte
}

// NewAuthMiddleware creates a new authentication middleware instance
func NewAuthMiddleware(db *gorm.DB, jwtSecret string) *AuthMiddleware {
	return &AuthMiddleware{
		db:        db,
		jwtSecret: []byte(jwtSecret),
	}
}

// RequireAuth middleware validates JWT token and sets user context
func (am *AuthMiddleware) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract token from Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, APIResponse{
				Success: false,
				Message: "Authorization header required",
				Error:   "missing_auth_header",
			})
			c.Abort()
			return
		}

		// Check if header starts with "Bearer "
		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, APIResponse{
				Success: false,
				Message: "Invalid authorization header format",
				Error:   "invalid_auth_format",
			})
			c.Abort()
			return
		}

		tokenString := tokenParts[1]

		// Parse and validate JWT token
		token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
			// Validate signing method
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, ErrInvalidToken
			}
			return am.jwtSecret, nil
		})

		if err != nil {
			c.JSON(http.StatusUnauthorized, APIResponse{
				Success: false,
				Message: "Invalid or expired token",
				Error:   "invalid_token",
			})
			c.Abort()
			return
		}

		// Extract claims
		claims, ok := token.Claims.(*JWTClaims)
		if !ok || !token.Valid {
			c.JSON(http.StatusUnauthorized, APIResponse{
				Success: false,
				Message: "Invalid token claims",
				Error:   "invalid_claims",
			})
			c.Abort()
			return
		}

		// Verify user still exists in database
		var user User
		if err := am.db.First(&user, claims.UserID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusUnauthorized, APIResponse{
					Success: false,
					Message: "User not found",
					Error:   "user_not_found",
				})
			} else {
				c.JSON(http.StatusInternalServerError, APIResponse{
					Success: false,
					Message: "Database error",
					Error:   "db_error",
				})
			}
			c.Abort()
			return
		}

		// Set user in context for use in handlers
		c.Set("user", &user)
		c.Set("user_id", claims.UserID)
		c.Next()
	}
}

// GenerateJWT generates a JWT token for the given user
func (am *AuthMiddleware) GenerateJWT(user *User) (string, error) {
	// Set token expiration to 24 hours
	expirationTime := time.Now().Add(24 * time.Hour)

	claims := &JWTClaims{
		UserID: user.ID,
		Email:  user.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "user-api",
			Subject:   "user-auth",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(am.jwtSecret)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// RateLimitMiddleware provides basic rate limiting
// Note: For production, consider using Redis-based rate limiting
func RateLimitMiddleware() gin.HandlerFunc {
	// This is a placeholder for rate limiting implementation
	// In production, implement proper rate limiting using:
	// - Redis with sliding window
	// - Token bucket algorithm
	// - Per-IP and per-user limits
	return func(c *gin.Context) {
		// TODO: Implement rate limiting logic
		// Example: limit to 100 requests per minute per IP
		c.Next()
	}
}

// CORSMiddleware handles Cross-Origin Resource Sharing
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Header("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// SecurityHeadersMiddleware adds security headers
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Next()
	}
}
```

## 4. handlers.go
```go
package users

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"gorm.io/gorm"
)

// UserHandler handles user-related HTTP requests
type UserHandler struct {
	db         *gorm.DB
	validator  *validator.Validate
	authMiddleware *AuthMiddleware
}

// NewUserHandler creates a new user handler instance
func NewUserHandler(db *gorm.DB, authMiddleware *AuthMiddleware) *UserHandler {
	validator := validator.New()
	RegisterCustomValidators(validator)
	
	return &UserHandler{
		db:         db,
		validator:  validator,
		authMiddleware: authMiddleware,
	}
}

// Register handles user registration
func (h *UserHandler) Register(c *gin.Context) {
	var req UserRegisterRequest
	
	// Bind JSON request body
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("Registration bind error: %v", err)
		c.JSON(http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "Invalid request format",
			Error:   "bind_error",
		})
		return
	}

	// Validate request
	if err := h.validator.Struct(&req); err != nil {
		var validationErrors []string
		for _, err := range err.(validator.ValidationErrors) {
			switch err.Tag() {
			case "required":
				validationErrors = append(validationErrors, err.Field()+" is required")
			case "email":
				validationErrors = append(validationErrors, "Invalid email format")
			case "min":
				validationErrors = append(validationErrors, err.Field()+" is too short")
			case "max":
				validationErrors = append(vali