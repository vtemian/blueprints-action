#!/usr/bin/env python3
"""
CLI Todo Application Entry Point

This module serves as the main entry point for the CLI Todo application.
It handles command-line argument parsing, routes commands to appropriate
handlers, and manages error handling with proper exit codes.
"""

import sys
from app import commands


def main():
    """
    Main entry point for the CLI Todo application.
    
    Parses command-line arguments and routes them to appropriate command handlers.
    Handles errors gracefully and exits with proper status codes.
    """
    try:
        # Get command from command line arguments
        try:
            command = sys.argv[1].lower() if len(sys.argv) > 1 else "help"
        except IndexError:
            command = "help"
        
        # Command routing dictionary
        command_handlers = {
            "add": commands.add,
            "list": commands.list,
            "done": commands.done,
            "remove": commands.remove,
            "help": commands.help,
            "--help": commands.help,
            "-h": commands.help
        }
        
        # Route command to appropriate handler
        if command in command_handlers:
            try:
                command_handlers[command]()
                sys.exit(0)
            except IndexError:
                # Handle missing required arguments
                print(f"Error: Missing required arguments for '{command}' command.")
                print(f"Use 'todo help' for usage information.")
                sys.exit(1)
            except ValueError as e:
                # Handle invalid argument values
                print(f"Error: {e}")
                sys.exit(1)
        else:
            # Handle unrecognized commands
            print(f"Error: Unrecognized command '{command}'")
            print("Use 'todo help' for available commands.")
            sys.exit(1)
            
    except FileNotFoundError as e:
        # Handle file I/O errors - todo file not found
        print(f"Error: Todo file not found - {e}")
        sys.exit(1)
    except PermissionError as e:
        # Handle file permission errors
        print(f"Error: Permission denied - {e}")
        sys.exit(1)
    except IOError as e:
        # Handle other I/O related errors
        print(f"Error: File operation failed - {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        # Handle Ctrl+C gracefully
        print("\nOperation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        # Handle any unexpected exceptions
        print(f"Error: An unexpected error occurred - {e}")
        print("Please try again or contact support if the problem persists.")
        sys.exit(1)


if __name__ == "__main__":
    main()