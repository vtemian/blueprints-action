I'll create a production-ready Go REST API module for user management and authentication. Here's the complete implementation:

## Project Structure
```
api/
├── users/
│   ├── handlers.go
│   ├── middleware.go
│   ├── models.go
│   ├── service.go
│   └── types.go
├── database/
│   └── connection.go
├── config/
│   └── config.go
├── utils/
│   └── response.go
├── main.go
└── go.mod
```

## go.mod
```go
module user-api

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/go-playground/validator/v10 v10.15.5
    golang.org/x/crypto v0.14.0
    gorm.io/gorm v1.25.5
    gorm.io/driver/postgres v1.5.4
    github.com/joho/godotenv v1.4.0
)
```

## config/config.go
```go
package config

import (
    "os"
    "strconv"
    "time"
)

type Config struct {
    DatabaseURL    string
    JWTSecret      string
    JWTExpiration  time.Duration
    ServerPort     string
    BCryptCost     int
}

func Load() *Config {
    jwtExpHours, _ := strconv.Atoi(getEnv("JWT_EXPIRATION_HOURS", "24"))
    bcryptCost, _ := strconv.Atoi(getEnv("BCRYPT_COST", "12"))

    return &Config{
        DatabaseURL:   getEnv("DATABASE_URL", "postgres://user:password@localhost/userdb?sslmode=disable"),
        JWTSecret:     getEnv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production"),
        JWTExpiration: time.Duration(jwtExpHours) * time.Hour,
        ServerPort:    getEnv("SERVER_PORT", "8080"),
        BCryptCost:    bcryptCost,
    }
}

func getEnv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}
```

## database/connection.go
```go
package database

import (
    "fmt"
    "log"
    "time"

    "gorm.io/driver/postgres"
    "gorm.io/gorm"
    "gorm.io/gorm/logger"
)

type DB struct {
    *gorm.DB
}

func NewConnection(databaseURL string) (*DB, error) {
    db, err := gorm.Open(postgres.Open(databaseURL), &gorm.Config{
        Logger: logger.Default.LogMode(logger.Info),
    })
    if err != nil {
        return nil, fmt.Errorf("failed to connect to database: %w", err)
    }

    sqlDB, err := db.DB()
    if err != nil {
        return nil, fmt.Errorf("failed to get underlying sql.DB: %w", err)
    }

    // Connection pool settings
    sqlDB.SetMaxIdleConns(10)
    sqlDB.SetMaxOpenConns(100)
    sqlDB.SetConnMaxLifetime(time.Hour)

    return &DB{db}, nil
}

func (db *DB) AutoMigrate(models ...interface{}) error {
    return db.DB.AutoMigrate(models...)
}
```

## utils/response.go
```go
package utils

import (
    "net/http"

    "github.com/gin-gonic/gin"
)

type ErrorResponse struct {
    Error   string            `json:"error"`
    Message string            `json:"message"`
    Details map[string]string `json:"details,omitempty"`
}

type SuccessResponse struct {
    Message string      `json:"message"`
    Data    interface{} `json:"data,omitempty"`
}

func RespondWithError(c *gin.Context, statusCode int, err string, message string, details map[string]string) {
    c.JSON(statusCode, ErrorResponse{
        Error:   err,
        Message: message,
        Details: details,
    })
}

func RespondWithSuccess(c *gin.Context, statusCode int, message string, data interface{}) {
    c.JSON(statusCode, SuccessResponse{
        Message: message,
        Data:    data,
    })
}

func RespondWithData(c *gin.Context, statusCode int, data interface{}) {
    c.JSON(statusCode, data)
}
```

## users/models.go
```go
package users

import (
    "errors"
    "regexp"
    "time"

    "golang.org/x/crypto/bcrypt"
    "gorm.io/gorm"
)

var (
    ErrUserNotFound     = errors.New("user not found")
    ErrEmailExists      = errors.New("email already exists")
    ErrInvalidPassword  = errors.New("invalid password")
    ErrInvalidEmail     = errors.New("invalid email format")
    ErrWeakPassword     = errors.New("password must be at least 8 characters long")
)

type User struct {
    ID        uint      `json:"id" gorm:"primaryKey"`
    Email     string    `json:"email" gorm:"uniqueIndex;not null"`
    Name      string    `json:"name" gorm:"not null"`
    Password  string    `json:"-" gorm:"not null"` // Never include in JSON responses
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
    return u.validate()
}

func (u *User) BeforeUpdate(tx *gorm.DB) error {
    return u.validate()
}

func (u *User) validate() error {
    if !isValidEmail(u.Email) {
        return ErrInvalidEmail
    }
    
    if len(u.Name) == 0 {
        return errors.New("name is required")
    }
    
    return nil
}

func (u *User) HashPassword(cost int) error {
    if len(u.Password) < 8 {
        return ErrWeakPassword
    }
    
    hashedPassword, err := bcrypt.GenerateFromPassword([]byte(u.Password), cost)
    if err != nil {
        return err
    }
    
    u.Password = string(hashedPassword)
    return nil
}

func (u *User) CheckPassword(password string) error {
    return bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
}

func isValidEmail(email string) bool {
    emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
    return emailRegex.MatchString(email)
}
```

## users/types.go
```go
package users

type RegisterRequest struct {
    Email           string `json:"email" binding:"required,email"`
    Password        string `json:"password" binding:"required,min=8"`
    PasswordConfirm string `json:"password_confirm" binding:"required"`
    Name            string `json:"name" binding:"required,min=1"`
}

type LoginRequest struct {
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required"`
}

type UpdateProfileRequest struct {
    Name  string `json:"name" binding:"required,min=1"`
    Email string `json:"email" binding:"required,email"`
}

type ChangePasswordRequest struct {
    CurrentPassword string `json:"current_password" binding:"required"`
    NewPassword     string `json:"new_password" binding:"required,min=8"`
    ConfirmPassword string `json:"confirm_password" binding:"required"`
}

type LoginResponse struct {
    Token string    `json:"token"`
    User  *UserInfo `json:"user"`
}

type UserInfo struct {
    ID        uint   `json:"id"`
    Email     string `json:"email"`
    Name      string `json:"name"`
    CreatedAt string `json:"created_at"`
}

func (u *User) ToUserInfo() *UserInfo {
    return &UserInfo{
        ID:        u.ID,
        Email:     u.Email,
        Name:      u.Name,
        CreatedAt: u.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
    }
}
```

## users/service.go
```go
package users

import (
    "errors"
    "fmt"
    "time"

    "user-api/config"
    "user-api/database"

    "github.com/golang-jwt/jwt/v5"
    "gorm.io/gorm"
)

type Service struct {
    db     *database.DB
    config *config.Config
}

type Claims struct {
    UserID uint   `json:"user_id"`
    Email  string `json:"email"`
    jwt.RegisteredClaims
}

func NewService(db *database.DB, cfg *config.Config) *Service {
    return &Service{
        db:     db,
        config: cfg,
    }
}

func (s *Service) Register(req *RegisterRequest) (*User, error) {
    if req.Password != req.PasswordConfirm {
        return nil, errors.New("passwords do not match")
    }

    // Check if user already exists
    var existingUser User
    if err := s.db.Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
        return nil, ErrEmailExists
    } else if !errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, fmt.Errorf("database error: %w", err)
    }

    user := &User{
        Email:    req.Email,
        Name:     req.Name,
        Password: req.Password,
    }

    if err := user.HashPassword(s.config.BCryptCost); err != nil {
        return nil, fmt.Errorf("failed to hash password: %w", err)
    }

    if err := s.db.Create(user).Error; err != nil {
        return nil, fmt.Errorf("failed to create user: %w", err)
    }

    return user, nil
}

func (s *Service) Login(req *LoginRequest) (*LoginResponse, error) {
    var user User
    if err := s.db.Where("email = ?", req.Email).First(&user).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, ErrUserNotFound
        }
        return nil, fmt.Errorf("database error: %w", err)
    }

    if err := user.CheckPassword(req.Password); err != nil {
        return nil, ErrInvalidPassword
    }

    token, err := s.generateJWT(&user)
    if err != nil {
        return nil, fmt.Errorf("failed to generate token: %w", err)
    }

    return &LoginResponse{
        Token: token,
        User:  user.ToUserInfo(),
    }, nil
}

func (s *Service) GetUserByID(userID uint) (*User, error) {
    var user User
    if err := s.db.First(&user, userID).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, ErrUserNotFound
        }
        return nil, fmt.Errorf("database error: %w", err)
    }
    return &user, nil
}

func (s *Service) UpdateProfile(userID uint, req *UpdateProfileRequest) (*User, error) {
    user, err := s.GetUserByID(userID)
    if err != nil {
        return nil, err
    }

    // Check if email is being changed and if new email already exists
    if user.Email != req.Email {
        var existingUser User
        if err := s.db.Where("email = ? AND id != ?", req.Email, userID).First(&existingUser).Error; err == nil {
            return nil, ErrEmailExists
        } else if !errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, fmt.Errorf("database error: %w", err)
        }
    }

    user.Name = req.Name
    user.Email = req.Email

    if err := s.db.Save(user).Error; err != nil {
        return nil, fmt.Errorf("failed to update user: %w", err)
    }

    return user, nil
}

func (s *Service) ChangePassword(userID uint, req *ChangePasswordRequest) error {
    if req.NewPassword != req.ConfirmPassword {
        return errors.New("new passwords do not match")
    }

    user, err := s.GetUserByID(userID)
    if err != nil {
        return err
    }

    if err := user.CheckPassword(req.CurrentPassword); err != nil {
        return ErrInvalidPassword
    }

    user.Password = req.NewPassword
    if err := user.HashPassword(s.config.BCryptCost); err != nil {
        return fmt.Errorf("failed to hash password: %w", err)
    }

    if err := s.db.Save(user).Error; err != nil {
        return fmt.Errorf("failed to update password: %w", err)
    }

    return nil
}

func (s *Service) generateJWT(user *User) (string, error) {
    claims := &Claims{
        UserID: user.ID,
        Email:  user.Email,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.config.JWTExpiration)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            NotBefore: jwt.NewNumericDate(time.Now()),
            Issuer:    "user-api",
            Subject:   fmt.Sprintf("%d", user.ID),
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString([]byte(s.config.JWTSecret))
}

func (s *Service) ValidateJWT(tokenString string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
        }
        return []byte(s.config.JWTSecret), nil
    })

    if err != nil {
        return nil, err
    }

    if claims, ok := token.Claims.(*Claims); ok && token.Valid {
        return claims, nil
    }

    return nil, errors.New("invalid token")
}
```

## users/middleware.go
```go
package users

import (
    "net/http"
    "strings"

    "user-api/utils"

    "github.com/gin-gonic/gin"
)

const (
    AuthorizationHeader = "Authorization"
    BearerPrefix        = "Bearer "
    UserContextKey      = "user"
)

func (s *Service) AuthMiddleware