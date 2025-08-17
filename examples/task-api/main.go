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

	"./app"
)

const (
	// Server configuration constants
	defaultPort         = "8000"
	defaultHost         = "0.0.0.0"
	shutdownTimeout     = 30 * time.Second
	readTimeout         = 15 * time.Second
	writeTimeout        = 15 * time.Second
	idleTimeout         = 60 * time.Second
	readHeaderTimeout   = 5 * time.Second
)

func main() {
	// Initialize structured logger
	logger := log.New(os.Stdout, "[SERVER] ", log.LstdFlags|log.Lshortfile)
	
	// Get configuration from environment variables with defaults
	port := getEnv("PORT", defaultPort)
	host := getEnv("HOST", defaultHost)
	addr := fmt.Sprintf("%s:%s", host, port)

	// Initialize the application router/handler from the app package
	handler := app.NewRouter()
	
	// Apply middleware for logging and other cross-cutting concerns
	wrappedHandler := loggingMiddleware(handler, logger)

	// Configure HTTP server with production-ready settings
	server := &http.Server{
		Addr:              addr,
		Handler:           wrappedHandler,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		ReadHeaderTimeout: readHeaderTimeout,
		ErrorLog:          logger,
	}

	// Create a channel to listen for interrupt signals
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Start server in a goroutine
	go func() {
		logger.Printf("Starting HTTP server on %s", addr)
		logger.Printf("Server configuration: ReadTimeout=%v, WriteTimeout=%v, IdleTimeout=%v", 
			readTimeout, writeTimeout, idleTimeout)
		
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Failed to start server: %v", err)
		}
	}()

	logger.Println("Server started successfully. Press Ctrl+C to shutdown...")

	// Block until we receive a shutdown signal
	<-quit
	logger.Println("Shutdown signal received, initiating graceful shutdown...")

	// Create a context with timeout for graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	// Attempt graceful shutdown
	if err := server.Shutdown(ctx); err != nil {
		logger.Printf("Server forced to shutdown due to error: %v", err)
		
		// Force close if graceful shutdown fails
		if closeErr := server.Close(); closeErr != nil {
			logger.Printf("Error during server close: %v", closeErr)
		}
		os.Exit(1)
	}

	logger.Println("Server shutdown completed successfully")
}

// getEnv retrieves environment variable with fallback to default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// loggingMiddleware provides request/response logging
func loggingMiddleware(next http.Handler, logger *log.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		
		// Create a response writer wrapper to capture status code
		wrapped := &responseWriter{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}
		
		// Log incoming request
		logger.Printf("Started %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		
		// Call the next handler
		next.ServeHTTP(wrapped, r)
		
		// Log completed request
		duration := time.Since(start)
		logger.Printf("Completed %s %s - Status: %d - Duration: %v", 
			r.Method, r.URL.Path, wrapped.statusCode, duration)
	})
}

// responseWriter wraps http.ResponseWriter to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

// WriteHeader captures the status code
func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// Write ensures status code is set if WriteHeader wasn't called
func (rw *responseWriter) Write(b []byte) (int, error) {
	return rw.ResponseWriter.Write(b)
}

// Health check and basic error handling utilities
func init() {
	// Validate that the app package is available
	// This will cause a compile-time error if the app package doesn't exist
	// or doesn't export the required NewRouter function
	
	// Set up any global configurations here
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}