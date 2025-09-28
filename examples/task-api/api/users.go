I'll create a production-ready Go user management and authentication API module. Here's the complete implementation:

## Project Structure
```
api/
└── users/
    ├── handlers.go
    ├── models.go
    ├── middleware.go
    ├── validation.go
    └── errors.go
```

## 1. Package Models (`api/users/models.go`)

```go
package users

import (
	"time"
	"database/sql/driver"
	"encoding/json"
)

// User represents the user database model
type User struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Email     string    `json:"email" gorm:"uniqueIndex;not null"`
	Password  string    `json:"-" gorm:"not null"` // Never include in JSON responses
	FirstName string    `json:"first_name" gorm:"not null"`
	LastName  string    `json:"last_name" gorm:"not null"`
	LastLogin *time.Time `json:"last_login"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// RegisterRequest represents user registration payload
type RegisterRequest struct {
	Email     string `json:"email" validate:"required,email"`
	Password  string `json:"password" validate:"required,min=8"`
	FirstName string `json:"first_name" validate:"required,min=2,max=50"`
	LastName  string `json:"last_name" validate:"required,min=2,max=50"`
}

// LoginRequest represents user login payload
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// UpdateProfileRequest represents profile update payload
type UpdateProfileRequest struct {
	FirstName string `json:"first_name" validate:"required,min=2,max=50"`
	LastName  string `json:"last_name" validate:"required,min=2,max=50"`
	Email     string `json:"email" validate:"required,email"`
}

// ChangePasswordRequest represents password change payload
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
}

// UserResponse represents user data in API responses
type UserResponse struct {
	ID        uint       `json:"id"`
	Email     string     `json:"email"`
	FirstName string     `json:"first_name"`
	LastName  string     `json:"last_name"`
	LastLogin *time.Time `json:"last_login"`
	CreatedAt time.Time  `json:"created_at"`
}

// LoginResponse represents login API response
type LoginResponse struct {
	User  UserResponse `json:"user"`
	Token string       `json:"token"`
}

// APIResponse represents standard API response structure
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Message string      `json:"message,omitempty"`
}

// ToResponse converts User model to UserResponse
func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:        u.ID,
		Email:     u.Email,
		FirstName: u.FirstName,
		LastName:  u.LastName,
		LastLogin: u.LastLogin,
		CreatedAt: u.CreatedAt,
	}
}
```

## 2. Custom Errors (`api/users/errors.go`)

```go
package users

import (
	"errors"
	"fmt"
)

// Custom error types
var (
	ErrUserNotFound      = errors.New("user not found")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailAlreadyExists = errors.New("email already exists")
	ErrInvalidToken      = errors.New("invalid or expired token")
	ErrUnauthorized      = errors.New("unauthorized access")
	ErrInvalidPassword   = errors.New("invalid current password")
	ErrSamePassword      = errors.New("new password must be different from current password")
)

// UserError represents a user-related error with HTTP status code
type UserError struct {
	Code    int
	Message string
	Err     error
}

func (e *UserError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

// NewUserError creates a new UserError
func NewUserError(code int, message string, err error) *UserError {
	return &UserError{
		Code:    code,
		Message: message,
		Err:     err,
	}
}

// Common error constructors
func NewBadRequestError(message string, err error) *UserError {
	return NewUserError(400, message, err)
}

func NewUnauthorizedError(message string, err error) *UserError {
	return NewUserError(401, message, err)
}

func NewNotFoundError(message string, err error) *UserError {
	return NewUserError(404, message, err)
}

func NewConflictError(message string, err error) *UserError {
	return NewUserError(409, message, err)
}

func NewInternalServerError(message string, err error) *UserError {
	return NewUserError(500, message, err)
}
```

## 3. Validation (`api/users/validation.go`)

```go
package users

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/go-playground/validator/v10"
)

var (
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	validate   = validator.New()
)

// ValidateStruct validates a struct using validator tags
func ValidateStruct(s interface{}) error {
	return validate.Struct(s)
}

// ValidateEmail validates email format
func ValidateEmail(email string) bool {
	return emailRegex.MatchString(strings.TrimSpace(email))
}

// ValidatePassword validates password strength
func ValidatePassword(password string) error {
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters long")
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

// ValidationErrorResponse converts validation errors to user-friendly messages
func ValidationErrorResponse(err error) map[string]string {
	errors := make(map[string]string)
	
	if validationErrors, ok := err.(validator.ValidationErrors); ok {
		for _, e := range validationErrors {
			field := strings.ToLower(e.Field())
			switch e.Tag() {
			case "required":
				errors[field] = field + " is required"
			case "email":
				errors[field] = "invalid email format"
			case "min":
				errors[field] = field + " must be at least " + e.Param() + " characters"
			case "max":
				errors[field] = field + " must be at most " + e.Param() + " characters"
			default:
				errors[field] = field + " is invalid"
			}
		}
	}
	
	return errors
}
```

## 4. Authentication Middleware (`api/users/middleware.go`)

```go
package users

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
)

// JWTClaims represents JWT token claims
type JWTClaims struct {
	UserID uint   `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// AuthService handles JWT operations
type AuthService struct {
	secretKey []byte
}

// NewAuthService creates a new AuthService
func NewAuthService(secretKey string) *AuthService {
	return &AuthService{
		secretKey: []byte(secretKey),
	}
}

// GenerateToken generates a JWT token for a user
func (a *AuthService) GenerateToken(user *User) (string, error) {
	claims := JWTClaims{
		UserID: user.ID,
		Email:  user.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "user-api",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(a.secretKey)
}

// ValidateToken validates and parses a JWT token
func (a *AuthService) ValidateToken(tokenString string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return a.secretKey, nil
	})

	if err != nil {
		return nil, ErrInvalidToken
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, ErrInvalidToken
}

// AuthMiddleware validates JWT tokens and adds user context
func (h *Handler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			h.sendErrorResponse(w, http.StatusUnauthorized, "Authorization header required", nil)
			return
		}

		bearerToken := strings.Split(authHeader, " ")
		if len(bearerToken) != 2 || bearerToken[0] != "Bearer" {
			h.sendErrorResponse(w, http.StatusUnauthorized, "Invalid authorization header format", nil)
			return
		}

		claims, err := h.authService.ValidateToken(bearerToken[1])
		if err != nil {
			h.sendErrorResponse(w, http.StatusUnauthorized, "Invalid token", err)
			return
		}

		// Add user ID to request context
		ctx := context.WithValue(r.Context(), "userID", claims.UserID)
		ctx = context.WithValue(ctx, "userEmail", claims.Email)
		
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserIDFromContext extracts user ID from request context
func GetUserIDFromContext(ctx context.Context) (uint, bool) {
	userID, ok := ctx.Value("userID").(uint)
	return userID, ok
}

// GetUserEmailFromContext extracts user email from request context
func GetUserEmailFromContext(ctx context.Context) (string, bool) {
	email, ok := ctx.Value("userEmail").(string)
	return email, ok
}
```

## 5. Main Handlers (`api/users/handlers.go`)

```go
package users

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"github.com/gorilla/mux"
)

// Handler handles user-related HTTP requests
type Handler struct {
	db          *gorm.DB
	authService *AuthService
	logger      *log.Logger
}

// NewHandler creates a new user handler
func NewHandler(db *gorm.DB, authService *AuthService, logger *log.Logger) *Handler {
	return &Handler{
		db:          db,
		authService: authService,
		logger:      logger,
	}
}

// RegisterRoutes registers all user routes
func (h *Handler) RegisterRoutes(router *mux.Router) {
	// Public routes
	router.HandleFunc("/api/users/register", h.Register).Methods("POST")
	router.HandleFunc("/api/users/login", h.Login).Methods("POST")
	
	// Protected routes
	protected := router.PathPrefix("/api/users").Subrouter()
	protected.Use(h.AuthMiddleware)
	protected.HandleFunc("/me", h.GetProfile).Methods("GET")
	protected.HandleFunc("/me", h.UpdateProfile).Methods("PUT")
	protected.HandleFunc("/change-password", h.ChangePassword).Methods("POST")
}

// Register handles user registration
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.sendErrorResponse(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Validate request
	if err := ValidateStruct(req); err != nil {
		validationErrors := ValidationErrorResponse(err)
		h.sendValidationErrorResponse(w, "Validation failed", validationErrors)
		return
	}

	// Additional password validation
	if err := ValidatePassword(req.Password); err != nil {
		h.sendErrorResponse(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	// Check if user already exists
	var existingUser User
	if err := h.db.Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
		h.sendErrorResponse(w, http.StatusConflict, "Email already exists", nil)
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), 14)
	if err != nil {
		h.logger.Printf("Password hashing error: %v", err)
		h.sendErrorResponse(w, http.StatusInternalServerError, "Internal server error", nil)
		return
	}

	// Create user
	user := User{
		Email:     req.Email,
		Password:  string(hashedPassword),
		FirstName: req.FirstName,
		LastName:  req.LastName,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := h.db.Create(&user).Error; err != nil {
		h.logger.Printf("Database error during user creation: %v", err)
		h.sendErrorResponse(w, http.StatusInternalServerError, "Failed to create user", nil)
		return