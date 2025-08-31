"""
CLI command operations module for todo application.

This module provides command-line interface functions for managing todos,
including adding, listing, completing, and removing todo items.
"""

import datetime
from typing import List, Optional, Dict, Any

import app
import utils


def add(args: List[str]) -> None:
    """
    Add a new todo item with optional priority.
    
    Args:
        args: Command line arguments, format: [--priority LEVEL] DESCRIPTION
        
    Examples:
        add Buy groceries
        add --priority high Fix critical bug
    """
    if not args:
        print("Error: Todo description is required")
        print("Usage: add [--priority LEVEL] DESCRIPTION")
        return
    
    # Parse priority flag
    priority = 'normal'
    text_args = args.copy()
    
    try:
        if '--priority' in text_args:
            priority_index = text_args.index('--priority')
            if priority_index + 1 >= len(text_args):
                print("Error: --priority flag requires a value")
                return
            
            priority = text_args[priority_index + 1]
            # Remove priority flag and value from text args
            text_args.pop(priority_index)  # Remove --priority
            text_args.pop(priority_index)  # Remove priority value
    except (ValueError, IndexError):
        print("Error: Invalid priority flag usage")
        return
    
    if not text_args:
        print("Error: Todo description is required")
        return
    
    # Join remaining arguments as todo text
    text = ' '.join(text_args)
    
    try:
        todo = app.add_todo(text, priority)
        if todo and 'id' in todo:
            print(f"Added: #{todo['id']} - {todo.get('description', text)}")
        else:
            print(f"Added: {text}")
    except Exception as e:
        print(f"Error adding todo: {e}")


def list_todos(args: List[str]) -> None:
    """
    List todo items with filtering options.
    
    Args:
        args: Command line arguments, supports --all and --done flags
        
    Examples:
        list
        list --all
        list --done
    """
    show_all = '--all' in args
    show_done = '--done' in args
    
    try:
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Apply filtering logic
        if show_all:
            filtered_todos = todos
        elif show_done:
            filtered_todos = [todo for todo in todos if todo.get('done', False)]
        else:
            # Default: show active (not done) todos only
            filtered_todos = [todo for todo in todos if not todo.get('done', False)]
        
        if not filtered_todos:
            status = "completed" if show_done else "active" if not show_all else ""
            print(f"No {status} todos found.".strip())
            return
        
        # Prepare data for table formatting
        headers = ['ID', 'Status', 'Priority', 'Description', 'Created']
        rows = []
        
        for todo in filtered_todos:
            status_icon = '[✓]' if todo.get('done', False) else '[ ]'
            todo_id = str(todo.get('id', 'N/A'))
            priority = todo.get('priority', 'normal')
            description = todo.get('description', '')
            created = todo.get('created', 'N/A')
            
            # Format creation date if it's a datetime object
            if isinstance(created, datetime.datetime):
                created = created.strftime('%Y-%m-%d %H:%M')
            
            rows.append([todo_id, status_icon, priority, description, created])
        
        # Use utils.format_table to display the todos
        table_output = utils.format_table(headers, rows)
        print(table_output)
        
    except Exception as e:
        print(f"Error loading todos: {e}")


def done(args: List[str]) -> None:
    """
    Mark one or more todos as completed.
    
    Args:
        args: List of todo IDs to mark as done
        
    Examples:
        done 1
        done 1 3 5
    """
    if not args:
        print("Error: At least one todo ID is required")
        print("Usage: done ID [ID ...]")
        return
    
    try:
        todos = app.load_todos()
        todo_dict = {str(todo.get('id')): todo for todo in todos if 'id' in todo}
        
        completed_todos = []
        invalid_ids = []
        
        for todo_id in args:
            todo_id = str(todo_id).strip()
            
            if todo_id in todo_dict:
                todo = todo_dict[todo_id]
                if not todo.get('done', False):
                    todo['done'] = True
                    todo['completed_at'] = datetime.datetime.now()
                    completed_todos.append(todo)
                else:
                    print(f"Todo #{todo_id} is already completed")
            else:
                invalid_ids.append(todo_id)
        
        # Report invalid IDs
        if invalid_ids:
            print(f"Error: Invalid todo ID(s): {', '.join(invalid_ids)}")
        
        # Save changes and report completed todos
        if completed_todos:
            app.save_todos(todos)  # Assuming save function exists
            for todo in completed_todos:
                print(f"Completed: #{todo['id']} - {todo.get('description', '')}")
        
        if not completed_todos and not invalid_ids:
            print("No todos were modified")
            
    except Exception as e:
        print(f"Error marking todos as done: {e}")


def remove(args: List[str]) -> None:
    """
    Remove todo items by ID or remove all completed todos.
    
    Args:
        args: Todo ID to remove OR --done flag to remove all completed
        
    Examples:
        remove 1
        remove --done
    """
    if not args:
        print("Error: Todo ID or --done flag is required")
        print("Usage: remove ID or remove --done")
        return
    
    try:
        if '--done' in args:
            # Remove all completed todos
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
                print(f"  #{todo.get('id')} - {todo.get('description', '')}")
        
        else:
            # Remove specific todo by ID
            todo_id = args[0].strip()
            
            try:
                # Convert to int for validation if needed
                todo_id_int = int(todo_id)
            except ValueError:
                print(f"Error: Invalid todo ID '{todo_id}'. ID must be a number.")
                return
            
            todos = app.load_todos()
            todo_to_remove = None
            
            # Find the todo to remove
            for todo in todos:
                if str(todo.get('id')) == str(todo_id_int):
                    todo_to_remove = todo
                    break
            
            if todo_to_remove:
                success = app.delete_todo(todo_id_int)
                if success:
                    print(f"Removed: #{todo_to_remove['id']} - {todo_to_remove.get('description', '')}")
                else:
                    print(f"Error: Failed to remove todo #{todo_id}")
            else:
                print(f"Error: Todo with ID {todo_id} not found")
                
    except Exception as e:
        print(f"Error removing todo(s): {e}")


def help_command(args: List[str]) -> None:
    """
    Display comprehensive help information for all commands.
    
    Args:
        args: Command line arguments (unused)
    """
    help_text = """
TODO CLI - Command Reference

USAGE:
    todo COMMAND [OPTIONS] [ARGUMENTS]

COMMANDS:

    add [--priority LEVEL] DESCRIPTION
        Add a new todo item with optional priority level.
        Priority levels: low, normal, high (default: normal)
        
        Examples:
            todo add Buy groceries
            todo add --priority high Fix critical security bug
            todo add --priority low Organize desk

    list [--all | --done]
        Display todo items with optional filtering.
        
        Options:
            (no flags)  Show active (incomplete) todos only
            --all       Show all todos (active and completed)
            --done      Show completed todos only
        
        Examples:
            todo list
            todo list --all
            todo list --done

    done ID [ID ...]
        Mark one or more todos as completed.
        Accepts multiple space-separated IDs.
        
        Examples:
            todo done 1
            todo done 1 3 5 7

    remove ID
    remove --done
        Remove a specific todo by ID, or remove all completed todos.
        
        Examples:
            todo remove 1
            todo remove --done

    help
        Display this help information.

EXAMPLES:
    todo add "Call dentist for appointment"
    todo add --priority high "Submit quarterly report"
    todo list
    todo done 2 4
    todo list --done
    todo remove --done
    todo help

NOTES:
    - Todo IDs are automatically assigned when items are created
    - Completed todos are timestamped automatically
    - Use quotes around descriptions containing special characters
    - Priority affects display order in some views
"""
    print(help_text.strip())


# Command mapping for easy lookup
COMMANDS = {
    'add': add,
    'list': list_todos,
    'done': done,
    'remove': remove,
    'help': help_command,
}


def execute_command(command: str, args: List[str]) -> bool:
    """
    Execute a command with given arguments.
    
    Args:
        command: Command name to execute
        args: Arguments to pass to the command
        
    Returns:
        bool: True if command executed successfully, False otherwise
    """
    if command not in COMMANDS:
        print(f"Error: Unknown command '{command}'")
        print("Use 'todo help' to see available commands")
        return False
    
    try:
        COMMANDS[command](args)
        return True
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        return False
    except Exception as e:
        print(f"Error executing command '{command}': {e}")
        return False


def parse_arguments(args: List[str]) -> tuple[Optional[str], List[str]]:
    """
    Parse command line arguments to extract command and its arguments.
    
    Args:
        args: Raw command line arguments
        
    Returns:
        tuple: (command_name, command_arguments)
    """
    if not args:
        return None, []
    
    command = args[0].lower()
    command_args = args[1:] if len(args) > 1 else []
    
    return command, command_args