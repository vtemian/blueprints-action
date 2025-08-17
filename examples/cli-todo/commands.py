"""
CLI command implementations for todo application.

This module provides command-line interface functions for managing todo items,
including adding, listing, completing, removing, and displaying help information.
"""

import sys
from datetime import datetime
from typing import List, Optional

import app
import utils


def add(args: List[str]) -> None:
    """
    Add a new todo item with optional priority.
    
    Args:
        args: Command line arguments containing task text and optional --priority flag
        
    Example:
        add(['Buy', 'groceries', '--priority', 'high'])
        add(['Complete', 'project'])
    """
    if not args:
        print("Error: Task description is required")
        sys.exit(1)
    
    try:
        # Parse priority flag
        priority = None
        task_args = []
        
        i = 0
        while i < len(args):
            if args[i] == '--priority' and i + 1 < len(args):
                priority = args[i + 1]
                i += 2  # Skip both --priority and its value
            else:
                task_args.append(args[i])
                i += 1
        
        if not task_args:
            print("Error: Task description is required")
            sys.exit(1)
        
        # Join remaining arguments as task description
        task_text = ' '.join(task_args)
        
        # Validate priority if provided
        if priority and priority not in ['low', 'medium', 'high']:
            print("Error: Priority must be one of: low, medium, high")
            sys.exit(1)
        
        # Add todo item
        todo_id = app.add_todo(task_text, priority=priority)
        
        # Display success message
        priority_text = f" (Priority: {priority})" if priority else ""
        print(f"Added: #{todo_id} - {task_text}{priority_text}")
        
    except Exception as e:
        print(f"Error adding todo: {e}")
        sys.exit(1)


def list(args: List[str]) -> None:
    """
    Display todo items with optional filtering.
    
    Args:
        args: Command line arguments containing optional --all or --done flags
        
    Example:
        list([])  # Show pending todos
        list(['--all'])  # Show all todos
        list(['--done'])  # Show completed todos only
    """
    try:
        # Parse flags
        show_all = '--all' in args
        show_done = '--done' in args
        
        if show_all and show_done:
            print("Error: Cannot use both --all and --done flags")
            sys.exit(1)
        
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
            status = "completed" if show_done else "pending"
            print(f"No {status} todos found.")
            return
        
        # Prepare data for table formatting
        table_data = []
        headers = ['ID', 'Status', 'Task', 'Priority', 'Created', 'Completed']
        
        for todo in filtered_todos:
            status_icon = '[✓]' if todo.get('done', False) else '[ ]'
            priority = todo.get('priority', 'medium').capitalize()
            created = _format_datetime(todo.get('created_at'))
            completed = _format_datetime(todo.get('completed_at')) if todo.get('done') else '-'
            
            table_data.append([
                str(todo['id']),
                status_icon,
                todo['text'],
                priority,
                created,
                completed
            ])
        
        # Display formatted table
        print(utils.format_table(headers, table_data))
        
    except Exception as e:
        print(f"Error listing todos: {e}")
        sys.exit(1)


def done(args: List[str]) -> None:
    """
    Mark one or more todos as completed.
    
    Args:
        args: Command line arguments containing todo ID(s)
        
    Example:
        done(['1'])  # Mark todo #1 as done
        done(['1', '3', '5'])  # Mark multiple todos as done
    """
    if not args:
        print("Error: Todo ID(s) required")
        sys.exit(1)
    
    try:
        # Parse and validate todo IDs
        todo_ids = []
        for arg in args:
            try:
                todo_id = int(arg)
                todo_ids.append(todo_id)
            except ValueError:
                print(f"Error: Invalid todo ID '{arg}'. Must be a number.")
                sys.exit(1)
        
        # Load todos
        todos = app.load_todos()
        
        # Track successful completions
        completed_todos = []
        
        # Process each todo ID
        for todo_id in todo_ids:
            todo = next((t for t in todos if t['id'] == todo_id), None)
            
            if not todo:
                print(f"Error: Todo #{todo_id} not found")
                continue
            
            if todo.get('done', False):
                print(f"Warning: Todo #{todo_id} is already completed")
                continue
            
            # Mark as done with timestamp
            todo['done'] = True
            todo['completed_at'] = datetime.now().isoformat()
            completed_todos.append(todo)
        
        if not completed_todos:
            print("No todos were marked as completed")
            return
        
        # Save changes
        app.save_todos(todos)
        
        # Display success messages
        for todo in completed_todos:
            print(f"Completed: #{todo['id']} - {todo['text']}")
        
    except Exception as e:
        print(f"Error marking todos as done: {e}")
        sys.exit(1)


def remove(args: List[str]) -> None:
    """
    Remove one or more todo items.
    
    Args:
        args: Command line arguments containing todo ID or --done flag
        
    Example:
        remove(['1'])  # Remove todo #1
        remove(['--done'])  # Remove all completed todos
    """
    if not args:
        print("Error: Todo ID or --done flag required")
        sys.exit(1)
    
    try:
        # Check for --done flag
        if '--done' in args:
            if len(args) > 1:
                print("Error: Cannot specify todo IDs when using --done flag")
                sys.exit(1)
            
            _remove_all_done()
            return
        
        # Parse and validate todo IDs
        todo_ids = []
        for arg in args:
            try:
                todo_id = int(arg)
                todo_ids.append(todo_id)
            except ValueError:
                print(f"Error: Invalid todo ID '{arg}'. Must be a number.")
                sys.exit(1)
        
        # Load todos
        todos = app.load_todos()
        
        # Track removed todos for confirmation
        removed_todos = []
        
        # Process each todo ID
        for todo_id in todo_ids:
            todo = next((t for t in todos if t['id'] == todo_id), None)
            
            if not todo:
                print(f"Error: Todo #{todo_id} not found")
                continue
            
            removed_todos.append(todo.copy())  # Store copy for display
            app.delete_todo(todo_id)
        
        if not removed_todos:
            print("No todos were removed")
            return
        
        # Display success messages
        for todo in removed_todos:
            print(f"Removed: #{todo['id']} - {todo['text']}")
        
    except Exception as e:
        print(f"Error removing todos: {e}")
        sys.exit(1)


def _remove_all_done() -> None:
    """Remove all completed todos."""
    try:
        todos = app.load_todos()
        done_todos = [todo for todo in todos if todo.get('done', False)]
        
        if not done_todos:
            print("No completed todos to remove")
            return
        
        # Remove each completed todo
        removed_count = 0
        for todo in done_todos:
            app.delete_todo(todo['id'])
            removed_count += 1
        
        print(f"Removed {removed_count} completed todo(s)")
        
    except Exception as e:
        print(f"Error removing completed todos: {e}")
        sys.exit(1)


def help(args: List[str]) -> None:
    """
    Display usage information and available commands.
    
    Args:
        args: Command line arguments (unused)
    """
    help_text = """
Todo CLI - Command Reference

USAGE:
    todo <command> [arguments] [flags]

COMMANDS:
    add <task>              Add a new todo item
        --priority <level>  Set priority (low, medium, high)
        
    list                    Show pending todos
        --all              Show all todos (pending and completed)
        --done             Show completed todos only
        
    done <id> [id...]       Mark todo(s) as completed
    
    remove <id> [id...]     Remove specific todo(s)
        --done             Remove all completed todos
        
    help                    Show this help message

EXAMPLES:
    todo add "Buy groceries" --priority high
    todo add "Call dentist"
    todo list
    todo list --all
    todo list --done
    todo done 1
    todo done 1 3 5
    todo remove 2
    todo remove --done

STATUS INDICATORS:
    [ ] - Pending todo
    [✓] - Completed todo

For more information, visit: https://github.com/your-repo/todo-cli
    """
    print(help_text.strip())


def _format_datetime(dt_string: Optional[str]) -> str:
    """
    Format datetime string for display.
    
    Args:
        dt_string: ISO format datetime string or None
        
    Returns:
        Formatted datetime string or '-' if None
    """
    if not dt_string:
        return '-'
    
    try:
        dt = datetime.fromisoformat(dt_string)
        return dt.strftime('%Y-%m-%d %H:%M')
    except (ValueError, TypeError):
        return dt_string  # Return original if parsing fails