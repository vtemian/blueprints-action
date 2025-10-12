#!/usr/bin/env python3
"""
Todo CLI Application - Main Entry Point

A command-line todo application that allows users to manage their tasks
through simple commands like add, list, done, and remove.
"""

import sys
from typing import List, Optional

try:
    import app
    import commands
except ImportError as e:
    print(f"Error: Failed to import required modules: {e}", file=sys.stderr)
    print("Please ensure all application modules are available.", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    """
    Main entry point for the Todo CLI application.
    
    Parses command line arguments and routes to appropriate command handlers.
    Handles various error conditions and provides appropriate exit codes.
    """
    # Parse command line arguments
    args: List[str] = sys.argv[1:]
    command: Optional[str] = args[0] if args else None
    command_args: List[str] = args[1:] if len(args) > 1 else []
    
    # Command routing dictionary
    command_map = {
        "add": commands.add,
        "list": commands.list,
        "done": commands.done,
        "remove": commands.remove,
        "help": commands.help
    }
    
    try:
        # Handle no command or help command
        if command is None or command == "help":
            commands.help()
            sys.exit(0)
        
        # Check if command exists
        if command not in command_map:
            print("Invalid command", file=sys.stderr)
            commands.help()
            sys.exit(1)
        
        # Execute the command with arguments
        command_function = command_map[command]
        
        # Handle commands that require arguments
        if command in ["add", "done", "remove"] and not command_args:
            print(f"Usage: {sys.argv[0]} {command} <arguments>", file=sys.stderr)
            print(f"Error: '{command}' command requires additional arguments", file=sys.stderr)
            sys.exit(1)
        
        # Execute the command
        if command_args:
            command_function(*command_args)
        else:
            command_function()
        
        sys.exit(0)
    
    except ImportError as e:
        print(f"Error: Missing required dependencies: {e}", file=sys.stderr)
        sys.exit(1)
    
    except FileNotFoundError as e:
        print(f"Error: File not found: {e}", file=sys.stderr)
        print("The todo data file may not exist or is inaccessible.", file=sys.stderr)
        sys.exit(1)
    
    except PermissionError as e:
        print(f"Error: Permission denied: {e}", file=sys.stderr)
        print("Check file permissions for the todo data file.", file=sys.stderr)
        sys.exit(1)
    
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.", file=sys.stderr)
        sys.exit(1)
    
    except ValueError as e:
        print(f"Error: Invalid input: {e}", file=sys.stderr)
        sys.exit(1)
    
    except Exception as e:
        print(f"Error: An unexpected error occurred: {e}", file=sys.stderr)
        print("Please try again or contact support if the problem persists.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()