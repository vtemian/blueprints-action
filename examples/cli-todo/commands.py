"""
CLI command implementations for todo management operations.

This module provides command functions for adding, listing, completing,
removing, and displaying help for todo items through a command-line interface.
"""

import datetime
from typing import List, Optional
import app
import utils


def add(args: List[str]) -> None:
    """
    Add a new todo item with optional priority flag.
    
    Args:
        args: Command arguments containing task text and optional --priority flag
        
    Usage:
        add Buy groceries --priority high
        add Meeting at 3pm
    """
    try:
        if not args:
            print("Error: Task description cannot be empty")
            return
            
        # Parse priority flag if present
        priority = None
        task_words = []
        
        i = 0
        while i < len(args):
            if args[i] == '--priority' and i + 1 < len(args):
                priority = args[i + 1]
                i += 2  # Skip both --priority and its value
            else:
                task_words.append(args[i])
                i += 1
        
        # Join remaining words as task description
        task_text = ' '.join(task_words).strip()
        
        if not task_text:
            print("Error: Task description cannot be empty")
            return
            
        # Add todo through app module
        todo_id = app.add_todo(task_text, priority=priority)
        
        # Display confirmation
        priority_text = f" (Priority: {priority})" if priority else ""
        print(f"Added: #{todo_id} - {task_text}{priority_text}")
        
    except Exception as e:
        print(f"Error adding todo: {str(e)}")


def list(args: List[str]) -> None:
    """
    Display todo items with filtering options.
    
    Args:
        args: Command arguments containing optional --all or --done flags
        
    Usage:
        list           # Show incomplete todos only
        list --all     # Show all todos
        list --done    # Show completed todos only
    """
    try:
        # Parse flags
        show_all = '--all' in args
        show_done = '--done' in args
        
        # Load todos from app
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
            
        # Filter todos based on flags
        if show_done:
            filtered_todos = [todo for todo in todos if todo.get('done', False)]
        elif show_all:
            filtered_todos = todos
        else:
            # Default: show incomplete only
            filtered_todos = [todo for todo in todos if not todo.get('done', False)]
            
        if not filtered_todos:
            if show_done:
                print("No completed todos found.")
            elif not show_all:
                print("No pending todos found.")
            return
            
        # Prepare data for table formatting
        table_data = []
        headers = ['ID', 'Status', 'Task', 'Priority', 'Created', 'Completed']
        
        for todo in filtered_todos:
            status = '[✓]' if todo.get('done', False) else '[ ]'
            priority = todo.get('priority', '-')
            created = todo.get('created', '-')
            completed = todo.get('completed', '-') if todo.get('done', False) else '-'
            
            table_data.append([
                f"#{todo['id']}",
                status,
                todo['text'],
                priority,
                created,
                completed
            ])
            
        # Use utils module for table formatting
        formatted_table = utils.format_table(headers, table_data)
        print(formatted_table)
        
    except Exception as e:
        print(f"Error listing todos: {str(e)}")


def done(args: List[str]) -> None:
    """
    Mark one or more todo items as completed.
    
    Args:
        args: Command arguments containing todo ID(s)
        
    Usage:
        done 1         # Mark todo #1 as done
        done 1 3 5     # Mark multiple todos as done
    """
    try:
        if not args:
            print("Error: Please specify todo ID(s) to mark as done")
            return
            
        # Parse todo IDs from arguments
        todo_ids = []
        for arg in args:
            try:
                todo_id = int(arg)
                todo_ids.append(todo_id)
            except ValueError:
                print(f"Error: '{arg}' is not a valid todo ID")
                return
                
        if not todo_ids:
            print("Error: No valid todo IDs provided")
            return
            
        # Load current todos
        todos = app.load_todos()
        todos_dict = {todo['id']: todo for todo in todos}
        
        # Validate all IDs exist before making changes
        for todo_id in todo_ids:
            if todo_id not in todos_dict:
                print(f"Error: Todo #{todo_id} not found")
                return
                
        # Mark todos as done
        completed_todos = []
        current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        for todo_id in todo_ids:
            todo = todos_dict[todo_id]
            if todo.get('done', False):
                print(f"Warning: Todo #{todo_id} is already completed")
                continue
                
            todo['done'] = True
            todo['completed'] = current_time
            completed_todos.append(todo)
            
        # Save changes
        if completed_todos:
            app.save_todos(todos)
            
            # Display confirmation
            for todo in completed_todos:
                print(f"Completed: #{todo['id']} - {todo['text']}")
        else:
            print("No todos were marked as completed")
            
    except Exception as e:
        print(f"Error marking todos as done: {str(e)}")


def remove(args: List[str]) -> None:
    """
    Remove todo items by ID or remove all completed todos.
    
    Args:
        args: Command arguments containing todo ID or --done flag
        
    Usage:
        remove 1       # Remove todo #1
        remove --done  # Remove all completed todos
    """
    try:
        if not args:
            print("Error: Please specify todo ID or use --done flag")
            return
            
        # Check for bulk removal of completed todos
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
                print(f"  #{todo['id']} - {todo['text']}")
            return
            
        # Parse single todo ID
        try:
            todo_id = int(args[0])
        except (ValueError, IndexError):
            print(f"Error: '{args[0]}' is not a valid todo ID")
            return
            
        # Load todos and find target
        todos = app.load_todos()
        todo_to_remove = None
        
        for todo in todos:
            if todo['id'] == todo_id:
                todo_to_remove = todo
                break
                
        if not todo_to_remove:
            print(f"Error: Todo #{todo_id} not found")
            return
            
        # Remove todo
        success = app.delete_todo(todo_id)
        
        if success:
            print(f"Removed: #{todo_to_remove['id']} - {todo_to_remove['text']}")
        else:
            print(f"Error: Failed to remove todo #{todo_id}")
            
    except Exception as e:
        print(f"Error removing todo: {str(e)}")


def help(args: List[str]) -> None:
    """
    Display comprehensive usage information and command examples.
    
    Args:
        args: Command arguments (unused for help command)
    """
    help_text = """
TODO CLI - Command Reference

USAGE:
    todo <command> [arguments] [options]

COMMANDS:

    add <description> [--priority <level>]
        Add a new todo item with optional priority
        
        Examples:
            todo add "Buy groceries"
            todo add "Important meeting" --priority high
            todo add "Call dentist" --priority low

    list [--all | --done]
        Display todo items with optional filtering
        
        Examples:
            todo list           # Show pending todos only
            todo list --all     # Show all todos
            todo list --done    # Show completed todos only

    done <id> [<id2> <id3> ...]
        Mark one or more todos as completed
        
        Examples:
            todo done 1         # Mark todo #1 as done
            todo done 1 3 5     # Mark multiple todos as done

    remove <id> | remove --done
        Remove a specific todo or all completed todos
        
        Examples:
            todo remove 1       # Remove todo #1
            todo remove --done  # Remove all completed todos

    help
        Display this help information

PRIORITY LEVELS:
    high, medium, low (case-insensitive)

STATUS INDICATORS:
    [✓] - Completed todo
    [ ] - Pending todo

EXAMPLES:
    # Basic workflow
    todo add "Learn Python"
    todo add "Build todo app" --priority high
    todo list
    todo done 1
    todo list --all
    todo remove --done

For more information, visit: https://github.com/your-repo/todo-cli
"""
    print(help_text.strip())