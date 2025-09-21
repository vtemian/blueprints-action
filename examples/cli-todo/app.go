// Package app provides todo storage and core operations functionality.
// It manages todos in a JSON file located at ~/.todos.json with support
// for CRUD operations, filtering, and atomic file operations.
package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"utils"
)

// Todo represents a single todo item with all its properties.
type Todo struct {
	ID       int    `json:"id"`
	Text     string `json:"text"`
	Done     bool   `json:"done"`
	Created  string `json:"created"`
	Priority string `json:"priority"`
}

// validPriorities defines the allowed priority values.
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
	return filepath.Join(homeDir, ".todos.json"), nil
}

// createEmptyTodosFile creates an empty todos file with an empty JSON array.
func createEmptyTodosFile(filePath string) error {
	emptyTodos := []Todo{}
	data, err := json.MarshalIndent(emptyTodos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal empty todos: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to create empty todos file: %w", err)
	}

	return nil
}

// backupCorruptedFile creates a backup of the corrupted todos file.
func backupCorruptedFile(filePath string) error {
	backupPath := filePath + ".backup"
	
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read corrupted file for backup: %w", err)
	}

	if err := os.WriteFile(backupPath, data, 0644); err != nil {
		return fmt.Errorf("failed to create backup file: %w", err)
	}

	return nil
}

// validatePriority checks if the given priority is valid.
func validatePriority(priority string) error {
	if !validPriorities[priority] {
		return fmt.Errorf("invalid priority '%s': must be one of 'low', 'medium', 'high'", priority)
	}
	return nil
}

// getNextID returns the next available ID for a new todo.
func getNextID(todos []Todo) int {
	maxID := 0
	for _, todo := range todos {
		if todo.ID > maxID {
			maxID = todo.ID
		}
	}
	return maxID + 1
}

// validateTodos performs validation on loaded todos to ensure data integrity.
func validateTodos(todos []Todo) error {
	idMap := make(map[int]bool)
	
	for _, todo := range todos {
		// Check for duplicate IDs
		if idMap[todo.ID] {
			return fmt.Errorf("duplicate todo ID found: %d", todo.ID)
		}
		idMap[todo.ID] = true

		// Validate priority
		if err := validatePriority(todo.Priority); err != nil {
			return fmt.Errorf("todo ID %d has %w", todo.ID, err)
		}

		// Validate created timestamp
		if _, err := time.Parse(time.RFC3339, todo.Created); err != nil {
			return fmt.Errorf("todo ID %d has invalid created timestamp: %w", todo.ID, err)
		}
	}

	return nil
}

// LoadTodos reads todos from the ~/.todos.json file.
// If the file doesn't exist, it creates an empty one.
// If the file is corrupted, it backs it up and creates a new empty file.
func LoadTodos() ([]Todo, error) {
	filePath, err := getTodosFilePath()
	if err != nil {
		return nil, fmt.Errorf("failed to get todos file path: %w", err)
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
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
		// Handle corrupted JSON
		if backupErr := backupCorruptedFile(filePath); backupErr != nil {
			return nil, fmt.Errorf("failed to backup corrupted file and JSON parse error: %v, backup error: %w", err, backupErr)
		}

		if createErr := createEmptyTodosFile(filePath); createErr != nil {
			return nil, fmt.Errorf("failed to recreate todos file after corruption: %w", createErr)
		}

		return []Todo{}, fmt.Errorf("corrupted todos file backed up and recreated: %w", err)
	}

	// Validate loaded todos
	if err := validateTodos(todos); err != nil {
		// Handle invalid data
		if backupErr := backupCorruptedFile(filePath); backupErr != nil {
			return nil, fmt.Errorf("failed to backup invalid file and validation error: %v, backup error: %w", err, backupErr)
		}

		if createErr := createEmptyTodosFile(filePath); createErr != nil {
			return nil, fmt.Errorf("failed to recreate todos file after validation failure: %w", createErr)
		}

		return []Todo{}, fmt.Errorf("invalid todos file backed up and recreated: %w", err)
	}

	return todos, nil
}

// SaveTodos writes todos to the ~/.todos.json file using atomic writes.
// It writes to a temporary file first, then renames it to ensure data integrity.
func SaveTodos(todos []Todo) error {
	filePath, err := getTodosFilePath()
	if err != nil {
		return fmt.Errorf("failed to get todos file path: %w", err)
	}

	// Validate todos before saving
	if err := validateTodos(todos); err != nil {
		return fmt.Errorf("validation failed before saving: %w", err)
	}

	// Marshal todos to JSON
	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal todos to JSON: %w", err)
	}

	// Create temporary file for atomic write
	tempPath := filePath + ".tmp"
	
	// Write to temporary file
	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write to temporary file: %w", err)
	}

	// Atomic rename
	if err := os.Rename(tempPath, filePath); err != nil {
		// Clean up temporary file on failure
		os.Remove(tempPath)
		return fmt.Errorf("failed to rename temporary file: %w", err)
	}

	return nil
}

// AddTodo creates a new todo with the given text and optional priority.
// If no priority is provided, it defaults to "medium".
// Returns the created todo with generated ID and timestamp.
func AddTodo(text string, priority ...string) (*Todo, error) {
	// Validate input
	if text == "" {
		return nil, fmt.Errorf("todo text cannot be empty")
	}

	// Set default priority
	todoPriority := "medium"
	if len(priority) > 0 {
		todoPriority = priority[0]
	}

	// Validate priority
	if err := validatePriority(todoPriority); err != nil {
		return nil, fmt.Errorf("failed to add todo: %w", err)
	}

	// Load existing todos to get next ID
	todos, err := LoadTodos()
	if err != nil {
		return nil, fmt.Errorf("failed to load todos for ID generation: %w", err)
	}

	// Create new todo
	newTodo := &Todo{
		ID:       getNextID(todos),
		Text:     text,
		Done:     false,
		Created:  time.Now().Format(time.RFC3339),
		Priority: todoPriority,
	}

	// Add to todos slice
	todos = append(todos, *newTodo)

	// Save updated todos
	if err := SaveTodos(todos); err != nil {
		return nil, fmt.Errorf("failed to save new todo: %w", err)
	}

	return newTodo, nil
}

// GetTodo finds and returns a todo by its ID.
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

// UpdateTodo updates a todo's fields based on the provided changes map.
// Supported fields: "text", "done", "priority".
// The changes map should contain field names as keys and new values as values.
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
				if err := validatePriority(priority); err != nil {
					return fmt.Errorf("failed to update priority: %w", err)
				}
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

// DeleteTodo removes a todo by its ID and returns the updated todos slice.
// Returns an error if the todo is not found.
func DeleteTodo(todos []Todo, id int) ([]Todo, error) {
	if id <= 0 {
		return nil, fmt.Errorf("invalid todo ID: %d", id)
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

// FilterTodos filters todos based on optional criteria.
// If done is nil, todos with any completion status are included.
// If priority is nil, todos with any priority are included.
// Returns a new slice containing only the todos that match the criteria.
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