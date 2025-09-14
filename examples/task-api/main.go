Here's a complete, production-ready `main.go` file that serves as an HTTP server application launcher with graceful shutdown handling:

```go
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"your-project/app" // Replace with your actual module path
)

func main() {
	// Initialize the application handler
	handler := app.NewHandler()

	// Configure the HTTP server
	server := &http.Server{
		Addr:         "0.0.0.0:8000",
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Create a channel to receive OS signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Create a context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start the server in a goroutine
	go func() {
		log.Printf("Starting HTTP server on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for termination signal
	sig := <-sigChan
	log.Printf("Received signal: %v. Initiating graceful shutdown...", sig)

	// Cancel the context to signal shutdown
	cancel()

	// Create a context with timeout for graceful shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Attempt graceful shutdown
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
		os.Exit(1)
	}

	log.Println("Server gracefully stopped")
}
```

And here's a corresponding example `app/handler.go` file to demonstrate the expected app package structure:

```go
package app

import (
	"encoding/json"
	"log"
	"net/http"
)

// Handler represents the application handler
type Handler struct {
	mux *http.ServeMux
}

// NewHandler creates and configures a new application handler
func NewHandler() *Handler {
	h := &Handler{
		mux: http.NewServeMux(),
	}

	// Register routes
	h.setupRoutes()

	return h
}

// ServeHTTP implements the http.Handler interface
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Add middleware here if needed (logging, CORS, etc.)
	h.logRequest(r)
	h.mux.ServeHTTP(w, r)
}

// setupRoutes configures all application routes
func (h *Handler) setupRoutes() {
	h.mux.HandleFunc("/", h.handleRoot)
	h.mux.HandleFunc("/health", h.handleHealth)
	h.mux.HandleFunc("/api/status", h.handleStatus)
}

// handleRoot handles requests to the root path
func (h *Handler) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	response := map[string]string{
		"message": "Welcome to the Go HTTP Server",
		"status":  "running",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleHealth handles health check requests
func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

// handleStatus handles status requests
func (h *Handler) handleStatus(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"status":    "ok",
		"timestamp": "2024-01-01T00:00:00Z", // In real app, use time.Now()
		"version":   "1.0.0",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// logRequest logs incoming HTTP requests
func (h *Handler) logRequest(r *http.Request) {
	log.Printf("%s %s %s", r.Method, r.URL.Path, r.RemoteAddr)
}
```

And here's the corresponding `go.mod` file structure:

```go
module your-project

go 1.21

// Add any external dependencies here if needed
```

## Key Features:

1. **Graceful Shutdown**: Handles `SIGINT` and `SIGTERM` signals with a 30-second timeout
2. **Production-Ready Timeouts**: Configured read, write, and idle timeouts
3. **Proper Error Handling**: Comprehensive error handling for server startup and shutdown
4. **Container Compatible**: Binds to `0.0.0.0:8000` for container deployment
5. **Clean Architecture**: Separates server configuration from application logic
6. **Context-Based**: Uses Go's context package for proper cancellation handling
7. **Logging**: Includes request logging and server lifecycle logging

## Usage:

1. Replace `"your-project/app"` with your actual module path
2. Run with: `go run main.go`
3. Test endpoints:
   - `GET http://localhost:8000/` - Root endpoint
   - `GET http://localhost:8000/health` - Health check
   - `GET http://localhost:8000/api/status` - Status endpoint

The server will start on port 8000 and can be gracefully shut down with `Ctrl+C` or `SIGTERM`.