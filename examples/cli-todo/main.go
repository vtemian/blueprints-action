package main

import (
	"fmt"
	"log"
	"os"

	"./app"
	"./commands"
)

// main is the entry point for the CLI Todo application.
// It parses command-line arguments and routes them to appropriate handlers.
func main() {
	// Ensure we have at least the program name in os.Args
	if len(os.Args) < 1 {
		log.Fatal("Error: Unable to determine program name")
	}

	// Initialize the application
	if err := app.Init(); err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing application: %v\n", err)
		os.Exit(1)
	}

	// Determine the command to execute
	var command string
	if len(os.Args) < 2 {
		command = "help"
	} else {
		command = os.Args[1]
	}

	// Route commands to their respective handlers
	switch command {
	case "add":
		if err := commands.Add(os.Args[2:]); err != nil {
			fmt.Fprintf(os.Stderr, "Error adding todo: %v\n", err)
			os.Exit(1)
		}

	case "list":
		if err := commands.List(os.Args[2:]); err != nil {
			fmt.Fprintf(os.Stderr, "Error listing todos: %v\n", err)
			os.Exit(1)
		}

	case "done":
		if err := commands.Done(os.Args[2:]); err != nil {
			fmt.Fprintf(os.Stderr, "Error marking todo as done: %v\n", err)
			os.Exit(1)
		}

	case "remove":
		if err := commands.Remove(os.Args[2:]); err != nil {
			fmt.Fprintf(os.Stderr, "Error removing todo: %v\n", err)
			os.Exit(1)
		}

	case "help":
		if err := commands.Help(os.Args[2:]); err != nil {
			fmt.Fprintf(os.Stderr, "Error displaying help: %v\n", err)
			os.Exit(1)
		}

	default:
		// Handle invalid commands
		fmt.Fprintf(os.Stderr, "Error: Unknown command '%s'\n", command)
		if err := commands.Help([]string{}); err != nil {
			fmt.Fprintf(os.Stderr, "Error displaying help: %v\n", err)
		}
		os.Exit(1)
	}

	// Successful execution
	os.Exit(0)
}