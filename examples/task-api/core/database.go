// Package database provides database connection management, session handling,
// and base model structures for the application.
//
// Example usage:
//
//	config := &database.Config{
//		DatabaseURL: "file:./app.db?cache=shared&mode=rwc",
//		MaxOpenConns: 25,
//		MaxIdleConns: 5,
//	}
//
//	db, err := database.NewDatabase(config)
//	if err != nil {
//		log.Fatal(err)
//	}
//	defer db.Close()
//
//	// Initialize schema
//	if err := db.InitDB(context.Background()); err != nil {
//		log.Fatal(err)
//	}
//
//	// Use in handlers
//	conn, err := db.GetDB(ctx)
//	if err != nil {
//		return err
//	}
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
	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"
)

// Default configuration values
const (
	DefaultDatabaseURL      = "./tasks.db"
	DefaultMaxOpenConns     = 25
	DefaultMaxIdleConns     = 5
	DefaultConnMaxLifetime  = 5 * time.Minute
	DefaultConnMaxIdleTime  = 1 * time.Minute
	DefaultConnectTimeout   = 10 * time.Second
	DefaultQueryTimeout     = 30 * time.Second
	DefaultMaxRetries       = 3
	DefaultRetryBaseDelay   = 100 * time.Millisecond
)

// Custom error types for database operations
var (
	ErrDatabaseNotInitialized = fmt.Errorf("database not initialized")
	ErrConnectionFailed       = fmt.Errorf("database connection failed")
	ErrContextCancelled       = fmt.Errorf("context cancelled")
	ErrConnectionTimeout      = fmt.Errorf("connection timeout")
	ErrTransactionFailed      = fmt.Errorf("transaction failed")
)

// DatabaseError wraps database-specific errors with additional context
type DatabaseError struct {
	Op      string // Operation that failed
	Err     error  // Underlying error
	Context string // Additional context
}

func (e *DatabaseError) Error() string {
	if e.Context != "" {
		return fmt.Sprintf("database %s failed: %v (context: %s)", e.Op, e.Err, e.Context)
	}
	return fmt.Sprintf("database %s failed: %v", e.Op, e.Err)
}

func (e *DatabaseError) Unwrap() error {
	return e.Err
}

// Config holds database configuration parameters
type Config struct {
	// DatabaseURL is the connection string for the database
	// Default: "./tasks.db"
	DatabaseURL string

	// Connection pool settings
	MaxOpenConns    int           // Maximum number of open connections
	MaxIdleConns    int           // Maximum number of idle connections
	ConnMaxLifetime time.Duration // Maximum connection lifetime
	ConnMaxIdleTime time.Duration // Maximum connection idle time

	// Timeout settings
	ConnectTimeout time.Duration // Connection establishment timeout
	QueryTimeout   time.Duration // Default query timeout

	// Retry settings
	MaxRetries    int           // Maximum number of connection retries
	RetryBaseDelay time.Duration // Base delay for exponential backoff
}

// LoadConfigFromEnv loads configuration from environment variables with fallback defaults
func LoadConfigFromEnv() *Config {
	config := &Config{
		DatabaseURL:     getEnvString("DATABASE_URL", DefaultDatabaseURL),
		MaxOpenConns:    getEnvInt("DB_MAX_OPEN_CONNS", DefaultMaxOpenConns),
		MaxIdleConns:    getEnvInt("DB_MAX_IDLE_CONNS", DefaultMaxIdleConns),
		ConnMaxLifetime: getEnvDuration("DB_CONN_MAX_LIFETIME", DefaultConnMaxLifetime),
		ConnMaxIdleTime: getEnvDuration("DB_CONN_MAX_IDLE_TIME", DefaultConnMaxIdleTime),
		ConnectTimeout:  getEnvDuration("DB_CONNECT_TIMEOUT", DefaultConnectTimeout),
		QueryTimeout:    getEnvDuration("DB_QUERY_TIMEOUT", DefaultQueryTimeout),
		MaxRetries:      getEnvInt("DB_MAX_RETRIES", DefaultMaxRetries),
		RetryBaseDelay:  getEnvDuration("DB_RETRY_BASE_DELAY", DefaultRetryBaseDelay),
	}

	return config
}

// BaseModel provides common fields for all database entities
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

// Touch updates the UpdatedAt timestamp
func (bm *BaseModel) Touch() {
	bm.UpdatedAt = time.Now().UTC()
}

// ModelInterface defines the interface that all models should implement
type ModelInterface interface {
	GetID() string
	GetCreatedAt() time.Time
	GetUpdatedAt() time.Time
	Touch()
}

// Implement ModelInterface for BaseModel
func (bm *BaseModel) GetID() string        { return bm.ID }
func (bm *BaseModel) GetCreatedAt() time.Time { return bm.CreatedAt }
func (bm *BaseModel) GetUpdatedAt() time.Time { return bm.UpdatedAt }

// Database manages database connections and provides session access
type Database struct {
	db     *sqlx.DB
	config *Config
	mu     sync.RWMutex
	closed bool
}

// NewDatabase initializes a new database connection with the provided configuration
func NewDatabase(config *Config) (*Database, error) {
	if config == nil {
		config = LoadConfigFromEnv()
	}

	database := &Database{
		config: config,
	}

	if err := database.connect(); err != nil {
		return nil, &DatabaseError{
			Op:  "initialize",
			Err: err,
		}
	}

	log.Printf("Database initialized successfully with URL: %s", config.DatabaseURL)
	return database, nil
}

// connect establishes the database connection with retry logic
func (d *Database) connect() error {
	var db *sqlx.DB
	var err error

	for attempt := 0; attempt <= d.config.MaxRetries; attempt++ {
		if attempt > 0 {
			delay := time.Duration(attempt) * d.config.RetryBaseDelay
			log.Printf("Retrying database connection in %v (attempt %d/%d)", delay, attempt, d.config.MaxRetries)
			time.Sleep(delay)
		}

		// Create context with timeout for connection
		ctx, cancel := context.WithTimeout(context.Background(), d.config.ConnectTimeout)
		
		db, err = sqlx.ConnectContext(ctx, "sqlite3", d.config.DatabaseURL)
		cancel()

		if err == nil {
			break
		}

		log.Printf("Database connection attempt %d failed: %v", attempt+1, err)
	}

	if err != nil {
		return &DatabaseError{
			Op:  "connect",
			Err: err,
			Context: fmt.Sprintf("failed after %d attempts", d.config.MaxRetries+1),
		}
	}

	// Configure connection pool
	db.SetMaxOpenConns(d.config.MaxOpenConns)
	db.SetMaxIdleConns(d.config.MaxIdleConns)
	db.SetConnMaxLifetime(d.config.ConnMaxLifetime)
	db.SetConnMaxIdleTime(d.config.ConnMaxIdleTime)

	d.db = db
	return nil
}

// GetDB returns the database connection for dependency injection
// This method is thread-safe and includes context-aware timeout handling
func (d *Database) GetDB(ctx context.Context) (*sqlx.DB, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.closed {
		return nil, &DatabaseError{
			Op:  "get_connection",
			Err: ErrDatabaseNotInitialized,
		}
	}

	if d.db == nil {
		return nil, &DatabaseError{
			Op:  "get_connection",
			Err: ErrDatabaseNotInitialized,
		}
	}

	// Check if context is already cancelled
	select {
	case <-ctx.Done():
		return nil, &DatabaseError{
			Op:  "get_connection",
			Err: ErrContextCancelled,
		}
	default:
	}

	return d.db, nil
}

// InitDB creates the necessary tables and sets up the database schema
func (d *Database) InitDB(ctx context.Context) error {
	db, err := d.GetDB(ctx)
	if err != nil {
		return err
	}

	// Enable foreign keys for SQLite
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON"); err != nil {
		return &DatabaseError{
			Op:  "init_schema",
			Err: err,
			Context: "failed to enable foreign keys",
		}
	}

	// Enable WAL mode for better concurrency
	if _, err := db.ExecContext(ctx, "PRAGMA journal_mode = WAL"); err != nil {
		return &DatabaseError{
			Op:  "init_schema",
			Err: err,
			Context: "failed to enable WAL mode",
		}
	}

	// Create migrations table for future use
	createMigrationsTable := `
	CREATE TABLE IF NOT EXISTS migrations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		version TEXT NOT NULL UNIQUE,
		applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`

	if _, err := db.ExecContext(ctx, createMigrationsTable); err != nil {
		return &DatabaseError{
			Op:  "init_schema",
			Err: err,
			Context: "failed to create migrations table",
		}
	}

	// Example: Create a sample tasks table demonstrating BaseModel usage
	createTasksTable := `
	CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		description TEXT,
		completed BOOLEAN DEFAULT FALSE,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL
	)`

	if _, err := db.ExecContext(ctx, createTasksTable); err != nil {
		return &DatabaseError{
			Op:  "init_schema",
			Err: err,
			Context: "failed to create tasks table",
		}
	}

	log.Println("Database schema initialized successfully")
	return nil
}

// Ping checks the database connection health
func (d *Database) Ping(ctx context.Context) error {
	db, err := d.GetDB(ctx)
	if err != nil {
		return err
	}

	if err := db.PingContext(ctx); err != nil {
		return &DatabaseError{
			Op:  "ping",
			Err: err,
		}
	}

	return nil
}

// Close gracefully shuts down the database connection
func (d *Database) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.closed || d.db == nil {
		return nil
	}

	err := d.db.Close()
	d.closed = true
	d.db = nil

	if err != nil {
		return &DatabaseError{
			Op:  "close",
			Err: err,
		}
	}

	log.Println("Database connection closed successfully")
	return nil
}

// Transaction helpers

// TxFunc represents a function that can be executed within a transaction
type TxFunc func(*sqlx.Tx) error

// WithTransaction executes a function within a database transaction
// It automatically handles commit/rollback based on the function's return value
func (d *Database) WithTransaction(ctx context.Context, fn TxFunc) error {
	db, err := d.GetDB(ctx)
	if err != nil {
		return err
	}

	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return &DatabaseError{
			Op:  "begin_transaction",
			Err: err,
		}
	}

	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p) // Re-throw panic after rollback
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return &DatabaseError{
				Op:  "transaction",
				Err: fmt.Errorf("transaction failed: %v, rollback failed: %v", err, rbErr),
			}
		}
		return &DatabaseError{
			Op:  "transaction",
			Err: err,
		}
	}

	if err := tx.Commit(); err != nil {
		return &DatabaseError{
			Op:  "commit_transaction",
			Err: err,
		}
	}

	return nil
}

// Utility functions for environment variable parsing

func getEnvString(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if parsed, err := time.ParseDuration(value); err == nil {
			return parsed
		}
	}
	return defaultValue
}

// Example Task model demonstrating BaseModel usage
type Task struct {
	BaseModel
	Title       string `db:"title" json:"title"`
	Description string `db:"description" json:"description"`
	Completed   bool   `db:"completed" json:"completed"`
}

// NewTask creates a new task with initialized BaseModel
func NewTask(title, description string) *Task {
	return &Task{
		BaseModel:   NewBaseModel(),
		Title:       title,
		Description: description,
		Completed:   false,
	}
}

// Repository pattern example for Task
type TaskRepository struct {
	db *Database
}

// NewTaskRepository creates a new task repository
func NewTaskRepository(db *Database) *TaskRepository {
	return &TaskRepository{db: db}
}

// Create inserts a new task into the database
func (r *TaskRepository) Create(ctx context.Context, task *Task) error {
	db, err := r.db.GetDB(ctx)
	if err != nil {
		return err
	}

	query := `
		INSERT INTO tasks (id, title, description, completed, created_at, updated_at)
		VALUES (:id, :title, :description, :completed, :created_at, :updated_at)
	`

	_, err = db.NamedExecContext(ctx, query, task)
	if err != nil {
		return &DatabaseError{
			Op:  "create_task",
			Err: err,
		}
	}

	return nil
}