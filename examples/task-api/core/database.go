// Package database provides database connection and session management
// for SQLite with support for connection pooling, async operations,
// and dependency injection patterns.
package database

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

// Database configuration constants
const (
	DefaultDatabaseURL     = "./tasks.db"
	DefaultMaxOpenConns    = 25
	DefaultMaxIdleConns    = 5
	DefaultConnMaxLifetime = 5 * time.Minute
	DefaultConnMaxIdleTime = 1 * time.Minute
	DefaultConnectTimeout  = 10 * time.Second
	DefaultQueryTimeout    = 30 * time.Second
)

// DatabaseConfig holds configuration for database connection
type DatabaseConfig struct {
	DatabaseURL     string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
	ConnectTimeout  time.Duration
	QueryTimeout    time.Duration
	EnableWAL       bool
	EnableForeignKeys bool
}

// DefaultConfig returns a default database configuration
func DefaultConfig() *DatabaseConfig {
	return &DatabaseConfig{
		DatabaseURL:     getEnv("DATABASE_URL", DefaultDatabaseURL),
		MaxOpenConns:    DefaultMaxOpenConns,
		MaxIdleConns:    DefaultMaxIdleConns,
		ConnMaxLifetime: DefaultConnMaxLifetime,
		ConnMaxIdleTime: DefaultConnMaxIdleTime,
		ConnectTimeout:  DefaultConnectTimeout,
		QueryTimeout:    DefaultQueryTimeout,
		EnableWAL:       true,
		EnableForeignKeys: true,
	}
}

// DatabaseError represents database-specific errors
type DatabaseError struct {
	Op  string
	Err error
}

func (e *DatabaseError) Error() string {
	return fmt.Sprintf("database operation %s failed: %v", e.Op, e.Err)
}

func (e *DatabaseError) Unwrap() error {
	return e.Err
}

// Database interface for dependency injection and testing
type Database interface {
	DB() *sql.DB
	Ping(ctx context.Context) error
	Close() error
	BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

// SQLiteDatabase implements Database interface
type SQLiteDatabase struct {
	db     *sql.DB
	config *DatabaseConfig
	logger *slog.Logger
	mu     sync.RWMutex
	closed bool
}

// Global database instance
var (
	instance Database
	once     sync.Once
)

// BaseModel provides common fields for all database models
type BaseModel struct {
	ID        uuid.UUID `db:"id" json:"id"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
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

// NewDatabase creates a new database connection with the given configuration
func NewDatabase(config *DatabaseConfig) (Database, error) {
	if config == nil {
		config = DefaultConfig()
	}

	logger := slog.Default().With("component", "database")

	// Create context with timeout for connection
	ctx, cancel := context.WithTimeout(context.Background(), config.ConnectTimeout)
	defer cancel()

	// Build connection string with SQLite-specific options
	connStr := buildConnectionString(config)
	
	db, err := sql.Open("sqlite3", connStr)
	if err != nil {
		return nil, &DatabaseError{Op: "open", Err: err}
	}

	// Configure connection pool
	db.SetMaxOpenConns(config.MaxOpenConns)
	db.SetMaxIdleConns(config.MaxIdleConns)
	db.SetConnMaxLifetime(config.ConnMaxLifetime)
	db.SetConnMaxIdleTime(config.ConnMaxIdleTime)

	sqliteDB := &SQLiteDatabase{
		db:     db,
		config: config,
		logger: logger,
	}

	// Test connection
	if err := sqliteDB.Ping(ctx); err != nil {
		db.Close()
		return nil, &DatabaseError{Op: "ping", Err: err}
	}

	// Configure SQLite-specific settings
	if err := sqliteDB.configureSQLite(ctx); err != nil {
		db.Close()
		return nil, &DatabaseError{Op: "configure", Err: err}
	}

	logger.Info("Database connection established", 
		"url", config.DatabaseURL,
		"max_open_conns", config.MaxOpenConns,
		"max_idle_conns", config.MaxIdleConns)

	return sqliteDB, nil
}

// buildConnectionString constructs SQLite connection string with options
func buildConnectionString(config *DatabaseConfig) string {
	connStr := config.DatabaseURL + "?"
	
	params := []string{
		"_timeout=10000",
		"_journal_mode=WAL",
		"_synchronous=NORMAL",
		"_cache_size=1000",
		"_temp_store=memory",
	}
	
	if config.EnableForeignKeys {
		params = append(params, "_foreign_keys=on")
	}
	
	for i, param := range params {
		if i > 0 {
			connStr += "&"
		}
		connStr += param
	}
	
	return connStr
}

// configureSQLite sets SQLite-specific configuration
func (d *SQLiteDatabase) configureSQLite(ctx context.Context) error {
	queries := []string{
		"PRAGMA busy_timeout = 10000",
		"PRAGMA temp_store = memory",
		"PRAGMA mmap_size = 268435456", // 256MB
	}

	if d.config.EnableWAL {
		queries = append(queries, "PRAGMA journal_mode = WAL")
		queries = append(queries, "PRAGMA synchronous = NORMAL")
	}

	if d.config.EnableForeignKeys {
		queries = append(queries, "PRAGMA foreign_keys = ON")
	}

	for _, query := range queries {
		if _, err := d.db.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("failed to execute pragma %s: %w", query, err)
		}
	}

	return nil
}

// DB returns the underlying sql.DB instance
func (d *SQLiteDatabase) DB() *sql.DB {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.db
}

// Ping verifies database connection is alive
func (d *SQLiteDatabase) Ping(ctx context.Context) error {
	d.mu.RLock()
	defer d.mu.RUnlock()
	
	if d.closed {
		return &DatabaseError{Op: "ping", Err: fmt.Errorf("database is closed")}
	}
	
	if err := d.db.PingContext(ctx); err != nil {
		return &DatabaseError{Op: "ping", Err: err}
	}
	
	return nil
}

// Close closes the database connection
func (d *SQLiteDatabase) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	
	if d.closed {
		return nil
	}
	
	d.closed = true
	
	if err := d.db.Close(); err != nil {
		return &DatabaseError{Op: "close", Err: err}
	}
	
	d.logger.Info("Database connection closed")
	return nil
}

// BeginTx starts a new transaction
func (d *SQLiteDatabase) BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	
	if d.closed {
		return nil, &DatabaseError{Op: "begin_tx", Err: fmt.Errorf("database is closed")}
	}
	
	tx, err := d.db.BeginTx(ctx, opts)
	if err != nil {
		return nil, &DatabaseError{Op: "begin_tx", Err: err}
	}
	
	return tx, nil
}

// ExecContext executes a query without returning any rows
func (d *SQLiteDatabase) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	
	if d.closed {
		return nil, &DatabaseError{Op: "exec", Err: fmt.Errorf("database is closed")}
	}
	
	result, err := d.db.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, &DatabaseError{Op: "exec", Err: err}
	}
	
	return result, nil
}

// QueryContext executes a query that returns rows
func (d *SQLiteDatabase) QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	
	if d.closed {
		return nil, &DatabaseError{Op: "query", Err: fmt.Errorf("database is closed")}
	}
	
	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, &DatabaseError{Op: "query", Err: err}
	}
	
	return rows, nil
}

// QueryRowContext executes a query that returns at most one row
func (d *SQLiteDatabase) QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row {
	d.mu.RLock()
	defer d.mu.RUnlock()
	
	return d.db.QueryRowContext(ctx, query, args...)
}

// GetDB returns the global database instance (singleton pattern)
func GetDB() Database {
	once.Do(func() {
		db, err := NewDatabase(DefaultConfig())
		if err != nil {
			panic(fmt.Sprintf("failed to initialize database: %v", err))
		}
		instance = db
	})
	return instance
}

// InitDB initializes the database and creates necessary tables
func InitDB(ctx context.Context) error {
	db := GetDB()
	
	// Create base tables schema
	schema := `
	CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	
	-- Example table using BaseModel pattern
	CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		description TEXT,
		completed BOOLEAN DEFAULT FALSE,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL
	);
	
	-- Indexes for performance
	CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
	CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
	`
	
	if _, err := db.ExecContext(ctx, schema); err != nil {
		return &DatabaseError{Op: "init_schema", Err: err}
	}
	
	slog.Info("Database schema initialized successfully")
	return nil
}

// CloseDB closes the global database connection
func CloseDB() error {
	if instance != nil {
		return instance.Close()
	}
	return nil
}

// WithTransaction executes a function within a database transaction
func WithTransaction(ctx context.Context, db Database, fn func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	
	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p)
		}
	}()
	
	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return fmt.Errorf("transaction error: %v, rollback error: %v", err, rbErr)
		}
		return err
	}
	
	return tx.Commit()
}

// HealthCheck performs a comprehensive database health check
func HealthCheck(ctx context.Context, db Database) error {
	// Basic connectivity check
	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("ping failed: %w", err)
	}
	
	// Query execution check
	var result int
	err := db.QueryRowContext(ctx, "SELECT 1").Scan(&result)
	if err != nil {
		return fmt.Errorf("query test failed: %w", err)
	}
	
	if result != 1 {
		return fmt.Errorf("unexpected query result: %d", result)
	}
	
	return nil
}

// getEnv gets environment variable with fallback
func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

/*
Example Usage:

// Initialize database
ctx := context.Background()
if err := InitDB(ctx); err != nil {
    log.Fatal("Failed to initialize database:", err)
}

// Get database instance
db := GetDB()

// Use in application
type Task struct {
    BaseModel
    Title       string `db:"title" json:"title"`
    Description string `db:"description" json:"description"`
    Completed   bool   `db:"completed" json:"completed"`
}

// Create a new task
func CreateTask(ctx context.Context, title, description string) (*Task, error) {
    task := &Task{
        BaseModel:   NewBaseModel(),
        Title:       title,
        Description: description,
        Completed:   false,
    }
    
    query := `
        INSERT INTO tasks (id, title, description, completed, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `
    
    db := GetDB()
    _, err := db.ExecContext(ctx, query,
        task.ID.String(),
        task.Title,
        task.Description,
        task.Completed,
        task.CreatedAt,
        task.UpdatedAt,
    )
    
    if err != nil {
        return nil, err
    }
    
    return task, nil
}

// Use with transaction
func UpdateTaskWithHistory(ctx context.Context, taskID uuid.UUID, title string) error {
    db := GetDB()
    
    return WithTransaction(ctx, db, func(tx *sql.Tx) error {
        // Update task
        _, err := tx.ExecContext(ctx,
            "UPDATE tasks SET title = ?, updated_at = ? WHERE id = ?",
            title, time.Now().UTC(), taskID.String())
        if err != nil {
            return err
        }
        
        // Insert history record
        _, err = tx.ExecContext