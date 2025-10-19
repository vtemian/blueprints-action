#!/usr/bin/env python3
"""
Todo CLI Application Entry Point

A simple command-line todo application that supports adding, listing,
completing, and removing todo items.
"""

import sys
import app
import commands


def main():
    """Main entry point for the Todo CLI application."""
    try:
        # Handle case where no arguments are provided
        if len(sys.argv) < 2:
            commands.help()
            sys.exit(0)
        
        # Get the command (case-insensitive)
        command = sys.argv[1].lower()
        args = sys.argv[2:]  # Remaining arguments
        
        # Route commands to appropriate handlers
        if command == "add":
            if not args:
                print("Error: 'add' command requires a todo item description.")
                print("Usage: python main.py add <description>")
                sys.exit(1)
            # Join all arguments to support multi-word descriptions
            description = " ".join(args)
            commands.add(description)
            
        elif command == "list":
            commands.list()
            
        elif command == "done":
            if not args:
                print("Error: 'done' command requires a todo item ID.")
                print("Usage: python main.py done <id>")
                sys.exit(1)
            try:
                todo_id = int(args[0])
                commands.done(todo_id)
            except ValueError:
                print("Error: Todo ID must be a valid number.")
                print("Usage: python main.py done <id>")
                sys.exit(1)
                
        elif command == "remove":
            if not args:
                print("Error: 'remove' command requires a todo item ID.")
                print("Usage: python main.py remove <id>")
                sys.exit(1)
            try:
                todo_id = int(args[0])
                commands.remove(todo_id)
            except ValueError:
                print("Error: Todo ID must be a valid number.")
                print("Usage: python main.py remove <id>")
                sys.exit(1)
                
        elif command == "help":
            commands.help()
            
        else:
            print(f"Error: Unknown command '{command}'")
            print()
            commands.help()
            sys.exit(1)
            
        # If we reach here, command executed successfully
        sys.exit(0)
        
    except FileNotFoundError as e:
        print(f"Error: Could not access todo file - {e}")
        sys.exit(1)
        
    except PermissionError as e:
        print(f"Error: Permission denied accessing todo file - {e}")
        sys.exit(1)
        
    except IOError as e:
        print(f"Error: File I/O error - {e}")
        sys.exit(1)
        
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(1)
        
    except Exception as e:
        print(f"Error: An unexpected error occurred - {e}")
        print("Please try again or use 'help' for usage information.")
        sys.exit(1)


if __name__ == "__main__":
    main()