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

	"./app" // Import the app package containing routes and handlers
)

const (
	// Default configuration values
	defaultPort         = 8000
	defaultHost         = "0.0.0.0"
	shutdownTimeout     = 30 * time.Second
	readTimeout         = 15 * time.Second
	writeTimeout        = 15 * time.Second
	idleTimeout         = 60 * time.Second
	readHeaderTimeout   = 5 * time.Second
)

func main() {
	// Configure logging
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	
	// Get port from environment variable or use default
	port := getPortFromEnv()
	host := defaultHost
	addr := fmt.Sprintf("%s:%d", host, port)

	// Create HTTP server with production-ready configuration
	server := &http.Server{
		Addr:              addr,
		Handler:           app.NewRouter(), // Get router/handler from app package
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		ReadHeaderTimeout: readHeaderTimeout,
	}

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Channel to listen for interrupt signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Start server in a goroutine
	go func() {
		log.Printf("🚀 Starting server on http://%s", addr)
		log.Printf("📝 Server configuration:")
		log.Printf("   - Host: %s", host)
		log.Printf("   - Port: %d", port)
		log.Printf("   - Read Timeout: %v", readTimeout)
		log.Printf("   - Write Timeout: %v", writeTimeout)
		log.Printf("   - Idle Timeout: %v", idleTimeout)
		
		// Development note: For hot-reload functionality similar to uvicorn's auto-reload,
		// use 'air' tool (github.com/cosmtrek/air) during development:
		// 1. Install: go install github.com/cosmtrek/air@latest
		// 2. Run: air
		// This provides automatic restart on file changes during development
		
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("❌ Server startup failed: %v", err)
			cancel() // Cancel context to trigger shutdown
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal or context cancellation
	select {
	case sig := <-sigChan:
		log.Printf("🛑 Received signal: %v", sig)
	case <-ctx.Done():
		log.Printf("🛑 Context cancelled")
	}

	// Perform graceful shutdown
	gracefulShutdown(server)
}

// getPortFromEnv retrieves port from environment variable or returns default
func getPortFromEnv() int {
	portStr := os.Getenv("PORT")
	if portStr == "" {
		return defaultPort
	}

	port, err := strconv.Atoi(portStr)
	if err != nil {
		log.Printf("⚠️  Invalid PORT environment variable '%s', using default %d", portStr, defaultPort)
		return defaultPort
	}

	if port < 1 || port > 65535 {
		log.Printf("⚠️  PORT %d is out of valid range (1-65535), using default %d", port, defaultPort)
		return defaultPort
	}

	return port
}

// gracefulShutdown handles the graceful shutdown of the HTTP server
func gracefulShutdown(server *http.Server) {
	log.Printf("🔄 Initiating graceful shutdown...")

	// Create a context with timeout for shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer shutdownCancel()

	// Attempt graceful shutdown
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("❌ Graceful shutdown failed: %v", err)
		log.Printf("🔨 Forcing server shutdown...")
		
		// Force close if graceful shutdown fails
		if closeErr := server.Close(); closeErr != nil {
			log.Printf("❌ Force shutdown failed: %v", closeErr)
			os.Exit(1)
		}
		os.Exit(1)
	}

	log.Printf("✅ Server shutdown completed successfully")
}