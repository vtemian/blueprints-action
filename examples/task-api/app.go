I'll create a production-ready Go web API application based on your FastAPI-style blueprint. I'll use Gin as the web framework and structure the code following Go best practices.

## Project Structure

```
task-management-api/
├── main.go
├── go.mod
├── go.sum
├── config/
│   └── config.go
├── database/
│   ├── connection.go
│   └── migrations.go
├── middleware/
│   ├── cors.go
│   ├── jwt.go
│   └── logging.go
├── models/
│   ├── task.go
│   ├── user.go
│   └── errors.go
├── handlers/
│   ├── health.go
│   ├── tasks.go
│   └── users.go
├── services/
│   ├── task_service.go
│   └── user_service.go
└── utils/
    └── response.go
```

## go.mod

```go
module task-management-api

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/lib/pq v1.10.9
    github.com/sirupsen/logrus v1.9.3
    golang.org/x/crypto v0.14.0
)
```

## main.go

```go
package main

import (
    "context"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "task-management-api/config"
    "task-management-api/database"
    "task-management-api/handlers"
    "task-management-api/middleware"
    "task-management-api/services"

    "github.com/gin-gonic/gin"
    "github.com/sirupsen/logrus"
)

// App represents the main application structure
type App struct {
    Config      *config.Config
    DB          *database.DB
    Router      *gin.Engine
    Server      *http.Server
    Logger      *logrus.Logger
    TaskService *services.TaskService
    UserService *services.UserService
}

func main() {
    // Initialize logger
    logger := logrus.New()
    logger.SetFormatter(&logrus.JSONFormatter{})
    logger.SetLevel(logrus.InfoLevel)

    // Load configuration
    cfg, err := config.Load()
    if err != nil {
        logger.WithError(err).Fatal("Failed to load configuration")
    }

    // Initialize database connection
    db, err := database.NewConnection(cfg.DatabaseURL)
    if err != nil {
        logger.WithError(err).Fatal("Failed to connect to database")
    }
    defer db.Close()

    // Run database migrations
    if err := database.RunMigrations(db); err != nil {
        logger.WithError(err).Fatal("Failed to run database migrations")
    }

    // Initialize services
    taskService := services.NewTaskService(db, logger)
    userService := services.NewUserService(db, logger)

    // Create application instance
    app := &App{
        Config:      cfg,
        DB:          db,
        Logger:      logger,
        TaskService: taskService,
        UserService: userService,
    }

    // Setup router and middleware
    app.setupRouter()

    // Setup HTTP server
    app.Server = &http.Server{
        Addr:         ":" + cfg.Port,
        Handler:      app.Router,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    // Start server in a goroutine
    go func() {
        logger.WithField("port", cfg.Port).Info("Starting server")
        if err := app.Server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            logger.WithError(err).Fatal("Failed to start server")
        }
    }()

    // Wait for interrupt signal to gracefully shutdown the server
    app.gracefulShutdown()
}

// setupRouter configures the Gin router with middleware and routes
func (app *App) setupRouter() {
    // Set Gin mode based on environment
    if app.Config.Environment == "production" {
        gin.SetMode(gin.ReleaseMode)
    }

    app.Router = gin.New()

    // Add middleware
    app.Router.Use(middleware.LoggingMiddleware(app.Logger))
    app.Router.Use(middleware.CORSMiddleware(app.Config))
    app.Router.Use(gin.Recovery())

    // Health check endpoint (no auth required)
    app.Router.GET("/health", handlers.NewHealthHandler(app.DB, app.Logger).HealthCheck)

    // API v1 routes
    v1 := app.Router.Group("/api")
    {
        // Task routes
        taskHandler := handlers.NewTaskHandler(app.TaskService, app.Logger)
        taskRoutes := v1.Group("/tasks")
        taskRoutes.Use(middleware.JWTMiddleware(app.Config.JWTSecret))
        {
            taskRoutes.GET("", taskHandler.GetTasks)
            taskRoutes.POST("", taskHandler.CreateTask)
            taskRoutes.GET("/:id", taskHandler.GetTask)
            taskRoutes.PUT("/:id", taskHandler.UpdateTask)
            taskRoutes.DELETE("/:id", taskHandler.DeleteTask)
        }

        // User routes
        userHandler := handlers.NewUserHandler(app.UserService, app.Logger)
        userRoutes := v1.Group("/users")
        {
            // Public routes
            userRoutes.POST("/register", userHandler.Register)
            userRoutes.POST("/login", userHandler.Login)

            // Protected routes
            protected := userRoutes.Group("")
            protected.Use(middleware.JWTMiddleware(app.Config.JWTSecret))
            {
                protected.GET("/profile", userHandler.GetProfile)
                protected.PUT("/profile", userHandler.UpdateProfile)
            }
        }
    }
}

// gracefulShutdown handles graceful server shutdown
func (app *App) gracefulShutdown() {
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    app.Logger.Info("Shutting down server...")

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := app.Server.Shutdown(ctx); err != nil {
        app.Logger.WithError(err).Fatal("Server forced to shutdown")
    }

    app.Logger.Info("Server exited")
}
```

## config/config.go

```go
package config

import (
    "os"
    "strconv"
)

// Config holds all configuration for the application
type Config struct {
    Port        string
    Environment string
    DatabaseURL string
    JWTSecret   string
    CORSOrigins []string
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
    config := &Config{
        Port:        getEnv("PORT", "8080"),
        Environment: getEnv("ENVIRONMENT", "development"),
        DatabaseURL: getEnv("DATABASE_URL", "postgres://user:password@localhost/taskdb?sslmode=disable"),
        JWTSecret:   getEnv("JWT_SECRET", "your-secret-key"),
        CORSOrigins: []string{getEnv("CORS_ORIGIN", "http://localhost:3000")},
    }

    return config, nil
}

// getEnv gets an environment variable with a fallback value
func getEnv(key, fallback string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return fallback
}

// getEnvAsInt gets an environment variable as integer with a fallback value
func getEnvAsInt(key string, fallback int) int {
    if value := os.Getenv(key); value != "" {
        if intVal, err := strconv.Atoi(value); err == nil {
            return intVal
        }
    }
    return fallback
}
```

## database/connection.go

```go
package database

import (
    "context"
    "database/sql"
    "time"

    _ "github.com/lib/pq"
)

// DB wraps the sql.DB connection
type DB struct {
    *sql.DB
}

// NewConnection creates a new database connection with connection pooling
func NewConnection(databaseURL string) (*DB, error) {
    db, err := sql.Open("postgres", databaseURL)
    if err != nil {
        return nil, err
    }

    // Configure connection pool
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    db.SetConnMaxLifetime(5 * time.Minute)

    // Test the connection
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    if err := db.PingContext(ctx); err != nil {
        return nil, err
    }

    return &DB{db}, nil
}

// Close closes the database connection
func (db *DB) Close() error {
    return db.DB.Close()
}

// Ping tests the database connection
func (db *DB) Ping(ctx context.Context) error {
    return db.PingContext(ctx)
}
```

## database/migrations.go

```go
package database

import (
    "context"
    "time"
)

// RunMigrations creates the necessary database tables
func RunMigrations(db *DB) error {
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Create users table
    usersTable := `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );`

    if _, err := db.ExecContext(ctx, usersTable); err != nil {
        return err
    }

    // Create tasks table
    tasksTable := `
    CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        completed BOOLEAN DEFAULT FALSE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );`

    if _, err := db.ExecContext(ctx, tasksTable); err != nil {
        return err
    }

    // Create indexes
    indexes := []string{
        "CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);",
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);",
    }

    for _, index := range indexes {
        if _, err := db.ExecContext(ctx, index); err != nil {
            return err
        }
    }

    return nil
}
```

## models/errors.go

```go
package models

import (
    "fmt"
    "net/http"
)

// AppError represents a custom application error
type AppError struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
    Err     error  `json:"-"`
}

// Error implements the error interface
func (e *AppError) Error() string {
    if e.Err != nil {
        return fmt.Sprintf("%s: %v", e.Message, e.Err)
    }
    return e.Message
}

// Common error constructors
func NewBadRequestError(message string) *AppError {
    return &AppError{
        Code:    http.StatusBadRequest,
        Message: message,
    }
}

func NewUnauthorizedError(message string) *AppError {
    return &AppError{
        Code:    http.StatusUnauthorized,
        Message: message,
    }
}

func NewNotFoundError(message string) *AppError {
    return &AppError{
        Code:    http.StatusNotFound,
        Message: message,
    }
}

func NewInternalServerError(message string, err error) *AppError {
    return &AppError{
        Code:    http.StatusInternalServerError,
        Message: message,
        Err:     err,
    }
}

func NewConflictError(message string) *AppError {
    return &AppError{
        Code:    http.StatusConflict,
        Message: message,
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
    Email        string    `json:"email" db:"email"`
    PasswordHash string    `json:"-" db:"password_hash"`
    FirstName    string    `json:"first_name" db:"first_name"`
    LastName     string    `json:"last_name" db:"last_name"`
    CreatedAt    time.Time `json:"created_at" db:"created_at"`
    UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// CreateUserRequest represents the request to create a new user
type CreateUserRequest struct {
    Email     string `json:"email" binding:"required,email"`
    Password  string `json:"password" binding:"required,min=6"`
    FirstName string `json:"first_name" binding:"required"`
    LastName  string `json:"last_name" binding:"required"`
}

// LoginRequest represents the login request
type LoginRequest struct {
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required"`
}

// LoginResponse represents the login response
type LoginResponse struct {
    Token string `json:"token"`
    User  *User  `json:"user"`
}

// UpdateUserRequest represents the request to update user profile
type UpdateUserRequest struct {
    FirstName string `json:"first_name"`
    LastName  string `json:"last_name"`
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

// CreateTaskRequest represents the request to create a new task
type CreateTaskRequest struct {
    Title       string `json:"title" binding:"required"`
    Description string `json:"description"`
}

// UpdateTaskRequest represents the request to update a task
type UpdateTaskRequest struct {
    Title       string `json:"title"`
    Description string `json:"description"`
    Completed   *bool  `json:"completed"`
}

// TasksResponse represents the response for listing tasks
type TasksResponse struct {
    Tasks []Task `json:"tasks"`
    Total int    `json:"total"`
}
```

## middleware/cors.go

```go
package middleware

import (
    "task-management-api/config"

    "github.com/gin-gonic/gin"
)

// CORSMiddleware config