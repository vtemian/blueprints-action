package main

import (
	"fmt"
	"os"

	"github.com/todo-cli/app"
	"github.com/todo-cli/commands"
)

// main is the entry point for the Todo CLI application.
// It parses command-line arguments and routes them to appropriate command handlers.
func main() {
	// Initialize the application
	if err := app.Initialize(); err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing application: %v\n", err)
		os.Exit(1)
	}

	// Parse command-line arguments
	args := os.Args
	
	// If no arguments provided, show help
	if len(args) < 2 {
		if err := commands.Help(); err != nil {
			fmt.Fprintf(os.Stderr, "Error displaying help: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// Extract the command from the first argument
	command := args[1]
	commandArgs := args[2:] // Remaining arguments for the command

	// Route commands to their respective handlers
	switch command {
	case "add":
		if err := handleAddCommand(commandArgs); err != nil {
			fmt.Fprintf(os.Stderr, "Error adding todo: %v\n", err)
			os.Exit(1)
		}

	case "list":
		if err := commands.List(commandArgs); err != nil {
			fmt.Fprintf(os.Stderr, "Error listing todos: %v\n", err)
			os.Exit(1)
		}

	case "done":
		if err := handleDoneCommand(commandArgs); err != nil {
			fmt.Fprintf(os.Stderr, "Error marking todo as done: %v\n", err)
			os.Exit(1)
		}

	case "remove":
		if err := handleRemoveCommand(commandArgs); err != nil {
			fmt.Fprintf(os.Stderr, "Error removing todo: %v\n", err)
			os.Exit(1)
		}

	case "help", "-h", "--help":
		if err := commands.Help(); err != nil {
			fmt.Fprintf(os.Stderr, "Error displaying help: %v\n", err)
			os.Exit(1)
		}

	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", command)
		if err := commands.Help(); err != nil {
			fmt.Fprintf(os.Stderr, "Error displaying help: %v\n", err)
		}
		os.Exit(1)
	}
}

// handleAddCommand validates arguments and calls the add command handler.
func handleAddCommand(args []string) error {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "Usage: todo add <description>\n")
		fmt.Fprintf(os.Stderr, "Error: todo description is required\n")
		return fmt.Errorf("missing required argument: description")
	}

	return commands.Add(args)
}

// handleDoneCommand validates arguments and calls the done command handler.
func handleDoneCommand(args []string) error {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "Usage: todo done <id>\n")
		fmt.Fprintf(os.Stderr, "Error: todo ID is required\n")
		return fmt.Errorf("missing required argument: id")
	}

	return commands.Done(args)
}

// handleRemoveCommand validates arguments and calls the remove command handler.
func handleRemoveCommand(args []string) error {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "Usage: todo remove <id>\n")
		fmt.Fprintf(os.Stderr, "Error: todo ID is required\n")
		return fmt.Errorf("missing required argument: id")
	}

	return commands.Remove(args)
}