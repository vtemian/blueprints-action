package main

import (
	"fmt"
	"os"
	"strings"

	"app"
	"commands"
)

func main() {
	// Ensure proper cleanup and error handling
	defer func() {
		if r := recover(); r != nil {
			fmt.Fprintf(os.Stderr, "Error: Application panic: %v\n", r)
			os.Exit(1)
		}
	}()

	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	// Parse command-line arguments, skipping program name
	args := os.Args[1:]

	// Handle empty arguments - show help and exit successfully
	if len(args) == 0 {
		if err := safeCommandCall(commands.Help); err != nil {
			return fmt.Errorf("failed to display help: %w", err)
		}
		return nil
	}

	// Get the command (first argument) and convert to lowercase for case-insensitive comparison
	command := strings.ToLower(strings.TrimSpace(args[0]))

	// Route commands to appropriate handlers
	switch command {
	case "add":
		if err := safeCommandCall(commands.Add); err != nil {
			return fmt.Errorf("add command failed: %w", err)
		}

	case "list":
		if err := safeCommandCall(commands.List); err != nil {
			return fmt.Errorf("list command failed: %w", err)
		}

	case "done":
		if err := safeCommandCall(commands.Done); err != nil {
			return fmt.Errorf("done command failed: %w", err)
		}

	case "remove":
		if err := safeCommandCall(commands.Remove); err != nil {
			return fmt.Errorf("remove command failed: %w", err)
		}

	case "help":
		if err := safeCommandCall(commands.Help); err != nil {
			return fmt.Errorf("failed to display help: %w", err)
		}

	default:
		// Invalid command - show error, display help, and return error
		fmt.Fprintf(os.Stderr, "Error: Unknown command '%s'\n", args[0])
		if err := safeCommandCall(commands.Help); err != nil {
			return fmt.Errorf("unknown command '%s' and failed to display help: %w", args[0], err)
		}
		return fmt.Errorf("unknown command: %s", args[0])
	}

	return nil
}

// safeCommandCall wraps command function calls with panic recovery
func safeCommandCall(cmdFunc func()) error {
	defer func() {
		if r := recover(); r != nil {
			// Convert panic to error - this will be handled by the caller
			panic(fmt.Sprintf("command execution panic: %v", r))
		}
	}()

	// Execute the command function
	cmdFunc()
	return nil
}