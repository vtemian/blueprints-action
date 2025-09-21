I'll create a complete authentication and authorization module following Go best practices. Here's the production-ready implementation:

## core/auth/auth.go

```go
// Package auth provides authentication and authorization utilities for HTTP services.
// It includes JWT token management, password hashing, and HTTP middleware for protected routes.
package auth

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	// TokenExpirationHours defines the access token expiration time
	TokenExpirationHours = 24
	// BcryptCost defines the cost factor for bcrypt hashing
	BcryptCost = 12
	// AuthorizationHeader is the HTTP header name for authorization
	AuthorizationHeader = "Authorization"
	// BearerPrefix is the expected prefix for Bearer tokens
	BearerPrefix = "Bearer "
)

// Custom error types for authentication failures
var (
	ErrInvalidToken     = errors.New("invalid token")
	ErrExpiredToken     = errors.New("token has expired")
	ErrMalformedToken   = errors.New("malformed token")
	ErrMissingToken     = errors.New("missing authorization token")
	ErrInvalidSignature = errors.New("invalid token signature")
	ErrPasswordHashing  = errors.New("password hashing failed")
	ErrUserNotFound     = errors.New("user not found")
	ErrInactiveUser     = errors.New("user account is inactive")
	ErrInvalidPassword  = errors.New("invalid password")
)

// User represents a user in the system
type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	IsActive bool   `json:"is_active"`
}

// Claims represents JWT claims structure
type Claims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

// AuthResponse represents authentication response structure
type AuthResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Token   string `json:"token,omitempty"`
	User    *User  `json:"user,omitempty"`
}

// ErrorResponse represents error response structure
type ErrorResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
	Code    int    `json:"code"`
}

// UserRepository interface for user data operations
// This should be implemented by your data layer
type UserRepository interface {
	GetUserByID(ctx context.Context, id int) (*User, error)
	GetUserByUsername(ctx context.Context, username string) (*User, error)
	GetUserByEmail(ctx context.Context, email string) (*User, error)
}

// AuthService provides authentication and authorization services
type AuthService struct {
	jwtSecret  []byte
	userRepo   UserRepository
	logger     *log.Logger
}

// NewAuthService creates a new authentication service instance
func NewAuthService(userRepo UserRepository, logger *log.Logger) *AuthService {
	secret := getJWTSecret()
	if logger == nil {
		logger = log.New(os.Stdout, "[AUTH] ", log.LstdFlags|log.Lshortfile)
	}
	
	return &AuthService{
		jwtSecret: []byte(secret),
		userRepo:  userRepo,
		logger:    logger,
	}
}

// getJWTSecret retrieves JWT secret from environment variable with fallback
func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		// In production, this should cause the application to fail to start
		log.Println("WARNING: JWT_SECRET not set, using default (NOT FOR PRODUCTION)")
		return "your-256-bit-secret-key-change-this-in-production"
	}
	return secret
}

// CreateAccessToken generates a JWT access token with 24-hour expiration
func (a *AuthService) CreateAccessToken(data map[string]interface{}) (string, error) {
	// Validate required fields
	userID, ok := data["user_id"]
	if !ok {
		return "", fmt.Errorf("user_id is required in token data")
	}
	
	username, ok := data["username"].(string)
	if !ok {
		return "", fmt.Errorf("username is required and must be a string")
	}
	
	email, ok := data["email"].(string)
	if !ok {
		return "", fmt.Errorf("email is required and must be a string")
	}
	
	// Convert user_id to int
	var userIDInt int
	switch v := userID.(type) {
	case int:
		userIDInt = v
	case float64:
		userIDInt = int(v)
	case string:
		var err error
		userIDInt, err = strconv.Atoi(v)
		if err != nil {
			return "", fmt.Errorf("invalid user_id format: %w", err)
		}
	default:
		return "", fmt.Errorf("user_id must be int, float64, or string")
	}
	
	// Create claims
	claims := Claims{
		UserID:   userIDInt,
		Username: username,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(TokenExpirationHours * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "auth-service",
		},
	}
	
	// Create token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(a.jwtSecret)
	if err != nil {
		a.logger.Printf("Failed to sign token for user %d: %v", userIDInt, err)
		return "", fmt.Errorf("failed to create token: %w", err)
	}
	
	a.logger.Printf("Access token created for user %d (%s)", userIDInt, username)
	return tokenString, nil
}

// VerifyToken validates and parses a JWT token
func (a *AuthService) VerifyToken(tokenString string) (*jwt.Token, error) {
	if tokenString == "" {
		return nil, ErrMissingToken
	}
	
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return a.jwtSecret, nil
	})
	
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		if errors.Is(err, jwt.ErrTokenMalformed) {
			return nil, ErrMalformedToken
		}
		if errors.Is(err, jwt.ErrSignatureInvalid) {
			return nil, ErrInvalidSignature
		}
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}
	
	if !token.Valid {
		return nil, ErrInvalidToken
	}
	
	return token, nil
}

// GetPasswordHash creates a bcrypt hash of the password with cost factor 12
func GetPasswordHash(password string) (string, error) {
	if len(password) == 0 {
		return "", fmt.Errorf("password cannot be empty")
	}
	
	if len(password) > 72 {
		return "", fmt.Errorf("password too long (max 72 bytes for bcrypt)")
	}
	
	hash, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrPasswordHashing, err)
	}
	
	return string(hash), nil
}

// VerifyPassword compares a plain password with its bcrypt hash using constant-time comparison
func VerifyPassword(plainPassword, hashedPassword string) bool {
	if len(plainPassword) == 0 || len(hashedPassword) == 0 {
		return false
	}
	
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	return err == nil
}

// GetCurrentUser extracts user information from a JWT token
func (a *AuthService) GetCurrentUser(tokenString string) (*User, error) {
	token, err := a.VerifyToken(tokenString)
	if err != nil {
		return nil, err
	}
	
	claims, ok := token.Claims.(*Claims)
	if !ok {
		return nil, ErrInvalidToken
	}
	
	// Create user from claims
	user := &User{
		ID:       claims.UserID,
		Username: claims.Username,
		Email:    claims.Email,
		IsActive: true, // Token existence implies active user, but verify with repo if needed
	}
	
	// Optionally verify user still exists and is active in database
	if a.userRepo != nil {
		ctx := context.Background()
		dbUser, err := a.userRepo.GetUserByID(ctx, claims.UserID)
		if err != nil {
			a.logger.Printf("Failed to verify user %d from database: %v", claims.UserID, err)
			return nil, ErrUserNotFound
		}
		
		if !dbUser.IsActive {
			a.logger.Printf("User %d (%s) is inactive", dbUser.ID, dbUser.Username)
			return nil, ErrInactiveUser
		}
		
		// Return database user data (more up-to-date)
		return dbUser, nil
	}
	
	return user, nil
}

// extractTokenFromHeader extracts Bearer token from Authorization header
func extractTokenFromHeader(authHeader string) (string, error) {
	if authHeader == "" {
		return "", ErrMissingToken
	}
	
	if !strings.HasPrefix(authHeader, BearerPrefix) {
		return "", ErrMalformedToken
	}
	
	token := strings.TrimPrefix(authHeader, BearerPrefix)
	if token == "" {
		return "", ErrMissingToken
	}
	
	return token, nil
}

// AuthMiddleware creates HTTP middleware for protected routes
func (a *AuthService) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get(AuthorizationHeader)
		
		token, err := extractTokenFromHeader(authHeader)
		if err != nil {
			a.logger.Printf("Auth middleware - token extraction failed: %v", err)
			a.writeErrorResponse(w, err, http.StatusUnauthorized)
			return
		}
		
		user, err := a.GetCurrentUser(token)
		if err != nil {
			a.logger.Printf("Auth middleware - user verification failed: %v", err)
			statusCode := http.StatusUnauthorized
			if errors.Is(err, ErrUserNotFound) || errors.Is(err, ErrInactiveUser) {
				statusCode = http.StatusForbidden
			}
			a.writeErrorResponse(w, err, statusCode)
			return
		}
		
		// Add user to request context
		ctx := context.WithValue(r.Context(), "user", user)
		ctx = context.WithValue(ctx, "token", token)
		
		// Continue to next handler
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireActiveUser middleware ensures the user is active
func (a *AuthService) RequireActiveUser(next http.Handler) http.Handler {
	return a.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := r.Context().Value("user").(*User)
		if !ok {
			a.logger.Printf("RequireActiveUser - user not found in context")
			a.writeErrorResponse(w, ErrUserNotFound, http.StatusInternalServerError)
			return
		}
		
		if !user.IsActive {
			a.logger.Printf("RequireActiveUser - user %d (%s) is inactive", user.ID, user.Username)
			a.writeErrorResponse(w, ErrInactiveUser, http.StatusForbidden)
			return
		}
		
		next.ServeHTTP(w, r)
	}))
}

// GetUserFromContext extracts user from request context
func GetUserFromContext(ctx context.Context) (*User, bool) {
	user, ok := ctx.Value("user").(*User)
	return user, ok
}

// GetTokenFromContext extracts token from request context
func GetTokenFromContext(ctx context.Context) (string, bool) {
	token, ok := ctx.Value("token").(string)
	return token, ok
}

// writeErrorResponse writes a JSON error response
func (a *AuthService) writeErrorResponse(w http.ResponseWriter, err error, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	
	// Don't expose internal errors to clients
	message := "Authentication failed"
	switch {
	case errors.Is(err, ErrMissingToken):
		message = "Missing authorization token"
	case errors.Is(err, ErrMalformedToken):
		message = "Malformed authorization token"
	case errors.Is(err, ErrExpiredToken):
		message = "Token has expired"
	case errors.Is(err, ErrInvalidToken):
		message = "Invalid token"
	case errors.Is(err, ErrInactiveUser):
		message = "User account is inactive"
	case errors.Is(err, ErrUserNotFound):
		message = "User not found"
	}
	
	response := ErrorResponse{
		Success: false,
		Error:   message,
		Code:    statusCode,
	}
	
	// In a real application, use a proper JSON encoder
	fmt.Fprintf(w, `{"success":false,"error":"%s","code":%d}`, response.Error, response.Code)
}
```

## core/auth/auth_test.go

```go
package auth

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// MockUserRepository for testing
type MockUserRepository struct {
	users map[int]*User
}

func NewMockUserRepository() *MockUserRepository {
	return &MockUserRepository{
		users: map[int]*User{
			1: {ID: 1, Username: "testuser", Email: "test@example.com", IsActive: true},
			2: {ID: 2, Username: "inactive", Email: "inactive@example.com", IsActive: false},
		},
	}
}

func (m *MockUserRepository) GetUserByID(ctx context.Context, id int) (*User, error) {
	user, exists := m.users[id]
	if !exists {
		return nil, ErrUserNotFound