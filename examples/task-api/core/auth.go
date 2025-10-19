// Package auth provides authentication and authorization utilities including
// JWT token management, password hashing, and user authentication middleware.
package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Constants for authentication configuration
const (
	// TokenExpirationHours defines the JWT token expiration time in hours
	TokenExpirationHours = 24
	// BcryptCost defines the cost factor for bcrypt password hashing
	BcryptCost = 12
	// DefaultJWTSecret is used as fallback if JWT_SECRET_KEY is not set
	DefaultJWTSecret = "your-secret-key-change-in-production"
	// AuthorizationHeader is the HTTP header name for authorization
	AuthorizationHeader = "Authorization"
	// BearerPrefix is the expected prefix for bearer tokens
	BearerPrefix = "Bearer "
)

// Custom error types for authentication failures
var (
	// ErrInvalidToken indicates that the provided token is invalid
	ErrInvalidToken = errors.New("invalid token")
	// ErrTokenExpired indicates that the token has expired
	ErrTokenExpired = errors.New("token has expired")
	// ErrInvalidCredentials indicates invalid login credentials
	ErrInvalidCredentials = errors.New("invalid credentials")
	// ErrUserNotFound indicates that the user was not found
	ErrUserNotFound = errors.New("user not found")
	// ErrInvalidPassword indicates password validation failed
	ErrInvalidPassword = errors.New("invalid password")
	// ErrMissingToken indicates no token was provided
	ErrMissingToken = errors.New("missing authentication token")
	// ErrInvalidTokenFormat indicates malformed token
	ErrInvalidTokenFormat = errors.New("invalid token format")
)

// User represents a user in the system with authentication details
type User struct {
	ID             int       `json:"id" db:"id"`
	Username       string    `json:"username" db:"username"`
	Email          string    `json:"email" db:"email"`
	HashedPassword string    `json:"-" db:"hashed_password"` // Never serialize password
	IsActive       bool      `json:"is_active" db:"is_active"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

// AuthClaims represents the JWT claims structure
type AuthClaims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

// AuthError represents authentication-related errors with additional context
type AuthError struct {
	Code    string
	Message string
	Err     error
}

// Error implements the error interface for AuthError
func (e *AuthError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

// Unwrap returns the underlying error for error unwrapping
func (e *AuthError) Unwrap() error {
	return e.Err
}

// getJWTSecret retrieves the JWT secret from environment variables with fallback
func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET_KEY")
	if secret == "" {
		return DefaultJWTSecret
	}
	return secret
}

// CreateAccessToken generates a JWT token with the provided data and 24-hour expiration
func CreateAccessToken(data map[string]interface{}) (string, error) {
	if data == nil {
		return "", &AuthError{
			Code:    "INVALID_DATA",
			Message: "token data cannot be nil",
		}
	}

	// Extract user information from data
	userID, ok := data["user_id"]
	if !ok {
		return "", &AuthError{
			Code:    "MISSING_USER_ID",
			Message: "user_id is required in token data",
		}
	}

	username, _ := data["username"].(string)
	email, _ := data["email"].(string)

	// Convert user_id to int if it's not already
	var uid int
	switch v := userID.(type) {
	case int:
		uid = v
	case float64:
		uid = int(v)
	case string:
		var err error
		uid, err = strconv.Atoi(v)
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

	// Create token claims
	now := time.Now()
	claims := AuthClaims{
		UserID:   uid,
		Username: username,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(TokenExpirationHours * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "auth-service",
		},
	}

	// Create token with claims
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign token with secret
	tokenString, err := token.SignedString([]byte(getJWTSecret()))
	if err != nil {
		return "", &AuthError{
			Code:    "TOKEN_SIGNING_FAILED",
			Message: "failed to sign JWT token",
			Err:     err,
		}
	}

	return tokenString, nil
}

// VerifyToken decodes and validates a JWT token, returning the claims
func VerifyToken(tokenString string) (*jwt.MapClaims, error) {
	if tokenString == "" {
		return nil, &AuthError{
			Code:    "EMPTY_TOKEN",
			Message: "token string cannot be empty",
		}
	}

	// Parse token with claims
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, &AuthError{
				Code:    "INVALID_SIGNING_METHOD",
				Message: fmt.Sprintf("unexpected signing method: %v", token.Header["alg"]),
			}
		}
		return []byte(getJWTSecret()), nil
	})

	if err != nil {
		// Check for specific JWT errors
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, &AuthError{
				Code:    "TOKEN_EXPIRED",
				Message: "token has expired",
				Err:     ErrTokenExpired,
			}
		}
		return nil, &AuthError{
			Code:    "TOKEN_PARSE_ERROR",
			Message: "failed to parse token",
			Err:     err,
		}
	}

	// Validate token and extract claims
	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return &claims, nil
	}

	return nil, &AuthError{
		Code:    "INVALID_TOKEN_CLAIMS",
		Message: "invalid token claims",
		Err:     ErrInvalidToken,
	}
}

// GetPasswordHash generates a bcrypt hash of the provided password
func GetPasswordHash(password string) (string, error) {
	if password == "" {
		return "", &AuthError{
			Code:    "EMPTY_PASSWORD",
			Message: "password cannot be empty",
		}
	}

	if len(password) < 6 {
		return "", &AuthError{
			Code:    "PASSWORD_TOO_SHORT",
			Message: "password must be at least 6 characters long",
		}
	}

	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return "", &AuthError{
			Code:    "HASH_GENERATION_FAILED",
			Message: "failed to generate password hash",
			Err:     err,
		}
	}

	return string(hashedBytes), nil
}

// VerifyPassword verifies a plain password against a bcrypt hash
func VerifyPassword(plainPassword, hashedPassword string) error {
	if plainPassword == "" {
		return &AuthError{
			Code:    "EMPTY_PASSWORD",
			Message: "password cannot be empty",
		}
	}

	if hashedPassword == "" {
		return &AuthError{
			Code:    "EMPTY_HASH",
			Message: "hashed password cannot be empty",
		}
	}

	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	if err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return &AuthError{
				Code:    "PASSWORD_MISMATCH",
				Message: "password does not match",
				Err:     ErrInvalidPassword,
			}
		}
		return &AuthError{
			Code:    "PASSWORD_VERIFICATION_FAILED",
			Message: "failed to verify password",
			Err:     err,
		}
	}

	return nil
}

// GetCurrentUser extracts user information from a JWT token
func GetCurrentUser(tokenString string) (*User, error) {
	claims, err := VerifyToken(tokenString)
	if err != nil {
		return nil, fmt.Errorf("failed to verify token: %w", err)
	}

	// Extract user information from claims
	userIDFloat, ok := (*claims)["user_id"].(float64)
	if !ok {
		return nil, &AuthError{
			Code:    "INVALID_USER_ID_CLAIM",
			Message: "invalid user_id in token claims",
		}
	}

	username, _ := (*claims)["username"].(string)
	email, _ := (*claims)["email"].(string)

	user := &User{
		ID:       int(userIDFloat),
		Username: username,
		Email:    email,
		IsActive: true, // Assume active if token is valid
	}

	return user, nil
}

// AuthMiddleware provides HTTP middleware for JWT token authentication
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get(AuthorizationHeader)
		if authHeader == "" {
			http.Error(w, "Missing authorization header", http.StatusUnauthorized)
			return
		}

		// Check for Bearer prefix
		if !strings.HasPrefix(authHeader, BearerPrefix) {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}

		// Extract token
		tokenString := strings.TrimPrefix(authHeader, BearerPrefix)
		if tokenString == "" {
			http.Error(w, "Missing token", http.StatusUnauthorized)
			return
		}

		// Verify token
		claims, err := VerifyToken(tokenString)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		// Add claims to request context
		ctx := context.WithValue(r.Context(), "claims", claims)
		ctx = context.WithValue(ctx, "token", tokenString)

		// Extract user and add to context
		user, err := GetCurrentUser(tokenString)
		if err == nil {
			ctx = context.WithValue(ctx, "user", user)
		}

		// Continue with the request
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAuthMiddleware is a stricter version that requires valid user extraction
func RequireAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get(AuthorizationHeader)
		if authHeader == "" {
			http.Error(w, "Missing authorization header", http.StatusUnauthorized)
			return
		}

		// Check for Bearer prefix
		if !strings.HasPrefix(authHeader, BearerPrefix) {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}

		// Extract token
		tokenString := strings.TrimPrefix(authHeader, BearerPrefix)
		if tokenString == "" {
			http.Error(w, "Missing token", http.StatusUnauthorized)
			return
		}

		// Get current user (this also verifies the token)
		user, err := GetCurrentUser(tokenString)
		if err != nil {
			http.Error(w, "Invalid token or user", http.StatusUnauthorized)
			return
		}

		// Check if user is active
		if !user.IsActive {
			http.Error(w, "User account is inactive", http.StatusForbidden)
			return
		}

		// Add user to request context
		ctx := context.WithValue(r.Context(), "user", user)
		ctx = context.WithValue(ctx, "token", tokenString)

		// Continue with the request
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserFromContext extracts the user from the request context
func GetUserFromContext(ctx context.Context) (*User, bool) {
	user, ok := ctx.Value("user").(*User)
	return user, ok
}

// GetTokenFromContext extracts the token from the request context
func GetTokenFromContext(ctx context.Context) (string, bool) {
	token, ok := ctx.Value("token").(string)
	return token, ok
}

// GetClaimsFromContext extracts the JWT claims from the request context
func GetClaimsFromContext(ctx context.Context) (*jwt.MapClaims, bool) {
	claims, ok := ctx.Value("claims").(*jwt.MapClaims)
	return claims, ok
}

// ValidateTokenWithContext validates a token with context for timeout control
func ValidateTokenWithContext(ctx context.Context, tokenString string) (*jwt.MapClaims, error) {
	// Create a channel to receive the result
	resultChan := make(chan struct {
		claims *jwt.MapClaims
		err    error
	}, 1)

	// Perform token validation in a goroutine
	go func() {
		claims, err := VerifyToken(tokenString)
		resultChan <- struct {
			claims *jwt.MapClaims
			err    error
		}{claims, err}
	}()

	// Wait for result or context cancellation
	select {
	case result := <-resultChan:
		return result.claims, result.err
	case <-ctx.Done():
		return nil, &AuthError{
			Code:    "CONTEXT_CANCELLED",
			Message: "token validation cancelled",
			Err:     ctx.Err(),
		}
	}
}

// RefreshTokenIfNeeded checks if a token is close to expiry and returns a new one if needed
func RefreshTokenIfNeeded(tokenString string, refreshThresholdHours int) (string, bool, error) {
	claims, err := VerifyToken(tokenString)
	if err != nil {
		return "", false, fmt.Errorf("