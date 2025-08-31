I'll create a complete Go HTTP API handler package for user management and authentication. Here's the production-ready code:

## Project Structure
```
api/
├── users/
│   ├── handler.go
│   ├── models.go
│   ├── middleware.go
│   ├── validation.go
│   └── database.go
└── main.go
```

## 1. models.go - Data structures and interfaces

```go
package users

import (
	"context"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

// User represents a user in the system
type User struct {
	ID        int       `json:"id" db:"id"`
	Email     string    `json:"email" db:"email"`
	Name      string    `json:"name" db:"name"`
	Password  string    `json:"-" db:"password_hash"` // Never include in JSON responses
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
	LastLogin *time.Time `json:"last_login,omitempty" db:"last_login"`
}

// Request/Response structs
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type UpdateProfileRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password,omitempty"` // Required only for email changes
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  *User  `json:"user"`
}

type ErrorResponse struct {
	Error   string   `json:"error"`
	Details []string `json:"details,omitempty"`
}

type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// JWT Claims
type Claims struct {
	UserID int    `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// Database interface for dependency injection and testing
type UserRepository interface {
	CreateUser(ctx context.Context, user *User) error
	GetUserByEmail(ctx context.Context, email string) (*User, error)
	GetUserByID(ctx context.Context, id int) (*User, error)
	UpdateUser(ctx context.Context, user *User) error
	UpdateLastLogin(ctx context.Context, userID int) error
	EmailExists(ctx context.Context, email string, excludeUserID int) (bool, error)
}
```

## 2. validation.go - Input validation

```go
package users

import (
	"fmt"
	"regexp"
	"strings"
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

type ValidationError struct {
	Field   string
	Message string
}

func (v ValidationError) Error() string {
	return fmt.Sprintf("%s: %s", v.Field, v.Message)
}

type ValidationErrors []ValidationError

func (v ValidationErrors) Error() string {
	var messages []string
	for _, err := range v {
		messages = append(messages, err.Error())
	}
	return strings.Join(messages, "; ")
}

func (v ValidationErrors) Messages() []string {
	var messages []string
	for _, err := range v {
		messages = append(messages, err.Error())
	}
	return messages
}

func validateRegisterRequest(req *RegisterRequest) ValidationErrors {
	var errors ValidationErrors

	// Validate email
	if req.Email == "" {
		errors = append(errors, ValidationError{Field: "email", Message: "email is required"})
	} else if !emailRegex.MatchString(req.Email) {
		errors = append(errors, ValidationError{Field: "email", Message: "invalid email format"})
	}

	// Validate password
	if req.Password == "" {
		errors = append(errors, ValidationError{Field: "password", Message: "password is required"})
	} else if len(req.Password) < 8 {
		errors = append(errors, ValidationError{Field: "password", Message: "password must be at least 8 characters long"})
	}

	// Validate name
	if req.Name == "" {
		errors = append(errors, ValidationError{Field: "name", Message: "name is required"})
	} else if strings.TrimSpace(req.Name) == "" {
		errors = append(errors, ValidationError{Field: "name", Message: "name cannot be empty"})
	}

	return errors
}

func validateLoginRequest(req *LoginRequest) ValidationErrors {
	var errors ValidationErrors

	if req.Email == "" {
		errors = append(errors, ValidationError{Field: "email", Message: "email is required"})
	}

	if req.Password == "" {
		errors = append(errors, ValidationError{Field: "password", Message: "password is required"})
	}

	return errors
}

func validateUpdateProfileRequest(req *UpdateProfileRequest) ValidationErrors {
	var errors ValidationErrors

	// Validate name
	if req.Name == "" {
		errors = append(errors, ValidationError{Field: "name", Message: "name is required"})
	} else if strings.TrimSpace(req.Name) == "" {
		errors = append(errors, ValidationError{Field: "name", Message: "name cannot be empty"})
	}

	// Validate email
	if req.Email == "" {
		errors = append(errors, ValidationError{Field: "email", Message: "email is required"})
	} else if !emailRegex.MatchString(req.Email) {
		errors = append(errors, ValidationError{Field: "email", Message: "invalid email format"})
	}

	return errors
}

func validateChangePasswordRequest(req *ChangePasswordRequest) ValidationErrors {
	var errors ValidationErrors

	if req.CurrentPassword == "" {
		errors = append(errors, ValidationError{Field: "current_password", Message: "current password is required"})
	}

	if req.NewPassword == "" {
		errors = append(errors, ValidationError{Field: "new_password", Message: "new password is required"})
	} else if len(req.NewPassword) < 8 {
		errors = append(errors, ValidationError{Field: "new_password", Message: "new password must be at least 8 characters long"})
	}

	return errors
}
```

## 3. middleware.go - JWT authentication middleware

```go
package users

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v4"
)

type contextKey string

const UserContextKey contextKey = "user"

func (h *Handler) JWTMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			h.writeErrorResponse(w, http.StatusUnauthorized, "Authorization header required", nil)
			return
		}

		// Check for Bearer token
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			h.writeErrorResponse(w, http.StatusUnauthorized, "Invalid authorization header format", nil)
			return
		}

		tokenString := parts[1]
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(h.jwtSecret), nil
		})

		if err != nil {
			log.Printf("JWT parsing error: %v", err)
			h.writeErrorResponse(w, http.StatusUnauthorized, "Invalid token", nil)
			return
		}

		if !token.Valid {
			h.writeErrorResponse(w, http.StatusUnauthorized, "Invalid token", nil)
			return
		}

		// Get user from database to ensure they still exist
		user, err := h.userRepo.GetUserByID(r.Context(), claims.UserID)
		if err != nil {
			log.Printf("Error fetching user from token: %v", err)
			h.writeErrorResponse(w, http.StatusUnauthorized, "Invalid token", nil)
			return
		}

		// Add user to request context
		ctx := context.WithValue(r.Context(), UserContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func getUserFromContext(ctx context.Context) (*User, bool) {
	user, ok := ctx.Value(UserContextKey).(*User)
	return user, ok
}
```

## 4. database.go - Database implementation

```go
package users

import (
	"context"
	"database/sql"
	"time"

	_ "github.com/lib/pq" // PostgreSQL driver
)

type PostgreSQLUserRepository struct {
	db *sql.DB
}

func NewPostgreSQLUserRepository(db *sql.DB) *PostgreSQLUserRepository {
	return &PostgreSQLUserRepository{db: db}
}

func (r *PostgreSQLUserRepository) CreateUser(ctx context.Context, user *User) error {
	query := `
		INSERT INTO users (email, name, password_hash, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`
	
	now := time.Now()
	err := r.db.QueryRowContext(ctx, query, user.Email, user.Name, user.Password, now, now).Scan(&user.ID)
	if err != nil {
		return err
	}
	
	user.CreatedAt = now
	user.UpdatedAt = now
	return nil
}

func (r *PostgreSQLUserRepository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	user := &User{}
	query := `
		SELECT id, email, name, password_hash, created_at, updated_at, last_login
		FROM users WHERE email = $1`
	
	row := r.db.QueryRowContext(ctx, query, email)
	err := row.Scan(&user.ID, &user.Email, &user.Name, &user.Password, 
		&user.CreatedAt, &user.UpdatedAt, &user.LastLogin)
	
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	
	return user, nil
}

func (r *PostgreSQLUserRepository) GetUserByID(ctx context.Context, id int) (*User, error) {
	user := &User{}
	query := `
		SELECT id, email, name, password_hash, created_at, updated_at, last_login
		FROM users WHERE id = $1`
	
	row := r.db.QueryRowContext(ctx, query, id)
	err := row.Scan(&user.ID, &user.Email, &user.Name, &user.Password, 
		&user.CreatedAt, &user.UpdatedAt, &user.LastLogin)
	
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	
	return user, nil
}

func (r *PostgreSQLUserRepository) UpdateUser(ctx context.Context, user *User) error {
	query := `
		UPDATE users 
		SET email = $1, name = $2, password_hash = $3, updated_at = $4
		WHERE id = $5`
	
	user.UpdatedAt = time.Now()
	_, err := r.db.ExecContext(ctx, query, user.Email, user.Name, user.Password, user.UpdatedAt, user.ID)
	return err
}

func (r *PostgreSQLUserRepository) UpdateLastLogin(ctx context.Context, userID int) error {
	query := `UPDATE users SET last_login = $1 WHERE id = $2`
	now := time.Now()
	_, err := r.db.ExecContext(ctx, query, now, userID)
	return err
}

func (r *PostgreSQLUserRepository) EmailExists(ctx context.Context, email string, excludeUserID int) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM users WHERE email = $1 AND id != $2`
	err := r.db.QueryRowContext(ctx, query, email, excludeUserID).Scan(&count)
	return count > 0, err
}

// Database schema (PostgreSQL)
const CreateUsersTableSQL = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`
```

## 5. handler.go - Main handler implementation

```go
package users

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	userRepo  UserRepository
	jwtSecret string
}

func NewHandler(userRepo UserRepository, jwtSecret string) *Handler {
	return &Handler{
		userRepo:  userRepo,
		jwtSecret: jwtSecret,
	}
}

// RegisterRoutes sets up all user-related routes
func (h *Handler) RegisterRoutes(router *mux.Router) {
	router.HandleFunc("/api/users/register", h.Register).Methods("POST")
	router.HandleFunc("/api/users/login", h.Login).Methods("POST")
	router.HandleFunc("/api/users/me", h.JWTMiddleware(h.GetProfile)).Methods("GET")
	router.HandleFunc("/api/users/me", h.JWTMiddleware(h.UpdateProfile)).Methods("PUT")
	router.HandleFunc("/api/users/change-password", h.JWTMiddleware(h.ChangePassword)).Methods("POST")
}

// Register handles user registration
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, "Invalid JSON", nil)
		return
	}

	// Validate input
	if validationErrors := validateRegisterRequest(&req); len(validationErrors) > 0 {
		h.writeErrorResponse(w, http.StatusBadRequest, "Validation failed", validationErrors.Messages())
		return
	}

	// Check if email already exists
	existingUser, err := h.userRepo.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		log.Printf("Error checking email existence: %v", err)
		h.writeErrorResponse(w, http.StatusInternalServerError, "Internal server error", nil)
		return
	}
	if existingUser != nil {
		h.writeErrorResponse(w, http.StatusConflict, "Email already registered",