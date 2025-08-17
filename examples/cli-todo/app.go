package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "utils" // placeholder import
)

// Todo represents a single todo item
type Todo struct {
	ID       int    `json:"id"`
	Text     string `json:"text"`
	Done     bool   `json:"done"`
	Created  string `json:"created"`
	Priority string `json:"priority"`
}

var (
	// fileMutex ensures thread-safe file operations
	fileMutex sync.RWMutex
	// validPriorities defines allowed priority values
	validPriorities = map[string]bool{
		"low":    true,
		"medium": true,
		"high":   true,
	}
)

// getTodosFilePath returns the path to the todos file
func getTodosFilePath() (string, error) {
	homeDir := os.Getenv("HOME")
	if homeDir == "" {
		return "", fmt.Errorf("HOME environment variable not set")
	}
	return filepath.Join(homeDir, ".todos.json"), nil
}

// validatePriority checks if the priority value is valid
func validatePriority(priority string) error {
	if !validPriorities[priority] {
		return fmt.Errorf("invalid priority '%s': must be one of 'low', 'medium', or 'high'", priority)
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

// LoadTodos reads todos from ~/.todos.json file
// Auto-creates the file if missing, handles corrupted JSON by backing up and recreating
func LoadTodos() ([]Todo, error) {
	fileMutex.RLock()
	defer fileMutex.RUnlock()

	filePath, err := getTodosFilePath()
	if err != nil {
		return nil, fmt.Errorf("failed to get todos file path: %w", err)
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// Create empty todos file
		if err := createEmptyTodosFile(filePath); err != nil {
			return nil, fmt.Errorf("failed to create todos file: %w", err)
		}
		return []Todo{}, nil
	}

	// Read file content
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read todos file: %w", err)
	}

	// Handle empty file
	if len(data) == 0 {
		return []Todo{}, nil
	}

	var todos []Todo
	if err := json.Unmarshal(data, &todos); err != nil {
		// Handle corrupted JSON by backing up and recreating
		backupPath := filePath + ".backup"
		if backupErr := os.Rename(filePath, backupPath); backupErr != nil {
			return nil, fmt.Errorf("failed to backup corrupted todos file: %w", backupErr)
		}

		if createErr := createEmptyTodosFile(filePath); createErr != nil {
			return nil, fmt.Errorf("failed to recreate todos file after corruption (backup saved to %s): %w", backupPath, createErr)
		}

		return []Todo{}, fmt.Errorf("corrupted todos file backed up to %s and recreated: %w", backupPath, err)
	}

	return todos, nil
}

// createEmptyTodosFile creates an empty todos file with proper permissions
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

// SaveTodos writes todos to file with proper JSON formatting using atomic writes
func SaveTodos(todos []Todo) error {
	if todos == nil {
		todos = []Todo{}
	}

	fileMutex.Lock()
	defer fileMutex.Unlock()

	filePath, err := getTodosFilePath()
	if err != nil {
		return fmt.Errorf("failed to get todos file path: %w", err)
	}

	// Marshal todos with indentation for readability
	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal todos: %w", err)
	}

	// Use atomic write with temporary file
	tempPath := filePath + ".tmp"
	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write temporary todos file: %w", err)
	}

	// Atomic rename
	if err := os.Rename(tempPath, filePath); err != nil {
		// Clean up temp file on failure
		os.Remove(tempPath)
		return fmt.Errorf("failed to rename temporary todos file: %w", err)
	}

	return nil
}

// AddTodo creates a new todo with auto-incrementing ID and default priority "medium"
func AddTodo(text string, priority ...string) (Todo, error) {
	// Validate input
	if text == "" {
		return Todo{}, fmt.Errorf("todo text cannot be empty")
	}

	// Set default priority or validate provided priority
	selectedPriority := "medium"
	if len(priority) > 0 {
		selectedPriority = priority[0]
		if err := validatePriority(selectedPriority); err != nil {
			return Todo{}, err
		}
	}

	// Load existing todos to get next ID
	todos, err := LoadTodos()
	if err != nil {
		return Todo{}, fmt.Errorf("failed to load todos for ID generation: %w", err)
	}

	// Create new todo
	todo := Todo{
		ID:       getNextID(todos),
		Text:     text,
		Done:     false,
		Created:  time.Now().Format(time.RFC3339),
		Priority: selectedPriority,
	}

	return todo, nil
}

// GetTodo finds a todo by ID and returns a pointer to it
func GetTodo(todos []Todo, id int) (*Todo, error) {
	if todos == nil {
		return nil, fmt.Errorf("todos slice is nil")
	}

	for i := range todos {
		if todos[i].ID == id {
			return &todos[i], nil
		}
	}

	return nil, fmt.Errorf("todo with ID %d not found", id)
}

// UpdateTodo updates todo fields (text, done, priority) with validation
func UpdateTodo(todos []Todo, id int, changes map[string]interface{}) error {
	if todos == nil {
		return fmt.Errorf("todos slice is nil")
	}

	if changes == nil {
		return fmt.Errorf("changes map is nil")
	}

	// Find todo by ID
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

	// Apply changes with validation
	for field, value := range changes {
		switch field {
		case "text":
			text, ok := value.(string)
			if !ok {
				return fmt.Errorf("invalid type for field 'text': expected string, got %T", value)
			}
			if text == "" {
				return fmt.Errorf("todo text cannot be empty")
			}
			todos[todoIndex].Text = text

		case "done":
			done, ok := value.(bool)
			if !ok {
				return fmt.Errorf("invalid type for field 'done': expected bool, got %T", value)
			}
			todos[todoIndex].Done = done

		case "priority":
			priority, ok := value.(string)
			if !ok {
				return fmt.Errorf("invalid type for field 'priority': expected string, got %T", value)
			}
			if err := validatePriority(priority); err != nil {
				return fmt.Errorf("invalid priority value: %w", err)
			}
			todos[todoIndex].Priority = priority

		default:
			return fmt.Errorf("unknown field '%s': valid fields are 'text', 'done', 'priority'", field)
		}
	}

	return nil
}

// DeleteTodo removes a todo by ID and returns the updated slice
func DeleteTodo(todos []Todo, id int) ([]Todo, error) {
	if todos == nil {
		return nil, fmt.Errorf("todos slice is nil")
	}

	for i, todo := range todos {
		if todo.ID == id {
			// Remove todo by slicing
			updatedTodos := make([]Todo, 0, len(todos)-1)
			updatedTodos = append(updatedTodos, todos[:i]...)
			updatedTodos = append(updatedTodos, todos[i+1:]...)
			return updatedTodos, nil
		}
	}

	return nil, fmt.Errorf("todo with ID %d not found", id)
}

// FilterTodos filters todos by done status and/or priority using pointers for optional params
func FilterTodos(todos []Todo, done *bool, priority *string) []Todo {
	if todos == nil {
		return []Todo{}
	}

	// Validate priority if provided
	if priority != nil && *priority != "" {
		if err := validatePriority(*priority); err != nil {
			// Return empty slice for invalid priority
			return []Todo{}
		}
	}

	var filtered []Todo
	for _, todo := range todos {
		// Check done status filter
		if done != nil && todo.Done != *done {
			continue
		}

		// Check priority filter
		if priority != nil && *priority != "" && todo.Priority != *priority {
			continue
		}

		filtered = append(filtered, todo)
	}

	return filtered
}