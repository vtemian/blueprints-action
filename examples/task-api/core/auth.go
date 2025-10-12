package auth

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	// TokenExpirationHours defines the access token expiration time
	TokenExpirationHours = 24
	// BcryptCost defines the cost factor for bcrypt hashing
	BcryptCost = 12
)

// Custom error types for authentication failures
var (
	ErrInvalidToken     = fmt.Errorf("invalid token")
	ErrExpiredToken     = fmt.Errorf("token has expired")
	ErrMalformedToken   = fmt.Errorf("malformed token")
	ErrUserNotFound     = fmt.Errorf("user not found")
	ErrInactiveUser     = fmt.Errorf("user account is inactive")
	ErrInvalidPassword  = fmt.Errorf("invalid password")
	ErrMissingSecretKey = fmt.Errorf("JWT secret key not configured")
)

// User represents the user model structure
type User struct {
	ID             int64     `json:"id" db:"id"`
	Email          string    `json:"email" db:"email"`
	Username       string    `json:"username" db:"username"`
	HashedPassword string    `json:"-" db:"hashed_password"`
	IsActive       bool      `json:"is_active" db:"is_active"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

// CustomClaims represents the JWT claims structure with custom user data
type CustomClaims struct {
	UserData map[string]interface{} `json:"user_data"`
	jwt.RegisteredClaims
}

// UserRepository defines the interface for user database operations
type UserRepository interface {
	GetUserByID(ctx context.Context, id int64) (*User, error)
	GetUserByEmail(ctx context.Context, email string) (*User, error)
	GetUserByUsername(ctx context.Context, username string) (*User, error)
}

// AuthService provides authentication and authorization functionality
type AuthService struct {
	userRepo UserRepository
}

// NewAuthService creates a new instance of AuthService
func NewAuthService(userRepo UserRepository) *AuthService {
	return &AuthService{
		userRepo: userRepo,
	}
}

// getJWTSecretKey retrieves the JWT secret key from environment variables
func getJWTSecretKey() ([]byte, error) {
	secretKey := os.Getenv("JWT_SECRET_KEY")
	if secretKey == "" {
		return nil, ErrMissingSecretKey
	}
	return []byte(secretKey), nil
}

// CreateAccessToken generates a JWT access token with the provided user data.
// The token expires after 24 hours and includes standard claims (iat, exp, sub)
// along with custom user data.
func CreateAccessToken(data map[string]interface{}) (string, error) {
	if data == nil {
		return "", fmt.Errorf("user data cannot be nil")
	}

	secretKey, err := getJWTSecretKey()
	if err != nil {
		return "", fmt.Errorf("failed to get JWT secret key: %w", err)
	}

	now := time.Now()
	expirationTime := now.Add(TokenExpirationHours * time.Hour)

	// Extract subject from user data (typically user ID)
	var subject string
	if userID, exists := data["user_id"]; exists {
		subject = fmt.Sprintf("%v", userID)
	}

	// Create custom claims
	claims := &CustomClaims{
		UserData: data,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   subject,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			NotBefore: jwt.NewNumericDate(now),
		},
	}

	// Create token with claims
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign token with secret key
	tokenString, err := token.SignedString(secretKey)
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, nil
}

// VerifyToken decodes and validates a JWT token string.
// Returns the token claims if valid, or an error if invalid, expired, or malformed.
func VerifyToken(tokenString string) (*jwt.MapClaims, error) {
	if tokenString == "" {
		return nil, ErrMalformedToken
	}

	secretKey, err := getJWTSecretKey()
	if err != nil {
		return nil, fmt.Errorf("failed to get JWT secret key: %w", err)
	}

	// Parse and validate token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secretKey, nil
	})

	if err != nil {
		// Check for specific JWT errors
		if jwt.IsValidationError(err, jwt.ValidationErrorExpired) {
			return nil, ErrExpiredToken
		}
		if jwt.IsValidationError(err, jwt.ValidationErrorMalformed) {
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

// GetPasswordHash generates a bcrypt hash of the provided password.
// Uses cost factor 12 for secure hashing.
func GetPasswordHash(password string) (string, error) {
	if password == "" {
		return "", fmt.Errorf("password cannot be empty")
	}

	// Generate bcrypt hash
	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}

	return string(hashedBytes), nil
}

// VerifyPassword compares a plain text password with a bcrypt hash.
// Returns true if the password matches the hash, false otherwise.
func VerifyPassword(plainPassword, hashedPassword string) bool {
	if plainPassword == "" || hashedPassword == "" {
		return false
	}

	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	return err == nil
}

// GetCurrentUser extracts user information from a JWT token and fetches
// the complete user record from the database.
func (s *AuthService) GetCurrentUser(ctx context.Context, tokenString string) (*User, error) {
	// Verify and decode token
	claims, err := VerifyToken(tokenString)
	if err != nil {
		return nil, fmt.Errorf("token verification failed: %w", err)
	}

	// Extract user ID from claims
	var userID int64
	if userData, exists := (*claims)["user_data"]; exists {
		if userDataMap, ok := userData.(map[string]interface{}); ok {
			if id, exists := userDataMap["user_id"]; exists {
				switch v := id.(type) {
				case float64:
					userID = int64(v)
				case int64:
					userID = v
				case int:
					userID = int64(v)
				default:
					return nil, fmt.Errorf("invalid user_id format in token")
				}
			}
		}
	}

	if userID == 0 {
		return nil, fmt.Errorf("user_id not found in token")
	}

	// Fetch user from database
	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("failed to fetch user: %w", err)
	}

	// Check if user is active
	if !user.IsActive {
		return nil, ErrInactiveUser
	}

	return user, nil
}

// AuthenticateUser validates user credentials and returns user information if valid.
// This is a helper method for login operations.
func (s *AuthService) AuthenticateUser(ctx context.Context, identifier, password string) (*User, error) {
	if identifier == "" || password == "" {
		return nil, ErrInvalidPassword
	}

	// Try to find user by email first, then by username
	var user *User
	var err error

	// Check if identifier looks like an email
	if contains(identifier, "@") {
		user, err = s.userRepo.GetUserByEmail(ctx, identifier)
	} else {
		user, err = s.userRepo.GetUserByUsername(ctx, identifier)
	}

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("failed to fetch user: %w", err)
	}

	// Check if user is active
	if !user.IsActive {
		return nil, ErrInactiveUser
	}

	// Verify password
	if !VerifyPassword(password, user.HashedPassword) {
		return nil, ErrInvalidPassword
	}

	return user, nil
}

// GenerateUserToken creates an access token for the given user.
// This is a convenience method that combines user data preparation and token creation.
func GenerateUserToken(user *User) (string, error) {
	if user == nil {
		return "", fmt.Errorf("user cannot be nil")
	}

	userData := map[string]interface{}{
		"user_id":  user.ID,
		"email":    user.Email,
		"username": user.Username,
	}

	return CreateAccessToken(userData)
}

// RefreshToken validates an existing token and generates a new one if valid.
// This allows for token refresh without re-authentication.
func (s *AuthService) RefreshToken(ctx context.Context, tokenString string) (string, error) {
	user, err := s.GetCurrentUser(ctx, tokenString)
	if err != nil {
		return "", fmt.Errorf("failed to get current user: %w", err)
	}

	return GenerateUserToken(user)
}

// Helper function to check if a string contains a substring
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// ValidateTokenClaims performs additional validation on token claims
func ValidateTokenClaims(claims *jwt.MapClaims) error {
	if claims == nil {
		return ErrInvalidToken
	}

	// Check if token has expired (additional check)
	if exp, ok := (*claims)["exp"]; ok {
		if expFloat, ok := exp.(float64); ok {
			if time.Now().Unix() > int64(expFloat) {
				return ErrExpiredToken
			}
		}
	}

	// Validate that required user data exists
	if userData, exists := (*claims)["user_data"]; exists {
		if userDataMap, ok := userData.(map[string]interface{}); ok {
			if _, hasUserID := userDataMap["user_id"]; !hasUserID {
				return fmt.Errorf("token missing required user_id")
			}
		} else {
			return fmt.Errorf("invalid user_data format in token")
		}
	} else {
		return fmt.Errorf("token missing user_data")
	}

	return nil
}

// IsTokenExpired checks if a token string represents an expired token
func IsTokenExpired(tokenString string) bool {
	claims, err := VerifyToken(tokenString)
	if err != nil {
		return err == ErrExpiredToken
	}
	return ValidateTokenClaims(claims) == ErrExpiredToken
}

// ExtractUserIDFromToken extracts the user ID from a token without full validation
// Useful for logging or audit purposes where you need the user ID even from expired tokens
func ExtractUserIDFromToken(tokenString string) (int64, error) {
	if tokenString == "" {
		return 0, ErrMalformedToken
	}

	// Parse token without validation
	token, _, err := new(jwt.Parser).ParseUnverified(tokenString, jwt.MapClaims{})
	if err != nil {
		return 0, ErrMalformedToken
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		if userData, exists := claims["user_data"]; exists {
			if userDataMap, ok := userData.(map[string]interface{}); ok {
				if id, exists := userDataMap["user_id"]; exists {
					switch v := id.(type) {
					case float64:
						return int64(v), nil
					case int64:
						return v, nil
					case int:
						return int64(v), nil
					}
				}
			}
		}
	}

	return 0, fmt.Errorf("user_id not found in token")
}