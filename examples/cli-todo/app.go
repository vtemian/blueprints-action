package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"../utils"
)

// Todo represents a single todo item
type Todo struct {
	ID       int    `json:"id"`
	Text     string `json:"text"`
	Done     bool   `json:"done"`
	Created  string `json:"created"`
	Priority string `json:"priority"`
}

// Custom error types for different failure modes
type TodoError struct {
	Op  string
	Err error
}

func (e *TodoError) Error() string {
	return fmt.Sprintf("todo %s: %v", e.Op, e.Err)
}

func (e *TodoError) Unwrap() error {
	return e.Err
}

var (
	ErrTodoNotFound    = fmt.Errorf("todo not found")
	ErrInvalidPriority = fmt.Errorf("priority must be one of: low, medium, high")
	ErrEmptyText       = fmt.Errorf("todo text cannot be empty")
)

// validPriorities defines allowed priority values
var validPriorities = map[string]bool{
	"low":    true,
	"medium": true,
	"high":   true,
}

// getTodosFilePath returns the path to the todos file in the user's home directory
func getTodosFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", &TodoError{Op: "get home directory", Err: err}
	}
	return filepath.Join(homeDir, ".todos.json"), nil
}

// validateTodo validates todo fields
func validateTodo(text, priority string) error {
	if text == "" {
		return ErrEmptyText
	}
	if !validPriorities[priority] {
		return ErrInvalidPriority
	}
	return nil
}

// LoadTodos reads todos from ~/.todos.json
func LoadTodos() ([]Todo, error) {
	filePath, err := getTodosFilePath()
	if err != nil {
		return nil, err
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// Create empty todos file
		if err := SaveTodos([]Todo{}); err != nil {
			return nil, &TodoError{Op: "create initial file", Err: err}
		}
		return []Todo{}, nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, &TodoError{Op: "read file", Err: err}
	}

	var todos []Todo
	if err := json.Unmarshal(data, &todos); err != nil {
		// Backup corrupted file
		backupPath := filePath + ".backup"
		if backupErr := os.WriteFile(backupPath, data, 0644); backupErr != nil {
			return nil, &TodoError{Op: "backup corrupted file", Err: fmt.Errorf("original error: %w, backup error: %v", err, backupErr)}
		}

		// Create new empty file
		if saveErr := SaveTodos([]Todo{}); saveErr != nil {
			return nil, &TodoError{Op: "recreate after corruption", Err: fmt.Errorf("original error: %w, recreate error: %v", err, saveErr)}
		}

		return []Todo{}, &TodoError{Op: "parse JSON (file backed up)", Err: err}
	}

	return todos, nil
}

// SaveTodos writes todos to file with atomic operations
func SaveTodos(todos []Todo) error {
	filePath, err := getTodosFilePath()
	if err != nil {
		return err
	}

	// Ensure directory exists
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return &TodoError{Op: "create directory", Err: err}
	}

	// Marshal todos to JSON
	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return &TodoError{Op: "marshal JSON", Err: err}
	}

	// Write to temporary file first (atomic operation)
	tempFile := filePath + ".tmp"
	if err := os.WriteFile(tempFile, data, 0644); err != nil {
		return &TodoError{Op: "write temporary file", Err: err}
	}

	// Atomic rename
	if err := os.Rename(tempFile, filePath); err != nil {
		// Clean up temporary file on failure
		os.Remove(tempFile)
		return &TodoError{Op: "atomic rename", Err: err}
	}

	return nil
}

// AddTodo creates a new todo with auto-incrementing ID
func AddTodo(text, priority string) (Todo, error) {
	if err := validateTodo(text, priority); err != nil {
		return Todo{}, &TodoError{Op: "validate todo", Err: err}
	}

	todos, err := LoadTodos()
	if err != nil {
		return Todo{}, &TodoError{Op: "load todos", Err: err}
	}

	// Find next available ID
	maxID := 0
	for _, todo := range todos {
		if todo.ID > maxID {
			maxID = todo.ID
		}
	}

	newTodo := Todo{
		ID:       maxID + 1,
		Text:     text,
		Done:     false,
		Created:  time.Now().Format(time.RFC3339),
		Priority: priority,
	}

	todos = append(todos, newTodo)
	if err := SaveTodos(todos); err != nil {
		return Todo{}, &TodoError{Op: "save todos", Err: err}
	}

	return newTodo, nil
}

// GetTodo finds a todo by ID
func GetTodo(id int, todos []Todo) (*Todo, error) {
	if id <= 0 {
		return nil, &TodoError{Op: "validate ID", Err: fmt.Errorf("ID must be positive, got %d", id)}
	}

	for i := range todos {
		if todos[i].ID == id {
			return &todos[i], nil
		}
	}

	return nil, &TodoError{Op: "find todo", Err: ErrTodoNotFound}
}

// UpdateTodo updates specific fields of a todo
func UpdateTodo(id int, changes map[string]interface{}, todos []Todo) error {
	if id <= 0 {
		return &TodoError{Op: "validate ID", Err: fmt.Errorf("ID must be positive, got %d", id)}
	}

	if len(changes) == 0 {
		return &TodoError{Op: "validate changes", Err: fmt.Errorf("no changes provided")}
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
		return &TodoError{Op: "find todo", Err: ErrTodoNotFound}
	}

	// Apply changes with validation
	for field, value := range changes {
		switch field {
		case "text":
			if text, ok := value.(string); ok {
				if text == "" {
					return &TodoError{Op: "validate text", Err: ErrEmptyText}
				}
				todos[todoIndex].Text = text
			} else {
				return &TodoError{Op: "validate text type", Err: fmt.Errorf("text must be string")}
			}
		case "done":
			if done, ok := value.(bool); ok {
				todos[todoIndex].Done = done
			} else {
				return &TodoError{Op: "validate done type", Err: fmt.Errorf("done must be boolean")}
			}
		case "priority":
			if priority, ok := value.(string); ok {
				if !validPriorities[priority] {
					return &TodoError{Op: "validate priority", Err: ErrInvalidPriority}
				}
				todos[todoIndex].Priority = priority
			} else {
				return &TodoError{Op: "validate priority type", Err: fmt.Errorf("priority must be string")}
			}
		default:
			return &TodoError{Op: "validate field", Err: fmt.Errorf("unknown field: %s", field)}
		}
	}

	if err := SaveTodos(todos); err != nil {
		return &TodoError{Op: "save todos", Err: err}
	}

	return nil
}

// DeleteTodo removes a todo and returns the updated slice
func DeleteTodo(id int, todos []Todo) ([]Todo, error) {
	if id <= 0 {
		return nil, &TodoError{Op: "validate ID", Err: fmt.Errorf("ID must be positive, got %d", id)}
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
		return nil, &TodoError{Op: "find todo", Err: ErrTodoNotFound}
	}

	// Remove todo from slice (bounds checking already done above)
	updatedTodos := make([]Todo, 0, len(todos)-1)
	updatedTodos = append(updatedTodos, todos[:todoIndex]...)
	updatedTodos = append(updatedTodos, todos[todoIndex+1:]...)

	if err := SaveTodos(updatedTodos); err != nil {
		return nil, &TodoError{Op: "save todos", Err: err}
	}

	return updatedTodos, nil
}

// FilterTodos filters todos based on done status and priority
// Parameters can be nil to skip filtering on that field
func FilterTodos(todos []Todo, done *bool, priority *string) []Todo {
	if len(todos) == 0 {
		return []Todo{}
	}

	// Validate priority if provided
	if priority != nil && !validPriorities[*priority] {
		// Return empty slice for invalid priority rather than panicking
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

// Helper functions for common filtering operations

// GetNextID returns the next available ID for a new todo
func GetNextID(todos []Todo) int {
	maxID := 0
	for _, todo := range todos {
		if todo.ID > maxID {
			maxID = todo.ID
		}
	}
	return maxID + 1
}

// GetCompletedTodos returns all completed todos
func GetCompletedTodos(todos []Todo) []Todo {
	done := true
	return FilterTodos(todos, &done, nil)
}

// GetPendingTodos returns all pending todos
func GetPendingTodos(todos []Todo) []Todo {
	done := false
	return FilterTodos(todos, &done, nil)
}

// GetTodosByPriority returns todos filtered by priority
func GetTodosByPriority(todos []Todo, priority string) []Todo {
	return FilterTodos(todos, nil, &priority)
}