// Package commands provides CLI command handlers for a todo application.
package commands

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"../app"
	"../utils"
)

// Commands holds references to app and utils dependencies for executing CLI commands.
type Commands struct {
	app   *app.App
	utils *utils.Utils
}

// New creates a new Commands instance with the provided dependencies.
func New(appInstance *app.App, utilsInstance *utils.Utils) *Commands {
	return &Commands{
		app:   appInstance,
		utils: utilsInstance,
	}
}

// Add creates a new todo item with optional priority flag.
// Usage: add [--priority high|medium|low] <task description>
func (c *Commands) Add(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("no task description provided")
	}

	priority := "medium" // default priority
	var taskParts []string

	// Parse arguments for priority flag and task text
	for i := 0; i < len(args); i++ {
		if args[i] == "--priority" {
			if i+1 >= len(args) {
				return fmt.Errorf("--priority flag requires a value (high, medium, low)")
			}
			priorityValue := strings.ToLower(args[i+1])
			if !isValidPriority(priorityValue) {
				return fmt.Errorf("invalid priority '%s'. Valid options: high, medium, low", priorityValue)
			}
			priority = priorityValue
			i++ // skip the priority value
		} else {
			taskParts = append(taskParts, args[i])
		}
	}

	if len(taskParts) == 0 {
		return fmt.Errorf("no task description provided")
	}

	taskText := strings.Join(taskParts, " ")
	if strings.TrimSpace(taskText) == "" {
		return fmt.Errorf("task description cannot be empty")
	}

	todo, err := c.app.AddTodo(taskText, priority)
	if err != nil {
		return fmt.Errorf("failed to add todo: %w", err)
	}

	fmt.Printf("Added: #%d - %s\n", todo.ID, todo.Description)
	return nil
}

// List displays todos with optional filtering flags.
// Usage: list [--all] [--done]
func (c *Commands) List(args []string) error {
	showAll := false
	showDone := false

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

	todos, err := c.app.LoadTodos()
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
	headers := []string{"ID", "Status", "Priority", "Description", "Created"}
	var rows [][]string

	for _, todo := range filteredTodos {
		status := "[ ]"
		if todo.Done {
			status = "[✓]"
		}

		createdTime := todo.CreatedAt.Format("2006-01-02 15:04")
		
		rows = append(rows, []string{
			fmt.Sprintf("%d", todo.ID),
			status,
			strings.Title(todo.Priority),
			todo.Description,
			createdTime,
		})
	}

	table := c.utils.FormatTable(headers, rows)
	fmt.Print(table)
	return nil
}

// Done marks one or more todos as completed.
// Usage: done <id1> [id2] [id3] ...
func (c *Commands) Done(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("no todo ID provided")
	}

	todos, err := c.app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	var completedTodos []app.Todo
	var errors []string

	for _, arg := range args {
		id, err := strconv.Atoi(arg)
		if err != nil {
			errors = append(errors, fmt.Sprintf("invalid ID '%s': must be a number", arg))
			continue
		}

		todo, found := findTodoByID(todos, id)
		if !found {
			errors = append(errors, fmt.Sprintf("todo with ID %d not found", id))
			continue
		}

		if todo.Done {
			errors = append(errors, fmt.Sprintf("todo #%d is already completed", id))
			continue
		}

		// Mark as done
		todo.Done = true
		todo.CompletedAt = time.Now()
		completedTodos = append(completedTodos, *todo)

		// Update in the original slice
		for i := range todos {
			if todos[i].ID == id {
				todos[i] = *todo
				break
			}
		}
	}

	// Report errors
	if len(errors) > 0 {
		for _, errMsg := range errors {
			fmt.Printf("Error: %s\n", errMsg)
		}
		if len(completedTodos) == 0 {
			return fmt.Errorf("no todos were completed")
		}
	}

	// Save changes if any todos were completed
	if len(completedTodos) > 0 {
		if err := c.app.SaveTodos(todos); err != nil {
			return fmt.Errorf("failed to save todos: %w", err)
		}

		// Display completed todos
		for _, todo := range completedTodos {
			fmt.Printf("Completed: #%d - %s\n", todo.ID, todo.Description)
		}
	}

	return nil
}

// Remove deletes one or more todos.
// Usage: remove <id> OR remove --done
func (c *Commands) Remove(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("no todo ID or flag provided")
	}

	// Handle --done flag to remove all completed todos
	if len(args) == 1 && args[0] == "--done" {
		return c.removeCompletedTodos()
	}

	// Handle single ID removal
	if len(args) != 1 {
		return fmt.Errorf("provide either a single todo ID or --done flag")
	}

	id, err := strconv.Atoi(args[0])
	if err != nil {
		return fmt.Errorf("invalid ID '%s': must be a number", args[0])
	}

	todos, err := c.app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	todo, found := findTodoByID(todos, id)
	if !found {
		return fmt.Errorf("todo with ID %d not found", id)
	}

	if err := c.app.DeleteTodo(id); err != nil {
		return fmt.Errorf("failed to delete todo: %w", err)
	}

	fmt.Printf("Removed: #%d - %s\n", todo.ID, todo.Description)
	return nil
}

// Help displays comprehensive usage information for all commands.
func (c *Commands) Help(args []string) error {
	helpText := `Todo CLI - Command Reference

USAGE:
    todo <command> [arguments] [flags]

COMMANDS:
    add [--priority <level>] <description>
        Add a new todo item with optional priority
        Priority levels: high, medium (default), low
        
        Examples:
            todo add "Buy groceries"
            todo add --priority high "Complete project proposal"
            todo add --priority low "Organize desk"

    list [--all] [--done]
        Display todos in a formatted table
        
        Flags:
            --all   Show all todos (completed and pending)
            --done  Show only completed todos
            (no flags) Show only pending todos
        
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
        Remove a specific todo by ID or all completed todos
        
        Examples:
            todo remove 1
            todo remove --done

    help
        Display this help information

EXAMPLES:
    # Add a high priority task
    todo add --priority high "Finish quarterly report"
    
    # List all pending tasks
    todo list
    
    # Mark tasks 1 and 3 as done
    todo done 1 3
    
    # View all completed tasks
    todo list --done
    
    # Remove completed tasks
    todo remove --done

For more information, visit: https://github.com/your-repo/todo-cli
`

	fmt.Print(helpText)
	return nil
}

// Helper functions

// isValidPriority checks if the provided priority is valid.
func isValidPriority(priority string) bool {
	validPriorities := map[string]bool{
		"high":   true,
		"medium": true,
		"low":    true,
	}
	return validPriorities[priority]
}

// findTodoByID searches for a todo with the specified ID.
func findTodoByID(todos []app.Todo, id int) (*app.Todo, bool) {
	for i := range todos {
		if todos[i].ID == id {
			return &todos[i], true
		}
	}
	return nil, false
}

// removeCompletedTodos removes all completed todos.
func (c *Commands) removeCompletedTodos() error {
	todos, err := c.app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	var completedTodos []app.Todo
	var remainingTodos []app.Todo

	// Separate completed and remaining todos
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

	// Save only the remaining todos
	if err := c.app.SaveTodos(remainingTodos); err != nil {
		return fmt.Errorf("failed to save todos: %w", err)
	}

	// Display removed todos
	fmt.Printf("Removed %d completed todo(s):\n", len(completedTodos))
	for _, todo := range completedTodos {
		fmt.Printf("  #%d - %s\n", todo.ID, todo.Description)
	}

	return nil
}