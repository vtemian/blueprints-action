Here's a complete, production-ready Go HTTP server application entry point:

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

	"./app" // Replace with your actual module path, e.g., "github.com/yourorg/yourproject/app"
)

func main() {
	// Create a new HTTP server with production-ready timeouts
	server := &http.Server{
		Addr:         "0.0.0.0:8000",
		Handler:      app.NewRouter(), // Assumes app package exports a NewRouter() function
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Create a context that can be cancelled
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Channel to listen for interrupt signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	// Start the server in a goroutine
	go func() {
		log.Printf("Starting HTTP server on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	<-sigChan
	log.Println("Received interrupt signal, initiating graceful shutdown...")

	// Cancel the context to signal shutdown to other parts of the application
	cancel()

	// Create a context with timeout for graceful shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Attempt graceful shutdown
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server shutdown error: %v", err)
		log.Println("Forcing server shutdown...")
		if closeErr := server.Close(); closeErr != nil {
			log.Fatalf("Failed to force close server: %v", closeErr)
		}
		os.Exit(1)
	}

	log.Println("Server gracefully stopped")
}
```

And here's a minimal example of what the `app` package structure might look like (`app/router.go`):

```go
package app

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// NewRouter creates and configures the HTTP router/mux
func NewRouter() http.Handler {
	mux := http.NewServeMux()

	// Add middleware for logging and recovery
	handler := loggingMiddleware(recoveryMiddleware(mux))

	// Register routes
	mux.HandleFunc("/", homeHandler)
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/status", statusHandler)

	return handler
}

// homeHandler handles requests to the root path
func homeHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	response := map[string]string{
		"message": "Welcome to the Go HTTP Server",
		"version": "1.0.0",
	}
	json.NewEncoder(w).Encode(response)
}

// healthHandler provides a health check endpoint
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := map[string]string{
		"status": "healthy",
		"time":   time.Now().UTC().Format(time.RFC3339),
	}
	json.NewEncoder(w).Encode(response)
}

// statusHandler provides application status information
func statusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{
		"status":    "running",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"uptime":    time.Since(startTime).String(),
	}
	json.NewEncoder(w).Encode(response)
}

var startTime = time.Now()

// loggingMiddleware logs HTTP requests
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		
		// Create a response writer wrapper to capture status code
		wrapper := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		
		next.ServeHTTP(wrapper, r)
		
		log.Printf("%s %s %d %v %s",
			r.Method,
			r.URL.Path,
			wrapper.statusCode,
			time.Since(start),
			r.RemoteAddr,
		)
	})
}

// recoveryMiddleware recovers from panics and returns 500 status
func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("Panic recovered: %v", err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// responseWriter wraps http.ResponseWriter to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}
```

And here's a sample `go.mod` file:

```go
module yourproject

go 1.21

require ()
```

## Key Features:

1. **Production-Ready Configuration**: Includes proper timeouts (ReadTimeout, WriteTimeout, IdleTimeout)
2. **Graceful Shutdown**: Handles SIGINT and SIGTERM signals with a 30-second timeout
3. **Container Compatible**: Listens on `0.0.0.0:8000` for container deployments
4. **Error Handling**: Comprehensive error handling for startup and shutdown scenarios
5. **Logging**: Basic logging for server lifecycle events and HTTP requests
6. **Middleware**: Includes logging and panic recovery middleware
7. **Health Checks**: Provides `/health` endpoint for load balancers/orchestrators
8. **Context Cancellation**: Proper context handling for shutdown coordination

## Usage:

1. Create the directory structure:
```bash
mkdir -p yourproject/app
```

2. Save `main.go` in the root directory
3. Save `router.go` in the `app/` directory
4. Initialize the Go module:
```bash
go mod init yourproject
```

5. Run the server:
```bash
go run main.go
```

The server will start on `http://localhost:8000` and can be gracefully shut down with `Ctrl+C`.