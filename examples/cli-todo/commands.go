package commands

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"app"
	"utils"
)

// Add implements the add command to create new todos
func Add(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("task text is required")
	}

	var text string
	var priority string = "medium" // default priority
	var textParts []string

	// Parse arguments and extract priority flag
	for i, arg := range args {
		if arg == "--priority" {
			if i+1 >= len(args) {
				return fmt.Errorf("--priority flag requires a value (high, medium, low)")
			}
			priorityValue := strings.ToLower(args[i+1])
			if priorityValue != "high" && priorityValue != "medium" && priorityValue != "low" {
				return fmt.Errorf("invalid priority: %s (must be high, medium, or low)", priorityValue)
			}
			priority = priorityValue
			// Skip the next argument as it's the priority value
			i++
		} else if i > 0 && args[i-1] == "--priority" {
			// Skip priority value, already processed
			continue
		} else {
			textParts = append(textParts, arg)
		}
	}

	// Join remaining arguments as task text
	text = strings.Join(textParts, " ")
	text = strings.TrimSpace(text)

	if text == "" {
		return fmt.Errorf("task text cannot be empty")
	}

	// Add the todo using the app package
	todo, err := app.AddTodo(text, priority)
	if err != nil {
		return fmt.Errorf("failed to add todo: %w", err)
	}

	fmt.Printf("Added: #%d - %s\n", todo.ID, todo.Text)
	return nil
}

// List implements the list command to display todos
func List(args []string) error {
	// Parse flags
	var showAll, showDone bool
	for _, arg := range args {
		switch arg {
		case "--all":
			showAll = true
		case "--done":
			showDone = true
		}
	}

	// Load todos from storage
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	if len(todos) == 0 {
		fmt.Println("No todos found. Use 'todo add <task>' to create your first todo!")
		return nil
	}

	// Filter todos based on flags
	var filteredTodos []app.Todo
	for _, todo := range todos {
		if showAll {
			filteredTodos = append(filteredTodos, todo)
		} else if showDone && todo.Done {
			filteredTodos = append(filteredTodos, todo)
		} else if !showDone && !showAll && !todo.Done {
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

	// Prepare table data
	headers := []string{"ID", "Status", "Priority", "Task", "Created", "Completed"}
	var rows [][]string

	for _, todo := range filteredTodos {
		status := "[ ]"
		if todo.Done {
			status = "[✓]"
		}

		completed := ""
		if todo.Done && !todo.CompletedAt.IsZero() {
			completed = todo.CompletedAt.Format("2006-01-02 15:04")
		}

		created := todo.CreatedAt.Format("2006-01-02 15:04")

		row := []string{
			fmt.Sprintf("#%d", todo.ID),
			status,
			strings.Title(todo.Priority),
			todo.Text,
			created,
			completed,
		}
		rows = append(rows, row)
	}

	// Display formatted table
	err = utils.FormatTable(headers, rows)
	if err != nil {
		return fmt.Errorf("failed to format table: %w", err)
	}

	return nil
}

// Done implements the done command to mark todos as completed
func Done(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("todo ID(s) required")
	}

	// Load current todos
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	var completedTodos []app.Todo
	var errors []string

	// Process each ID argument
	for _, arg := range args {
		// Parse todo ID
		id, err := strconv.Atoi(arg)
		if err != nil {
			errors = append(errors, fmt.Sprintf("invalid ID '%s': must be a number", arg))
			continue
		}

		// Find and update the todo
		found := false
		for i := range todos {
			if todos[i].ID == id {
				if todos[i].Done {
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

	// Report any errors
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
		err = app.SaveTodos(todos)
		if err != nil {
			return fmt.Errorf("failed to save todos: %w", err)
		}

		// Display success messages
		for _, todo := range completedTodos {
			fmt.Printf("Completed: #%d - %s\n", todo.ID, todo.Text)
		}
	}

	return nil
}

// Remove implements the remove command to delete todos
func Remove(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("todo ID required or use --done flag to remove all completed todos")
	}

	// Check for --done flag
	var removeDone bool
	var idArgs []string

	for _, arg := range args {
		if arg == "--done" {
			removeDone = true
		} else {
			idArgs = append(idArgs, arg)
		}
	}

	if removeDone {
		return removeCompletedTodos()
	}

	if len(idArgs) == 0 {
		return fmt.Errorf("todo ID required")
	}

	if len(idArgs) > 1 {
		return fmt.Errorf("only one todo ID allowed for removal")
	}

	// Parse todo ID
	id, err := strconv.Atoi(idArgs[0])
	if err != nil {
		return fmt.Errorf("invalid ID '%s': must be a number", idArgs[0])
	}

	// Remove the todo
	todo, err := app.DeleteTodo(id)
	if err != nil {
		return fmt.Errorf("failed to remove todo: %w", err)
	}

	fmt.Printf("Removed: #%d - %s\n", todo.ID, todo.Text)
	return nil
}

// removeCompletedTodos handles bulk removal of completed todos
func removeCompletedTodos() error {
	// Load todos to check if any are completed
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	// Count completed todos
	var completedCount int
	for _, todo := range todos {
		if todo.Done {
			completedCount++
		}
	}

	if completedCount == 0 {
		fmt.Println("No completed todos to remove.")
		return nil
	}

	// Confirm bulk deletion
	fmt.Printf("This will remove %d completed todo(s). Continue? (y/N): ", completedCount)
	var response string
	fmt.Scanln(&response)
	
	response = strings.ToLower(strings.TrimSpace(response))
	if response != "y" && response != "yes" {
		fmt.Println("Operation cancelled.")
		return nil
	}

	// Perform bulk deletion
	count, err := app.DeleteCompletedTodos()
	if err != nil {
		return fmt.Errorf("failed to remove completed todos: %w", err)
	}

	fmt.Printf("Removed %d completed todo(s).\n", count)
	return nil
}

// Help implements the help command to display usage information
func Help(args []string) error {
	fmt.Println("Todo CLI - Task Management Tool")
	fmt.Println("================================")
	fmt.Println()
	fmt.Println("USAGE:")
	fmt.Println("  todo <command> [arguments] [flags]")
	fmt.Println()
	fmt.Println("COMMANDS:")
	fmt.Println()
	
	fmt.Println("  add <text> [--priority <level>]")
	fmt.Println("    Add a new todo item")
	fmt.Println("    Priority levels: high, medium (default), low")
	fmt.Println("    Example: todo add \"Buy groceries\" --priority high")
	fmt.Println()
	
	fmt.Println("  list [--all|--done]")
	fmt.Println("    List todo items")
	fmt.Println("    --all    Show all todos (pending and completed)")
	fmt.Println("    --done   Show only completed todos")
	fmt.Println("    Default: Show only pending todos")
	fmt.Println("    Example: todo list --all")
	fmt.Println()
	
	fmt.Println("  done <id> [id2] [id3] ...")
	fmt.Println("    Mark one or more todos as completed")
	fmt.Println("    Example: todo done 1 3 5")
	fmt.Println()
	
	fmt.Println("  remove <id>")
	fmt.Println("  remove --done")
	fmt.Println("    Remove a specific todo by ID, or all completed todos")
	fmt.Println("    --done   Remove all completed todos (with confirmation)")
	fmt.Println("    Example: todo remove 1")
	fmt.Println("    Example: todo remove --done")
	fmt.Println()
	
	fmt.Println("  help")
	fmt.Println("    Show this help message")
	fmt.Println()
	
	fmt.Println("EXAMPLES:")
	fmt.Println("  todo add \"Complete project documentation\"")
	fmt.Println("  todo add \"Call dentist\" --priority high")
	fmt.Println("  todo list")
	fmt.Println("  todo done 1")
	fmt.Println("  todo list --done")
	fmt.Println("  todo remove 2")
	fmt.Println("  todo remove --done")
	fmt.Println()
	
	fmt.Println("NOTES:")
	fmt.Println("  - Todo IDs are automatically assigned starting from 1")
	fmt.Println("  - Use quotes around task text containing spaces")
	fmt.Println("  - Completed todos show completion timestamp")
	fmt.Println("  - Priority affects display order (high → medium → low)")

	return nil
}