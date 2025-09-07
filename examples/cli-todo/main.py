#!/usr/bin/env python3
"""
Todo Application CLI Entry Point

This module serves as the command-line interface entry point for a todo application.
It handles argument parsing, command routing, and error management with proper
exit codes and user-friendly error messages.

Usage:
    python main.py <command> [arguments...]

Commands:
    add <task>      Add a new task to the todo list
    list           Display all tasks
    done <id>      Mark a task as completed
    remove <id>    Remove a task from the list
    help           Show help information

Exit Codes:
    0 - Success
    1 - Error (invalid command, missing arguments, file errors, etc.)
"""

import sys
import commands


def main():
    """
    Main entry point for the todo CLI application.
    
    Parses command-line arguments, validates input, routes commands to
    appropriate handlers, and manages error handling with proper exit codes.
    """
    try:
        # Get command-line arguments (excluding script name)
        args = sys.argv[1:]
        
        # Handle case with no arguments - show help
        if not args:
            commands.help()
            sys.exit(0)
        
        # Extract command and remaining arguments
        command = args[0].lower()
        command_args = args[1:]
        
        # Route commands to appropriate handlers
        if command == "add":
            if not command_args:
                print("Error: 'add' command requires a task description.", file=sys.stderr)
                print("Usage: python main.py add <task>", file=sys.stderr)
                sys.exit(1)
            
            # Join all arguments to form the task description
            task_description = " ".join(command_args)
            commands.add(task_description)
            
        elif command == "list":
            commands.list()
            
        elif command == "done":
            if not command_args:
                print("Error: 'done' command requires a task ID.", file=sys.stderr)
                print("Usage: python main.py done <id>", file=sys.stderr)
                sys.exit(1)
            
            if len(command_args) > 1:
                print("Error: 'done' command accepts only one task ID.", file=sys.stderr)
                print("Usage: python main.py done <id>", file=sys.stderr)
                sys.exit(1)
            
            try:
                task_id = int(command_args[0])
                commands.done(task_id)
            except ValueError:
                print(f"Error: Task ID must be a number, got '{command_args[0]}'.", file=sys.stderr)
                sys.exit(1)
                
        elif command == "remove":
            if not command_args:
                print("Error: 'remove' command requires a task ID.", file=sys.stderr)
                print("Usage: python main.py remove <id>", file=sys.stderr)
                sys.exit(1)
            
            if len(command_args) > 1:
                print("Error: 'remove' command accepts only one task ID.", file=sys.stderr)
                print("Usage: python main.py remove <id>", file=sys.stderr)
                sys.exit(1)
            
            try:
                task_id = int(command_args[0])
                commands.remove(task_id)
            except ValueError:
                print(f"Error: Task ID must be a number, got '{command_args[0]}'.", file=sys.stderr)
                sys.exit(1)
                
        elif command == "help":
            commands.help()
            
        else:
            print(f"Error: Unknown command '{command}'.", file=sys.stderr)
            print("Run 'python main.py help' for available commands.", file=sys.stderr)
            sys.exit(1)
        
        # If we reach here, command executed successfully
        sys.exit(0)
        
    except FileNotFoundError as e:
        print(f"Error: Could not access todo file - {e}", file=sys.stderr)
        sys.exit(1)
        
    except PermissionError as e:
        print(f"Error: Permission denied accessing todo file - {e}", file=sys.stderr)
        sys.exit(1)
        
    except OSError as e:
        print(f"Error: File system error - {e}", file=sys.stderr)
        sys.exit(1)
        
    except ImportError as e:
        print(f"Error: Could not import required modules - {e}", file=sys.stderr)
        print("Please ensure all required dependencies are installed.", file=sys.stderr)
        sys.exit(1)
        
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.", file=sys.stderr)
        sys.exit(1)
        
    except Exception as e:
        print(f"Error: An unexpected error occurred - {e}", file=sys.stderr)
        print("Please try again or contact support if the problem persists.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()