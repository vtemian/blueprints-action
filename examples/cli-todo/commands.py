"""
CLI command implementations for todo operations.

This module provides command functions that handle user interactions
for managing todo items through a command-line interface.
"""

import sys
from datetime import datetime
from typing import List, Optional, Dict, Any

try:
    from . import app
    from . import utils
except ImportError:
    # Handle relative import issues during development/testing
    import app
    import utils


def add(args: List[str]) -> None:
    """
    Add a new todo item.
    
    Args:
        args: Command line arguments, may include --priority flag and task text
        
    Usage:
        add Buy groceries
        add --priority high Complete project report
    """
    if not args:
        print("Error: Task description is required")
        return
    
    priority = None
    task_args = args.copy()
    
    # Parse priority flag
    if '--priority' in args:
        try:
            priority_index = args.index('--priority')
            if priority_index + 1 < len(args):
                priority = args[priority_index + 1]
                # Remove priority flag and value from task args
                task_args = args[:priority_index] + args[priority_index + 2:]
            else:
                print("Error: --priority flag requires a value")
                return
        except ValueError:
            pass
    
    if not task_args:
        print("Error: Task description is required")
        return
    
    # Join remaining arguments as task text
    task_text = ' '.join(task_args)
    
    try:
        todo_id = app.add_todo(task_text, priority=priority)
        print(f"Added: #{todo_id} - {task_text}")
    except Exception as e:
        print(f"Error adding todo: {e}")


def list(args: List[str]) -> None:
    """
    Display todo items with optional filtering.
    
    Args:
        args: Command line arguments, may include --all or --done flags
        
    Usage:
        list
        list --all
        list --done
    """
    show_all = '--all' in args
    show_done_only = '--done' in args
    
    try:
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Filter todos based on flags
        filtered_todos = []
        for todo in todos:
            if show_done_only and not todo.get('done', False):
                continue
            elif not show_all and not show_done_only and todo.get('done', False):
                continue
            filtered_todos.append(todo)
        
        if not filtered_todos:
            if show_done_only:
                print("No completed todos found.")
            else:
                print("No pending todos found.")
            return
        
        # Prepare data for table formatting
        table_data = []
        headers = ['ID', 'Status', 'Task', 'Priority', 'Created']
        
        for todo in filtered_todos:
            status = '[✓]' if todo.get('done', False) else '[ ]'
            priority = todo.get('priority', 'normal')
            created = todo.get('created', 'N/A')
            
            # Format timestamp if it exists
            if isinstance(created, datetime):
                created = created.strftime('%Y-%m-%d %H:%M')
            elif isinstance(created, str) and created != 'N/A':
                try:
                    created_dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                    created = created_dt.strftime('%Y-%m-%d %H:%M')
                except (ValueError, AttributeError):
                    pass
            
            table_data.append([
                str(todo.get('id', 'N/A')),
                status,
                todo.get('text', ''),
                priority,
                created
            ])
        
        # Use utils to format and display table
        formatted_table = utils.format_table(headers, table_data)
        print(formatted_table)
        
    except Exception as e:
        print(f"Error loading todos: {e}")


def done(args: List[str]) -> None:
    """
    Mark todo items as complete.
    
    Args:
        args: Command line arguments containing todo ID(s)
        
    Usage:
        done 1
        done 1 2 3
    """
    if not args:
        print("Error: Todo ID is required")
        return
    
    try:
        todos = app.load_todos()
        todo_dict = {todo['id']: todo for todo in todos}
        updated_todos = []
        
        for arg in args:
            try:
                todo_id = int(arg)
            except ValueError:
                print(f"Error: Invalid todo ID '{arg}' - must be a number")
                continue
            
            if todo_id not in todo_dict:
                print(f"Error: Todo #{todo_id} not found")
                continue
            
            todo = todo_dict[todo_id]
            
            if todo.get('done', False):
                print(f"Todo #{todo_id} is already completed")
                continue
            
            # Mark as done and add timestamp
            todo['done'] = True
            todo['completed_at'] = datetime.now().isoformat()
            updated_todos.append(todo)
            
            print(f"Completed: #{todo_id} - {todo.get('text', '')}")
        
        if updated_todos:
            app.save_todos(todos)
            
    except Exception as e:
        print(f"Error updating todos: {e}")


def remove(args: List[str]) -> None:
    """
    Delete todo items.
    
    Args:
        args: Command line arguments containing todo ID or --done flag
        
    Usage:
        remove 1
        remove --done
    """
    if not args:
        print("Error: Todo ID or --done flag is required")
        return
    
    try:
        if '--done' in args:
            # Remove all completed todos
            todos = app.load_todos()
            removed_count = 0
            
            for todo in todos[:]:  # Create a copy to iterate over
                if todo.get('done', False):
                    app.delete_todo(todo['id'])
                    print(f"Removed: #{todo['id']} - {todo.get('text', '')}")
                    removed_count += 1
            
            if removed_count == 0:
                print("No completed todos to remove")
            else:
                print(f"Removed {removed_count} completed todo(s)")
        else:
            # Remove specific todo IDs
            todos = app.load_todos()
            todo_dict = {todo['id']: todo for todo in todos}
            
            for arg in args:
                if arg == '--done':
                    continue
                    
                try:
                    todo_id = int(arg)
                except ValueError:
                    print(f"Error: Invalid todo ID '{arg}' - must be a number")
                    continue
                
                if todo_id not in todo_dict:
                    print(f"Error: Todo #{todo_id} not found")
                    continue
                
                todo = todo_dict[todo_id]
                app.delete_todo(todo_id)
                print(f"Removed: #{todo_id} - {todo.get('text', '')}")
                
    except Exception as e:
        print(f"Error removing todos: {e}")


def help(args: List[str]) -> None:
    """
    Display usage information and command descriptions.
    
    Args:
        args: Command line arguments (unused)
    """
    help_text = """
Todo CLI - Command Usage

COMMANDS:
  add <task>              Add a new todo item
  add --priority <level> <task>  Add todo with priority (high, medium, low)
  list                    Show pending todos
  list --all              Show all todos (pending and completed)
  list --done             Show only completed todos
  done <id> [id...]       Mark todo(s) as complete
  remove <id>             Remove a specific todo
  remove --done           Remove all completed todos
  help                    Show this help message

EXAMPLES:
  todo add Buy groceries
  todo add --priority high Complete project report
  todo list
  todo list --done
  todo done 1
  todo done 1 2 3
  todo remove 1
  todo remove --done

NOTES:
  - Todo IDs are automatically assigned when items are created
  - Use 'list' to see current todo IDs
  - Priority levels: high, medium, low (default: normal)
  - Completed todos are hidden by default in 'list' command
    """
    print(help_text.strip())


# Command registry for easy lookup
COMMANDS: Dict[str, callable] = {
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
        command: The command name to execute
        args: Arguments to pass to the command
    """
    if command not in COMMANDS:
        print(f"Error: Unknown command '{command}'")
        print("Use 'help' to see available commands")
        return
    
    try:
        COMMANDS[command](args)
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
    except Exception as e:
        print(f"Unexpected error executing command '{command}': {e}")


def get_available_commands() -> List[str]:
    """
    Get list of available command names.
    
    Returns:
        List of command names
    """
    return list(COMMANDS.keys())


if __name__ == "__main__":
    # Allow module to be run directly for testing
    if len(sys.argv) < 2:
        help([])
    else:
        command = sys.argv[1]
        args = sys.argv[2:] if len(sys.argv) > 2 else []
        execute_command(command, args)