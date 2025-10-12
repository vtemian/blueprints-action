// Package commands provides CLI command implementations for a todo application.
package commands

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"app"
	"utils"
)

// Add creates a new todo item with optional priority flag.
// Usage: add [--priority <value>] <todo text>
func Add(args []string) {
	if len(args) == 0 {
		fmt.Println("Error: Todo text is required")
		return
	}

	var priority string
	var todoText []string

	// Parse arguments for --priority flag
	i := 0
	for i < len(args) {
		if args[i] == "--priority" {
			if i+1 >= len(args) {
				fmt.Println("Error: --priority flag requires a value")
				return
			}
			priority = args[i+1]
			i += 2
		} else {
			todoText = append(todoText, args[i])
			i++
		}
	}

	if len(todoText) == 0 {
		fmt.Println("Error: Todo text is required")
		return
	}

	text := strings.Join(todoText, " ")
	id, err := app.AddTodo(text, priority)
	if err != nil {
		fmt.Printf("Error adding todo: %v\n", err)
		return
	}

	fmt.Printf("Added: #%d - %s\n", id, text)
}

// List displays todo items with optional filtering.
// Usage: list [--all] [--done]
func List(args []string) {
	var showAll, showDone bool

	// Parse flags
	for _, arg := range args {
		switch arg {
		case "--all":
			showAll = true
		case "--done":
			showDone = true
		}
	}

	todos, err := app.LoadTodos()
	if err != nil {
		fmt.Printf("Error loading todos: %v\n", err)
		return
	}

	if len(todos) == 0 {
		fmt.Println("No todos found")
		return
	}

	// Prepare data for table formatting
	var tableData [][]string
	headers := []string{"ID", "Status", "Description", "Priority", "Created", "Completed"}

	for _, todo := range todos {
		// Apply filters
		if !showAll {
			if showDone && !todo.Done {
				continue
			}
			if !showDone && todo.Done {
				continue
			}
		}

		status := "[ ]"
		if todo.Done {
			status = "[✓]"
		}

		priority := todo.Priority
		if priority == "" {
			priority = "normal"
		}

		completed := ""
		if todo.Done && !todo.CompletedAt.IsZero() {
			completed = todo.CompletedAt.Format("2006-01-02 15:04")
		}

		created := ""
		if !todo.CreatedAt.IsZero() {
			created = todo.CreatedAt.Format("2006-01-02 15:04")
		}

		row := []string{
			strconv.Itoa(todo.ID),
			status,
			todo.Text,
			priority,
			created,
			completed,
		}
		tableData = append(tableData, row)
	}

	if len(tableData) == 0 {
		if showDone {
			fmt.Println("No completed todos found")
		} else {
			fmt.Println("No pending todos found")
		}
		return
	}

	utils.FormatTable(headers, tableData)
}

// Done marks one or more todo items as completed.
// Usage: done <id1> [id2] [id3] ...
func Done(args []string) {
	if len(args) == 0 {
		fmt.Println("Error: At least one todo ID is required")
		return
	}

	todos, err := app.LoadTodos()
	if err != nil {
		fmt.Printf("Error loading todos: %v\n", err)
		return
	}

	var completedTodos []int
	now := time.Now()

	for _, arg := range args {
		id, err := strconv.Atoi(arg)
		if err != nil {
			fmt.Printf("Error: Invalid todo ID '%s' - must be a number\n", arg)
			continue
		}

		// Find and update the todo
		found := false
		for i := range todos {
			if todos[i].ID == id {
				if todos[i].Done {
					fmt.Printf("Todo #%d is already completed\n", id)
				} else {
					todos[i].Done = true
					todos[i].CompletedAt = now
					completedTodos = append(completedTodos, i)
					fmt.Printf("Completed: #%d - %s\n", id, todos[i].Text)
				}
				found = true
				break
			}
		}

		if !found {
			fmt.Printf("Error: Todo #%d not found\n", id)
		}
	}

	if len(completedTodos) > 0 {
		err = app.SaveTodos(todos)
		if err != nil {
			fmt.Printf("Error saving todos: %v\n", err)
		}
	}
}

// Remove deletes todo items by ID or removes all completed todos.
// Usage: remove <id> OR remove --done
func Remove(args []string) {
	if len(args) == 0 {
		fmt.Println("Error: Todo ID or --done flag is required")
		return
	}

	todos, err := app.LoadTodos()
	if err != nil {
		fmt.Printf("Error loading todos: %v\n", err)
		return
	}

	// Handle --done flag to remove all completed todos
	if len(args) == 1 && args[0] == "--done" {
		var remainingTodos []app.Todo
		removedCount := 0

		for _, todo := range todos {
			if todo.Done {
				fmt.Printf("Removed: #%d - %s\n", todo.ID, todo.Text)
				removedCount++
			} else {
				remainingTodos = append(remainingTodos, todo)
			}
		}

		if removedCount == 0 {
			fmt.Println("No completed todos to remove")
			return
		}

		err = app.SaveTodos(remainingTodos)
		if err != nil {
			fmt.Printf("Error saving todos: %v\n", err)
			return
		}

		fmt.Printf("Removed %d completed todo(s)\n", removedCount)
		return
	}

	// Handle single ID removal
	if len(args) != 1 {
		fmt.Println("Error: Please provide a single todo ID or use --done flag")
		return
	}

	id, err := strconv.Atoi(args[0])
	if err != nil {
		fmt.Printf("Error: Invalid todo ID '%s' - must be a number\n", args[0])
		return
	}

	// Find and remove the todo
	found := false
	var todoText string
	for i, todo := range todos {
		if todo.ID == id {
			todoText = todo.Text
			err = app.DeleteTodo(id)
			if err != nil {
				fmt.Printf("Error deleting todo: %v\n", err)
				return
			}
			fmt.Printf("Removed: #%d - %s\n", id, todoText)
			found = true
			break
		}
	}

	if !found {
		fmt.Printf("Error: Todo #%d not found\n", id)
	}
}

// Help displays usage information and examples for all commands.
func Help(args []string) {
	fmt.Println("Todo CLI Application")
	fmt.Println("===================")
	fmt.Println()
	fmt.Println("USAGE:")
	fmt.Println("  todo <command> [arguments]")
	fmt.Println()
	fmt.Println("COMMANDS:")
	fmt.Println()
	fmt.Println("  add [--priority <value>] <text>")
	fmt.Println("    Add a new todo item with optional priority")
	fmt.Println("    Examples:")
	fmt.Println("      todo add Buy groceries")
	fmt.Println("      todo add --priority high Fix critical bug")
	fmt.Println("      todo add --priority low Clean desk")
	fmt.Println()
	fmt.Println("  list [--all] [--done]")
	fmt.Println("    Display todo items (default: show pending only)")
	fmt.Println("    --all    Show all todos (pending and completed)")
	fmt.Println("    --done   Show completed todos only")
	fmt.Println("    Examples:")
	fmt.Println("      todo list")
	fmt.Println("      todo list --all")
	fmt.Println("      todo list --done")
	fmt.Println()
	fmt.Println("  done <id> [id2] [id3] ...")
	fmt.Println("    Mark one or more todos as completed")
	fmt.Println("    Examples:")
	fmt.Println("      todo done 1")
	fmt.Println("      todo done 1 3 5")
	fmt.Println()
	fmt.Println("  remove <id>")
	fmt.Println("  remove --done")
	fmt.Println("    Delete a specific todo by ID or all completed todos")
	fmt.Println("    Examples:")
	fmt.Println("      todo remove 1")
	fmt.Println("      todo remove --done")
	fmt.Println()
	fmt.Println("  help")
	fmt.Println("    Show this help message")
	fmt.Println()
	fmt.Println("EXAMPLES:")
	fmt.Println("  todo add \"Write documentation\"")
	fmt.Println("  todo add --priority high \"Review pull request\"")
	fmt.Println("  todo list")
	fmt.Println("  todo done 1")
	fmt.Println("  todo list --all")
	fmt.Println("  todo remove --done")
	fmt.Println()
	fmt.Println("STATUS INDICATORS:")
	fmt.Println("  [ ] - Pending todo")
	fmt.Println("  [✓] - Completed todo")
}