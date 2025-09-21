package commands

import (
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"your-app/app"
	"your-app/utils"
)

// Add creates a new todo item with optional priority
func Add(args []string) error {
	fs := flag.NewFlagSet("add", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: todo add [--priority=N] <task text>\n")
	}
	
	priority := fs.Int("priority", 1, "Priority level (1-5)")
	
	if err := fs.Parse(args); err != nil {
		return fmt.Errorf("failed to parse flags: %w", err)
	}
	
	remainingArgs := fs.Args()
	if len(remainingArgs) == 0 {
		return fmt.Errorf("task text cannot be empty")
	}
	
	taskText := strings.Join(remainingArgs, " ")
	taskText = strings.TrimSpace(taskText)
	
	if taskText == "" {
		return fmt.Errorf("task text cannot be empty")
	}
	
	if *priority < 1 || *priority > 5 {
		return fmt.Errorf("priority must be between 1 and 5")
	}
	
	todo, err := app.AddTodo(taskText, *priority)
	if err != nil {
		return fmt.Errorf("failed to add todo: %w", err)
	}
	
	fmt.Printf("Added: #%d - %s\n", todo.ID, todo.Text)
	return nil
}

// List displays todos with optional filtering
func List(args []string) error {
	fs := flag.NewFlagSet("list", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: todo list [--all] [--done]\n")
	}
	
	showAll := fs.Bool("all", false, "Show all todos")
	showDone := fs.Bool("done", false, "Show only completed todos")
	
	if err := fs.Parse(args); err != nil {
		return fmt.Errorf("failed to parse flags: %w", err)
	}
	
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}
	
	if len(todos) == 0 {
		fmt.Println("No todos found.")
		return nil
	}
	
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
		} else {
			fmt.Println("No pending todos found.")
		}
		return nil
	}
	
	// Prepare data for table formatting
	var tableData [][]string
	tableData = append(tableData, []string{"ID", "Status", "Priority", "Task", "Created"})
	
	for _, todo := range filteredTodos {
		status := "[ ]"
		if todo.Done {
			status = "[✓]"
		}
		
		priorityStr := strings.Repeat("!", todo.Priority)
		createdStr := todo.CreatedAt.Format("2006-01-02 15:04")
		
		tableData = append(tableData, []string{
			fmt.Sprintf("#%d", todo.ID),
			status,
			priorityStr,
			todo.Text,
			createdStr,
		})
	}
	
	utils.FormatTable(tableData)
	return nil
}

// Done marks one or more todos as completed
func Done(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("please specify at least one todo ID")
	}
	
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}
	
	var todoIDs []int
	var todoMap = make(map[int]*app.Todo)
	
	// Create a map for quick lookup
	for i := range todos {
		todoMap[todos[i].ID] = &todos[i]
	}
	
	// Parse and validate all IDs first
	for _, arg := range args {
		id, err := strconv.Atoi(arg)
		if err != nil {
			return fmt.Errorf("invalid todo ID '%s': must be a number", arg)
		}
		
		if _, exists := todoMap[id]; !exists {
			return fmt.Errorf("todo with ID %d not found", id)
		}
		
		if todoMap[id].Done {
			return fmt.Errorf("todo #%d is already completed", id)
		}
		
		todoIDs = append(todoIDs, id)
	}
	
	// Mark todos as done
	now := time.Now()
	var completedTodos []app.Todo
	
	for _, id := range todoIDs {
		todo := todoMap[id]
		todo.Done = true
		todo.CompletedAt = &now
		completedTodos = append(completedTodos, *todo)
	}
	
	// Save changes
	var updatedTodos []app.Todo
	for _, todo := range todos {
		if updatedTodo, exists := todoMap[todo.ID]; exists {
			updatedTodos = append(updatedTodos, *updatedTodo)
		} else {
			updatedTodos = append(updatedTodos, todo)
		}
	}
	
	if err := app.SaveTodos(updatedTodos); err != nil {
		return fmt.Errorf("failed to save todos: %w", err)
	}
	
	// Print confirmation
	for _, todo := range completedTodos {
		fmt.Printf("Completed: #%d - %s\n", todo.ID, todo.Text)
	}
	
	return nil
}

// Remove deletes todos by ID or removes all completed todos
func Remove(args []string) error {
	fs := flag.NewFlagSet("remove", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: todo remove <id> OR todo remove --done\n")
	}
	
	removeDone := fs.Bool("done", false, "Remove all completed todos")
	
	if err := fs.Parse(args); err != nil {
		return fmt.Errorf("failed to parse flags: %w", err)
	}
	
	remainingArgs := fs.Args()
	
	if *removeDone && len(remainingArgs) > 0 {
		return fmt.Errorf("cannot specify both --done flag and todo ID")
	}
	
	if !*removeDone && len(remainingArgs) != 1 {
		return fmt.Errorf("please specify exactly one todo ID or use --done flag")
	}
	
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}
	
	if *removeDone {
		var remainingTodos []app.Todo
		var removedCount int
		var removedTodos []app.Todo
		
		for _, todo := range todos {
			if todo.Done {
				removedTodos = append(removedTodos, todo)
				removedCount++
			} else {
				remainingTodos = append(remainingTodos, todo)
			}
		}
		
		if removedCount == 0 {
			fmt.Println("No completed todos to remove.")
			return nil
		}
		
		if err := app.SaveTodos(remainingTodos); err != nil {
			return fmt.Errorf("failed to save todos: %w", err)
		}
		
		fmt.Printf("Removed %d completed todo(s):\n", removedCount)
		for _, todo := range removedTodos {
			fmt.Printf("Removed: #%d - %s\n", todo.ID, todo.Text)
		}
		
		return nil
	}
	
	// Remove single todo by ID
	id, err := strconv.Atoi(remainingArgs[0])
	if err != nil {
		return fmt.Errorf("invalid todo ID '%s': must be a number", remainingArgs[0])
	}
	
	var todoToRemove *app.Todo
	var todoIndex = -1
	
	for i, todo := range todos {
		if todo.ID == id {
			todoToRemove = &todo
			todoIndex = i
			break
		}
	}
	
	if todoToRemove == nil {
		return fmt.Errorf("todo with ID %d not found", id)
	}
	
	if err := app.DeleteTodo(id); err != nil {
		return fmt.Errorf("failed to delete todo: %w", err)
	}
	
	fmt.Printf("Removed: #%d - %s\n", todoToRemove.ID, todoToRemove.Text)
	return nil
}

// Help displays usage information and examples
func Help(args []string) error {
	helpText := `Todo CLI - A simple command-line todo manager

USAGE:
    todo <command> [arguments]

COMMANDS:
    add [--priority=N] <text>    Add a new todo item
    list [--all] [--done]        List todo items
    done <id> [id...]            Mark todo(s) as completed
    remove <id>                  Remove a todo item
    remove --done                Remove all completed todos
    help                         Show this help message

FLAGS:
    --priority=N                 Set priority level (1-5, default: 1)
    --all                        Show all todos (completed and pending)
    --done                       Show only completed todos / Remove completed todos

EXAMPLES:
    todo add "Buy groceries"                    # Add a simple todo
    todo add --priority=3 "Important meeting"  # Add with high priority
    todo list                                   # Show pending todos
    todo list --all                            # Show all todos
    todo list --done                           # Show completed todos only
    todo done 1                                # Mark todo #1 as completed
    todo done 1 2 3                           # Mark multiple todos as completed
    todo remove 1                             # Remove todo #1
    todo remove --done                        # Remove all completed todos

PRIORITY LEVELS:
    1 (!)     - Low priority (default)
    2 (!!)    - Normal priority
    3 (!!!)   - Medium priority
    4 (!!!!)  - High priority
    5 (!!!!!) - Critical priority

STATUS INDICATORS:
    [ ]       - Pending todo
    [✓]       - Completed todo
`
	
	fmt.Print(helpText)
	return nil
}