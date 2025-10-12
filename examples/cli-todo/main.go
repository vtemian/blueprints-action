package main

import (
	"fmt"
	"os"

	"github.com/todo-app/app"
	"github.com/todo-app/commands"
)

func main() {
	// Initialize the application
	if err := app.Initialize(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: Failed to initialize application: %v\n", err)
		os.Exit(1)
	}

	// Check if any arguments are provided
	if len(os.Args) < 2 {
		commands.Help()
		os.Exit(0)
	}

	// Get the command from command-line arguments
	command := os.Args[1]

	// Route commands to appropriate handlers
	switch command {
	case "add":
		if len(os.Args) < 3 {
			fmt.Fprintf(os.Stderr, "Error: 'add' command requires a task description\n")
			fmt.Fprintf(os.Stderr, "Usage: %s add \"task description\"\n", os.Args[0])
			os.Exit(1)
		}
		
		// Join all remaining arguments as the task description
		taskDescription := ""
		for i := 2; i < len(os.Args); i++ {
			if i > 2 {
				taskDescription += " "
			}
			taskDescription += os.Args[i]
		}
		
		if err := commands.Add(taskDescription); err != nil {
			fmt.Fprintf(os.Stderr, "Error: Failed to add task: %v\n", err)
			os.Exit(1)
		}

	case "list":
		if err := commands.List(); err != nil {
			fmt.Fprintf(os.Stderr, "Error: Failed to list tasks: %v\n", err)
			os.Exit(1)
		}

	case "done":
		if len(os.Args) < 3 {
			fmt.Fprintf(os.Stderr, "Error: 'done' command requires a task ID\n")
			fmt.Fprintf(os.Stderr, "Usage: %s done <task_id>\n", os.Args[0])
			os.Exit(1)
		}
		
		taskID := os.Args[2]
		if err := commands.Done(taskID); err != nil {
			fmt.Fprintf(os.Stderr, "Error: Failed to mark task as done: %v\n", err)
			os.Exit(1)
		}

	case "remove":
		if len(os.Args) < 3 {
			fmt.Fprintf(os.Stderr, "Error: 'remove' command requires a task ID\n")
			fmt.Fprintf(os.Stderr, "Usage: %s remove <task_id>\n", os.Args[0])
			os.Exit(1)
		}
		
		taskID := os.Args[2]
		if err := commands.Remove(taskID); err != nil {
			fmt.Fprintf(os.Stderr, "Error: Failed to remove task: %v\n", err)
			os.Exit(1)
		}

	case "help", "-h", "--help":
		commands.Help()

	default:
		fmt.Fprintf(os.Stderr, "Error: Unknown command '%s'\n", command)
		fmt.Fprintf(os.Stderr, "Run '%s help' to see available commands\n", os.Args[0])
		os.Exit(1)
	}

	// Exit successfully
	os.Exit(0)
}