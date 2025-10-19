// Package app provides todo storage and core operations with file-based JSON persistence.
// It handles robust error recovery, atomic file operations, and graceful degradation
// for common file system issues.
package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Todo represents a single todo item with metadata
type Todo struct {
	ID       int    `json:"id"`
	Text     string `json:"text"`
	Done     bool   `json:"done"`
	Created  string `json:"created"`
	Priority string `json:"priority"`
}

const (
	todosFileName   = ".todos.json"
	backupSuffix    = ".backup"
	defaultPriority = "medium"
)

// getTodosFilePath returns the full path to the todos file in the user's home directory
func getTodosFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, todosFileName), nil
}

// ensureFileExists creates the todos file if it doesn't exist
func ensureFileExists(filePath string) error {
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// Create parent directories if needed
		if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
			return fmt.Errorf("failed to create parent directories: %w", err)
		}

		// Create empty todos file with empty JSON array
		file, err := os.OpenFile(filePath, os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			if os.IsPermission(err) {
				return fmt.Errorf("permission denied creating todos file at %s: %w", filePath, err)
			}
			return fmt.Errorf("failed to create todos file: %w", err)
		}
		defer file.Close()

		if _, err := file.Write([]byte("[]")); err != nil {
			return fmt.Errorf("failed to initialize todos file: %w", err)
		}
	}
	return nil
}

// backupCorruptedFile moves a corrupted file to a backup location
func backupCorruptedFile(filePath string) error {
	backupPath := filePath + backupSuffix
	if err := os.Rename(filePath, backupPath); err != nil {
		return fmt.Errorf("failed to backup corrupted file: %w", err)
	}
	return nil
}

// LoadTodos reads todos from the JSON file, handling missing and corrupted files gracefully
func LoadTodos() ([]Todo, error) {
	filePath, err := getTodosFilePath()
	if err != nil {
		return nil, err
	}

	// Ensure file exists
	if err := ensureFileExists(filePath); err != nil {
		return nil, err
	}

	// Read file contents
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsPermission(err) {
			return nil, fmt.Errorf("permission denied reading todos file: %w", err)
		}
		return nil, fmt.Errorf("failed to read todos file: %w", err)
	}

	// Handle empty file
	if len(data) == 0 {
		return []Todo{}, nil
	}

	// Parse JSON
	var todos []Todo
	if err := json.Unmarshal(data, &todos); err != nil {
		// Handle corrupted JSON by backing up and recreating
		if backupErr := backupCorruptedFile(filePath); backupErr != nil {
			return nil, fmt.Errorf("JSON parsing failed and backup failed: parse error: %w, backup error: %v", err, backupErr)
		}

		// Recreate empty file
		if createErr := ensureFileExists(filePath); createErr != nil {
			return nil, fmt.Errorf("JSON parsing failed, backup succeeded, but recreation failed: %w", createErr)
		}

		return []Todo{}, nil
	}

	return todos, nil
}

// SaveTodos writes todos to the JSON file using atomic operations
func SaveTodos(todos []Todo) error {
	filePath, err := getTodosFilePath()
	if err != nil {
		return err
	}

	// Marshal todos to JSON with indentation for readability
	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal todos to JSON: %w", err)
	}

	// Create temporary file for atomic write
	tempPath := filePath + ".tmp"
	tempFile, err := os.OpenFile(tempPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied creating temporary file: %w", err)
		}
		return fmt.Errorf("failed to create temporary file: %w", err)
	}

	// Write data to temporary file
	if _, err := tempFile.Write(data); err != nil {
		tempFile.Close()
		os.Remove(tempPath) // Clean up temp file
		return fmt.Errorf("failed to write to temporary file: %w", err)
	}

	// Ensure data is written to disk
	if err := tempFile.Sync(); err != nil {
		tempFile.Close()
		os.Remove(tempPath)
		return fmt.Errorf("failed to sync temporary file: %w", err)
	}

	tempFile.Close()

	// Atomically replace the original file
	if err := os.Rename(tempPath, filePath); err != nil {
		os.Remove(tempPath) // Clean up temp file
		return fmt.Errorf("failed to replace todos file: %w", err)
	}

	return nil
}

// generateNextID finds the next available ID for a new todo
func generateNextID(todos []Todo) int {
	maxID := 0
	for _, todo := range todos {
		if todo.ID > maxID {
			maxID = todo.ID
		}
	}
	return maxID + 1
}

// AddTodo creates a new todo with the given text and optional priority
func AddTodo(text string, priority ...string) (*Todo, error) {
	if text == "" {
		return nil, fmt.Errorf("todo text cannot be empty")
	}

	// Load existing todos to generate ID
	todos, err := LoadTodos()
	if err != nil {
		return nil, fmt.Errorf("failed to load existing todos: %w", err)
	}

	// Determine priority
	todoPriority := defaultPriority
	if len(priority) > 0 && priority[0] != "" {
		todoPriority = priority[0]
	}

	// Create new todo
	newTodo := &Todo{
		ID:       generateNextID(todos),
		Text:     text,
		Done:     false,
		Created:  time.Now().Format(time.RFC3339),
		Priority: todoPriority,
	}

	// Add to todos slice and save
	todos = append(todos, *newTodo)
	if err := SaveTodos(todos); err != nil {
		return nil, fmt.Errorf("failed to save new todo: %w", err)
	}

	return newTodo, nil
}

// GetTodo finds and returns a todo by its ID
func GetTodo(todos []Todo, id int) (*Todo, error) {
	if id <= 0 {
		return nil, fmt.Errorf("invalid todo ID: %d", id)
	}

	for i := range todos {
		if todos[i].ID == id {
			return &todos[i], nil
		}
	}

	return nil, fmt.Errorf("todo with ID %d not found", id)
}

// UpdateTodo updates specific fields of a todo identified by ID
func UpdateTodo(todos []Todo, id int, changes map[string]interface{}) error {
	if id <= 0 {
		return fmt.Errorf("invalid todo ID: %d", id)
	}

	if len(changes) == 0 {
		return fmt.Errorf("no changes provided")
	}

	// Find todo index
	todoIndex := -1
	for i := range todos {
		if todos[i].ID == id {
			todoIndex = i
			break
		}
	}

	if todoIndex == -1 {
		return fmt.Errorf("todo with ID %d not found", id)
	}

	// Apply changes
	for field, value := range changes {
		switch field {
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
				todos[todoIndex].Priority = priority
			} else {
				return fmt.Errorf("invalid type for priority field: expected string")
			}
		default:
			return fmt.Errorf("unknown field: %s", field)
		}
	}

	// Save updated todos
	if err := SaveTodos(todos); err != nil {
		return fmt.Errorf("failed to save updated todo: %w", err)
	}

	return nil
}

// DeleteTodo removes a todo by ID and returns the updated slice
func DeleteTodo(todos []Todo, id int) ([]Todo, error) {
	if id <= 0 {
		return nil, fmt.Errorf("invalid todo ID: %d", id)
	}

	// Find todo index
	todoIndex := -1
	for i := range todos {
		if todos[i].ID == id {
			todoIndex = i
			break
		}
	}

	if todoIndex == -1 {
		return nil, fmt.Errorf("todo with ID %d not found", id)
	}

	// Remove todo from slice
	updatedTodos := make([]Todo, 0, len(todos)-1)
	updatedTodos = append(updatedTodos, todos[:todoIndex]...)
	updatedTodos = append(updatedTodos, todos[todoIndex+1:]...)

	// Save updated todos
	if err := SaveTodos(updatedTodos); err != nil {
		return nil, fmt.Errorf("failed to save after deletion: %w", err)
	}

	return updatedTodos, nil
}

// FilterTodos returns todos filtered by completion status and/or priority
func FilterTodos(todos []Todo, done *bool, priority *string) []Todo {
	if len(todos) == 0 {
		return []Todo{}
	}

	filtered := make([]Todo, 0, len(todos))

	for _, todo := range todos {
		// Check done status filter
		if done != nil && todo.Done != *done {
			continue
		}

		// Check priority filter
		if priority != nil && todo.Priority != *priority {
			continue
		}

		filtered = append(filtered, todo)
	}

	return filtered
}