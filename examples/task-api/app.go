I'll create a complete FastAPI-equivalent web application in Go using the Gin framework. Here's the production-ready implementation:

## Project Structure
```
task-management-api/
├── main.go
├── go.mod
├── go.sum
├── internal/
│   ├── api/
│   │   ├── tasks/
│   │   │   └── handlers.go
│   │   └── users/
│   │       └── handlers.go
│   ├── core/
│   │   ├── auth/
│   │   │   └── jwt.go
│   │   ├── database/
│   │   │   └── db.go
│   │   └── middleware/
│   │       └── middleware.go
│   └── config/
│       └── config.go
└── pkg/
    └── logger/
        └── logger.go
```

## go.mod
```go
module task-management-api

go 1.21

require (
    github.com/gin-contrib/cors v1.4.0
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/lib/pq v1.10.9
    github.com/sirupsen/logrus v1.9.3
    github.com/joho/godotenv v1.4.0
)
```

## main.go
```go
package main

import (
    "context"
    "fmt"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "task-management-api/internal/api/tasks"
    "task-management-api/internal/api/users"
    "task-management-api/internal/config"
    "task-management-api/internal/core/auth"
    "task-management-api/internal/core/database"
    "task-management-api/internal/core/middleware"
    "task-management-api/pkg/logger"

    "github.com/gin-gonic/gin"
    "github.com/joho/godotenv"
)

// Application represents the main application with all dependencies
type Application struct {
    config     *config.Config
    db         *database.DB
    logger     *logger.Logger
    jwtService *auth.JWTService
    router     *gin.Engine
    server     *http.Server
}

// NewApplication creates a new application instance with dependency injection
func NewApplication() (*Application, error) {
    // Load environment variables
    if err := godotenv.Load(); err != nil {
        // Don't fail if .env file doesn't exist in production
        fmt.Println("Warning: .env file not found")
    }

    // Initialize configuration
    cfg := config.New()

    // Initialize logger
    log := logger.New(cfg.LogLevel)

    // Initialize database
    db, err := database.New(cfg.DatabaseURL, log)
    if err != nil {
        return nil, fmt.Errorf("failed to initialize database: %w", err)
    }

    // Initialize JWT service
    jwtService := auth.NewJWTService(cfg.JWTSecret, cfg.JWTExpirationHours)

    // Set Gin mode based on environment
    if cfg.Environment == "production" {
        gin.SetMode(gin.ReleaseMode)
    }

    app := &Application{
        config:     cfg,
        db:         db,
        logger:     log,
        jwtService: jwtService,
    }

    // Setup router
    app.setupRouter()

    return app, nil
}

// setupRouter configures all routes and middleware
func (app *Application) setupRouter() {
    router := gin.New()

    // Global middleware
    router.Use(gin.Recovery())
    router.Use(middleware.Logger(app.logger))
    router.Use(middleware.CORS(app.config.AllowedOrigins))

    // Health check endpoint (no auth required)
    router.GET("/health", app.healthCheck)

    // API v1 routes
    v1 := router.Group("/api")
    {
        // Tasks routes
        tasksGroup := v1.Group("/tasks")
        tasksGroup.Use(middleware.JWTAuth(app.jwtService))
        tasks.RegisterRoutes(tasksGroup, app.db, app.logger)

        // Users routes
        usersGroup := v1.Group("/users")
        // Some user routes might not require auth (like registration/login)
        users.RegisterRoutes(usersGroup, app.db, app.logger, app.jwtService)
    }

    app.router = router
}

// healthCheck handles the health endpoint
func (app *Application) healthCheck(c *gin.Context) {
    // Check database connectivity
    dbStatus := "healthy"
    if err := app.db.Ping(c.Request.Context()); err != nil {
        app.logger.Error("Database health check failed", "error", err)
        dbStatus = "unhealthy"
        c.JSON(http.StatusServiceUnavailable, gin.H{
            "status":   "unhealthy",
            "database": dbStatus,
            "version":  "1.0.0",
            "error":    "database connection failed",
        })
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "status":   "healthy",
        "database": dbStatus,
        "version":  "1.0.0",
    })
}

// Start starts the HTTP server
func (app *Application) Start() error {
    // Create tables on startup
    if err := app.db.CreateTables(context.Background()); err != nil {
        return fmt.Errorf("failed to create database tables: %w", err)
    }

    app.server = &http.Server{
        Addr:         ":" + app.config.Port,
        Handler:      app.router,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    app.logger.Info("Starting server", "port", app.config.Port, "environment", app.config.Environment)

    if err := app.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
        return fmt.Errorf("failed to start server: %w", err)
    }

    return nil
}

// Shutdown gracefully shuts down the application
func (app *Application) Shutdown(ctx context.Context) error {
    app.logger.Info("Shutting down server...")

    // Shutdown HTTP server
    if err := app.server.Shutdown(ctx); err != nil {
        app.logger.Error("Server shutdown failed", "error", err)
        return err
    }

    // Close database connections
    if err := app.db.Close(); err != nil {
        app.logger.Error("Database shutdown failed", "error", err)
        return err
    }

    app.logger.Info("Server shutdown completed")
    return nil
}

func main() {
    // Create application
    app, err := NewApplication()
    if err != nil {
        fmt.Printf("Failed to create application: %v\n", err)
        os.Exit(1)
    }

    // Start server in a goroutine
    go func() {
        if err := app.Start(); err != nil {
            app.logger.Error("Server failed to start", "error", err)
            os.Exit(1)
        }
    }()

    // Wait for interrupt signal to gracefully shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    // Graceful shutdown with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := app.Shutdown(ctx); err != nil {
        app.logger.Error("Forced shutdown", "error", err)
        os.Exit(1)
    }
}
```

## internal/config/config.go
```go
package config

import (
    "os"
    "strconv"
    "strings"
)

// Config holds all configuration for the application
type Config struct {
    Environment        string
    Port              string
    DatabaseURL       string
    JWTSecret         string
    JWTExpirationHours int
    LogLevel          string
    AllowedOrigins    []string
}

// New creates a new configuration instance from environment variables
func New() *Config {
    return &Config{
        Environment:        getEnv("ENVIRONMENT", "development"),
        Port:              getEnv("PORT", "8080"),
        DatabaseURL:       getEnv("DATABASE_URL", "postgres://user:password@localhost/taskdb?sslmode=disable"),
        JWTSecret:         getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
        JWTExpirationHours: getEnvAsInt("JWT_EXPIRATION_HOURS", 24),
        LogLevel:          getEnv("LOG_LEVEL", "info"),
        AllowedOrigins:    getEnvAsSlice("ALLOWED_ORIGINS", []string{"http://localhost:3000"}),
    }
}

func getEnv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
    if value := os.Getenv(key); value != "" {
        if intValue, err := strconv.Atoi(value); err == nil {
            return intValue
        }
    }
    return defaultValue
}

func getEnvAsSlice(key string, defaultValue []string) []string {
    if value := os.Getenv(key); value != "" {
        return strings.Split(value, ",")
    }
    return defaultValue
}
```

## pkg/logger/logger.go
```go
package logger

import (
    "github.com/sirupsen/logrus"
)

// Logger wraps logrus for structured logging
type Logger struct {
    *logrus.Logger
}

// New creates a new logger instance
func New(level string) *Logger {
    log := logrus.New()
    log.SetFormatter(&logrus.JSONFormatter{})
    
    logLevel, err := logrus.ParseLevel(level)
    if err != nil {
        logLevel = logrus.InfoLevel
    }
    log.SetLevel(logLevel)

    return &Logger{Logger: log}
}

// Info logs an info message with optional key-value pairs
func (l *Logger) Info(msg string, keysAndValues ...interface{}) {
    l.WithFields(l.parseFields(keysAndValues...)).Info(msg)
}

// Error logs an error message with optional key-value pairs
func (l *Logger) Error(msg string, keysAndValues ...interface{}) {
    l.WithFields(l.parseFields(keysAndValues...)).Error(msg)
}

// Warn logs a warning message with optional key-value pairs
func (l *Logger) Warn(msg string, keysAndValues ...interface{}) {
    l.WithFields(l.parseFields(keysAndValues...)).Warn(msg)
}

// Debug logs a debug message with optional key-value pairs
func (l *Logger) Debug(msg string, keysAndValues ...interface{}) {
    l.WithFields(l.parseFields(keysAndValues...)).Debug(msg)
}

func (l *Logger) parseFields(keysAndValues ...interface{}) logrus.Fields {
    fields := logrus.Fields{}
    for i := 0; i < len(keysAndValues); i += 2 {
        if i+1 < len(keysAndValues) {
            key, ok := keysAndValues[i].(string)
            if ok {
                fields[key] = keysAndValues[i+1]
            }
        }
    }
    return fields
}
```

## internal/core/database/db.go
```go
package database

import (
    "context"
    "database/sql"
    "fmt"
    "time"

    "task-management-api/pkg/logger"

    _ "github.com/lib/pq"
)

// DB wraps the database connection with additional functionality
type DB struct {
    *sql.DB
    logger *logger.Logger
}

// New creates a new database connection with connection pooling
func New(databaseURL string, log *logger.Logger) (*DB, error) {
    db, err := sql.Open("postgres", databaseURL)
    if err != nil {
        return nil, fmt.Errorf("failed to open database: %w", err)
    }

    // Configure connection pool
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    db.SetConnMaxLifetime(5 * time.Minute)
    db.SetConnMaxIdleTime(1 * time.Minute)

    // Test connection
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    if err := db.PingContext(ctx); err != nil {
        return nil, fmt.Errorf("failed to ping database: %w", err)
    }

    log.Info("Database connection established successfully")

    return &DB{
        DB:     db,
        logger: log,
    }, nil
}

// Ping checks if the database connection is alive
func (db *DB) Ping(ctx context.Context) error {
    return db.DB.PingContext(ctx)
}

// CreateTables creates all necessary tables for the application
func (db *DB) CreateTables(ctx context.Context) error {
    queries := []string{
        `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            completed BOOLEAN DEFAULT FALSE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)`,
    }

    for _, query := range queries {
        if _, err := db.ExecContext(ctx, query); err != nil {
            return fmt.Errorf("failed to execute query: %w", err)
        }
    }

    db.logger.Info("Database tables created successfully")
    return nil
}

// Close closes the database connection
func (db *DB) Close() error {
    db.logger.Info("Closing database connection")
    return db.DB.Close()
}
```

## internal/core/auth/jwt.go
```go
package auth

import (
    "fmt"
    "time"

    "github.com/golang-jwt/jwt/v5"
)

// JWTService handles JWT token operations
type JWTService struct {
    secretKey         []byte
    expirationHours   int
}

// Claims represents the JWT claims
type Claims struct {
    UserID   int    `json:"user_id"`
    Username string `json:"username"`
    jwt.RegisteredClaims
}

// NewJWTService creates a new JWT service
func NewJWTService(secretKey string, expirationHours int) *JWTService {
    return &JWTService{
        secretKey:       []byte(secretKey),
        expirationHours: expirationHours,
    }
}

// Gener