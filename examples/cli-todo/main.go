package main

import (
	"fmt"
	"os"
)

// Exit codes
const (
	ExitSuccess = 0
	ExitError   = 1
)

// Command names
const (
	CmdAdd    = "add"
	CmdList   = "list"
	CmdDone   = "done"
	CmdRemove = "remove"
	CmdHelp   = "help"
)

// CommandHandler defines the signature for command handler functions
type CommandHandler func(args []string) error

func main() {
	args := os.Args[1:] // Skip program name

	// Show help if no arguments provided
	if len(args) == 0 {
		showHelp()
		os.Exit(ExitSuccess)
	}

	command := args[0]
	commandArgs := args[1:]

	// Route command to appropriate handler
	if err := routeCommand(command, commandArgs); err != nil {
		handleError(err)
		os.Exit(ExitError)
	}

	os.Exit(ExitSuccess)
}

// routeCommand routes the command to the appropriate handler function
func routeCommand(command string, args []string) error {
	// Command routing map
	commands := map[string]CommandHandler{
		CmdAdd:    addCommand,
		CmdList:   listCommand,
		CmdDone:   doneCommand,
		CmdRemove: removeCommand,
		CmdHelp:   helpCommand,
	}

	handler, exists := commands[command]
	if !exists {
		fmt.Fprintf(os.Stderr, "Error: Unknown command '%s'\n\n", command)
		showHelp()
		return fmt.Errorf("invalid command: %s", command)
	}

	return handler(args)
}

// addCommand handles the "add" command
func addCommand(args []string) error {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "Error: Missing task description\n")
		fmt.Fprintf(os.Stderr, "Usage: todo add <task description>\n")
		return fmt.Errorf("missing task description")
	}

	// TODO: Implement add functionality
	// This would typically involve:
	// 1. Joining args to form the task description
	// 2. Loading existing todos from file
	// 3. Adding the new task
	// 4. Saving back to file
	
	fmt.Printf("Adding task: %s\n", joinArgs(args))
	return nil
}

// listCommand handles the "list" command
func listCommand(args []string) error {
	// TODO: Implement list functionality
	// This would typically involve:
	// 1. Loading todos from file
	// 2. Displaying them in a formatted way
	// 3. Handling empty todo list case
	
	fmt.Println("Listing all tasks...")
	return nil
}

// doneCommand handles the "done" command
func doneCommand(args []string) error {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "Error: Missing task ID\n")
		fmt.Fprintf(os.Stderr, "Usage: todo done <task_id>\n")
		return fmt.Errorf("missing task ID")
	}

	taskID := args[0]
	
	// TODO: Implement done functionality
	// This would typically involve:
	// 1. Validating task ID format/existence
	// 2. Loading todos from file
	// 3. Marking the specified task as done
	// 4. Saving back to file
	
	fmt.Printf("Marking task %s as done\n", taskID)
	return nil
}

// removeCommand handles the "remove" command
func removeCommand(args []string) error {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "Error: Missing task ID\n")
		fmt.Fprintf(os.Stderr, "Usage: todo remove <task_id>\n")
		return fmt.Errorf("missing task ID")
	}

	taskID := args[0]
	
	// TODO: Implement remove functionality
	// This would typically involve:
	// 1. Validating task ID format/existence
	// 2. Loading todos from file
	// 3. Removing the specified task
	// 4. Saving back to file
	
	fmt.Printf("Removing task %s\n", taskID)
	return nil
}

// helpCommand handles the "help" command
func helpCommand(args []string) error {
	showHelp()
	return nil
}

// showHelp displays the application help message
func showHelp() {
	fmt.Println("Todo CLI Application")
	fmt.Println()
	fmt.Println("USAGE:")
	fmt.Println("  todo <command> [arguments]")
	fmt.Println()
	fmt.Println("COMMANDS:")
	fmt.Println("  add <description>    Add a new task")
	fmt.Println("  list                 List all tasks")
	fmt.Println("  done <task_id>       Mark a task as completed")
	fmt.Println("  remove <task_id>     Remove a task")
	fmt.Println("  help                 Show this help message")
	fmt.Println()
	fmt.Println("EXAMPLES:")
	fmt.Println("  todo add \"Buy groceries\"")
	fmt.Println("  todo list")
	fmt.Println("  todo done 1")
	fmt.Println("  todo remove 2")
}

// handleError handles and displays error messages
func handleError(err error) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
	}
}

// joinArgs joins command arguments into a single string
func joinArgs(args []string) string {
	if len(args) == 0 {
		return ""
	}
	
	result := args[0]
	for i := 1; i < len(args); i++ {
		result += " " + args[i]
	}
	return result
}