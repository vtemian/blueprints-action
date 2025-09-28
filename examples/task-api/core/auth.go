// Package auth provides comprehensive authentication and authorization utilities
// with JWT token management and secure password handling.
package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Constants for configuration
const (
	TokenExpirationHours = 24
	BcryptCost          = 12
	BearerPrefix        = "Bearer "
	AuthHeaderKey       = "Authorization"
	MinPasswordLength   = 8
	MaxPasswordLength   = 128
)

// Custom error types for different failure modes
var (
	ErrInvalidToken     = fmt.Errorf("invalid token")
	ErrExpiredToken     = fmt.Errorf("token has expired")
	ErrMissingToken     = fmt.Errorf("missing authorization token")
	ErrInvalidPassword  = fmt.Errorf("invalid password")
	ErrPasswordTooShort = fmt.Errorf("password too short")
	ErrPasswordTooLong  = fmt.Errorf("password too long")
	ErrMissingSecret    = fmt.Errorf("JWT secret key not configured")
	ErrUserNotFound     = fmt.Errorf("user not found")
)

// Claims represents the JWT claims structure
type Claims struct {
	UserID   string                 `json:"user_id"`
	Username string                 `json:"username"`
	Email    string                 `json:"email"`
	Role     string                 `json:"role"`
	Data     map[string]interface{} `json:"data,omitempty"`
	jwt.RegisteredClaims
}

// User represents a user in the system
type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"` // Never serialize password hash
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	IsActive     bool      `json:"is_active"`
}

// AuthError represents authentication/authorization errors with HTTP status codes
type AuthError struct {
	Code    int
	Message string
	Err     error
}

func (e *AuthError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

func (e *AuthError) Unwrap() error {
	return e.Err
}

// NewAuthError creates a new AuthError with HTTP status code
func NewAuthError(code int, message string, err error) *AuthError {
	return &AuthError{
		Code:    code,
		Message: message,
		Err:     err,
	}
}

// TokenManager handles JWT token operations
type TokenManager struct {
	secretKey []byte
}

// NewTokenManager creates a new TokenManager instance
func NewTokenManager() (*TokenManager, error) {
	secretKey := os.Getenv("JWT_SECRET_KEY")
	if secretKey == "" {
		return nil, NewAuthError(http.StatusInternalServerError, "JWT secret not configured", ErrMissingSecret)
	}
	
	return &TokenManager{
		secretKey: []byte(secretKey),
	}, nil
}

// CreateAccessToken generates a JWT access token with 24-hour expiration
// Example usage:
//   data := map[string]interface{}{
//       "user_id": "123",
//       "username": "john_doe",
//       "email": "john@example.com",
//       "role": "user",
//   }
//   token, err := CreateAccessToken(data)
func CreateAccessToken(data map[string]interface{}) (string, error) {
	tm, err := NewTokenManager()
	if err != nil {
		return "", err
	}

	return tm.CreateToken(data)
}

// CreateToken generates a JWT token with the provided data
func (tm *TokenManager) CreateToken(data map[string]interface{}) (string, error) {
	if data == nil {
		data = make(map[string]interface{})
	}

	now := time.Now()
	expirationTime := now.Add(TokenExpirationHours * time.Hour)

	// Create claims
	claims := &Claims{
		Data: data,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "core.auth",
		},
	}

	// Extract common fields from data if present
	if userID, ok := data["user_id"].(string); ok {
		claims.UserID = userID
	}
	if username, ok := data["username"].(string); ok {
		claims.Username = username
	}
	if email, ok := data["email"].(string); ok {
		claims.Email = email
	}
	if role, ok := data["role"].(string); ok {
		claims.Role = role
	}

	// Create token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(tm.secretKey)
	if err != nil {
		return "", NewAuthError(http.StatusInternalServerError, "failed to sign token", err)
	}

	return tokenString, nil
}

// VerifyToken validates and parses a JWT token
func VerifyToken(tokenString string) (*Claims, error) {
	tm, err := NewTokenManager()
	if err != nil {
		return nil, err
	}

	return tm.VerifyToken(tokenString)
}

// VerifyToken validates and parses a JWT token
func (tm *TokenManager) VerifyToken(tokenString string) (*Claims, error) {
	if tokenString == "" {
		return nil, NewAuthError(http.StatusUnauthorized, "empty token", ErrInvalidToken)
	}

	// Parse token
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return tm.secretKey, nil
	})

	if err != nil {
		if jwt.IsValidationError(err, jwt.ValidationErrorExpired) {
			return nil, NewAuthError(http.StatusUnauthorized, "token expired", ErrExpiredToken)
		}
		return nil, NewAuthError(http.StatusUnauthorized, "invalid token", fmt.Errorf("%w: %v", ErrInvalidToken, err))
	}

	// Extract claims
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, NewAuthError(http.StatusUnauthorized, "invalid token claims", ErrInvalidToken)
	}

	return claims, nil
}

// GetPasswordHash generates a bcrypt hash of the password with cost factor 12
func GetPasswordHash(password string) (string, error) {
	if err := validatePassword(password); err != nil {
		return "", NewAuthError(http.StatusBadRequest, "invalid password", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return "", NewAuthError(http.StatusInternalServerError, "failed to hash password", err)
	}

	return string(hash), nil
}

// VerifyPassword securely compares a plain password with its bcrypt hash
func VerifyPassword(plainPassword, hashedPassword string) bool {
	if plainPassword == "" || hashedPassword == "" {
		return false
	}

	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	return err == nil
}

// validatePassword validates password requirements
func validatePassword(password string) error {
	if len(password) < MinPasswordLength {
		return ErrPasswordTooShort
	}
	if len(password) > MaxPasswordLength {
		return ErrPasswordTooLong
	}
	return nil
}

// GetCurrentUser extracts user information from a JWT token
// This is a simplified implementation - in production, you might want to
// fetch additional user data from a database
func GetCurrentUser(tokenString string) (*User, error) {
	claims, err := VerifyToken(tokenString)
	if err != nil {
		return nil, err
	}

	if claims.UserID == "" {
		return nil, NewAuthError(http.StatusUnauthorized, "invalid user token", ErrUserNotFound)
	}

	// Create user from claims
	user := &User{
		ID:       claims.UserID,
		Username: claims.Username,
		Email:    claims.Email,
		Role:     claims.Role,
		IsActive: true, // Assume active if token is valid
	}

	return user, nil
}

// ExtractTokenFromHeader extracts Bearer token from Authorization header
func ExtractTokenFromHeader(authHeader string) (string, error) {
	if authHeader == "" {
		return "", NewAuthError(http.StatusUnauthorized, "missing authorization header", ErrMissingToken)
	}

	if !strings.HasPrefix(authHeader, BearerPrefix) {
		return "", NewAuthError(http.StatusUnauthorized, "invalid authorization header format", ErrInvalidToken)
	}

	token := strings.TrimPrefix(authHeader, BearerPrefix)
	if token == "" {
		return "", NewAuthError(http.StatusUnauthorized, "empty bearer token", ErrMissingToken)
	}

	return token, nil
}

// AuthMiddleware provides HTTP middleware for protected routes
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get(AuthHeaderKey)
		token, err := ExtractTokenFromHeader(authHeader)
		if err != nil {
			handleAuthError(w, err)
			return
		}

		// Verify token
		claims, err := VerifyToken(token)
		if err != nil {
			handleAuthError(w, err)
			return
		}

		// Add claims to request context
		ctx := context.WithValue(r.Context(), "claims", claims)
		ctx = context.WithValue(ctx, "user_id", claims.UserID)
		
		// Continue with the request
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireRole creates middleware that requires specific role
func RequireRole(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value("claims").(*Claims)
			if !ok {
				handleAuthError(w, NewAuthError(http.StatusUnauthorized, "no authentication context", ErrInvalidToken))
				return
			}

			if claims.Role != role {
				handleAuthError(w, NewAuthError(http.StatusForbidden, "insufficient permissions", fmt.Errorf("required role: %s, got: %s", role, claims.Role)))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// GetClaimsFromContext extracts claims from request context
func GetClaimsFromContext(ctx context.Context) (*Claims, error) {
	claims, ok := ctx.Value("claims").(*Claims)
	if !ok {
		return nil, NewAuthError(http.StatusUnauthorized, "no authentication context", ErrInvalidToken)
	}
	return claims, nil
}

// GetUserIDFromContext extracts user ID from request context
func GetUserIDFromContext(ctx context.Context) (string, error) {
	userID, ok := ctx.Value("user_id").(string)
	if !ok || userID == "" {
		return "", NewAuthError(http.StatusUnauthorized, "no user context", ErrUserNotFound)
	}
	return userID, nil
}

// handleAuthError handles authentication errors in HTTP responses
func handleAuthError(w http.ResponseWriter, err error) {
	var authErr *AuthError
	if fmt.Errorf("%w", err, &authErr) {
		http.Error(w, authErr.Message, authErr.Code)
	} else {
		http.Error(w, "Authentication failed", http.StatusUnauthorized)
	}
}

// GenerateSecureToken generates a cryptographically secure random token
// Useful for password reset tokens, API keys, etc.
func GenerateSecureToken(length int) (string, error) {
	if length <= 0 {
		length = 32
	}

	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate secure token: %w", err)
	}

	return base64.URLEncoding.EncodeToString(bytes), nil
}

// RefreshToken creates a new token with extended expiration
// This can be used to implement token refresh functionality
func RefreshToken(oldTokenString string) (string, error) {
	claims, err := VerifyToken(oldTokenString)
	if err != nil {
		return "", fmt.Errorf("cannot refresh invalid token: %w", err)
	}

	// Create new token with same data but fresh expiration
	data := claims.Data
	if data == nil {
		data = make(map[string]interface{})
	}

	// Ensure user data is preserved
	data["user_id"] = claims.UserID
	data["username"] = claims.Username
	data["email"] = claims.Email
	data["role"] = claims.Role

	return CreateAccessToken(data)
}

// Example usage:
/*
func main() {
	// Create a password hash
	hash, err := auth.GetPasswordHash("mySecurePassword123")
	if err != nil {
		log.Fatal(err)
	}

	// Verify password
	isValid := auth.VerifyPassword("mySecurePassword123", hash)
	fmt.Printf("Password valid: %v\n", isValid)

	// Create access token
	userData := map[string]interface{}{
		"user_id":  "user123",
		"username": "john_doe",
		"email":    "john@example.com",
		"role":     "admin",
	}

	token, err := auth.CreateAccessToken(userData)
	if err != nil {
		log.Fatal(err)
	}

	// Verify token
	claims, err := auth.VerifyToken(token)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("User ID: %s\n", claims.UserID)

	// Get current user
	user, err := auth.GetCurrentUser(token)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Current user: %+v\n", user)

	// HTTP server with auth middleware
	mux := http.NewServeMux()
	
	// Protected route
	mux.Handle("/protected", auth.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, _ := auth.GetUserIDFromContext(r.Context())
		fmt.Fprintf(w, "Hello, user %s!",