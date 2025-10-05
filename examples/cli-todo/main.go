// Package main provides a command-line interface for managing todo items.
// The application supports adding, listing, marking as done, and removing todo items.
package main

import (
	"fmt"
	"os"
	"strings"

	"./app"
	"./commands"
)

func main() {
	// Initialize the application
	if err := app.Initialize(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: Failed to initialize application: %v\n", err)
		os.Exit(1)
	}

	// Parse command-line arguments
	args := os.Args[1:]
	
	// Route command to appropriate handler
	if err := routeCommand(args); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	os.Exit(0)
}

// routeCommand handles command routing and argument validation
func routeCommand(args []string) error {
	// Handle no arguments or help command
	if len(args) == 0 {
		return commands.Help()
	}

	command := strings.ToLower(args[0])

	switch command {
	case "add":
		if len(args) < 2 {
			fmt.Fprintf(os.Stderr, "Usage: todo add <task description>\n")
			fmt.Fprintf(os.Stderr, "Example: todo add \"Buy groceries\"\n")
			return fmt.Errorf("missing task description for add command")
		}
		// Join all arguments after "add" to form the task description
		taskDescription := strings.Join(args[1:], " ")
		return commands.Add(taskDescription)

	case "list":
		// List command doesn't require additional arguments
		return commands.List()

	case "done":
		if len(args) < 2 {
			fmt.Fprintf(os.Stderr, "Usage: todo done <task_id>\n")
			fmt.Fprintf(os.Stderr, "Example: todo done 1\n")
			return fmt.Errorf("missing task ID for done command")
		}
		return commands.Done(args[1])

	case "remove":
		if len(args) < 2 {
			fmt.Fprintf(os.Stderr, "Usage: todo remove <task_id>\n")
			fmt.Fprintf(os.Stderr, "Example: todo remove 1\n")
			return fmt.Errorf("missing task ID for remove command")
		}
		return commands.Remove(args[1])

	case "help", "-h", "--help":
		return commands.Help()

	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", command)
		if helpErr := commands.Help(); helpErr != nil {
			return fmt.Errorf("unknown command '%s' and failed to display help: %v", command, helpErr)
		}
		return fmt.Errorf("unknown command: %s", command)
	}
}