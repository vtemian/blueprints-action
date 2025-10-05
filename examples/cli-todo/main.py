#!/usr/bin/env python3
"""
Todo CLI Application Entry Point

A command-line interface for managing todo items. This module serves as the main
entry point and handles command routing, argument parsing, and error handling.

Usage:
    python main.py add "Task description"
    python main.py list
    python main.py done <task_id>
    python main.py remove <task_id>
    python main.py help
"""

import sys
import os


def route_command(command, args):
    """
    Route commands to appropriate handlers in the commands module.
    
    Args:
        command (str): The command to execute
        args (list): Additional arguments for the command
        
    Returns:
        int: Exit code (0 for success, 1 for error)
    """
    try:
        # Import commands module with error handling
        try:
            import commands
        except ImportError as e:
            print(f"Error: Could not import commands module: {e}", file=sys.stderr)
            print("Please ensure the commands.py file exists in the same directory.", file=sys.stderr)
            return 1
        
        # Normalize command to lowercase for case-insensitive matching
        command = command.lower().strip()
        
        # Route commands to appropriate handlers
        if command == "add":
            if not args:
                print("Error: 'add' command requires a task description.", file=sys.stderr)
                print("Usage: python main.py add \"Task description\"", file=sys.stderr)
                return 1
            # Join all arguments to support multi-word descriptions
            task_description = " ".join(args)
            return commands.add(task_description)
            
        elif command == "list":
            return commands.list()
            
        elif command == "done":
            if not args:
                print("Error: 'done' command requires a task ID.", file=sys.stderr)
                print("Usage: python main.py done <task_id>", file=sys.stderr)
                return 1
            try:
                task_id = int(args[0])
                return commands.done(task_id)
            except ValueError:
                print(f"Error: Invalid task ID '{args[0]}'. Task ID must be a number.", file=sys.stderr)
                print("Usage: python main.py done <task_id>", file=sys.stderr)
                return 1
                
        elif command == "remove":
            if not args:
                print("Error: 'remove' command requires a task ID.", file=sys.stderr)
                print("Usage: python main.py remove <task_id>", file=sys.stderr)
                return 1
            try:
                task_id = int(args[0])
                return commands.remove(task_id)
            except ValueError:
                print(f"Error: Invalid task ID '{args[0]}'. Task ID must be a number.", file=sys.stderr)
                print("Usage: python main.py remove <task_id>", file=sys.stderr)
                return 1
                
        elif command == "help":
            return commands.help()
            
        else:
            print(f"Error: Unknown command '{command}'.", file=sys.stderr)
            print("Run 'python main.py help' for available commands.", file=sys.stderr)
            return 1
            
    except AttributeError as e:
        print(f"Error: Command handler not found: {e}", file=sys.stderr)
        print("Please ensure the commands module has all required functions.", file=sys.stderr)
        return 1
    except FileNotFoundError as e:
        print(f"Error: Todo file not found or cannot be created: {e}", file=sys.stderr)
        print("Please check file permissions and disk space.", file=sys.stderr)
        return 1
    except PermissionError as e:
        print(f"Error: Permission denied accessing todo file: {e}", file=sys.stderr)
        print("Please check file permissions.", file=sys.stderr)
        return 1
    except OSError as e:
        print(f"Error: File system error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: An unexpected error occurred: {e}", file=sys.stderr)
        print("Please try again or contact support if the problem persists.", file=sys.stderr)
        return 1


def main():
    """
    Main entry point for the Todo CLI application.
    
    Parses command-line arguments and routes them to appropriate command handlers.
    Implements comprehensive error handling and ensures proper exit codes.
    """
    try:
        # Get command line arguments, excluding the script name
        args = sys.argv[1:]
        
        # Handle case when no arguments are provided
        if not args:
            print("No command provided. Showing help:", file=sys.stderr)
            try:
                import commands
                exit_code = commands.help()
                sys.exit(exit_code)
            except ImportError:
                print("Error: Could not import commands module.", file=sys.stderr)
                print("Please ensure the commands.py file exists.", file=sys.stderr)
                sys.exit(1)
        
        # Extract command and remaining arguments
        command = args[0]
        command_args = args[1:] if len(args) > 1 else []
        
        # Route the command and get exit code
        exit_code = route_command(command, command_args)
        
        # Exit with the appropriate code
        sys.exit(exit_code)
        
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()