I'll create a complete, production-ready Go module for user management and authentication. Here's the implementation:

## Project Structure
```
api/
└── users/
    ├── go.mod
    ├── handlers.go
    ├── models.go
    ├── middleware.go
    ├── repository.go
    └── routes.go
```

## go.mod
```go
module api/users

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v4 v4.5.0
    github.com/go-playground/validator/v10 v10.15.5
    golang.org/x/crypto v0.14.0
    github.com/lib/pq v1.10.9
    github.com/google/uuid v1.4.0
)
```

## models.go
```go
package users

import (
    "time"
    "github.com/google/uuid"
)

// User represents the user model in the database
type User struct {
    ID        uuid.UUID  `json:"id" db:"id"`
    Email     string     `json:"email" db:"email"`
    Password  string     `json:"-" db:"password_hash"` // Never include in JSON responses
    FirstName string     `json:"first_name" db:"first_name"`
    LastName  string     `json:"last_name" db:"last_name"`
    CreatedAt time.Time  `json:"created_at" db:"created_at"`
    UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
    LastLogin *time.Time `json:"last_login,omitempty" db:"last_login"`
}

// RegisterRequest represents the registration request payload
type RegisterRequest struct {
    Email     string `json:"email" validate:"required,email,max=255"`
    Password  string `json:"password" validate:"required,min=8,max=128"`
    FirstName string `json:"first_name" validate:"required,min=1,max=100"`
    LastName  string `json:"last_name" validate:"required,min=1,max=100"`
}

// LoginRequest represents the login request payload
type LoginRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required"`
}

// UpdateProfileRequest represents the profile update request payload
type UpdateProfileRequest struct {
    Email     string `json:"email" validate:"required,email,max=255"`
    FirstName string `json:"first_name" validate:"required,min=1,max=100"`
    LastName  string `json:"last_name" validate:"required,min=1,max=100"`
}

// ChangePasswordRequest represents the password change request payload
type ChangePasswordRequest struct {
    CurrentPassword string `json:"current_password" validate:"required"`
    NewPassword     string `json:"new_password" validate:"required,min=8,max=128"`
}

// AuthResponse represents the authentication response
type AuthResponse struct {
    User  *User  `json:"user"`
    Token string `json:"token"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
    Error   string                 `json:"error"`
    Message string                 `json:"message,omitempty"`
    Details map[string]interface{} `json:"details,omitempty"`
}

// SuccessResponse represents a success response
type SuccessResponse struct {
    Message string      `json:"message"`
    Data    interface{} `json:"data,omitempty"`
}
```

## repository.go
```go
package users

import (
    "database/sql"
    "fmt"
    "time"
    "github.com/google/uuid"
    "github.com/lib/pq"
)

// UserRepository defines the interface for user data operations
type UserRepository interface {
    Create(user *User) error
    GetByEmail(email string) (*User, error)
    GetByID(id uuid.UUID) (*User, error)
    Update(user *User) error
    UpdatePassword(userID uuid.UUID, hashedPassword string) error
    UpdateLastLogin(userID uuid.UUID) error
    EmailExists(email string) (bool, error)
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
        INSERT INTO users (id, email, password_hash, first_name, last_name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, created_at, updated_at`
    
    user.ID = uuid.New()
    now := time.Now()
    user.CreatedAt = now
    user.UpdatedAt = now
    
    err := r.db.QueryRow(
        query,
        user.ID,
        user.Email,
        user.Password,
        user.FirstName,
        user.LastName,
        user.CreatedAt,
        user.UpdatedAt,
    ).Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)
    
    if err != nil {
        if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
            return fmt.Errorf("email already exists")
        }
        return fmt.Errorf("failed to create user: %w", err)
    }
    
    return nil
}

// GetByEmail retrieves a user by email
func (r *PostgreSQLUserRepository) GetByEmail(email string) (*User, error) {
    query := `
        SELECT id, email, password_hash, first_name, last_name, created_at, updated_at, last_login
        FROM users WHERE email = $1`
    
    user := &User{}
    err := r.db.QueryRow(query, email).Scan(
        &user.ID,
        &user.Email,
        &user.Password,
        &user.FirstName,
        &user.LastName,
        &user.CreatedAt,
        &user.UpdatedAt,
        &user.LastLogin,
    )
    
    if err != nil {
        if err == sql.ErrNoRows {
            return nil, fmt.Errorf("user not found")
        }
        return nil, fmt.Errorf("failed to get user by email: %w", err)
    }
    
    return user, nil
}

// GetByID retrieves a user by ID
func (r *PostgreSQLUserRepository) GetByID(id uuid.UUID) (*User, error) {
    query := `
        SELECT id, email, password_hash, first_name, last_name, created_at, updated_at, last_login
        FROM users WHERE id = $1`
    
    user := &User{}
    err := r.db.QueryRow(query, id).Scan(
        &user.ID,
        &user.Email,
        &user.Password,
        &user.FirstName,
        &user.LastName,
        &user.CreatedAt,
        &user.UpdatedAt,
        &user.LastLogin,
    )
    
    if err != nil {
        if err == sql.ErrNoRows {
            return nil, fmt.Errorf("user not found")
        }
        return nil, fmt.Errorf("failed to get user by ID: %w", err)
    }
    
    return user, nil
}

// Update updates user information
func (r *PostgreSQLUserRepository) Update(user *User) error {
    query := `
        UPDATE users 
        SET email = $2, first_name = $3, last_name = $4, updated_at = $5
        WHERE id = $1
        RETURNING updated_at`
    
    user.UpdatedAt = time.Now()
    
    err := r.db.QueryRow(
        query,
        user.ID,
        user.Email,
        user.FirstName,
        user.LastName,
        user.UpdatedAt,
    ).Scan(&user.UpdatedAt)
    
    if err != nil {
        if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
            return fmt.Errorf("email already exists")
        }
        return fmt.Errorf("failed to update user: %w", err)
    }
    
    return nil
}

// UpdatePassword updates user password
func (r *PostgreSQLUserRepository) UpdatePassword(userID uuid.UUID, hashedPassword string) error {
    query := `UPDATE users SET password_hash = $2, updated_at = $3 WHERE id = $1`
    
    _, err := r.db.Exec(query, userID, hashedPassword, time.Now())
    if err != nil {
        return fmt.Errorf("failed to update password: %w", err)
    }
    
    return nil
}

// UpdateLastLogin updates the last login timestamp
func (r *PostgreSQLUserRepository) UpdateLastLogin(userID uuid.UUID) error {
    query := `UPDATE users SET last_login = $2 WHERE id = $1`
    
    now := time.Now()
    _, err := r.db.Exec(query, userID, now)
    if err != nil {
        return fmt.Errorf("failed to update last login: %w", err)
    }
    
    return nil
}

// EmailExists checks if an email already exists
func (r *PostgreSQLUserRepository) EmailExists(email string) (bool, error) {
    query := `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`
    
    var exists bool
    err := r.db.QueryRow(query, email).Scan(&exists)
    if err != nil {
        return false, fmt.Errorf("failed to check email existence: %w", err)
    }
    
    return exists, nil
}
```

## middleware.go
```go
package users

import (
    "net/http"
    "strings"
    "time"
    
    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v4"
    "github.com/google/uuid"
)

// JWTClaims represents the JWT claims
type JWTClaims struct {
    UserID uuid.UUID `json:"user_id"`
    Email  string    `json:"email"`
    jwt.RegisteredClaims
}

// JWTService handles JWT operations
type JWTService struct {
    secretKey []byte
}

// NewJWTService creates a new JWT service
func NewJWTService(secretKey string) *JWTService {
    return &JWTService{
        secretKey: []byte(secretKey),
    }
}

// GenerateToken generates a new JWT token
func (j *JWTService) GenerateToken(user *User) (string, error) {
    claims := JWTClaims{
        UserID: user.ID,
        Email:  user.Email,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            NotBefore: jwt.NewNumericDate(time.Now()),
            Issuer:    "user-api",
            Subject:   user.ID.String(),
        },
    }
    
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(j.secretKey)
}

// ValidateToken validates a JWT token and returns the claims
func (j *JWTService) ValidateToken(tokenString string) (*JWTClaims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, jwt.ErrSignatureInvalid
        }
        return j.secretKey, nil
    })
    
    if err != nil {
        return nil, err
    }
    
    if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
        return claims, nil
    }
    
    return nil, jwt.ErrTokenInvalid
}

// AuthMiddleware creates a middleware for JWT authentication
func AuthMiddleware(jwtService *JWTService, userRepo UserRepository) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, ErrorResponse{
                Error:   "unauthorized",
                Message: "Authorization header is required",
            })
            c.Abort()
            return
        }
        
        tokenParts := strings.Split(authHeader, " ")
        if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
            c.JSON(http.StatusUnauthorized, ErrorResponse{
                Error:   "unauthorized",
                Message: "Invalid authorization header format",
            })
            c.Abort()
            return
        }
        
        claims, err := jwtService.ValidateToken(tokenParts[1])
        if err != nil {
            c.JSON(http.StatusUnauthorized, ErrorResponse{
                Error:   "unauthorized",
                Message: "Invalid or expired token",
            })
            c.Abort()
            return
        }
        
        // Verify user still exists
        user, err := userRepo.GetByID(claims.UserID)
        if err != nil {
            c.JSON(http.StatusUnauthorized, ErrorResponse{
                Error:   "unauthorized",
                Message: "User not found",
            })
            c.Abort()
            return
        }
        
        // Set user in context
        c.Set("user", user)
        c.Set("user_id", claims.UserID)
        c.Next()
    }
}
```

## handlers.go
```go
package users

import (
    "net/http"
    "strings"
    
    "github.com/gin-gonic/gin"
    "github.com/go-playground/validator/v10"
    "github.com/google/uuid"
    "golang.org/x/crypto/bcrypt"
)

// UserHandler handles user-related HTTP requests
type UserHandler struct {
    userRepo   UserRepository
    jwtService *JWTService
    validator  *validator.Validate
}

// NewUserHandler creates a new user handler
func NewUserHandler(userRepo UserRepository, jwtService *JWTService) *UserHandler {
    return &UserHandler{
        userRepo:   userRepo,
        jwtService: jwtService,
        validator:  validator.New(),
    }
}

// Register handles user registration
func (h *UserHandler) Register(c *gin.Context) {
    var req RegisterRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, ErrorResponse{
            Error:   "invalid_request",
            Message: "Invalid JSON payload",
            Details: map[string]interface{}{"error": err.Error()},
        })
        return
    }
    
    // Validate request
    if err := h.validator.Struct(req); err != nil {
        validationErrors := make(map[string]interface{})
        for _, err := range err.(validator.ValidationErrors) {
            field := strings.ToLower(err.Field())
            switch err.Tag