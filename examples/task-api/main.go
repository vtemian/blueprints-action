Here's a complete, production-ready Go application entry point that serves as the equivalent of a FastAPI launcher:

```go
// main.go
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/your-project/app" // Replace with your actual module path
)

// Config holds the application configuration
type Config struct {
	Host         string
	Port         int
	Environment  string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

// loadConfig loads configuration from environment variables with sensible defaults
func loadConfig() *Config {
	config := &Config{
		Host:         getEnv("HOST", "0.0.0.0"),
		Port:         getEnvAsInt("PORT", 8000),
		Environment:  getEnv("ENVIRONMENT", "development"),
		ReadTimeout:  getEnvAsDuration("READ_TIMEOUT", 10*time.Second),
		WriteTimeout: getEnvAsDuration("WRITE_TIMEOUT", 10*time.Second),
		IdleTimeout:  getEnvAsDuration("IDLE_TIMEOUT", 60*time.Second),
	}

	return config
}

// getEnv gets an environment variable with a fallback default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvAsInt gets an environment variable as integer with a fallback default value
func getEnvAsInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

// getEnvAsDuration gets an environment variable as duration with a fallback default value
func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

// setupLogger configures structured logging based on environment
func setupLogger(environment string) *slog.Logger {
	var logger *slog.Logger

	if environment == "production" {
		// JSON logging for production
		logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelInfo,
		}))
	} else {
		// Text logging for development
		logger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))
	}

	slog.SetDefault(logger)
	return logger
}

// setupGin configures the Gin router based on environment
func setupGin(environment string) *gin.Engine {
	if environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Add recovery middleware
	router.Use(gin.Recovery())

	// Add custom logging middleware
	router.Use(ginLogger())

	// Configure CORS
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{"*"} // Configure appropriately for production
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
	corsConfig.AllowCredentials = true

	router.Use(cors.New(corsConfig))

	return router
}

// ginLogger creates a custom Gin logging middleware using slog
func ginLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		// Process request
		c.Next()

		// Calculate latency
		latency := time.Since(start)

		// Get client IP
		clientIP := c.ClientIP()

		// Get status code
		statusCode := c.Writer.Status()

		// Get method
		method := c.Request.Method

		// Build full path
		if raw != "" {
			path = path + "?" + raw
		}

		// Log the request
		slog.Info("HTTP Request",
			"method", method,
			"path", path,
			"status", statusCode,
			"latency", latency,
			"client_ip", clientIP,
			"user_agent", c.Request.UserAgent(),
		)
	}
}

// createServer creates and configures the HTTP server
func createServer(router *gin.Engine, config *Config) *http.Server {
	address := fmt.Sprintf("%s:%d", config.Host, config.Port)

	server := &http.Server{
		Addr:         address,
		Handler:      router,
		ReadTimeout:  config.ReadTimeout,
		WriteTimeout: config.WriteTimeout,
		IdleTimeout:  config.IdleTimeout,
	}

	return server
}

// gracefulShutdown handles graceful shutdown of the HTTP server
func gracefulShutdown(server *http.Server, logger *slog.Logger) {
	// Create a channel to receive OS signals
	quit := make(chan os.Signal, 1)
	
	// Register the channel to receive specific signals
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Block until a signal is received
	sig := <-quit
	logger.Info("Received shutdown signal", "signal", sig.String())

	// Create a context with timeout for graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Attempt graceful shutdown
	logger.Info("Shutting down server...")
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", "error", err)
		os.Exit(1)
	}

	logger.Info("Server exited gracefully")
}

// main is the application entry point
func main() {
	// Load configuration
	config := loadConfig()

	// Setup logging
	logger := setupLogger(config.Environment)

	logger.Info("Starting application",
		"environment", config.Environment,
		"host", config.Host,
		"port", config.Port,
	)

	// Setup Gin router
	router := setupGin(config.Environment)

	// Initialize application routes from the app package
	if err := app.InitializeRoutes(router); err != nil {
		logger.Error("Failed to initialize routes", "error", err)
		os.Exit(1)
	}

	// Add health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":      "healthy",
			"timestamp":   time.Now().UTC(),
			"environment": config.Environment,
		})
	})

	// Create HTTP server
	server := createServer(router, config)

	// Start server in a goroutine
	go func() {
		logger.Info("Server starting", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("Failed to start server", "error", err)
			os.Exit(1)
		}
	}()

	logger.Info("Server started successfully", "address", server.Addr)

	// Handle graceful shutdown
	gracefulShutdown(server, logger)
}
```

And here's the corresponding `app/routes.go` file that would be imported:

```go
// app/routes.go
package app

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// InitializeRoutes sets up all application routes
func InitializeRoutes(router *gin.Engine) error {
	// API version 1 routes
	v1 := router.Group("/api/v1")
	{
		// Example routes - replace with your actual routes
		v1.GET("/users", getUsers)
		v1.POST("/users", createUser)
		v1.GET("/users/:id", getUserByID)
		v1.PUT("/users/:id", updateUser)
		v1.DELETE("/users/:id", deleteUser)
	}

	// Root route
	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "Welcome to the API",
			"version": "1.0.0",
		})
	})

	return nil
}

// Example handler functions - replace with your actual handlers
func getUsers(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"users": []string{}})
}

func createUser(c *gin.Context) {
	c.JSON(http.StatusCreated, gin.H{"message": "User created"})
}

func getUserByID(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"user_id": id})
}

func updateUser(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"message": "User updated", "user_id": id})
}

func deleteUser(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"message": "User deleted", "user_id": id})
}
```

And the `go.mod` file:

```go
// go.mod
module github.com/your-project

go 1.21

require (
    github.com/gin-contrib/cors v1.4.0
    github.com/gin-gonic/gin v1.9.1
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

## Key Features:

1. **Environment-based Configuration**: Supports development and production modes
2. **Graceful Shutdown**: Handles SIGTERM and SIGINT signals properly
3. **Structured Logging**: Uses Go's built-in `log/slog` package
4. **CORS Support**: Configurable CORS middleware
5. **Health Check**: Built-in `/health` endpoint
6. **Timeout Configuration**: Proper HTTP server timeouts
7. **Error Handling**: Comprehensive error handling throughout
8. **Container Ready**: Binds to 0.0.0.0 for container compatibility
9. **Modular Design**: Routes are organized in separate package
10. **Production Ready**: Includes all necessary middleware and configurations

## Usage:

```bash
# Install dependencies
go mod tidy

# Run in development
go run main.go

# Run in production
ENVIRONMENT=production PORT=8080 go run main.go

# Build for production
go build -o app main.go
./app
```

This implementation provides a robust, FastAPI-equivalent foundation for Go web applications with proper production considerations.