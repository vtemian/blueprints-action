#!/usr/bin/env python3
"""
Todo CLI Application Entry Point

This module serves as the main entry point for a command-line todo application.
It handles command routing, argument parsing, and error handling for all todo operations.
"""

import sys
import commands


def main():
    """
    Main entry point for the Todo CLI application.
    
    Parses command-line arguments and routes to appropriate command functions.
    Handles all errors and ensures proper exit codes are returned.
    """
    try:
        # Handle case where no arguments are provided
        if len(sys.argv) < 2:
            commands.help()
            sys.exit(0)
        
        # Extract command and remaining arguments
        command = sys.argv[1].lower()
        args = sys.argv[2:] if len(sys.argv) > 2 else []
        
        # Route commands to appropriate functions
        if command == "add":
            try:
                commands.add(args)
                sys.exit(0)
            except IndexError:
                print("Error: 'add' command requires a task description")
                print("Usage: python main.py add <task_description>")
                sys.exit(1)
            except Exception as e:
                print(f"Error adding task: {e}")
                sys.exit(1)
                
        elif command == "list":
            try:
                commands.list(args)
                sys.exit(0)
            except Exception as e:
                print(f"Error listing tasks: {e}")
                sys.exit(1)
                
        elif command == "done":
            try:
                commands.done(args)
                sys.exit(0)
            except IndexError:
                print("Error: 'done' command requires a task ID")
                print("Usage: python main.py done <task_id>")
                sys.exit(1)
            except Exception as e:
                print(f"Error marking task as done: {e}")
                sys.exit(1)
                
        elif command == "remove":
            try:
                commands.remove(args)
                sys.exit(0)
            except IndexError:
                print("Error: 'remove' command requires a task ID")
                print("Usage: python main.py remove <task_id>")
                sys.exit(1)
            except Exception as e:
                print(f"Error removing task: {e}")
                sys.exit(1)
                
        elif command == "help":
            try:
                commands.help()
                sys.exit(0)
            except Exception as e:
                print(f"Error displaying help: {e}")
                sys.exit(1)
                
        else:
            # Handle unrecognized commands
            print(f"Error: Unknown command '{command}'")
            print("Run 'python main.py help' for available commands")
            try:
                commands.help()
            except Exception:
                print("\nAvailable commands: add, list, done, remove, help")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(1)
        
    except ImportError as e:
        print(f"Error: Could not import commands module: {e}")
        print("Please ensure the commands.py file exists and is accessible")
        sys.exit(1)
        
    except FileNotFoundError as e:
        print(f"Error: Required file not found: {e}")
        print("Please check that all necessary files are present")
        sys.exit(1)
        
    except PermissionError as e:
        print(f"Error: Permission denied: {e}")
        print("Please check file permissions and try again")
        sys.exit(1)
        
    except OSError as e:
        print(f"Error: System error occurred: {e}")
        print("Please check your system configuration and try again")
        sys.exit(1)
        
    except Exception as e:
        print(f"Unexpected error occurred: {e}")
        print("Please report this issue if it persists")
        sys.exit(1)


if __name__ == "__main__":
    main()