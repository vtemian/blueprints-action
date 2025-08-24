// Package auth provides authentication and authorization utilities
// including JWT token management, password hashing, and HTTP middleware.
package auth

import (
	"context"
	"encoding/json"
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
	TokenExpirationHours = 24
	BcryptCost          = 12
	MinSecretKeyLength  = 32
	BearerPrefix        = "Bearer "
)

// Package-level error variables
var (
	ErrInvalidToken      = errors.New("invalid token")
	ErrExpiredToken      = errors.New("token has expired")
	ErrMissingToken      = errors.New("missing authorization token")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserNotActive     = errors.New("user account is not active")
	ErrInvalidSecretKey  = errors.New("invalid JWT secret key")
	ErrPasswordHashFailed = errors.New("failed to hash password")
	ErrInvalidUserData   = errors.New("invalid user data in token")
)

// User represents a user in the system
type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	IsActive bool   `json:"is_active"`
	Role     string `json:"role,omitempty"`
}

// Claims represents JWT claims structure
type Claims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	IsActive bool   `json:"is_active"`
	Role     string `json:"role,omitempty"`
	jwt.RegisteredClaims
}

// ErrorResponse represents a standardized error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	Code    int    `json:"code"`
}

// contextKey is used for context values to avoid collisions
type contextKey string

const (
	UserContextKey  contextKey = "user"
	TokenContextKey contextKey = "token"
)

// getJWTSecret retrieves and validates the JWT secret from environment
func getJWTSecret() ([]byte, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return nil, fmt.Errorf("%w: JWT_SECRET environment variable not set", ErrInvalidSecretKey)
	}
	if len(secret) < MinSecretKeyLength {
		return nil, fmt.Errorf("%w: secret key must be at least %d characters", ErrInvalidSecretKey, MinSecretKeyLength)
	}
	return []byte(secret), nil
}

// CreateAccessToken generates a JWT token with the provided user data
func CreateAccessToken(data map[string]interface{}) (string, error) {
	secret, err := getJWTSecret()
	if err != nil {
		return "", fmt.Errorf("failed to get JWT secret: %w", err)
	}

	now := time.Now()
	expirationTime := now.Add(TokenExpirationHours * time.Hour)

	// Extract user data from the map
	userID, ok := data["user_id"]
	if !ok {
		return "", fmt.Errorf("%w: missing user_id", ErrInvalidUserData)
	}

	// Convert userID to int if it's not already
	var userIDInt int
	switch v := userID.(type) {
	case int:
		userIDInt = v
	case float64:
		userIDInt = int(v)
	case string:
		userIDInt, err = strconv.Atoi(v)
		if err != nil {
			return "", fmt.Errorf("%w: invalid user_id format", ErrInvalidUserData)
		}
	default:
		return "", fmt.Errorf("%w: user_id must be a number", ErrInvalidUserData)
	}

	username, _ := data["username"].(string)
	email, _ := data["email"].(string)
	isActive, _ := data["is_active"].(bool)
	role, _ := data["role"].(string)

	claims := &Claims{
		UserID:   userIDInt,
		Username: username,
		Email:    email,
		IsActive: isActive,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.Itoa(userIDInt),
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(secret)
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, nil
}

// VerifyToken decodes and validates a JWT token
func VerifyToken(tokenString string) (*jwt.Token, error) {
	secret, err := getJWTSecret()
	if err != nil {
		return nil, fmt.Errorf("failed to get JWT secret: %w", err)
	}

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify the signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secret, nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, fmt.Errorf("%w: %v", ErrExpiredToken, err)
		}
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}

	if !token.Valid {
		return nil, ErrInvalidToken
	}

	return token, nil
}

// GetPasswordHash generates a bcrypt hash for the given password
func GetPasswordHash(password string) (string, error) {
	if password == "" {
		return "", fmt.Errorf("%w: password cannot be empty", ErrInvalidCredentials)
	}

	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrPasswordHashFailed, err)
	}

	return string(hashedBytes), nil
}

// VerifyPassword compares a plain password with its bcrypt hash
func VerifyPassword(plainPassword, hashedPassword string) bool {
	if plainPassword == "" || hashedPassword == "" {
		return false
	}

	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	return err == nil
}

// GetCurrentUser extracts user information from a valid JWT token
func GetCurrentUser(tokenString string) (*User, error) {
	token, err := VerifyToken(tokenString)
	if err != nil {
		return nil, fmt.Errorf("token verification failed: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		return nil, fmt.Errorf("%w: failed to parse token claims", ErrInvalidToken)
	}

	user := &User{
		ID:       claims.UserID,
		Username: claims.Username,
		Email:    claims.Email,
		IsActive: claims.IsActive,
		Role:     claims.Role,
	}

	return user, nil
}

// extractTokenFromHeader extracts the Bearer token from the Authorization header
func extractTokenFromHeader(authHeader string) (string, error) {
	if authHeader == "" {
		return "", ErrMissingToken
	}

	if !strings.HasPrefix(authHeader, BearerPrefix) {
		return "", fmt.Errorf("%w: authorization header must start with 'Bearer '", ErrInvalidToken)
	}

	token := strings.TrimPrefix(authHeader, BearerPrefix)
	if token == "" {
		return "", fmt.Errorf("%w: token is empty", ErrInvalidToken)
	}

	return token, nil
}

// writeErrorResponse writes a standardized JSON error response
func writeErrorResponse(w http.ResponseWriter, err error, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	response := ErrorResponse{
		Error:   http.StatusText(statusCode),
		Message: err.Error(),
		Code:    statusCode,
	}

	json.NewEncoder(w).Encode(response)
}

// AuthMiddleware is HTTP middleware for JWT token validation
func AuthMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			
			tokenString, err := extractTokenFromHeader(authHeader)
			if err != nil {
				writeErrorResponse(w, err, http.StatusUnauthorized)
				return
			}

			token, err := VerifyToken(tokenString)
			if err != nil {
				statusCode := http.StatusUnauthorized
				if errors.Is(err, ErrExpiredToken) {
					statusCode = http.StatusUnauthorized
				}
				writeErrorResponse(w, err, statusCode)
				return
			}

			claims, ok := token.Claims.(*Claims)
			if !ok {
				writeErrorResponse(w, ErrInvalidToken, http.StatusUnauthorized)
				return
			}

			user := &User{
				ID:       claims.UserID,
				Username: claims.Username,
				Email:    claims.Email,
				IsActive: claims.IsActive,
				Role:     claims.Role,
			}

			// Add user and token to request context
			ctx := context.WithValue(r.Context(), UserContextKey, user)
			ctx = context.WithValue(ctx, TokenContextKey, tokenString)
			
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireActiveUser is middleware to ensure the user account is active
func RequireActiveUser() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := r.Context().Value(UserContextKey).(*User)
			if !ok {
				writeErrorResponse(w, ErrInvalidToken, http.StatusUnauthorized)
				return
			}

			if !user.IsActive {
				writeErrorResponse(w, ErrUserNotActive, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// GetUserFromContext retrieves the user from the request context
func GetUserFromContext(ctx context.Context) (*User, bool) {
	user, ok := ctx.Value(UserContextKey).(*User)
	return user, ok
}

// GetTokenFromContext retrieves the token string from the request context
func GetTokenFromContext(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(TokenContextKey).(string)
	return token, ok
}

// RequireRole returns middleware that checks if the user has the required role
func RequireRole(requiredRole string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := r.Context().Value(UserContextKey).(*User)
			if !ok {
				writeErrorResponse(w, ErrInvalidToken, http.StatusUnauthorized)
				return
			}

			if user.Role != requiredRole {
				writeErrorResponse(w, 
					fmt.Errorf("insufficient permissions: required role '%s'", requiredRole), 
					http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// ValidateJWTSecret validates that the JWT secret is properly configured
func ValidateJWTSecret() error {
	_, err := getJWTSecret()
	return err
}