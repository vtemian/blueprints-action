// Package auth provides JWT-based authentication and authorization functionality
// with bcrypt password hashing for secure user authentication.
package auth

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"../models"
)

// Constants for authentication configuration
const (
	// TokenExpirationHours defines the JWT token validity period
	TokenExpirationHours = 24
	// BcryptCost defines the computational cost for password hashing
	BcryptCost = 12
	// JWTAlgorithm defines the signing algorithm for JWT tokens
	JWTAlgorithm = "HS256"
	// MinSecretKeyLength defines minimum length for JWT secret key
	MinSecretKeyLength = 32
)

// Custom error types for authentication failures
var (
	ErrInvalidToken      = errors.New("invalid token")
	ErrExpiredToken      = errors.New("token has expired")
	ErrMalformedToken    = errors.New("malformed token")
	ErrMissingSecretKey  = errors.New("JWT_SECRET environment variable is not set")
	ErrWeakSecretKey     = errors.New("JWT_SECRET is too weak, minimum 32 characters required")
	ErrEmptyPassword     = errors.New("password cannot be empty")
	ErrEmptyToken        = errors.New("token string cannot be empty")
	ErrInvalidClaims     = errors.New("invalid token claims")
	ErrUserNotFound      = errors.New("user not found in token")
	ErrHashingFailed     = errors.New("password hashing failed")
)

// User represents the user model structure
type User struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

var jwtSecretKey []byte

// init initializes the authentication module by validating environment variables
func init() {
	if err := initializeSecretKey(); err != nil {
		panic(fmt.Sprintf("Authentication module initialization failed: %v", err))
	}
}

// initializeSecretKey validates and sets the JWT secret key from environment
func initializeSecretKey() error {
	secretKey := os.Getenv("JWT_SECRET")
	if secretKey == "" {
		return ErrMissingSecretKey
	}
	
	if len(secretKey) < MinSecretKeyLength {
		return ErrWeakSecretKey
	}
	
	jwtSecretKey = []byte(secretKey)
	return nil
}

// CreateAccessToken generates a JWT token with the provided data and 24-hour expiration.
// The token is signed using HS256 algorithm with the secret key from environment.
//
// Parameters:
//   - data: map containing user information and custom claims to embed in the token
//
// Returns:
//   - string: signed JWT token
//   - error: any error that occurred during token creation
func CreateAccessToken(data map[string]interface{}) (string, error) {
	if data == nil {
		data = make(map[string]interface{})
	}

	// Create token with claims
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"data": data,
		"exp":  time.Now().Add(time.Hour * TokenExpirationHours).Unix(),
		"iat":  time.Now().Unix(),
		"nbf":  time.Now().Unix(),
	})

	// Sign token with secret key
	tokenString, err := token.SignedString(jwtSecretKey)
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, nil
}

// VerifyToken decodes and validates a JWT token string.
// It checks the signature, expiration, and format of the token.
//
// Parameters:
//   - tokenString: the JWT token string to verify
//
// Returns:
//   - *jwt.MapClaims: decoded token claims if valid
//   - error: specific error indicating the type of validation failure
func VerifyToken(tokenString string) (*jwt.MapClaims, error) {
	if strings.TrimSpace(tokenString) == "" {
		return nil, ErrEmptyToken
	}

	// Remove "Bearer " prefix if present
	tokenString = strings.TrimPrefix(tokenString, "Bearer ")
	tokenString = strings.TrimSpace(tokenString)

	// Parse and validate token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecretKey, nil
	})

	if err != nil {
		// Handle specific JWT errors
		var validationErr *jwt.ValidationError
		if errors.As(err, &validationErr) {
			switch {
			case validationErr.Errors&jwt.ValidationErrorExpired != 0:
				return nil, ErrExpiredToken
			case validationErr.Errors&jwt.ValidationErrorMalformed != 0:
				return nil, ErrMalformedToken
			case validationErr.Errors&jwt.ValidationErrorSignatureInvalid != 0:
				return nil, ErrInvalidToken
			default:
				return nil, fmt.Errorf("token validation failed: %w", err)
			}
		}
		return nil, fmt.Errorf("token parsing failed: %w", err)
	}

	// Extract claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidClaims
	}

	return &claims, nil
}

// GetPasswordHash generates a bcrypt hash of the provided password using cost 12.
// The hash is suitable for secure storage and comparison.
//
// Parameters:
//   - password: plain text password to hash
//
// Returns:
//   - string: bcrypt hash of the password
//   - error: any error that occurred during hashing
func GetPasswordHash(password string) (string, error) {
	if strings.TrimSpace(password) == "" {
		return "", ErrEmptyPassword
	}

	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrHashingFailed, err)
	}

	return string(hashedBytes), nil
}

// VerifyPassword performs a timing-safe comparison between a plain text password
// and its bcrypt hash.
//
// Parameters:
//   - plainPassword: the plain text password to verify
//   - hashedPassword: the bcrypt hash to compare against
//
// Returns:
//   - bool: true if the password matches the hash, false otherwise
func VerifyPassword(plainPassword, hashedPassword string) bool {
	if strings.TrimSpace(plainPassword) == "" || strings.TrimSpace(hashedPassword) == "" {
		return false
	}

	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	return err == nil
}

// GetCurrentUser extracts and returns user information from a valid JWT token.
// The token is verified before extracting user data.
//
// Parameters:
//   - tokenString: JWT token string containing user information
//
// Returns:
//   - *User: user information extracted from the token
//   - error: any error that occurred during token verification or user extraction
func GetCurrentUser(tokenString string) (*User, error) {
	claims, err := VerifyToken(tokenString)
	if err != nil {
		return nil, fmt.Errorf("token verification failed: %w", err)
	}

	// Extract user data from claims
	data, ok := (*claims)["data"].(map[string]interface{})
	if !ok {
		return nil, ErrUserNotFound
	}

	user := &User{}

	// Extract user ID
	if id, exists := data["id"]; exists {
		if idFloat, ok := id.(float64); ok {
			user.ID = uint(idFloat)
		} else if idInt, ok := id.(int); ok {
			user.ID = uint(idInt)
		} else if idUint, ok := id.(uint); ok {
			user.ID = idUint
		}
	}

	// Extract username
	if username, exists := data["username"]; exists {
		if usernameStr, ok := username.(string); ok {
			user.Username = usernameStr
		}
	}

	// Extract email
	if email, exists := data["email"]; exists {
		if emailStr, ok := email.(string); ok {
			user.Email = emailStr
		}
	}

	// Extract role
	if role, exists := data["role"]; exists {
		if roleStr, ok := role.(string); ok {
			user.Role = roleStr
		}
	}

	// Validate that we have at least some user identification
	if user.ID == 0 && user.Username == "" && user.Email == "" {
		return nil, ErrUserNotFound
	}

	return user, nil
}

// ValidateTokenFormat performs basic format validation on a token string
// without verifying its signature or expiration.
//
// Parameters:
//   - tokenString: the token string to validate
//
// Returns:
//   - error: validation error if the format is invalid, nil otherwise
func ValidateTokenFormat(tokenString string) error {
	if strings.TrimSpace(tokenString) == "" {
		return ErrEmptyToken
	}

	// Remove "Bearer " prefix if present
	tokenString = strings.TrimPrefix(tokenString, "Bearer ")
	tokenString = strings.TrimSpace(tokenString)

	// Basic JWT format check (should have 3 parts separated by dots)
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return ErrMalformedToken
	}

	// Check that each part is not empty
	for _, part := range parts {
		if strings.TrimSpace(part) == "" {
			return ErrMalformedToken
		}
	}

	return nil
}

// IsTokenExpired checks if a token is expired without full verification.
// This is useful for providing specific error messages.
//
// Parameters:
//   - tokenString: the JWT token string to check
//
// Returns:
//   - bool: true if the token is expired, false otherwise
//   - error: any error that occurred during parsing
func IsTokenExpired(tokenString string) (bool, error) {
	if err := ValidateTokenFormat(tokenString); err != nil {
		return false, err
	}

	// Parse without verification to check expiration
	token, _, err := new(jwt.Parser).ParseUnverified(tokenString, jwt.MapClaims{})
	if err != nil {
		return false, fmt.Errorf("failed to parse token: %w", err)
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return false, ErrInvalidClaims
	}

	// Check expiration
	if exp, ok := claims["exp"].(float64); ok {
		return time.Now().Unix() > int64(exp), nil
	}

	return false, errors.New("no expiration claim found")
}