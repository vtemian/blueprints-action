#!/usr/bin/env python3
"""
Todo CLI Application Entry Point

This module serves as the main entry point for the Todo CLI application.
It handles command line argument parsing, command routing, and error handling.

Usage:
    python main.py <command> [arguments...]

Commands:
    add     - Add a new todo item
    list    - List all todo items
    done    - Mark a todo item as completed
    remove  - Remove a todo item
    help    - Show help information
"""

import sys
from typing import List, Optional


def main() -> None:
    """
    Main entry point for the Todo CLI application.
    
    Parses command line arguments, routes to appropriate command functions,
    and handles all errors gracefully with proper exit codes.
    """
    try:
        # Import local modules with error handling
        try:
            import app
            import commands
        except ImportError as e:
            print(f"Error: Failed to import required modules: {e}", file=sys.stderr)
            print("Please ensure all required modules are available.", file=sys.stderr)
            sys.exit(1)
        
        # Parse command line arguments
        args = sys.argv[1:]  # Exclude script name
        
        # Handle case where no arguments are provided
        if not args:
            try:
                commands.help()
                sys.exit(0)
            except Exception as e:
                print(f"Error displaying help: {e}", file=sys.stderr)
                sys.exit(1)
        
        # Extract command and remaining arguments
        command = args[0].lower() if args else ""
        command_args = args[1:] if len(args) > 1 else []
        
        # Route commands to appropriate functions
        try:
            if command == "add":
                commands.add(*command_args)
            elif command == "list":
                commands.list(*command_args)
            elif command == "done":
                commands.done(*command_args)
            elif command == "remove":
                commands.remove(*command_args)
            elif command == "help":
                commands.help(*command_args)
            else:
                # Invalid command - show help and exit with error
                print(f"Error: Unknown command '{command}'", file=sys.stderr)
                print("", file=sys.stderr)
                try:
                    commands.help()
                except Exception:
                    print("Available commands: add, list, done, remove, help", file=sys.stderr)
                sys.exit(1)
                
        except TypeError as e:
            # Handle incorrect number of arguments passed to command functions
            if "takes" in str(e) and "positional argument" in str(e):
                print(f"Error: Invalid number of arguments for command '{command}'", file=sys.stderr)
                print(f"Use 'python {sys.argv[0]} help' for usage information.", file=sys.stderr)
            else:
                print(f"Error executing command '{command}': {e}", file=sys.stderr)
            sys.exit(1)
            
        except FileNotFoundError as e:
            # Handle missing todo data files or configuration files
            print(f"Error: Required file not found: {e}", file=sys.stderr)
            print("The todo data file may not exist or may have been moved.", file=sys.stderr)
            sys.exit(1)
            
        except PermissionError as e:
            # Handle file permission issues
            print(f"Error: Permission denied: {e}", file=sys.stderr)
            print("Please check file permissions for the todo data directory.", file=sys.stderr)
            sys.exit(1)
            
        except KeyboardInterrupt:
            # Handle Ctrl+C gracefully
            print("\nOperation cancelled by user.", file=sys.stderr)
            sys.exit(1)
            
        except Exception as e:
            # Handle any other unexpected errors from command functions
            print(f"Error: An unexpected error occurred while executing '{command}': {e}", file=sys.stderr)
            print("Please try again or use 'help' command for usage information.", file=sys.stderr)
            sys.exit(1)
    
    except IndexError:
        # This should not occur given our argument parsing logic, but included for safety
        print("Error: Invalid argument parsing.", file=sys.stderr)
        sys.exit(1)
        
    except Exception as e:
        # Catch-all for any other unexpected errors in main execution
        print(f"Fatal error: {e}", file=sys.stderr)
        sys.exit(1)
    
    # If we reach here, command executed successfully
    sys.exit(0)


def validate_environment() -> bool:
    """
    Validate that the application environment is properly set up.
    
    Returns:
        bool: True if environment is valid, False otherwise
    """
    try:
        # Check if required modules can be imported
        import app
        import commands
        return True
    except ImportError:
        return False


def print_startup_error(message: str) -> None:
    """
    Print a formatted startup error message to stderr.
    
    Args:
        message: The error message to display
    """
    print("=" * 50, file=sys.stderr)
    print("TODO CLI APPLICATION - STARTUP ERROR", file=sys.stderr)
    print("=" * 50, file=sys.stderr)
    print(f"Error: {message}", file=sys.stderr)
    print("", file=sys.stderr)
    print("Please ensure all required files are present:", file=sys.stderr)
    print("  - app.py", file=sys.stderr)
    print("  - commands.py", file=sys.stderr)
    print("=" * 50, file=sys.stderr)


if __name__ == "__main__":
    # Validate environment before starting
    if not validate_environment():
        print_startup_error("Required modules (app.py, commands.py) could not be imported.")
        sys.exit(1)
    
    # Execute main application
    main()