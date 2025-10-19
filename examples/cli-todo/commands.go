// Package commands provides CLI command implementations for todo operations.
// This package handles user input parsing, validation, and coordinates with
// the app and utils packages to perform todo management operations.
package commands

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"your-project/app"
	"your-project/utils"
)

// Priority levels for todos
const (
	PriorityHigh   = "high"
	PriorityMedium = "medium"
	PriorityLow    = "low"
)

// parseFlags extracts flags from arguments and returns cleaned args and flag values
func parseFlags(args []string) (cleanArgs []string, flags map[string]string) {
	flags = make(map[string]string)
	cleanArgs = make([]string, 0, len(args))

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "--") {
			flagName := strings.TrimPrefix(arg, "--")
			
			// Handle flags with values (--priority high)
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "--") {
				switch flagName {
				case "priority":
					flags[flagName] = args[i+1]
					i++ // skip the value
					continue
				}
			}
			
			// Handle boolean flags (--all, --done)
			flags[flagName] = "true"
		} else {
			cleanArgs = append(cleanArgs, arg)
		}
	}
	
	return cleanArgs, flags
}

// validatePriority checks if the priority value is valid
func validatePriority(priority string) bool {
	switch strings.ToLower(priority) {
	case PriorityHigh, PriorityMedium, PriorityLow:
		return true
	default:
		return false
	}
}

// parseIDs converts string arguments to integer IDs with validation
func parseIDs(args []string) ([]int, error) {
	if len(args) == 0 {
		return nil, fmt.Errorf("no IDs provided")
	}

	ids := make([]int, 0, len(args))
	for _, arg := range args {
		id, err := strconv.Atoi(arg)
		if err != nil {
			return nil, fmt.Errorf("invalid ID '%s': must be a number", arg)
		}
		if id <= 0 {
			return nil, fmt.Errorf("invalid ID '%d': must be greater than 0", id)
		}
		ids = append(ids, id)
	}
	
	return ids, nil
}

// Add creates a new todo item with optional priority setting.
// Usage: add [--priority high|medium|low] <todo description>
func Add(args []string) error {
	cleanArgs, flags := parseFlags(args)
	
	// Validate todo description
	if len(cleanArgs) == 0 {
		return fmt.Errorf("todo description cannot be empty")
	}
	
	description := strings.Join(cleanArgs, " ")
	if strings.TrimSpace(description) == "" {
		return fmt.Errorf("todo description cannot be empty")
	}
	
	// Validate priority if provided
	priority := PriorityMedium // default priority
	if p, exists := flags["priority"]; exists {
		if !validatePriority(p) {
			return fmt.Errorf("invalid priority '%s': must be high, medium, or low", p)
		}
		priority = strings.ToLower(p)
	}
	
	// Add the todo
	todo, err := app.AddTodo(description, priority)
	if err != nil {
		return fmt.Errorf("failed to add todo: %w", err)
	}
	
	fmt.Printf("Added: #%d - %s", todo.ID, todo.Description)
	if priority != PriorityMedium {
		fmt.Printf(" [%s priority]", priority)
	}
	fmt.Println()
	
	return nil
}

// List displays todos with optional filtering.
// Usage: list [--all] [--done]
func List(args []string) error {
	_, flags := parseFlags(args)
	
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
	showAll := flags["all"] == "true"
	showDone := flags["done"] == "true"
	
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
	headers := []string{"ID", "Status", "Priority", "Description", "Created", "Completed"}
	var rows [][]string
	
	for _, todo := range filteredTodos {
		status := "[ ]"
		completed := ""
		
		if todo.Done {
			status = "[✓]"
			if !todo.CompletedAt.IsZero() {
				completed = todo.CompletedAt.Format("2006-01-02 15:04")
			}
		}
		
		priority := strings.ToUpper(todo.Priority[:1]) + todo.Priority[1:] // Capitalize first letter
		created := todo.CreatedAt.Format("2006-01-02 15:04")
		
		row := []string{
			strconv.Itoa(todo.ID),
			status,
			priority,
			todo.Description,
			created,
			completed,
		}
		rows = append(rows, row)
	}
	
	// Display summary
	if showAll {
		completed := 0
		for _, todo := range filteredTodos {
			if todo.Done {
				completed++
			}
		}
		fmt.Printf("Showing all todos (%d total, %d completed, %d pending):\n\n", 
			len(filteredTodos), completed, len(filteredTodos)-completed)
	} else if showDone {
		fmt.Printf("Showing completed todos (%d total):\n\n", len(filteredTodos))
	} else {
		fmt.Printf("Showing pending todos (%d total):\n\n", len(filteredTodos))
	}
	
	// Use utils package for table formatting
	table := utils.FormatTable(headers, rows)
	fmt.Print(table)
	
	return nil
}

// Done marks one or more todos as completed.
// Usage: done <id1> [id2] [id3] ...
func Done(args []string) error {
	cleanArgs, _ := parseFlags(args)
	
	ids, err := parseIDs(cleanArgs)
	if err != nil {
		return fmt.Errorf("invalid arguments: %w", err)
	}
	
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}
	
	// Track successful completions
	var completed []app.Todo
	var errors []string
	
	for _, id := range ids {
		todo, err := app.MarkTodoComplete(id)
		if err != nil {
			errors = append(errors, fmt.Sprintf("ID %d: %v", id, err))
			continue
		}
		completed = append(completed, *todo)
	}
	
	// Display results
	for _, todo := range completed {
		fmt.Printf("Completed: #%d - %s\n", todo.ID, todo.Description)
	}
	
	if len(errors) > 0 {
		fmt.Fprintf(os.Stderr, "\nErrors:\n")
		for _, errMsg := range errors {
			fmt.Fprintf(os.Stderr, "  %s\n", errMsg)
		}
		
		if len(completed) == 0 {
			return fmt.Errorf("no todos were completed")
		}
	}
	
	return nil
}

// Remove deletes todos by ID or removes all completed todos.
// Usage: remove <id> OR remove --done
func Remove(args []string) error {
	cleanArgs, flags := parseFlags(args)
	
	removeDone := flags["done"] == "true"
	
	if removeDone {
		return removeCompletedTodos()
	}
	
	if len(cleanArgs) == 0 {
		return fmt.Errorf("no todo ID provided. Use 'remove <id>' or 'remove --done'")
	}
	
	if len(cleanArgs) > 1 {
		return fmt.Errorf("can only remove one todo at a time. Use 'remove --done' to remove all completed todos")
	}
	
	ids, err := parseIDs(cleanArgs)
	if err != nil {
		return fmt.Errorf("invalid arguments: %w", err)
	}
	
	todo, err := app.DeleteTodo(ids[0])
	if err != nil {
		return fmt.Errorf("failed to remove todo: %w", err)
	}
	
	fmt.Printf("Removed: #%d - %s\n", todo.ID, todo.Description)
	return nil
}

// removeCompletedTodos handles bulk removal of completed todos with confirmation
func removeCompletedTodos() error {
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}
	
	// Count completed todos
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
	
	// Show confirmation prompt
	fmt.Printf("This will remove %d completed todo(s). Are you sure? (y/N): ", len(completedTodos))
	
	var response string
	fmt.Scanln(&response)
	response = strings.ToLower(strings.TrimSpace(response))
	
	if response != "y" && response != "yes" {
		fmt.Println("Operation cancelled.")
		return nil
	}
	
	// Remove completed todos
	removed := 0
	var errors []string
	
	for _, todo := range completedTodos {
		_, err := app.DeleteTodo(todo.ID)
		if err != nil {
			errors = append(errors, fmt.Sprintf("ID %d: %v", todo.ID, err))
			continue
		}
		removed++
	}
	
	fmt.Printf("Removed %d completed todo(s).\n", removed)
	
	if len(errors) > 0 {
		fmt.Fprintf(os.Stderr, "\nErrors:\n")
		for _, errMsg := range errors {
			fmt.Fprintf(os.Stderr, "  %s\n", errMsg)
		}
	}
	
	return nil
}

// Help displays comprehensive usage information for all commands.
func Help(args []string) error {
	help := `Todo CLI - A simple command-line todo manager

USAGE:
    todo <command> [arguments] [flags]

COMMANDS:
    add <description>           Add a new todo item
        --priority <level>      Set priority (high, medium, low)
        
    list                        Show pending todos
        --all                   Show all todos (pending and completed)
        --done                  Show only completed todos
        
    done <id> [id2] [id3]...   Mark todo(s) as completed
    
    remove <id>                 Remove a specific todo
        --done                  Remove all completed todos (with confirmation)
        
    help                        Show this help message

EXAMPLES:
    todo add "Buy groceries"
    todo add --priority high "Finish project report"
    todo list
    todo list --all
    todo list --done
    todo done 1
    todo done 1 2 3
    todo remove 1
    todo remove --done

NOTES:
    - Todo IDs are automatically assigned starting from 1
    - Default priority is 'medium' if not specified
    - Completed todos show completion timestamp
    - Use 'list --all' to see both pending and completed todos
    - Bulk operations (done, remove --done) will show individual results

For more information, visit: https://github.com/your-username/todo-cli
`
	
	fmt.Print(help)
	return nil
}