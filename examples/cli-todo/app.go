// Package app provides todo storage and core operations functionality.
package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Todo represents a single todo item with all its properties.
type Todo struct {
	ID       int    `json:"id"`
	Text     string `json:"text"`
	Done     bool   `json:"done"`
	Created  string `json:"created"`
	Priority string `json:"priority"`
}

// todoStorage manages the file operations and provides thread safety.
type todoStorage struct {
	filePath string
	mutex    sync.RWMutex
}

var storage *todoStorage
var once sync.Once

// getStorage returns a singleton instance of todoStorage.
func getStorage() *todoStorage {
	once.Do(func() {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			// Fallback to current directory if home directory is not accessible
			homeDir = "."
		}
		storage = &todoStorage{
			filePath: filepath.Join(homeDir, ".todos.json"),
		}
	})
	return storage
}

// LoadTodos reads todos from the storage file and returns them as a slice.
// If the file doesn't exist, it returns an empty slice.
// If the file is corrupted, it backs up the file and returns an empty slice.
func LoadTodos() ([]Todo, error) {
	s := getStorage()
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	// Check if file exists
	if _, err := os.Stat(s.filePath); os.IsNotExist(err) {
		return []Todo{}, nil
	}

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsPermission(err) {
			return nil, fmt.Errorf("permission denied reading todos file: %s", s.filePath)
		}
		return nil, fmt.Errorf("failed to read todos file: %w", err)
	}

	// Handle empty file
	if len(data) == 0 {
		return []Todo{}, nil
	}

	var todos []Todo
	if err := json.Unmarshal(data, &todos); err != nil {
		// Backup corrupted file
		backupPath := s.filePath + ".backup"
		if backupErr := os.WriteFile(backupPath, data, 0644); backupErr != nil {
			return nil, fmt.Errorf("failed to backup corrupted todos file: %w", backupErr)
		}
		
		// Return empty slice and let the caller know about the corruption
		return []Todo{}, fmt.Errorf("corrupted todos file backed up to %s, starting with empty todo list", backupPath)
	}

	return todos, nil
}

// SaveTodos writes the provided todos slice to the storage file.
// It creates the file if it doesn't exist and handles permission errors gracefully.
func SaveTodos(todos []Todo) error {
	s := getStorage()
	s.mutex.Lock()
	defer s.mutex.Unlock()

	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal todos to JSON: %w", err)
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(s.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", dir, err)
	}

	// Write to temporary file first, then rename for atomic operation
	tempPath := s.filePath + ".tmp"
	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied writing to todos file: %s", s.filePath)
		}
		return fmt.Errorf("failed to write todos file: %w", err)
	}

	// Atomic rename
	if err := os.Rename(tempPath, s.filePath); err != nil {
		// Clean up temp file on failure
		os.Remove(tempPath)
		return fmt.Errorf("failed to save todos file: %w", err)
	}

	return nil
}

// AddTodo creates a new todo with the specified text and priority.
// If priority is empty, it defaults to "medium".
// Returns the created todo with a unique ID and current timestamp.
func AddTodo(text string, priority string) (*Todo, error) {
	if text == "" {
		return nil, fmt.Errorf("todo text cannot be empty")
	}

	if priority == "" {
		priority = "medium"
	}

	// Validate priority
	validPriorities := map[string]bool{
		"low":    true,
		"medium": true,
		"high":   true,
	}
	if !validPriorities[priority] {
		return nil, fmt.Errorf("invalid priority: %s (must be low, medium, or high)", priority)
	}

	todos, err := LoadTodos()
	if err != nil {
		return nil, fmt.Errorf("failed to load existing todos: %w", err)
	}

	// Find next available ID
	maxID := 0
	for _, todo := range todos {
		if todo.ID > maxID {
			maxID = todo.ID
		}
	}

	newTodo := &Todo{
		ID:       maxID + 1,
		Text:     text,
		Done:     false,
		Created:  time.Now().Format(time.RFC3339),
		Priority: priority,
	}

	todos = append(todos, *newTodo)
	if err := SaveTodos(todos); err != nil {
		return nil, fmt.Errorf("failed to save new todo: %w", err)
	}

	return newTodo, nil
}

// GetTodo finds and returns a todo by its ID.
// Returns an error if the todo is not found.
func GetTodo(id int) (*Todo, error) {
	if id <= 0 {
		return nil, fmt.Errorf("invalid todo ID: %d", id)
	}

	todos, err := LoadTodos()
	if err != nil {
		return nil, fmt.Errorf("failed to load todos: %w", err)
	}

	for _, todo := range todos {
		if todo.ID == id {
			return &todo, nil
		}
	}

	return nil, fmt.Errorf("todo with ID %d not found", id)
}

// UpdateTodo updates specific fields of a todo identified by ID.
// The changes map can contain "text", "done", and "priority" keys.
// Only provided fields will be updated.
func UpdateTodo(id int, changes map[string]interface{}) error {
	if id <= 0 {
		return fmt.Errorf("invalid todo ID: %d", id)
	}

	if len(changes) == 0 {
		return fmt.Errorf("no changes provided")
	}

	todos, err := LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	todoIndex := -1
	for i, todo := range todos {
		if todo.ID == id {
			todoIndex = i
			break
		}
	}

	if todoIndex == -1 {
		return fmt.Errorf("todo with ID %d not found", id)
	}

	// Apply changes
	for key, value := range changes {
		switch key {
		case "text":
			if text, ok := value.(string); ok {
				if text == "" {
					return fmt.Errorf("todo text cannot be empty")
				}
				todos[todoIndex].Text = text
			} else {
				return fmt.Errorf("invalid type for text field: expected string")
			}
		case "done":
			if done, ok := value.(bool); ok {
				todos[todoIndex].Done = done
			} else {
				return fmt.Errorf("invalid type for done field: expected bool")
			}
		case "priority":
			if priority, ok := value.(string); ok {
				validPriorities := map[string]bool{
					"low":    true,
					"medium": true,
					"high":   true,
				}
				if !validPriorities[priority] {
					return fmt.Errorf("invalid priority: %s (must be low, medium, or high)", priority)
				}
				todos[todoIndex].Priority = priority
			} else {
				return fmt.Errorf("invalid type for priority field: expected string")
			}
		default:
			return fmt.Errorf("invalid field: %s", key)
		}
	}

	if err := SaveTodos(todos); err != nil {
		return fmt.Errorf("failed to save updated todo: %w", err)
	}

	return nil
}

// DeleteTodo removes a todo identified by ID from the storage.
// Returns an error if the todo is not found.
func DeleteTodo(id int) error {
	if id <= 0 {
		return fmt.Errorf("invalid todo ID: %d", id)
	}

	todos, err := LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	todoIndex := -1
	for i, todo := range todos {
		if todo.ID == id {
			todoIndex = i
			break
		}
	}

	if todoIndex == -1 {
		return fmt.Errorf("todo with ID %d not found", id)
	}

	// Remove todo from slice
	todos = append(todos[:todoIndex], todos[todoIndex+1:]...)

	if err := SaveTodos(todos); err != nil {
		return fmt.Errorf("failed to save todos after deletion: %w", err)
	}

	return nil
}

// FilterTodos filters a slice of todos based on completion status and priority.
// Pass nil for done or priority to skip filtering by that field.
// Returns a new slice containing only the todos that match the criteria.
func FilterTodos(todos []Todo, done *bool, priority *string) []Todo {
	var filtered []Todo

	for _, todo := range todos {
		// Filter by done status if specified
		if done != nil && todo.Done != *done {
			continue
		}

		// Filter by priority if specified
		if priority != nil && todo.Priority != *priority {
			continue
		}

		filtered = append(filtered, todo)
	}

	return filtered
}

// Helper functions for common filtering operations

// BoolPtr returns a pointer to a bool value for use with FilterTodos.
func BoolPtr(b bool) *bool {
	return &b
}

// StringPtr returns a pointer to a string value for use with FilterTodos.
func StringPtr(s string) *string {
	return &s
}