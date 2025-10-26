#!/usr/bin/env python3
"""
CLI Todo Application Entry Point

This module serves as the main entry point for the CLI Todo application.
It handles command-line argument parsing, routes commands to appropriate
handlers, and manages error handling with proper exit codes.

Usage:
    python main.py <command> [arguments]

Commands:
    add <task>      Add a new task
    list           List all tasks
    done <id>      Mark a task as completed
    remove <id>    Remove a task
    help           Show help message
"""

import sys
import commands


def main():
    """
    Main entry point for the CLI Todo application.
    
    Parses command-line arguments, routes to appropriate command handlers,
    and manages error handling with proper exit codes.
    
    Exit codes:
        0: Success
        1: Error (invalid command, missing arguments, or other errors)
    """
    try:
        # Check if any arguments were provided
        if len(sys.argv) < 2:
            commands.help()
            sys.exit(0)
        
        # Extract command and arguments
        command = sys.argv[1].lower()
        args = sys.argv[2:] if len(sys.argv) > 2 else []
        
        # Route commands to appropriate handlers
        if command == "add":
            if not args:
                print("Error: Missing task description")
                print("Usage: python main.py add <task_description>")
                sys.exit(1)
            
            # Join all arguments to form the complete task description
            task_description = " ".join(args)
            commands.add(task_description)
            
        elif command == "list":
            commands.list()
            
        elif command == "done":
            if not args:
                print("Error: Missing task ID")
                print("Usage: python main.py done <task_id>")
                sys.exit(1)
            
            try:
                task_id = int(args[0])
                commands.done(task_id)
            except ValueError:
                print("Error: Task ID must be a valid number")
                print("Usage: python main.py done <task_id>")
                sys.exit(1)
                
        elif command == "remove":
            if not args:
                print("Error: Missing task ID")
                print("Usage: python main.py remove <task_id>")
                sys.exit(1)
            
            try:
                task_id = int(args[0])
                commands.remove(task_id)
            except ValueError:
                print("Error: Task ID must be a valid number")
                print("Usage: python main.py remove <task_id>")
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
        print(f"Error: Permission denied - {e}")
        sys.exit(1)
        
    except IOError as e:
        print(f"Error: File operation failed - {e}")
        sys.exit(1)
        
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(1)
        
    except Exception as e:
        print(f"Error: An unexpected error occurred - {e}")
        print("Please try again or contact support if the problem persists")
        sys.exit(1)


if __name__ == "__main__":
    main()