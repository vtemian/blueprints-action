#!/usr/bin/env python3
"""
CLI Todo Application - Main Entry Point

This module serves as the command-line interface for the Todo application,
handling argument parsing, command routing, and error management.
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
    
    Parses command-line arguments, routes commands to appropriate handlers,
    and manages error handling with proper exit codes.
    
    Exit codes:
        0: Success
        1: Error (invalid command, missing arguments, file I/O issues, etc.)
    """
    try:
        # Parse command-line arguments
        args = sys.argv[1:] if len(sys.argv) > 1 else []
        
        # Handle empty arguments - show help
        if not args:
            commands.help()
            sys.exit(0)
        
        # Extract command and arguments
        command = args[0].lower().strip()
        command_args = args[1:] if len(args) > 1 else []
        
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
            
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.", file=sys.stderr)
        sys.exit(1)
    except (OSError, IOError) as e:
        print(f"File I/O error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        print("Please try again or use 'help' for usage information.", file=sys.stderr)
        sys.exit(1)


def _handle_add_command(args: List[str]) -> None:
    """Handle the 'add' command with proper argument validation."""
    if not args:
        print("Error: Missing task description.", file=sys.stderr)
        print("Usage: todo add <task_description>", file=sys.stderr)
        sys.exit(1)
    
    # Join all arguments to form the task description
    task_description = " ".join(args).strip()
    if not task_description:
        print("Error: Task description cannot be empty.", file=sys.stderr)
        sys.exit(1)
    
    commands.add(task_description)


def _handle_list_command(args: List[str]) -> None:
    """Handle the 'list' command."""
    # List command doesn't require arguments, but we can pass them if provided
    commands.list(*args)


def _handle_done_command(args: List[str]) -> None:
    """Handle the 'done' command with proper argument validation."""
    if not args:
        print("Error: Missing task ID.", file=sys.stderr)
        print("Usage: todo done <task_id>", file=sys.stderr)
        sys.exit(1)
    
    try:
        task_id = int(args[0])
        if task_id <= 0:
            raise ValueError("Task ID must be a positive integer")
        commands.done(task_id)
    except ValueError as e:
        print(f"Error: Invalid task ID '{args[0]}'. {e}", file=sys.stderr)
        print("Usage: todo done <task_id>", file=sys.stderr)
        sys.exit(1)


def _handle_remove_command(args: List[str]) -> None:
    """Handle the 'remove' command with proper argument validation."""
    if not args:
        print("Error: Missing task ID.", file=sys.stderr)
        print("Usage: todo remove <task_id>", file=sys.stderr)
        sys.exit(1)
    
    try:
        task_id = int(args[0])
        if task_id <= 0:
            raise ValueError("Task ID must be a positive integer")
        commands.remove(task_id)
    except ValueError as e:
        print(f"Error: Invalid task ID '{args[0]}'. {e}", file=sys.stderr)
        print("Usage: todo remove <task_id>", file=sys.stderr)
        sys.exit(1)


def _handle_invalid_command(command: str) -> NoReturn:
    """Handle invalid/unrecognized commands."""
    print(f"Error: Unknown command '{command}'", file=sys.stderr)
    print("", file=sys.stderr)
    
    try:
        commands.help()
    except Exception:
        # Fallback help message if commands.help() fails
        print("Available commands:", file=sys.stderr)
        print("  add <task>     Add a new task", file=sys.stderr)
        print("  list           List all tasks", file=sys.stderr)
        print("  done <id>      Mark task as done", file=sys.stderr)
        print("  remove <id>    Remove a task", file=sys.stderr)
        print("  help           Show this help message", file=sys.stderr)
    
    sys.exit(1)


if __name__ == "__main__":
    main()