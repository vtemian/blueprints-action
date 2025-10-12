I'll create a production-ready Go web application that translates the FastAPI concepts to Go using Gin framework. Here's the complete implementation:

## Project Structure
```
task-management-api/
├── main.go
├── go.mod
├── go.sum
├── config/
│   └── config.go
├── database/
│   └── database.go
├── middleware/
│   ├── cors.go
│   └── auth.go
├── handlers/
│   ├── health.go
│   ├── tasks.go
│   └── users.go
├── models/
│   ├── task.go
│   └── user.go
└── router/
    └── router.go
```

## go.mod
```go
module task-management-api

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/lib/pq v1.10.9
    github.com/rs/cors v1.10.1
)
```

## main.go
```go
package main

import (
    "context"
    "log/slog"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "task-management-api/config"
    "task-management-api/database"
    "task-management-api/router"
)

func main() {
    // Initialize structured logger
    logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelInfo,
    }))
    slog.SetDefault(logger)

    // Load configuration
    cfg := config.Load()
    
    slog.Info("Starting Task Management API", 
        "version", cfg.Version,
        "port", cfg.Port,
    )

    // Initialize database
    db, err := database.Initialize(cfg.DatabaseURL)
    if err != nil {
        slog.Error("Failed to initialize database", "error", err)
        os.Exit(1)
    }
    defer db.Close()

    // Create database tables
    if err := database.CreateTables(db); err != nil {
        slog.Error("Failed to create database tables", "error", err)
        os.Exit(1)
    }

    // Setup router with dependencies
    r := router.Setup(&router.Dependencies{
        DB:     db,
        Config: cfg,
    })

    // Create HTTP server
    srv := &http.Server{
        Addr:         ":" + cfg.Port,
        Handler:      r,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    // Start server in a goroutine
    go func() {
        slog.Info("Server starting", "addr", srv.Addr)
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            slog.Error("Server failed to start", "error", err)
            os.Exit(1)
        }
    }()

    // Wait for interrupt signal to gracefully shutdown the server
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    slog.Info("Server shutting down...")

    // Create a deadline for shutdown
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Attempt graceful shutdown
    if err := srv.Shutdown(ctx); err != nil {
        slog.Error("Server forced to shutdown", "error", err)
        os.Exit(1)
    }

    slog.Info("Server exited")
}
```

## config/config.go
```go
package config

import (
    "os"
)

// Config holds all configuration for the application
type Config struct {
    Title       string
    Version     string
    Port        string
    DatabaseURL string
    JWTSecret   string
    Environment string
}

// Load returns application configuration from environment variables
func Load() *Config {
    return &Config{
        Title:       getEnv("APP_TITLE", "Task Management API"),
        Version:     getEnv("APP_VERSION", "1.0.0"),
        Port:        getEnv("PORT", "8080"),
        DatabaseURL: getEnv("DATABASE_URL", "postgres://user:password@localhost/taskdb?sslmode=disable"),
        JWTSecret:   getEnv("JWT_SECRET", "your-secret-key"),
        Environment: getEnv("ENVIRONMENT", "development"),
    }
}

// getEnv gets an environment variable with a fallback value
func getEnv(key, fallback string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return fallback
}
```

## database/database.go
```go
package database

import (
    "database/sql"
    "fmt"
    "log/slog"
    "time"

    _ "github.com/lib/pq"
)

// Initialize creates and configures the database connection pool
func Initialize(databaseURL string) (*sql.DB, error) {
    db, err := sql.Open("postgres", databaseURL)
    if err != nil {
        return nil, fmt.Errorf("failed to open database: %w", err)
    }

    // Configure connection pool
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    db.SetConnMaxLifetime(5 * time.Minute)
    db.SetConnMaxIdleTime(1 * time.Minute)

    // Test the connection
    if err := db.Ping(); err != nil {
        return nil, fmt.Errorf("failed to ping database: %w", err)
    }

    slog.Info("Database connection established")
    return db, nil
}

// CreateTables creates the necessary database tables
func CreateTables(db *sql.DB) error {
    queries := []string{
        `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            completed BOOLEAN DEFAULT FALSE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)`,
    }

    for _, query := range queries {
        if _, err := db.Exec(query); err != nil {
            return fmt.Errorf("failed to execute query: %w", err)
        }
    }

    slog.Info("Database tables created successfully")
    return nil
}

// CheckConnection verifies database connectivity
func CheckConnection(db *sql.DB) error {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    return db.PingContext(ctx)
}
```

## middleware/cors.go
```go
package middleware

import (
    "github.com/gin-gonic/gin"
    "github.com/rs/cors"
)

// CORS returns a Gin middleware that handles CORS
func CORS() gin.HandlerFunc {
    c := cors.New(cors.Options{
        AllowedOrigins: []string{
            "http://localhost:3000",
            "https://localhost:3000",
        },
        AllowedMethods: []string{
            "GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH",
        },
        AllowedHeaders: []string{
            "Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With",
        },
        ExposedHeaders: []string{
            "Content-Length", "Content-Type",
        },
        AllowCredentials: true,
        MaxAge:          12 * 60 * 60, // 12 hours
    })

    return gin.WrapH(c.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // This will be handled by Gin
    })))
}
```

## middleware/auth.go
```go
package middleware

import (
    "fmt"
    "net/http"
    "strings"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
)

// JWTAuth returns a Gin middleware that validates JWT tokens
func JWTAuth(jwtSecret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, gin.H{
                "error": "Authorization header required",
                "code":  "MISSING_AUTH_HEADER",
            })
            c.Abort()
            return
        }

        // Extract token from "Bearer <token>"
        tokenParts := strings.Split(authHeader, " ")
        if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
            c.JSON(http.StatusUnauthorized, gin.H{
                "error": "Invalid authorization header format",
                "code":  "INVALID_AUTH_FORMAT",
            })
            c.Abort()
            return
        }

        tokenString := tokenParts[1]

        // Parse and validate token
        token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
            if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
            }
            return []byte(jwtSecret), nil
        })

        if err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{
                "error": "Invalid token",
                "code":  "INVALID_TOKEN",
            })
            c.Abort()
            return
        }

        if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
            // Add user information to context
            c.Set("user_id", claims["user_id"])
            c.Set("username", claims["username"])
            c.Next()
        } else {
            c.JSON(http.StatusUnauthorized, gin.H{
                "error": "Invalid token claims",
                "code":  "INVALID_CLAIMS",
            })
            c.Abort()
            return
        }
    }
}

// OptionalJWTAuth is similar to JWTAuth but doesn't require authentication
func OptionalJWTAuth(jwtSecret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.Next()
            return
        }

        // If header exists, validate it
        tokenParts := strings.Split(authHeader, " ")
        if len(tokenParts) == 2 && tokenParts[0] == "Bearer" {
            tokenString := tokenParts[1]
            
            token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
                if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                    return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
                }
                return []byte(jwtSecret), nil
            })

            if err == nil {
                if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
                    c.Set("user_id", claims["user_id"])
                    c.Set("username", claims["username"])
                }
            }
        }
        
        c.Next()
    }
}
```

## models/user.go
```go
package models

import (
    "time"
)

// User represents a user in the system
type User struct {
    ID           int       `json:"id" db:"id"`
    Username     string    `json:"username" db:"username"`
    Email        string    `json:"email" db:"email"`
    PasswordHash string    `json:"-" db:"password_hash"` // Never include in JSON
    CreatedAt    time.Time `json:"created_at" db:"created_at"`
    UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// CreateUserRequest represents the request payload for creating a user
type CreateUserRequest struct {
    Username string `json:"username" binding:"required,min=3,max=50"`
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required,min=6"`
}

// LoginRequest represents the request payload for user login
type LoginRequest struct {
    Username string `json:"username" binding:"required"`
    Password string `json:"password" binding:"required"`
}

// UserResponse represents the response format for user data
type UserResponse struct {
    ID        int       `json:"id"`
    Username  string    `json:"username"`
    Email     string    `json:"email"`
    CreatedAt time.Time `json:"created_at"`
}
```

## models/task.go
```go
package models

import (
    "time"
)

// Task represents a task in the system
type Task struct {
    ID          int       `json:"id" db:"id"`
    Title       string    `json:"title" db:"title"`
    Description string    `json:"description" db:"description"`
    Completed   bool      `json:"completed" db:"completed"`
    UserID      int       `json:"user_id" db:"user_id"`
    CreatedAt   time.Time `json:"created_at" db:"created_at"`
    UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// CreateTaskRequest represents the request payload for creating a task
type CreateTaskRequest struct {
    Title       string `json:"title" binding:"required,min=1,max=255"`
    Description string `json:"description" binding:"max=1000"`
}

// UpdateTaskRequest represents the request payload for updating a task
type UpdateTaskRequest struct {
    Title       *string `json:"title,omitempty" binding:"omitempty,min=1,max=255"`
    Description *string `json:"description,omitempty" binding:"omitempty,max=1000"`
    Completed   *bool   `json:"completed,omitempty"`
}
```

## handlers/health.go
```go
package handlers

import (
    "database/sql"
    "net/http"
    "time"

    "github.com/gin-gonic/gin"
    "task-management-api/database"
)

// HealthHandler handles health check requests
type HealthHandler struct {
    db *sql.DB
}

// NewHealthHandler creates a new health handler
func NewHealthHandler(db *sql.DB) *HealthHandler {
    return &HealthHandler{db: db}
}

// HealthResponse represents the health check response
type HealthResponse struct {
    Status    string            `json:"status"`
    Timestamp time.Time         `json:"timestamp"`
    Version   string            `json:"version"`
    Checks    map[string]string `json:"checks"`
}

// Check handles GET /health
func (h *HealthHandler) Check(c *gin.Context) {