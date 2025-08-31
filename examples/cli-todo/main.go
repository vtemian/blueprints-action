package main

import (
	"fmt"
	"os"

	"github.com/yourproject/todo/commands"
)

func main() {
	if len(os.Args) < 2 {
		if err := commands.Help(); err != nil {
			fmt.Fprintf(os.Stderr, "Error displaying help: %v\n", err)
			os.Exit(1)
		}
		os.Exit(0)
	}

	command := os.Args[1]
	args := os.Args[2:]

	var err error

	switch command {
	case "add":
		if len(args) == 0 {
			fmt.Fprintf(os.Stderr, "Error: 'add' command requires a task description\n")
			fmt.Fprintf(os.Stderr, "Usage: todo add <task description>\n")
			os.Exit(1)
		}
		err = commands.Add(args)

	case "list":
		err = commands.List(args)

	case "done":
		if len(args) == 0 {
			fmt.Fprintf(os.Stderr, "Error: 'done' command requires a task ID\n")
			fmt.Fprintf(os.Stderr, "Usage: todo done <task_id>\n")
			os.Exit(1)
		}
		err = commands.Done(args)

	case "remove":
		if len(args) == 0 {
			fmt.Fprintf(os.Stderr, "Error: 'remove' command requires a task ID\n")
			fmt.Fprintf(os.Stderr, "Usage: todo remove <task_id>\n")
			os.Exit(1)
		}
		err = commands.Remove(args)

	case "help":
		err = commands.Help()

	default:
		fmt.Fprintf(os.Stderr, "Error: unknown command '%s'\n\n", command)
		if helpErr := commands.Help(); helpErr != nil {
			fmt.Fprintf(os.Stderr, "Error displaying help: %v\n", helpErr)
		}
		os.Exit(1)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	os.Exit(0)
}