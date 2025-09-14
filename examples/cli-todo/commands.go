// Package commands provides CLI command implementations for todo list operations.
// This package handles user input parsing, validation, and coordinates with the
// app package to perform todo list management operations.
package commands

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"your-project/app"
	"your-project/utils"
)

// Add creates a new todo item with optional priority flag.
// Usage: add [--priority high|medium|low] <task description>
func Add(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("task description is required")
	}

	var priority string
	var taskParts []string

	// Parse arguments and extract priority flag
	for i, arg := range args {
		if arg == "--priority" {
			if i+1 >= len(args) {
				return fmt.Errorf("--priority flag requires a value (high, medium, low)")
			}
			priority = args[i+1]
			if priority != "high" && priority != "medium" && priority != "low" {
				return fmt.Errorf("invalid priority: %s (must be high, medium, or low)", priority)
			}
			// Skip the next argument as it's the priority value
			i++
			continue
		}
		// Skip if this is a priority value that follows --priority
		if i > 0 && args[i-1] == "--priority" {
			continue
		}
		taskParts = append(taskParts, arg)
	}

	// Join remaining arguments as task description
	text := strings.TrimSpace(strings.Join(taskParts, " "))
	if text == "" {
		return fmt.Errorf("task description cannot be empty")
	}

	// Create the todo
	todo, err := app.AddTodo(text, priority)
	if err != nil {
		return fmt.Errorf("failed to add todo: %w", err)
	}

	fmt.Printf("Added: #%d - %s", todo.ID, todo.Text)
	if todo.Priority != "" {
		fmt.Printf(" [%s priority]", todo.Priority)
	}
	fmt.Println()

	return nil
}

// List displays todos with optional filtering flags.
// Usage: list [--all] [--done]
func List(args []string) error {
	// Parse flags
	var showAll, showDone bool
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

	// Load todos
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	if len(todos) == 0 {
		fmt.Println("No todos found. Use 'add' command to create your first todo.")
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
		} else if !showAll {
			fmt.Println("No pending todos found.")
		}
		return nil
	}

	// Prepare data for table formatting
	headers := []string{"ID", "Status", "Description", "Priority", "Created"}
	var rows [][]string

	for _, todo := range filteredTodos {
		status := "[ ]"
		if todo.Done {
			status = "[✓]"
		}

		priority := todo.Priority
		if priority == "" {
			priority = "-"
		}

		created := todo.CreatedAt.Format("2006-01-02 15:04")

		row := []string{
			fmt.Sprintf("#%d", todo.ID),
			status,
			todo.Text,
			priority,
			created,
		}
		rows = append(rows, row)
	}

	// Display formatted table
	fmt.Println(utils.FormatTable(headers, rows))
	fmt.Printf("\nShowing %d todo(s)", len(filteredTodos))
	if !showAll {
		if showDone {
			fmt.Print(" (completed only)")
		} else {
			fmt.Print(" (pending only)")
		}
	}
	fmt.Println()

	return nil
}

// Done marks one or more todos as completed.
// Usage: done <id1> [id2] [id3] ...
func Done(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("at least one todo ID is required")
	}

	// Load current todos
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

		// Find todo by ID
		var found bool
		for i, todo := range todos {
			if todo.ID == id {
				found = true
				if todo.Done {
					errors = append(errors, fmt.Sprintf("todo #%d is already completed", id))
				} else {
					// Mark as done
					todos[i].Done = true
					todos[i].CompletedAt = time.Now()
					completedTodos = append(completedTodos, todos[i])
				}
				break
			}
		}

		if !found {
			errors = append(errors, fmt.Sprintf("todo #%d not found", id))
		}
	}

	// Report errors if any
	if len(errors) > 0 {
		for _, errMsg := range errors {
			fmt.Printf("Error: %s\n", errMsg)
		}
		if len(completedTodos) == 0 {
			return fmt.Errorf("no todos were completed")
		}
	}

	// Save changes if we have completed todos
	if len(completedTodos) > 0 {
		if err := app.SaveTodos(todos); err != nil {
			return fmt.Errorf("failed to save changes: %w", err)
		}

		// Display success messages
		for _, todo := range completedTodos {
			fmt.Printf("Completed: #%d - %s\n", todo.ID, todo.Text)
		}
	}

	return nil
}

// Remove deletes todos by ID or removes all completed todos with --done flag.
// Usage: remove <id> OR remove --done
func Remove(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("todo ID or --done flag is required")
	}

	// Load current todos
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	// Handle bulk removal of completed todos
	if len(args) == 1 && args[0] == "--done" {
		var completedTodos []app.Todo
		var remainingTodos []app.Todo

		for _, todo := range todos {
			if todo.Done {
				completedTodos = append(completedTodos, todo)
			} else {
				remainingTodos = append(remainingTodos, todo)
			}
		}

		if len(completedTodos) == 0 {
			fmt.Println("No completed todos to remove.")
			return nil
		}

		// Confirm bulk removal
		fmt.Printf("This will remove %d completed todo(s). Continue? (y/N): ", len(completedTodos))
		var response string
		fmt.Scanln(&response)
		
		if strings.ToLower(response) != "y" && strings.ToLower(response) != "yes" {
			fmt.Println("Operation cancelled.")
			return nil
		}

		// Save remaining todos
		if err := app.SaveTodos(remainingTodos); err != nil {
			return fmt.Errorf("failed to save changes: %w", err)
		}

		fmt.Printf("Removed %d completed todo(s).\n", len(completedTodos))
		return nil
	}

	// Handle single todo removal
	if len(args) != 1 {
		return fmt.Errorf("provide either a single todo ID or --done flag")
	}

	id, err := strconv.Atoi(args[0])
	if err != nil {
		return fmt.Errorf("invalid ID '%s': must be a number", args[0])
	}

	// Find and remove the todo
	var removedTodo *app.Todo
	for i, todo := range todos {
		if todo.ID == id {
			removedTodo = &todo
			// Remove from slice
			todos = append(todos[:i], todos[i+1:]...)
			break
		}
	}

	if removedTodo == nil {
		return fmt.Errorf("todo #%d not found", id)
	}

	// Save changes
	if err := app.SaveTodos(todos); err != nil {
		return fmt.Errorf("failed to save changes: %w", err)
	}

	fmt.Printf("Removed: #%d - %s\n", removedTodo.ID, removedTodo.Text)
	return nil
}

// Help displays usage information and available commands.
// Usage: help
func Help(args []string) error {
	helpText := `Todo CLI - Task Management Tool

USAGE:
    todo <command> [arguments]

COMMANDS:
    add [--priority <level>] <description>
        Add a new todo item
        Priority levels: high, medium, low
        Example: todo add --priority high "Complete project proposal"
        Example: todo add "Buy groceries"

    list [--all] [--done]
        List todo items
        --all    Show all todos (completed and pending)
        --done   Show only completed todos
        Default: Show only pending todos
        Example: todo list
        Example: todo list --all

    done <id> [id2] [id3] ...
        Mark one or more todos as completed
        Example: todo done 1
        Example: todo done 1 3 5

    remove <id>
        Remove a specific todo by ID
        Example: todo remove 1

    remove --done
        Remove all completed todos (with confirmation)
        Example: todo remove --done

    help
        Show this help message

EXAMPLES:
    todo add "Review code changes"
    todo add --priority high "Fix critical bug"
    todo list
    todo done 1 2
    todo list --done
    todo remove 3
    todo remove --done

For more information, visit: https://github.com/your-username/todo-cli
`

	fmt.Print(helpText)
	return nil
}