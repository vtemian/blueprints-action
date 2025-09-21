I'll create a production-ready Go application using Gin that mirrors FastAPI's structure and capabilities. Here's the complete implementation:

## Project Structure
```
task-management-api/
├── go.mod
├── go.sum
├── main.go
├── config/
│   └── config.go
├── middleware/
│   ├── auth.go
│   ├── cors.go
│   ├── error.go
│   ├── logging.go
│   └── ratelimit.go
├── handlers/
│   ├── health.go
│   ├── tasks.go
│   └── users.go
├── database/
│   └── database.go
└── models/
    └── models.go
```

## go.mod
```go
module task-management-api

go 1.21

require (
    github.com/gin-contrib/cors v1.4.0
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v4 v4.5.0
    github.com/jackc/pgx/v5 v5.4.3
    github.com/joho/godotenv v1.4.0
    github.com/sirupsen/logrus v1.9.3
    golang.org/x/time v0.3.0
)
```

## main.go
```go
package main

import (
    "context"
    "fmt"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "task-management-api/config"
    "task-management-api/database"
    "task-management-api/handlers"
    "task-management-api/middleware"

    "github.com/gin-gonic/gin"
    "github.com/joho/godotenv"
    "github.com/sirupsen/logrus"
)

// Application represents the main application structure
// This mirrors FastAPI's app instance with dependency injection
type Application struct {
    Config   *config.Config
    Database *database.Database
    Router   *gin.Engine
    Logger   *logrus.Logger
}

// NewApplication creates a new application instance with all dependencies
// Similar to FastAPI's app creation with middleware and route registration
func NewApplication() (*Application, error) {
    // Load environment variables (FastAPI equivalent of settings management)
    if err := godotenv.Load(); err != nil {
        log.Println("No .env file found, using system environment variables")
    }

    // Initialize configuration
    cfg := config.Load()

    // Initialize logger
    logger := logrus.New()
    logger.SetFormatter(&logrus.JSONFormatter{})
    if cfg.Environment == "development" {
        logger.SetLevel(logrus.DebugLevel)
        gin.SetMode(gin.DebugMode)
    } else {
        logger.SetLevel(logrus.InfoLevel)
        gin.SetMode(gin.ReleaseMode)
    }

    // Initialize database with connection pooling
    db, err := database.NewDatabase(cfg.DatabaseURL, logger)
    if err != nil {
        return nil, fmt.Errorf("failed to initialize database: %w", err)
    }

    // Create Gin router with recovery middleware
    router := gin.New()

    app := &Application{
        Config:   cfg,
        Database: db,
        Router:   router,
        Logger:   logger,
    }

    // Setup middleware and routes
    app.setupMiddleware()
    app.setupRoutes()

    return app, nil
}

// setupMiddleware configures all middleware similar to FastAPI's middleware stack
func (app *Application) setupMiddleware() {
    // Recovery middleware (FastAPI's exception handling)
    app.Router.Use(gin.Recovery())

    // Request logging with correlation IDs
    app.Router.Use(middleware.RequestLogger(app.Logger))

    // CORS middleware (FastAPI's CORS configuration)
    app.Router.Use(middleware.CORSMiddleware(app.Config))

    // Rate limiting middleware
    app.Router.Use(middleware.RateLimitMiddleware())

    // Global error handling middleware
    app.Router.Use(middleware.ErrorHandler(app.Logger))
}

// setupRoutes configures all routes and route groups
// This mirrors FastAPI's router organization and dependency injection
func (app *Application) setupRoutes() {
    // Health check endpoint (FastAPI's health check pattern)
    app.Router.GET("/health", handlers.HealthCheck(app.Database, app.Logger))

    // API v1 route group (FastAPI's router grouping)
    v1 := app.Router.Group("/api")
    {
        // Tasks route group with JWT protection
        tasksGroup := v1.Group("/tasks")
        tasksGroup.Use(middleware.JWTAuthMiddleware(app.Config.JWTSecret))
        {
            tasksHandler := handlers.NewTasksHandler(app.Database, app.Logger)
            tasksGroup.GET("", tasksHandler.GetTasks)
            tasksGroup.POST("", tasksHandler.CreateTask)
            tasksGroup.GET("/:id", tasksHandler.GetTask)
            tasksGroup.PUT("/:id", tasksHandler.UpdateTask)
            tasksGroup.DELETE("/:id", tasksHandler.DeleteTask)
        }

        // Users route group with mixed protection
        usersGroup := v1.Group("/users")
        {
            usersHandler := handlers.NewUsersHandler(app.Database, app.Logger)
            // Public routes
            usersGroup.POST("/register", usersHandler.Register)
            usersGroup.POST("/login", usersHandler.Login)
            
            // Protected routes
            protected := usersGroup.Group("")
            protected.Use(middleware.JWTAuthMiddleware(app.Config.JWTSecret))
            {
                protected.GET("/profile", usersHandler.GetProfile)
                protected.PUT("/profile", usersHandler.UpdateProfile)
            }
        }
    }
}

// Start starts the HTTP server with graceful shutdown
// This implements FastAPI's server lifecycle management
func (app *Application) Start() error {
    // Create HTTP server with timeouts
    server := &http.Server{
        Addr:         fmt.Sprintf(":%s", app.Config.Port),
        Handler:      app.Router,
        ReadTimeout:  time.Duration(app.Config.ReadTimeout) * time.Second,
        WriteTimeout: time.Duration(app.Config.WriteTimeout) * time.Second,
        IdleTimeout:  time.Duration(app.Config.IdleTimeout) * time.Second,
    }

    // Start server in goroutine
    go func() {
        app.Logger.WithFields(logrus.Fields{
            "port":        app.Config.Port,
            "environment": app.Config.Environment,
            "title":       "Task Management API",
            "version":     "1.0.0",
        }).Info("Starting HTTP server")

        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            app.Logger.WithError(err).Fatal("Failed to start server")
        }
    }()

    // Wait for interrupt signal for graceful shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    app.Logger.Info("Shutting down server...")

    // Create shutdown context with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Shutdown server
    if err := server.Shutdown(ctx); err != nil {
        app.Logger.WithError(err).Error("Server forced to shutdown")
        return err
    }

    // Close database connections
    app.Database.Close()

    app.Logger.Info("Server exited")
    return nil
}

func main() {
    // Create application instance
    app, err := NewApplication()
    if err != nil {
        log.Fatalf("Failed to create application: %v", err)
    }

    // Start application
    if err := app.Start(); err != nil {
        log.Fatalf("Failed to start application: %v", err)
    }
}
```

## config/config.go
```go
package config

import (
    "os"
    "strconv"
)

// Config holds all application configuration
// This mirrors FastAPI's Settings class for configuration management
type Config struct {
    // Server configuration
    Port         string
    Environment  string
    ReadTimeout  int
    WriteTimeout int
    IdleTimeout  int

    // Database configuration
    DatabaseURL string

    // JWT configuration
    JWTSecret string

    // CORS configuration
    AllowedOrigins []string
}

// Load loads configuration from environment variables
// Similar to FastAPI's Settings with environment variable loading
func Load() *Config {
    return &Config{
        Port:         getEnv("PORT", "8080"),
        Environment:  getEnv("ENVIRONMENT", "development"),
        ReadTimeout:  getEnvAsInt("READ_TIMEOUT", 10),
        WriteTimeout: getEnvAsInt("WRITE_TIMEOUT", 10),
        IdleTimeout:  getEnvAsInt("IDLE_TIMEOUT", 60),
        DatabaseURL:  getEnv("DATABASE_URL", "postgres://user:password@localhost/taskdb?sslmode=disable"),
        JWTSecret:    getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
        AllowedOrigins: []string{
            getEnv("ALLOWED_ORIGIN", "http://localhost:3000"),
        },
    }
}

// getEnv gets environment variable with fallback
func getEnv(key, fallback string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return fallback
}

// getEnvAsInt gets environment variable as integer with fallback
func getEnvAsInt(key string, fallback int) int {
    if value := os.Getenv(key); value != "" {
        if intValue, err := strconv.Atoi(value); err == nil {
            return intValue
        }
    }
    return fallback
}
```

## database/database.go
```go
package database

import (
    "context"
    "fmt"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/sirupsen/logrus"
)

// Database wraps the database connection pool
// This provides FastAPI-style database dependency injection
type Database struct {
    Pool   *pgxpool.Pool
    Logger *logrus.Logger
}

// NewDatabase creates a new database connection with retry logic
// Implements connection pooling and retry logic similar to FastAPI's database setup
func NewDatabase(databaseURL string, logger *logrus.Logger) (*Database, error) {
    // Configure connection pool
    config, err := pgxpool.ParseConfig(databaseURL)
    if err != nil {
        return nil, fmt.Errorf("failed to parse database URL: %w", err)
    }

    // Set pool configuration
    config.MaxConns = 30
    config.MinConns = 5
    config.MaxConnLifetime = time.Hour
    config.MaxConnIdleTime = time.Minute * 30

    // Retry connection with exponential backoff
    var pool *pgxpool.Pool
    maxRetries := 5
    baseDelay := time.Second

    for i := 0; i < maxRetries; i++ {
        pool, err = pgxpool.NewWithConfig(context.Background(), config)
        if err == nil {
            // Test connection
            if err = pool.Ping(context.Background()); err == nil {
                break
            }
            pool.Close()
        }

        if i == maxRetries-1 {
            return nil, fmt.Errorf("failed to connect to database after %d retries: %w", maxRetries, err)
        }

        delay := baseDelay * time.Duration(1<<uint(i)) // Exponential backoff
        logger.WithFields(logrus.Fields{
            "attempt": i + 1,
            "delay":   delay,
            "error":   err,
        }).Warn("Database connection failed, retrying...")

        time.Sleep(delay)
    }

    logger.Info("Database connection established successfully")

    return &Database{
        Pool:   pool,
        Logger: logger,
    }, nil
}

// Close closes the database connection pool
func (db *Database) Close() {
    if db.Pool != nil {
        db.Pool.Close()
        db.Logger.Info("Database connection pool closed")
    }
}

// HealthCheck checks database connectivity
func (db *Database) HealthCheck(ctx context.Context) error {
    return db.Pool.Ping(ctx)
}
```

## middleware/cors.go
```go
package middleware

import (
    "task-management-api/config"

    "github.com/gin-contrib/cors"
    "github.com/gin-gonic/gin"
)

// CORSMiddleware configures CORS similar to FastAPI's CORS middleware
func CORSMiddleware(cfg *config.Config) gin.HandlerFunc {
    corsConfig := cors.Config{
        AllowOrigins:     cfg.AllowedOrigins,
        AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
        ExposeHeaders:    []string{"Content-Length"},
        AllowCredentials: true,
    }

    return cors.New(corsConfig)
}
```

## middleware/auth.go
```go
package middleware

import (
    "net/http"
    "strings"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v4"
)

// JWTAuthMiddleware provides JWT authentication similar to FastAPI's Depends(get_current_user)
func JWTAuthMiddleware(jwtSecret string) gin.HandlerFunc {
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
                return nil, jwt.ErrSignatureInvalid
            }
            return []byte(jwtSecret), nil
        })

        if err != nil || !token.Valid {
            c.JSON(http.StatusUnauthorized, gin.H{
                "error": "Invalid or expired token",
                "code":  "INVALID_TOKEN",
            })
            c.Abort()
            return
        }

        // Extract claims and set user context
        if claims, ok := token.Claims.(jwt.MapClaims); ok {
            c.Set("user_id", claims["user_id"])
            c.Set("username", claims["username"])
        }

        c.Next()
    }
}
```

## middleware/logging.go
```go
package middleware

import (
    "time"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"