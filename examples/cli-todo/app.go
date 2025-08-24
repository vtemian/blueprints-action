// Package app provides todo storage functionality with JSON file persistence.
// It stores todos in ~/.todos.json and handles file operations with proper
// error handling and data validation.
package app

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"sync"
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

// validPriorities defines the allowed priority values.
var validPriorities = map[string]bool{
	"low":    true,
	"medium": true,
	"high":   true,
}

// mutex protects concurrent access to the todos file.
var fileMutex sync.RWMutex

// getTodosFilePath returns the full path to the todos JSON file.
func getTodosFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, ".todos.json"), nil
}

// getBackupFilePath returns the full path to the backup todos file.
func getBackupFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, ".todos.json.backup"), nil
}

// validatePriority checks if the given priority is valid.
func validatePriority(priority string) error {
	if !validPriorities[priority] {
		return fmt.Errorf("invalid priority '%s': must be one of 'low', 'medium', or 'high'", priority)
	}
	return nil
}

// validateTodoText checks if the todo text is valid.
func validateTodoText(text string) error {
	if text == "" {
		return fmt.Errorf("todo text cannot be empty")
	}
	return nil
}

// validateTodoID checks if the todo ID is valid.
func validateTodoID(id int) error {
	if id <= 0 {
		return fmt.Errorf("todo ID must be positive, got %d", id)
	}
	return nil
}

// backupCorruptedFile creates a backup of the corrupted todos file.
func backupCorruptedFile(filePath string) error {
	backupPath, err := getBackupFilePath()
	if err != nil {
		return fmt.Errorf("failed to get backup file path: %w", err)
	}

	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read corrupted file for backup: %w", err)
	}

	err = ioutil.WriteFile(backupPath, data, 0644)
	if err != nil {
		return fmt.Errorf("failed to create backup file: %w", err)
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

// LoadTodos reads todos from the JSON file and returns them as a slice.
// If the file doesn't exist, it returns an empty slice.
// If the file is corrupted, it backs up the file and returns an empty slice.
func LoadTodos() ([]Todo, error) {
	fileMutex.RLock()
	defer fileMutex.RUnlock()

	filePath, err := getTodosFilePath()
	if err != nil {
		return nil, fmt.Errorf("failed to get todos file path: %w", err)
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// File doesn't exist, return empty slice
		return []Todo{}, nil
	}

	// Read file contents
	data, err := ioutil.ReadFile(filePath)
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
	err = json.Unmarshal(data, &todos)
	if err != nil {
		// JSON is corrupted, backup and return empty slice
		if backupErr := backupCorruptedFile(filePath); backupErr != nil {
			return nil, fmt.Errorf("failed to backup corrupted file: %w (original error: %v)", backupErr, err)
		}
		
		// Remove corrupted file
		if removeErr := os.Remove(filePath); removeErr != nil {
			return nil, fmt.Errorf("failed to remove corrupted file after backup: %w (original error: %v)", removeErr, err)
		}

		return []Todo{}, nil
	}

	return todos, nil
}

// SaveTodos writes the todos slice to the JSON file.
func SaveTodos(todos []Todo) error {
	fileMutex.Lock()
	defer fileMutex.Unlock()

	filePath, err := getTodosFilePath()
	if err != nil {
		return fmt.Errorf("failed to get todos file path: %w", err)
	}

	// Marshal todos to JSON with indentation for readability
	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal todos to JSON: %w", err)
	}

	// Write to file
	err = ioutil.WriteFile(filePath, data, 0644)
	if err != nil {
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied writing todos file: %w", err)
		}
		return fmt.Errorf("failed to write todos file: %w", err)
	}

	return nil
}

// AddTodo creates a new todo with the given text and priority.
// If no priority is provided, it defaults to "medium".
// Returns the created todo and any error that occurred.
func AddTodo(text string, priority ...string) (Todo, error) {
	// Validate text
	if err := validateTodoText(text); err != nil {
		return Todo{}, err
	}

	// Set default priority or validate provided priority
	todoPriority := "medium"
	if len(priority) > 0 {
		todoPriority = priority[0]
		if err := validatePriority(todoPriority); err != nil {
			return Todo{}, err
		}
	}

	// Load existing todos to get next ID
	todos, err := LoadTodos()
	if err != nil {
		return Todo{}, fmt.Errorf("failed to load existing todos: %w", err)
	}

	// Create new todo
	newTodo := Todo{
		ID:       getNextID(todos),
		Text:     text,
		Done:     false,
		Created:  time.Now(),
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
	if err := validateTodoID(id); err != nil {
		return nil, err
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
// The changes are applied directly to the todos slice.
func UpdateTodo(todos []Todo, id int, changes map[string]interface{}) error {
	if err := validateTodoID(id); err != nil {
		return err
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
			text, ok := value.(string)
			if !ok {
				return fmt.Errorf("text field must be a string")
			}
			if err := validateTodoText(text); err != nil {
				return fmt.Errorf("invalid text: %w", err)
			}
			todos[todoIndex].Text = text

		case "done":
			done, ok := value.(bool)
			if !ok {
				return fmt.Errorf("done field must be a boolean")
			}
			todos[todoIndex].Done = done

		case "priority":
			priority, ok := value.(string)
			if !ok {
				return fmt.Errorf("priority field must be a string")
			}
			if err := validatePriority(priority); err != nil {
				return fmt.Errorf("invalid priority: %w", err)
			}
			todos[todoIndex].Priority = priority

		default:
			return fmt.Errorf("unsupported field '%s': supported fields are 'text', 'done', 'priority'", field)
		}
	}

	return nil
}

// DeleteTodo removes a todo by its ID and returns the updated todos slice.
func DeleteTodo(todos []Todo, id int) ([]Todo, error) {
	if err := validateTodoID(id); err != nil {
		return nil, err
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

	return updatedTodos, nil
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