I'll create a complete Go web application that mirrors FastAPI functionality with proper Go idioms and best practices.

## Project Structure

```
task-management-api/
├── go.mod
├── go.sum
├── main.go
├── .env.example
├── app/
│   ├── config.go
│   ├── server.go
│   └── container.go
├── internal/
│   ├── api/
│   │   ├── tasks/
│   │   │   └── handler.go
│   │   └── users/
│   │       └── handler.go
│   ├── core/
│   │   ├── auth/
│   │   │   └── jwt.go
│   │   └── database/
│   │       └── connection.go
│   └── middleware/
│       ├── cors.go
│       ├── auth.go
│       └── recovery.go
└── tests/
    └── app_test.go
```

## go.mod

```go
module task-management-api

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/sirupsen/logrus v1.9.3
    github.com/spf13/viper v1.16.0
    github.com/stretchr/testify v1.8.4
    gorm.io/driver/postgres v1.5.2
    gorm.io/gorm v1.25.4
)
```

## .env.example

```env
# Server Configuration
SERVER_HOST=localhost
SERVER_PORT=8080
SERVER_READ_TIMEOUT=30s
SERVER_WRITE_TIMEOUT=30s

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=taskmanagement
DB_SSL_MODE=disable

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRY=24h

# CORS Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Logging
LOG_LEVEL=info
```

## main.go

```go
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"task-management-api/app"

	"github.com/sirupsen/logrus"
)

func main() {
	// Initialize logger
	logger := logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{})
	
	// Load configuration
	config, err := app.LoadConfig()
	if err != nil {
		logger.WithError(err).Fatal("Failed to load configuration")
	}

	// Set log level
	level, err := logrus.ParseLevel(config.LogLevel)
	if err != nil {
		logger.WithError(err).Warn("Invalid log level, using info")
		level = logrus.InfoLevel
	}
	logger.SetLevel(level)

	// Create dependency container
	container, err := app.NewContainer(config, logger)
	if err != nil {
		logger.WithError(err).Fatal("Failed to create dependency container")
	}
	defer container.Close()

	// Create and configure server
	server, err := app.NewServer(config, container, logger)
	if err != nil {
		logger.WithError(err).Fatal("Failed to create server")
	}

	// Start server in goroutine
	go func() {
		logger.WithFields(logrus.Fields{
			"host": config.Server.Host,
			"port": config.Server.Port,
		}).Info("Starting Task Management API server")
		
		if err := server.Start(); err != nil {
			logger.WithError(err).Fatal("Server failed to start")
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Create shutdown context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.WithError(err).Error("Server forced to shutdown")
	} else {
		logger.Info("Server shutdown complete")
	}
}
```

## app/config.go

```go
package app

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

// Config holds all application configuration
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	JWT      JWTConfig      `mapstructure:"jwt"`
	CORS     CORSConfig     `mapstructure:"cors"`
	LogLevel string         `mapstructure:"log_level"`
}

// ServerConfig holds server-related configuration
type ServerConfig struct {
	Host         string        `mapstructure:"host"`
	Port         int           `mapstructure:"port"`
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
}

// DatabaseConfig holds database-related configuration
type DatabaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	Name     string `mapstructure:"name"`
	SSLMode  string `mapstructure:"ssl_mode"`
}

// JWTConfig holds JWT-related configuration
type JWTConfig struct {
	Secret string        `mapstructure:"secret"`
	Expiry time.Duration `mapstructure:"expiry"`
}

// CORSConfig holds CORS-related configuration
type CORSConfig struct {
	AllowedOrigins []string `mapstructure:"allowed_origins"`
}

// LoadConfig loads configuration from environment variables and config files
func LoadConfig() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")

	// Set environment variable prefix
	viper.SetEnvPrefix("")
	viper.AutomaticEnv()

	// Set defaults
	setDefaults()

	// Read config file (optional)
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	if err := validateConfig(&config); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return &config, nil
}

func setDefaults() {
	// Server defaults
	viper.SetDefault("SERVER_HOST", "localhost")
	viper.SetDefault("SERVER_PORT", 8080)
	viper.SetDefault("SERVER_READ_TIMEOUT", "30s")
	viper.SetDefault("SERVER_WRITE_TIMEOUT", "30s")

	// Database defaults
	viper.SetDefault("DB_HOST", "localhost")
	viper.SetDefault("DB_PORT", 5432)
	viper.SetDefault("DB_SSL_MODE", "disable")

	// JWT defaults
	viper.SetDefault("JWT_EXPIRY", "24h")

	// CORS defaults
	viper.SetDefault("CORS_ALLOWED_ORIGINS", []string{"http://localhost:3000"})

	// Logging defaults
	viper.SetDefault("LOG_LEVEL", "info")

	// Bind environment variables
	viper.BindEnv("server.host", "SERVER_HOST")
	viper.BindEnv("server.port", "SERVER_PORT")
	viper.BindEnv("server.read_timeout", "SERVER_READ_TIMEOUT")
	viper.BindEnv("server.write_timeout", "SERVER_WRITE_TIMEOUT")
	viper.BindEnv("database.host", "DB_HOST")
	viper.BindEnv("database.port", "DB_PORT")
	viper.BindEnv("database.user", "DB_USER")
	viper.BindEnv("database.password", "DB_PASSWORD")
	viper.BindEnv("database.name", "DB_NAME")
	viper.BindEnv("database.ssl_mode", "DB_SSL_MODE")
	viper.BindEnv("jwt.secret", "JWT_SECRET")
	viper.BindEnv("jwt.expiry", "JWT_EXPIRY")
	viper.BindEnv("cors.allowed_origins", "CORS_ALLOWED_ORIGINS")
	viper.BindEnv("log_level", "LOG_LEVEL")
}

func validateConfig(config *Config) error {
	if config.Database.User == "" {
		return fmt.Errorf("database user is required")
	}
	if config.Database.Password == "" {
		return fmt.Errorf("database password is required")
	}
	if config.Database.Name == "" {
		return fmt.Errorf("database name is required")
	}
	if config.JWT.Secret == "" {
		return fmt.Errorf("JWT secret is required")
	}
	return nil
}
```

## app/container.go

```go
package app

import (
	"fmt"

	"task-management-api/internal/api/tasks"
	"task-management-api/internal/api/users"
	"task-management-api/internal/core/auth"
	"task-management-api/internal/core/database"

	"github.com/sirupsen/logrus"
)

// Container holds all application dependencies
type Container struct {
	Config       *Config
	Logger       *logrus.Logger
	Database     database.Connection
	AuthService  auth.Service
	TasksHandler tasks.Handler
	UsersHandler users.Handler
}

// NewContainer creates a new dependency container
func NewContainer(config *Config, logger *logrus.Logger) (*Container, error) {
	container := &Container{
		Config: config,
		Logger: logger,
	}

	// Initialize database connection
	db, err := database.NewConnection(config.Database, logger)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}
	container.Database = db

	// Initialize auth service
	authService, err := auth.NewJWTService(config.JWT, logger)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize auth service: %w", err)
	}
	container.AuthService = authService

	// Initialize handlers
	container.TasksHandler = tasks.NewHandler(db, logger)
	container.UsersHandler = users.NewHandler(db, authService, logger)

	return container, nil
}

// Close closes all resources in the container
func (c *Container) Close() error {
	if c.Database != nil {
		return c.Database.Close()
	}
	return nil
}
```

## app/server.go

```go
package app

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"task-management-api/internal/middleware"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// Server represents the HTTP server
type Server struct {
	config    *Config
	container *Container
	logger    *logrus.Logger
	engine    *gin.Engine
	server    *http.Server
}

// AppInfo represents application information
type AppInfo struct {
	Title   string `json:"title"`
	Version string `json:"version"`
}

// NewServer creates a new HTTP server
func NewServer(config *Config, container *Container, logger *logrus.Logger) (*Server, error) {
	// Set Gin mode based on log level
	if config.LogLevel == "debug" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	engine := gin.New()
	
	server := &Server{
		config:    config,
		container: container,
		logger:    logger,
		engine:    engine,
	}

	// Setup middleware
	server.setupMiddleware()

	// Setup routes
	server.setupRoutes()

	// Create HTTP server
	server.server = &http.Server{
		Addr:         fmt.Sprintf("%s:%d", config.Server.Host, config.Server.Port),
		Handler:      engine,
		ReadTimeout:  config.Server.ReadTimeout,
		WriteTimeout: config.Server.WriteTimeout,
	}

	return server, nil
}

// setupMiddleware configures all middleware
func (s *Server) setupMiddleware() {
	// Recovery middleware
	s.engine.Use(middleware.Recovery(s.logger))

	// CORS middleware
	s.engine.Use(middleware.CORS(s.config.CORS))

	// Request logging middleware
	s.engine.Use(middleware.RequestLogger(s.logger))
}

// setupRoutes configures all routes
func (s *Server) setupRoutes() {
	// Health check endpoint
	s.engine.GET("/health", s.healthCheck)

	// API info endpoint
	s.engine.GET("/", s.appInfo)

	// API routes
	api := s.engine.Group("/api")
	{
		// Tasks routes
		tasks := api.Group("/tasks")
		{
			tasks.GET("", s.container.TasksHandler.GetTasks)
			tasks.POST("", middleware.JWTAuth(s.container.AuthService), s.container.TasksHandler.CreateTask)
			tasks.GET("/:id", s.container.TasksHandler.GetTask)
			tasks.PUT("/:id", middleware.JWTAuth(s.container.AuthService), s.container.TasksHandler.UpdateTask)
			tasks.DELETE("/:id", middleware.JWTAuth(s.container.AuthService), s.container.TasksHandler.DeleteTask)
		}

		// Users routes
		users := api.Group("/users")
		{
			users.POST("/register", s.container.UsersHandler.Register)
			users.POST("/login", s.container.UsersHandler.Login)
			users.GET("/profile", middleware.JWTAuth(s.container.AuthService), s.container.UsersHandler.GetProfile)
			users.PUT("/profile", middleware.JWTAuth(s.container.AuthService), s.container.UsersHandler.UpdateProfile)
		}
	}
}

// healthCheck handles health check requests
func (s *Server) healthCheck(c *gin.Context) {
	status := "healthy"
	dbStatus := "connected"

	// Check database connectivity
	if err := s.container.Database.Ping(c.Request.Context()); err != nil {
		s.logger.WithError(err).Error("Database health check failed")
		dbStatus = "disconnected"
		status = "unhealthy"
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":   status,
			"database": dbStatus,
			"error":    err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":   status,
		"database": dbStatus,
		"timestamp": time.Now().UTC(),
	})
}

// appInfo handles application info requests
func (s *Server) appInfo(c *gin.Context) {
	info := AppInfo{
		Title:   "