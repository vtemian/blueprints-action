// Package database provides database connection management and session handling
// for the web application with SQLite support and connection pooling.
package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

// Database connection instance
var (
	db   *sql.DB
	once sync.Once
	mu   sync.RWMutex
)

// Configuration constants
const (
	defaultDatabaseURL     = "sqlite:///./tasks.db"
	maxOpenConnections     = 25
	maxIdleConnections     = 5
	connectionMaxLifetime  = 5 * time.Minute
	connectionMaxIdleTime  = 1 * time.Minute
	defaultTimeout         = 30 * time.Second
	maxRetries            = 3
	baseRetryDelay        = 100 * time.Millisecond
)

// Custom error types for database operations
var (
	ErrDatabaseNotInitialized = errors.New("database not initialized")
	ErrConnectionFailed       = errors.New("database connection failed")
	ErrInvalidDatabaseURL     = errors.New("invalid database URL")
	ErrTransactionFailed      = errors.New("transaction failed")
)

// DatabaseError wraps database errors with additional context
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

// BaseModel provides common fields for all database models
type BaseModel struct {
	ID        string    `db:"id" json:"id"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
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

// Config holds database configuration
type Config struct {
	DatabaseURL           string
	MaxOpenConnections    int
	MaxIdleConnections    int
	ConnectionMaxLifetime time.Duration
	ConnectionMaxIdleTime time.Duration
}

// LoadConfig loads database configuration from environment variables
func LoadConfig() *Config {
	config := &Config{
		DatabaseURL:           getEnv("DATABASE_URL", defaultDatabaseURL),
		MaxOpenConnections:    maxOpenConnections,
		MaxIdleConnections:    maxIdleConnections,
		ConnectionMaxLifetime: connectionMaxLifetime,
		ConnectionMaxIdleTime: connectionMaxIdleTime,
	}

	return config
}

// getEnv gets environment variable with fallback to default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// parseDatabaseURL parses the database URL and returns driver and connection string
func parseDatabaseURL(databaseURL string) (driver, connectionString string, err error) {
	if databaseURL == "" {
		return "", "", &DatabaseError{Op: "parse_url", Err: ErrInvalidDatabaseURL}
	}

	// Handle SQLite URLs
	if strings.HasPrefix(databaseURL, "sqlite://") {
		return "sqlite3", strings.TrimPrefix(databaseURL, "sqlite://"), nil
	}
	if strings.HasPrefix(databaseURL, "sqlite:///") {
		return "sqlite3", strings.TrimPrefix(databaseURL, "sqlite:///"), nil
	}

	// Default to SQLite if no scheme provided
	return "sqlite3", databaseURL, nil
}

// InitDB initializes the database connection with proper configuration
func InitDB() error {
	var initErr error
	
	once.Do(func() {
		config := LoadConfig()
		
		driver, connectionString, err := parseDatabaseURL(config.DatabaseURL)
		if err != nil {
			initErr = fmt.Errorf("failed to parse database URL: %w", err)
			return
		}

		// Add SQLite-specific pragmas for better performance and reliability
		if driver == "sqlite3" {
			connectionString += "?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=temp_store(memory)&_pragma=mmap_size(268435456)"
		}

		// Open database connection with retry logic
		db, err = openWithRetry(driver, connectionString)
		if err != nil {
			initErr = &DatabaseError{Op: "init", Err: fmt.Errorf("%w: %v", ErrConnectionFailed, err)}
			return
		}

		// Configure connection pool
		db.SetMaxOpenConns(config.MaxOpenConnections)
		db.SetMaxIdleConns(config.MaxIdleConnections)
		db.SetConnMaxLifetime(config.ConnectionMaxLifetime)
		db.SetConnMaxIdleTime(config.ConnectionMaxIdleTime)

		// Verify connection
		ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
		defer cancel()

		if err := db.PingContext(ctx); err != nil {
			db.Close()
			db = nil
			initErr = &DatabaseError{Op: "ping", Err: fmt.Errorf("%w: %v", ErrConnectionFailed, err)}
			return
		}

		// Create tables
		if err := createTables(ctx); err != nil {
			db.Close()
			db = nil
			initErr = &DatabaseError{Op: "create_tables", Err: err}
			return
		}

		log.Printf("Database initialized successfully with driver: %s", driver)
	})

	return initErr
}

// openWithRetry attempts to open database connection with exponential backoff retry
func openWithRetry(driver, connectionString string) (*sql.DB, error) {
	var db *sql.DB
	var err error

	for attempt := 0; attempt < maxRetries; attempt++ {
		db, err = sql.Open(driver, connectionString)
		if err == nil {
			return db, nil
		}

		if attempt < maxRetries-1 {
			delay := baseRetryDelay * time.Duration(1<<attempt) // Exponential backoff
			log.Printf("Database connection attempt %d failed, retrying in %v: %v", attempt+1, delay, err)
			time.Sleep(delay)
		}
	}

	return nil, fmt.Errorf("failed to open database after %d attempts: %w", maxRetries, err)
}

// createTables creates the necessary database tables
func createTables(ctx context.Context) error {
	// Example table creation - modify according to your needs
	queries := []string{
		`CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			description TEXT,
			completed BOOLEAN DEFAULT FALSE,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)`,
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		if err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				log.Printf("Failed to rollback transaction: %v", rbErr)
			}
		}
	}()

	for _, query := range queries {
		if _, err = tx.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("failed to execute query: %w", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// GetDB returns the database connection instance
// Returns nil if database is not initialized
func GetDB() *sql.DB {
	mu.RLock()
	defer mu.RUnlock()
	return db
}

// MustGetDB returns the database connection or panics if not initialized
// Use this only when you're certain the database is initialized
func MustGetDB() *sql.DB {
	mu.RLock()
	defer mu.RUnlock()
	
	if db == nil {
		panic("database not initialized - call InitDB() first")
	}
	return db
}

// CloseDB closes the database connection gracefully
func CloseDB() error {
	mu.Lock()
	defer mu.Unlock()

	if db == nil {
		return nil
	}

	err := db.Close()
	db = nil
	once = sync.Once{} // Reset once to allow re-initialization

	if err != nil {
		return &DatabaseError{Op: "close", Err: err}
	}

	log.Println("Database connection closed successfully")
	return nil
}

// Ping checks if the database connection is alive
func Ping(ctx context.Context) error {
	mu.RLock()
	currentDB := db
	mu.RUnlock()

	if currentDB == nil {
		return &DatabaseError{Op: "ping", Err: ErrDatabaseNotInitialized}
	}

	if err := currentDB.PingContext(ctx); err != nil {
		return &DatabaseError{Op: "ping", Err: err}
	}

	return nil
}

// Health performs a comprehensive health check
func Health(ctx context.Context) error {
	if err := Ping(ctx); err != nil {
		return err
	}

	// Test a simple query
	mu.RLock()
	currentDB := db
	mu.RUnlock()

	var result int
	err := currentDB.QueryRowContext(ctx, "SELECT 1").Scan(&result)
	if err != nil {
		return &DatabaseError{Op: "health_check", Err: err}
	}

	if result != 1 {
		return &DatabaseError{Op: "health_check", Err: errors.New("unexpected query result")}
	}

	return nil
}

// WithTransaction executes a function within a database transaction
func WithTransaction(ctx context.Context, fn func(*sql.Tx) error) error {
	mu.RLock()
	currentDB := db
	mu.RUnlock()

	if currentDB == nil {
		return &DatabaseError{Op: "transaction", Err: ErrDatabaseNotInitialized}
	}

	tx, err := currentDB.BeginTx(ctx, nil)
	if err != nil {
		return &DatabaseError{Op: "begin_transaction", Err: err}
	}

	defer func() {
		if p := recover(); p != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				log.Printf("Failed to rollback transaction after panic: %v", rbErr)
			}
			panic(p) // Re-throw panic after rollback
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("Failed to rollback transaction: %v", rbErr)
		}
		return &DatabaseError{Op: "transaction", Err: fmt.Errorf("%w: %v", ErrTransactionFailed, err)}
	}

	if err := tx.Commit(); err != nil {
		return &DatabaseError{Op: "commit_transaction", Err: err}
	}

	return nil
}

// Stats returns database statistics
func Stats() sql.DBStats {
	mu.RLock()
	defer mu.RUnlock()

	if db == nil {
		return sql.DBStats{}
	}

	return db.Stats()
}

// IsInitialized returns true if the database is initialized
func IsInitialized() bool {
	mu.RLock()
	defer mu.RUnlock()
	return db != nil
}

// Closer implements io.Closer interface for graceful shutdown
type Closer struct{}

// Close implements the io.Closer interface
func (c *Closer) Close() error {
	return CloseDB()
}

// NewCloser returns a new Closer instance
func NewCloser() *Closer {
	return &Closer{}
}