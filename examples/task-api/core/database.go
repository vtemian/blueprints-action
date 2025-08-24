// Package database provides database connection and session management functionality
// with SQLite support, connection pooling, and base model structures.
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
	DatabaseURL     string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
	QueryTimeout    time.Duration
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
	db     *sql.DB
	config *Config
	mu     sync.RWMutex
	once   sync.Once
}

// DatabaseInterface defines the contract for database operations
type DatabaseInterface interface {
	GetDB() *sql.DB
	Ping(ctx context.Context) error
	Close() error
	HealthCheck(ctx context.Context) error
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

var (
	dbManager *Manager
	initOnce  sync.Once
)

// LoadConfig loads database configuration from environment variables
func LoadConfig() *Config {
	config := &Config{
		DatabaseURL:     getEnvString("DATABASE_URL", "./app.db"),
		MaxOpenConns:    getEnvInt("DB_MAX_OPEN_CONNS", 25),
		MaxIdleConns:    getEnvInt("DB_MAX_IDLE_CONNS", 5),
		ConnMaxLifetime: time.Duration(getEnvInt("DB_CONN_MAX_LIFETIME_MINUTES", 60)) * time.Minute,
		ConnMaxIdleTime: time.Duration(getEnvInt("DB_CONN_MAX_IDLE_MINUTES", 10)) * time.Minute,
		QueryTimeout:    time.Duration(getEnvInt("DB_QUERY_TIMEOUT_SECONDS", 30)) * time.Second,
	}

	return config
}

// getEnvString retrieves string environment variable with fallback
func getEnvString(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// getEnvInt retrieves integer environment variable with fallback
func getEnvInt(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return fallback
}

// InitDB initializes the database connection with the provided configuration
func InitDB(config *Config) (*Manager, error) {
	var err error
	
	initOnce.Do(func() {
		dbManager, err = newManager(config)
	})
	
	if err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}
	
	return dbManager, nil
}

// GetDB returns the global database manager instance
func GetDB() *Manager {
	if dbManager == nil {
		panic("database not initialized - call InitDB first")
	}
	return dbManager
}

// newManager creates a new database manager with the given configuration
func newManager(config *Config) (*Manager, error) {
	if config == nil {
		return nil, fmt.Errorf("database config cannot be nil")
	}

	if config.DatabaseURL == "" {
		return nil, fmt.Errorf("database URL cannot be empty")
	}

	// Open database connection
	db, err := sql.Open("sqlite3", config.DatabaseURL+"?_journal=WAL&_timeout=20000&_synchronous=NORMAL&_cache_size=1000000000")
	if err != nil {
		return nil, fmt.Errorf("failed to open database connection: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(config.MaxOpenConns)
	db.SetMaxIdleConns(config.MaxIdleConns)
	db.SetConnMaxLifetime(config.ConnMaxLifetime)
	db.SetConnMaxIdleTime(config.ConnMaxIdleTime)

	manager := &Manager{
		db:     db,
		config: config,
	}

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := manager.Ping(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Initialize database schema
	if err := manager.initializeSchema(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to initialize database schema: %w", err)
	}

	return manager, nil
}

// GetDB returns the underlying sql.DB instance
func (m *Manager) GetDB() *sql.DB {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.db
}

// Ping verifies the database connection is alive
func (m *Manager) Ping(ctx context.Context) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.db == nil {
		return fmt.Errorf("database connection is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := m.db.PingContext(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	return nil
}

// Close closes the database connection
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.db == nil {
		return nil
	}

	if err := m.db.Close(); err != nil {
		return fmt.Errorf("failed to close database connection: %w", err)
	}

	m.db = nil
	return nil
}

// HealthCheck performs a comprehensive health check of the database
func (m *Manager) HealthCheck(ctx context.Context) error {
	if err := m.Ping(ctx); err != nil {
		return fmt.Errorf("health check ping failed: %w", err)
	}

	// Test a simple query
	ctx, cancel := context.WithTimeout(ctx, m.config.QueryTimeout)
	defer cancel()

	var result int
	err := m.db.QueryRowContext(ctx, "SELECT 1").Scan(&result)
	if err != nil {
		return fmt.Errorf("health check query failed: %w", err)
	}

	if result != 1 {
		return fmt.Errorf("health check query returned unexpected result: %d", result)
	}

	return nil
}

// ExecContext executes a query without returning any rows
func (m *Manager) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.db == nil {
		return nil, fmt.Errorf("database connection is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, m.config.QueryTimeout)
	defer cancel()

	result, err := m.db.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}

	return result, nil
}

// QueryContext executes a query that returns rows
func (m *Manager) QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.db == nil {
		return nil, fmt.Errorf("database connection is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, m.config.QueryTimeout)
	defer cancel()

	rows, err := m.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}

	return rows, nil
}

// QueryRowContext executes a query that is expected to return at most one row
func (m *Manager) QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ctx, cancel := context.WithTimeout(ctx, m.config.QueryTimeout)
	defer cancel()

	return m.db.QueryRowContext(ctx, query, args...)
}

// initializeSchema creates necessary database tables and indexes
func (m *Manager) initializeSchema(ctx context.Context) error {
	// Enable foreign keys for SQLite
	_, err := m.ExecContext(ctx, "PRAGMA foreign_keys = ON")
	if err != nil {
		return fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	// Create a sample table to demonstrate base model usage
	createTableQuery := `
	CREATE TABLE IF NOT EXISTS sample_entities (
		id TEXT PRIMARY KEY,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		name TEXT NOT NULL
	)`

	_, err = m.ExecContext(ctx, createTableQuery)
	if err != nil {
		return fmt.Errorf("failed to create sample_entities table: %w", err)
	}

	// Create indexes for common queries
	createIndexQuery := `
	CREATE INDEX IF NOT EXISTS idx_sample_entities_created_at 
	ON sample_entities(created_at)`

	_, err = m.ExecContext(ctx, createIndexQuery)
	if err != nil {
		return fmt.Errorf("failed to create index: %w", err)
	}

	return nil
}

// CloseDB closes the global database connection
func CloseDB() error {
	if dbManager == nil {
		return nil
	}
	
	err := dbManager.Close()
	dbManager = nil
	initOnce = sync.Once{} // Reset the once to allow re-initialization
	
	return err
}

// Transaction executes a function within a database transaction
func (m *Manager) Transaction(ctx context.Context, fn func(*sql.Tx) error) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.db == nil {
		return fmt.Errorf("database connection is nil")
	}

	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p)
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return fmt.Errorf("transaction failed: %v, rollback failed: %w", err, rbErr)
		}
		return fmt.Errorf("transaction failed: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// Example usage:
/*
func main() {
	// Load configuration
	config := LoadConfig()
	
	// Initialize database
	db, err := InitDB(config)
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer CloseDB()
	
	// Use the database
	ctx := context.Background()
	
	// Health check
	if err := db.HealthCheck(ctx); err != nil {
		log.Fatal("Database health check failed:", err)
	}
	
	// Example transaction
	err = db.Transaction(ctx, func(tx *sql.Tx) error {
		baseModel := NewBaseModel()
		_, err := tx.ExecContext(ctx, 
			"INSERT INTO sample_entities (id, created_at, updated_at, name) VALUES (?, ?, ?, ?)",
			baseModel.ID, baseModel.CreatedAt, baseModel.UpdatedAt, "example")
		return err
	})
	
	if err != nil {
		log.Fatal("Transaction failed:", err)
	}
}
*/