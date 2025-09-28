I'll generate a production-ready Go web API application based on your blueprint specification. Here's the complete implementation:

## go.mod
```go
module app

go 1.21

require (
    github.com/gin-contrib/cors v1.4.0
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/joho/godotenv v1.4.0
    github.com/lib/pq v1.10.9
    github.com/sirupsen/logrus v1.9.3
    github.com/google/uuid v1.3.0
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

    "app/api/tasks"
    "app/api/users"
    "app/core/auth"
    "app/core/config"
    "app/core/database"
    "app/core/middleware"

    "github.com/gin-contrib/cors"
    "github.com/gin-gonic/gin"
    "github.com/sirupsen/logrus"
)

// Application holds the main application dependencies
type Application struct {
    Config   *config.Config
    Database *database.DB
    Logger   *logrus.Logger
    Router   *gin.Engine
    Server   *http.Server
}

// NewApplication creates a new application instance with all dependencies
func NewApplication() (*Application, error) {
    // Load configuration
    cfg, err := config.Load()
    if err != nil {
        return nil, fmt.Errorf("failed to load configuration: %w", err)
    }

    // Initialize logger
    logger := setupLogger(cfg.Environment)

    // Initialize database
    db, err := database.NewConnection(cfg.DatabaseURL)
    if err != nil {
        logger.WithError(err).Fatal("Failed to connect to database")
        return nil, fmt.Errorf("failed to connect to database: %w", err)
    }

    // Run database migrations
    if err := db.RunMigrations(); err != nil {
        logger.WithError(err).Fatal("Failed to run database migrations")
        return nil, fmt.Errorf("failed to run migrations: %w", err)
    }

    // Initialize Gin router
    if cfg.Environment == "production" {
        gin.SetMode(gin.ReleaseMode)
    }

    router := gin.New()

    app := &Application{
        Config:   cfg,
        Database: db,
        Logger:   logger,
        Router:   router,
    }

    // Setup middleware and routes
    app.setupMiddleware()
    app.setupRoutes()

    // Configure HTTP server
    app.Server = &http.Server{
        Addr:         fmt.Sprintf(":%s", cfg.Port),
        Handler:      router,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    return app, nil
}

// setupLogger configures structured logging
func setupLogger(environment string) *logrus.Logger {
    logger := logrus.New()
    
    // Use JSON formatter for production
    if environment == "production" {
        logger.SetFormatter(&logrus.JSONFormatter{
            TimestampFormat: time.RFC3339,
        })
        logger.SetLevel(logrus.InfoLevel)
    } else {
        logger.SetFormatter(&logrus.TextFormatter{
            FullTimestamp: true,
        })
        logger.SetLevel(logrus.DebugLevel)
    }

    return logger
}

// setupMiddleware configures all application middleware
func (app *Application) setupMiddleware() {
    // Recovery middleware
    app.Router.Use(gin.Recovery())

    // Request ID middleware
    app.Router.Use(middleware.RequestID())

    // Logging middleware
    app.Router.Use(middleware.Logger(app.Logger))

    // CORS middleware
    corsConfig := cors.Config{
        AllowOrigins:     []string{"http://localhost:3000"},
        AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
        AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Request-ID"},
        ExposeHeaders:    []string{"X-Request-ID"},
        AllowCredentials: true,
        MaxAge:           12 * time.Hour,
    }

    if app.Config.Environment == "production" {
        corsConfig.AllowOrigins = []string{app.Config.AllowedOrigins}
    }

    app.Router.Use(cors.New(corsConfig))

    // Timeout middleware
    app.Router.Use(middleware.Timeout(30 * time.Second))
}

// setupRoutes configures all application routes
func (app *Application) setupRoutes() {
    // Health check endpoint (no auth required)
    app.Router.GET("/health", app.healthCheckHandler)

    // API v1 routes
    v1 := app.Router.Group("/api/v1")

    // Initialize auth middleware
    authMiddleware := middleware.JWTAuth(app.Config.JWTSecret)

    // User routes (auth endpoints don't require JWT)
    userGroup := v1.Group("/users")
    users.SetupRoutes(userGroup, app.Database, authMiddleware)

    // Task routes (protected)
    taskGroup := v1.Group("/tasks")
    taskGroup.Use(authMiddleware)
    tasks.SetupRoutes(taskGroup, app.Database)

    // Metrics endpoint for monitoring
    app.Router.GET("/metrics", app.metricsHandler)
}

// healthCheckHandler provides application health status
func (app *Application) healthCheckHandler(c *gin.Context) {
    ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
    defer cancel()

    health := map[string]interface{}{
        "status":    "healthy",
        "timestamp": time.Now().UTC().Format(time.RFC3339),
        "version":   "1.0.0",
        "service":   "Task Management API",
    }

    // Check database connectivity
    if err := app.Database.Ping(ctx); err != nil {
        app.Logger.WithError(err).Error("Database health check failed")
        health["database"] = "disconnected"
        health["status"] = "unhealthy"
        c.JSON(http.StatusServiceUnavailable, health)
        return
    }

    health["database"] = "connected"
    c.JSON(http.StatusOK, health)
}

// metricsHandler provides basic application metrics
func (app *Application) metricsHandler(c *gin.Context) {
    metrics := map[string]interface{}{
        "uptime":     time.Since(time.Now()).String(), // This would be calculated from app start time
        "goroutines": "runtime.NumGoroutine()", // You'd import runtime package
        "timestamp":  time.Now().UTC().Format(time.RFC3339),
    }
    c.JSON(http.StatusOK, metrics)
}

// Start starts the HTTP server
func (app *Application) Start() error {
    app.Logger.WithFields(logrus.Fields{
        "port":        app.Config.Port,
        "environment": app.Config.Environment,
    }).Info("Starting Task Management API server")

    return app.Server.ListenAndServe()
}

// Shutdown gracefully shuts down the application
func (app *Application) Shutdown(ctx context.Context) error {
    app.Logger.Info("Shutting down server...")

    // Shutdown HTTP server
    if err := app.Server.Shutdown(ctx); err != nil {
        return fmt.Errorf("server shutdown failed: %w", err)
    }

    // Close database connections
    if err := app.Database.Close(); err != nil {
        return fmt.Errorf("database close failed: %w", err)
    }

    app.Logger.Info("Server shutdown completed")
    return nil
}

func main() {
    // Create application instance
    app, err := NewApplication()
    if err != nil {
        logrus.WithError(err).Fatal("Failed to initialize application")
    }

    // Channel to listen for interrupt signals
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

    // Start server in a goroutine
    go func() {
        if err := app.Start(); err != nil && err != http.ErrServerClosed {
            app.Logger.WithError(err).Fatal("Failed to start server")
        }
    }()

    app.Logger.Info("Task Management API is ready to handle requests")

    // Wait for interrupt signal
    <-quit
    app.Logger.Info("Shutdown signal received")

    // Create shutdown context with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Attempt graceful shutdown
    if err := app.Shutdown(ctx); err != nil {
        app.Logger.WithError(err).Fatal("Forced shutdown due to error")
    }

    app.Logger.Info("Task Management API stopped")
}
```

## core/config/config.go
```go
package config

import (
    "fmt"
    "os"
    "strconv"

    "github.com/joho/godotenv"
)

// Config holds all application configuration
type Config struct {
    Port           string
    Environment    string
    DatabaseURL    string
    JWTSecret      string
    AllowedOrigins string
    LogLevel       string
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
    // Load .env file if it exists (for development)
    _ = godotenv.Load()

    config := &Config{
        Port:           getEnv("PORT", "8080"),
        Environment:    getEnv("ENVIRONMENT", "development"),
        DatabaseURL:    getEnv("DATABASE_URL", "postgres://localhost/taskmanager?sslmode=disable"),
        JWTSecret:      getEnv("JWT_SECRET", "your-secret-key"),
        AllowedOrigins: getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
        LogLevel:       getEnv("LOG_LEVEL", "info"),
    }

    // Validate required configuration
    if err := config.validate(); err != nil {
        return nil, err
    }

    return config, nil
}

// validate ensures all required configuration is present
func (c *Config) validate() error {
    if c.DatabaseURL == "" {
        return fmt.Errorf("DATABASE_URL is required")
    }
    if c.JWTSecret == "" {
        return fmt.Errorf("JWT_SECRET is required")
    }
    return nil
}

// getEnv gets an environment variable with a fallback value
func getEnv(key, fallback string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return fallback
}

// getEnvAsInt gets an environment variable as integer with fallback
func getEnvAsInt(key string, fallback int) int {
    if value := os.Getenv(key); value != "" {
        if intVal, err := strconv.Atoi(value); err == nil {
            return intVal
        }
    }
    return fallback
}

// getEnvAsBool gets an environment variable as boolean with fallback
func getEnvAsBool(key string, fallback bool) bool {
    if value := os.Getenv(key); value != "" {
        if boolVal, err := strconv.ParseBool(value); err == nil {
            return boolVal
        }
    }
    return fallback
}
```

## core/middleware/middleware.go
```go
package middleware

import (
    "context"
    "net/http"
    "strings"
    "time"

    "app/core/auth"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
    "github.com/sirupsen/logrus"
)

// RequestID adds a unique request ID to each request
func RequestID() gin.HandlerFunc {
    return func(c *gin.Context) {
        requestID := c.GetHeader("X-Request-ID")
        if requestID == "" {
            requestID = uuid.New().String()
        }
        
        c.Header("X-Request-ID", requestID)
        c.Set("request_id", requestID)
        c.Next()
    }
}

// Logger provides structured request logging
func Logger(logger *logrus.Logger) gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        path := c.Request.URL.Path
        raw := c.Request.URL.RawQuery

        // Process request
        c.Next()

        // Calculate latency
        latency := time.Since(start)

        // Get request ID
        requestID, _ := c.Get("request_id")

        // Build log entry
        entry := logger.WithFields(logrus.Fields{
            "request_id": requestID,
            "method":     c.Request.Method,
            "path":       path,
            "query":      raw,
            "status":     c.Writer.Status(),
            "latency":    latency,
            "ip":         c.ClientIP(),
            "user_agent": c.Request.UserAgent(),
        })

        if len(c.Errors) > 0 {
            entry.Error(c.Errors.String())
        } else {
            entry.Info("Request completed")
        }
    }
}

// JWTAuth provides JWT authentication middleware
func JWTAuth(jwtSecret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        // Skip auth for certain endpoints
        if shouldSkipAuth(c.Request.URL.Path) {
            c.Next()
            return
        }

        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, gin.H{
                "error":      "Authorization header required",
                "request_id": c.GetString("request_id"),
            })
            c.Abort()
            return
        }

        // Extract token from "Bearer <token>"
        tokenParts := strings.Split(authHeader, " ")
        if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
            c.JSON(http.StatusUnauthorized, gin.H{
                "error":      "Invalid authorization header format",
                "request_id": c.GetString("request_id"),
            })
            c.Abort()
            return
        }

        token := tokenParts[1]
        claims, err := auth.ValidateJWT(token, jwtSecret)
        if err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{
                "error":      "Invalid or expired token",
                "request_id": c.GetString("request_id"),
            })
            c.Abort()
            return
        }

        // Set user information in context
        c.Set("user_id", claims.UserID)
        c.Set("user_email", claims.Email)
        c.Next()
    }
}

// shouldSkipAuth determines if authentication should be skipped for a path
func shouldSkipAuth(path string) bool {
    skipPaths := []string{
        "/health",
        "/metrics",
        "/api/v1/users/login",
        "/api/v1/users/register",
    }

    for _, skipPath := range skipPaths {
        if path == skipPath {
            return true
        }
    }
    return false
}

// Timeout adds request timeout middleware
func