package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Todo represents a single todo item with all required fields
type Todo struct {
	ID       int    `json:"id"`
	Text     string `json:"text"`
	Done     bool   `json:"done"`
	Created  string `json:"created"`
	Priority string `json:"priority"`
}

const (
	todosFileName       = ".todos.json"
	todosBackupFileName = ".todos.json.backup"
)

var validPriorities = map[string]bool{
	"low":    true,
	"medium": true,
	"high":   true,
}

// getTodosFilePath returns the full path to the todos file in the user's home directory
func getTodosFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, todosFileName), nil
}

// getBackupFilePath returns the full path to the backup todos file
func getBackupFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, todosBackupFileName), nil
}

// validatePriority checks if the given priority is valid
func validatePriority(priority string) error {
	if priority == "" {
		return fmt.Errorf("priority cannot be empty")
	}
	if !validPriorities[strings.ToLower(priority)] {
		return fmt.Errorf("invalid priority '%s': must be 'low', 'medium', or 'high'", priority)
	}
	return nil
}

// getNextID returns the next available ID for a new todo
func getNextID(todos []Todo) int {
	maxID := 0
	for _, todo := range todos {
		if todo.ID > maxID {
			maxID = todo.ID
		}
	}
	return maxID + 1
}

// backupCorruptedFile creates a backup of the corrupted todos file
func backupCorruptedFile(filePath string) error {
	backupPath, err := getBackupFilePath()
	if err != nil {
		return fmt.Errorf("failed to get backup file path: %w", err)
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read corrupted file for backup: %w", err)
	}

	if err := os.WriteFile(backupPath, data, 0644); err != nil {
		return fmt.Errorf("failed to create backup file: %w", err)
	}

	return nil
}

// LoadTodos reads todos from the JSON file in the user's home directory.
// If the file doesn't exist, it returns an empty slice.
// If the file is corrupted, it backs up the file and returns an empty slice.
func LoadTodos() ([]Todo, error) {
	filePath, err := getTodosFilePath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			// File doesn't exist, return empty slice
			return []Todo{}, nil
		}
		if os.IsPermission(err) {
			return nil, fmt.Errorf("permission denied reading todos file '%s': check file permissions", filePath)
		}
		return nil, fmt.Errorf("failed to read todos file '%s': %w", filePath, err)
	}

	// Handle empty file
	if len(data) == 0 {
		return []Todo{}, nil
	}

	var todos []Todo
	if err := json.Unmarshal(data, &todos); err != nil {
		// Handle corrupted JSON
		var syntaxErr *json.SyntaxError
		if json.As(err, &syntaxErr) {
			// Backup the corrupted file
			if backupErr := backupCorruptedFile(filePath); backupErr != nil {
				return nil, fmt.Errorf("corrupted JSON file and failed to create backup: %w", backupErr)
			}
			// Remove the corrupted file
			if removeErr := os.Remove(filePath); removeErr != nil {
				return nil, fmt.Errorf("corrupted JSON file backed up but failed to remove original: %w", removeErr)
			}
			// Return empty slice after handling corruption
			return []Todo{}, nil
		}
		return nil, fmt.Errorf("failed to parse todos JSON: %w", err)
	}

	return todos, nil
}

// SaveTodos writes the todos slice to the JSON file in the user's home directory.
// It creates the file if it doesn't exist and handles permission errors gracefully.
func SaveTodos(todos []Todo) error {
	if todos == nil {
		todos = []Todo{}
	}

	filePath, err := getTodosFilePath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal todos to JSON: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied writing to todos file '%s': check directory and file permissions", filePath)
		}
		return fmt.Errorf("failed to write todos file '%s': %w", filePath, err)
	}

	return nil
}

// AddTodo creates a new todo with the given text and priority.
// It automatically assigns an ID and sets the creation timestamp.
// The priority must be one of: "low", "medium", "high" (case-insensitive).
func AddTodo(text string, priority string) (Todo, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return Todo{}, fmt.Errorf("todo text cannot be empty")
	}

	priority = strings.ToLower(strings.TrimSpace(priority))
	if err := validatePriority(priority); err != nil {
		return Todo{}, err
	}

	// Load existing todos to get the next ID
	todos, err := LoadTodos()
	if err != nil {
		return Todo{}, fmt.Errorf("failed to load existing todos: %w", err)
	}

	todo := Todo{
		ID:       getNextID(todos),
		Text:     text,
		Done:     false,
		Created:  time.Now().Format(time.RFC3339),
		Priority: priority,
	}

	return todo, nil
}

// GetTodo finds and returns a pointer to the todo with the specified ID.
// Returns an error if the todo is not found.
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

// UpdateTodo updates the specified todo with the given changes.
// Only "text", "done", and "priority" fields can be updated.
// The changes map should contain field names as keys and new values as values.
func UpdateTodo(todos []Todo, id int, changes map[string]interface{}) error {
	if id <= 0 {
		return fmt.Errorf("invalid todo ID: %d", id)
	}

	if len(changes) == 0 {
		return fmt.Errorf("no changes provided")
	}

	todo, err := GetTodo(todos, id)
	if err != nil {
		return err
	}

	// Validate and apply changes
	for field, value := range changes {
		switch field {
		case "text":
			text, ok := value.(string)
			if !ok {
				return fmt.Errorf("text field must be a string")
			}
			text = strings.TrimSpace(text)
			if text == "" {
				return fmt.Errorf("todo text cannot be empty")
			}
			todo.Text = text

		case "done":
			done, ok := value.(bool)
			if !ok {
				return fmt.Errorf("done field must be a boolean")
			}
			todo.Done = done

		case "priority":
			priority, ok := value.(string)
			if !ok {
				return fmt.Errorf("priority field must be a string")
			}
			priority = strings.ToLower(strings.TrimSpace(priority))
			if err := validatePriority(priority); err != nil {
				return err
			}
			todo.Priority = priority

		default:
			return fmt.Errorf("field '%s' cannot be updated", field)
		}
	}

	return nil
}

// DeleteTodo removes the todo with the specified ID from the slice.
// Returns the updated slice and an error if the todo is not found.
func DeleteTodo(todos []Todo, id int) ([]Todo, error) {
	if id <= 0 {
		return todos, fmt.Errorf("invalid todo ID: %d", id)
	}

	for i, todo := range todos {
		if todo.ID == id {
			// Remove the todo by slicing around it
			return append(todos[:i], todos[i+1:]...), nil
		}
	}

	return todos, fmt.Errorf("todo with ID %d not found", id)
}

// FilterTodos returns a filtered slice of todos based on the provided criteria.
// Use nil for parameters you don't want to filter by.
// done: filter by completion status (nil = no filter, true = completed only, false = incomplete only)
// priority: filter by priority level (nil = no filter, otherwise filter by exact match)
func FilterTodos(todos []Todo, done *bool, priority *string) []Todo {
	if todos == nil {
		return []Todo{}
	}

	var filtered []Todo

	for _, todo := range todos {
		// Check done status filter
		if done != nil && todo.Done != *done {
			continue
		}

		// Check priority filter
		if priority != nil {
			filterPriority := strings.ToLower(strings.TrimSpace(*priority))
			if todo.Priority != filterPriority {
				continue
			}
		}

		filtered = append(filtered, todo)
	}

	return filtered
}