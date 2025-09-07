"""
CLI command functions for todo application.

This module implements the core command-line interface functions for managing todos,
including adding, listing, completing, removing, and displaying help information.
"""

import app
import utils
from datetime import datetime


def add(args):
    """
    Add a new todo item with optional priority.
    
    Args:
        args (list): Command-line arguments containing todo text and optional --priority flag
        
    Usage:
        add Buy groceries
        add --priority high Fix critical bug
        add Complete project --priority medium
    """
    if not args:
        print("Error: No todo text provided")
        print("Usage: add <todo_text> [--priority <level>]")
        return
    
    priority = None
    todo_text_parts = []
    
    # Parse arguments for priority flag and todo text
    i = 0
    while i < len(args):
        if args[i] == '--priority' and i + 1 < len(args):
            priority = args[i + 1]
            i += 2  # Skip both --priority and its value
        else:
            todo_text_parts.append(args[i])
            i += 1
    
    # Join remaining arguments as todo text
    todo_text = ' '.join(todo_text_parts).strip()
    
    if not todo_text:
        print("Error: No todo text provided")
        print("Usage: add <todo_text> [--priority <level>]")
        return
    
    try:
        todo_id = app.add_todo(todo_text, priority)
        priority_str = f" (Priority: {priority})" if priority else ""
        print(f"Added: #{todo_id} - {todo_text}{priority_str}")
    except Exception as e:
        print(f"Error adding todo: {e}")


def list(args):
    """
    List todos with optional filtering.
    
    Args:
        args (list): Command-line arguments containing optional --all or --done flags
        
    Usage:
        list           # Show incomplete todos only
        list --all     # Show all todos
        list --done    # Show completed todos only
    """
    show_all = '--all' in args
    show_done = '--done' in args
    
    try:
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Filter todos based on flags
        if show_done:
            filtered_todos = [todo for todo in todos if todo.get('done', False)]
            if not filtered_todos:
                print("No completed todos found.")
                return
        elif show_all:
            filtered_todos = todos
        else:
            # Default: show incomplete todos only
            filtered_todos = [todo for todo in todos if not todo.get('done', False)]
            if not filtered_todos:
                print("No incomplete todos found.")
                return
        
        # Prepare data for table formatting
        table_data = []
        headers = ['ID', 'Status', 'Description', 'Priority', 'Created', 'Completed']
        
        for todo in filtered_todos:
            status = '[✓]' if todo.get('done', False) else '[ ]'
            priority = todo.get('priority', 'None')
            created = todo.get('created', 'Unknown')
            completed = todo.get('completed', '') if todo.get('done', False) else ''
            
            table_data.append([
                str(todo['id']),
                status,
                todo['description'],
                priority,
                created,
                completed
            ])
        
        # Display todos in table format
        utils.format_table(headers, table_data)
        
        # Show summary
        total_count = len(todos)
        done_count = len([t for t in todos if t.get('done', False)])
        incomplete_count = total_count - done_count
        
        if show_all:
            print(f"\nTotal: {total_count} todos ({done_count} completed, {incomplete_count} incomplete)")
        elif show_done:
            print(f"\nShowing {len(filtered_todos)} completed todos")
        else:
            print(f"\nShowing {len(filtered_todos)} incomplete todos")
            
    except Exception as e:
        print(f"Error loading todos: {e}")


def done(args):
    """
    Mark one or more todos as completed.
    
    Args:
        args (list): Command-line arguments containing todo ID(s)
        
    Usage:
        done 1         # Mark todo #1 as completed
        done 1 3 5     # Mark multiple todos as completed
    """
    if not args:
        print("Error: No todo ID provided")
        print("Usage: done <id> [<id2> <id3> ...]")
        return
    
    # Parse and validate all IDs first
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
        existing_ids = {todo['id'] for todo in todos}
        
        # Validate all IDs exist before processing any
        invalid_ids = [tid for tid in todo_ids if tid not in existing_ids]
        if invalid_ids:
            print(f"Error: Todo ID(s) not found: {', '.join(map(str, invalid_ids))}")
            return
        
        # Process each valid ID
        completion_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        completed_todos = []
        
        for todo in todos:
            if todo['id'] in todo_ids and not todo.get('done', False):
                todo['done'] = True
                todo['completed'] = completion_time
                completed_todos.append(todo)
            elif todo['id'] in todo_ids and todo.get('done', False):
                print(f"Warning: Todo #{todo['id']} is already completed")
        
        if completed_todos:
            app.save_todos(todos)
            for todo in completed_todos:
                print(f"Completed: #{todo['id']} - {todo['description']}")
        
    except Exception as e:
        print(f"Error marking todos as done: {e}")


def remove(args):
    """
    Remove todo(s) by ID or remove all completed todos.
    
    Args:
        args (list): Command-line arguments containing todo ID or --done flag
        
    Usage:
        remove 1       # Remove todo #1
        remove --done  # Remove all completed todos
    """
    if not args:
        print("Error: No todo ID or flag provided")
        print("Usage: remove <id> OR remove --done")
        return
    
    try:
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        if '--done' in args:
            # Remove all completed todos
            completed_todos = [todo for todo in todos if todo.get('done', False)]
            
            if not completed_todos:
                print("No completed todos to remove.")
                return
            
            # Keep only incomplete todos
            remaining_todos = [todo for todo in todos if not todo.get('done', False)]
            app.save_todos(remaining_todos)
            
            print(f"Removed {len(completed_todos)} completed todo(s):")
            for todo in completed_todos:
                print(f"  #{todo['id']} - {todo['description']}")
        
        else:
            # Remove specific todo by ID
            if len(args) != 1:
                print("Error: Please provide exactly one todo ID")
                print("Usage: remove <id> OR remove --done")
                return
            
            try:
                todo_id = int(args[0])
            except ValueError:
                print(f"Error: '{args[0]}' is not a valid todo ID")
                return
            
            # Find the todo to remove
            todo_to_remove = None
            for todo in todos:
                if todo['id'] == todo_id:
                    todo_to_remove = todo
                    break
            
            if not todo_to_remove:
                print(f"Error: Todo #{todo_id} not found")
                return
            
            # Remove the todo
            success = app.delete_todo(todo_id)
            if success:
                print(f"Removed: #{todo_id} - {todo_to_remove['description']}")
            else:
                print(f"Error: Failed to remove todo #{todo_id}")
                
    except Exception as e:
        print(f"Error removing todo(s): {e}")


def help(args):
    """
    Display comprehensive help information for all commands.
    
    Args:
        args (list): Command-line arguments (unused for help command)
    """
    help_text = """
Todo Application - Command Reference

COMMANDS:
  add <text> [--priority <level>]    Add a new todo item
  list [--all|--done]                List todos (incomplete by default)
  done <id> [<id2> ...]              Mark todo(s) as completed
  remove <id>                        Remove a specific todo
  remove --done                      Remove all completed todos
  help                               Show this help message

COMMAND DETAILS:

  add - Add a new todo item
    Usage: add <todo_description> [--priority <level>]
    Examples:
      add Buy groceries
      add --priority high Fix critical bug
      add Complete project report --priority medium

  list - Display todos with optional filtering
    Usage: list [--all|--done]
    Options:
      (no flags)  Show incomplete todos only (default)
      --all       Show all todos (completed and incomplete)
      --done      Show completed todos only
    Examples:
      list                    # Show incomplete todos
      list --all              # Show all todos
      list --done             # Show completed todos only

  done - Mark todos as completed
    Usage: done <id> [<id2> <id3> ...]
    Examples:
      done 1                  # Mark todo #1 as completed
      done 1 3 5              # Mark multiple todos as completed

  remove - Remove todos
    Usage: remove <id> OR remove --done
    Examples:
      remove 1                # Remove todo #1
      remove --done           # Remove all completed todos

  help - Show this help information
    Usage: help

NOTES:
  - Todo IDs are automatically assigned when adding new todos
  - Use 'list' to see current todo IDs
  - Completed todos show completion timestamp
  - Priority levels are optional and can be any text (e.g., high, medium, low)
  - All changes are automatically saved

EXAMPLES:
  # Add some todos
  add Buy milk --priority high
  add Call dentist
  add Finish homework --priority medium
  
  # List incomplete todos
  list
  
  # Mark todo #1 as done
  done 1
  
  # List all todos to see status
  list --all
  
  # Remove completed todos
  remove --done
"""
    print(help_text.strip())