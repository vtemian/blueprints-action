// Package auth provides production-ready authentication and authorization utilities
// for JWT token management, password security, and HTTP middleware.
package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Package constants
const (
	DefaultTokenExpiration = 24 * time.Hour
	BcryptCost            = 12
	DefaultJWTSecret      = "your-super-secret-jwt-key-change-in-production"
	AuthorizationHeader   = "Authorization"
	BearerPrefix          = "Bearer "
	UserContextKey        = "auth_user"
)

// Custom error types for authentication failures
var (
	ErrInvalidToken        = errors.New("invalid token")
	ErrExpiredToken        = errors.New("token has expired")
	ErrMalformedToken      = errors.New("malformed token")
	ErrMissingToken        = errors.New("missing authorization token")
	ErrInvalidCredentials  = errors.New("invalid credentials")
	ErrPasswordHashFailed  = errors.New("password hashing failed")
	ErrUserNotFound        = errors.New("user not found")
	ErrUserInactive        = errors.New("user account is inactive")
	ErrInvalidAuthHeader   = errors.New("invalid authorization header format")
	ErrMissingSecretKey    = errors.New("JWT secret key not configured")
)

// User represents the user model structure
// TODO: Integrate with your actual user model/database layer
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Username  string    `json:"username"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// Add additional fields as needed
}

// AuthConfig holds configuration for the authentication module
type AuthConfig struct {
	JWTSecret       string
	TokenExpiration time.Duration
	BcryptCost      int
	mu              sync.RWMutex
}

// Global configuration instance
var config *AuthConfig
var configOnce sync.Once

// InitConfig initializes the authentication configuration
func InitConfig() *AuthConfig {
	configOnce.Do(func() {
		config = &AuthConfig{
			JWTSecret:       getJWTSecret(),
			TokenExpiration: DefaultTokenExpiration,
			BcryptCost:      BcryptCost,
		}
	})
	return config
}

// GetConfig returns the current authentication configuration
func GetConfig() *AuthConfig {
	if config == nil {
		return InitConfig()
	}
	return config
}

// getJWTSecret retrieves JWT secret from environment with fallback
func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET_KEY")
	if secret == "" {
		log.Printf("Warning: JWT_SECRET_KEY not set, using default (not recommended for production)")
		return DefaultJWTSecret
	}
	return secret
}

// TokenClaims represents the structure of JWT claims
type TokenClaims struct {
	UserID   string                 `json:"user_id"`
	Email    string                 `json:"email"`
	Username string                 `json:"username"`
	Data     map[string]interface{} `json:"data,omitempty"`
	jwt.RegisteredClaims
}

// CreateAccessToken generates a new JWT access token with the provided data
func CreateAccessToken(data map[string]interface{}) (string, error) {
	cfg := GetConfig()
	
	// Validate required fields
	userID, ok := data["user_id"].(string)
	if !ok || userID == "" {
		return "", fmt.Errorf("user_id is required in token data")
	}

	email, _ := data["email"].(string)
	username, _ := data["username"].(string)

	// Create token claims
	now := time.Now()
	claims := TokenClaims{
		UserID:   userID,
		Email:    email,
		Username: username,
		Data:     data,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(cfg.TokenExpiration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "auth-service",
			Subject:   userID,
			ID:        generateTokenID(),
		},
	}

	// Create and sign token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	
	cfg.mu.RLock()
	secret := cfg.JWTSecret
	cfg.mu.RUnlock()
	
	if secret == "" {
		return "", ErrMissingSecretKey
	}

	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, nil
}

// VerifyToken validates and parses a JWT token string
func VerifyToken(tokenString string) (*jwt.MapClaims, error) {
	if tokenString == "" {
		return nil, ErrMissingToken
	}

	cfg := GetConfig()
	cfg.mu.RLock()
	secret := cfg.JWTSecret
	cfg.mu.RUnlock()

	if secret == "" {
		return nil, ErrMissingSecretKey
	}

	// Parse and validate token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		if errors.Is(err, jwt.ErrTokenMalformed) {
			return nil, ErrMalformedToken
		}
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}

	// Extract claims
	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return &claims, nil
	}

	return nil, ErrInvalidToken
}

// GetPasswordHash generates a bcrypt hash for the given password
func GetPasswordHash(password string) (string, error) {
	if password == "" {
		return "", fmt.Errorf("password cannot be empty")
	}

	cfg := GetConfig()
	cfg.mu.RLock()
	cost := cfg.BcryptCost
	cfg.mu.RUnlock()

	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), cost)
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

// GetCurrentUser retrieves user information from a JWT token
func GetCurrentUser(tokenString string) (*User, error) {
	claims, err := VerifyToken(tokenString)
	if err != nil {
		return nil, err
	}

	// Extract user information from claims
	userID, ok := (*claims)["user_id"].(string)
	if !ok || userID == "" {
		return nil, fmt.Errorf("invalid user_id in token")
	}

	// TODO: Replace with actual database lookup
	user, err := getUserFromDatabase(userID)
	if err != nil {
		return nil, err
	}

	// Verify user is active
	if !user.IsActive {
		return nil, ErrUserInactive
	}

	return user, nil
}

// AuthMiddleware provides JWT token authentication for HTTP handlers
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		token, err := extractTokenFromHeader(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		// Verify token
		claims, err := VerifyToken(token)
		if err != nil {
			status := http.StatusUnauthorized
			if errors.Is(err, ErrExpiredToken) {
				status = http.StatusUnauthorized
			}
			http.Error(w, err.Error(), status)
			return
		}

		// Add claims to request context
		ctx := context.WithValue(r.Context(), "jwt_claims", claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UserAuthMiddleware provides user authentication and adds user to context
func UserAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		token, err := extractTokenFromHeader(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		// Get current user
		user, err := GetCurrentUser(token)
		if err != nil {
			status := http.StatusUnauthorized
			if errors.Is(err, ErrUserInactive) {
				status = http.StatusForbidden
			}
			if errors.Is(err, ErrUserNotFound) {
				status = http.StatusNotFound
			}
			http.Error(w, err.Error(), status)
			return
		}

		// Add user to request context
		ctx := context.WithValue(r.Context(), UserContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireActiveUser middleware ensures the user is active
func RequireActiveUser(next http.Handler) http.Handler {
	return UserAuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := GetUserFromContext(r.Context())
		if user == nil {
			http.Error(w, "User not found in context", http.StatusInternalServerError)
			return
		}

		if !user.IsActive {
			http.Error(w, ErrUserInactive.Error(), http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	}))
}

// GetUserFromContext retrieves the user from the request context
func GetUserFromContext(ctx context.Context) *User {
	if user, ok := ctx.Value(UserContextKey).(*User); ok {
		return user
	}
	return nil
}

// GetClaimsFromContext retrieves JWT claims from the request context
func GetClaimsFromContext(ctx context.Context) *jwt.MapClaims {
	if claims, ok := ctx.Value("jwt_claims").(*jwt.MapClaims); ok {
		return claims
	}
	return nil
}

// Helper Functions

// extractTokenFromHeader extracts the JWT token from the Authorization header
func extractTokenFromHeader(r *http.Request) (string, error) {
	authHeader := r.Header.Get(AuthorizationHeader)
	if authHeader == "" {
		return "", ErrMissingToken
	}

	// Check for Bearer prefix
	if !strings.HasPrefix(authHeader, BearerPrefix) {
		return "", ErrInvalidAuthHeader
	}

	// Extract token
	token := strings.TrimPrefix(authHeader, BearerPrefix)
	token = strings.TrimSpace(token)
	
	if token == "" {
		return "", ErrMissingToken
	}

	return token, nil
}

// generateTokenID creates a unique identifier for JWT tokens
func generateTokenID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to timestamp-based ID
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(bytes)
}

// getUserFromDatabase is a placeholder for actual database user lookup
// TODO: Replace with your actual database implementation
func getUserFromDatabase(userID string) (*User, error) {
	// This is a placeholder implementation
	// In production, this should query your actual database
	
	// Simulate database lookup
	if userID == "" {
		return nil, ErrUserNotFound
	}

	// Mock user data - replace with actual database query
	user := &User{
		ID:        userID,
		Email:     "user@example.com",
		Username:  "testuser",
		IsActive:  true,
		CreatedAt: time.Now().Add(-30 * 24 * time.Hour),
		UpdatedAt: time.Now(),
	}

	return user, nil
}

// Utility functions for configuration management

// SetJWTSecret updates the JWT secret (useful for testing)
func SetJWTSecret(secret string) {
	cfg := GetConfig()
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	cfg.JWTSecret = secret
}

// SetTokenExpiration updates the token expiration duration
func SetTokenExpiration(duration time.Duration) {
	cfg := GetConfig()
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	cfg.TokenExpiration = duration
}

// SetBcryptCost updates the bcrypt cost factor
func SetBcryptCost(cost int) {
	if cost < bcrypt.MinCost || cost > bcrypt.MaxCost {
		log.Printf("Warning: bcrypt cost %d is outside recommended range [%d, %d]", 
			cost, bcrypt.MinCost, bcrypt.MaxCost)
	}
	
	cfg := GetConfig()
	cfg.mu.Lock()
	defer cfg.mu.Unlock()
	cfg.BcryptCost = cost
}

// ValidateTokenFormat performs basic token format validation
func ValidateTokenFormat(tokenString string) error {
	if tokenString == "" {
		return ErrMissingToken
	}

	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return ErrMalformedToken
	}

	return nil
}

// IsTokenExpired checks if a token is expired without full validation
func IsTokenExpired(tokenString string) bool {
	claims, err := VerifyToken(tokenString)
	if err != nil {
		return true
	}

	if exp, ok := (*claims)["exp"].(float64); ok {
		return time.Now().Unix() > int64(exp)
	}

	return true
}

// RateLimitingHook provides a placeholder for rate limiting integration
// TODO: Implement actual rate limiting logic based on your requirements
func RateLimitingHook(userID string, action string) error {
	// Placeholder for rate limiting implementation
	// This could integrate with Redis, in-memory cache, or database
	log.Printf("Rate limiting check for user %s, action %s", userID, action)
	return nil
}

// LogAuthEvent