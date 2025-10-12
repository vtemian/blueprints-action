package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"your-module/app" // Replace with your actual module path
)

// Config holds the server configuration
type Config struct {
	Host         string
	Port         int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
	Environment  string
}

// loadConfig loads configuration from environment variables with sensible defaults
func loadConfig() *Config {
	config := &Config{
		Host:         getEnv("HOST", "0.0.0.0"),
		Port:         getEnvAsInt("PORT", 8000),
		ReadTimeout:  getEnvAsDuration("READ_TIMEOUT", 10*time.Second),
		WriteTimeout: getEnvAsDuration("WRITE_TIMEOUT", 10*time.Second),
		IdleTimeout:  getEnvAsDuration("IDLE_TIMEOUT", 60*time.Second),
		Environment:  getEnv("ENVIRONMENT", "development"),
	}
	return config
}

// getEnv gets an environment variable with a fallback default
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvAsInt gets an environment variable as integer with a fallback default
func getEnvAsInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
		log.Printf("Warning: Invalid integer value for %s, using default %d", key, defaultValue)
	}
	return defaultValue
}

// getEnvAsDuration gets an environment variable as duration with a fallback default
func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
		log.Printf("Warning: Invalid duration value for %s, using default %v", key, defaultValue)
	}
	return defaultValue
}

// setupLogger configures logging based on environment
func setupLogger(env string) {
	if env == "production" {
		// In production, you might want to use structured logging
		log.SetFlags(log.LstdFlags | log.LUTC)
	} else {
		// Development logging with more verbose output
		log.SetFlags(log.LstdFlags | log.Lshortfile)
	}
}

func main() {
	// Load configuration
	config := loadConfig()
	
	// Setup logging
	setupLogger(config.Environment)
	
	// Initialize the application handler
	// Assuming the app package exports a Handler or Router function
	handler, err := app.NewHandler(config.Environment)
	if err != nil {
		log.Fatalf("Failed to initialize application handler: %v", err)
	}
	
	// Create HTTP server with timeouts
	server := &http.Server{
		Addr:         fmt.Sprintf("%s:%d", config.Host, config.Port),
		Handler:      handler,
		ReadTimeout:  config.ReadTimeout,
		WriteTimeout: config.WriteTimeout,
		IdleTimeout:  config.IdleTimeout,
		ErrorLog:     log.Default(),
	}
	
	// Channel to listen for interrupt signals
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	
	// Start server in a goroutine
	go func() {
		log.Printf("Starting HTTP server on %s (environment: %s)", server.Addr, config.Environment)
		
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()
	
	// Wait for interrupt signal
	<-quit
	log.Println("Shutting down server...")
	
	// Create a context with timeout for graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	// Attempt graceful shutdown
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
		return
	}
	
	log.Println("Server gracefully stopped")
}