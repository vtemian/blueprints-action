// Package database provides database connection and session management for SQLite
// with proper connection pooling, resource management, and base model patterns.
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
	_ "github.com/mattn/go-sqlite3"
)

// Configuration constants
const (
	DefaultDatabaseURL     = "./tasks.db"
	DefaultMaxOpenConns    = 25
	DefaultMaxIdleConns    = 5
	DefaultConnMaxLifetime = 5 * time.Minute
	DefaultConnMaxIdleTime = 1 * time.Minute
	DriverName             = "sqlite3"
)

// Config holds database configuration settings
type Config struct {
	DatabaseURL     string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
	Logger          *slog.Logger
}

// DefaultConfig returns a configuration with sensible defaults
func DefaultConfig() *Config {
	return &Config{
		DatabaseURL:     getEnvOrDefault("DATABASE_URL", DefaultDatabaseURL),
		MaxOpenConns:    DefaultMaxOpenConns,
		MaxIdleConns:    DefaultMaxIdleConns,
		ConnMaxLifetime: DefaultConnMaxLifetime,
		ConnMaxIdleTime: DefaultConnMaxIdleTime,
		Logger:          slog.Default(),
	}
}

// DB interface defines database operations for testability
type DB interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
	PrepareContext(ctx context.Context, query string) (*sql.Stmt, error)
	BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
	PingContext(ctx context.Context) error
	Close() error
}

// Manager handles database connection lifecycle
type Manager struct {
	db     *sql.DB
	config *Config
	once   sync.Once
	mu     sync.RWMutex
	closed bool
}

// Global manager instance
var (
	globalManager *Manager
	initOnce      sync.Once
)

// BaseModel provides common fields for all database models
type BaseModel struct {
	ID        uuid.UUID `json:"id" db:"id"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
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

// NewManager creates a new database manager with the given configuration
func NewManager(config *Config) (*Manager, error) {
	if config == nil {
		config = DefaultConfig()
	}

	manager := &Manager{
		config: config,
	}

	if err := manager.connect(); err != nil {
		return nil, fmt.Errorf("failed to create database manager: %w", err)
	}

	return manager, nil
}

// connect establishes database connection with proper configuration
func (m *Manager) connect() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed {
		return fmt.Errorf("manager is closed")
	}

	// Validate database URL
	if err := m.validateDatabaseURL(); err != nil {
		return fmt.Errorf("invalid database URL: %w", err)
	}

	// Open database connection
	db, err := sql.Open(DriverName, m.config.DatabaseURL)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(m.config.MaxOpenConns)
	db.SetMaxIdleConns(m.config.MaxIdleConns)
	db.SetConnMaxLifetime(m.config.ConnMaxLifetime)
	db.SetConnMaxIdleTime(m.config.ConnMaxIdleTime)

	// Test connection with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return fmt.Errorf("failed to ping database: %w", err)
	}

	m.db = db
	m.config.Logger.Info("Database connection established",
		slog.String("url", m.config.DatabaseURL),
		slog.Int("max_open_conns", m.config.MaxOpenConns),
		slog.Int("max_idle_conns", m.config.MaxIdleConns))

	return nil
}

// validateDatabaseURL performs basic validation on the database URL
func (m *Manager) validateDatabaseURL() error {
	if m.config.DatabaseURL == "" {
		return fmt.Errorf("database URL cannot be empty")
	}

	// For file-based SQLite, check directory permissions
	if m.config.DatabaseURL != ":memory:" {
		dir := getDirectoryFromPath(m.config.DatabaseURL)
		if dir != "" {
			if err := os.MkdirAll(dir, 0755); err != nil {
				return fmt.Errorf("failed to create database directory: %w", err)
			}
		}
	}

	return nil
}

// GetDB returns the database connection (equivalent to FastAPI dependency)
func (m *Manager) GetDB() DB {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.db
}

// InitDB initializes the database and creates necessary tables
func (m *Manager) InitDB(ctx context.Context) error {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return fmt.Errorf("database not connected")
	}

	// Enable foreign keys for SQLite
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON"); err != nil {
		return fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	// Enable WAL mode for better concurrency
	if _, err := db.ExecContext(ctx, "PRAGMA journal_mode = WAL"); err != nil {
		m.config.Logger.Warn("Failed to enable WAL mode", slog.Any("error", err))
	}

	// Create base tables (example)
	if err := m.createBaseTables(ctx); err != nil {
		return fmt.Errorf("failed to create base tables: %w", err)
	}

	m.config.Logger.Info("Database initialized successfully")
	return nil
}

// createBaseTables creates the base tables needed by the application
func (m *Manager) createBaseTables(ctx context.Context) error {
	// Example table creation - modify based on your needs
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

	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	for _, query := range queries {
		if _, err := tx.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("failed to execute query %q: %w", query, err)
		}
	}

	return tx.Commit()
}

// HealthCheck performs a health check on the database connection
func (m *Manager) HealthCheck(ctx context.Context) error {
	m.mu.RLock()
	db := m.db
	closed := m.closed
	m.mu.RUnlock()

	if closed {
		return fmt.Errorf("database manager is closed")
	}

	if db == nil {
		return fmt.Errorf("database not connected")
	}

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("database health check failed: %w", err)
	}

	return nil
}

// CloseDB cleanup all connections with proper error handling
func (m *Manager) CloseDB() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed {
		return nil
	}

	m.closed = true

	if m.db != nil {
		if err := m.db.Close(); err != nil {
			m.config.Logger.Error("Error closing database connection", slog.Any("error", err))
			return fmt.Errorf("failed to close database: %w", err)
		}
		m.config.Logger.Info("Database connection closed")
	}

	return nil
}

// NewConnection creates a new database connection (factory function)
func NewConnection(databaseURL string) (*sql.DB, error) {
	if databaseURL == "" {
		databaseURL = DefaultDatabaseURL
	}

	db, err := sql.Open(DriverName, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to create new connection: %w", err)
	}

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping new connection: %w", err)
	}

	return db, nil
}

// Global functions for singleton pattern

// InitGlobal initializes the global database manager
func InitGlobal(config *Config) error {
	var err error
	initOnce.Do(func() {
		globalManager, err = NewManager(config)
	})
	return err
}

// GetDB returns the global database connection
func GetDB() DB {
	if globalManager == nil {
		panic("database not initialized - call InitGlobal first")
	}
	return globalManager.GetDB()
}

// InitDB initializes the global database
func InitDB(ctx context.Context) error {
	if globalManager == nil {
		return fmt.Errorf("database not initialized - call InitGlobal first")
	}
	return globalManager.InitDB(ctx)
}

// CloseDB closes the global database connection
func CloseDB() error {
	if globalManager == nil {
		return nil
	}
	return globalManager.CloseDB()
}

// HealthCheck performs a health check on the global database
func HealthCheck(ctx context.Context) error {
	if globalManager == nil {
		return fmt.Errorf("database not initialized")
	}
	return globalManager.HealthCheck(ctx)
}

// Utility functions

// getEnvOrDefault returns environment variable value or default
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getDirectoryFromPath extracts directory from file path
func getDirectoryFromPath(path string) string {
	if path == ":memory:" || path == "" {
		return ""
	}
	
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' || path[i] == '\\' {
			return path[:i]
		}
	}
	return ""
}

// WithTransaction executes a function within a database transaction
func WithTransaction(ctx context.Context, db DB, fn func(*sql.Tx) error) error {
	sqlDB, ok := db.(*sql.DB)
	if !ok {
		return fmt.Errorf("invalid database type for transaction")
	}

	tx, err := sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := fn(tx); err != nil {
		return err
	}

	return tx.Commit()
}

/*
USAGE EXAMPLES:

1. Basic initialization: