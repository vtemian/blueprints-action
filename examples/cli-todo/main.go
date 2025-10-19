package main

import (
	"fmt"
	"os"
	"strings"

	"app"
	"commands"
)

func main() {
	// Initialize the application
	app.Init()

	// Handle case where no arguments are provided - show help
	if len(os.Args) < 2 {
		commands.Help()
		os.Exit(0)
	}

	// Extract command from arguments and normalize to lowercase
	command := strings.ToLower(os.Args[1])

	// Route command to appropriate handler
	if err := routeCommand(command, os.Args[2:]); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Success - exit with code 0
	os.Exit(0)
}

// routeCommand handles command routing and execution
// Returns error if command is invalid or execution fails
func routeCommand(command string, args []string) error {
	switch command {
	case "add":
		// Add a new todo item
		return commands.Add(args)
	
	case "list":
		// List all todo items
		return commands.List(args)
	
	case "done":
		// Mark todo item as completed
		return commands.Done(args)
	
	case "remove":
		// Remove a todo item
		return commands.Remove(args)
	
	case "help":
		// Show help information
		return commands.Help()
	
	default:
		// Handle unknown/invalid commands
		fmt.Printf("Unknown command: %s\n\n", command)
		commands.Help()
		return fmt.Errorf("invalid command: %s", command)
	}
}