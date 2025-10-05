// Package auth provides comprehensive authentication and authorization utilities
// with JWT token management, password hashing, and user validation.
package auth

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"golang.org/x/crypto/bcrypt"
)

const (
	// TokenExpirationHours defines the access token expiration time
	TokenExpirationHours = 24
	// BcryptCost defines the cost factor for bcrypt hashing
	BcryptCost = 12
	// BearerPrefix is the expected prefix for authorization headers
	BearerPrefix = "Bearer "
)

// Custom error types for different authentication failures
var (
	ErrInvalidToken     = errors.New("invalid or malformed token")
	ErrExpiredToken     = errors.New("token has expired")
	ErrMissingToken     = errors.New("authorization token is missing")
	ErrInvalidSignature = errors.New("invalid token signature")
	ErrMissingSecretKey = errors.New("JWT secret key not configured")
	ErrInvalidClaims    = errors.New("invalid token claims")
	ErrUserNotFound     = errors.New("user not found")
	ErrInvalidPassword  = errors.New("invalid password")
	ErrWeakPassword     = errors.New("password does not meet security requirements")
)

// AuthError represents authentication-related errors with HTTP status codes
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

// NewAuthError creates a new authentication error
func NewAuthError(code int, message string, err error) *AuthError {
	return &AuthError{
		Code:    code,
		Message: message,
		Err:     err,
	}
}

// CustomClaims represents the JWT claims structure
type CustomClaims struct {
	UserID   string                 `json:"user_id"`
	Email    string                 `json:"email"`
	Role     string                 `json:"role"`
	Data     map[string]interface{} `json:"data,omitempty"`
	jwt.RegisteredClaims
}

// User represents a user entity
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"` // Never serialize password hash
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	IsActive     bool      `json:"is_active"`
}

// UserRepository interface for user data operations
type UserRepository interface {
	GetUserByID(id string) (*User, error)
	GetUserByEmail(email string) (*User, error)
}

// TokenBlacklist interface for token blacklisting capability
type TokenBlacklist interface {
	IsBlacklisted(tokenID string) bool
	BlacklistToken(tokenID string, expiration time.Time) error
}

// AuthService provides authentication and authorization services
type AuthService struct {
	userRepo      UserRepository
	blacklist     TokenBlacklist
	secretKey     []byte
}

// NewAuthService creates a new authentication service instance
func NewAuthService(userRepo UserRepository, blacklist TokenBlacklist) (*AuthService, error) {
	secretKey := os.Getenv("JWT_SECRET_KEY")
	if secretKey == "" {
		return nil, NewAuthError(500, "JWT secret key not configured", ErrMissingSecretKey)
	}

	// Validate secret key strength (minimum 32 characters)
	if len(secretKey) < 32 {
		return nil, NewAuthError(500, "JWT secret key too weak", errors.New("secret key must be at least 32 characters"))
	}

	return &AuthService{
		userRepo:  userRepo,
		blacklist: blacklist,
		secretKey: []byte(secretKey),
	}, nil
}

// CreateAccessToken generates a JWT token with the provided data and 24-hour expiration
func (s *AuthService) CreateAccessToken(data map[string]interface{}) (string, error) {
	if data == nil {
		return "", NewAuthError(400, "Token data cannot be nil", ErrInvalidClaims)
	}

	// Extract required fields from data
	userID, ok := data["user_id"].(string)
	if !ok || userID == "" {
		return "", NewAuthError(400, "user_id is required in token data", ErrInvalidClaims)
	}

	email, _ := data["email"].(string)
	role, _ := data["role"].(string)

	// Create token ID for blacklisting capability
	tokenID := fmt.Sprintf("%s_%d", userID, time.Now().Unix())

	// Set token expiration
	expirationTime := time.Now().Add(TokenExpirationHours * time.Hour)

	// Create custom claims
	claims := &CustomClaims{
		UserID: userID,
		Email:  email,
		Role:   role,
		Data:   data,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        tokenID,
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "auth-service",
		},
	}

	// Create token with claims
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign token with secret key
	tokenString, err := token.SignedString(s.secretKey)
	if err != nil {
		return "", NewAuthError(500, "Failed to sign token", err)
	}

	return tokenString, nil
}

// VerifyToken decodes and validates a JWT token
func (s *AuthService) VerifyToken(tokenString string) (*jwt.Token, map[string]interface{}, error) {
	if tokenString == "" {
		return nil, nil, NewAuthError(401, "Token is required", ErrMissingToken)
	}

	// Parse token with custom claims
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, NewAuthError(401, "Invalid signing method", ErrInvalidSignature)
		}
		return s.secretKey, nil
	})

	if err != nil {
		// Handle specific JWT errors
		var jwtErr *jwt.ValidationError
		if errors.As(err, &jwtErr) {
			if jwtErr.Errors&jwt.ValidationErrorExpired != 0 {
				return nil, nil, NewAuthError(401, "Token has expired", ErrExpiredToken)
			}
			if jwtErr.Errors&jwt.ValidationErrorSignatureInvalid != 0 {
				return nil, nil, NewAuthError(401, "Invalid token signature", ErrInvalidSignature)
			}
		}
		return nil, nil, NewAuthError(401, "Invalid token", ErrInvalidToken)
	}

	// Validate token and extract claims
	if !token.Valid {
		return nil, nil, NewAuthError(401, "Invalid token", ErrInvalidToken)
	}

	claims, ok := token.Claims.(*CustomClaims)
	if !ok {
		return nil, nil, NewAuthError(401, "Invalid token claims", ErrInvalidClaims)
	}

	// Check if token is blacklisted
	if s.blacklist != nil && s.blacklist.IsBlacklisted(claims.ID) {
		return nil, nil, NewAuthError(401, "Token has been revoked", ErrInvalidToken)
	}

	// Convert claims to map for backward compatibility
	claimsMap := map[string]interface{}{
		"user_id": claims.UserID,
		"email":   claims.Email,
		"role":    claims.Role,
		"exp":     claims.ExpiresAt.Unix(),
		"iat":     claims.IssuedAt.Unix(),
		"jti":     claims.ID,
	}

	// Add custom data if present
	if claims.Data != nil {
		for k, v := range claims.Data {
			claimsMap[k] = v
		}
	}

	return token, claimsMap, nil
}

// GetPasswordHash generates a bcrypt hash of the provided password
func (s *AuthService) GetPasswordHash(password string) (string, error) {
	if password == "" {
		return "", NewAuthError(400, "Password cannot be empty", ErrInvalidPassword)
	}

	// Validate password strength
	if err := s.validatePasswordStrength(password); err != nil {
		return "", NewAuthError(400, "Password does not meet requirements", err)
	}

	// Generate hash with specified cost
	hash, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return "", NewAuthError(500, "Failed to hash password", err)
	}

	return string(hash), nil
}

// VerifyPassword verifies a plain password against a bcrypt hash
func (s *AuthService) VerifyPassword(plainPassword, hashedPassword string) bool {
	if plainPassword == "" || hashedPassword == "" {
		return false
	}

	// Use bcrypt.CompareHashAndPassword for timing attack resistance
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	return err == nil
}

// GetCurrentUser extracts user information from JWT token and validates against database
func (s *AuthService) GetCurrentUser(tokenString string) (*User, error) {
	// Remove Bearer prefix if present
	if strings.HasPrefix(tokenString, BearerPrefix) {
		tokenString = strings.TrimPrefix(tokenString, BearerPrefix)
	}

	// Verify token
	_, claims, err := s.VerifyToken(tokenString)
	if err != nil {
		return nil, err
	}

	// Extract user ID from claims
	userID, ok := claims["user_id"].(string)
	if !ok || userID == "" {
		return nil, NewAuthError(401, "Invalid user ID in token", ErrInvalidClaims)
	}

	// Fetch user from repository
	if s.userRepo == nil {
		return nil, NewAuthError(500, "User repository not configured", errors.New("user repository is nil"))
	}

	user, err := s.userRepo.GetUserByID(userID)
	if err != nil {
		return nil, NewAuthError(404, "User not found", ErrUserNotFound)
	}

	// Validate user is active
	if !user.IsActive {
		return nil, NewAuthError(401, "User account is inactive", errors.New("user account deactivated"))
	}

	return user, nil
}

// ParseAuthorizationHeader extracts the token from Authorization header
func (s *AuthService) ParseAuthorizationHeader(authHeader string) (string, error) {
	if authHeader == "" {
		return "", NewAuthError(401, "Authorization header is missing", ErrMissingToken)
	}

	if !strings.HasPrefix(authHeader, BearerPrefix) {
		return "", NewAuthError(401, "Invalid authorization header format", ErrInvalidToken)
	}

	token := strings.TrimPrefix(authHeader, BearerPrefix)
	if token == "" {
		return "", NewAuthError(401, "Token is missing from authorization header", ErrMissingToken)
	}

	return token, nil
}

// BlacklistToken adds a token to the blacklist
func (s *AuthService) BlacklistToken(tokenString string) error {
	if s.blacklist == nil {
		return NewAuthError(500, "Token blacklist not configured", errors.New("blacklist service not available"))
	}

	// Verify token to get claims
	_, claims, err := s.VerifyToken(tokenString)
	if err != nil {
		return err
	}

	tokenID, ok := claims["jti"].(string)
	if !ok {
		return NewAuthError(400, "Invalid token ID", ErrInvalidClaims)
	}

	exp, ok := claims["exp"].(float64)
	if !ok {
		return NewAuthError(400, "Invalid expiration time", ErrInvalidClaims)
	}

	expiration := time.Unix(int64(exp), 0)
	return s.blacklist.BlacklistToken(tokenID, expiration)
}

// validatePasswordStrength validates password meets security requirements
func (s *AuthService) validatePasswordStrength(password string) error {
	if len(password) < 8 {
		return ErrWeakPassword
	}

	// Add additional password strength validation as needed
	// - Check for uppercase, lowercase, numbers, special characters
	// - Check against common password lists
	// - Check for user information in password

	return nil
}

// Standalone functions for backward compatibility and simple use cases

// CreateAccessToken generates a JWT token with the provided data (standalone function)
func CreateAccessToken(data map[string]interface{}) (string, error) {
	service, err := NewAuthService(nil, nil)
	if err != nil {
		return "", err
	}
	return service.CreateAccessToken(data)
}

// VerifyToken decodes and validates a JWT token (standalone function)
func VerifyToken(tokenString string) (*jwt.Token, map[string]interface{}, error) {
	service, err := NewAuthService(nil, nil)
	if err != nil {
		return nil, nil, err
	}
	return service.VerifyToken(tokenString)
}

// GetPasswordHash generates a bcrypt hash of the provided password (standalone function)
func GetPasswordHash(password string) (string, error) {
	service, err := NewAuthService(nil, nil)
	if err != nil {
		return "", err
	}
	return service.GetPasswordHash(password)
}

// VerifyPassword verifies a plain password against a bcrypt hash (standalone function)
func VerifyPassword(plainPassword, hashedPassword string) bool {
	service, err := NewAuthService(nil, nil)
	if err != nil {
		return false
	}
	return service.VerifyPassword(plainPassword, hashedPassword)
}

// GetCurrentUser extracts user information from JWT token (standalone function)
func GetCurrentUser(tokenString string) (*User, error) {
	service, err := NewAuthService(nil, nil)
	if err != nil {
		return nil, err
	}
	return service.GetCurrentUser(tokenString)
}