Here's a complete Go HTTP server application that serves as the main entry point, equivalent to a FastAPI application with uvicorn server:

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

	// Import your custom app package
	// Replace "your-module-name" with your actual module name from go.mod
	"your-module-name/app"
)

const (
	// Server configuration constants
	Host         = "0.0.0.0"
	Port         = "8000"
	ReadTimeout  = 15 * time.Second
	WriteTimeout = 15 * time.Second
	IdleTimeout  = 60 * time.Second
)

func main() {
	// Create a new HTTP server mux from the app package
	router := app.NewRouter()

	// Configure the HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf("%s:%s", Host, Port),
		Handler:      router,
		ReadTimeout:  ReadTimeout,
		WriteTimeout: WriteTimeout,
		IdleTimeout:  IdleTimeout,
	}

	// Create a context that can be cancelled for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Channel to listen for interrupt signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	// Start the server in a goroutine
	go func() {
		log.Printf("🚀 Server starting on http://%s:%s", Host, Port)
		log.Printf("📝 Press Ctrl+C to stop the server")
		
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Server failed to start: %v", err)
		}
	}()

	// Wait for interrupt signal
	<-sigChan
	log.Println("🛑 Shutdown signal received, initiating graceful shutdown...")

	// Cancel the context
	cancel()

	// Create a context with timeout for graceful shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Attempt graceful shutdown
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("⚠️  Server forced to shutdown: %v", err)
		return
	}

	log.Println("✅ Server gracefully stopped")
}

// Development mode configuration
// Note: Unlike Python's uvicorn with --reload, Go doesn't have built-in
// hot reload functionality. For development, consider using tools like:
// - air (github.com/cosmtrek/air)
// - realize (github.com/oxequa/realize)
// - CompileDaemon (github.com/githubnemo/CompileDaemon)
//
// Example usage with air:
// 1. Install: go install github.com/cosmtrek/air@latest
// 2. Run: air
//
// This will watch for file changes and automatically rebuild/restart the server
```

## app/router.go

```go
package app

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux" // Optional: for advanced routing
)

// Response represents a standard API response
type Response struct {
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

// NewRouter creates and configures the HTTP router with all routes
func NewRouter() http.Handler {
	// Using gorilla/mux for advanced routing (optional)
	// If you prefer standard library only, see the alternative implementation below
	r := mux.NewRouter()

	// Middleware
	r.Use(loggingMiddleware)
	r.Use(corsMiddleware)

	// Routes
	r.HandleFunc("/", homeHandler).Methods("GET")
	r.HandleFunc("/health", healthHandler).Methods("GET")
	r.HandleFunc("/api/users", getUsersHandler).Methods("GET")
	r.HandleFunc("/api/users", createUserHandler).Methods("POST")
	r.HandleFunc("/api/users/{id}", getUserHandler).Methods("GET")

	// Static file serving (optional)
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("./static/"))))

	return r
}

// Alternative implementation using only standard library
func NewStandardRouter() http.Handler {
	mux := http.NewServeMux()
	
	// Wrap handlers with middleware
	mux.HandleFunc("/", withMiddleware(homeHandler))
	mux.HandleFunc("/health", withMiddleware(healthHandler))
	mux.HandleFunc("/api/users", withMiddleware(usersHandler))
	
	return mux
}

// Handlers
func homeHandler(w http.ResponseWriter, r *http.Request) {
	response := Response{
		Message:   "Welcome to Go HTTP Server!",
		Data:      map[string]string{"version": "1.0.0"},
		Timestamp: time.Now(),
	}
	
	writeJSONResponse(w, http.StatusOK, response)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	response := Response{
		Message:   "Server is healthy",
		Data:      map[string]string{"status": "ok"},
		Timestamp: time.Now(),
	}
	
	writeJSONResponse(w, http.StatusOK, response)
}

func getUsersHandler(w http.ResponseWriter, r *http.Request) {
	// Mock data - replace with actual database queries
	users := []map[string]interface{}{
		{"id": 1, "name": "John Doe", "email": "john@example.com"},
		{"id": 2, "name": "Jane Smith", "email": "jane@example.com"},
	}
	
	response := Response{
		Message:   "Users retrieved successfully",
		Data:      users,
		Timestamp: time.Now(),
	}
	
	writeJSONResponse(w, http.StatusOK, response)
}

func createUserHandler(w http.ResponseWriter, r *http.Request) {
	// Parse JSON body
	var user map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	
	// Mock creation - replace with actual database insertion
	user["id"] = 3
	user["created_at"] = time.Now()
	
	response := Response{
		Message:   "User created successfully",
		Data:      user,
		Timestamp: time.Now(),
	}
	
	writeJSONResponse(w, http.StatusCreated, response)
}

func getUserHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	userID := vars["id"]
	
	// Mock data - replace with actual database query
	user := map[string]interface{}{
		"id":    userID,
		"name":  "John Doe",
		"email": "john@example.com",
	}
	
	response := Response{
		Message:   "User retrieved successfully",
		Data:      user,
		Timestamp: time.Now(),
	}
	
	writeJSONResponse(w, http.StatusOK, response)
}

// Standard library version for handling users (GET and POST)
func usersHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		getUsersHandler(w, r)
	case "POST":
		createUserHandler(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Utility functions
func writeJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

// Middleware
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		
		// Call the next handler
		next.ServeHTTP(w, r)
		
		// Log the request
		log.Printf("%s %s %s %v", r.Method, r.RequestURI, r.RemoteAddr, time.Since(start))
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next.ServeHTTP(w, r)
	})
}

// Middleware wrapper for standard library version
func withMiddleware(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Apply CORS
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		// Logging
		start := time.Now()
		handler(w, r)
		log.Printf("%s %s %s %v", r.Method, r.RequestURI, r.RemoteAddr, time.Since(start))
	}
}
```

## go.mod

```go
module your-module-name

go 1.21

require (
    github.com/gorilla/mux v1.8.0
)
```

## .air.toml (Optional - for development hot reload)

```toml
root = "."
testdata_dir = "testdata"
tmp_dir = "tmp"

[build]
  args_bin = []
  bin = "./tmp/main"
  cmd = "go build -o ./tmp/main ."
  delay = 1000
  exclude_dir = ["assets", "tmp", "vendor", "testdata"]
  exclude_file = []
  exclude_regex = ["_test.go"]
  exclude_unchanged = false
  follow_symlink = false
  full_bin = ""
  include_dir = []
  include_ext = ["go", "tpl", "tmpl", "html"]
  kill_delay = "0s"
  log = "build-errors.log"
  send_interrupt = false
  stop_on_root = false

[color]
  app = ""
  build = "yellow"
  main = "magenta"
  runner = "green"
  watcher = "cyan"

[log]
  time = false

[misc]
  clean_on_exit = false

[screen]
  clear_on_rebuild = false
```

## Usage Instructions

1. **Initialize the module:**
   ```bash
   go mod init your-module-name
   go mod tidy
   ```

2. **Run the server:**
   ```bash
   go run main.go
   ```

3. **For development with hot reload:**
   ```bash
   # Install air
   go install github.com/cosmtrek/air@latest
   
   # Run with hot reload
   air
   ```

4. **Build for production:**
   ```bash
   go build -o server main.go
   ./server
   ```

## Key Features

- ✅ **Graceful shutdown** with signal handling
- ✅ **Container-compatible** (binds to 0.0.0.0:8000)
- ✅ **Proper error handling** for server startup failures
- ✅ **Configurable timeouts** to prevent resource exhaustion
- ✅ **Structured logging** for startup and shutdown events
- ✅ **Middleware support** (CORS, logging)
- ✅ **JSON API responses** with consistent structure
- ✅ **Development mode** support with external tools
- ✅ **Production-ready** configuration

## API Endpoints

- `GET /` - Welcome message
- `GET /health` - Health check
- `GET /api/users` - Get all users
- `POST /api/users` - Create a new user
- `GET /api/users/{id}` - Get user by ID

This implementation provides a robust, production-ready HTTP server that's equivalent to FastAPI with uvicorn, following Go best practices and including all the requested features.