// Package database provides a production-ready database abstraction layer
// with connection pooling, session management, and base model structures.
//
// Usage:
//   db, err := database.NewDatabase()
//   if err != nil {
//       log.Fatal(err)
//   }
//   defer db.Close()
//
//   if err := db.InitDB(); err != nil {
//       log.Fatal(err)
//   }
//
//   session := db.GetDB()
//   // Use session for database operations
package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
)

// Config holds database configuration parameters
type Config struct {
	// DatabaseURL is the connection string for the database
	DatabaseURL string
	// MaxOpenConns sets the maximum number of open connections to the database
	MaxOpenConns int
	// MaxIdleConns sets the maximum number of idle connections in the pool
	MaxIdleConns int
	// ConnMaxLifetime sets the maximum amount of time a connection may be reused
	ConnMaxLifetime time.Duration
	// ConnMaxIdleTime sets the maximum amount of time a connection may be idle
	ConnMaxIdleTime time.Duration
}

// Database represents the database manager with connection pool
type Database struct {
	db     *sql.DB
	config *Config
	mu     sync.RWMutex
	closed bool
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

// DatabaseError represents database-specific errors
type DatabaseError struct {
	Op  string // Operation that failed
	Err error  // Underlying error
}

func (e *DatabaseError) Error() string {
	return fmt.Sprintf("database %s: %v", e.Op, e.Err)
}

func (e *DatabaseError) Unwrap() error {
	return e.Err
}

// wrapError wraps an error with database context
func wrapError(op string, err error) error {
	if err == nil {
		return nil
	}
	return &DatabaseError{Op: op, Err: err}
}

// loadConfig loads database configuration from environment variables
func loadConfig() *Config {
	config := &Config{
		DatabaseURL:     getEnv("DATABASE_URL", "./tasks.db"),
		MaxOpenConns:    getEnvInt("DB_MAX_OPEN_CONNS", 25),
		MaxIdleConns:    getEnvInt("DB_MAX_IDLE_CONNS", 5),
		ConnMaxLifetime: getEnvDuration("DB_CONN_MAX_LIFETIME", 5*time.Minute),
		ConnMaxIdleTime: getEnvDuration("DB_CONN_MAX_IDLE_TIME", 5*time.Minute),
	}
	return config
}

// getEnv gets environment variable with default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvInt gets environment variable as integer with default value
func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

// getEnvDuration gets environment variable as duration with default value
func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

// NewDatabase creates a new database manager with connection pool
func NewDatabase() (*Database, error) {
	config := loadConfig()
	return NewDatabaseWithConfig(config)
}

// NewDatabaseWithConfig creates a new database manager with custom configuration
func NewDatabaseWithConfig(config *Config) (*Database, error) {
	// Open database connection
	db, err := sql.Open("sqlite3", config.DatabaseURL+"?_journal_mode=WAL&_synchronous=NORMAL&_cache_size=1000&_foreign_keys=ON")
	if err != nil {
		return nil, wrapError("open", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(config.MaxOpenConns)
	db.SetMaxIdleConns(config.MaxIdleConns)
	db.SetConnMaxLifetime(config.ConnMaxLifetime)
	db.SetConnMaxIdleTime(config.ConnMaxIdleTime)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, wrapError("ping", err)
	}

	return &Database{
		db:     db,
		config: config,
	}, nil
}

// GetDB returns the database connection for dependency injection
// This method is safe for concurrent use and provides access to the underlying sql.DB
func (d *Database) GetDB() *sql.DB {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.db
}

// GetConfig returns a copy of the database configuration
func (d *Database) GetConfig() Config {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return *d.config
}

// InitDB initializes the database schema
// This should be called once during application startup
func (d *Database) InitDB() error {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.closed {
		return wrapError("init", fmt.Errorf("database is closed"))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Create base tables that other modules can extend
	queries := []string{
		`CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		// Example table using BaseModel pattern
		`CREATE TABLE IF NOT EXISTS example_entities (
			id TEXT PRIMARY KEY,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			name TEXT NOT NULL,
			description TEXT
		)`,
	}

	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return wrapError("init", err)
	}
	defer tx.Rollback()

	for _, query := range queries {
		if _, err := tx.ExecContext(ctx, query); err != nil {
			return wrapError("init", fmt.Errorf("failed to execute query: %w", err))
		}
	}

	if err := tx.Commit(); err != nil {
		return wrapError("init", err)
	}

	return nil
}

// ExecContext executes a query with context support
func (d *Database) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.closed {
		return nil, wrapError("exec", fmt.Errorf("database is closed"))
	}

	result, err := d.db.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, wrapError("exec", err)
	}

	return result, nil
}

// QueryContext executes a query that returns rows with context support
func (d *Database) QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.closed {
		return nil, wrapError("query", fmt.Errorf("database is closed"))
	}

	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, wrapError("query", err)
	}

	return rows, nil
}

// QueryRowContext executes a query that returns a single row with context support
func (d *Database) QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row {
	d.mu.RLock()
	defer d.mu.RUnlock()

	return d.db.QueryRowContext(ctx, query, args...)
}

// BeginTx starts a transaction with context support
func (d *Database) BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.closed {
		return nil, wrapError("begin_tx", fmt.Errorf("database is closed"))
	}

	tx, err := d.db.BeginTx(ctx, opts)
	if err != nil {
		return nil, wrapError("begin_tx", err)
	}

	return tx, nil
}

// Ping verifies the database connection is still alive
func (d *Database) Ping(ctx context.Context) error {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.closed {
		return wrapError("ping", fmt.Errorf("database is closed"))
	}

	if err := d.db.PingContext(ctx); err != nil {
		return wrapError("ping", err)
	}

	return nil
}

// Stats returns database statistics
func (d *Database) Stats() sql.DBStats {
	d.mu.RLock()
	defer d.mu.RUnlock()

	return d.db.Stats()
}

// Close implements io.Closer and gracefully shuts down the database connection
func (d *Database) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.closed {
		return nil
	}

	d.closed = true

	if err := d.db.Close(); err != nil {
		return wrapError("close", err)
	}

	return nil
}

// IsClosed returns whether the database connection is closed
func (d *Database) IsClosed() bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.closed
}

// WithTransaction executes a function within a database transaction
// The transaction is automatically committed if the function returns nil,
// or rolled back if it returns an error or panics
func (d *Database) WithTransaction(ctx context.Context, fn func(*sql.Tx) error) error {
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
			return wrapError("transaction", fmt.Errorf("tx failed: %v, rollback failed: %v", err, rbErr))
		}
		return wrapError("transaction", err)
	}

	if err := tx.Commit(); err != nil {
		return wrapError("transaction", err)
	}

	return nil
}

// Example usage and testing helpers

// ExampleEntity demonstrates how to use BaseModel in your entities
type ExampleEntity struct {
	BaseModel
	Name        string `json:"name" db:"name"`
	Description string `json:"description" db:"description"`
}

// NewExampleEntity creates a new example entity
func NewExampleEntity(name, description string) *ExampleEntity {
	return &ExampleEntity{
		BaseModel:   NewBaseModel(),
		Name:        name,
		Description: description,
	}
}

// Save demonstrates how to implement a save method using the database
func (e *ExampleEntity) Save(ctx context.Context, db *Database) error {
	e.UpdateTimestamp()

	query := `INSERT OR REPLACE INTO example_entities (id, created_at, updated_at, name, description) 
			  VALUES (?, ?, ?, ?, ?)`

	_, err := db.ExecContext(ctx, query, e.ID, e.CreatedAt, e.UpdatedAt, e.Name, e.Description)
	return err
}

// FindExampleByID demonstrates how to implement a find method
func FindExampleByID(ctx context.Context, db *Database, id string) (*ExampleEntity, error) {
	query := `SELECT id, created_at, updated_at, name, description FROM example_entities WHERE id = ?`

	row := db.QueryRowContext(ctx, query, id)

	var entity ExampleEntity
	err := row.Scan(&entity.ID, &entity.CreatedAt, &entity.UpdatedAt, &entity.Name, &entity.Description)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Not found
		}
		return nil, wrapError("find", err)
	}

	return &entity, nil
}

// Health check function for monitoring
func (d *Database) HealthCheck(ctx context.Context) error {
	// Check if database is closed
	if d.IsClosed() {
		return fmt.Errorf("database connection is closed")
	}

	// Ping database
	if err := d.Ping(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	// Check connection pool stats
	stats := d.Stats()
	if stats.OpenConnections == 0 {
		return fmt.Errorf("no open database connections")
	}

	return nil
}