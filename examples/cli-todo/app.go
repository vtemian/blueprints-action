// Package app provides todo storage and core operations with JSON file persistence.
package app

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Todo represents a single todo item with all its properties.
type Todo struct {
	ID       int       `json:"id"`
	Text     string    `json:"text"`
	Done     bool      `json:"done"`
	Created  time.Time `json:"created"`
	Priority string    `json:"priority"`
}

const (
	todosFileName   = ".todos.json"
	backupFileName  = ".todos.json.backup"
	tempFilePrefix  = ".todos.tmp"
)

var validPriorities = map[string]bool{
	"low":    true,
	"medium": true,
	"high":   true,
}

// getTodosFilePath returns the full path to the todos file in the user's home directory.
func getTodosFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, todosFileName), nil
}

// getBackupFilePath returns the full path to the backup todos file.
func getBackupFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, backupFileName), nil
}

// LoadTodos reads todos from ~/.todos.json and returns them as a slice.
// If the file doesn't exist, it creates an empty file and returns an empty slice.
// If the file is corrupted, it backs up the file and creates a new empty one.
func LoadTodos() ([]Todo, error) {
	filePath, err := getTodosFilePath()
	if err != nil {
		return nil, err
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// Create empty file
		if err := createEmptyTodosFile(filePath); err != nil {
			return nil, fmt.Errorf("failed to create todos file: %w", err)
		}
		return []Todo{}, nil
	}

	// Read file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read todos file: %w", err)
	}

	// Parse JSON
	var todos []Todo
	if err := json.Unmarshal(data, &todos); err != nil {
		// Handle corrupted JSON by backing up and creating new file
		if backupErr := backupCorruptedFile(filePath); backupErr != nil {
			return nil, fmt.Errorf("failed to backup corrupted file: %w", backupErr)
		}
		
		if createErr := createEmptyTodosFile(filePath); createErr != nil {
			return nil, fmt.Errorf("failed to recreate todos file after corruption: %w", createErr)
		}
		
		return []Todo{}, nil
	}

	return todos, nil
}

// SaveTodos writes the todos slice to ~/.todos.json using atomic write operations.
func SaveTodos(todos []Todo) error {
	filePath, err := getTodosFilePath()
	if err != nil {
		return err
	}

	// Marshal todos to JSON
	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal todos to JSON: %w", err)
	}

	// Write atomically using temporary file
	return writeFileAtomic(filePath, data)
}

// AddTodo creates a new todo with the given text and optional priority.
// If no priority is provided, it defaults to "medium".
// Returns the created todo with auto-generated ID and timestamp.
func AddTodo(text string, priority ...string) (Todo, error) {
	if text == "" {
		return Todo{}, fmt.Errorf("todo text cannot be empty")
	}

	// Determine priority
	prio := "medium" // default
	if len(priority) > 0 && priority[0] != "" {
		prio = priority[0]
	}

	// Validate priority
	if !validPriorities[prio] {
		return Todo{}, fmt.Errorf("invalid priority '%s': must be one of 'low', 'medium', 'high'", prio)
	}

	// Load existing todos to generate unique ID
	todos, err := LoadTodos()
	if err != nil {
		return Todo{}, fmt.Errorf("failed to load existing todos: %w", err)
	}

	// Generate unique ID
	maxID := 0
	for _, todo := range todos {
		if todo.ID > maxID {
			maxID = todo.ID
		}
	}

	// Create new todo
	newTodo := Todo{
		ID:       maxID + 1,
		Text:     text,
		Done:     false,
		Created:  time.Now().UTC(),
		Priority: prio,
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
	for i := range todos {
		if todos[i].ID == id {
			return &todos[i], nil
		}
	}
	return nil, fmt.Errorf("todo with ID %d not found", id)
}

// UpdateTodo updates a todo's fields based on the provided changes map.
// Supported fields: "text", "done", "priority".
// The changes are applied directly to the todo in the slice.
func UpdateTodo(todos []Todo, id int, changes map[string]interface{}) error {
	todo, err := GetTodo(todos, id)
	if err != nil {
		return err
	}

	// Apply changes
	for field, value := range changes {
		switch field {
		case "text":
			if text, ok := value.(string); ok {
				if text == "" {
					return fmt.Errorf("todo text cannot be empty")
				}
				todo.Text = text
			} else {
				return fmt.Errorf("invalid type for field 'text': expected string")
			}
		case "done":
			if done, ok := value.(bool); ok {
				todo.Done = done
			} else {
				return fmt.Errorf("invalid type for field 'done': expected bool")
			}
		case "priority":
			if priority, ok := value.(string); ok {
				if !validPriorities[priority] {
					return fmt.Errorf("invalid priority '%s': must be one of 'low', 'medium', 'high'", priority)
				}
				todo.Priority = priority
			} else {
				return fmt.Errorf("invalid type for field 'priority': expected string")
			}
		default:
			return fmt.Errorf("unknown field '%s'", field)
		}
	}

	return nil
}

// DeleteTodo removes a todo by its ID and returns the updated slice.
// Returns an error if the todo is not found.
func DeleteTodo(todos []Todo, id int) ([]Todo, error) {
	for i, todo := range todos {
		if todo.ID == id {
			// Remove todo by slicing around it
			return append(todos[:i], todos[i+1:]...), nil
		}
	}
	return todos, fmt.Errorf("todo with ID %d not found", id)
}

// FilterTodos returns a filtered slice of todos based on done status and/or priority.
// Pass nil for parameters you don't want to filter by.
func FilterTodos(todos []Todo, done *bool, priority *string) []Todo {
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

// Helper functions

// createEmptyTodosFile creates an empty todos file with an empty JSON array.
func createEmptyTodosFile(filePath string) error {
	emptyTodos := []Todo{}
	data, err := json.MarshalIndent(emptyTodos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal empty todos: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write empty todos file: %w", err)
	}

	return nil
}

// backupCorruptedFile creates a backup of the corrupted todos file.
func backupCorruptedFile(filePath string) error {
	backupPath, err := getBackupFilePath()
	if err != nil {
		return err
	}

	sourceFile, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open corrupted file: %w", err)
	}
	defer sourceFile.Close()

	backupFile, err := os.Create(backupPath)
	if err != nil {
		return fmt.Errorf("failed to create backup file: %w", err)
	}
	defer backupFile.Close()

	if _, err := io.Copy(backupFile, sourceFile); err != nil {
		return fmt.Errorf("failed to copy to backup file: %w", err)
	}

	return nil
}

// writeFileAtomic writes data to a file atomically by writing to a temporary file
// and then renaming it to the target file.
func writeFileAtomic(filePath string, data []byte) error {
	dir := filepath.Dir(filePath)
	
	// Create temporary file in the same directory
	tempFile, err := os.CreateTemp(dir, tempFilePrefix)
	if err != nil {
		return fmt.Errorf("failed to create temporary file: %w", err)
	}
	
	tempPath := tempFile.Name()
	
	// Clean up temp file on error
	defer func() {
		if tempFile != nil {
			tempFile.Close()
			os.Remove(tempPath)
		}
	}()

	// Write data to temp file
	if _, err := tempFile.Write(data); err != nil {
		return fmt.Errorf("failed to write to temporary file: %w", err)
	}

	// Sync to ensure data is written to disk
	if err := tempFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync temporary file: %w", err)
	}

	// Close temp file
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("failed to close temporary file: %w", err)
	}
	tempFile = nil // Prevent cleanup in defer

	// Atomically rename temp file to target file
	if err := os.Rename(tempPath, filePath); err != nil {
		os.Remove(tempPath) // Clean up on rename failure
		return fmt.Errorf("failed to rename temporary file: %w", err)
	}

	return nil
}