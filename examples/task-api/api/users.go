I'll create a complete, production-ready Go module for user management and authentication. Here's the implementation:

## go.mod
```go
module api/users

go 1.21

require (
    github.com/go-chi/chi/v5 v5.0.10
    github.com/go-chi/cors v1.2.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/lib/pq v1.10.9
    golang.org/x/crypto v0.14.0
    github.com/go-playground/validator/v10 v10.15.5
)
```

## models.go
```go
package users

import (
    "time"
    "github.com/go-playground/validator/v10"
)

// User represents the user entity in the database
type User struct {
    ID          int       `json:"id" db:"id"`
    Email       string    `json:"email" db:"email" validate:"required,email"`
    Password    string    `json:"-" db:"password_hash"` // Never include in JSON responses
    Name        string    `json:"name" db:"name" validate:"required,min=2,max=100"`
    CreatedAt   time.Time `json:"created_at" db:"created_at"`
    UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
    LastLoginAt *time.Time `json:"last_login_at,omitempty" db:"last_login_at"`
}

// RegisterRequest represents the registration request payload
type RegisterRequest struct {
    Email           string `json:"email" validate:"required,email"`
    Password        string `json:"password" validate:"required,min=8"`
    PasswordConfirm string `json:"password_confirm" validate:"required,eqfield=Password"`
    Name            string `json:"name" validate:"required,min=2,max=100"`
}

// LoginRequest represents the login request payload
type LoginRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required"`
}

// UpdateUserRequest represents the user update request payload
type UpdateUserRequest struct {
    Name  string `json:"name" validate:"required,min=2,max=100"`
    Email string `json:"email" validate:"required,email"`
}

// ChangePasswordRequest represents the password change request payload
type ChangePasswordRequest struct {
    CurrentPassword string `json:"current_password" validate:"required"`
    NewPassword     string `json:"new_password" validate:"required,min=8"`
    PasswordConfirm string `json:"password_confirm" validate:"required,eqfield=NewPassword"`
}

// UserResponse represents the user data returned in API responses
type UserResponse struct {
    ID          int        `json:"id"`
    Email       string     `json:"email"`
    Name        string     `json:"name"`
    CreatedAt   time.Time  `json:"created_at"`
    UpdatedAt   time.Time  `json:"updated_at"`
    LastLoginAt *time.Time `json:"last_login_at,omitempty"`
}

// LoginResponse represents the login response with token
type LoginResponse struct {
    User  UserResponse `json:"user"`
    Token string       `json:"token"`
}

// ErrorResponse represents API error responses
type ErrorResponse struct {
    Error   string            `json:"error"`
    Message string            `json:"message"`
    Details map[string]string `json:"details,omitempty"`
}

// ToResponse converts User to UserResponse (excludes sensitive data)
func (u *User) ToResponse() UserResponse {
    return UserResponse{
        ID:          u.ID,
        Email:       u.Email,
        Name:        u.Name,
        CreatedAt:   u.CreatedAt,
        UpdatedAt:   u.UpdatedAt,
        LastLoginAt: u.LastLoginAt,
    }
}

// Custom validator instance
var validate *validator.Validate

func init() {
    validate = validator.New()
}

// ValidateStruct validates a struct using the validator tags
func ValidateStruct(s interface{}) map[string]string {
    err := validate.Struct(s)
    if err == nil {
        return nil
    }

    errors := make(map[string]string)
    for _, err := range err.(validator.ValidationErrors) {
        field := err.Field()
        switch err.Tag() {
        case "required":
            errors[field] = field + " is required"
        case "email":
            errors[field] = "Invalid email format"
        case "min":
            errors[field] = field + " must be at least " + err.Param() + " characters"
        case "max":
            errors[field] = field + " must be at most " + err.Param() + " characters"
        case "eqfield":
            errors[field] = field + " must match " + err.Param()
        default:
            errors[field] = "Invalid " + field
        }
    }
    return errors
}
```

## repository.go
```go
package users

import (
    "context"
    "database/sql"
    "fmt"
    "time"
    
    _ "github.com/lib/pq"
)

// UserRepository defines the interface for user data operations
type UserRepository interface {
    Create(ctx context.Context, user *User) error
    GetByID(ctx context.Context, id int) (*User, error)
    GetByEmail(ctx context.Context, email string) (*User, error)
    Update(ctx context.Context, user *User) error
    UpdatePassword(ctx context.Context, userID int, hashedPassword string) error
    UpdateLastLogin(ctx context.Context, userID int) error
    EmailExists(ctx context.Context, email string, excludeUserID int) (bool, error)
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
func (r *PostgreSQLUserRepository) Create(ctx context.Context, user *User) error {
    query := `
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id`
    
    now := time.Now()
    user.CreatedAt = now
    user.UpdatedAt = now
    
    err := r.db.QueryRowContext(ctx, query, user.Email, user.Password, user.Name, user.CreatedAt, user.UpdatedAt).Scan(&user.ID)
    if err != nil {
        return fmt.Errorf("failed to create user: %w", err)
    }
    
    return nil
}

// GetByID retrieves a user by ID
func (r *PostgreSQLUserRepository) GetByID(ctx context.Context, id int) (*User, error) {
    query := `
        SELECT id, email, password_hash, name, created_at, updated_at, last_login_at
        FROM users
        WHERE id = $1`
    
    user := &User{}
    err := r.db.QueryRowContext(ctx, query, id).Scan(
        &user.ID, &user.Email, &user.Password, &user.Name,
        &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt,
    )
    
    if err != nil {
        if err == sql.ErrNoRows {
            return nil, ErrUserNotFound
        }
        return nil, fmt.Errorf("failed to get user by ID: %w", err)
    }
    
    return user, nil
}

// GetByEmail retrieves a user by email
func (r *PostgreSQLUserRepository) GetByEmail(ctx context.Context, email string) (*User, error) {
    query := `
        SELECT id, email, password_hash, name, created_at, updated_at, last_login_at
        FROM users
        WHERE email = $1`
    
    user := &User{}
    err := r.db.QueryRowContext(ctx, query, email).Scan(
        &user.ID, &user.Email, &user.Password, &user.Name,
        &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt,
    )
    
    if err != nil {
        if err == sql.ErrNoRows {
            return nil, ErrUserNotFound
        }
        return nil, fmt.Errorf("failed to get user by email: %w", err)
    }
    
    return user, nil
}

// Update updates user information
func (r *PostgreSQLUserRepository) Update(ctx context.Context, user *User) error {
    query := `
        UPDATE users
        SET email = $1, name = $2, updated_at = $3
        WHERE id = $4`
    
    user.UpdatedAt = time.Now()
    
    result, err := r.db.ExecContext(ctx, query, user.Email, user.Name, user.UpdatedAt, user.ID)
    if err != nil {
        return fmt.Errorf("failed to update user: %w", err)
    }
    
    rowsAffected, err := result.RowsAffected()
    if err != nil {
        return fmt.Errorf("failed to get rows affected: %w", err)
    }
    
    if rowsAffected == 0 {
        return ErrUserNotFound
    }
    
    return nil
}

// UpdatePassword updates user password
func (r *PostgreSQLUserRepository) UpdatePassword(ctx context.Context, userID int, hashedPassword string) error {
    query := `
        UPDATE users
        SET password_hash = $1, updated_at = $2
        WHERE id = $3`
    
    result, err := r.db.ExecContext(ctx, query, hashedPassword, time.Now(), userID)
    if err != nil {
        return fmt.Errorf("failed to update password: %w", err)
    }
    
    rowsAffected, err := result.RowsAffected()
    if err != nil {
        return fmt.Errorf("failed to get rows affected: %w", err)
    }
    
    if rowsAffected == 0 {
        return ErrUserNotFound
    }
    
    return nil
}

// UpdateLastLogin updates the last login timestamp
func (r *PostgreSQLUserRepository) UpdateLastLogin(ctx context.Context, userID int) error {
    query := `
        UPDATE users
        SET last_login_at = $1
        WHERE id = $2`
    
    now := time.Now()
    _, err := r.db.ExecContext(ctx, query, now, userID)
    if err != nil {
        return fmt.Errorf("failed to update last login: %w", err)
    }
    
    return nil
}

// EmailExists checks if an email already exists (excluding a specific user ID)
func (r *PostgreSQLUserRepository) EmailExists(ctx context.Context, email string, excludeUserID int) (bool, error) {
    query := `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND id != $2)`
    
    var exists bool
    err := r.db.QueryRowContext(ctx, query, email, excludeUserID).Scan(&exists)
    if err != nil {
        return false, fmt.Errorf("failed to check email existence: %w", err)
    }
    
    return exists, nil
}

// Database schema for PostgreSQL
const CreateUsersTableSQL = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
`
```

## service.go
```go
package users

import (
    "context"
    "fmt"
    "time"
    
    "golang.org/x/crypto/bcrypt"
)

// UserService defines the interface for user business logic
type UserService interface {
    Register(ctx context.Context, req RegisterRequest) (*User, error)
    Login(ctx context.Context, req LoginRequest) (*User, string, error)
    GetUserByID(ctx context.Context, id int) (*User, error)
    UpdateUser(ctx context.Context, userID int, req UpdateUserRequest) (*User, error)
    ChangePassword(ctx context.Context, userID int, req ChangePasswordRequest) error
}

// userService implements UserService
type userService struct {
    repo      UserRepository
    jwtSecret string
}

// NewUserService creates a new user service
func NewUserService(repo UserRepository, jwtSecret string) UserService {
    return &userService{
        repo:      repo,
        jwtSecret: jwtSecret,
    }
}

// Register creates a new user account
func (s *userService) Register(ctx context.Context, req RegisterRequest) (*User, error) {
    // Validate input
    if errors := ValidateStruct(req); errors != nil {
        return nil, &ValidationError{Errors: errors}
    }
    
    // Check if email already exists
    existingUser, err := s.repo.GetByEmail(ctx, req.Email)
    if err != nil && err != ErrUserNotFound {
        return nil, fmt.Errorf("failed to check existing email: %w", err)
    }
    if existingUser != nil {
        return nil, ErrEmailAlreadyExists
    }
    
    // Hash password with bcrypt cost 12 for security
    hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
    if err != nil {
        return nil, fmt.Errorf("failed to hash password: %w", err)
    }
    
    // Create user
    user := &User{
        Email:    req.Email,
        Password: string(hashedPassword),
        Name:     req.Name,
    }
    
    if err := s.repo.Create(ctx, user); err != nil {
        return nil, fmt.Errorf("failed to create user: %w", err)
    }
    
    return user, nil
}

// Login authenticates a user and returns a JWT token
func (s *userService) Login(ctx context.Context, req LoginRequest) (*User, string, error) {
    // Validate input
    if errors := ValidateStruct(req); errors != nil {
        return nil, "", &ValidationError{Errors: errors}
    }
    
    // Get user by email
    user, err := s.repo.GetByEmail(ctx, req.Email)
    if err != nil {
        if err == ErrUserNotFound {
            return nil, "", ErrInvalidCredentials
        }
        return nil, "", fmt.Errorf("failed to get user: %w", err)
    }
    
    // Verify password
    if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
        return nil, "", ErrInvalidCredentials
    }
    
    // Generate JWT token
    token, err := GenerateJWT(user.ID, s.jwtSecret)
    if err != nil {
        return nil, "", fmt.Errorf("failed to generate token: %w", err)
    }
    
    // Update last login timestamp (non-blocking)
    go func() {
        ctx, cancel := context.WithTimeout(context.Background(), 5*time.Secon