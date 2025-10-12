// Package database provides database connection and session management with SQLite support
package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

// DatabaseError represents different types of database errors
type DatabaseError struct {
	Type    string
	Message string
	Err     error
}

func (e *DatabaseError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s - %v", e.Type, e.Message, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Type, e.Message)
}

// Error types
const (
	ErrTypeConnection    = "CONNECTION_ERROR"
	ErrTypeQuery         = "QUERY_ERROR"
	ErrTypeTransaction   = "TRANSACTION_ERROR"
	ErrTypeInitialization = "INITIALIZATION_ERROR"
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

// UpdateTimestamp updates the UpdatedAt field to current time
func (b *BaseModel) UpdateTimestamp() {
	b.UpdatedAt = time.Now().UTC()
}

// Config holds database configuration options
type Config struct {
	DatabaseURL     string        `json:"database_url"`
	MaxOpenConns    int           `json:"max_open_conns"`
	MaxIdleConns    int           `json:"max_idle_conns"`
	ConnMaxLifetime time.Duration `json:"conn_max_lifetime"`
	ConnMaxIdleTime time.Duration `json:"conn_max_idle_time"`
	RetryAttempts   int           `json:"retry_attempts"`
	RetryDelay      time.Duration `json:"retry_delay"`
}

// DefaultConfig returns a configuration with sensible defaults
func DefaultConfig() *Config {
	return &Config{
		DatabaseURL:     getEnvOrDefault("DATABASE_URL", "./tasks.db"),
		MaxOpenConns:    25,
		MaxIdleConns:    5,
		ConnMaxLifetime: 5 * time.Minute,
		ConnMaxIdleTime: 1 * time.Minute,
		RetryAttempts:   3,
		RetryDelay:      100 * time.Millisecond,
	}
}

// getEnvOrDefault retrieves environment variable or returns default value
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// SessionProvider interface for dependency injection and testing
type SessionProvider interface {
	GetDB(ctx context.Context) (*Session, error)
	NewSession(ctx context.Context) (*Session, error)
	Close() error
}

// Session wraps a database connection with additional functionality
type Session struct {
	db     *sql.DB
	tx     *sql.Tx
	closed bool
	mu     sync.RWMutex
}

// DB returns the underlying database connection
func (s *Session) DB() *sql.DB {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.db
}

// Begin starts a new transaction
func (s *Session) Begin(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	if s.tx != nil {
		return &DatabaseError{
			Type:    ErrTypeTransaction,
			Message: "transaction already in progress",
		}
	}
	
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return &DatabaseError{
			Type:    ErrTypeTransaction,
			Message: "failed to begin transaction",
			Err:     err,
		}
	}
	
	s.tx = tx
	return nil
}

// Commit commits the current transaction
func (s *Session) Commit() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	if s.tx == nil {
		return &DatabaseError{
			Type:    ErrTypeTransaction,
			Message: "no active transaction to commit",
		}
	}
	
	err := s.tx.Commit()
	s.tx = nil
	
	if err != nil {
		return &DatabaseError{
			Type:    ErrTypeTransaction,
			Message: "failed to commit transaction",
			Err:     err,
		}
	}
	
	return nil
}

// Rollback rolls back the current transaction
func (s *Session) Rollback() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	if s.tx == nil {
		return nil // No transaction to rollback
	}
	
	err := s.tx.Rollback()
	s.tx = nil
	
	if err != nil {
		return &DatabaseError{
			Type:    ErrTypeTransaction,
			Message: "failed to rollback transaction",
			Err:     err,
		}
	}
	
	return nil
}

// Exec executes a query without returning rows
func (s *Session) Exec(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	if s.closed {
		return nil, &DatabaseError{
			Type:    ErrTypeConnection,
			Message: "session is closed",
		}
	}
	
	var result sql.Result
	var err error
	
	if s.tx != nil {
		result, err = s.tx.ExecContext(ctx, query, args...)
	} else {
		result, err = s.db.ExecContext(ctx, query, args...)
	}
	
	if err != nil {
		return nil, &DatabaseError{
			Type:    ErrTypeQuery,
			Message: "failed to execute query",
			Err:     err,
		}
	}
	
	return result, nil
}

// Query executes a query that returns rows
func (s *Session) Query(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	if s.closed {
		return nil, &DatabaseError{
			Type:    ErrTypeConnection,
			Message: "session is closed",
		}
	}
	
	var rows *sql.Rows
	var err error
	
	if s.tx != nil {
		rows, err = s.tx.QueryContext(ctx, query, args...)
	} else {
		rows, err = s.db.QueryContext(ctx, query, args...)
	}
	
	if err != nil {
		return nil, &DatabaseError{
			Type:    ErrTypeQuery,
			Message: "failed to execute query",
			Err:     err,
		}
	}
	
	return rows, nil
}

// QueryRow executes a query that returns at most one row
func (s *Session) QueryRow(ctx context.Context, query string, args ...interface{}) *sql.Row {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	if s.tx != nil {
		return s.tx.QueryRowContext(ctx, query, args...)
	}
	return s.db.QueryRowContext(ctx, query, args...)
}

// Close closes the session and cleans up resources
func (s *Session) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	if s.closed {
		return nil
	}
	
	// Rollback any active transaction
	if s.tx != nil {
		_ = s.tx.Rollback()
		s.tx = nil
	}
	
	s.closed = true
	return nil
}

// Database manages database connections and sessions
type Database struct {
	db     *sql.DB
	config *Config
	pool   sync.Pool
	mu     sync.RWMutex
	closed bool
}

// Global database instance
var (
	dbInstance *Database
	dbOnce     sync.Once
)

// Initialize initializes the global database instance with default configuration
func Initialize() error {
	return InitializeWithConfig(DefaultConfig())
}

// InitializeWithConfig initializes the global database instance with custom configuration
func InitializeWithConfig(config *Config) error {
	var err error
	dbOnce.Do(func() {
		dbInstance, err = NewDatabase(config)
		if err != nil {
			return
		}
		
		// Initialize database schema
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		
		err = dbInstance.InitDB(ctx)
	})
	return err
}

// NewDatabase creates a new Database instance with the given configuration
func NewDatabase(config *Config) (*Database, error) {
	if config == nil {
		config = DefaultConfig()
	}
	
	db := &Database{
		config: config,
	}
	
	// Initialize session pool
	db.pool = sync.Pool{
		New: func() interface{} {
			return &Session{
				db: db.db,
			}
		},
	}
	
	// Connect to database with retry logic
	if err := db.connect(); err != nil {
		return nil, err
	}
	
	return db, nil
}

// connect establishes database connection with retry logic
func (d *Database) connect() error {
	var db *sql.DB
	var err error
	
	for attempt := 0; attempt < d.config.RetryAttempts; attempt++ {
		db, err = sql.Open("sqlite3", d.config.DatabaseURL+"?_journal_mode=WAL&_synchronous=NORMAL&_cache_size=1000&_foreign_keys=ON")
		if err == nil {
			// Test the connection
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err = db.PingContext(ctx)
			cancel()
			
			if err == nil {
				break
			}
		}
		
		if attempt < d.config.RetryAttempts-1 {
			delay := d.config.RetryDelay * time.Duration(1<<attempt) // Exponential backoff
			log.Printf("Database connection attempt %d failed, retrying in %v: %v", attempt+1, delay, err)
			time.Sleep(delay)
		}
	}
	
	if err != nil {
		return &DatabaseError{
			Type:    ErrTypeConnection,
			Message: fmt.Sprintf("failed to connect to database after %d attempts", d.config.RetryAttempts),
			Err:     err,
		}
	}
	
	// Configure connection pool
	db.SetMaxOpenConns(d.config.MaxOpenConns)
	db.SetMaxIdleConns(d.config.MaxIdleConns)
	db.SetConnMaxLifetime(d.config.ConnMaxLifetime)
	db.SetConnMaxIdleTime(d.config.ConnMaxIdleTime)
	
	d.mu.Lock()
	d.db = db
	d.mu.Unlock()
	
	log.Printf("Successfully connected to database: %s", d.config.DatabaseURL)
	return nil
}

// InitDB initializes the database schema
func (d *Database) InitDB(ctx context.Context) error {
	d.mu.RLock()
	db := d.db
	d.mu.RUnlock()
	
	if db == nil {
		return &DatabaseError{
			Type:    ErrTypeInitialization,
			Message: "database connection not established",
		}
	}
	
	// Create base tables - this is a simple example
	// In a real application, you might use a migration system
	schema := `
	CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	
	-- Add your table schemas here
	-- Example:
	-- CREATE TABLE IF NOT EXISTS tasks (
	--     id TEXT PRIMARY KEY,
	--     title TEXT NOT NULL,
	--     description TEXT,
	--     completed BOOLEAN DEFAULT FALSE,
	--     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	--     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	-- );
	`
	
	_, err := db.ExecContext(ctx, schema)
	if err != nil {
		return &DatabaseError{
			Type:    ErrTypeInitialization,
			Message: "failed to initialize database schema",
			Err:     err,
		}
	}
	
	log.Println("Database schema initialized successfully")
	return nil
}

// GetDB returns a database session (equivalent to FastAPI dependency)
// This is the main function used for dependency injection in handlers
func (d *Database) GetDB(ctx context.Context) (*Session, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	
	if d.closed || d.db == nil {
		return nil, &DatabaseError{
			Type:    ErrTypeConnection,
			Message: "database is closed or not initialized",
		}
	}
	
	// Get session from pool
	session := d.pool.Get().(*Session)
	session.db = d.db
	session.closed = false
	session.tx = nil
	
	return session, nil
}

// NewSession creates a new database session
func (d *Database) NewSession(ctx context.Context) (*Session, error) {
	return d.GetDB(ctx)
}

// Close closes all database connections and cleans up resources
func (d *Database) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	
	if d.closed {
		return nil
	}
	
	d.closed = true
	
	if d.db != nil {
		err := d.db.Close()
		if err != nil {
			return &DatabaseError{
				Type:    ErrTypeConnection,
				Message: "failed to close database connection",
				Err:     err,
			}
		}
	}
	
	log.Println("Database connections closed successfully")
	return nil
}

// Stats returns database connection statistics
func (d *Database) Stats() sql.DBStats {
	d.mu.RLock()
	defer d.mu.RUnlock()
	
	if d.db == nil {
		return sql.DBStats{}
	}
	
	return d.db.Stats()
}

// Global convenience functions for dependency injection

// GetDB returns a database session from the global instance
// Usage in HTTP handlers:
//   func MyHandler(w http.ResponseWriter, r *http.Request) {
//       session, err := database.GetDB(r.Context())
//       if err != nil {
//           http.Error(w, err.Error(), http.StatusInternalServerError)
//           return
//       }
//       defer session.Close()
//       // Use session...
//   }
func GetDB(ctx context.Context) (*Session, error) {
	if dbInstance == nil {
		return nil, &DatabaseError{
			Type:    ErrTypeConnection,
			Message: "database not initialized - call Initialize() first",
		}
	}
	return dbInstance.GetDB(ctx)