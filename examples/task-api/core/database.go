// Package database provides database connection and session management functionality
// with support for SQLite, connection pooling, and dependency injection patterns.
package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
)

// Common database errors
var (
	ErrConnectionFailed    = errors.New("database connection failed")
	ErrInvalidURL         = errors.New("invalid database URL")
	ErrMigrationFailed    = errors.New("database migration failed")
	ErrConnectionTimeout  = errors.New("database connection timeout")
	ErrDatabaseLocked     = errors.New("database is locked")
	ErrConstraintViolation = errors.New("database constraint violation")
)

// DatabaseError represents a custom database error with additional context
type DatabaseError struct {
	Op      string // Operation that failed
	Err     error  // Underlying error
	Code    string // Error code for categorization
	Message string // Human-readable message
}

func (e *DatabaseError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("database error in %s: %s (%s)", e.Op, e.Message, e.Code)
	}
	return fmt.Sprintf("database error in %s: %v", e.Op, e.Err)
}

func (e *DatabaseError) Unwrap() error {
	return e.Err
}

// Config holds database configuration settings
type Config struct {
	DatabaseURL      string        `json:"database_url"`
	MaxOpenConns     int           `json:"max_open_conns"`
	MaxIdleConns     int           `json:"max_idle_conns"`
	ConnMaxLifetime  time.Duration `json:"conn_max_lifetime"`
	ConnMaxIdleTime  time.Duration `json:"conn_max_idle_time"`
	ConnTimeout      time.Duration `json:"conn_timeout"`
	RetryAttempts    int           `json:"retry_attempts"`
	RetryBaseDelay   time.Duration `json:"retry_base_delay"`
	EnableWALMode    bool          `json:"enable_wal_mode"`
	EnableForeignKeys bool         `json:"enable_foreign_keys"`
}

// DefaultConfig returns a configuration with sensible defaults
func DefaultConfig() *Config {
	return &Config{
		DatabaseURL:       getEnvOrDefault("DATABASE_URL", "./tasks.db"),
		MaxOpenConns:      25,
		MaxIdleConns:      5,
		ConnMaxLifetime:   5 * time.Minute,
		ConnMaxIdleTime:   1 * time.Minute,
		ConnTimeout:       10 * time.Second,
		RetryAttempts:     3,
		RetryBaseDelay:    100 * time.Millisecond,
		EnableWALMode:     true,
		EnableForeignKeys: true,
	}
}

// BaseModel provides common fields for all database models
type BaseModel struct {
	ID        uuid.UUID  `json:"id" db:"id"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// NewBaseModel creates a new BaseModel with generated UUID and timestamps
func NewBaseModel() BaseModel {
	now := time.Now().UTC()
	return BaseModel{
		ID:        uuid.New(),
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// Touch updates the UpdatedAt timestamp
func (bm *BaseModel) Touch() {
	bm.UpdatedAt = time.Now().UTC()
}

// SoftDelete sets the DeletedAt timestamp for soft deletion
func (bm *BaseModel) SoftDelete() {
	now := time.Now().UTC()
	bm.DeletedAt = &now
	bm.UpdatedAt = now
}

// IsDeleted returns true if the model has been soft deleted
func (bm *BaseModel) IsDeleted() bool {
	return bm.DeletedAt != nil
}

// DatabaseInterface defines the interface for database operations
type DatabaseInterface interface {
	DB() *sql.DB
	Close() error
	Ping(ctx context.Context) error
	BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
	Migrate(ctx context.Context) error
	HealthCheck(ctx context.Context) error
}

// Manager handles database connections and provides session management
type Manager struct {
	db     *sql.DB
	config *Config
	mu     sync.RWMutex
	closed bool
}

// Global database manager instance
var (
	globalManager *Manager
	managerOnce   sync.Once
)

// Initialize initializes the global database manager with the provided configuration
func Initialize(config *Config) error {
	var initErr error
	managerOnce.Do(func() {
		globalManager, initErr = NewManager(config)
	})
	return initErr
}

// GetManager returns the global database manager instance
func GetManager() *Manager {
	if globalManager == nil {
		panic("database manager not initialized - call Initialize() first")
	}
	return globalManager
}

// NewManager creates a new database manager with the given configuration
func NewManager(config *Config) (*Manager, error) {
	if config == nil {
		config = DefaultConfig()
	}

	if err := validateConfig(config); err != nil {
		return nil, &DatabaseError{
			Op:      "NewManager",
			Err:     err,
			Code:    "INVALID_CONFIG",
			Message: "invalid database configuration",
		}
	}

	manager := &Manager{
		config: config,
	}

	if err := manager.connect(); err != nil {
		return nil, err
	}

	return manager, nil
}

// connect establishes the database connection with retry logic
func (m *Manager) connect() error {
	var db *sql.DB
	var err error

	// Retry connection with exponential backoff
	for attempt := 0; attempt < m.config.RetryAttempts; attempt++ {
		db, err = m.attemptConnection()
		if err == nil {
			break
		}

		if attempt < m.config.RetryAttempts-1 {
			delay := m.config.RetryBaseDelay * time.Duration(1<<attempt)
			log.Printf("Database connection attempt %d failed, retrying in %v: %v", 
				attempt+1, delay, err)
			time.Sleep(delay)
		}
	}

	if err != nil {
		return &DatabaseError{
			Op:      "connect",
			Err:     err,
			Code:    "CONNECTION_FAILED",
			Message: "failed to establish database connection after retries",
		}
	}

	m.mu.Lock()
	m.db = db
	m.mu.Unlock()

	return nil
}

// attemptConnection attempts to establish a single database connection
func (m *Manager) attemptConnection() (*sql.DB, error) {
	// Ensure directory exists for file-based databases
	if err := m.ensureDirectoryExists(); err != nil {
		return nil, err
	}

	// Build connection string with SQLite-specific options
	connStr := m.buildConnectionString()

	ctx, cancel := context.WithTimeout(context.Background(), m.config.ConnTimeout)
	defer cancel()

	db, err := sql.Open("sqlite3", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(m.config.MaxOpenConns)
	db.SetMaxIdleConns(m.config.MaxIdleConns)
	db.SetConnMaxLifetime(m.config.ConnMaxLifetime)
	db.SetConnMaxIdleTime(m.config.ConnMaxIdleTime)

	// Test the connection
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Configure SQLite-specific settings
	if err := m.configureSQLite(ctx, db); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to configure SQLite: %w", err)
	}

	return db, nil
}

// ensureDirectoryExists creates the directory for the database file if it doesn't exist
func (m *Manager) ensureDirectoryExists() error {
	if m.config.DatabaseURL == ":memory:" {
		return nil
	}

	dir := filepath.Dir(m.config.DatabaseURL)
	if dir == "." {
		return nil
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create database directory: %w", err)
	}

	return nil
}

// buildConnectionString constructs the SQLite connection string with options
func (m *Manager) buildConnectionString() string {
	connStr := m.config.DatabaseURL

	// Add SQLite-specific parameters
	params := []string{}

	if m.config.EnableForeignKeys {
		params = append(params, "_foreign_keys=on")
	}

	if m.config.EnableWALMode {
		params = append(params, "_journal_mode=WAL")
	}

	// Add busy timeout to handle locking
	params = append(params, "_busy_timeout=5000")

	// Add synchronous mode for better performance with WAL
	if m.config.EnableWALMode {
		params = append(params, "_synchronous=NORMAL")
	}

	if len(params) > 0 {
		if strings.Contains(connStr, "?") {
			connStr += "&" + strings.Join(params, "&")
		} else {
			connStr += "?" + strings.Join(params, "&")
		}
	}

	return connStr
}

// configureSQLite applies SQLite-specific configuration
func (m *Manager) configureSQLite(ctx context.Context, db *sql.DB) error {
	pragmas := []string{}

	if m.config.EnableForeignKeys {
		pragmas = append(pragmas, "PRAGMA foreign_keys = ON")
	}

	if m.config.EnableWALMode {
		pragmas = append(pragmas, "PRAGMA journal_mode = WAL")
		pragmas = append(pragmas, "PRAGMA synchronous = NORMAL")
	}

	pragmas = append(pragmas, "PRAGMA busy_timeout = 5000")
	pragmas = append(pragmas, "PRAGMA temp_store = memory")
	pragmas = append(pragmas, "PRAGMA mmap_size = 268435456") // 256MB

	for _, pragma := range pragmas {
		if _, err := db.ExecContext(ctx, pragma); err != nil {
			return fmt.Errorf("failed to execute pragma %s: %w", pragma, err)
		}
	}

	return nil
}

// DB returns the underlying sql.DB instance
func (m *Manager) DB() *sql.DB {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.db
}

// Close closes the database connection
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed || m.db == nil {
		return nil
	}

	err := m.db.Close()
	m.closed = true
	m.db = nil

	if err != nil {
		return &DatabaseError{
			Op:      "Close",
			Err:     err,
			Code:    "CLOSE_FAILED",
			Message: "failed to close database connection",
		}
	}

	return nil
}

// Ping checks if the database connection is alive
func (m *Manager) Ping(ctx context.Context) error {
	m.mu.RLock()
	db := m.db
	closed := m.closed
	m.mu.RUnlock()

	if closed || db == nil {
		return &DatabaseError{
			Op:      "Ping",
			Err:     errors.New("database connection is closed"),
			Code:    "CONNECTION_CLOSED",
			Message: "database connection is not available",
		}
	}

	if err := db.PingContext(ctx); err != nil {
		return &DatabaseError{
			Op:      "Ping",
			Err:     err,
			Code:    "PING_FAILED",
			Message: "database ping failed",
		}
	}

	return nil
}

// BeginTx starts a new database transaction
func (m *Manager) BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error) {
	m.mu.RLock()
	db := m.db
	closed := m.closed
	m.mu.RUnlock()

	if closed || db == nil {
		return nil, &DatabaseError{
			Op:      "BeginTx",
			Err:     errors.New("database connection is closed"),
			Code:    "CONNECTION_CLOSED",
			Message: "cannot start transaction on closed connection",
		}
	}

	tx, err := db.BeginTx(ctx, opts)
	if err != nil {
		return nil, &DatabaseError{
			Op:      "BeginTx",
			Err:     err,
			Code:    "TRANSACTION_FAILED",
			Message: "failed to start database transaction",
		}
	}

	return tx, nil
}

// HealthCheck performs a comprehensive health check of the database
func (m *Manager) HealthCheck(ctx context.Context) error {
	// Check if connection is available
	if err := m.Ping(ctx); err != nil {
		return err
	}

	// Perform a simple query to verify database functionality
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	var result int
	err := db.QueryRowContext(ctx, "SELECT 1").Scan(&result)
	if err != nil {
		return &DatabaseError{
			Op:      "HealthCheck",
			Err:     err,
			Code:    "HEALTH_CHECK_FAILED",
			Message: "database health check query failed",
		}
	}

	if result != 1 {
		return &DatabaseError{
			Op:      "HealthCheck",
			Err:     fmt.Errorf("unexpected result: %d", result),
			Code:    "HEALTH_CHECK_FAILED",
			Message: "database health check returned unexpected result",
		}
	}

	return nil
}

// Migrate runs database migrations to create necessary tables
func (m *Manager) Migrate(ctx context.Context) error {
	m.mu.RLock()
	db := m.db
	closed := m.closed
	m.mu.RUnlock()

	if closed || db == nil {
		return &DatabaseError{
			Op:      "Migrate",
			Err:     errors.New("database connection is closed"),
			Code:    "CONNECTION_CLOSED",
			Message: "cannot run migrations on closed connection",
		}
	}

	// Create migrations table if it doesn't exist
	if err := m.createMigrationsTable(ctx, db); err != nil {
		return err
	}

	// Run migrations
	migrations := m.getMigrations()
	for _, migration := range migrations {
		if err := m.runMigration(ctx, db, migration); err != nil {
			return &DatabaseError{
				Op:      "Migrate",
				Err:     err,
				Code:    "MIGRATION_FAILED