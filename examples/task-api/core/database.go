I'll create a production-ready Go database connection and session management module following the specified requirements.

```go
// Package database provides database connection and session management functionality
// with SQLite support, connection pooling, and dependency injection patterns.
package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
)

// DatabaseError represents database-specific errors with context
type DatabaseError struct {
	Operation string
	Err       error
	Context   string
}

func (e *DatabaseError) Error() string {
	return fmt.Sprintf("database error in %s: %v (context: %s)", e.Operation, e.Err, e.Context)
}

func (e *DatabaseError) Unwrap() error {
	return e.Err
}

// NewDatabaseError creates a new DatabaseError with context
func NewDatabaseError(operation string, err error, context string) *DatabaseError {
	return &DatabaseError{
		Operation: operation,
		Err:       err,
		Context:   context,
	}
}

// Config holds database configuration parameters
type Config struct {
	DatabaseURL     string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
	QueryTimeout    time.Duration
}

// DefaultConfig returns a configuration with sensible defaults
func DefaultConfig() *Config {
	return &Config{
		DatabaseURL:     getEnv("DATABASE_URL", "file:./tasks.db"),
		MaxOpenConns:    getEnvInt("DB_MAX_OPEN_CONNS", 25),
		MaxIdleConns:    getEnvInt("DB_MAX_IDLE_CONNS", 5),
		ConnMaxLifetime: getEnvDuration("DB_CONN_MAX_LIFETIME", 5*time.Minute),
		ConnMaxIdleTime: getEnvDuration("DB_CONN_MAX_IDLE_TIME", 5*time.Minute),
		QueryTimeout:    getEnvDuration("DB_QUERY_TIMEOUT", 30*time.Second),
	}
}

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

// UpdateTimestamp updates the UpdatedAt field to current time
func (bm *BaseModel) UpdateTimestamp() {
	bm.UpdatedAt = time.Now().UTC()
}

// DatabaseInterface defines the interface for database operations
type DatabaseInterface interface {
	GetDB() *sql.DB
	Close() error
	Ping(ctx context.Context) error
	BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
	Stats() sql.DBStats
}

// Database manages database connections and provides session management
type Database struct {
	db     *sql.DB
	config *Config
	mu     sync.RWMutex
	closed bool
}

// NewDatabase creates a new Database instance with the provided configuration
func NewDatabase(config *Config) (*Database, error) {
	if config == nil {
		config = DefaultConfig()
	}

	db, err := sql.Open("sqlite3", config.DatabaseURL+"?_journal_mode=WAL&_foreign_keys=on&_timeout=5000")
	if err != nil {
		return nil, NewDatabaseError("open", err, "failed to open database connection")
	}

	// Configure connection pool
	db.SetMaxOpenConns(config.MaxOpenConns)
	db.SetMaxIdleConns(config.MaxIdleConns)
	db.SetConnMaxLifetime(config.ConnMaxLifetime)
	db.SetConnMaxIdleTime(config.ConnMaxIdleTime)

	database := &Database{
		db:     db,
		config: config,
	}

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := database.Ping(ctx); err != nil {
		db.Close()
		return nil, NewDatabaseError("ping", err, "failed to ping database")
	}

	// Initialize database schema
	if err := database.initializeSchema(ctx); err != nil {
		db.Close()
		return nil, NewDatabaseError("initialize", err, "failed to initialize database schema")
	}

	log.Printf("Database connection established successfully to %s", config.DatabaseURL)
	return database, nil
}

// GetDB returns the underlying sql.DB instance for dependency injection
func (d *Database) GetDB() *sql.DB {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.db
}

// Close gracefully closes the database connection
func (d *Database) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.closed {
		return nil
	}

	d.closed = true
	if err := d.db.Close(); err != nil {
		return NewDatabaseError("close", err, "failed to close database connection")
	}

	log.Println("Database connection closed successfully")
	return nil
}

// Ping verifies the database connection is alive
func (d *Database) Ping(ctx context.Context) error {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.closed {
		return NewDatabaseError("ping", fmt.Errorf("database is closed"), "connection closed")
	}

	if err := d.db.PingContext(ctx); err != nil {
		return NewDatabaseError("ping", err, "connection health check failed")
	}

	return nil
}

// BeginTx starts a new transaction with the given options
func (d *Database) BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.closed {
		return nil, NewDatabaseError("begin_tx", fmt.Errorf("database is closed"), "connection closed")
	}

	tx, err := d.db.BeginTx(ctx, opts)
	if err != nil {
		return nil, NewDatabaseError("begin_tx", err, "failed to begin transaction")
	}

	return tx, nil
}

// ExecContext executes a query without returning any rows
func (d *Database) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.closed {
		return nil, NewDatabaseError("exec", fmt.Errorf("database is closed"), "connection closed")
	}

	// Apply query timeout if not already set in context
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, d.config.QueryTimeout)
		defer cancel()
	}

	result, err := d.db.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, NewDatabaseError("exec", err, fmt.Sprintf("query: %s", query))
	}

	return result, nil
}

// QueryContext executes a query that returns rows
func (d *Database) QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.closed {
		return nil, NewDatabaseError("query", fmt.Errorf("database is closed"), "connection closed")
	}

	// Apply query timeout if not already set in context
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, d.config.QueryTimeout)
		defer cancel()
	}

	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, NewDatabaseError("query", err, fmt.Sprintf("query: %s", query))
	}

	return rows, nil
}

// QueryRowContext executes a query that is expected to return at most one row
func (d *Database) QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row {
	d.mu.RLock()
	defer d.mu.RUnlock()

	// Apply query timeout if not already set in context
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, d.config.QueryTimeout)
		defer cancel()
	}

	return d.db.QueryRowContext(ctx, query, args...)
}

// Stats returns database statistics
func (d *Database) Stats() sql.DBStats {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.db.Stats()
}

// HealthCheck performs a comprehensive health check of the database
func (d *Database) HealthCheck(ctx context.Context) error {
	if err := d.Ping(ctx); err != nil {
		return err
	}

	// Check if we can perform a simple query
	row := d.QueryRowContext(ctx, "SELECT 1")
	var result int
	if err := row.Scan(&result); err != nil {
		return NewDatabaseError("health_check", err, "failed to execute test query")
	}

	if result != 1 {
		return NewDatabaseError("health_check", fmt.Errorf("unexpected result: %d", result), "test query returned wrong value")
	}

	return nil
}

// initializeSchema creates necessary tables and indexes
func (d *Database) initializeSchema(ctx context.Context) error {
	// Create a sample table to demonstrate the base model usage
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS sample_entities (
		id TEXT PRIMARY KEY,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		name TEXT NOT NULL,
		description TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_sample_entities_created_at ON sample_entities(created_at);
	CREATE INDEX IF NOT EXISTS idx_sample_entities_updated_at ON sample_entities(updated_at);
	`

	_, err := d.ExecContext(ctx, createTableSQL)
	if err != nil {
		return NewDatabaseError("schema_init", err, "failed to create sample table")
	}

	return nil
}

// TransactionFunc represents a function that can be executed within a transaction
type TransactionFunc func(tx *sql.Tx) error

// WithTransaction executes a function within a database transaction
// It automatically handles commit/rollback based on the function's return value
func (d *Database) WithTransaction(ctx context.Context, fn TransactionFunc) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p) // re-throw panic after rollback
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return NewDatabaseError("transaction", fmt.Errorf("tx error: %v, rollback error: %v", err, rbErr), "failed to rollback transaction")
		}
		return err
	}

	if err := tx.Commit(); err != nil {
		return NewDatabaseError("transaction", err, "failed to commit transaction")
	}

	return nil
}

// Repository provides a base repository pattern implementation
type Repository struct {
	db DatabaseInterface
}

// NewRepository creates a new repository with the given database interface
func NewRepository(db DatabaseInterface) *Repository {
	return &Repository{db: db}
}

// GetDB returns the database interface for custom queries
func (r *Repository) GetDB() DatabaseInterface {
	return r.db
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

// Example usage and patterns:
//
// Basic initialization:
//   config := database.DefaultConfig()
//   db, err := database.NewDatabase(config)
//   if err != nil {
//       log.Fatal(err)
//   }
//   defer db.Close()
//
// Using in a handler with dependency injection:
//   type Handler struct {
//       db database.DatabaseInterface
//   }
//
//   func NewHandler(db database.DatabaseInterface) *Handler {
//       return &Handler{db: db}
//   }
//
//   func (h *Handler) GetUser(ctx context.Context, id string) (*User, error) {
//       row := h.db.QueryRowContext(ctx, "SELECT id, name FROM users WHERE id = ?", id)
//       var user User
//       err := row.Scan(&user.ID, &user.Name)
//       if err == sql.ErrNoRows {
//           return nil, fmt.Errorf("user not found")
//       }
//       return &user, err
//   }
//
// Using transactions:
//   err := db.WithTransaction(ctx, func(tx *sql.Tx) error {
//       _, err := tx.ExecContext(ctx, "INSERT INTO users (id, name) VALUES (?, ?)", id, name)
//       if err != nil {
//           return err
//       }
//       _, err = tx.ExecContext(ctx, "INSERT INTO user_profiles (user_id, email) VALUES (?, ?)", id, email)
//       return err
//   })
//
// Health checking:
//   if err := db.HealthCheck(ctx); err != nil {
//       log.Printf("Database health check failed: %v", err)
//   }
```

This implementation provides:

1. **Complete package structure** with proper Go conventions and documentation
2. **Robust error handling** with custom error types and context information
3. **Configuration management** with environment variable support and sensible defaults
4. **Connection pooling** with configurable parameters
5. **Thread-safe operations** using read-write mutexes
6. **Base model** with UUID primary keys and automatic timestamp management
7. **Dependency injection** interface for easy testing and modularity
8. **Transaction support** with automatic rollback/commit handling
9. **Health checking** functionality for monitoring
10. **Proper resource cleanup** with graceful shutdown