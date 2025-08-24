package commands

import (
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"

	"app"
	"utils"
)

// Add creates a new todo item with optional priority
func Add(args []string) {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "Error: task text is required\n")
		os.Exit(1)
	}

	// Create flag set for this command
	fs := flag.NewFlagSet("add", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: todo add [--priority=high|medium|low] <task text>\n")
	}
	
	priority := fs.String("priority", "medium", "Task priority (high, medium, low)")
	
	// Parse flags
	if err := fs.Parse(args); err != nil {
		os.Exit(1)
	}

	// Get remaining arguments as task text
	remaining := fs.Args()
	if len(remaining) == 0 {
		fmt.Fprintf(os.Stderr, "Error: task text is required\n")
		os.Exit(1)
	}

	text := strings.Join(remaining, " ")
	if strings.TrimSpace(text) == "" {
		fmt.Fprintf(os.Stderr, "Error: task text cannot be empty\n")
		os.Exit(1)
	}

	// Validate priority
	validPriorities := map[string]bool{"high": true, "medium": true, "low": true}
	if !validPriorities[*priority] {
		fmt.Fprintf(os.Stderr, "Error: invalid priority '%s'. Use high, medium, or low\n", *priority)
		os.Exit(1)
	}

	// Add todo
	id, err := app.AddTodo(text, *priority)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error adding todo: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Added: #%d - %s\n", id, text)
}

// List displays todo items with optional filtering
func List(args []string) {
	// Create flag set for this command
	fs := flag.NewFlagSet("list", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: todo list [--all] [--done]\n")
	}

	showAll := fs.Bool("all", false, "Show all todos (completed and incomplete)")
	showDone := fs.Bool("done", false, "Show only completed todos")

	// Parse flags
	if err := fs.Parse(args); err != nil {
		os.Exit(1)
	}

	// Load todos
	todos, err := app.LoadTodos()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading todos: %v\n", err)
		os.Exit(1)
	}

	if len(todos) == 0 {
		fmt.Println("No todos found. Use 'todo add <task>' to create one.")
		return
	}

	// Filter todos based on flags
	var filteredTodos []app.Todo
	for _, todo := range todos {
		if *showAll {
			filteredTodos = append(filteredTodos, todo)
		} else if *showDone && todo.Done {
			filteredTodos = append(filteredTodos, todo)
		} else if !*showDone && !todo.Done {
			filteredTodos = append(filteredTodos, todo)
		}
	}

	if len(filteredTodos) == 0 {
		if *showDone {
			fmt.Println("No completed todos found.")
		} else if !*showAll {
			fmt.Println("No pending todos found.")
		}
		return
	}

	// Prepare data for table formatting
	var tableData [][]string
	tableData = append(tableData, []string{"ID", "Status", "Priority", "Task", "Created"})

	for _, todo := range filteredTodos {
		status := "[ ]"
		if todo.Done {
			status = "[✓]"
		}

		// Truncate long task descriptions
		task := todo.Text
		if len(task) > 50 {
			task = task[:47] + "..."
		}

		tableData = append(tableData, []string{
			fmt.Sprintf("#%d", todo.ID),
			status,
			todo.Priority,
			task,
			todo.CreatedAt.Format("2006-01-02"),
		})
	}

	// Use utils package to format and display table
	utils.FormatTable(tableData)
}

// Done marks one or more todos as complete
func Done(args []string) {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "Error: at least one todo ID is required\n")
		fmt.Fprintf(os.Stderr, "Usage: todo done <id1> [id2] [id3]...\n")
		os.Exit(1)
	}

	// Parse and validate all IDs first
	var ids []int
	for _, arg := range args {
		id, err := strconv.Atoi(arg)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: invalid todo ID '%s'\n", arg)
			os.Exit(1)
		}
		ids = append(ids, id)
	}

	// Load todos to validate IDs exist
	todos, err := app.LoadTodos()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading todos: %v\n", err)
		os.Exit(1)
	}

	// Create map for quick lookup
	todoMap := make(map[int]*app.Todo)
	for i := range todos {
		todoMap[todos[i].ID] = &todos[i]
	}

	// Validate all IDs exist before making any changes
	for _, id := range ids {
		if _, exists := todoMap[id]; !exists {
			fmt.Fprintf(os.Stderr, "Error: todo #%d not found\n", id)
			os.Exit(1)
		}
		if todoMap[id].Done {
			fmt.Fprintf(os.Stderr, "Warning: todo #%d is already completed\n", id)
		}
	}

	// Mark todos as done and save
	var completedTodos []app.Todo
	for _, id := range ids {
		todo := todoMap[id]
		if !todo.Done {
			err := app.MarkTodoDone(id)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error marking todo #%d as done: %v\n", id, err)
				os.Exit(1)
			}
			completedTodos = append(completedTodos, *todo)
		}
	}

	// Print confirmation for each completed todo
	for _, todo := range completedTodos {
		task := todo.Text
		if len(task) > 40 {
			task = task[:37] + "..."
		}
		fmt.Printf("Completed: #%d - %s\n", todo.ID, task)
	}

	if len(completedTodos) == 0 {
		fmt.Println("No todos were marked as completed (all were already done).")
	}
}

// Remove deletes todo items or all completed todos
func Remove(args []string) {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "Error: todo ID or --done flag is required\n")
		fmt.Fprintf(os.Stderr, "Usage: todo remove <id> OR todo remove --done\n")
		os.Exit(1)
	}

	// Check if --done flag is used
	if len(args) == 1 && args[0] == "--done" {
		removeAllCompleted()
		return
	}

	// Handle single ID removal
	if len(args) != 1 {
		fmt.Fprintf(os.Stderr, "Error: provide either a single todo ID or --done flag\n")
		os.Exit(1)
	}

	id, err := strconv.Atoi(args[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: invalid todo ID '%s'\n", args[0])
		os.Exit(1)
	}

	// Load todos to get todo details before deletion
	todos, err := app.LoadTodos()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading todos: %v\n", err)
		os.Exit(1)
	}

	// Find the todo to get its details
	var todoToRemove *app.Todo
	for _, todo := range todos {
		if todo.ID == id {
			todoToRemove = &todo
			break
		}
	}

	if todoToRemove == nil {
		fmt.Fprintf(os.Stderr, "Error: todo #%d not found\n", id)
		os.Exit(1)
	}

	// Delete the todo
	err = app.DeleteTodo(id)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error removing todo: %v\n", err)
		os.Exit(1)
	}

	// Truncate long descriptions for display
	task := todoToRemove.Text
	if len(task) > 40 {
		task = task[:37] + "..."
	}

	fmt.Printf("Removed: #%d - %s\n", id, task)
}

// removeAllCompleted removes all completed todos
func removeAllCompleted() {
	todos, err := app.LoadTodos()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading todos: %v\n", err)
		os.Exit(1)
	}

	// Find all completed todos
	var completedIDs []int
	for _, todo := range todos {
		if todo.Done {
			completedIDs = append(completedIDs, todo.ID)
		}
	}

	if len(completedIDs) == 0 {
		fmt.Println("No completed todos to remove.")
		return
	}

	// Remove all completed todos
	removedCount := 0
	for _, id := range completedIDs {
		err := app.DeleteTodo(id)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error removing todo #%d: %v\n", id, err)
			continue
		}
		removedCount++
	}

	if removedCount == 1 {
		fmt.Printf("Removed 1 completed todo.\n")
	} else {
		fmt.Printf("Removed %d completed todos.\n", removedCount)
	}
}

// Help displays usage information and available commands
func Help(args []string) {
	fmt.Printf("Todo CLI - Task Management Tool v1.0.0\n\n")
	
	fmt.Printf("USAGE:\n")
	fmt.Printf("  todo <command> [arguments]\n\n")
	
	fmt.Printf("COMMANDS:\n")
	fmt.Printf("  add      Add a new todo item\n")
	fmt.Printf("  list     Display todo items\n")
	fmt.Printf("  done     Mark todos as complete\n")
	fmt.Printf("  remove   Delete todo items\n")
	fmt.Printf("  help     Show this help message\n\n")
	
	fmt.Printf("EXAMPLES:\n")
	fmt.Printf("  todo add \"Buy groceries\"                    # Add a simple task\n")
	fmt.Printf("  todo add --priority=high \"Fix critical bug\" # Add high priority task\n")
	fmt.Printf("  todo list                                   # Show pending todos\n")
	fmt.Printf("  todo list --all                             # Show all todos\n")
	fmt.Printf("  todo list --done                            # Show completed todos\n")
	fmt.Printf("  todo done 1                                 # Mark todo #1 as complete\n")
	fmt.Printf("  todo done 1 2 3                             # Mark multiple todos as complete\n")
	fmt.Printf("  todo remove 1                               # Remove todo #1\n")
	fmt.Printf("  todo remove --done                          # Remove all completed todos\n\n")
	
	fmt.Printf("FLAGS:\n")
	fmt.Printf("  --priority=LEVEL  Set task priority (high, medium, low) [add command]\n")
	fmt.Printf("  --all            Show all todos [list command]\n")
	fmt.Printf("  --done           Show/remove completed todos [list/remove commands]\n\n")
	
	fmt.Printf("For more information about a specific command, use:\n")
	fmt.Printf("  todo <command> --help\n")
}

// loadModifySave implements the common pattern for todo operations
// This helper function can be used by commands that need to load, modify, and save todos
func loadModifySave(modifyFunc func([]app.Todo) ([]app.Todo, error)) error {
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}

	modifiedTodos, err := modifyFunc(todos)
	if err != nil {
		return fmt.Errorf("failed to modify todos: %w", err)
	}

	err = app.SaveTodos(modifiedTodos)
	if err != nil {
		return fmt.Errorf("failed to save todos: %w", err)
	}

	return nil
}