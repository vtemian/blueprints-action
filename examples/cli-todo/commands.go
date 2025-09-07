// Package commands provides CLI command handlers for a todo application.
// It implements command parsing, validation, and execution for managing todo items.
package commands

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"

	"app"
	"datetime"
	"utils"
)

// TodoNotFoundError represents an error when a todo ID doesn't exist
type TodoNotFoundError struct {
	ID int
}

func (e *TodoNotFoundError) Error() string {
	return fmt.Sprintf("todo #%d not found", e.ID)
}

// Add parses arguments to create a new todo item with optional priority.
// Usage: add [--priority high|medium|low] <task description>
func Add(args []string) error {
	fs := flag.NewFlagSet("add", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: add [--priority high|medium|low] <task description>\n")
	}
	
	priority := fs.String("priority", "medium", "Task priority (high, medium, low)")
	
	if err := fs.Parse(args); err != nil {
		return fmt.Errorf("failed to parse flags: %w", err)
	}
	
	remainingArgs := fs.Args()
	if len(remainingArgs) == 0 {
		return errors.New("task description is required")
	}
	
	// Validate priority
	validPriorities := map[string]bool{"high": true, "medium": true, "low": true}
	if !validPriorities[*priority] {
		return errors.New("priority must be one of: high, medium, low")
	}
	
	taskText := strings.Join(remainingArgs, " ")
	
	todo, err := app.AddTodo(taskText, *priority)
	if err != nil {
		return fmt.Errorf("failed to add todo: %w", err)
	}
	
	fmt.Printf("Added: #%d - %s\n", todo.ID, todo.Text)
	return nil
}

// List displays todos with optional filtering.
// Usage: list [--all] [--done]
func List(args []string) error {
	fs := flag.NewFlagSet("list", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: list [--all] [--done]\n")
	}
	
	showAll := fs.Bool("all", false, "Show all todos including completed")
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
	
	// Filter todos based on flags
	var filteredTodos []app.Todo
	for _, todo := range todos {
		if *showDone && !todo.Done {
			continue
		}
		if !*showAll && !*showDone && todo.Done {
			continue
		}
		filteredTodos = append(filteredTodos, todo)
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
	headers := []string{"ID", "Status", "Priority", "Task", "Created"}
	var rows [][]string
	
	for _, todo := range filteredTodos {
		status := "[ ]"
		if todo.Done {
			status = "[✓]"
		}
		
		createdTime := datetime.FormatTime(todo.CreatedAt)
		
		row := []string{
			fmt.Sprintf("#%d", todo.ID),
			status,
			strings.Title(todo.Priority),
			todo.Text,
			createdTime,
		}
		rows = append(rows, row)
	}
	
	table := utils.FormatTable(headers, rows)
	fmt.Print(table)
	
	return nil
}

// Done marks one or more todos as completed.
// Usage: done <id1> [id2] [id3] ...
func Done(args []string) error {
	fs := flag.NewFlagSet("done", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: done <id1> [id2] [id3] ...\n")
	}
	
	if err := fs.Parse(args); err != nil {
		return fmt.Errorf("failed to parse flags: %w", err)
	}
	
	remainingArgs := fs.Args()
	if len(remainingArgs) == 0 {
		return errors.New("at least one todo ID is required")
	}
	
	// Parse and validate todo IDs
	var todoIDs []int
	for _, arg := range remainingArgs {
		id, err := strconv.Atoi(arg)
		if err != nil {
			return fmt.Errorf("invalid todo ID '%s': must be a number", arg)
		}
		if id <= 0 {
			return fmt.Errorf("invalid todo ID %d: must be positive", id)
		}
		todoIDs = append(todoIDs, id)
	}
	
	// Load todos
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}
	
	// Mark todos as done
	var completedTodos []app.Todo
	for _, id := range todoIDs {
		todo, err := findAndMarkTodoDone(todos, id)
		if err != nil {
			return err
		}
		completedTodos = append(completedTodos, *todo)
	}
	
	// Save changes
	if err := app.SaveTodos(todos); err != nil {
		return fmt.Errorf("failed to save todos: %w", err)
	}
	
	// Display success messages
	for _, todo := range completedTodos {
		fmt.Printf("Completed: #%d - %s\n", todo.ID, todo.Text)
	}
	
	return nil
}

// Remove deletes one or more todos.
// Usage: remove <id> [--done]
func Remove(args []string) error {
	fs := flag.NewFlagSet("remove", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: remove <id> [--done]\n")
	}
	
	removeDone := fs.Bool("done", false, "Remove all completed todos")
	
	if err := fs.Parse(args); err != nil {
		return fmt.Errorf("failed to parse flags: %w", err)
	}
	
	remainingArgs := fs.Args()
	
	if *removeDone {
		return removeDoneTodos()
	}
	
	if len(remainingArgs) == 0 {
		return errors.New("todo ID is required (or use --done flag)")
	}
	
	if len(remainingArgs) > 1 {
		return errors.New("only one todo ID is allowed")
	}
	
	id, err := strconv.Atoi(remainingArgs[0])
	if err != nil {
		return fmt.Errorf("invalid todo ID '%s': must be a number", remainingArgs[0])
	}
	
	if id <= 0 {
		return fmt.Errorf("invalid todo ID %d: must be positive", id)
	}
	
	todo, err := app.DeleteTodo(id)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return &TodoNotFoundError{ID: id}
		}
		return fmt.Errorf("failed to delete todo: %w", err)
	}
	
	fmt.Printf("Removed: #%d - %s\n", todo.ID, todo.Text)
	return nil
}

// Help displays usage information and available commands.
// Usage: help
func Help(args []string) error {
	fmt.Println("Todo CLI Application")
	fmt.Println("===================")
	fmt.Println()
	fmt.Println("USAGE:")
	fmt.Println("  todo <command> [arguments]")
	fmt.Println()
	fmt.Println("COMMANDS:")
	fmt.Println()
	fmt.Println("  add [--priority high|medium|low] <task>")
	fmt.Println("    Add a new todo item with optional priority")
	fmt.Println("    Example: todo add --priority high \"Fix critical bug\"")
	fmt.Println()
	fmt.Println("  list [--all] [--done]")
	fmt.Println("    List todos with optional filtering")
	fmt.Println("    --all    Show all todos including completed")
	fmt.Println("    --done   Show only completed todos")
	fmt.Println("    Example: todo list --done")
	fmt.Println()
	fmt.Println("  done <id1> [id2] [id3] ...")
	fmt.Println("    Mark one or more todos as completed")
	fmt.Println("    Example: todo done 1 3 5")
	fmt.Println()
	fmt.Println("  remove <id> [--done]")
	fmt.Println("    Remove a specific todo by ID or all completed todos")
	fmt.Println("    --done   Remove all completed todos")
	fmt.Println("    Example: todo remove 2")
	fmt.Println("    Example: todo remove --done")
	fmt.Println()
	fmt.Println("  help")
	fmt.Println("    Show this help message")
	fmt.Println()
	fmt.Println("EXAMPLES:")
	fmt.Println("  todo add \"Buy groceries\"")
	fmt.Println("  todo add --priority high \"Prepare presentation\"")
	fmt.Println("  todo list")
	fmt.Println("  todo done 1")
	fmt.Println("  todo remove 2")
	fmt.Println()
	
	return nil
}

// findAndMarkTodoDone finds a todo by ID and marks it as done
func findAndMarkTodoDone(todos []app.Todo, id int) (*app.Todo, error) {
	for i := range todos {
		if todos[i].ID == id {
			if todos[i].Done {
				return nil, fmt.Errorf("todo #%d is already completed", id)
			}
			todos[i].Done = true
			todos[i].CompletedAt = datetime.Now()
			return &todos[i], nil
		}
	}
	return nil, &TodoNotFoundError{ID: id}
}

// removeDoneTodos removes all completed todos
func removeDoneTodos() error {
	todos, err := app.LoadTodos()
	if err != nil {
		return fmt.Errorf("failed to load todos: %w", err)
	}
	
	var remainingTodos []app.Todo
	var removedCount int
	
	for _, todo := range todos {
		if todo.Done {
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
	
	fmt.Printf("Removed %d completed todo(s).\n", removedCount)
	return nil
}