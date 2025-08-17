// Package main provides the entry point for the todo CLI application.
// It handles command routing and error management for todo operations.
package main

import (
	"fmt"
	"os"

	"./app"
	"./commands"
)

func main() {
	// Defer panic recovery to handle any unexpected errors gracefully
	defer func() {
		if r := recover(); r != nil {
			fmt.Fprintf(os.Stderr, "Error: An unexpected error occurred: %v\n", r)
			os.Exit(1)
		}
	}()

	// Get command line arguments, excluding the program name
	args := os.Args[1:]

	// Handle empty arguments - show help and exit successfully
	if len(args) == 0 {
		commands.Help()
		os.Exit(0)
	}

	// Extract the command from the first argument
	command := args[0]

	// Initialize the application (if needed)
	_ = app

	// Route commands to their respective handlers
	switch command {
	case "add":
		err := commands.Add()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: Failed to add todo item: %v\n", err)
			os.Exit(1)
		}

	case "list":
		err := commands.List()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: Failed to list todo items: %v\n", err)
			os.Exit(1)
		}

	case "done":
		err := commands.Done()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: Failed to mark todo item as done: %v\n", err)
			os.Exit(1)
		}

	case "remove":
		err := commands.Remove()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: Failed to remove todo item: %v\n", err)
			os.Exit(1)
		}

	case "help":
		commands.Help()
		os.Exit(0)

	default:
		// Handle unknown commands
		fmt.Fprintf(os.Stderr, "Error: Unknown command '%s'\n", command)
		commands.Help()
		os.Exit(1)
	}

	// If we reach here, the command executed successfully
	os.Exit(0)
}