#!/usr/bin/env python3
"""
CLI Todo Application Main Entry Point

This module serves as the main entry point for the CLI Todo application,
handling command-line argument parsing, routing commands to appropriate
handlers, and providing comprehensive error handling.
"""

import sys
import traceback
from typing import List, Optional


def parse_arguments() -> tuple[Optional[str], List[str]]:
    """
    Parse command-line arguments and return command and arguments.
    
    Returns:
        tuple: (command, arguments) where command is the first argument
               and arguments is a list of remaining arguments
    """
    if len(sys.argv) < 2:
        return None, []
    
    command = sys.argv[1].lower()
    args = sys.argv[2:] if len(sys.argv) > 2 else []
    
    return command, args


def validate_command(command: Optional[str]) -> bool:
    """
    Validate if the provided command is supported.
    
    Args:
        command: The command to validate
        
    Returns:
        bool: True if command is valid, False otherwise
    """
    valid_commands = {'add', 'list', 'done', 'remove', 'help'}
    return command in valid_commands if command else False


def route_command(command: Optional[str], args: List[str]) -> int:
    """
    Route the command to the appropriate handler in the commands module.
    
    Args:
        command: The command to execute
        args: List of arguments for the command
        
    Returns:
        int: Exit code (0 for success, 1 for error)
    """
    try:
        # Import commands module
        try:
            import commands
        except ImportError as e:
            print(f"Error: Could not import commands module: {e}", file=sys.stderr)
            print("Please ensure the commands module is available in your Python path.", file=sys.stderr)
            return 1
        
        # Handle no command or help command
        if command is None or command == 'help':
            if hasattr(commands, 'help'):
                commands.help()
                return 0
            else:
                show_default_help()
                return 0
        
        # Validate command
        if not validate_command(command):
            print(f"Error: Unknown command '{command}'", file=sys.stderr)
            print("", file=sys.stderr)
            if hasattr(commands, 'help'):
                commands.help()
            else:
                show_default_help()
            return 1
        
        # Route to appropriate command handler
        command_handlers = {
            'add': commands.add,
            'list': commands.list,
            'done': commands.done,
            'remove': commands.remove
        }
        
        handler = command_handlers.get(command)
        if handler is None:
            print(f"Error: Command handler for '{command}' not found", file=sys.stderr)
            return 1
        
        # Check if handler exists in commands module
        if not hasattr(commands, command):
            print(f"Error: Command '{command}' is not implemented in commands module", file=sys.stderr)
            return 1
        
        # Execute the command
        try:
            # Pass arguments to the handler
            if args:
                handler(*args)
            else:
                handler()
            return 0
            
        except TypeError as e:
            # Handle incorrect number of arguments
            error_msg = str(e)
            if "required positional argument" in error_msg or "takes" in error_msg:
                print(f"Error: Invalid arguments for '{command}' command", file=sys.stderr)
                print(f"Usage: Run 'help' for command usage information", file=sys.stderr)
            else:
                print(f"Error executing '{command}': {e}", file=sys.stderr)
            return 1
            
        except ValueError as e:
            # Handle invalid argument values
            print(f"Error: Invalid argument value for '{command}': {e}", file=sys.stderr)
            return 1
            
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return 1


def handle_file_errors(func):
    """
    Decorator to handle common file I/O errors.
    
    Args:
        func: Function to wrap with error handling
        
    Returns:
        Wrapped function with error handling
    """
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except FileNotFoundError as e:
            print(f"Error: File not found - {e}", file=sys.stderr)
            return 1
        except PermissionError as e:
            print(f"Error: Permission denied - {e}", file=sys.stderr)
            return 1
        except OSError as e:
            print(f"Error: File system error - {e}", file=sys.stderr)
            return 1
    return wrapper


def show_default_help():
    """Display default help message when commands.help() is not available."""
    help_text = """
Todo CLI Application

Usage: python main.py <command> [arguments]

Available commands:
  add <task>        Add a new task to the todo list
  list              Display all tasks
  done <task_id>    Mark a task as completed
  remove <task_id>  Remove a task from the list
  help              Show this help message

Examples:
  python main.py add "Buy groceries"
  python main.py list
  python main.py done 1
  python main.py remove 2
"""
    print(help_text.strip())


@handle_file_errors
def main() -> int:
    """
    Main entry point for the CLI Todo application.
    
    Returns:
        int: Exit code (0 for success, 1 for error)
    """
    try:
        # Parse command-line arguments
        command, args = parse_arguments()
        
        # Route command to appropriate handler
        exit_code = route_command(command, args)
        
        return exit_code
        
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.", file=sys.stderr)
        return 1
        
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        # In development, you might want to show the full traceback
        # Uncomment the following lines for debugging:
        # print("Full traceback:", file=sys.stderr)
        # traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    """Entry point guard to ensure main() only runs when script is executed directly."""
    try:
        exit_code = main()
        sys.exit(exit_code)
    except SystemExit:
        # Re-raise SystemExit to allow proper exit
        raise
    except Exception as e:
        # Catch any unhandled exceptions at the top level
        print(f"Critical error: {e}", file=sys.stderr)
        sys.exit(1)