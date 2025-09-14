Here's a complete Go implementation of a web API application using the Gin framework based on your FastAPI specification:

```go
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq" // PostgreSQL driver
)

// Application constants
const (
	AppTitle   = "Task Management API"
	AppVersion = "1.0.0"
)

// Configuration holds application configuration
type Config struct {
	DatabaseURL string
	JWTSecret   string
	Port        string
	Environment string
}

// Application holds the application state
type Application struct {
	config *Config
	db     *sql.DB
	router *gin.Engine
}

// Claims represents JWT claims structure
type Claims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

// HealthResponse represents health check response
type HealthResponse struct {
	Status    string `json:"status"`
	Version   string `json:"version"`
	Database  string `json:"database"`
	Timestamp string `json:"timestamp"`
}

// ErrorResponse represents API error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	Code    int    `json:"code"`
}

func main() {
	// Load configuration
	config := loadConfig()

	// Initialize application
	app, err := newApplication(config)
	if err != nil {
		log.Fatalf("Failed to initialize application: %v", err)
	}
	defer app.cleanup()

	// Setup router and middleware
	app.setupRouter()
	app.setupMiddleware()
	app.setupRoutes()

	// Start server with graceful shutdown
	app.startServer()
}

// loadConfig loads configuration from environment variables
func loadConfig() *Config {
	return &Config{
		DatabaseURL: getEnv("DATABASE_URL", "postgres://localhost/taskdb?sslmode=disable"),
		JWTSecret:   getEnv("JWT_SECRET", "your-secret-key"),
		Port:        getEnv("PORT", "8080"),
		Environment: getEnv("GIN_MODE", "debug"),
	}
}

// getEnv gets environment variable with fallback
func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// newApplication creates a new application instance
func newApplication(config *Config) (*Application, error) {
	// Set Gin mode
	gin.SetMode(config.Environment)

	// Initialize database connection
	db, err := initDatabase(config.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("database initialization failed: %w", err)
	}

	return &Application{
		config: config,
		db:     db,
		router: gin.New(),
	}, nil
}

// initDatabase initializes database connection with pooling
func initDatabase(databaseURL string) (*sql.DB, error) {
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

	log.Println("Database connection established successfully")
	return db, nil
}

// setupRouter configures the Gin router with basic middleware
func (app *Application) setupRouter() {
	// Add recovery middleware
	app.router.Use(gin.Recovery())

	// Add custom logger middleware
	app.router.Use(gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		return fmt.Sprintf("%s - [%s] \"%s %s %s %d %s \"%s\" %s\"\n",
			param.ClientIP,
			param.TimeStamp.Format(time.RFC1123),
			param.Method,
			param.Path,
			param.Request.Proto,
			param.StatusCode,
			param.Latency,
			param.Request.UserAgent(),
			param.ErrorMessage,
		)
	}))
}

// setupMiddleware configures application middleware
func (app *Application) setupMiddleware() {
	// CORS middleware
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{"http://localhost:3000"}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
	corsConfig.AllowCredentials = true
	app.router.Use(cors.New(corsConfig))

	// Custom error handling middleware
	app.router.Use(app.errorHandlerMiddleware())
}

// setupRoutes configures application routes
func (app *Application) setupRoutes() {
	// Health check endpoint
	app.router.GET("/health", app.healthCheckHandler)

	// API route groups
	api := app.router.Group("/api")
	{
		// Task routes (protected)
		tasks := api.Group("/tasks")
		tasks.Use(app.jwtAuthMiddleware())
		{
			tasks.GET("", app.getTasksHandler)
			tasks.POST("", app.createTaskHandler)
			tasks.GET("/:id", app.getTaskHandler)
			tasks.PUT("/:id", app.updateTaskHandler)
			tasks.DELETE("/:id", app.deleteTaskHandler)
		}

		// User routes
		users := api.Group("/users")
		{
			users.POST("/register", app.registerHandler)
			users.POST("/login", app.loginHandler)
			
			// Protected user routes
			protected := users.Group("")
			protected.Use(app.jwtAuthMiddleware())
			{
				protected.GET("/profile", app.getProfileHandler)
				protected.PUT("/profile", app.updateProfileHandler)
			}
		}
	}
}

// jwtAuthMiddleware validates JWT tokens
func (app *Application) jwtAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "unauthorized",
				Message: "Authorization header required",
				Code:    http.StatusUnauthorized,
			})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		tokenString := ""
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			tokenString = authHeader[7:]
		} else {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "unauthorized",
				Message: "Invalid authorization header format",
				Code:    http.StatusUnauthorized,
			})
			c.Abort()
			return
		}

		// Parse and validate token
		token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(app.config.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "unauthorized",
				Message: "Invalid or expired token",
				Code:    http.StatusUnauthorized,
			})
			c.Abort()
			return
		}

		// Extract claims and set user context
		if claims, ok := token.Claims.(*Claims); ok {
			c.Set("user_id", claims.UserID)
		}

		c.Next()
	}
}

// errorHandlerMiddleware handles panics and errors
func (app *Application) errorHandlerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("Panic recovered: %v", err)
				c.JSON(http.StatusInternalServerError, ErrorResponse{
					Error:   "internal_server_error",
					Message: "An unexpected error occurred",
					Code:    http.StatusInternalServerError,
				})
				c.Abort()
			}
		}()
		c.Next()
	}
}

// healthCheckHandler handles health check requests
func (app *Application) healthCheckHandler(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	// Check database connectivity
	dbStatus := "healthy"
	if err := app.db.PingContext(ctx); err != nil {
		dbStatus = "unhealthy"
		log.Printf("Database health check failed: %v", err)
	}

	response := HealthResponse{
		Status:    "healthy",
		Version:   AppVersion,
		Database:  dbStatus,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	// Return 503 if database is unhealthy
	if dbStatus == "unhealthy" {
		response.Status = "unhealthy"
		c.JSON(http.StatusServiceUnavailable, response)
		return
	}

	c.JSON(http.StatusOK, response)
}

// Placeholder handlers for API endpoints
func (app *Application) getTasksHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Get tasks endpoint",
		"user_id": userID,
	})
}

func (app *Application) createTaskHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	c.JSON(http.StatusCreated, gin.H{
		"message": "Create task endpoint",
		"user_id": userID,
	})
}

func (app *Application) getTaskHandler(c *gin.Context) {
	taskID := c.Param("id")
	userID := c.GetString("user_id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Get task endpoint",
		"task_id": taskID,
		"user_id": userID,
	})
}

func (app *Application) updateTaskHandler(c *gin.Context) {
	taskID := c.Param("id")
	userID := c.GetString("user_id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Update task endpoint",
		"task_id": taskID,
		"user_id": userID,
	})
}

func (app *Application) deleteTaskHandler(c *gin.Context) {
	taskID := c.Param("id")
	userID := c.GetString("user_id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Delete task endpoint",
		"task_id": taskID,
		"user_id": userID,
	})
}

func (app *Application) registerHandler(c *gin.Context) {
	c.JSON(http.StatusCreated, gin.H{
		"message": "User registration endpoint",
	})
}

func (app *Application) loginHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "User login endpoint",
	})
}

func (app *Application) getProfileHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Get profile endpoint",
		"user_id": userID,
	})
}

func (app *Application) updateProfileHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Update profile endpoint",
		"user_id": userID,
	})
}

// startServer starts the HTTP server with graceful shutdown
func (app *Application) startServer() {
	server := &http.Server{
		Addr:         ":" + app.config.Port,
		Handler:      app.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		log.Printf("Starting %s v%s on port %s", AppTitle, AppVersion, app.config.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Create shutdown context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Shutdown server
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}

// cleanup closes database connections and performs cleanup
func (app *Application) cleanup() {
	if app.db != nil {
		log.Println("Closing database connections...")
		if err := app.db.Close(); err != nil {
			log.Printf("Error closing database: %v", err)
		}
	}
}
```

This implementation includes:

**Key Features:**
- Complete Gin web framework setup with middleware
- JWT authentication middleware for protected routes
- CORS configuration for localhost:3000
- Database connection pooling with PostgreSQL
- Health check endpoint with database status
- Graceful shutdown with signal handling
- Structured error handling and logging

**Required Dependencies (go.mod):**
```go
module your-app-name

go 1.21

require (
    github.com/gin-contrib/cors v1.4.0
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/lib/pq v1.10.9
)
```

**Environment Variables:**
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT signing
- `PORT`: Server port (default: 8080)
- `GIN_MODE`: Gin mode (debug/release)

The code follows Go best practices with proper error handling, context usage, and production-ready configuration. All API endpoints are structured as placeholder handlers that can be implemented with your specific business logic.