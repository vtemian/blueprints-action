// Package commands implements CLI command handlers for todo list operations.
// It provides functions for adding, listing, completing, removing, and getting help for todos.
package commands

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"app"
	"utils"
)

// add creates a new todo item with optional priority flag.
// Usage: add [--priority high|medium|low] <todo description>
func Add(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("add command requires todo description")
	}

	var priority string
	var textParts []string

	// Parse arguments and extract priority flag
	for i, arg := range args {
		if arg == "--priority" {
			if i+1 >= len(args) {
				return fmt.Errorf("--priority flag requires a value (high|medium|low)")
			}
			priority = args[i+1]
			// Skip the next argument as it's the priority value
			i++
			continue
		}
		// Skip if this is a priority value that follows --priority
		if i > 0 && args[i-1] == "--priority" {
			continue
		}
		textParts = append(textParts, arg)
	}

	// Join remaining parts as todo text
	text := strings.TrimSpace(strings.Join(textParts, " "))
	if text == "" {
		return fmt.Errorf("todo description cannot be empty")
	}

	// Validate priority if provided
	if priority != "" {
		validPriorities := map[string]bool{"high": true, "medium": true, "low": true}
		if !validPriorities[strings.ToLower(priority)] {
			return fmt.Errorf("invalid priority '%s'. Valid options: high, medium, low", priority)
		}
		priority = strings.ToLower(priority)
	}

	// Add todo using app package
	id, err := app.AddTodo(text, priority)
	if err != nil {
		return fmt.Errorf("failed to add todo: %w", err)
	}

	fmt.Printf("Added: #%d - %s", id, text)
	if priority != "" {
		fmt.Printf(" [Priority: %s]", priority)
	}
	fmt.Println()

	return nil
}

// List displays todos with optional filtering flags.
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
			return fmt.Errorf("unknown flag: %s. Valid flags: --all, --done", arg)
		}
	}

	// Load todos from app
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
		} else if !showAll {
			fmt.Println("No pending todos found.")
		}
		return nil
	}

	// Prepare data for table formatting
	var tableData [][]string
	tableData = append(tableData, []string{"ID", "Status", "Description", "Priority", "Completed"})

	for _, todo := range filteredTodos {
		status := "[ ]"
		completed := ""
		if todo.Done {
			status = "[✓]"
			if !todo.CompletedAt.IsZero() {
				completed = todo.CompletedAt.Format("2006-01-02 15:04")
			}
		}

		priority := todo.Priority
		if priority == "" {
			priority = "-"
		}

		tableData = append(tableData, []string{
			fmt.Sprintf("#%d", todo.ID),
			status,
			todo.Description,
			priority,
			completed,
		})
	}

	// Use utils package for table formatting
	formattedTable, err := utils.FormatTable(tableData)
	if err != nil {
		return fmt.Errorf("failed to format todo list: %w", err)
	}

	fmt.Print(formattedTable)
	return nil
}

// Done marks one or more todos as completed.
// Usage: done <id1> [id2] [id3] ...
func Done(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("done command requires at least one todo ID")
	}

	// Parse and validate all IDs first
	var ids []int
	for _, arg := range args {
		id, err := strconv.Atoi(arg)
		if err != nil {
			return fmt.Errorf("invalid todo ID '%s': must be a number", arg)
		}
		if id <= 0 {
			return fmt.Errorf("invalid todo ID %d: must be positive", id)
		}
		ids = append(ids, id)
	}

	// Load todos to validate IDs exist
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	// Create a map for quick ID lookup
	todoMap := make(map[int]*app.Todo)
	for i := range todos {
		todoMap[todos[i].ID] = &todos[i]
	}

	// Validate all IDs exist before processing any
	for _, id := range ids {
		if _, exists := todoMap[id]; !exists {
			return fmt.Errorf("todo with ID %d not found", id)
		}
		if todoMap[id].Done {
			return fmt.Errorf("todo #%d is already completed", id)
		}
	}

	// Mark todos as done
	completedAt := time.Now()
	var completedTodos []app.Todo

	for _, id := range ids {
		todo := todoMap[id]
		todo.Done = true
		todo.CompletedAt = completedAt

		err := app.UpdateTodo(*todo)
		if err != nil {
			return fmt.Errorf("failed to update todo #%d: %w", id, err)
		}

		completedTodos = append(completedTodos, *todo)
	}

	// Print success messages
	for _, todo := range completedTodos {
		fmt.Printf("Completed: #%d - %s\n", todo.ID, todo.Description)
	}

	return nil
}

// Remove deletes a specific todo by ID or all completed todos.
// Usage: remove <id> OR remove --done
func Remove(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("remove command requires todo ID or --done flag")
	}

	if len(args) == 1 && args[0] == "--done" {
		return removeCompletedTodos()
	}

	if len(args) > 1 {
		return fmt.Errorf("remove command accepts only one ID or --done flag")
	}

	// Parse single todo ID
	id, err := strconv.Atoi(args[0])
	if err != nil {
		return fmt.Errorf("invalid todo ID '%s': must be a number", args[0])
	}

	if id <= 0 {
		return fmt.Errorf("invalid todo ID %d: must be positive", id)
	}

	// Get todo details before deletion for confirmation message
	todo, err := app.GetTodo(id)
	if err != nil {
		return fmt.Errorf("todo with ID %d not found", id)
	}

	// Delete the todo
	err = app.DeleteTodo(id)
	if err != nil {
		return fmt.Errorf("failed to remove todo #%d: %w", id, err)
	}

	fmt.Printf("Removed: #%d - %s\n", todo.ID, todo.Description)
	return nil
}

// removeCompletedTodos is a helper function to remove all completed todos.
func removeCompletedTodos() error {
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	var completedTodos []app.Todo
	for _, todo := range todos {
		if todo.Done {
			completedTodos = append(completedTodos, todo)
		}
	}

	if len(completedTodos) == 0 {
		fmt.Println("No completed todos to remove.")
		return nil
	}

	// Remove completed todos
	var removedCount int
	for _, todo := range completedTodos {
		err := app.DeleteTodo(todo.ID)
		if err != nil {
			fmt.Printf("Warning: failed to remove todo #%d: %v\n", todo.ID, err)
			continue
		}
		fmt.Printf("Removed: #%d - %s\n", todo.ID, todo.Description)
		removedCount++
	}

	fmt.Printf("Removed %d completed todo(s).\n", removedCount)
	return nil
}

// Help displays usage information and examples for all commands.
func Help(args []string) error {
	helpText := `Todo CLI - Command Reference

USAGE:
  todo <command> [arguments]

COMMANDS:
  add [--priority <level>] <description>
    Add a new todo item with optional priority
    Priority levels: high, medium, low
    
    Examples:
      todo add "Buy groceries"
      todo add --priority high "Finish project report"
      todo add --priority medium "Call dentist for appointment"

  list [--all] [--done]
    Display todo items with optional filters
    
    Examples:
      todo list                 # Show pending todos only
      todo list --all          # Show all todos
      todo list --done         # Show completed todos only

  done <id> [id2] [id3] ...
    Mark one or more todos as completed
    
    Examples:
      todo done 1              # Complete todo #1
      todo done 1 3 5          # Complete todos #1, #3, and #5

  remove <id>
  remove --done
    Remove a specific todo by ID or all completed todos
    
    Examples:
      todo remove 2            # Remove todo #2
      todo remove --done       # Remove all completed todos

  help
    Show this help information

EXAMPLES:
  # Basic workflow
  todo add "Learn Go programming"
  todo add --priority high "Submit assignment"
  todo list
  todo done 1
  todo list --all
  todo remove --done

For more information, visit: https://github.com/your-repo/todo-cli
`

	fmt.Print(helpText)
	return nil
}

// parseFlags is a helper function to extract flags from arguments.
func parseFlags(args []string, validFlags map[string]bool) (map[string]string, []string, error) {
	flags := make(map[string]string)
	var remainingArgs []string

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "--") {
			flagName := arg[2:]
			if !validFlags[flagName] {
				return nil, nil, fmt.Errorf("unknown flag: %s", arg)
			}

			// Check if flag expects a value
			if flagName == "priority" {
				if i+1 >= len(args) {
					return nil, nil, fmt.Errorf("flag %s requires a value", arg)
				}
				flags[flagName] = args[i+1]
				i++ // Skip next argument as it's the flag value
			} else {
				flags[flagName] = "true"
			}
		} else {
			remainingArgs = append(remainingArgs, arg)
		}
	}

	return flags, remainingArgs, nil
}