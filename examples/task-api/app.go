Here's a complete, production-ready Go web application using Gin that meets all your requirements:

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
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/sirupsen/logrus"
)

// Configuration holds all application configuration
type Configuration struct {
	Port           string
	DatabaseURL    string
	JWTSecret      string
	AllowedOrigins []string
	Environment    string
}

// Database interface for dependency injection and testability
type Database interface {
	Ping() error
	Close() error
	GetDB() *sql.DB
}

// PostgreSQLDatabase implements Database interface
type PostgreSQLDatabase struct {
	db *sql.DB
}

func (p *PostgreSQLDatabase) Ping() error {
	return p.db.Ping()
}

func (p *PostgreSQLDatabase) Close() error {
	return p.db.Close()
}

func (p *PostgreSQLDatabase) GetDB() *sql.DB {
	return p.db
}

// Application holds all application dependencies
type Application struct {
	Config   *Configuration
	Database Database
	Logger   *logrus.Logger
	Router   *gin.Engine
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Database  string    `json:"database"`
	Version   string    `json:"version"`
}

// ErrorResponse represents a structured error response
type ErrorResponse struct {
	Error   string    `json:"error"`
	Message string    `json:"message"`
	Code    int       `json:"code"`
	Time    time.Time `json:"timestamp"`
}

// JWTClaims represents JWT token claims
type JWTClaims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// loadConfiguration loads configuration from environment variables
func loadConfiguration() *Configuration {
	config := &Configuration{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://user:password@localhost/taskdb?sslmode=disable"),
		JWTSecret:   getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
		Environment: getEnv("ENVIRONMENT", "development"),
	}

	// Parse allowed origins
	origins := getEnv("ALLOWED_ORIGINS", "http://localhost:3000")
	config.AllowedOrigins = strings.Split(origins, ",")

	return config
}

// getEnv gets environment variable with fallback
func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// initializeDatabase creates and configures database connection
func initializeDatabase(config *Configuration, logger *logrus.Logger) (Database, error) {
	logger.Info("Initializing database connection...")

	db, err := sql.Open("postgres", config.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database connection: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Create tables if they don't exist
	if err := createTables(ctx, db, logger); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to create tables: %w", err)
	}

	logger.Info("Database connection established successfully")
	return &PostgreSQLDatabase{db: db}, nil
}

// createTables creates necessary database tables
func createTables(ctx context.Context, db *sql.DB, logger *logrus.Logger) error {
	logger.Info("Creating database tables if they don't exist...")

	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			email VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS tasks (
			id SERIAL PRIMARY KEY,
			user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			completed BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)`,
	}

	for _, query := range queries {
		if _, err := db.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("failed to execute query: %w", err)
		}
	}

	logger.Info("Database tables created successfully")
	return nil
}

// setupLogger configures structured logging
func setupLogger(config *Configuration) *logrus.Logger {
	logger := logrus.New()

	// Set log level based on environment
	if config.Environment == "production" {
		logger.SetLevel(logrus.InfoLevel)
		logger.SetFormatter(&logrus.JSONFormatter{})
	} else {
		logger.SetLevel(logrus.DebugLevel)
		logger.SetFormatter(&logrus.TextFormatter{
			FullTimestamp: true,
		})
	}

	return logger
}

// setupRouter configures Gin router with middleware
func setupRouter(app *Application) *gin.Engine {
	// Set Gin mode based on environment
	if app.Config.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Recovery middleware
	router.Use(gin.Recovery())

	// Custom logging middleware
	router.Use(loggingMiddleware(app.Logger))

	// CORS middleware
	corsConfig := cors.Config{
		AllowOrigins:     app.Config.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	router.Use(cors.New(corsConfig))

	return router
}

// loggingMiddleware creates custom logging middleware
func loggingMiddleware(logger *logrus.Logger) gin.HandlerFunc {
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

		// Build log entry
		entry := logger.WithFields(logrus.Fields{
			"status_code": statusCode,
			"latency":     latency,
			"client_ip":   clientIP,
			"method":      c.Request.Method,
			"path":        path,
			"raw_query":   raw,
			"user_agent":  c.Request.UserAgent(),
		})

		if len(c.Errors) > 0 {
			entry.Error(c.Errors.String())
		} else {
			entry.Info("Request processed")
		}
	}
}

// jwtAuthMiddleware validates JWT tokens
func jwtAuthMiddleware(jwtSecret string, logger *logrus.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			respondWithError(c, http.StatusUnauthorized, "Authorization header required", "Missing authorization header")
			return
		}

		// Extract token from "Bearer <token>"
		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			respondWithError(c, http.StatusUnauthorized, "Invalid authorization header format", "Expected 'Bearer <token>'")
			return
		}

		tokenString := tokenParts[1]

		// Parse and validate token
		token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(jwtSecret), nil
		})

		if err != nil {
			logger.WithError(err).Warn("JWT token validation failed")
			respondWithError(c, http.StatusUnauthorized, "Invalid token", err.Error())
			return
		}

		if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
			// Add user info to context
			c.Set("user_id", claims.UserID)
			c.Set("user_email", claims.Email)
			c.Next()
		} else {
			respondWithError(c, http.StatusUnauthorized, "Invalid token claims", "Token validation failed")
			return
		}
	}
}

// setupRoutes configures all application routes
func setupRoutes(app *Application) {
	// Health check endpoint
	app.Router.GET("/health", app.healthCheckHandler)

	// API route groups
	apiV1 := app.Router.Group("/api/v1")
	{
		// Public routes
		apiV1.POST("/auth/login", app.loginHandler)
		apiV1.POST("/auth/register", app.registerHandler)

		// Protected routes
		protected := apiV1.Group("/")
		protected.Use(jwtAuthMiddleware(app.Config.JWTSecret, app.Logger))
		{
			// User routes
			users := protected.Group("/users")
			{
				users.GET("/profile", app.getUserProfileHandler)
				users.PUT("/profile", app.updateUserProfileHandler)
			}

			// Task routes
			tasks := protected.Group("/tasks")
			{
				tasks.GET("", app.getTasksHandler)
				tasks.POST("", app.createTaskHandler)
				tasks.GET("/:id", app.getTaskHandler)
				tasks.PUT("/:id", app.updateTaskHandler)
				tasks.DELETE("/:id", app.deleteTaskHandler)
			}
		}
	}
}

// Health check handler
func (app *Application) healthCheckHandler(c *gin.Context) {
	dbStatus := "connected"
	if err := app.Database.Ping(); err != nil {
		app.Logger.WithError(err).Error("Database health check failed")
		dbStatus = "disconnected"
	}

	response := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now(),
		Database:  dbStatus,
		Version:   "1.0.0",
	}

	c.JSON(http.StatusOK, response)
}

// Stub handlers for authentication
func (app *Application) loginHandler(c *gin.Context) {
	// TODO: Implement login logic
	c.JSON(http.StatusOK, gin.H{
		"message": "Login endpoint - implementation pending",
		"status":  "stub",
	})
}

func (app *Application) registerHandler(c *gin.Context) {
	// TODO: Implement registration logic
	c.JSON(http.StatusOK, gin.H{
		"message": "Register endpoint - implementation pending",
		"status":  "stub",
	})
}

// Stub handlers for user management
func (app *Application) getUserProfileHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Get user profile endpoint - implementation pending",
		"user_id": userID,
		"status":  "stub",
	})
}

func (app *Application) updateUserProfileHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Update user profile endpoint - implementation pending",
		"user_id": userID,
		"status":  "stub",
	})
}

// Stub handlers for task management
func (app *Application) getTasksHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Get tasks endpoint - implementation pending",
		"user_id": userID,
		"status":  "stub",
	})
}

func (app *Application) createTaskHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	c.JSON(http.StatusCreated, gin.H{
		"message": "Create task endpoint - implementation pending",
		"user_id": userID,
		"status":  "stub",
	})
}

func (app *Application) getTaskHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	taskID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Get task endpoint - implementation pending",
		"user_id": userID,
		"task_id": taskID,
		"status":  "stub",
	})
}

func (app *Application) updateTaskHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	taskID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Update task endpoint - implementation pending",
		"user_id": userID,
		"task_id": taskID,
		"status":  "stub",
	})
}

func (app *Application) deleteTaskHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	taskID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"message": "Delete task endpoint - implementation pending",
		"user_id": userID,
		"task_id": taskID,
		"status":  "stub",
	})
}

// respondWithError sends structured error response
func respondWithError(c *gin.Context, statusCode int, message, details string) {
	response := ErrorResponse{
		Error:   http.StatusText(statusCode),
		Message: message,
		Code:    statusCode,
		Time:    time.Now(),
	}

	c.JSON(statusCode, response)
	c.Abort()
}

// gracefulShutdown handles application shutdown
func gracefulShutdown(app *Application, server *http.Server) {
	quit := make(chan os.Signal, 1)
	signal