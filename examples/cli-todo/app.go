package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

// Todo represents a single todo item
type Todo struct {
	ID       int       `json:"id"`
	Text     string    `json:"text"`
	Done     bool      `json:"done"`
	Created  time.Time `json:"created"`
	Priority string    `json:"priority"`
}

// TodoUpdate represents fields that can be updated in a todo
type TodoUpdate struct {
	Text     *string `json:"text,omitempty"`
	Done     *bool   `json:"done,omitempty"`
	Priority *string `json:"priority,omitempty"`
}

// Valid priority levels
var validPriorities = []string{"low", "medium", "high"}

// getTodosFilePath returns the path to the todos file in the user's home directory
func getTodosFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, ".todos.json"), nil
}

// getBackupFilePath returns the path to the backup todos file
func getBackupFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}
	return filepath.Join(homeDir, ".todos.json.backup"), nil
}

// isValidPriority checks if the given priority is valid
func isValidPriority(priority string) bool {
	return slices.Contains(validPriorities, strings.ToLower(priority))
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

// backupCorruptedFile creates a backup of the corrupted file
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

// LoadTodos reads todos from the file system
func LoadTodos() ([]Todo, error) {
	filePath, err := getTodosFilePath()
	if err != nil {
		return nil, fmt.Errorf("failed to get todos file path: %w", err)
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// File doesn't exist, return empty slice
		return []Todo{}, nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsPermission(err) {
			return nil, fmt.Errorf("permission denied reading todos file %s: check file permissions", filePath)
		}
		return nil, fmt.Errorf("failed to read todos file: %w", err)
	}

	// Handle empty file
	if len(data) == 0 {
		return []Todo{}, nil
	}

	var todos []Todo
	if err := json.Unmarshal(data, &todos); err != nil {
		// JSON is corrupted, backup the file and start fresh
		if backupErr := backupCorruptedFile(filePath); backupErr != nil {
			return nil, fmt.Errorf("failed to backup corrupted todos file: %w", backupErr)
		}

		// Remove the corrupted file
		if removeErr := os.Remove(filePath); removeErr != nil {
			return nil, fmt.Errorf("failed to remove corrupted todos file after backup: %w", removeErr)
		}

		return []Todo{}, fmt.Errorf("todos file was corrupted and has been backed up to .todos.json.backup, starting with empty todo list: %w", err)
	}

	return todos, nil
}

// SaveTodos writes todos to the file system using atomic operations
func SaveTodos(todos []Todo) error {
	filePath, err := getTodosFilePath()
	if err != nil {
		return fmt.Errorf("failed to get todos file path: %w", err)
	}

	data, err := json.MarshalIndent(todos, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal todos to JSON: %w", err)
	}

	// Use atomic write operation by writing to temp file first
	tempFile := filePath + ".tmp"
	
	if err := os.WriteFile(tempFile, data, 0644); err != nil {
		if os.IsPermission(err) {
			return fmt.Errorf("permission denied writing to todos file %s: check directory permissions", filePath)
		}
		return fmt.Errorf("failed to write temporary todos file: %w", err)
	}

	// Atomically replace the original file
	if err := os.Rename(tempFile, filePath); err != nil {
		// Clean up temp file on failure
		os.Remove(tempFile)
		return fmt.Errorf("failed to replace todos file: %w", err)
	}

	return nil
}

// AddTodo creates a new todo with the given text and priority
func AddTodo(text string, priority ...string) (*Todo, error) {
	if strings.TrimSpace(text) == "" {
		return nil, fmt.Errorf("todo text cannot be empty")
	}

	// Set default priority
	todoPriority := "medium"
	if len(priority) > 0 {
		todoPriority = strings.ToLower(strings.TrimSpace(priority[0]))
		if !isValidPriority(todoPriority) {
			return nil, fmt.Errorf("invalid priority '%s': must be one of %v", priority[0], validPriorities)
		}
	}

	// Load existing todos to get next ID
	todos, err := LoadTodos()
	if err != nil {
		return nil, fmt.Errorf("failed to load existing todos: %w", err)
	}

	todo := &Todo{
		ID:       getNextID(todos),
		Text:     strings.TrimSpace(text),
		Done:     false,
		Created:  time.Now(),
		Priority: todoPriority,
	}

	// Add to todos and save
	todos = append(todos, *todo)
	if err := SaveTodos(todos); err != nil {
		return nil, fmt.Errorf("failed to save new todo: %w", err)
	}

	return todo, nil
}

// GetTodo finds a todo by ID
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

// UpdateTodo updates a todo with the given changes
func UpdateTodo(todos []Todo, id int, changes TodoUpdate) (*Todo, error) {
	if id <= 0 {
		return nil, fmt.Errorf("invalid todo ID: %d", id)
	}

	// Validate priority if provided
	if changes.Priority != nil {
		priority := strings.ToLower(strings.TrimSpace(*changes.Priority))
		if !isValidPriority(priority) {
			return nil, fmt.Errorf("invalid priority '%s': must be one of %v", *changes.Priority, validPriorities)
		}
		*changes.Priority = priority
	}

	// Validate text if provided
	if changes.Text != nil {
		text := strings.TrimSpace(*changes.Text)
		if text == "" {
			return nil, fmt.Errorf("todo text cannot be empty")
		}
		*changes.Text = text
	}

	// Find and update the todo
	for i := range todos {
		if todos[i].ID == id {
			if changes.Text != nil {
				todos[i].Text = *changes.Text
			}
			if changes.Done != nil {
				todos[i].Done = *changes.Done
			}
			if changes.Priority != nil {
				todos[i].Priority = *changes.Priority
			}

			// Save updated todos
			if err := SaveTodos(todos); err != nil {
				return nil, fmt.Errorf("failed to save updated todo: %w", err)
			}

			return &todos[i], nil
		}
	}

	return nil, fmt.Errorf("todo with ID %d not found", id)
}

// DeleteTodo removes a todo by ID
func DeleteTodo(todos []Todo, id int) ([]Todo, error) {
	if id <= 0 {
		return nil, fmt.Errorf("invalid todo ID: %d", id)
	}

	for i, todo := range todos {
		if todo.ID == id {
			// Remove the todo from slice
			updatedTodos := make([]Todo, 0, len(todos)-1)
			updatedTodos = append(updatedTodos, todos[:i]...)
			updatedTodos = append(updatedTodos, todos[i+1:]...)

			// Save updated todos
			if err := SaveTodos(updatedTodos); err != nil {
				return nil, fmt.Errorf("failed to save todos after deletion: %w", err)
			}

			return updatedTodos, nil
		}
	}

	return nil, fmt.Errorf("todo with ID %d not found", id)
}

// FilterTodos filters todos based on done status and priority
func FilterTodos(todos []Todo, done *bool, priority *string) []Todo {
	var filtered []Todo

	for _, todo := range todos {
		// Filter by done status if specified
		if done != nil && todo.Done != *done {
			continue
		}

		// Filter by priority if specified
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