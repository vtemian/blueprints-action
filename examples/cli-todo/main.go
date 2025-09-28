package main

import (
	"fmt"
	"os"

	"./app"
	"./commands"
)

func main() {
	// Initialize the application
	if err := app.Initialize(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: Failed to initialize application: %v\n", err)
		os.Exit(1)
	}

	// Parse command line arguments
	args := os.Args[1:] // Skip program name

	// Handle empty arguments - show help
	if len(args) == 0 {
		if err := commands.Help(); err != nil {
			fmt.Fprintf(os.Stderr, "Error: Failed to display help: %v\n", err)
			os.Exit(1)
		}
		os.Exit(0)
	}

	// Route commands based on first argument
	command := args[0]
	commandArgs := args[1:] // Remaining arguments for the command

	if err := routeCommand(command, commandArgs); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		// Show help for invalid commands
		if command != "help" {
			fmt.Fprintf(os.Stderr, "\n")
			commands.Help()
		}
		os.Exit(1)
	}

	os.Exit(0)
}

// routeCommand handles command routing and execution
func routeCommand(command string, args []string) error {
	switch command {
	case "add":
		return handleAdd(args)
	case "list":
		return handleList(args)
	case "done":
		return handleDone(args)
	case "remove":
		return handleRemove(args)
	case "help":
		return commands.Help()
	default:
		return fmt.Errorf("unknown command '%s'", command)
	}
}

// handleAdd processes the add command
func handleAdd(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("add command requires a task description")
	}
	
	// Join all arguments to form the task description
	taskDescription := ""
	for i, arg := range args {
		if i > 0 {
			taskDescription += " "
		}
		taskDescription += arg
	}
	
	return commands.Add(taskDescription)
}

// handleList processes the list command
func handleList(args []string) error {
	// List command doesn't require arguments, but we can add filters later
	return commands.List()
}

// handleDone processes the done command
func handleDone(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("done command requires a task ID")
	}
	
	if len(args) > 1 {
		return fmt.Errorf("done command accepts only one task ID")
	}
	
	taskID := args[0]
	return commands.Done(taskID)
}

// handleRemove processes the remove command
func handleRemove(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("remove command requires a task ID")
	}
	
	if len(args) > 1 {
		return fmt.Errorf("remove command accepts only one task ID")
	}
	
	taskID := args[0]
	return commands.Remove(taskID)
}