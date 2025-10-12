// Package app provides todo storage and core operations functionality.
// It manages todos in a JSON file located at ~/.todos.json with automatic
// backup and recovery capabilities.
package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"utils" // Custom utils package
)

// Todo represents a single todo item with all its properties.
type Todo struct {
	ID       int    `json:"id"`
	Text     string `json:"text"`
	Done     bool   `json:"done"`
	Created  string `json:"created"`
	Priority string `json:"priority"`
}

// Custom error types for different failure scenarios
type TodoError struct {
	Type    string
	Message string
	Err     error
}

func (e *TodoError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", e.Type, e.Message, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Type, e.Message)
}

func (e *TodoError) Unwrap() error {
	return e.Err
}

// Error type constants
const (
	ErrTypeFileCorrupted = "FileCorrupted"
	ErrTypeTodoNotFound  = "TodoNotFound"
	ErrTypeInvalidInput  = "InvalidInput"
	ErrTypeFileOperation = "FileOperation"
)

var (
	// Mutex for thread-safe file operations
	fileMutex sync.RWMutex
	// Cache for the todos file path
	todosFilePath string
	// Initialize path once
	pathOnce sync.Once
)

// getTodosFilePath returns the path to the todos file, initializing it once.
func getTodosFilePath() (string, error) {
	var err error
	pathOnce.Do(func() {
		var homeDir string
		homeDir, err = os.UserHomeDir()
		if err != nil {
			return
		}
		todosFilePath = filepath.Join(homeDir, ".todos.json")
	})
	return todosFilePath, err
}

// LoadTodos reads todos from the JSON file, handling missing and corrupted cases.
// It automatically creates an empty file if none exists and backs up corrupted files.
func LoadTodos() ([]Todo, error) {
	fileMutex.RLock()
	defer fileMutex.RUnlock()

	filePath, err := getTodosFilePath()
	if err != nil {
		return nil, &TodoError{
			Type:    ErrTypeFileOperation,
			Message: "failed to get home directory",
			Err:     err,
		}
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// Create empty todos file
		if err := createEmptyTodosFile(filePath); err != nil {
			return nil, err
		}
		return []Todo{}, nil
	}

	// Read file content
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, &TodoError{
			Type:    ErrTypeFileOperation,
			Message: "failed to read todos file",
			Err:     err,
		}
	}

	// Handle empty file
	if len(data) == 0 {
		if err := createEmptyTodosFile(filePath); err != nil {
			return nil, err
		}
		return []Todo{}, nil
	}

	// Parse JSON
	var todos []Todo
	if err := json.Unmarshal(data, &todos); err != nil {
		// Handle corrupted JSON by backing up and recreating
		if backupErr := backupCorruptedFile(filePath); backupErr != nil {
			utils.LogError("Failed to backup corrupted file: %v", backupErr)
		}
		
		if createErr := createEmptyTodosFile(filePath); createErr != nil {
			return nil, createErr
		}

		utils.LogInfo("Corrupted todos file backed up and recreated")
		return []Todo{}, &TodoError{
			Type:    ErrTypeFileCorrupted,
			Message: "todos file was corrupted and has been backed up, starting with empty list",
			Err:     err,
		}
	}

	return todos, nil
}

// SaveTodos writes todos to the JSON file atomically to prevent corruption.
// It uses a temporary file and atomic rename operation for safety.
func SaveTodos(todos []Todo) error {
	fileMutex.Lock()
	defer fileMutex.Unlock()

	filePath, err := getTodosFilePath()
	if err != nil {
		return &TodoError{
			Type:    ErrTypeFileOperation,
			Message: "failed to get home directory",
			Err:     err,
		}
	}

	// Marshal todos to JSON with proper formatting
	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return &TodoError{
			Type:    ErrTypeFileOperation,
			Message: "failed to marshal todos to JSON",
			Err:     err,
		}
	}

	// Write to temporary file first for atomic operation
	tempFile := filePath + ".tmp"
	if err := os.WriteFile(tempFile, data, 0644); err != nil {
		return &TodoError{
			Type:    ErrTypeFileOperation,
			Message: "failed to write temporary todos file",
			Err:     err,
		}
	}

	// Atomic rename
	if err := os.Rename(tempFile, filePath); err != nil {
		// Clean up temp file on failure
		os.Remove(tempFile)
		return &TodoError{
			Type:    ErrTypeFileOperation,
			Message: "failed to atomically update todos file",
			Err:     err,
		}
	}

	return nil
}

// AddTodo creates a new todo with the given text and optional priority.
// Priority defaults to "medium" if not specified. Returns a pointer to the created todo.
func AddTodo(text string, priority ...string) (*Todo, error) {
	if text == "" {
		return nil, &TodoError{
			Type:    ErrTypeInvalidInput,
			Message: "todo text cannot be empty",
		}
	}

	// Set default priority
	todoPriority := "medium"
	if len(priority) > 0 && priority[0] != "" {
		// Validate priority
		validPriorities := map[string]bool{
			"low":    true,
			"medium": true,
			"high":   true,
		}
		if !validPriorities[priority[0]] {
			return nil, &TodoError{
				Type:    ErrTypeInvalidInput,
				Message: "priority must be one of: low, medium, high",
			}
		}
		todoPriority = priority[0]
	}

	// Load existing todos to generate unique ID
	todos, err := LoadTodos()
	if err != nil {
		return nil, fmt.Errorf("failed to load existing todos: %w", err)
	}

	// Generate unique ID
	maxID := 0
	for _, todo := range todos {
		if todo.ID > maxID {
			maxID = todo.ID
		}
	}

	// Create new todo
	newTodo := &Todo{
		ID:       maxID + 1,
		Text:     text,
		Done:     false,
		Created:  time.Now().Format(time.RFC3339),
		Priority: todoPriority,
	}

	// Add to todos and save
	todos = append(todos, *newTodo)
	if err := SaveTodos(todos); err != nil {
		return nil, fmt.Errorf("failed to save new todo: %w", err)
	}

	return newTodo, nil
}

// GetTodo finds and returns a pointer to the todo with the specified ID.
// Returns an error if the todo is not found.
func GetTodo(todos []Todo, id int) (*Todo, error) {
	if id <= 0 {
		return nil, &TodoError{
			Type:    ErrTypeInvalidInput,
			Message: "todo ID must be positive",
		}
	}

	for i := range todos {
		if todos[i].ID == id {
			return &todos[i], nil
		}
	}

	return nil, &TodoError{
		Type:    ErrTypeTodoNotFound,
		Message: fmt.Sprintf("todo with ID %d not found", id),
	}
}

// UpdateTodo updates specific fields of a todo identified by ID using the provided changes map.
// Supported fields: "text", "done", "priority".
func UpdateTodo(todos []Todo, id int, changes map[string]interface{}) error {
	if id <= 0 {
		return &TodoError{
			Type:    ErrTypeInvalidInput,
			Message: "todo ID must be positive",
		}
	}

	if len(changes) == 0 {
		return &TodoError{
			Type:    ErrTypeInvalidInput,
			Message: "no changes provided",
		}
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
		return &TodoError{
			Type:    ErrTypeTodoNotFound,
			Message: fmt.Sprintf("todo with ID %d not found", id),
		}
	}

	// Apply changes with type validation
	for field, value := range changes {
		switch field {
		case "text":
			if text, ok := value.(string); ok {
				if text == "" {
					return &TodoError{
						Type:    ErrTypeInvalidInput,
						Message: "todo text cannot be empty",
					}
				}
				todos[todoIndex].Text = text
			} else {
				return &TodoError{
					Type:    ErrTypeInvalidInput,
					Message: "text field must be a string",
				}
			}
		case "done":
			if done, ok := value.(bool); ok {
				todos[todoIndex].Done = done
			} else {
				return &TodoError{
					Type:    ErrTypeInvalidInput,
					Message: "done field must be a boolean",
				}
			}
		case "priority":
			if priority, ok := value.(string); ok {
				validPriorities := map[string]bool{
					"low":    true,
					"medium": true,
					"high":   true,
				}
				if !validPriorities[priority] {
					return &TodoError{
						Type:    ErrTypeInvalidInput,
						Message: "priority must be one of: low, medium, high",
					}
				}
				todos[todoIndex].Priority = priority
			} else {
				return &TodoError{
					Type:    ErrTypeInvalidInput,
					Message: "priority field must be a string",
				}
			}
		default:
			return &TodoError{
				Type:    ErrTypeInvalidInput,
				Message: fmt.Sprintf("unknown field: %s", field),
			}
		}
	}

	// Save updated todos
	if err := SaveTodos(todos); err != nil {
		return fmt.Errorf("failed to save updated todo: %w", err)
	}

	return nil
}

// DeleteTodo removes the todo with the specified ID and returns the updated slice.
// Returns an error if the todo is not found.
func DeleteTodo(todos []Todo, id int) ([]Todo, error) {
	if id <= 0 {
		return nil, &TodoError{
			Type:    ErrTypeInvalidInput,
			Message: "todo ID must be positive",
		}
	}

	// Find and remove todo
	for i, todo := range todos {
		if todo.ID == id {
			// Remove todo by creating new slice
			result := make([]Todo, 0, len(todos)-1)
			result = append(result, todos[:i]...)
			result = append(result, todos[i+1:]...)
			
			// Save updated todos
			if err := SaveTodos(result); err != nil {
				return nil, fmt.Errorf("failed to save after deletion: %w", err)
			}
			
			return result, nil
		}
	}

	return nil, &TodoError{
		Type:    ErrTypeTodoNotFound,
		Message: fmt.Sprintf("todo with ID %d not found", id),
	}
}

// FilterTodos returns a filtered slice of todos based on done status and priority.
// Use nil pointers to skip filtering by that field.
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

// Helper function to create an empty todos file
func createEmptyTodosFile(filePath string) error {
	emptyTodos := []Todo{}
	data, err := json.MarshalIndent(emptyTodos, "", "  ")
	if err != nil {
		return &TodoError{
			Type:    ErrTypeFileOperation,
			Message: "failed to marshal empty todos",
			Err:     err,
		}
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return &TodoError{
			Type:    ErrTypeFileOperation,
			Message: "failed to create empty todos file",
			Err:     err,
		}
	}

	return nil
}

// Helper function to backup corrupted file
func backupCorruptedFile(filePath string) error {
	backupPath := filePath + ".backup"
	
	// Read corrupted file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read corrupted file: %w", err)
	}

	// Write backup
	if err := os.WriteFile(backupPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write backup file: %w", err)
	}

	utils.LogInfo("Corrupted todos file backed up to: %s", backupPath)
	return nil
}