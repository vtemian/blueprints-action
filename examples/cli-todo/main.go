package main

import (
	"fmt"
	"os"

	"./commands"
)

func main() {
	// Ensure we have at least the program name in os.Args
	if len(os.Args) < 1 {
		fmt.Fprintf(os.Stderr, "Error: Unable to determine program name\n")
		os.Exit(1)
	}

	// If no command provided, show help
	if len(os.Args) < 2 {
		if err := commands.Help(); err != nil {
			fmt.Fprintf(os.Stderr, "Error displaying help: %v\n", err)
			os.Exit(1)
		}
		os.Exit(0)
	}

	// Extract command and arguments
	command := os.Args[1]
	args := os.Args[2:] // Remaining arguments after the command

	// Route commands to appropriate handlers
	switch command {
	case "add":
		// Validate that we have something to add
		if len(args) == 0 {
			fmt.Fprintf(os.Stderr, "Error: 'add' command requires a task description\n")
			fmt.Fprintf(os.Stderr, "Usage: %s add <task description>\n", os.Args[0])
			os.Exit(1)
		}
		
		if err := commands.Add(args); err != nil {
			fmt.Fprintf(os.Stderr, "Error adding task: %v\n", err)
			os.Exit(1)
		}

	case "list":
		if err := commands.List(args); err != nil {
			fmt.Fprintf(os.Stderr, "Error listing tasks: %v\n", err)
			os.Exit(1)
		}

	case "done":
		// Validate that we have a task ID to mark as done
		if len(args) == 0 {
			fmt.Fprintf(os.Stderr, "Error: 'done' command requires a task ID\n")
			fmt.Fprintf(os.Stderr, "Usage: %s done <task_id>\n", os.Args[0])
			os.Exit(1)
		}
		
		if err := commands.Done(args); err != nil {
			fmt.Fprintf(os.Stderr, "Error marking task as done: %v\n", err)
			os.Exit(1)
		}

	case "remove":
		// Validate that we have a task ID to remove
		if len(args) == 0 {
			fmt.Fprintf(os.Stderr, "Error: 'remove' command requires a task ID\n")
			fmt.Fprintf(os.Stderr, "Usage: %s remove <task_id>\n", os.Args[0])
			os.Exit(1)
		}
		
		if err := commands.Remove(args); err != nil {
			fmt.Fprintf(os.Stderr, "Error removing task: %v\n", err)
			os.Exit(1)
		}

	case "help", "-h", "--help":
		if err := commands.Help(); err != nil {
			fmt.Fprintf(os.Stderr, "Error displaying help: %v\n", err)
			os.Exit(1)
		}

	default:
		// Handle invalid commands
		fmt.Fprintf(os.Stderr, "Error: Unknown command '%s'\n\n", command)
		
		// Show help for invalid commands
		if err := commands.Help(); err != nil {
			fmt.Fprintf(os.Stderr, "Error displaying help: %v\n", err)
		}
		os.Exit(1)
	}

	// If we reach here, the command executed successfully
	os.Exit(0)
}