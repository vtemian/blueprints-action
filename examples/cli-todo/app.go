// Package app provides todo storage and core operations functionality.
// It manages todos in a JSON file located in the user's home directory
// and provides CRUD operations with proper error handling and data validation.
package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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

const (
	todoFileName       = ".todos.json"
	todoBackupFileName = ".todos.json.backup"
	defaultPriority    = "medium"
)

// getFilePath returns the full path to the todos file in the user's home directory.
func getFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, todoFileName), nil
}

// getBackupFilePath returns the full path to the backup todos file.
func getBackupFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, todoBackupFileName), nil
}

// LoadTodos reads todos from the JSON file in the user's home directory.
// If the file doesn't exist, it returns an empty slice.
// If the JSON is corrupted, it creates a backup and returns an empty slice.
// This function is not thread-safe and should be used with external synchronization if needed.
func LoadTodos() ([]Todo, error) {
	filePath, err := getFilePath()
	if err != nil {
		return nil, err
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// File doesn't exist, return empty slice
		return []Todo{}, nil
	}

	// Read file contents
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsPermission(err) {
			return nil, fmt.Errorf("permission denied reading todos file %s: %w", filePath, err)
		}
		return nil, fmt.Errorf("failed to read todos file: %w", err)
	}

	// Handle empty file
	if len(data) == 0 {
		return []Todo{}, nil
	}

	var todos []Todo
	if err := json.Unmarshal(data, &todos); err != nil {
		// JSON is corrupted, create backup and return empty slice
		if backupErr := createBackup(filePath, data); backupErr != nil {
			return nil, fmt.Errorf("failed to unmarshal JSON and failed to create backup: %v, backup error: %w", err, backupErr)
		}
		return []Todo{}, fmt.Errorf("corrupted JSON detected, backup created at %s.backup, starting with empty todos: %w", filePath, err)
	}

	return todos, nil
}

// createBackup creates a backup of corrupted data.
func createBackup(originalPath string, data []byte) error {
	backupPath, err := getBackupFilePath()
	if err != nil {
		return err
	}

	if err := os.WriteFile(backupPath, data, 0644); err != nil {
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied creating backup file %s: %w", backupPath, err)
		}
		return fmt.Errorf("failed to create backup file: %w", err)
	}

	return nil
}

// SaveTodos writes todos to the JSON file using atomic operations.
// It writes to a temporary file first, then renames it to ensure data integrity.
// This function is not thread-safe and should be used with external synchronization if needed.
func SaveTodos(todos []Todo) error {
	filePath, err := getFilePath()
	if err != nil {
		return err
	}

	// Marshal todos to JSON
	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal todos to JSON: %w", err)
	}

	// Create temporary file for atomic operation
	tempPath := filePath + ".tmp"
	
	// Write to temporary file
	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied writing to todos file %s: %w", tempPath, err)
		}
		return fmt.Errorf("failed to write temporary todos file: %w", err)
	}

	// Atomically rename temporary file to final file
	if err := os.Rename(tempPath, filePath); err != nil {
		// Clean up temporary file on failure
		os.Remove(tempPath)
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied finalizing todos file %s: %w", filePath, err)
		}
		return fmt.Errorf("failed to finalize todos file: %w", err)
	}

	return nil
}

// AddTodo creates a new todo with the given text and priority.
// If no priority is provided, it defaults to "medium".
// Returns the created todo with auto-generated ID and timestamp.
func AddTodo(text string, priority ...string) (Todo, error) {
	if text == "" {
		return Todo{}, fmt.Errorf("todo text cannot be empty")
	}

	// Load existing todos to determine next ID
	todos, err := LoadTodos()
	if err != nil {
		return Todo{}, fmt.Errorf("failed to load existing todos: %w", err)
	}

	// Determine next ID
	nextID := 1
	for _, todo := range todos {
		if todo.ID >= nextID {
			nextID = todo.ID + 1
		}
	}

	// Set priority
	todoPriority := defaultPriority
	if len(priority) > 0 && priority[0] != "" {
		todoPriority = priority[0]
	}

	// Create new todo
	newTodo := Todo{
		ID:       nextID,
		Text:     text,
		Done:     false,
		Created:  time.Now().Format(time.RFC3339),
		Priority: todoPriority,
	}

	// Add to todos and save
	todos = append(todos, newTodo)
	if err := SaveTodos(todos); err != nil {
		return Todo{}, fmt.Errorf("failed to save new todo: %w", err)
	}

	return newTodo, nil
}

// GetTodo finds and returns a todo by its ID.
// Returns a pointer to the todo if found, or an error if not found.
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

// UpdateTodo updates a todo's fields based on the provided changes map.
// Supported fields: "text", "done", "priority".
// The changes are applied to the todo in the slice and the file is saved.
func UpdateTodo(todos []Todo, id int, changes map[string]interface{}) error {
	if id <= 0 {
		return fmt.Errorf("invalid todo ID: %d", id)
	}

	if len(changes) == 0 {
		return fmt.Errorf("no changes provided")
	}

	// Find todo index
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
	for field, value := range changes {
		switch field {
		case "text":
			if text, ok := value.(string); ok {
				if text == "" {
					return fmt.Errorf("todo text cannot be empty")
				}
				todos[todoIndex].Text = text
			} else {
				return fmt.Errorf("invalid type for field 'text': expected string")
			}
		case "done":
			if done, ok := value.(bool); ok {
				todos[todoIndex].Done = done
			} else {
				return fmt.Errorf("invalid type for field 'done': expected bool")
			}
		case "priority":
			if priority, ok := value.(string); ok {
				todos[todoIndex].Priority = priority
			} else {
				return fmt.Errorf("invalid type for field 'priority': expected string")
			}
		default:
			return fmt.Errorf("unsupported field: %s", field)
		}
	}

	// Save updated todos
	if err := SaveTodos(todos); err != nil {
		return fmt.Errorf("failed to save updated todo: %w", err)
	}

	return nil
}

// DeleteTodo removes a todo by its ID and returns the updated slice.
// The updated slice is also saved to the file.
func DeleteTodo(todos []Todo, id int) ([]Todo, error) {
	if id <= 0 {
		return todos, fmt.Errorf("invalid todo ID: %d", id)
	}

	// Find todo index
	todoIndex := -1
	for i, todo := range todos {
		if todo.ID == id {
			todoIndex = i
			break
		}
	}

	if todoIndex == -1 {
		return todos, fmt.Errorf("todo with ID %d not found", id)
	}

	// Remove todo from slice
	updatedTodos := make([]Todo, 0, len(todos)-1)
	updatedTodos = append(updatedTodos, todos[:todoIndex]...)
	updatedTodos = append(updatedTodos, todos[todoIndex+1:]...)

	// Save updated todos
	if err := SaveTodos(updatedTodos); err != nil {
		return todos, fmt.Errorf("failed to save after deleting todo: %w", err)
	}

	return updatedTodos, nil
}

// FilterTodos filters todos based on done status and/or priority.
// Use nil pointers to skip filtering by that field.
// Returns a new slice containing only the matching todos.
func FilterTodos(todos []Todo, done *bool, priority *string) []Todo {
	if done == nil && priority == nil {
		// No filters, return copy of original slice
		result := make([]Todo, len(todos))
		copy(result, todos)
		return result
	}

	var filtered []Todo
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