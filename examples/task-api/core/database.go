// Package database provides database connection and session management for SQLite
// with async support, connection pooling, and proper lifecycle management.
package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite" // SQLite driver
)

// DatabaseInterface defines the contract for database operations
type DatabaseInterface interface {
	GetDB(ctx context.Context) (*sql.DB, error)
	InitDB(ctx context.Context) error
	CloseDB() error
	HealthCheck(ctx context.Context) error
	BeginTx(ctx context.Context) (*sql.Tx, error)
}

// Config holds database configuration settings
type Config struct {
	DatabaseURL     string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
	RetryAttempts   int
	RetryDelay      time.Duration
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

// Manager handles database connections and operations
type Manager struct {
	config *Config
	db     *sql.DB
	once   sync.Once
	mu     sync.RWMutex
	closed bool
}

var (
	instance *Manager
	initOnce sync.Once
)

// GetManager returns the singleton database manager instance
func GetManager() *Manager {
	initOnce.Do(func() {
		instance = &Manager{
			config: loadConfig(),
		}
	})
	return instance
}

// loadConfig loads database configuration from environment variables
func loadConfig() *Config {
	config := &Config{
		DatabaseURL:     getEnvOrDefault("DATABASE_URL", "./tasks.db"),
		MaxOpenConns:    getEnvIntOrDefault("DB_MAX_OPEN_CONNS", 25),
		MaxIdleConns:    getEnvIntOrDefault("DB_MAX_IDLE_CONNS", 5),
		ConnMaxLifetime: getEnvDurationOrDefault("DB_CONN_MAX_LIFETIME", 5*time.Minute),
		ConnMaxIdleTime: getEnvDurationOrDefault("DB_CONN_MAX_IDLE_TIME", 5*time.Minute),
		RetryAttempts:   getEnvIntOrDefault("DB_RETRY_ATTEMPTS", 3),
		RetryDelay:      getEnvDurationOrDefault("DB_RETRY_DELAY", time.Second),
	}

	// Ensure database directory exists
	if err := ensureDatabaseDir(config.DatabaseURL); err != nil {
		log.Printf("Warning: Failed to ensure database directory: %v", err)
	}

	return config
}

// getEnvOrDefault returns environment variable value or default
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvIntOrDefault returns environment variable as int or default
func getEnvIntOrDefault(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

// getEnvDurationOrDefault returns environment variable as duration or default
func getEnvDurationOrDefault(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

// ensureDatabaseDir creates the database directory if it doesn't exist
func ensureDatabaseDir(dbPath string) error {
	dir := filepath.Dir(dbPath)
	if dir == "." {
		return nil // Current directory
	}
	return os.MkdirAll(dir, 0755)
}

// GetDB returns the database connection, initializing it if necessary
func (m *Manager) GetDB(ctx context.Context) (*sql.DB, error) {
	m.mu.RLock()
	if m.db != nil && !m.closed {
		m.mu.RUnlock()
		return m.db, nil
	}
	m.mu.RUnlock()

	var initErr error
	m.once.Do(func() {
		initErr = m.initializeConnection(ctx)
	})

	if initErr != nil {
		return nil, fmt.Errorf("failed to initialize database connection: %w", initErr)
	}

	m.mu.RLock()
	defer m.mu.RUnlock()
	
	if m.closed {
		return nil, fmt.Errorf("database connection is closed")
	}

	return m.db, nil
}

// initializeConnection establishes the database connection with retry logic
func (m *Manager) initializeConnection(ctx context.Context) error {
	var db *sql.DB
	var err error

	for attempt := 0; attempt < m.config.RetryAttempts; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(m.config.RetryDelay * time.Duration(attempt)):
			}
		}

		db, err = sql.Open("sqlite", m.config.DatabaseURL)
		if err != nil {
			log.Printf("Database connection attempt %d failed: %v", attempt+1, err)
			continue
		}

		// Configure connection pool
		db.SetMaxOpenConns(m.config.MaxOpenConns)
		db.SetMaxIdleConns(m.config.MaxIdleConns)
		db.SetConnMaxLifetime(m.config.ConnMaxLifetime)
		db.SetConnMaxIdleTime(m.config.ConnMaxIdleTime)

		// Test the connection
		pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err = db.PingContext(pingCtx)
		cancel()

		if err != nil {
			db.Close()
			log.Printf("Database ping attempt %d failed: %v", attempt+1, err)
			continue
		}

		m.mu.Lock()
		m.db = db
		m.closed = false
		m.mu.Unlock()

		log.Printf("Database connection established successfully")
		return nil
	}

	return fmt.Errorf("failed to establish database connection after %d attempts: %w", 
		m.config.RetryAttempts, err)
}

// InitDB initializes the database and creates necessary tables
func (m *Manager) InitDB(ctx context.Context) error {
	db, err := m.GetDB(ctx)
	if err != nil {
		return fmt.Errorf("failed to get database connection: %w", err)
	}

	// Enable foreign keys and other SQLite optimizations
	pragmas := []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = NORMAL",
		"PRAGMA cache_size = 1000",
		"PRAGMA temp_store = memory",
	}

	for _, pragma := range pragmas {
		if _, err := db.ExecContext(ctx, pragma); err != nil {
			return fmt.Errorf("failed to execute pragma %s: %w", pragma, err)
		}
	}

	// Create base tables - example implementation
	if err := m.createBaseTables(ctx, db); err != nil {
		return fmt.Errorf("failed to create base tables: %w", err)
	}

	log.Printf("Database initialized successfully")
	return nil
}

// createBaseTables creates the base tables for the application
func (m *Manager) createBaseTables(ctx context.Context, db *sql.DB) error {
	// Example table creation - modify according to your needs
	createTablesSQL := `
	CREATE TABLE IF NOT EXISTS migrations (
		id TEXT PRIMARY KEY,
		version INTEGER NOT NULL,
		applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		description TEXT,
		completed BOOLEAN DEFAULT FALSE,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
	CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
	`

	_, err := db.ExecContext(ctx, createTablesSQL)
	return err
}

// CloseDB closes the database connection gracefully
func (m *Manager) CloseDB() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.db == nil || m.closed {
		return nil
	}

	err := m.db.Close()
	m.closed = true
	
	if err != nil {
		return fmt.Errorf("failed to close database connection: %w", err)
	}

	log.Printf("Database connection closed successfully")
	return nil
}

// HealthCheck verifies the database connection is healthy
func (m *Manager) HealthCheck(ctx context.Context) error {
	db, err := m.GetDB(ctx)
	if err != nil {
		return fmt.Errorf("health check failed - cannot get database: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if err := db.PingContext(pingCtx); err != nil {
		return fmt.Errorf("health check failed - ping error: %w", err)
	}

	// Test with a simple query
	var result int
	queryCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	err = db.QueryRowContext(queryCtx, "SELECT 1").Scan(&result)
	if err != nil {
		return fmt.Errorf("health check failed - query error: %w", err)
	}

	return nil
}

// BeginTx starts a new database transaction
func (m *Manager) BeginTx(ctx context.Context) (*sql.Tx, error) {
	db, err := m.GetDB(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get database for transaction: %w", err)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}

	return tx, nil
}

// WithTransaction executes a function within a database transaction
func (m *Manager) WithTransaction(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := m.BeginTx(ctx)
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
			return fmt.Errorf("transaction error: %v, rollback error: %w", err, rbErr)
		}
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// Convenience functions for global access

// GetDB returns the database connection from the global manager
func GetDB(ctx context.Context) (*sql.DB, error) {
	return GetManager().GetDB(ctx)
}

// InitDB initializes the database using the global manager
func InitDB(ctx context.Context) error {
	return GetManager().InitDB(ctx)
}

// CloseDB closes the database connection using the global manager
func CloseDB() error {
	return GetManager().CloseDB()
}

// HealthCheck performs a health check using the global manager
func HealthCheck(ctx context.Context) error {
	return GetManager().HealthCheck(ctx)
}

// WithTransaction executes a function within a transaction using the global manager
func WithTransaction(ctx context.Context, fn func(*sql.Tx) error) error {
	return GetManager().WithTransaction(ctx, fn)
}

/*
Example Usage:

package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"your-project/core/database"
)

func main() {
	ctx := context.Background()

	// Initialize database
	if err := database.InitDB(ctx); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Setup graceful shutdown
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-c
		log.Println("Shutting down...")
		
		// Close database connection
		if err := database.CloseDB(); err != nil {
			log.Printf("Error closing database: %v", err)
		}
		
		os.Exit(0)
	}()

	// Example database operations
	db, err := database.GetDB(ctx)
	if err != nil {
		log.Fatalf("Failed to get database: %v", err)
	}

	// Create a new task
	model := database.NewBaseModel()
	_, err = db.ExecContext(ctx, 
		"INSERT INTO tasks (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		model.ID, "Sample Task", "This is a sample task", model.CreatedAt, model.UpdatedAt)
	if err != nil {
		log.Printf("Failed to insert task: %v", err)
	}

	// Health check
	if err := database.HealthCheck(ctx); err != nil {
		log.Printf("Health check failed: %v", err)
	} else {
		log.Println("Database is healthy")
	}

	// Transaction example
	err = database.WithTransaction(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, "UPDATE tasks SET completed = ? WHERE id = ?", true, model.ID)
		return err
	})
	if err != nil {
		log.Printf("Transaction failed: %v", err)
	}

	// Keep the application running
	select {}
}

Environment Variables:
- DATABASE_URL: Path to SQLite database file (default: "./tasks.db")
- DB_MAX_OPEN_CONNS: Maximum open connections (default: 25)
- DB_MAX_IDLE_CONNS: Maximum idle connections (default: 5)
- DB_CONN_MAX_LIFETIME: Connection maximum lifetime (default: "5m")
- DB_CONN_MAX_IDLE_TIME: Connection maximum idle time (default