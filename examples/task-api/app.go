I'll create a complete, production-ready Go web application that mimics FastAPI functionality. Here's the full implementation:

## Project Structure

```
app/
├── main.go
├── api/
│   ├── tasks/
│   │   └── handlers.go
│   └── users/
│       └── handlers.go
├── core/
│   ├── database/
│   │   └── connection.go
│   └── auth/
│       └── middleware.go
└── go.mod
```

## go.mod

```go
module task-management-api

go 1.21

require (
    github.com/gin-contrib/cors v1.4.0
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/joho/godotenv v1.4.0
    github.com/lib/pq v1.10.9
)

require (
    github.com/bytedance/sonic v1.9.1 // indirect
    github.com/chenzhuoyu/base64x v0.0.0-20221115062448-fe3a3abad311 // indirect
    github.com/gabriel-vasile/mimetype v1.4.2 // indirect
    github.com/gin-contrib/sse v0.1.0 // indirect
    github.com/go-playground/locales v0.14.1 // indirect
    github.com/go-playground/universal-translator v0.18.1 // indirect
    github.com/go-playground/validator/v10 v10.14.0 // indirect
    github.com/goccy/go-json v0.10.2 // indirect
    github.com/json-iterator/go v1.1.12 // indirect
    github.com/klauspost/cpuid/v2 v2.2.4 // indirect
    github.com/leodido/go-urn v1.2.4 // indirect
    github.com/mattn/go-isatty v0.0.19 // indirect
    github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
    github.com/modern-go/reflect2 v1.0.2 // indirect
    github.com/pelletier/go-toml/v2 v2.0.8 // indirect
    github.com/twitchyliquid64/golang-asm v0.15.1 // indirect
    github.com/ugorji/go/codec v1.2.11 // indirect
    golang.org/x/arch v0.3.0 // indirect
    golang.org/x/crypto v0.9.0 // indirect
    golang.org/x/net v0.10.0 // indirect
    golang.org/x/sys v0.8.0 // indirect
    golang.org/x/text v0.9.0 // indirect
    google.golang.org/protobuf v1.30.0 // indirect
    gopkg.in/yaml.v3 v3.0.1 // indirect
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

    "task-management-api/api/tasks"
    "task-management-api/api/users"
    "task-management-api/core/auth"
    "task-management-api/core/database"

    "github.com/gin-contrib/cors"
    "github.com/gin-gonic/gin"
    "github.com/joho/godotenv"
)

// AppInfo represents the FastAPI-equivalent application metadata
type AppInfo struct {
    Title       string `json:"title"`
    Version     string `json:"version"`
    Description string `json:"description"`
}

// HealthResponse represents the health check response structure
type HealthResponse struct {
    Status    string    `json:"status"`
    Database  string    `json:"database"`
    Version   string    `json:"version"`
    Timestamp time.Time `json:"timestamp"`
}

// ErrorResponse represents structured error responses
type ErrorResponse struct {
    Error   string      `json:"error"`
    Message string      `json:"message"`
    Code    int         `json:"code"`
    Details interface{} `json:"details,omitempty"`
}

const (
    AppTitle   = "Task Management API"
    AppVersion = "1.0.0"
    AppDesc    = "A FastAPI-equivalent task management system built with Go and Gin"
)

func main() {
    // Load environment variables
    if err := godotenv.Load(); err != nil {
        log.Println("Warning: .env file not found, using system environment variables")
    }

    // Set Gin mode based on environment
    if os.Getenv("GIN_MODE") == "" {
        gin.SetMode(gin.ReleaseMode)
    }

    // Initialize database connection
    db, err := database.Initialize()
    if err != nil {
        log.Fatalf("Failed to initialize database: %v", err)
    }
    defer func() {
        if err := database.Close(); err != nil {
            log.Printf("Error closing database: %v", err)
        }
    }()

    // Create database tables
    if err := database.CreateTables(db); err != nil {
        log.Fatalf("Failed to create database tables: %v", err)
    }

    // Initialize Gin router
    router := setupRouter(db)

    // Configure server
    port := os.Getenv("PORT")
    if port == "" {
        port = "8000"
    }

    server := &http.Server{
        Addr:         ":" + port,
        Handler:      router,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    // Start server in a goroutine
    go func() {
        log.Printf("🚀 %s v%s starting on port %s", AppTitle, AppVersion, port)
        log.Printf("📖 API Documentation available at http://localhost:%s/", port)
        
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Failed to start server: %v", err)
        }
    }()

    // Graceful shutdown
    gracefulShutdown(server)
}

// setupRouter configures the Gin router with all middleware and routes
func setupRouter(db database.DB) *gin.Engine {
    router := gin.New()

    // Recovery middleware
    router.Use(gin.Recovery())

    // Custom logging middleware
    router.Use(requestLoggingMiddleware())

    // CORS middleware - equivalent to FastAPI's CORS configuration
    config := cors.DefaultConfig()
    config.AllowOrigins = []string{"http://localhost:3000", "http://127.0.0.1:3000"}
    config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
    config.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
    config.AllowCredentials = true
    router.Use(cors.New(config))

    // Global error handling middleware
    router.Use(errorHandlingMiddleware())

    // Root endpoint - FastAPI equivalent info
    router.GET("/", func(c *gin.Context) {
        c.JSON(http.StatusOK, AppInfo{
            Title:       AppTitle,
            Version:     AppVersion,
            Description: AppDesc,
        })
    })

    // Health check endpoint
    router.GET("/health", healthCheckHandler(db))

    // API routes group
    api := router.Group("/api")
    {
        // Task routes - equivalent to FastAPI router inclusion
        taskGroup := api.Group("/tasks")
        {
            taskGroup.GET("/", tasks.GetTasks)
            taskGroup.POST("/", tasks.CreateTask)
            taskGroup.GET("/:id", tasks.GetTask)
            taskGroup.PUT("/:id", auth.JWTAuthMiddleware(), tasks.UpdateTask)
            taskGroup.DELETE("/:id", auth.JWTAuthMiddleware(), tasks.DeleteTask)
        }

        // User routes - equivalent to FastAPI router inclusion
        userGroup := api.Group("/users")
        {
            userGroup.POST("/register", users.RegisterUser)
            userGroup.POST("/login", users.LoginUser)
            userGroup.GET("/profile", auth.JWTAuthMiddleware(), users.GetProfile)
            userGroup.PUT("/profile", auth.JWTAuthMiddleware(), users.UpdateProfile)
        }
    }

    // Protected routes example
    protected := api.Group("/protected")
    protected.Use(auth.JWTAuthMiddleware())
    {
        protected.GET("/dashboard", func(c *gin.Context) {
            userID := c.GetString("user_id")
            c.JSON(http.StatusOK, gin.H{
                "message": "Welcome to your dashboard",
                "user_id": userID,
            })
        })
    }

    return router
}

// healthCheckHandler implements comprehensive health checking
func healthCheckHandler(db database.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
        defer cancel()

        response := HealthResponse{
            Status:    "healthy",
            Version:   AppVersion,
            Timestamp: time.Now(),
            Database:  "disconnected",
        }

        // Check database connection
        if err := database.Ping(ctx, db); err != nil {
            log.Printf("Database health check failed: %v", err)
            response.Status = "unhealthy"
            response.Database = "error: " + err.Error()
            c.JSON(http.StatusServiceUnavailable, response)
            return
        }

        response.Database = "connected"
        c.JSON(http.StatusOK, response)
    }
}

// requestLoggingMiddleware provides structured request logging
func requestLoggingMiddleware() gin.HandlerFunc {
    return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
        return fmt.Sprintf("[%s] %s %s %d %s %s\n",
            param.TimeStamp.Format("2006-01-02 15:04:05"),
            param.Method,
            param.Path,
            param.StatusCode,
            param.Latency,
            param.ClientIP,
        )
    })
}

// errorHandlingMiddleware provides centralized error handling
func errorHandlingMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Next()

        // Handle any errors that occurred during request processing
        if len(c.Errors) > 0 {
            err := c.Errors.Last()
            
            var statusCode int
            var message string

            switch err.Type {
            case gin.ErrorTypeBind:
                statusCode = http.StatusBadRequest
                message = "Invalid request format"
            case gin.ErrorTypePublic:
                statusCode = http.StatusBadRequest
                message = err.Error()
            default:
                statusCode = http.StatusInternalServerError
                message = "Internal server error"
            }

            errorResponse := ErrorResponse{
                Error:   http.StatusText(statusCode),
                Message: message,
                Code:    statusCode,
            }

            c.JSON(statusCode, errorResponse)
        }
    }
}

// gracefulShutdown handles graceful server shutdown
func gracefulShutdown(server *http.Server) {
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    
    <-quit
    log.Println("🛑 Shutting down server...")

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := server.Shutdown(ctx); err != nil {
        log.Fatalf("Server forced to shutdown: %v", err)
    }

    log.Println("✅ Server exited gracefully")
}
```

## core/database/connection.go

```go
package database

import (
    "context"
    "database/sql"
    "fmt"
    "log"
    "os"
    "strconv"
    "time"

    _ "github.com/lib/pq"
)

// DB interface for database operations - allows for easy testing and mocking
type DB interface {
    QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
    QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
    ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
    PrepareContext(ctx context.Context, query string) (*sql.Stmt, error)
    BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
    Ping() error
    Close() error
}

var db *sql.DB

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
    Host         string
    Port         int
    User         string
    Password     string
    DatabaseName string
    SSLMode      string
    MaxOpenConns int
    MaxIdleConns int
    MaxLifetime  time.Duration
}

// Initialize establishes database connection with proper configuration
func Initialize() (DB, error) {
    config := getDatabaseConfig()
    
    // Build connection string
    connStr := fmt.Sprintf(
        "host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
        config.Host, config.Port, config.User, config.Password, 
        config.DatabaseName, config.SSLMode,
    )

    var err error
    db, err = sql.Open("postgres", connStr)
    if err != nil {
        return nil, fmt.Errorf("failed to open database connection: %w", err)
    }

    // Configure connection pool
    db.SetMaxOpenConns(config.MaxOpenConns)
    db.SetMaxIdleConns(config.MaxIdleConns)
    db.SetConnMaxLifetime(config.MaxLifetime)

    // Test connection
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    if err := db.PingContext(ctx); err != nil {
        return nil, fmt.Errorf("failed to ping database: %w", err)
    }

    log.Printf("✅ Database connected successfully to %s:%d", config.Host, config.Port)
    return db, nil
}

// getDatabaseConfig reads database configuration from environment variables
func getDatabaseConfig() DatabaseConfig {
    config := DatabaseConfig{
        Host:         getEnv("DB_HOST", "localhost"),
        Port:         getEnvAsInt("DB_PORT", 5432),
        User:         getEnv("DB_USER", "postgres"),
        Password:     getEnv("DB_PASSWORD", "password"),
        DatabaseName: getEnv("DB_NAME", "taskmanagement"),
        SSLMode:      getEnv("DB_SSLMODE", "disable"),
        MaxOpenConns: getEnvAsInt("DB_MAX_OPEN_CONNS", 25),
        MaxIdleConns: getEnvAsInt("DB_MAX_IDLE_CONNS", 5),
        MaxLifetime:  time.Duration(getEnvAsInt("DB_MAX_LIFETIME_MINUTES", 30)) * time.Minute,
    }

    return config
}

// CreateTables creates necessary database tables
func CreateTables(database DB