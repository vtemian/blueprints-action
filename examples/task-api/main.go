Here's a production-ready Go HTTP server entry point using the Gin framework:

## main.go

```go
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

	"github.com/gin-gonic/gin"

	"your-module-name/app"
)

const (
	defaultPort         = "8000"
	defaultHost         = "0.0.0.0"
	shutdownTimeout     = 30 * time.Second
	readHeaderTimeout   = 10 * time.Second
	readTimeout         = 30 * time.Second
	writeTimeout        = 30 * time.Second
	idleTimeout         = 60 * time.Second
)

// Config holds server configuration
type Config struct {
	Host string
	Port string
	Env  string
}

// loadConfig loads configuration from environment variables with defaults
func loadConfig() *Config {
	config := &Config{
		Host: getEnv("HOST", defaultHost),
		Port: getEnv("PORT", defaultPort),
		Env:  getEnv("GIN_MODE", "debug"),
	}

	// Validate port
	if port, err := strconv.Atoi(config.Port); err != nil || port < 1 || port > 65535 {
		slog.Error("Invalid port number", "port", config.Port)
		os.Exit(1)
	}

	return config
}

// getEnv gets environment variable with fallback to default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// setupLogger configures structured logging
func setupLogger(env string) {
	var logger *slog.Logger
	
	if env == "release" {
		logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelInfo,
		}))
	} else {
		logger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))
	}
	
	slog.SetDefault(logger)
}

// createServer creates and configures the HTTP server
func createServer(config *Config) *http.Server {
	// Set Gin mode based on environment
	gin.SetMode(config.Env)

	// Create Gin router
	router := gin.New()

	// Add middleware
	router.Use(gin.Logger())
	router.Use(gin.Recovery())

	// Add CORS middleware for development
	if config.Env != "release" {
		router.Use(func(c *gin.Context) {
			c.Header("Access-Control-Allow-Origin", "*")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
			
			if c.Request.Method == "OPTIONS" {
				c.AbortWithStatus(http.StatusNoContent)
				return
			}
			
			c.Next()
		})
	}

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"version":   getEnv("APP_VERSION", "dev"),
		})
	})

	// Register application routes
	app.RegisterRoutes(router)

	// Create HTTP server with timeouts
	server := &http.Server{
		Addr:              fmt.Sprintf("%s:%s", config.Host, config.Port),
		Handler:           router,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}

	return server
}

// gracefulShutdown handles server shutdown gracefully
func gracefulShutdown(server *http.Server) {
	// Create channel to listen for interrupt signals
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Block until signal is received
	sig := <-quit
	slog.Info("Received shutdown signal", "signal", sig.String())

	// Create context with timeout for shutdown
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	// Attempt graceful shutdown
	slog.Info("Shutting down server gracefully", "timeout", shutdownTimeout.String())
	
	if err := server.Shutdown(ctx); err != nil {
		slog.Error("Server forced to shutdown", "error", err)
		os.Exit(1)
	}

	slog.Info("Server shutdown complete")
}

func main() {
	// Load configuration
	config := loadConfig()

	// Setup logging
	setupLogger(config.Env)

	slog.Info("Starting server", 
		"host", config.Host, 
		"port", config.Port, 
		"env", config.Env,
	)

	// Create server
	server := createServer(config)

	// Start graceful shutdown handler in goroutine
	go gracefulShutdown(server)

	// Start server
	slog.Info("Server listening", "address", server.Addr)
	
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("Failed to start server", "error", err)
		os.Exit(1)
	}
}
```

## Supporting Files

### go.mod
```go
module your-module-name

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
)
```

### app/routes.go (example app package)
```go
package app

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RegisterRoutes registers all application routes
func RegisterRoutes(router *gin.Engine) {
	// API version group
	v1 := router.Group("/api/v1")
	{
		v1.GET("/ping", pingHandler)
		// Add more routes here
	}

	// Static routes or other route groups can be added here
}

// pingHandler handles ping requests
func pingHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "pong",
	})
}
```

### Dockerfile (optional)
```dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/

COPY --from=builder /app/main .

EXPOSE 8000

CMD ["./main"]
```

### docker-compose.yml (optional)
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - GIN_MODE=release
      - HOST=0.0.0.0
      - PORT=8000
    restart: unless-stopped
```

## Key Features

1. **Environment Configuration**: Uses environment variables with sensible defaults
2. **Graceful Shutdown**: Properly handles SIGINT/SIGTERM with configurable timeout
3. **Structured Logging**: Uses Go's built-in `slog` package for structured logging
4. **Production Ready**: Includes proper timeouts, error handling, and security considerations
5. **Health Check**: Built-in health check endpoint at `/health`
6. **CORS Support**: Development-friendly CORS middleware
7. **Modular Design**: Routes are organized in a separate app package
8. **Container Ready**: Configured for containerized deployments

## Usage

```bash
# Development
go run main.go

# Production build
go build -o server main.go
./server

# With environment variables
HOST=127.0.0.1 PORT=3000 GIN_MODE=release ./server
```

This implementation provides a robust, production-ready HTTP server entry point that's equivalent to a FastAPI application with proper Go idioms and best practices.