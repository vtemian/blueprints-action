I'll create a comprehensive authentication and authorization module for Go. Here's the complete implementation:

## File Structure
```
core/auth/
├── types.go
├── config.go
├── jwt.go
├── password.go
├── middleware.go
└── auth_test.go
```

## types.go
```go
package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// User represents the user model for authentication
type User struct {
	ID             int    `json:"id"`
	Email          string `json:"email"`
	HashedPassword string `json:"-"` // Never serialize password
	IsActive       bool   `json:"is_active"`
}

// Claims represents JWT claims structure
type Claims struct {
	UserID   int    `json:"user_id"`
	Email    string `json:"email"`
	IsActive bool   `json:"is_active"`
	jwt.RegisteredClaims
}

// AuthError represents authentication-related errors
type AuthError struct {
	Code    string
	Message string
	Err     error
}

func (e *AuthError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *AuthError) Unwrap() error {
	return e.Err
}

// Predefined authentication errors
var (
	ErrInvalidToken     = &AuthError{Code: "INVALID_TOKEN", Message: "invalid or malformed token"}
	ErrExpiredToken     = &AuthError{Code: "EXPIRED_TOKEN", Message: "token has expired"}
	ErrInvalidPassword  = &AuthError{Code: "INVALID_PASSWORD", Message: "invalid password"}
	ErrUserNotFound     = &AuthError{Code: "USER_NOT_FOUND", Message: "user not found"}
	ErrUserInactive     = &AuthError{Code: "USER_INACTIVE", Message: "user account is inactive"}
	ErrMissingToken     = &AuthError{Code: "MISSING_TOKEN", Message: "authorization token required"}
	ErrInvalidSecretKey = &AuthError{Code: "INVALID_SECRET_KEY", Message: "JWT secret key not configured"}
)

// UserRepository defines the interface for user data access
type UserRepository interface {
	GetUserByID(id int) (*User, error)
	GetUserByEmail(email string) (*User, error)
}
```

## config.go
```go
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"sync"
	"time"
)

// Config holds authentication configuration
type Config struct {
	JWTSecretKey       []byte
	AccessTokenExpiry  time.Duration
	BCryptCost         int
	UserRepository     UserRepository
	DebugMode          bool
}

var (
	defaultConfig *Config
	configOnce    sync.Once
	configMutex   sync.RWMutex
)

// DefaultConfig returns the default configuration instance
func DefaultConfig() *Config {
	configOnce.Do(func() {
		defaultConfig = &Config{
			JWTSecretKey:      getJWTSecretKey(),
			AccessTokenExpiry: 24 * time.Hour,
			BCryptCost:        12,
			DebugMode:         os.Getenv("DEBUG") == "true",
		}
	})
	return defaultConfig
}

// SetConfig sets a custom configuration
func SetConfig(config *Config) {
	configMutex.Lock()
	defer configMutex.Unlock()
	defaultConfig = config
}

// GetConfig returns the current configuration
func GetConfig() *Config {
	configMutex.RLock()
	defer configMutex.RUnlock()
	if defaultConfig == nil {
		return DefaultConfig()
	}
	return defaultConfig
}

// getJWTSecretKey retrieves JWT secret key from environment or generates one
func getJWTSecretKey() []byte {
	secretKey := os.Getenv("JWT_SECRET_KEY")
	if secretKey == "" {
		// Generate a random secret key for development (not recommended for production)
		if os.Getenv("GO_ENV") == "production" {
			panic("JWT_SECRET_KEY environment variable is required in production")
		}
		
		// Generate 32 random bytes for development
		randomBytes := make([]byte, 32)
		if _, err := rand.Read(randomBytes); err != nil {
			panic("failed to generate random JWT secret key: " + err.Error())
		}
		secretKey = hex.EncodeToString(randomBytes)
	}
	
	if len(secretKey) < 32 {
		panic("JWT_SECRET_KEY must be at least 32 characters long")
	}
	
	return []byte(secretKey)
}

// SetUserRepository sets the user repository for the default config
func SetUserRepository(repo UserRepository) {
	config := GetConfig()
	configMutex.Lock()
	config.UserRepository = repo
	configMutex.Unlock()
}
```

## jwt.go
```go
package auth

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// CreateAccessToken generates a new JWT access token with the provided data
func CreateAccessToken(data map[string]interface{}) (string, error) {
	config := GetConfig()
	
	if len(config.JWTSecretKey) == 0 {
		return "", ErrInvalidSecretKey
	}

	now := time.Now()
	expirationTime := now.Add(config.AccessTokenExpiry)

	// Extract user information from data
	userID, ok := data["user_id"]
	if !ok {
		return "", &AuthError{
			Code:    "MISSING_USER_ID",
			Message: "user_id is required in token data",
		}
	}

	email, ok := data["email"]
	if !ok {
		return "", &AuthError{
			Code:    "MISSING_EMAIL",
			Message: "email is required in token data",
		}
	}

	isActive, ok := data["is_active"]
	if !ok {
		isActive = true // Default to active if not specified
	}

	// Convert userID to int if it's not already
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
			return "", &AuthError{
				Code:    "INVALID_USER_ID",
				Message: "user_id must be a valid integer",
				Err:     err,
			}
		}
	default:
		return "", &AuthError{
			Code:    "INVALID_USER_ID",
			Message: "user_id must be an integer",
		}
	}

	claims := &Claims{
		UserID:   userIDInt,
		Email:    fmt.Sprintf("%v", email),
		IsActive: fmt.Sprintf("%v", isActive) == "true",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Subject:   fmt.Sprintf("%d", userIDInt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(config.JWTSecretKey)
	if err != nil {
		return "", &AuthError{
			Code:    "TOKEN_GENERATION_FAILED",
			Message: "failed to generate access token",
			Err:     err,
		}
	}

	return tokenString, nil
}

// VerifyToken validates a JWT token and returns its claims
func VerifyToken(tokenString string) (*jwt.MapClaims, error) {
	config := GetConfig()
	
	if len(config.JWTSecretKey) == 0 {
		return nil, ErrInvalidSecretKey
	}

	if strings.TrimSpace(tokenString) == "" {
		return nil, ErrMissingToken
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate the signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, &AuthError{
				Code:    "INVALID_SIGNING_METHOD",
				Message: fmt.Sprintf("unexpected signing method: %v", token.Header["alg"]),
			}
		}
		return config.JWTSecretKey, nil
	})

	if err != nil {
		// Check for specific JWT errors
		if errors, ok := err.(*jwt.ValidationError); ok {
			if errors.Errors&jwt.ValidationErrorExpired != 0 {
				return nil, ErrExpiredToken
			}
			if errors.Errors&(jwt.ValidationErrorMalformed|jwt.ValidationErrorSignatureInvalid) != 0 {
				return nil, ErrInvalidToken
			}
		}
		return nil, &AuthError{
			Code:    "TOKEN_VALIDATION_FAILED",
			Message: "token validation failed",
			Err:     err,
		}
	}

	if !token.Valid {
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, &AuthError{
			Code:    "INVALID_CLAIMS",
			Message: "invalid token claims format",
		}
	}

	// Validate required claims
	if exp, ok := claims["exp"]; ok {
		if expTime, ok := exp.(float64); ok {
			if time.Now().Unix() > int64(expTime) {
				return nil, ErrExpiredToken
			}
		}
	}

	return &claims, nil
}

// ExtractBearerToken extracts the token from Authorization header
func ExtractBearerToken(authHeader string) (string, error) {
	if authHeader == "" {
		return "", ErrMissingToken
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return "", &AuthError{
			Code:    "INVALID_AUTH_HEADER",
			Message: "authorization header must be in format 'Bearer <token>'",
		}
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", ErrMissingToken
	}

	return token, nil
}

// GetCurrentUser retrieves user information from a JWT token
func GetCurrentUser(tokenString string) (*User, error) {
	config := GetConfig()
	
	if config.UserRepository == nil {
		return nil, &AuthError{
			Code:    "NO_USER_REPOSITORY",
			Message: "user repository not configured",
		}
	}

	claims, err := VerifyToken(tokenString)
	if err != nil {
		return nil, err
	}

	// Extract user ID from claims
	userIDFloat, ok := (*claims)["user_id"].(float64)
	if !ok {
		return nil, &AuthError{
			Code:    "INVALID_USER_ID_CLAIM",
			Message: "invalid user_id in token claims",
		}
	}

	userID := int(userIDFloat)
	user, err := config.UserRepository.GetUserByID(userID)
	if err != nil {
		return nil, &AuthError{
			Code:    "USER_LOOKUP_FAILED",
			Message: "failed to retrieve user information",
			Err:     err,
		}
	}

	if user == nil {
		return nil, ErrUserNotFound
	}

	if !user.IsActive {
		return nil, ErrUserInactive
	}

	return user, nil
}
```

## password.go
```go
package auth

import (
	"crypto/subtle"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// GetPasswordHash generates a bcrypt hash for the given password
func GetPasswordHash(password string) (string, error) {
	config := GetConfig()
	
	if len(password) == 0 {
		return "", &AuthError{
			Code:    "EMPTY_PASSWORD",
			Message: "password cannot be empty",
		}
	}

	if len(password) < 8 {
		return "", &AuthError{
			Code:    "PASSWORD_TOO_SHORT",
			Message: "password must be at least 8 characters long",
		}
	}

	if len(password) > 72 {
		return "", &AuthError{
			Code:    "PASSWORD_TOO_LONG",
			Message: "password must be no more than 72 characters long",
		}
	}

	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), config.BCryptCost)
	if err != nil {
		return "", &AuthError{
			Code:    "HASH_GENERATION_FAILED",
			Message: "failed to generate password hash",
			Err:     err,
		}
	}

	return string(hashedBytes), nil
}

// VerifyPassword verifies a plain password against its bcrypt hash
// Uses constant-time comparison to prevent timing attacks
func VerifyPassword(plainPassword, hashedPassword string) bool {
	// Perform the bcrypt comparison
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	
	// Add a small constant delay to help prevent timing attacks
	// This ensures that both successful and failed attempts take similar time
	time.Sleep(time.Millisecond * 1)
	
	return err == nil
}

// VerifyPasswordSecure provides additional security measures for password verification
func VerifyPasswordSecure(plainPassword, hashedPassword string) error {
	if len(plainPassword) == 0 {
		return &AuthError{
			Code:    "EMPTY_PASSWORD",
			Message: "password cannot be empty",
		}
	}

	if len(hashedPassword) == 0 {
		return &AuthError{
			Code:    "EMPTY_HASH",
			Message: "password hash cannot be empty",
		}
	}

	// Perform bcrypt comparison
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	if err != nil {
		// Add constant time delay regardless of error type
		time.Sleep(time.Millisecond * 1)
		
		if err == bcrypt.ErrMismatchedHashAndPassword {
			return ErrInvalidPassword
		}
		
		return &AuthError{
			Code:    "PASSWORD_VERIFICATION_FAILED",
			Message: "password verification failed",
			Err:     err,
		}
	}

	return nil
}

// ComparePasswords performs constant-time comparison of two password strings
// Useful for comparing tokens or other sensitive strings
func ComparePasswords(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// ValidatePasswordStrength validates password strength requirements
func ValidatePasswordStrength(password string) error {
	if len(password) < 8 {
		return &AuthError{
			Code:    "PASSWORD_TOO_SHORT",
			Message: "password must be at least 8 characters long",
		}
	}

	if len(password) > 128