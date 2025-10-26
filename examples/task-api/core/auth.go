I'll create a complete, production-ready authentication and authorization module for Go. Here's the implementation:

## Directory Structure
```
core/auth/
├── auth.go
├── errors.go
├── middleware.go
├── types.go
└── utils.go
```

## core/auth/types.go
```go
package auth

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// User represents a user in the system
type User struct {
	ID       string    `json:"id" validate:"required"`
	Email    string    `json:"email" validate:"required,email"`
	Username string    `json:"username" validate:"required,min=3,max=50"`
	Role     string    `json:"role" validate:"required"`
	IsActive bool      `json:"is_active"`
	CreateAt time.Time `json:"created_at"`
}

// Claims represents JWT claims structure
type Claims struct {
	User User `json:"user"`
	jwt.RegisteredClaims
}

// TokenPair represents access and refresh token pair
type TokenPair struct {
	AccessToken  string    `json:"access_token"`
	TokenType    string    `json:"token_type"`
	ExpiresIn    int64     `json:"expires_in"`
	ExpiresAt    time.Time `json:"expires_at"`
	IssuedAt     time.Time `json:"issued_at"`
}

// AuthConfig holds authentication configuration
type AuthConfig struct {
	JWTSecret     string
	TokenDuration time.Duration
	BcryptCost    int
}

// SecurityEvent represents a security-related event for logging
type SecurityEvent struct {
	Type      string    `json:"type"`
	UserID    string    `json:"user_id,omitempty"`
	IP        string    `json:"ip,omitempty"`
	UserAgent string    `json:"user_agent,omitempty"`
	Timestamp time.Time `json:"timestamp"`
	Details   string    `json:"details,omitempty"`
}
```

## core/auth/errors.go
```go
package auth

import (
	"errors"
	"fmt"
)

// Custom error types for authentication
var (
	ErrInvalidToken     = errors.New("invalid token")
	ErrExpiredToken     = errors.New("token has expired")
	ErrMalformedToken   = errors.New("malformed token")
	ErrInvalidSignature = errors.New("invalid token signature")
	ErrMissingToken     = errors.New("missing authorization token")
	ErrInvalidPassword  = errors.New("invalid password")
	ErrUserNotFound     = errors.New("user not found")
	ErrUnauthorized     = errors.New("unauthorized access")
	ErrInvalidInput     = errors.New("invalid input")
	ErrConfigMissing    = errors.New("authentication configuration missing")
)

// AuthError represents an authentication error with additional context
type AuthError struct {
	Type    string
	Message string
	Err     error
}

func (e *AuthError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("auth error [%s]: %s - %v", e.Type, e.Message, e.Err)
	}
	return fmt.Sprintf("auth error [%s]: %s", e.Type, e.Message)
}

func (e *AuthError) Unwrap() error {
	return e.Err
}

// TokenError represents token-specific errors
type TokenError struct {
	Type    string
	Message string
	Err     error
}

func (e *TokenError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("token error [%s]: %s - %v", e.Type, e.Message, e.Err)
	}
	return fmt.Sprintf("token error [%s]: %s", e.Type, e.Message)
}

func (e *TokenError) Unwrap() error {
	return e.Err
}

// NewAuthError creates a new AuthError
func NewAuthError(errorType, message string, err error) *AuthError {
	return &AuthError{
		Type:    errorType,
		Message: message,
		Err:     err,
	}
}

// NewTokenError creates a new TokenError
func NewTokenError(errorType, message string, err error) *TokenError {
	return &TokenError{
		Type:    errorType,
		Message: message,
		Err:     err,
	}
}
```

## core/auth/utils.go
```go
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
	"time"
)

// ValidateEmail validates email format
func ValidateEmail(email string) bool {
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	return emailRegex.MatchString(email)
}

// ValidateUsername validates username format
func ValidateUsername(username string) bool {
	if len(username) < 3 || len(username) > 50 {
		return false
	}
	usernameRegex := regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	return usernameRegex.MatchString(username)
}

// ValidatePassword validates password strength
func ValidatePassword(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters long")
	}
	if len(password) > 128 {
		return fmt.Errorf("password must be less than 128 characters long")
	}
	
	hasUpper := regexp.MustCompile(`[A-Z]`).MatchString(password)
	hasLower := regexp.MustCompile(`[a-z]`).MatchString(password)
	hasNumber := regexp.MustCompile(`[0-9]`).MatchString(password)
	hasSpecial := regexp.MustCompile(`[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]`).MatchString(password)
	
	if !hasUpper || !hasLower || !hasNumber || !hasSpecial {
		return fmt.Errorf("password must contain at least one uppercase letter, one lowercase letter, one number, and one special character")
	}
	
	return nil
}

// SecureCompare performs constant-time comparison of two strings
func SecureCompare(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// GenerateSecureToken generates a cryptographically secure random token
func GenerateSecureToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate secure token: %w", err)
	}
	return base64.URLEncoding.EncodeToString(bytes), nil
}

// SanitizeInput removes potentially dangerous characters from input
func SanitizeInput(input string) string {
	// Remove null bytes and control characters
	input = strings.ReplaceAll(input, "\x00", "")
	input = regexp.MustCompile(`[\x00-\x1f\x7f]`).ReplaceAllString(input, "")
	return strings.TrimSpace(input)
}

// LogSecurityEvent logs security-related events
func LogSecurityEvent(event SecurityEvent) {
	log.Printf("SECURITY_EVENT: Type=%s, UserID=%s, IP=%s, Timestamp=%s, Details=%s",
		event.Type, event.UserID, event.IP, event.Timestamp.Format(time.RFC3339), event.Details)
}

// GetEnvWithDefault gets environment variable with default value
func GetEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// ExtractBearerToken extracts bearer token from Authorization header
func ExtractBearerToken(authHeader string) (string, error) {
	if authHeader == "" {
		return "", ErrMissingToken
	}
	
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return "", NewTokenError("invalid_format", "authorization header must be in format 'Bearer <token>'", nil)
	}
	
	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", ErrMissingToken
	}
	
	return token, nil
}
```

## core/auth/auth.go
```go
package auth

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	DefaultTokenDuration = 24 * time.Hour
	DefaultBcryptCost    = 12
	MinBcryptCost        = 10
	MaxBcryptCost        = 15
)

// AuthService provides authentication and authorization functionality
type AuthService struct {
	config *AuthConfig
}

// NewAuthService creates a new authentication service
func NewAuthService() (*AuthService, error) {
	config, err := loadConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to load auth config: %w", err)
	}
	
	return &AuthService{
		config: config,
	}, nil
}

// loadConfig loads authentication configuration from environment
func loadConfig() (*AuthConfig, error) {
	jwtSecret := os.Getenv("JWT_SECRET_KEY")
	if jwtSecret == "" {
		return nil, NewAuthError("config", "JWT_SECRET_KEY environment variable is required", ErrConfigMissing)
	}
	
	// Validate JWT secret strength
	if len(jwtSecret) < 32 {
		return nil, NewAuthError("config", "JWT_SECRET_KEY must be at least 32 characters long", ErrConfigMissing)
	}
	
	// Parse bcrypt cost from environment or use default
	bcryptCost := DefaultBcryptCost
	if costStr := os.Getenv("BCRYPT_COST"); costStr != "" {
		if cost, err := strconv.Atoi(costStr); err == nil {
			if cost >= MinBcryptCost && cost <= MaxBcryptCost {
				bcryptCost = cost
			}
		}
	}
	
	return &AuthConfig{
		JWTSecret:     jwtSecret,
		TokenDuration: DefaultTokenDuration,
		BcryptCost:    bcryptCost,
	}, nil
}

// CreateAccessToken generates a JWT access token with 24-hour expiration
func (s *AuthService) CreateAccessToken(data map[string]interface{}) (string, error) {
	return s.CreateAccessTokenWithContext(context.Background(), data)
}

// CreateAccessTokenWithContext generates a JWT access token with context
func (s *AuthService) CreateAccessTokenWithContext(ctx context.Context, data map[string]interface{}) (string, error) {
	if data == nil {
		return "", NewTokenError("invalid_input", "token data cannot be nil", ErrInvalidInput)
	}
	
	now := time.Now()
	expirationTime := now.Add(s.config.TokenDuration)
	
	// Create claims
	claims := &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "auth-service",
			Subject:   "access-token",
		},
	}
	
	// Add user data to claims if User is provided
	if userData, ok := data["user"].(User); ok {
		claims.User = userData
	} else {
		// Handle legacy data format
		userID, _ := data["user_id"].(string)
		email, _ := data["email"].(string)
		username, _ := data["username"].(string)
		role, _ := data["role"].(string)
		isActive, _ := data["is_active"].(bool)
		
		claims.User = User{
			ID:       userID,
			Email:    email,
			Username: username,
			Role:     role,
			IsActive: isActive,
			CreateAt: now,
		}
	}
	
	// Validate user data
	if err := s.validateUserClaims(claims.User); err != nil {
		return "", NewTokenError("invalid_user_data", "invalid user data in token claims", err)
	}
	
	// Create token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	
	// Sign token
	tokenString, err := token.SignedString([]byte(s.config.JWTSecret))
	if err != nil {
		LogSecurityEvent(SecurityEvent{
			Type:      "token_creation_failed",
			UserID:    claims.User.ID,
			Timestamp: time.Now(),
			Details:   "Failed to sign JWT token",
		})
		return "", NewTokenError("signing_failed", "failed to sign token", err)
	}
	
	LogSecurityEvent(SecurityEvent{
		Type:      "token_created",
		UserID:    claims.User.ID,
		Timestamp: time.Now(),
		Details:   "Access token created successfully",
	})
	
	return tokenString, nil
}

// VerifyToken validates and parses a JWT token
func (s *AuthService) VerifyToken(tokenString string) (*jwt.Token, map[string]interface{}, error) {
	return s.VerifyTokenWithContext(context.Background(), tokenString)
}

// VerifyTokenWithContext validates and parses a JWT token with context
func (s *AuthService) VerifyTokenWithContext(ctx context.Context, tokenString string) (*jwt.Token, map[string]interface{}, error) {
	if tokenString == "" {
		return nil, nil, NewTokenError("empty_token", "token string is empty", ErrMissingToken)
	}
	
	// Parse token with claims
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, NewTokenError("invalid_signing_method", 
				fmt.Sprintf("unexpected signing method: %v", token.Header["alg"]), ErrInvalidSignature)
		}
		return []byte(s.config.JWTSecret), nil
	})
	
	if err != nil {
		// Handle specific JWT errors
		if ve, ok := err.(*jwt.ValidationError); ok {
			switch {
			case ve.Errors&jwt.ValidationErrorMalformed != 0:
				return nil, nil, NewTokenError("malformed", "token is malformed", ErrMalformedToken)
			case ve.Errors&jwt.ValidationErrorExpired != 0:
				return nil, nil, NewTokenError("expired", "token has expired", ErrExpiredToken)
			case ve.Errors&jwt.ValidationErrorSignatureInvalid != 0:
				LogSecurityEvent(SecurityEvent{
					Type:      "invalid_signature",
					Timestamp: