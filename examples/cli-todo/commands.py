"""
CLI command implementations for todo application.

This module contains all command functions that handle user interactions
through the command-line interface. Each function processes arguments
and delegates business logic to the app module.
"""

import app
import utils
from datetime import datetime
from typing import List, Optional


def add(args: List[str]) -> None:
    """
    Add a new todo item with optional priority.
    
    Args:
        args: Command line arguments containing todo description and optional --priority flag
        
    Usage:
        add Buy groceries --priority high
        add Complete project report
    """
    if not args:
        print("Error: Please provide a todo description")
        return
    
    try:
        # Parse priority flag if present
        priority = None
        todo_text_parts = []
        
        i = 0
        while i < len(args):
            if args[i] == '--priority' and i + 1 < len(args):
                priority = args[i + 1]
                i += 2  # Skip both --priority and its value
            else:
                todo_text_parts.append(args[i])
                i += 1
        
        # Join remaining arguments as todo description
        description = ' '.join(todo_text_parts).strip()
        
        if not description:
            print("Error: Todo description cannot be empty")
            return
        
        # Add todo through app module
        todo_id = app.add_todo(description, priority=priority)
        
        # Display confirmation
        priority_text = f" (Priority: {priority})" if priority else ""
        print(f"Added: #{todo_id} - {description}{priority_text}")
        
    except Exception as e:
        print(f"Error adding todo: {str(e)}")


def list(args: List[str]) -> None:
    """
    Display todo items with optional filtering.
    
    Args:
        args: Command line arguments containing optional --all or --done flags
        
    Usage:
        list
        list --all
        list --done
    """
    try:
        # Parse flags
        show_all = '--all' in args
        show_done = '--done' in args
        
        # Load todos
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Filter todos based on flags
        filtered_todos = []
        for todo in todos:
            if show_all:
                filtered_todos.append(todo)
            elif show_done and todo.get('done', False):
                filtered_todos.append(todo)
            elif not show_done and not todo.get('done', False):
                filtered_todos.append(todo)
        
        if not filtered_todos:
            status_text = "completed" if show_done else "pending"
            print(f"No {status_text} todos found.")
            return
        
        # Prepare data for table formatting
        table_data = []
        headers = ['Status', 'ID', 'Description', 'Priority', 'Created']
        
        for todo in filtered_todos:
            status = '[✓]' if todo.get('done', False) else '[ ]'
            todo_id = str(todo.get('id', 'N/A'))
            description = todo.get('description', 'No description')
            priority = todo.get('priority', 'None')
            created = todo.get('created', 'Unknown')
            
            # Add completion info if done
            if todo.get('done', False) and todo.get('completed_at'):
                created += f" (Completed: {todo['completed_at']})"
            
            table_data.append([status, todo_id, description, priority, created])
        
        # Format and display table
        formatted_table = utils.format_table(headers, table_data)
        print(formatted_table)
        
        # Show summary
        total_count = len(filtered_todos)
        filter_text = ""
        if show_all:
            filter_text = " (showing all)"
        elif show_done:
            filter_text = " (showing completed)"
        else:
            filter_text = " (showing pending)"
            
        print(f"\nTotal: {total_count} todo(s){filter_text}")
        
    except Exception as e:
        print(f"Error listing todos: {str(e)}")


def done(args: List[str]) -> None:
    """
    Mark one or more todos as completed.
    
    Args:
        args: Command line arguments containing todo ID(s)
        
    Usage:
        done 1
        done 1 3 5
    """
    if not args:
        print("Error: Please provide at least one todo ID")
        return
    
    try:
        # Parse todo IDs
        todo_ids = []
        for arg in args:
            try:
                todo_id = int(arg)
                todo_ids.append(todo_id)
            except ValueError:
                print(f"Warning: '{arg}' is not a valid todo ID, skipping")
        
        if not todo_ids:
            print("Error: No valid todo IDs provided")
            return
        
        # Load current todos
        todos = app.load_todos()
        
        # Track successful completions
        completed_todos = []
        
        # Process each todo ID
        for todo_id in todo_ids:
            # Find todo by ID
            todo_found = False
            for todo in todos:
                if todo.get('id') == todo_id:
                    todo_found = True
                    if todo.get('done', False):
                        print(f"Todo #{todo_id} is already completed")
                    else:
                        # Mark as done with timestamp
                        todo['done'] = True
                        todo['completed_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        completed_todos.append(todo)
                    break
            
            if not todo_found:
                print(f"Error: Todo #{todo_id} not found")
        
        # Save changes if any todos were completed
        if completed_todos:
            app.save_todos(todos)
            
            # Display confirmations
            for todo in completed_todos:
                print(f"Completed: #{todo['id']} - {todo['description']}")
        
    except Exception as e:
        print(f"Error marking todos as done: {str(e)}")


def remove(args: List[str]) -> None:
    """
    Remove todo items by ID or remove all completed todos.
    
    Args:
        args: Command line arguments containing todo ID(s) or --done flag
        
    Usage:
        remove 1
        remove 1 3 5
        remove --done
    """
    if not args:
        print("Error: Please provide todo ID(s) or use --done flag")
        return
    
    try:
        # Check for bulk deletion of completed todos
        if '--done' in args:
            todos = app.load_todos()
            completed_todos = [todo for todo in todos if todo.get('done', False)]
            
            if not completed_todos:
                print("No completed todos to remove")
                return
            
            # Remove completed todos
            remaining_todos = [todo for todo in todos if not todo.get('done', False)]
            app.save_todos(remaining_todos)
            
            print(f"Removed {len(completed_todos)} completed todo(s)")
            for todo in completed_todos:
                print(f"  Removed: #{todo['id']} - {todo['description']}")
            return
        
        # Parse individual todo IDs
        todo_ids = []
        for arg in args:
            try:
                todo_id = int(arg)
                todo_ids.append(todo_id)
            except ValueError:
                print(f"Warning: '{arg}' is not a valid todo ID, skipping")
        
        if not todo_ids:
            print("Error: No valid todo IDs provided")
            return
        
        # Load current todos
        todos = app.load_todos()
        
        # Track removed todos for confirmation
        removed_todos = []
        
        # Process each todo ID
        for todo_id in todo_ids:
            removed_todo = app.delete_todo(todo_id)
            if removed_todo:
                removed_todos.append(removed_todo)
            else:
                print(f"Error: Todo #{todo_id} not found")
        
        # Display confirmations
        if removed_todos:
            for todo in removed_todos:
                print(f"Removed: #{todo['id']} - {todo['description']}")
        
    except Exception as e:
        print(f"Error removing todos: {str(e)}")


def help(args: List[str]) -> None:
    """
    Display help information and usage examples.
    
    Args:
        args: Command line arguments (unused for help command)
    """
    help_text = """
Todo CLI - Command Reference

USAGE:
    python todo.py <command> [arguments]

COMMANDS:

    add <description> [--priority <level>]
        Add a new todo item with optional priority
        Examples:
            add Buy groceries
            add Complete project --priority high

    list [--all | --done]
        Display todo items
        Options:
            (no flags)  Show pending todos only
            --all       Show all todos
            --done      Show completed todos only
        Examples:
            list
            list --all
            list --done

    done <id> [<id2> <id3> ...]
        Mark one or more todos as completed
        Examples:
            done 1
            done 1 3 5

    remove <id> [<id2> <id3> ...] | --done
        Remove todo items by ID or remove all completed todos
        Examples:
            remove 1
            remove 1 3 5
            remove --done

    help
        Show this help message

NOTES:
    - Todo IDs are automatically assigned when items are created
    - Use 'list' to see current todo IDs
    - Priority levels are free-form text (e.g., high, medium, low)
    - Completed todos include timestamp information
    - All changes are automatically saved

EXAMPLES:
    python todo.py add "Review code changes" --priority high
    python todo.py list
    python todo.py done 1
    python todo.py list --all
    python todo.py remove --done
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


def get_command(command_name: str) -> Optional[callable]:
    """
    Get command function by name.
    
    Args:
        command_name: Name of the command to retrieve
        
    Returns:
        Command function if found, None otherwise
    """
    return COMMANDS.get(command_name.lower())


def list_available_commands() -> List[str]:
    """
    Get list of available command names.
    
    Returns:
        List of command names
    """
    return list(COMMANDS.keys())