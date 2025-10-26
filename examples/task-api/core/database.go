I'll create a production-ready Go database connection and session management module based on your requirements. Here's the complete implementation:

## File Structure
```
core/
└── database/
    ├── database.go
    ├── models.go
    ├── errors.go
    └── config.go
```

## core/database/errors.go
```go
package database

import (
	"errors"
	"fmt"
)

// Custom database error types
var (
	ErrConnectionFailed   = errors.New("database connection failed")
	ErrInitializationFailed = errors.New("database initialization failed")
	ErrConnectionClosed   = errors.New("database connection is closed")
	ErrInvalidConfig      = errors.New("invalid database configuration")
)

// DatabaseError wraps database-specific errors with additional context
type DatabaseError struct {
	Op  string // Operation that failed
	Err error  // Underlying error
}

func (e *DatabaseError) Error() string {
	return fmt.Sprintf("database operation %s failed: %v", e.Op, e.Err)
}

func (e *DatabaseError) Unwrap() error {
	return e.Err
}

// NewDatabaseError creates a new DatabaseError
func NewDatabaseError(op string, err error) *DatabaseError {
	return &DatabaseError{
		Op:  op,
		Err: err,
	}
}
```

## core/database/config.go
```go
package database

import (
	"os"
	"strconv"
	"time"
)

// Config holds database configuration
type Config struct {
	DatabaseURL      string
	MaxOpenConns     int
	MaxIdleConns     int
	ConnMaxLifetime  time.Duration
	ConnMaxIdleTime  time.Duration
	RetryAttempts    int
	RetryDelay       time.Duration
	PingTimeout      time.Duration
}

// DefaultConfig returns default database configuration
func DefaultConfig() *Config {
	return &Config{
		DatabaseURL:      getEnv("DATABASE_URL", "./tasks.db"),
		MaxOpenConns:     getEnvInt("DB_MAX_OPEN_CONNS", 25),
		MaxIdleConns:     getEnvInt("DB_MAX_IDLE_CONNS", 5),
		ConnMaxLifetime:  getEnvDuration("DB_CONN_MAX_LIFETIME", 5*time.Minute),
		ConnMaxIdleTime:  getEnvDuration("DB_CONN_MAX_IDLE_TIME", 5*time.Minute),
		RetryAttempts:    getEnvInt("DB_RETRY_ATTEMPTS", 3),
		RetryDelay:       getEnvDuration("DB_RETRY_DELAY", 1*time.Second),
		PingTimeout:      getEnvDuration("DB_PING_TIMEOUT", 5*time.Second),
	}
}

// Helper functions for environment variable parsing
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}
```

## core/database/models.go
```go
package database

import (
	"time"

	"github.com/google/uuid"
)

// BaseModel provides common fields for all database models
type BaseModel struct {
	ID        string    `json:"id" db:"id"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// NewBaseModel creates a new BaseModel with generated UUID and timestamps
func NewBaseModel() BaseModel {
	now := time.Now().UTC()
	return BaseModel{
		ID:        uuid.New().String(),
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// Touch updates the UpdatedAt timestamp
func (bm *BaseModel) Touch() {
	bm.UpdatedAt = time.Now().UTC()
}

// IsZero returns true if the model appears to be uninitialized
func (bm *BaseModel) IsZero() bool {
	return bm.ID == "" || bm.CreatedAt.IsZero()
}
```

## core/database/database.go
```go
package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

// DB wraps sql.DB with additional functionality
type DB struct {
	*sql.DB
	config *Config
	mu     sync.RWMutex
	closed bool
}

var (
	instance *DB
	once     sync.Once
	initErr  error
)

// NewDB creates a new database connection with the given configuration
func NewDB(databaseURL string) (*DB, error) {
	config := DefaultConfig()
	config.DatabaseURL = databaseURL
	return NewDBWithConfig(config)
}

// NewDBWithConfig creates a new database connection with custom configuration
func NewDBWithConfig(config *Config) (*DB, error) {
	if config == nil {
		return nil, NewDatabaseError("new_db", ErrInvalidConfig)
	}

	// Open database connection
	sqlDB, err := sql.Open("sqlite3", config.DatabaseURL+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return nil, NewDatabaseError("open", fmt.Errorf("%w: %v", ErrConnectionFailed, err))
	}

	// Configure connection pool
	sqlDB.SetMaxOpenConns(config.MaxOpenConns)
	sqlDB.SetMaxIdleConns(config.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(config.ConnMaxLifetime)
	sqlDB.SetConnMaxIdleTime(config.ConnMaxIdleTime)

	db := &DB{
		DB:     sqlDB,
		config: config,
	}

	// Test connection with retry logic
	if err := db.pingWithRetry(context.Background()); err != nil {
		sqlDB.Close()
		return nil, NewDatabaseError("ping", fmt.Errorf("%w: %v", ErrConnectionFailed, err))
	}

	return db, nil
}

// GetDB returns the singleton database instance
func GetDB() *DB {
	once.Do(func() {
		instance, initErr = NewDB(DefaultConfig().DatabaseURL)
		if initErr == nil {
			initErr = instance.InitDB()
		}
	})
	
	if initErr != nil {
		log.Printf("Database initialization error: %v", initErr)
		return nil
	}
	
	return instance
}

// InitDB creates the database schema and tables
func (db *DB) InitDB() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Create base tables schema
	schema := `
	CREATE TABLE IF NOT EXISTS schema_migrations (
		id TEXT PRIMARY KEY,
		version INTEGER NOT NULL,
		applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Example table demonstrating BaseModel usage
	CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		description TEXT,
		completed BOOLEAN DEFAULT FALSE,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Triggers for automatic timestamp updates
	CREATE TRIGGER IF NOT EXISTS update_tasks_updated_at 
		AFTER UPDATE ON tasks
		FOR EACH ROW
		BEGIN
			UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
		END;

	CREATE TRIGGER IF NOT EXISTS update_schema_migrations_updated_at 
		AFTER UPDATE ON schema_migrations
		FOR EACH ROW
		BEGIN
			UPDATE schema_migrations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
		END;
	`

	if _, err := db.ExecContext(ctx, schema); err != nil {
		return NewDatabaseError("init_schema", err)
	}

	// Record schema migration
	migrationID := uuid.New().String()
	_, err := db.ExecContext(ctx, 
		"INSERT OR IGNORE INTO schema_migrations (id, version) VALUES (?, ?)",
		migrationID, 1)
	if err != nil {
		return NewDatabaseError("init_migration", err)
	}

	return nil
}

// Ping checks if the database connection is alive
func (db *DB) Ping(ctx context.Context) error {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if db.closed {
		return ErrConnectionClosed
	}

	pingCtx, cancel := context.WithTimeout(ctx, db.config.PingTimeout)
	defer cancel()

	if err := db.DB.PingContext(pingCtx); err != nil {
		return NewDatabaseError("ping", err)
	}

	return nil
}

// pingWithRetry pings the database with exponential backoff retry logic
func (db *DB) pingWithRetry(ctx context.Context) error {
	var lastErr error
	delay := db.config.RetryDelay

	for attempt := 0; attempt < db.config.RetryAttempts; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
				delay *= 2 // Exponential backoff
			}
		}

		if err := db.Ping(ctx); err == nil {
			return nil
		} else {
			lastErr = err
		}
	}

	return fmt.Errorf("failed after %d attempts: %w", db.config.RetryAttempts, lastErr)
}

// Close closes the database connection
func (db *DB) Close() error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if db.closed {
		return nil
	}

	db.closed = true
	if err := db.DB.Close(); err != nil {
		return NewDatabaseError("close", err)
	}

	return nil
}

// IsClosed returns true if the database connection is closed
func (db *DB) IsClosed() bool {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.closed
}

// Stats returns database connection statistics
func (db *DB) Stats() sql.DBStats {
	return db.DB.Stats()
}

// BeginTx starts a transaction with the given options
func (db *DB) BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if db.closed {
		return nil, ErrConnectionClosed
	}

	tx, err := db.DB.BeginTx(ctx, opts)
	if err != nil {
		return nil, NewDatabaseError("begin_tx", err)
	}

	return tx, nil
}

// HealthCheck performs a comprehensive health check
func (db *DB) HealthCheck(ctx context.Context) error {
	// Check connection
	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("ping failed: %w", err)
	}

	// Check if we can perform a simple query
	var count int
	err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM sqlite_master WHERE type='table'").Scan(&count)
	if err != nil {
		return NewDatabaseError("health_check_query", err)
	}

	// Check connection pool stats
	stats := db.Stats()
	if stats.OpenConnections == 0 {
		return fmt.Errorf("no open connections available")
	}

	return nil
}

// Shutdown gracefully shuts down the database connection
func (db *DB) Shutdown(ctx context.Context) error {
	log.Println("Shutting down database connection...")

	// Wait for active connections to finish or context to timeout
	done := make(chan error, 1)
	go func() {
		done <- db.Close()
	}()

	select {
	case err := <-done:
		if err != nil {
			log.Printf("Error during database shutdown: %v", err)
			return err
		}
		log.Println("Database connection closed successfully")
		return nil
	case <-ctx.Done():
		log.Println("Database shutdown timed out")
		return ctx.Err()
	}
}
```

## Example Usage

Here's how to use the database package in your application:

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

	"your-project/core/database"
)

// Example service demonstrating dependency injection
type TaskService struct {
	db *database.DB
}

func NewTaskService(db *database.DB) *TaskService {
	return &TaskService{db: db}
}

func (s *TaskService) CreateTask(ctx context.Context, title, description string) error {
	model := database.NewBaseModel()
	
	query := `
		INSERT INTO tasks (id, title, description, created_at, updated_at) 
		VALUES (?, ?, ?, ?, ?)
	`
	
	_, err := s.db.ExecContext(ctx, query, 
		model.ID, title, description, model.CreatedAt, model.UpdatedAt)
	if err != nil {
		return database.NewDatabaseError("create_task", err)
	}
	
	return nil
}

func (s *TaskService) GetTask(ctx context.Context, id string) (*Task, error) {
	var task Task
	query := `SELECT id, title, description, completed, created_at, updated_at FROM tasks WHERE id = ?`
	
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&task.ID, &task.Title, &task.Description, &task.Completed,
		&task.CreatedAt, &task.UpdatedAt)
	if err != nil {
		return nil, database.NewDatabaseError("get_task", err)
	}
	
	return &task, nil
}

type Task struct {
	database.BaseModel
	Title       string `json:"title" db:"title"`
	Description string `json:"description" db:"description"`
	Completed   bool   `json:"completed" db:"completed"`
}

// HTTP handler demonstrating dependency injection pattern
func (s *TaskService) CreateTaskHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	
	// Parse request...
	title := r.FormValue("title")
	description := r.FormValue("description")
	
	if err := s.CreateTask(ctx, title, description); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusCreated)
}

func main() {
	// Initialize database
	db := database.GetDB()