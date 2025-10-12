I'll create a complete, production-ready Go user management and authentication API service. Here's the implementation:

## go.mod
```go
module user-auth-api

go 1.21

require (
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/gorilla/mux v1.8.0
    github.com/lib/pq v1.10.9
    golang.org/x/crypto v0.14.0
    golang.org/x/time v0.3.0
)
```

## models.go
```go
package main

import (
    "database/sql"
    "time"
)

// User represents the user model in the database
type User struct {
    ID        int       `json:"id" db:"id"`
    Name      string    `json:"name" db:"name"`
    Email     string    `json:"email" db:"email"`
    Password  string    `json:"-" db:"password_hash"` // Never serialize password
    CreatedAt time.Time `json:"created_at" db:"created_at"`
    UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// UserResponse represents the user data returned in API responses
type UserResponse struct {
    ID        int       `json:"id"`
    Name      string    `json:"name"`
    Email     string    `json:"email"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

// ToResponse converts User to UserResponse, excluding sensitive data
func (u *User) ToResponse() UserResponse {
    return UserResponse{
        ID:        u.ID,
        Name:      u.Name,
        Email:     u.Email,
        CreatedAt: u.CreatedAt,
        UpdatedAt: u.UpdatedAt,
    }
}

// RegisterRequest represents the request payload for user registration
type RegisterRequest struct {
    Name     string `json:"name" validate:"required,min=2,max=100"`
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required,min=8"`
}

// LoginRequest represents the request payload for user login
type LoginRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required"`
}

// UpdateProfileRequest represents the request payload for profile updates
type UpdateProfileRequest struct {
    Name            string `json:"name" validate:"required,min=2,max=100"`
    Email           string `json:"email" validate:"required,email"`
    CurrentPassword string `json:"current_password,omitempty"` // Required only for email changes
}

// ChangePasswordRequest represents the request payload for password changes
type ChangePasswordRequest struct {
    CurrentPassword string `json:"current_password" validate:"required"`
    NewPassword     string `json:"new_password" validate:"required,min=8"`
}

// AuthResponse represents the response for successful authentication
type AuthResponse struct {
    Token string       `json:"token"`
    User  UserResponse `json:"user"`
}

// UserRepository defines the interface for user data operations
type UserRepository interface {
    Create(user *User) error
    GetByEmail(email string) (*User, error)
    GetByID(id int) (*User, error)
    Update(user *User) error
    EmailExists(email string, excludeID int) (bool, error)
}

// PostgreSQLUserRepository implements UserRepository for PostgreSQL
type PostgreSQLUserRepository struct {
    db *sql.DB
}

// NewPostgreSQLUserRepository creates a new PostgreSQL user repository
func NewPostgreSQLUserRepository(db *sql.DB) *PostgreSQLUserRepository {
    return &PostgreSQLUserRepository{db: db}
}

// Create inserts a new user into the database
func (r *PostgreSQLUserRepository) Create(user *User) error {
    query := `
        INSERT INTO users (name, email, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id`
    
    now := time.Now()
    user.CreatedAt = now
    user.UpdatedAt = now
    
    err := r.db.QueryRow(query, user.Name, user.Email, user.Password, user.CreatedAt, user.UpdatedAt).Scan(&user.ID)
    if err != nil {
        return err
    }
    return nil
}

// GetByEmail retrieves a user by email address
func (r *PostgreSQLUserRepository) GetByEmail(email string) (*User, error) {
    user := &User{}
    query := `SELECT id, name, email, password_hash, created_at, updated_at FROM users WHERE email = $1`
    
    err := r.db.QueryRow(query, email).Scan(
        &user.ID, &user.Name, &user.Email, &user.Password, &user.CreatedAt, &user.UpdatedAt,
    )
    if err != nil {
        return nil, err
    }
    return user, nil
}

// GetByID retrieves a user by ID
func (r *PostgreSQLUserRepository) GetByID(id int) (*User, error) {
    user := &User{}
    query := `SELECT id, name, email, password_hash, created_at, updated_at FROM users WHERE id = $1`
    
    err := r.db.QueryRow(query, id).Scan(
        &user.ID, &user.Name, &user.Email, &user.Password, &user.CreatedAt, &user.UpdatedAt,
    )
    if err != nil {
        return nil, err
    }
    return user, nil
}

// Update modifies an existing user in the database
func (r *PostgreSQLUserRepository) Update(user *User) error {
    query := `
        UPDATE users 
        SET name = $1, email = $2, password_hash = $3, updated_at = $4
        WHERE id = $5`
    
    user.UpdatedAt = time.Now()
    _, err := r.db.Exec(query, user.Name, user.Email, user.Password, user.UpdatedAt, user.ID)
    return err
}

// EmailExists checks if an email is already in use by another user
func (r *PostgreSQLUserRepository) EmailExists(email string, excludeID int) (bool, error) {
    var count int
    query := `SELECT COUNT(*) FROM users WHERE email = $1 AND id != $2`
    
    err := r.db.QueryRow(query, email, excludeID).Scan(&count)
    if err != nil {
        return false, err
    }
    return count > 0, nil
}
```

## errors.go
```go
package main

import (
    "encoding/json"
    "fmt"
    "net/http"
)

// ErrorType represents different types of application errors
type ErrorType string

const (
    ErrorTypeValidation    ErrorType = "validation_error"
    ErrorTypeAuthentication ErrorType = "authentication_error"
    ErrorTypeAuthorization  ErrorType = "authorization_error"
    ErrorTypeNotFound      ErrorType = "not_found_error"
    ErrorTypeConflict      ErrorType = "conflict_error"
    ErrorTypeInternal      ErrorType = "internal_error"
)

// AppError represents a structured application error
type AppError struct {
    Type    ErrorType `json:"type"`
    Message string    `json:"message"`
    Details []string  `json:"details,omitempty"`
    Code    int       `json:"-"`
}

// Error implements the error interface
func (e *AppError) Error() string {
    return e.Message
}

// ErrorResponse represents the JSON error response format
type ErrorResponse struct {
    Error AppError `json:"error"`
}

// NewValidationError creates a new validation error
func NewValidationError(message string, details []string) *AppError {
    return &AppError{
        Type:    ErrorTypeValidation,
        Message: message,
        Details: details,
        Code:    http.StatusBadRequest,
    }
}

// NewAuthenticationError creates a new authentication error
func NewAuthenticationError(message string) *AppError {
    return &AppError{
        Type:    ErrorTypeAuthentication,
        Message: message,
        Code:    http.StatusUnauthorized,
    }
}

// NewAuthorizationError creates a new authorization error
func NewAuthorizationError(message string) *AppError {
    return &AppError{
        Type:    ErrorTypeAuthorization,
        Message: message,
        Code:    http.StatusForbidden,
    }
}

// NewNotFoundError creates a new not found error
func NewNotFoundError(message string) *AppError {
    return &AppError{
        Type:    ErrorTypeNotFound,
        Message: message,
        Code:    http.StatusNotFound,
    }
}

// NewConflictError creates a new conflict error
func NewConflictError(message string) *AppError {
    return &AppError{
        Type:    ErrorTypeConflict,
        Message: message,
        Code:    http.StatusConflict,
    }
}

// NewInternalError creates a new internal server error
func NewInternalError(message string) *AppError {
    return &AppError{
        Type:    ErrorTypeInternal,
        Message: message,
        Code:    http.StatusInternalServerError,
    }
}

// WriteErrorResponse writes an error response to the HTTP response writer
func WriteErrorResponse(w http.ResponseWriter, err *AppError) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(err.Code)
    
    response := ErrorResponse{Error: *err}
    if encodeErr := json.NewEncoder(w).Encode(response); encodeErr != nil {
        // Fallback to plain text if JSON encoding fails
        w.Header().Set("Content-Type", "text/plain")
        fmt.Fprintf(w, "Internal server error")
    }
}

// WriteJSONResponse writes a successful JSON response
func WriteJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(statusCode)
    
    if err := json.NewEncoder(w).Encode(data); err != nil {
        WriteErrorResponse(w, NewInternalError("Failed to encode response"))
    }
}
```

## validation.go
```go
package main

import (
    "encoding/json"
    "net/http"
    "regexp"
    "strings"
    "unicode"
)

// ValidationError represents a single validation error
type ValidationError struct {
    Field   string `json:"field"`
    Message string `json:"message"`
}

// Validator provides validation functionality
type Validator struct {
    emailRegex *regexp.Regexp
}

// NewValidator creates a new validator instance
func NewValidator() *Validator {
    // RFC 5322 compliant email regex (simplified version)
    emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
    return &Validator{
        emailRegex: emailRegex,
    }
}

// ValidateRegisterRequest validates user registration data
func (v *Validator) ValidateRegisterRequest(req *RegisterRequest) []ValidationError {
    var errors []ValidationError
    
    // Validate name
    if strings.TrimSpace(req.Name) == "" {
        errors = append(errors, ValidationError{
            Field:   "name",
            Message: "Name is required",
        })
    } else if len(req.Name) < 2 || len(req.Name) > 100 {
        errors = append(errors, ValidationError{
            Field:   "name",
            Message: "Name must be between 2 and 100 characters",
        })
    }
    
    // Validate email
    if emailErr := v.validateEmail(req.Email); emailErr != nil {
        errors = append(errors, *emailErr)
    }
    
    // Validate password
    if passwordErr := v.validatePassword(req.Password); passwordErr != nil {
        errors = append(errors, *passwordErr)
    }
    
    return errors
}

// ValidateLoginRequest validates user login data
func (v *Validator) ValidateLoginRequest(req *LoginRequest) []ValidationError {
    var errors []ValidationError
    
    // Validate email
    if emailErr := v.validateEmail(req.Email); emailErr != nil {
        errors = append(errors, *emailErr)
    }
    
    // Validate password presence
    if strings.TrimSpace(req.Password) == "" {
        errors = append(errors, ValidationError{
            Field:   "password",
            Message: "Password is required",
        })
    }
    
    return errors
}

// ValidateUpdateProfileRequest validates profile update data
func (v *Validator) ValidateUpdateProfileRequest(req *UpdateProfileRequest) []ValidationError {
    var errors []ValidationError
    
    // Validate name
    if strings.TrimSpace(req.Name) == "" {
        errors = append(errors, ValidationError{
            Field:   "name",
            Message: "Name is required",
        })
    } else if len(req.Name) < 2 || len(req.Name) > 100 {
        errors = append(errors, ValidationError{
            Field:   "name",
            Message: "Name must be between 2 and 100 characters",
        })
    }
    
    // Validate email
    if emailErr := v.validateEmail(req.Email); emailErr != nil {
        errors = append(errors, *emailErr)
    }
    
    return errors
}

// ValidateChangePasswordRequest validates password change data
func (v *Validator) ValidateChangePasswordRequest(req *ChangePasswordRequest) []ValidationError {
    var errors []ValidationError
    
    // Validate current password presence
    if strings.TrimSpace(req.CurrentPassword) == "" {
        errors = append(errors, ValidationError{
            Field:   "current_password",
            Message: "Current password is required",
        })
    }
    
    // Validate new password
    if passwordErr := v.validatePassword(req.NewPassword); passwordErr != nil {
        passwordErr.Field = "new_password"
        errors = append(errors, *passwordErr)
    }
    
    return errors
}

// validateEmail validates email format
func (v *Validator) validateEmail(email string) *ValidationError {
    email = strings.TrimSpace(email)
    if email == "" {
        return &ValidationError{
            Field:   "email",
            Message: "Email is required",
        }
    }
    
    if !v.emailRegex.MatchString(email) {
        return &ValidationError{
            Field:   "email",
            Message: "Email format is invalid",
        }
    }
    
    return nil
}

// validatePassword validates password strength
func (v *Validator) validatePassword(password string) *ValidationError {
    if len(password) < 8 {
        return &ValidationError{
            Field:   "password",
            Message: "Password must be at least 8 characters long",
        }
    }
    
    var hasUpper, hasLower, hasNumber bool
    
    for _, char := range password {
        switch {
        case unicode.IsUpper(char):
            hasUpper = true
        case unicode.IsLower(char):
            hasLower = true
        case unicode.IsNumber(char):
            hasNumber = true
        }
    }
    
    if !hasUpper {
        return &ValidationError{
            Field:   "password",
            Message: "Password must contain at least one uppercase letter",
        }
    }
    
    if !hasLower {
        return &ValidationError{
            Field:   "password",
            Message: "Password must contain at least one lowercase letter",