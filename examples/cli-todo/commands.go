package commands

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/your-project/app"
	"github.com/your-project/datetime"
	"github.com/your-project/utils"
)

const (
	helpText = `Todo CLI - Task Management Tool

USAGE:
    todo <command> [arguments] [flags]

COMMANDS:
    add <text>              Add a new todo item
    list                    List all pending todos
    done <id> [id...]       Mark todo(s) as completed
    remove <id>             Remove a todo item
    help                    Show this help message

FLAGS:
    add:
        --priority <level>  Set priority (high, medium, low)
    
    list:
        --all              Show all todos (pending and completed)
        --done             Show only completed todos
    
    remove:
        --done             Remove all completed todos

EXAMPLES:
    todo add "Buy groceries" --priority high
    todo list --all
    todo done 1 2 3
    todo remove 5
    todo remove --done`
)

// Add creates a new todo item with optional priority
func Add(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("todo text is required")
	}

	var todoText string
	var priority string
	var textParts []string

	// Parse arguments and flags
	for i, arg := range args {
		if arg == "--priority" || arg == "-p" {
			if i+1 >= len(args) {
				return fmt.Errorf("priority flag requires a value")
			}
			priority = args[i+1]
			// Skip the next argument as it's the priority value
			i++
			continue
		}
		if strings.HasPrefix(arg, "--priority=") {
			priority = strings.TrimPrefix(arg, "--priority=")
			continue
		}
		if !strings.HasPrefix(arg, "-") {
			textParts = append(textParts, arg)
		}
	}

	if len(textParts) == 0 {
		return fmt.Errorf("todo text is required")
	}

	todoText = strings.Join(textParts, " ")

	// Validate priority if provided
	if priority != "" {
		validPriorities := map[string]bool{"high": true, "medium": true, "low": true}
		if !validPriorities[strings.ToLower(priority)] {
			return fmt.Errorf("invalid priority: %s (valid options: high, medium, low)", priority)
		}
	}

	// Create the todo
	todo, err := app.AddTodo(todoText, priority)
	if err != nil {
		return fmt.Errorf("failed to add todo: %w", err)
	}

	fmt.Printf("Added: #%d - %s\n", todo.ID, todo.Text)
	return nil
}

// List displays todos based on the provided filters
func List(args []string) error {
	showAll := false
	showDone := false

	// Parse flags
	for _, arg := range args {
		switch arg {
		case "--all", "-a":
			showAll = true
		case "--done", "-d":
			showDone = true
		}
	}

	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	if len(todos) == 0 {
		fmt.Println("No todos found.")
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
	headers := []string{"ID", "Status", "Task", "Priority", "Created"}
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

		createdAt := datetime.FormatTime(todo.CreatedAt)

		rows = append(rows, []string{
			fmt.Sprintf("#%d", todo.ID),
			status,
			todo.Text,
			priority,
			createdAt,
		})
	}

	// Display formatted table
	table := utils.FormatTable(headers, rows)
	fmt.Print(table)

	return nil
}

// Done marks one or more todos as completed
func Done(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("todo ID(s) required")
	}

	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	var completedTodos []app.Todo
	var errors []string

	for _, arg := range args {
		if strings.HasPrefix(arg, "-") {
			continue // Skip flags
		}

		id, err := strconv.Atoi(arg)
		if err != nil {
			errors = append(errors, fmt.Sprintf("invalid todo ID: %s", arg))
			continue
		}

		// Find and mark todo as done
		found := false
		for i, todo := range todos {
			if todo.ID == id {
				if todo.Done {
					errors = append(errors, fmt.Sprintf("todo #%d is already completed", id))
				} else {
					todos[i].Done = true
					todos[i].CompletedAt = time.Now()
					completedTodos = append(completedTodos, todos[i])
				}
				found = true
				break
			}
		}

		if !found {
			errors = append(errors, fmt.Sprintf("todo #%d not found", id))
		}
	}

	// Save changes if any todos were completed
	if len(completedTodos) > 0 {
		if err := app.SaveTodos(todos); err != nil {
			return fmt.Errorf("failed to save todos: %w", err)
		}

		// Display success messages
		for _, todo := range completedTodos {
			fmt.Printf("Completed: #%d - %s\n", todo.ID, todo.Text)
		}
	}

	// Display any errors
	if len(errors) > 0 {
		for _, errMsg := range errors {
			fmt.Printf("Error: %s\n", errMsg)
		}
		if len(completedTodos) == 0 {
			return fmt.Errorf("no todos were completed")
		}
	}

	return nil
}

// Remove deletes a todo item or all completed todos
func Remove(args []string) error {
	removeDone := false
	var todoIDs []int

	// Parse arguments and flags
	for _, arg := range args {
		if arg == "--done" || arg == "-d" {
			removeDone = true
			continue
		}

		if !strings.HasPrefix(arg, "-") {
			id, err := strconv.Atoi(arg)
			if err != nil {
				return fmt.Errorf("invalid todo ID: %s", arg)
			}
			todoIDs = append(todoIDs, id)
		}
	}

	if !removeDone && len(todoIDs) == 0 {
		return fmt.Errorf("todo ID required or use --done flag to remove all completed todos")
	}

	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	var removedTodos []app.Todo
	var remainingTodos []app.Todo

	if removeDone {
		// Remove all completed todos
		for _, todo := range todos {
			if todo.Done {
				removedTodos = append(removedTodos, todo)
			} else {
				remainingTodos = append(remainingTodos, todo)
			}
		}

		if len(removedTodos) == 0 {
			fmt.Println("No completed todos to remove.")
			return nil
		}
	} else {
		// Remove specific todo IDs
		for _, todo := range todos {
			shouldRemove := false
			for _, id := range todoIDs {
				if todo.ID == id {
					shouldRemove = true
					removedTodos = append(removedTodos, todo)
					break
				}
			}
			if !shouldRemove {
				remainingTodos = append(remainingTodos, todo)
			}
		}

		// Check if all requested IDs were found
		if len(removedTodos) != len(todoIDs) {
			var notFound []int
			for _, requestedID := range todoIDs {
				found := false
				for _, removed := range removedTodos {
					if removed.ID == requestedID {
						found = true
						break
					}
				}
				if !found {
					notFound = append(notFound, requestedID)
				}
			}

			if len(notFound) > 0 {
				for _, id := range notFound {
					fmt.Printf("Error: todo #%d not found\n", id)
				}
				if len(removedTodos) == 0 {
					return fmt.Errorf("no todos were removed")
				}
			}
		}
	}

	// Save remaining todos
	if err := app.SaveTodos(remainingTodos); err != nil {
		return fmt.Errorf("failed to save todos: %w", err)
	}

	// Display success messages
	if removeDone {
		fmt.Printf("Removed %d completed todo(s)\n", len(removedTodos))
	} else {
		for _, todo := range removedTodos {
			fmt.Printf("Removed: #%d - %s\n", todo.ID, todo.Text)
		}
	}

	return nil
}

// Help displays usage information and examples
func Help(args []string) error {
	fmt.Print(helpText)
	return nil
}

// parseFlags is a helper function to extract flags from arguments
func parseFlags(args []string, validFlags map[string]bool) (map[string]string, []string, error) {
	flags := make(map[string]string)
	var nonFlags []string

	for i, arg := range args {
		if strings.HasPrefix(arg, "--") {
			if strings.Contains(arg, "=") {
				parts := strings.SplitN(arg, "=", 2)
				flagName := strings.TrimPrefix(parts[0], "--")
				if validFlags[flagName] {
					flags[flagName] = parts[1]
				} else {
					return nil, nil, fmt.Errorf("unknown flag: --%s", flagName)
				}
			} else {
				flagName := strings.TrimPrefix(arg, "--")
				if validFlags[flagName] {
					if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
						flags[flagName] = args[i+1]
						i++ // Skip next argument
					} else {
						flags[flagName] = "true"
					}
				} else {
					return nil, nil, fmt.Errorf("unknown flag: --%s", flagName)
				}
			}
		} else if strings.HasPrefix(arg, "-") && len(arg) > 1 {
			flagName := strings.TrimPrefix(arg, "-")
			if validFlags[flagName] {
				if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
					flags[flagName] = args[i+1]
					i++ // Skip next argument
				} else {
					flags[flagName] = "true"
				}
			} else {
				return nil, nil, fmt.Errorf("unknown flag: -%s", flagName)
			}
		} else {
			nonFlags = append(nonFlags, arg)
		}
	}

	return flags, nonFlags, nil
}