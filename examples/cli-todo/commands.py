"""
CLI command functions for todo application.

This module implements command-line interface functions for managing todo items,
including adding, listing, completing, and removing tasks.
"""

import sys
from datetime import datetime
from typing import List, Optional, Dict, Any

# Import application modules
try:
    import app
    import utils
except ImportError as e:
    print(f"Error: Required module not found: {e}")
    sys.exit(1)


def _parse_flags_and_args(args: List[str]) -> tuple[Dict[str, Any], List[str]]:
    """
    Parse command line arguments into flags and positional arguments.
    
    Args:
        args: List of command line arguments
        
    Returns:
        Tuple of (flags_dict, remaining_args)
    """
    flags = {}
    remaining_args = []
    i = 0
    
    while i < len(args):
        arg = args[i]
        if arg.startswith('--'):
            flag_name = arg[2:]
            # Check if next argument is a value for this flag
            if i + 1 < len(args) and not args[i + 1].startswith('--'):
                flags[flag_name] = args[i + 1]
                i += 2
            else:
                flags[flag_name] = True
                i += 1
        else:
            remaining_args.append(arg)
            i += 1
    
    return flags, remaining_args


def add(args: List[str]) -> None:
    """
    Add a new todo item.
    
    Args:
        args: Command line arguments containing todo text and optional --priority flag
        
    Usage:
        add Buy groceries --priority high
        add "Complete project documentation"
    """
    try:
        if not args:
            print("Error: Todo text is required")
            print("Usage: add <todo_text> [--priority low|medium|high]")
            return
        
        flags, remaining_args = _parse_flags_and_args(args)
        
        if not remaining_args:
            print("Error: Todo text cannot be empty")
            return
        
        # Join remaining arguments as todo text
        todo_text = ' '.join(remaining_args).strip()
        
        if not todo_text:
            print("Error: Todo text cannot be empty")
            return
        
        # Parse priority flag
        priority = flags.get('priority', 'medium').lower()
        valid_priorities = ['low', 'medium', 'high']
        
        if priority not in valid_priorities:
            print(f"Error: Invalid priority '{priority}'. Must be one of: {', '.join(valid_priorities)}")
            return
        
        # Add todo item
        todo_id = app.add_todo(todo_text, priority=priority)
        print(f"Added: #{todo_id} - {todo_text}")
        
    except Exception as e:
        print(f"Error adding todo: {e}")


def list(args: List[str]) -> None:
    """
    Display todo items in a formatted table.
    
    Args:
        args: Command line arguments with optional --all or --done flags
        
    Usage:
        list                # Show incomplete todos
        list --all         # Show all todos
        list --done        # Show completed todos only
    """
    try:
        flags, _ = _parse_flags_and_args(args)
        
        # Validate flag combinations
        if flags.get('all') and flags.get('done'):
            print("Error: Cannot use --all and --done flags together")
            return
        
        # Load todos
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Filter todos based on flags
        if flags.get('done'):
            filtered_todos = [todo for todo in todos if todo.get('done', False)]
            if not filtered_todos:
                print("No completed todos found.")
                return
        elif flags.get('all'):
            filtered_todos = todos
        else:
            # Default: show incomplete only
            filtered_todos = [todo for todo in todos if not todo.get('done', False)]
            if not filtered_todos:
                print("No pending todos found.")
                return
        
        # Prepare data for table formatting
        table_data = []
        for todo in filtered_todos:
            status = "[✓]" if todo.get('done', False) else "[ ]"
            priority = todo.get('priority', 'medium').upper()
            created = todo.get('created', 'Unknown')
            completed = todo.get('completed', '') if todo.get('done') else ''
            
            table_data.append({
                'ID': todo.get('id', ''),
                'Status': status,
                'Priority': priority,
                'Task': todo.get('text', ''),
                'Created': created,
                'Completed': completed
            })
        
        # Display formatted table
        print(utils.format_table(table_data))
        
    except Exception as e:
        print(f"Error listing todos: {e}")


def done(args: List[str]) -> None:
    """
    Mark one or more todo items as complete.
    
    Args:
        args: List of todo IDs to mark as complete
        
    Usage:
        done 1 3 5        # Mark todos 1, 3, and 5 as complete
        done 2            # Mark todo 2 as complete
    """
    try:
        if not args:
            print("Error: At least one todo ID is required")
            print("Usage: done <id1> [id2] [id3] ...")
            return
        
        # Parse and validate todo IDs
        todo_ids = []
        for arg in args:
            try:
                todo_id = int(arg)
                if todo_id <= 0:
                    print(f"Error: Invalid todo ID '{arg}'. ID must be a positive integer.")
                    return
                todo_ids.append(todo_id)
            except ValueError:
                print(f"Error: Invalid todo ID '{arg}'. ID must be a number.")
                return
        
        # Load current todos
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Create a mapping of ID to todo for quick lookup
        todo_map = {todo.get('id'): todo for todo in todos}
        
        completed_todos = []
        
        # Process each todo ID
        for todo_id in todo_ids:
            if todo_id not in todo_map:
                print(f"Error: Todo #{todo_id} not found.")
                continue
            
            todo = todo_map[todo_id]
            
            if todo.get('done', False):
                print(f"Todo #{todo_id} is already completed.")
                continue
            
            # Mark as done and add timestamp
            todo['done'] = True
            todo['completed'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            completed_todos.append(todo)
        
        if completed_todos:
            # Save changes (assuming app has a save method)
            try:
                app.save_todos(todos)
                for todo in completed_todos:
                    print(f"Completed: #{todo['id']} - {todo['text']}")
            except Exception as e:
                print(f"Error saving changes: {e}")
        
    except Exception as e:
        print(f"Error marking todos as done: {e}")


def remove(args: List[str]) -> None:
    """
    Delete todo items by ID or remove all completed todos.
    
    Args:
        args: Todo ID to remove or --done flag to remove all completed
        
    Usage:
        remove 1          # Remove todo with ID 1
        remove --done     # Remove all completed todos
    """
    try:
        if not args:
            print("Error: Todo ID or --done flag is required")
            print("Usage: remove <id> OR remove --done")
            return
        
        flags, remaining_args = _parse_flags_and_args(args)
        
        # Handle --done flag for batch deletion
        if flags.get('done'):
            if remaining_args:
                print("Error: Cannot specify todo ID when using --done flag")
                return
            
            todos = app.load_todos()
            completed_todos = [todo for todo in todos if todo.get('done', False)]
            
            if not completed_todos:
                print("No completed todos to remove.")
                return
            
            # Confirm batch deletion
            print(f"This will remove {len(completed_todos)} completed todo(s):")
            for todo in completed_todos:
                print(f"  #{todo['id']} - {todo['text']}")
            
            try:
                confirmation = input("Continue? (y/N): ").strip().lower()
                if confirmation not in ['y', 'yes']:
                    print("Operation cancelled.")
                    return
            except (EOFError, KeyboardInterrupt):
                print("\nOperation cancelled.")
                return
            
            # Remove completed todos
            removed_count = 0
            for todo in completed_todos:
                try:
                    app.delete_todo(todo['id'])
                    print(f"Removed: #{todo['id']} - {todo['text']}")
                    removed_count += 1
                except Exception as e:
                    print(f"Error removing todo #{todo['id']}: {e}")
            
            print(f"Removed {removed_count} completed todo(s).")
            return
        
        # Handle single todo ID removal
        if len(remaining_args) != 1:
            print("Error: Specify exactly one todo ID")
            print("Usage: remove <id> OR remove --done")
            return
        
        try:
            todo_id = int(remaining_args[0])
            if todo_id <= 0:
                print(f"Error: Invalid todo ID '{remaining_args[0]}'. ID must be a positive integer.")
                return
        except ValueError:
            print(f"Error: Invalid todo ID '{remaining_args[0]}'. ID must be a number.")
            return
        
        # Load todos to get todo text for confirmation message
        todos = app.load_todos()
        todo_to_remove = None
        
        for todo in todos:
            if todo.get('id') == todo_id:
                todo_to_remove = todo
                break
        
        if not todo_to_remove:
            print(f"Error: Todo #{todo_id} not found.")
            return
        
        # Delete the todo
        app.delete_todo(todo_id)
        print(f"Removed: #{todo_id} - {todo_to_remove['text']}")
        
    except Exception as e:
        print(f"Error removing todo: {e}")


def help(args: List[str]) -> None:
    """
    Display usage information and command examples.
    
    Args:
        args: Command line arguments (unused)
    """
    help_text = """
TODO CLI - Command Reference

COMMANDS:
  add <text> [--priority low|medium|high]
    Add a new todo item with optional priority level.
    
    Examples:
      add Buy groceries
      add "Complete project documentation" --priority high
      add Call dentist --priority low

  list [--all | --done]
    Display todo items in a formatted table.
    
    Examples:
      list              # Show incomplete todos only
      list --all        # Show all todos
      list --done       # Show completed todos only

  done <id1> [id2] [id3] ...
    Mark one or more todo items as complete.
    
    Examples:
      done 1            # Mark todo #1 as complete
      done 1 3 5        # Mark todos #1, #3, and #5 as complete

  remove <id> | remove --done
    Delete a specific todo item or all completed todos.
    
    Examples:
      remove 1          # Remove todo #1
      remove --done     # Remove all completed todos (with confirmation)

  help
    Display this help information.

NOTES:
  - Todo IDs are automatically assigned when items are created
  - Use quotes around todo text containing special characters
  - Priority levels: low, medium (default), high
  - Completed todos include timestamp information
  - Batch operations require confirmation

For more information, visit: https://github.com/your-repo/todo-cli
"""
    print(help_text.strip())


# Command registry for easy lookup
COMMANDS = {
    'add': add,
    'list': list,
    'done': done,
    'remove': remove,
    'help': help,
}


def execute_command(command: str, args: List[str]) -> None:
    """
    Execute a command with given arguments.
    
    Args:
        command: Command name to execute
        args: Arguments to pass to the command function
    """
    if command not in COMMANDS:
        print(f"Error: Unknown command '{command}'")
        print("Use 'help' to see available commands.")
        return
    
    try:
        COMMANDS[command](args)
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
    except Exception as e:
        print(f"Unexpected error executing '{command}': {e}")


if __name__ == "__main__":
    # Example usage when run directly
    if len(sys.argv) < 2:
        help([])
    else:
        cmd = sys.argv[1]
        cmd_args = sys.argv[2:]
        execute_command(cmd, cmd_args)