Here's a complete Go web application entry point that mirrors a FastAPI application structure:

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

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/logger"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"

	"your-project/app" // Replace with your actual module path
)

const (
	// Server configuration constants
	defaultPort         = "8000"
	defaultHost         = "0.0.0.0"
	shutdownTimeout     = 30 * time.Second
	readTimeout         = 10 * time.Second
	writeTimeout        = 10 * time.Second
	idleTimeout         = 60 * time.Second
	readHeaderTimeout   = 5 * time.Second
)

func main() {
	// Initialize logger
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	logger := zerolog.New(os.Stdout).With().Timestamp().Logger()

	// Get configuration from environment variables with defaults
	port := getEnv("PORT", defaultPort)
	host := getEnv("HOST", defaultHost)
	
	// Set Gin mode based on environment
	if getEnv("GIN_MODE", "debug") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create Gin router with recovery middleware
	router := gin.New()
	
	// Add middleware
	setupMiddleware(router, logger)
	
	// Setup application routes from app package
	app.SetupRoutes(router)

	// Configure HTTP server
	server := &http.Server{
		Addr:              fmt.Sprintf("%s:%s", host, port),
		Handler:           router,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		ReadHeaderTimeout: readHeaderTimeout,
	}

	// Start server in a goroutine
	go func() {
		logger.Info().
			Str("host", host).
			Str("port", port).
			Msg("Starting HTTP server")
		
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().
				Err(err).
				Msg("Failed to start server")
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info().Msg("Shutting down server...")

	// Create context with timeout for graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	// Attempt graceful shutdown
	if err := server.Shutdown(ctx); err != nil {
		logger.Error().
			Err(err).
			Msg("Server forced to shutdown")
		os.Exit(1)
	}

	logger.Info().Msg("Server exited")
}

// setupMiddleware configures all middleware for the application
func setupMiddleware(router *gin.Engine, logger zerolog.Logger) {
	// Recovery middleware recovers from any panics and writes a 500
	router.Use(gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		if err, ok := recovered.(string); ok {
			logger.Error().
				Str("error", err).
				Str("path", c.Request.URL.Path).
				Msg("Panic recovered")
		}
		c.AbortWithStatus(http.StatusInternalServerError)
	}))

	// Request logging middleware
	router.Use(logger.RequestLogger(&logger))

	// CORS middleware for cross-origin requests
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"}, // Configure appropriately for production
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Custom middleware for request ID and common headers
	router.Use(func(c *gin.Context) {
		// Add request ID for tracing
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = generateRequestID()
		}
		c.Header("X-Request-ID", requestID)
		
		// Security headers
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		
		c.Next()
	})

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"timestamp": time.Now().UTC(),
			"version":   getEnv("APP_VERSION", "development"),
		})
	})
}

// getEnv gets an environment variable with a fallback default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// generateRequestID creates a simple request ID for tracing
func generateRequestID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
```

## app/routes.go

```go
package app

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// SetupRoutes configures all application routes
func SetupRoutes(router *gin.Engine) {
	// API version 1 routes
	v1 := router.Group("/api/v1")
	{
		// Example routes - replace with your actual routes
		v1.GET("/", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"message": "Welcome to the API",
				"version": "1.0.0",
			})
		})

		// Example resource routes
		v1.GET("/users", getUsers)
		v1.POST("/users", createUser)
		v1.GET("/users/:id", getUserByID)
		v1.PUT("/users/:id", updateUser)
		v1.DELETE("/users/:id", deleteUser)
	}

	// Static file serving (optional)
	router.Static("/static", "./static")
	
	// Catch-all route for undefined endpoints
	router.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{
			"error":   "Not Found",
			"message": "The requested endpoint does not exist",
			"path":    c.Request.URL.Path,
		})
	})
}

// Example handler functions - replace with your actual handlers
func getUsers(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"users": []gin.H{
			{"id": 1, "name": "John Doe", "email": "john@example.com"},
			{"id": 2, "name": "Jane Smith", "email": "jane@example.com"},
		},
	})
}

func createUser(c *gin.Context) {
	var user struct {
		Name  string `json:"name" binding:"required"`
		Email string `json:"email" binding:"required,email"`
	}

	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Validation Error",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "User created successfully",
		"user":    user,
	})
}

func getUserByID(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":    id,
			"name":  "John Doe",
			"email": "john@example.com",
		},
	})
}

func updateUser(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"message": "User updated successfully",
		"id":      id,
	})
}

func deleteUser(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"message": "User deleted successfully",
		"id":      id,
	})
}
```

## go.mod

```go
module your-project

go 1.21

require (
	github.com/gin-contrib/cors v1.4.0
	github.com/gin-contrib/logger v0.2.6
	github.com/gin-gonic/gin v1.9.1
	github.com/rs/zerolog v1.31.0
)
```

## Dockerfile (Optional)

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

## Key Features:

1. **Graceful Shutdown**: Handles SIGINT/SIGTERM signals with configurable timeout
2. **Middleware Stack**: Recovery, logging, CORS, security headers
3. **Configuration**: Environment variable support with sensible defaults
4. **Health Check**: Built-in `/health` endpoint for monitoring
5. **Request Tracing**: Request ID generation and propagation
6. **Error Handling**: Comprehensive error handling with proper HTTP status codes
7. **Production Ready**: Timeouts, security headers, and structured logging
8. **Modular Structure**: Routes separated into app package for better organization

## Environment Variables:

- `PORT`: Server port (default: 8000)
- `HOST`: Server host (default: 0.0.0.0)
- `GIN_MODE`: Gin mode (debug/release)
- `APP_VERSION`: Application version for health checks

This structure provides a solid foundation for a production-ready Go web application that mirrors FastAPI's capabilities and conventions.