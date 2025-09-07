// Package auth provides authentication and authorization utilities including
// JWT token management, password hashing, and HTTP middleware for protected routes.
package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"golang.org/x/crypto/bcrypt"
)

// Constants for authentication configuration
const (
	// TokenExpirationHours defines the JWT token expiration time in hours
	TokenExpirationHours = 24
	// BcryptCost defines the cost factor for bcrypt hashing
	BcryptCost = 12
	// BearerPrefix is the expected prefix for Authorization header
	BearerPrefix = "Bearer "
)

// Custom error types for authentication failures
var (
	ErrInvalidToken     = errors.New("invalid token")
	ErrExpiredToken     = errors.New("token has expired")
	ErrMalformedToken   = errors.New("malformed token")
	ErrMissingToken     = errors.New("missing authorization token")
	ErrInvalidPassword  = errors.New("invalid password")
	ErrPasswordTooShort = errors.New("password must be at least 8 characters")
	ErrMissingSecretKey = errors.New("JWT_SECRET_KEY environment variable not set")
	ErrInvalidClaims    = errors.New("invalid token claims")
)

// User represents a user entity that can be extracted from JWT tokens
type User struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Username string `json:"username"`
	Role     string `json:"role,omitempty"`
}

// TokenClaims represents the structure of JWT claims
type TokenClaims struct {
	User User `json:"user"`
	jwt.RegisteredClaims
}

// AuthError represents an authentication error with HTTP status code
type AuthError struct {
	Message    string
	StatusCode int
	Err        error
}

func (e *AuthError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

// getSecretKey retrieves the JWT secret key from environment variables
func getSecretKey() ([]byte, error) {
	secretKey := os.Getenv("JWT_SECRET_KEY")
	if secretKey == "" {
		return nil, ErrMissingSecretKey
	}
	return []byte(secretKey), nil
}

// CreateAccessToken generates a JWT token with the provided data and 24-hour expiration.
// The data map should contain user information that will be embedded in the token claims.
//
// Example usage:
//   userData := map[string]interface{}{
//       "id": "user123",
//       "email": "user@example.com",
//       "username": "johndoe",
//   }
//   token, err := CreateAccessToken(userData)
func CreateAccessToken(data map[string]interface{}) (string, error) {
	if data == nil {
		return "", &AuthError{
			Message:    "token data cannot be nil",
			StatusCode: http.StatusBadRequest,
		}
	}

	secretKey, err := getSecretKey()
	if err != nil {
		log.Printf("Failed to get secret key: %v", err)
		return "", &AuthError{
			Message:    "internal server error",
			StatusCode: http.StatusInternalServerError,
			Err:        err,
		}
	}

	// Convert data map to User struct
	userBytes, err := json.Marshal(data)
	if err != nil {
		return "", &AuthError{
			Message:    "invalid user data format",
			StatusCode: http.StatusBadRequest,
			Err:        err,
		}
	}

	var user User
	if err := json.Unmarshal(userBytes, &user); err != nil {
		return "", &AuthError{
			Message:    "invalid user data structure",
			StatusCode: http.StatusBadRequest,
			Err:        err,
		}
	}

	// Validate required user fields
	if user.ID == "" || user.Email == "" {
		return "", &AuthError{
			Message:    "user ID and email are required",
			StatusCode: http.StatusBadRequest,
		}
	}

	// Create token claims
	claims := TokenClaims{
		User: user,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(TokenExpirationHours * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "auth-service",
		},
	}

	// Create and sign token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(secretKey)
	if err != nil {
		log.Printf("Failed to sign token: %v", err)
		return "", &AuthError{
			Message:    "failed to generate token",
			StatusCode: http.StatusInternalServerError,
			Err:        err,
		}
	}

	return tokenString, nil
}

// VerifyToken validates and parses a JWT token string, returning the claims if valid.
// It checks token signature, expiration, and format.
func VerifyToken(tokenString string) (jwt.MapClaims, error) {
	if tokenString == "" {
		return nil, &AuthError{
			Message:    "empty token string",
			StatusCode: http.StatusUnauthorized,
			Err:        ErrMissingToken,
		}
	}

	secretKey, err := getSecretKey()
	if err != nil {
		log.Printf("Failed to get secret key: %v", err)
		return nil, &AuthError{
			Message:    "internal server error",
			StatusCode: http.StatusInternalServerError,
			Err:        err,
		}
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
		var authErr *AuthError
		if errors.Is(err, jwt.ErrTokenExpired) {
			authErr = &AuthError{
				Message:    "token has expired",
				StatusCode: http.StatusUnauthorized,
				Err:        ErrExpiredToken,
			}
		} else if errors.Is(err, jwt.ErrTokenMalformed) {
			authErr = &AuthError{
				Message:    "malformed token",
				StatusCode: http.StatusUnauthorized,
				Err:        ErrMalformedToken,
			}
		} else {
			authErr = &AuthError{
				Message:    "invalid token",
				StatusCode: http.StatusUnauthorized,
				Err:        ErrInvalidToken,
			}
		}
		return nil, authErr
	}

	// Extract claims
	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, &AuthError{
		Message:    "invalid token claims",
		StatusCode: http.StatusUnauthorized,
		Err:        ErrInvalidClaims,
	}
}

// GetPasswordHash generates a bcrypt hash of the provided password with cost factor 12.
// It validates password strength before hashing.
func GetPasswordHash(password string) (string, error) {
	if len(password) < 8 {
		return "", &AuthError{
			Message:    "password must be at least 8 characters long",
			StatusCode: http.StatusBadRequest,
			Err:        ErrPasswordTooShort,
		}
	}

	if strings.TrimSpace(password) == "" {
		return "", &AuthError{
			Message:    "password cannot be empty or whitespace only",
			StatusCode: http.StatusBadRequest,
			Err:        ErrInvalidPassword,
		}
	}

	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		log.Printf("Failed to hash password: %v", err)
		return "", &AuthError{
			Message:    "failed to process password",
			StatusCode: http.StatusInternalServerError,
			Err:        err,
		}
	}

	return string(hashedBytes), nil
}

// VerifyPassword compares a plain text password with a bcrypt hash using timing-safe comparison.
// Returns nil if the password matches, error otherwise.
func VerifyPassword(plainPassword, hashedPassword string) error {
	if plainPassword == "" {
		return &AuthError{
			Message:    "password cannot be empty",
			StatusCode: http.StatusBadRequest,
			Err:        ErrInvalidPassword,
		}
	}

	if hashedPassword == "" {
		return &AuthError{
			Message:    "invalid password hash",
			StatusCode: http.StatusInternalServerError,
			Err:        ErrInvalidPassword,
		}
	}

	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	if err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return &AuthError{
				Message:    "invalid credentials",
				StatusCode: http.StatusUnauthorized,
				Err:        ErrInvalidPassword,
			}
		}
		log.Printf("Password verification error: %v", err)
		return &AuthError{
			Message:    "authentication failed",
			StatusCode: http.StatusInternalServerError,
			Err:        err,
		}
	}

	return nil
}

// GetCurrentUser extracts and returns the User information from a JWT token string.
// It validates the token and parses the user claims.
func GetCurrentUser(tokenString string) (*User, error) {
	claims, err := VerifyToken(tokenString)
	if err != nil {
		return nil, err
	}

	// Extract user data from claims
	userClaim, exists := claims["user"]
	if !exists {
		return nil, &AuthError{
			Message:    "user information not found in token",
			StatusCode: http.StatusUnauthorized,
			Err:        ErrInvalidClaims,
		}
	}

	// Convert claims to User struct
	userBytes, err := json.Marshal(userClaim)
	if err != nil {
		return nil, &AuthError{
			Message:    "invalid user data in token",
			StatusCode: http.StatusUnauthorized,
			Err:        ErrInvalidClaims,
		}
	}

	var user User
	if err := json.Unmarshal(userBytes, &user); err != nil {
		return nil, &AuthError{
			Message:    "failed to parse user data",
			StatusCode: http.StatusUnauthorized,
			Err:        ErrInvalidClaims,
		}
	}

	// Validate required user fields
	if user.ID == "" || user.Email == "" {
		return nil, &AuthError{
			Message:    "incomplete user data in token",
			StatusCode: http.StatusUnauthorized,
			Err:        ErrInvalidClaims,
		}
	}

	return &user, nil
}

// AuthMiddleware returns an HTTP middleware function that validates JWT tokens
// from the Authorization header. It expects tokens in the format "Bearer <token>".
//
// Example usage:
//   http.Handle("/protected", AuthMiddleware(http.HandlerFunc(protectedHandler)))
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeErrorResponse(w, &AuthError{
				Message:    "missing authorization header",
				StatusCode: http.StatusUnauthorized,
				Err:        ErrMissingToken,
			})
			return
		}

		// Check Bearer prefix
		if !strings.HasPrefix(authHeader, BearerPrefix) {
			writeErrorResponse(w, &AuthError{
				Message:    "invalid authorization header format",
				StatusCode: http.StatusUnauthorized,
				Err:        ErrMalformedToken,
			})
			return
		}

		// Extract token
		tokenString := strings.TrimPrefix(authHeader, BearerPrefix)
		if tokenString == "" {
			writeErrorResponse(w, &AuthError{
				Message:    "missing token in authorization header",
				StatusCode: http.StatusUnauthorized,
				Err:        ErrMissingToken,
			})
			return
		}

		// Verify token
		user, err := GetCurrentUser(tokenString)
		if err != nil {
			writeErrorResponse(w, err)
			return
		}

		// Add user to request context for downstream handlers
		ctx := r.Context()
		ctx = setUserInContext(ctx, user)
		r = r.WithContext(ctx)

		// Call next handler
		next.ServeHTTP(w, r)
	})
}

// ErrorResponse represents the structure of error responses
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	Code    int    `json:"code"`
}

// writeErrorResponse writes a JSON error response to the HTTP response writer
func writeErrorResponse(w http.ResponseWriter, err error) {
	var authErr *AuthError
	var statusCode int
	var message string

	if errors.As(err, &authErr) {
		statusCode = authErr.StatusCode
		message = authErr.Message
	} else {
		statusCode = http.StatusInternalServerError
		message = "internal server error"
		log.Printf("Unexpected error in auth middleware: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	response := ErrorResponse{
		Error:   http.StatusText(statusCode),
		Message: message,
		Code:    statusCode,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode error response: %v", err)
	}
}

// Context key type for storing user in request context
type contextKey string

const userContextKey contextKey = "user"

// setUserInContext adds the user to the request context
func setUserInContext(ctx context.Context, user *User) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}

// GetUserFromContext extracts the user from the request context
// This is a utility function for handlers that need to access the authenticated user
func GetUserFromContext(ctx context.Context) (*User, bool) {
	user, ok := ctx.Value(userContextKey).(*User)
	return user, ok
}

// RequireRole returns a middleware that checks if the authenticated user has the required role
func RequireRole(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := GetUserFromContext(r.Context())
			if !ok {
				writeErrorResponse(w, &AuthError{
					Message:    "user not found in context",