#!/usr/bin/env python3
"""
CLI Todo Application Entry Point

This module serves as the main entry point for the CLI Todo application,
handling command-line argument parsing, command routing, and error handling.
"""

import sys
from typing import List, NoReturn

try:
    import app
    import commands
except ImportError as e:
    print(f"Error: Failed to import required modules: {e}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    """
    Main entry point for the CLI Todo application.
    
    Parses command-line arguments, validates commands, routes to appropriate
    handlers, and manages error handling with proper exit codes.
    
    Exit codes:
        0: Success
        1: Error (invalid command, missing arguments, file errors, etc.)
    """
    # Get command-line arguments (excluding script name)
    args = sys.argv[1:]
    
    # If no arguments provided, show help
    if not args:
        try:
            commands.help()
            sys.exit(0)
        except Exception as e:
            _handle_unexpected_error(e)
    
    # Extract command and remaining arguments
    command = args[0].lower()
    command_args = args[1:]
    
    try:
        # Route commands to appropriate handlers
        if command == "add":
            _handle_add_command(command_args)
        elif command == "list":
            _handle_list_command(command_args)
        elif command == "done":
            _handle_done_command(command_args)
        elif command == "remove":
            _handle_remove_command(command_args)
        elif command in ["help", "-h", "--help"]:
            commands.help()
        else:
            _handle_invalid_command(command)
            
    except FileNotFoundError as e:
        print(f"Error: Todo file not found - {e}", file=sys.stderr)
        sys.exit(1)
    except PermissionError as e:
        print(f"Error: Permission denied - {e}", file=sys.stderr)
        sys.exit(1)
    except OSError as e:
        print(f"Error: File operation failed - {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        _handle_unexpected_error(e)
    
    # If we reach here, command executed successfully
    sys.exit(0)


def _handle_add_command(command_args: List[str]) -> None:
    """
    Handle the 'add' command with proper argument validation.
    
    Args:
        command_args: List of arguments passed to the add command
        
    Raises:
        SystemExit: If required arguments are missing
    """
    if not command_args:
        print("Error: Missing task description", file=sys.stderr)
        print("Usage: todo add <task_description>", file=sys.stderr)
        print("Example: todo add 'Buy groceries'", file=sys.stderr)
        sys.exit(1)
    
    # Join all arguments to form the task description
    task_description = " ".join(command_args)
    commands.add(task_description)


def _handle_list_command(command_args: List[str]) -> None:
    """
    Handle the 'list' command.
    
    Args:
        command_args: List of arguments passed to the list command
    """
    # List command doesn't require additional arguments
    commands.list()


def _handle_done_command(command_args: List[str]) -> None:
    """
    Handle the 'done' command with proper argument validation.
    
    Args:
        command_args: List of arguments passed to the done command
        
    Raises:
        SystemExit: If required arguments are missing or invalid
    """
    if not command_args:
        print("Error: Missing task ID", file=sys.stderr)
        print("Usage: todo done <task_id>", file=sys.stderr)
        print("Example: todo done 1", file=sys.stderr)
        sys.exit(1)
    
    try:
        task_id = int(command_args[0])
        if task_id <= 0:
            raise ValueError("Task ID must be a positive integer")
        commands.done(task_id)
    except ValueError as e:
        print(f"Error: Invalid task ID '{command_args[0]}' - {e}", file=sys.stderr)
        print("Task ID must be a positive integer", file=sys.stderr)
        sys.exit(1)


def _handle_remove_command(command_args: List[str]) -> None:
    """
    Handle the 'remove' command with proper argument validation.
    
    Args:
        command_args: List of arguments passed to the remove command
        
    Raises:
        SystemExit: If required arguments are missing or invalid
    """
    if not command_args:
        print("Error: Missing task ID", file=sys.stderr)
        print("Usage: todo remove <task_id>", file=sys.stderr)
        print("Example: todo remove 1", file=sys.stderr)
        sys.exit(1)
    
    try:
        task_id = int(command_args[0])
        if task_id <= 0:
            raise ValueError("Task ID must be a positive integer")
        commands.remove(task_id)
    except ValueError as e:
        print(f"Error: Invalid task ID '{command_args[0]}' - {e}", file=sys.stderr)
        print("Task ID must be a positive integer", file=sys.stderr)
        sys.exit(1)


def _handle_invalid_command(command: str) -> NoReturn:
    """
    Handle invalid commands by showing error message and help.
    
    Args:
        command: The invalid command that was entered
        
    Raises:
        SystemExit: Always exits with code 1
    """
    print(f"Error: Unknown command '{command}'", file=sys.stderr)
    print("\nAvailable commands:", file=sys.stderr)
    try:
        commands.help()
    except Exception:
        # Fallback help if commands.help() fails
        print("  add <task>     - Add a new task", file=sys.stderr)
        print("  list           - List all tasks", file=sys.stderr)
        print("  done <id>      - Mark task as done", file=sys.stderr)
        print("  remove <id>    - Remove a task", file=sys.stderr)
        print("  help           - Show this help message", file=sys.stderr)
    sys.exit(1)


def _handle_unexpected_error(error: Exception) -> NoReturn:
    """
    Handle unexpected errors with generic error message.
    
    Args:
        error: The unexpected exception that occurred
        
    Raises:
        SystemExit: Always exits with code 1
    """
    print(f"Error: An unexpected error occurred - {error}", file=sys.stderr)
    print("Please try again or contact support if the problem persists.", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()