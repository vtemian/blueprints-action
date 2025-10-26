// Package commands provides CLI command implementations for the todo application
package commands

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"your-module/app"
	"your-module/utils"
)

// Add implements the add command to create new todos
// Usage: add [--priority high|medium|low] <task description>
func Add(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("task description is required")
	}

	var priority string = "medium" // default priority
	var taskText []string

	// Parse arguments for priority flag and task text
	for i, arg := range args {
		if arg == "--priority" {
			if i+1 >= len(args) {
				return fmt.Errorf("--priority flag requires a value (high|medium|low)")
			}
			priority = args[i+1]
			if !isValidPriority(priority) {
				return fmt.Errorf("invalid priority: %s (must be high, medium, or low)", priority)
			}
			// Skip the priority value in next iteration
			args = append(args[:i], args[i+2:]...)
			break
		}
	}

	taskText = args
	if len(taskText) == 0 {
		return fmt.Errorf("task description is required")
	}

	text := strings.Join(taskText, " ")
	if strings.TrimSpace(text) == "" {
		return fmt.Errorf("task description cannot be empty")
	}

	id, err := app.AddTodo(text, priority)
	if err != nil {
		return fmt.Errorf("failed to add todo: %w", err)
	}

	fmt.Printf("Added: #%d - %s\n", id, text)
	return nil
}

// List implements the list command to display todos
// Usage: list [--all] [--done]
func List(args []string) error {
	var showAll, showDone bool

	// Parse flags
	for _, arg := range args {
		switch arg {
		case "--all":
			showAll = true
		case "--done":
			showDone = true
		default:
			return fmt.Errorf("unknown flag: %s", arg)
		}
	}

	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	if len(todos) == 0 {
		fmt.Println("No todos found. Use 'add' command to create your first todo!")
		return nil
	}

	// Filter todos based on flags
	var filteredTodos []app.Todo
	for _, todo := range todos {
		if showAll {
			filteredTodos = append(filteredTodos, todo)
		} else if showDone && todo.Done {
			filteredTodos = append(filteredTodos, todo)
		} else if !showDone && !todo.Done {
			filteredTodos = append(filteredTodos, todo)
		}
	}

	if len(filteredTodos) == 0 {
		if showDone {
			fmt.Println("No completed todos found.")
		} else {
			fmt.Println("No pending todos found.")
		}
		return nil
	}

	// Prepare data for table formatting
	var tableData [][]string
	tableData = append(tableData, []string{"ID", "Status", "Priority", "Task", "Created", "Completed"})

	for _, todo := range filteredTodos {
		status := "[ ]"
		completed := ""
		if todo.Done {
			status = "[✓]"
			if !todo.CompletedAt.IsZero() {
				completed = todo.CompletedAt.Format("2006-01-02 15:04")
			}
		}

		created := todo.CreatedAt.Format("2006-01-02 15:04")
		
		tableData = append(tableData, []string{
			fmt.Sprintf("#%d", todo.ID),
			status,
			strings.Title(todo.Priority),
			todo.Text,
			created,
			completed,
		})
	}

	utils.FormatTable(tableData)
	return nil
}

// Done implements the done command to mark todos as completed
// Usage: done <id1> [id2] [id3] ...
func Done(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("at least one todo ID is required")
	}

	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	var completedTodos []app.Todo
	var errors []string

	// Process each ID
	for _, arg := range args {
		id, err := strconv.Atoi(arg)
		if err != nil {
			errors = append(errors, fmt.Sprintf("invalid ID '%s': must be a number", arg))
			continue
		}

		// Find and validate todo exists
		todoIndex := -1
		for i, todo := range todos {
			if todo.ID == id {
				todoIndex = i
				break
			}
		}

		if todoIndex == -1 {
			errors = append(errors, fmt.Sprintf("todo #%d not found", id))
			continue
		}

		if todos[todoIndex].Done {
			errors = append(errors, fmt.Sprintf("todo #%d is already completed", id))
			continue
		}

		// Mark as done
		todos[todoIndex].Done = true
		todos[todoIndex].CompletedAt = time.Now()
		completedTodos = append(completedTodos, todos[todoIndex])
	}

	// Save changes if any todos were modified
	if len(completedTodos) > 0 {
		err = app.SaveTodos(todos)
		if err != nil {
			return fmt.Errorf("failed to save changes: %w", err)
		}

		// Display success messages
		for _, todo := range completedTodos {
			fmt.Printf("Completed: #%d - %s\n", todo.ID, todo.Text)
		}
	}

	// Display any errors that occurred
	if len(errors) > 0 {
		for _, errMsg := range errors {
			fmt.Printf("Error: %s\n", errMsg)
		}
		if len(completedTodos) == 0 {
			return fmt.Errorf("no todos were completed due to errors")
		}
	}

	return nil
}

// Remove implements the remove command to delete todos
// Usage: remove <id> OR remove --done
func Remove(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("todo ID or --done flag is required")
	}

	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	// Handle --done flag to remove all completed todos
	if len(args) == 1 && args[0] == "--done" {
		var remainingTodos []app.Todo
		var removedCount int

		for _, todo := range todos {
			if todo.Done {
				fmt.Printf("Removed: #%d - %s\n", todo.ID, todo.Text)
				removedCount++
			} else {
				remainingTodos = append(remainingTodos, todo)
			}
		}

		if removedCount == 0 {
			fmt.Println("No completed todos to remove.")
			return nil
		}

		err = app.SaveTodos(remainingTodos)
		if err != nil {
			return fmt.Errorf("failed to save changes: %w", err)
		}

		fmt.Printf("Removed %d completed todo(s).\n", removedCount)
		return nil
	}

	// Handle single ID removal
	if len(args) != 1 {
		return fmt.Errorf("provide either a single todo ID or --done flag")
	}

	id, err := strconv.Atoi(args[0])
	if err != nil {
		return fmt.Errorf("invalid ID '%s': must be a number", args[0])
	}

	// Find and remove the todo
	todoIndex := -1
	var removedTodo app.Todo

	for i, todo := range todos {
		if todo.ID == id {
			todoIndex = i
			removedTodo = todo
			break
		}
	}

	if todoIndex == -1 {
		return fmt.Errorf("todo #%d not found", id)
	}

	err = app.DeleteTodo(id)
	if err != nil {
		return fmt.Errorf("failed to delete todo: %w", err)
	}

	fmt.Printf("Removed: #%d - %s\n", removedTodo.ID, removedTodo.Text)
	return nil
}

// Help implements the help command to display usage information
// Usage: help
func Help(args []string) error {
	helpText := `
TODO CLI - A simple command-line todo manager

USAGE:
    todo <command> [arguments]

COMMANDS:
    add [--priority <level>] <description>
        Add a new todo item
        Priority levels: high, medium (default), low
        
        Examples:
            todo add "Buy groceries"
            todo add --priority high "Finish project report"
            todo add --priority low "Clean garage"

    list [--all] [--done]
        List todo items
        --all    Show all todos (completed and pending)
        --done   Show only completed todos
        Default: Show only pending todos
        
        Examples:
            todo list
            todo list --all
            todo list --done

    done <id> [id2] [id3] ...
        Mark one or more todos as completed
        
        Examples:
            todo done 1
            todo done 1 3 5

    remove <id>
    remove --done
        Remove a specific todo by ID, or remove all completed todos
        
        Examples:
            todo remove 1
            todo remove --done

    help
        Show this help message

EXAMPLES:
    # Add a new todo
    todo add "Review pull requests"
    
    # Add a high priority todo
    todo add --priority high "Deploy to production"
    
    # List all pending todos
    todo list
    
    # List all todos
    todo list --all
    
    # Mark todos 1 and 3 as done
    todo done 1 3
    
    # Remove a specific todo
    todo remove 2
    
    # Remove all completed todos
    todo remove --done

For more information, visit: https://github.com/your-username/todo-cli
`

	fmt.Print(helpText)
	return nil
}

// Helper functions

// isValidPriority checks if the given priority is valid
func isValidPriority(priority string) bool {
	validPriorities := map[string]bool{
		"high":   true,
		"medium": true,
		"low":    true,
	}
	return validPriorities[strings.ToLower(priority)]
}

// validateTodoID checks if a todo ID exists in the given slice
func validateTodoID(todos []app.Todo, id int) bool {
	for _, todo := range todos {
		if todo.ID == id {
			return true
		}
	}
	return false
}

// parseIDs converts string arguments to integer IDs with validation
func parseIDs(args []string) ([]int, error) {
	if len(args) == 0 {
		return nil, fmt.Errorf("at least one ID is required")
	}

	var ids []int
	for _, arg := range args {
		id, err := strconv.Atoi(arg)
		if err != nil {
			return nil, fmt.Errorf("invalid ID '%s': must be a number", arg)
		}
		if id <= 0 {
			return nil, fmt.Errorf("invalid ID '%d': must be a positive number", id)
		}
		ids = append(ids, id)
	}

	return ids, nil
}

// filterTodosByStatus filters todos based on completion status
func filterTodosByStatus(todos []app.Todo, showAll, showDone bool) []app.Todo {
	if showAll {
		return todos
	}

	var filtered []app.Todo
	for _, todo := range todos {
		if showDone && todo.Done {
			filtered = append(filtered, todo)
		} else if !showDone && !todo.Done {
			filtered = append(filtered, todo)
		}
	}

	return filtered
}