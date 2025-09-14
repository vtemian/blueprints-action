"""
CLI Commands Module

This module implements command-line interface commands for a todo application.
Each command function handles argument parsing, validation, and user feedback.
"""

import app
import utils
from datetime import datetime
from typing import List, Optional, Tuple


def add(args: List[str]) -> None:
    """
    Add a new todo item with optional priority.
    
    Usage: add [--priority high|medium|low] <task description>
    
    Args:
        args: Command line arguments
    """
    if not args:
        print("Error: Task description is required")
        print("Usage: add [--priority high|medium|low] <task description>")
        return
    
    priority = "medium"  # default priority
    task_parts = []
    
    # Parse arguments
    i = 0
    while i < len(args):
        if args[i] == "--priority":
            if i + 1 >= len(args):
                print("Error: --priority flag requires a value (high|medium|low)")
                return
            priority_value = args[i + 1].lower()
            if priority_value not in ["high", "medium", "low"]:
                print("Error: Priority must be one of: high, medium, low")
                return
            priority = priority_value
            i += 2
        else:
            task_parts.append(args[i])
            i += 1
    
    if not task_parts:
        print("Error: Task description is required")
        return
    
    task_text = " ".join(task_parts)
    
    try:
        todo_id = app.add_todo(task_text, priority=priority)
        print(f"Added: #{todo_id} - {task_text}")
    except Exception as e:
        print(f"Error adding todo: {e}")


def list(args: List[str]) -> None:
    """
    List todo items with optional filtering.
    
    Usage: list [--all] [--done]
    
    Args:
        args: Command line arguments
    """
    show_all = False
    show_done_only = False
    
    # Parse flags
    for arg in args:
        if arg == "--all":
            show_all = True
        elif arg == "--done":
            show_done_only = True
        else:
            print(f"Error: Unknown flag '{arg}'")
            print("Usage: list [--all] [--done]")
            return
    
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
            if not show_all and not show_done_only and todo.get('done', False):
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
        headers = ["ID", "Status", "Priority", "Task", "Created"]
        
        for todo in filtered_todos:
            status = "[✓]" if todo.get('done', False) else "[ ]"
            priority = todo.get('priority', 'medium').upper()
            task = todo.get('text', '')
            created = todo.get('created', '')
            
            # Format created date if it's a datetime string
            if created:
                try:
                    dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                    created = dt.strftime('%Y-%m-%d %H:%M')
                except:
                    pass
            
            table_data.append([
                str(todo.get('id', '')),
                status,
                priority,
                task,
                created
            ])
        
        # Display formatted table
        formatted_output = utils.format_table(headers, table_data)
        print(formatted_output)
        
    except Exception as e:
        print(f"Error loading todos: {e}")


def done(args: List[str]) -> None:
    """
    Mark todo items as completed.
    
    Usage: done <id1> [id2] [id3] ...
    
    Args:
        args: Command line arguments containing todo IDs
    """
    if not args:
        print("Error: At least one todo ID is required")
        print("Usage: done <id1> [id2] [id3] ...")
        return
    
    # Parse and validate IDs
    todo_ids = []
    for arg in args:
        try:
            todo_id = int(arg)
            todo_ids.append(todo_id)
        except ValueError:
            print(f"Error: '{arg}' is not a valid todo ID")
            return
    
    try:
        todos = app.load_todos()
        todos_dict = {todo['id']: todo for todo in todos}
        
        completed_todos = []
        
        # Process each ID
        for todo_id in todo_ids:
            if todo_id not in todos_dict:
                print(f"Error: Todo #{todo_id} not found")
                continue
            
            todo = todos_dict[todo_id]
            
            if todo.get('done', False):
                print(f"Warning: Todo #{todo_id} is already completed")
                continue
            
            # Mark as done
            todo['done'] = True
            todo['completed_at'] = datetime.now().isoformat()
            completed_todos.append(todo)
        
        if completed_todos:
            # Save changes
            app.save_todos(todos)
            
            # Display confirmation
            for todo in completed_todos:
                print(f"Completed: #{todo['id']} - {todo.get('text', '')}")
        
    except Exception as e:
        print(f"Error marking todos as done: {e}")


def remove(args: List[str]) -> None:
    """
    Remove todo items by ID or remove all completed todos.
    
    Usage: remove <id1> [id2] [id3] ... | remove --done
    
    Args:
        args: Command line arguments
    """
    if not args:
        print("Error: Todo ID(s) or --done flag required")
        print("Usage: remove <id1> [id2] [id3] ... | remove --done")
        return
    
    # Check for --done flag
    if len(args) == 1 and args[0] == "--done":
        _remove_completed_todos()
        return
    
    # Check for mixed arguments
    if "--done" in args and len(args) > 1:
        print("Error: --done flag cannot be combined with todo IDs")
        return
    
    # Parse todo IDs
    todo_ids = []
    for arg in args:
        if arg.startswith("--"):
            print(f"Error: Unknown flag '{arg}'")
            return
        try:
            todo_id = int(arg)
            todo_ids.append(todo_id)
        except ValueError:
            print(f"Error: '{arg}' is not a valid todo ID")
            return
    
    try:
        removed_todos = []
        
        for todo_id in todo_ids:
            try:
                todo = app.get_todo(todo_id)  # Get todo before deletion for confirmation
                app.delete_todo(todo_id)
                removed_todos.append(todo)
                print(f"Removed: #{todo_id} - {todo.get('text', '')}")
            except Exception as e:
                print(f"Error removing todo #{todo_id}: {e}")
        
    except Exception as e:
        print(f"Error removing todos: {e}")


def _remove_completed_todos() -> None:
    """Helper function to remove all completed todos."""
    try:
        todos = app.load_todos()
        completed_todos = [todo for todo in todos if todo.get('done', False)]
        
        if not completed_todos:
            print("No completed todos to remove.")
            return
        
        # Remove completed todos
        remaining_todos = [todo for todo in todos if not todo.get('done', False)]
        app.save_todos(remaining_todos)
        
        print(f"Removed {len(completed_todos)} completed todo(s):")
        for todo in completed_todos:
            print(f"  #{todo['id']} - {todo.get('text', '')}")
            
    except Exception as e:
        print(f"Error removing completed todos: {e}")


def help(args: List[str]) -> None:
    """
    Display help information for all commands.
    
    Args:
        args: Command line arguments (unused)
    """
    help_text = """
Todo CLI - Command Reference

USAGE:
    todo <command> [options] [arguments]

COMMANDS:
    add [--priority high|medium|low] <task>
        Add a new todo item with optional priority
        
        Examples:
            todo add "Buy groceries"
            todo add --priority high "Finish project report"
            todo add --priority low "Clean desk"

    list [--all] [--done]
        List todo items with optional filtering
        
        Options:
            --all     Show all todos (including completed)
            --done    Show only completed todos
            (default) Show only pending todos
        
        Examples:
            todo list
            todo list --all
            todo list --done

    done <id1> [id2] [id3] ...
        Mark one or more todos as completed
        
        Examples:
            todo done 1
            todo done 1 3 5

    remove <id1> [id2] [id3] ... | remove --done
        Remove todos by ID or remove all completed todos
        
        Options:
            --done    Remove all completed todos
        
        Examples:
            todo remove 1
            todo remove 1 3 5
            todo remove --done

    help
        Show this help message

PRIORITY LEVELS:
    high    - High priority tasks
    medium  - Medium priority tasks (default)
    low     - Low priority tasks

STATUS INDICATORS:
    [✓]     - Completed todo
    [ ]     - Pending todo

EXAMPLES:
    # Add a high priority task
    todo add --priority high "Submit quarterly report"
    
    # List all pending tasks
    todo list
    
    # Mark tasks 1 and 3 as done
    todo done 1 3
    
    # Show all tasks including completed
    todo list --all
    
    # Remove completed tasks
    todo remove --done

For more information, visit the project documentation.
"""
    print(help_text.strip())


def _parse_flags_and_args(args: List[str], valid_flags: List[str]) -> Tuple[List[str], List[str]]:
    """
    Helper function to separate flags from regular arguments.
    
    Args:
        args: List of command line arguments
        valid_flags: List of valid flag names (without --)
    
    Returns:
        Tuple of (flags, remaining_args)
    """
    flags = []
    remaining_args = []
    
    i = 0
    while i < len(args):
        if args[i].startswith("--"):
            flag = args[i][2:]  # Remove --
            if flag in valid_flags:
                flags.append(flag)
                # Check if flag expects a value
                if flag in ["priority"] and i + 1 < len(args) and not args[i + 1].startswith("--"):
                    i += 1  # Skip the flag value
                    flags.append(args[i])
            else:
                remaining_args.append(args[i])
        else:
            remaining_args.append(args[i])
        i += 1
    
    return flags, remaining_args


def _validate_todo_ids(todo_ids: List[int]) -> List[int]:
    """
    Validate that todo IDs exist.
    
    Args:
        todo_ids: List of todo IDs to validate
    
    Returns:
        List of valid todo IDs
    
    Raises:
        Exception: If any todo ID is invalid
    """
    try:
        todos = app.load_todos()
        existing_ids = {todo['id'] for todo in todos}
        
        valid_ids = []
        for todo_id in todo_ids:
            if todo_id not in existing_ids:
                raise Exception(f"Todo #{todo_id} not found")
            valid_ids.append(todo_id)
        
        return valid_ids
    except Exception as e:
        raise Exception(f"Error validating todo IDs: {e}")