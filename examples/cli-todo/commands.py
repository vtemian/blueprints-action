"""
CLI command handlers for todo application.
Provides command implementations with argument parsing and error handling.
"""

import app
import utils
from datetime import datetime


def add(args):
    """
    Add a new todo item with optional priority.
    
    Args:
        args: List of command-line arguments
    
    Usage:
        add Buy groceries
        add --priority high Fix critical bug
    """
    if not args:
        print("Error: No task description provided")
        return
    
    try:
        # Check for priority flag
        priority = None
        task_args = args.copy()
        
        if '--priority' in task_args:
            priority_index = task_args.index('--priority')
            if priority_index + 1 < len(task_args):
                priority = task_args[priority_index + 1]
                # Remove priority flag and value from task args
                task_args.pop(priority_index)  # Remove --priority
                task_args.pop(priority_index)  # Remove priority value
            else:
                print("Error: --priority flag requires a value")
                return
        
        # Join remaining arguments as task text
        task_text = ' '.join(task_args).strip()
        
        if not task_text:
            print("Error: Task description cannot be empty")
            return
        
        # Add todo and get the new todo item
        todo_id = app.add_todo(task_text, priority=priority)
        
        # Display confirmation
        priority_text = f" (Priority: {priority})" if priority else ""
        print(f"Added: #{todo_id} - {task_text}{priority_text}")
        
    except Exception as e:
        print(f"Error adding todo: {e}")


def list(args):
    """
    Display todos in formatted table.
    
    Args:
        args: List of command-line arguments
    
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
            if show_done:
                print("No completed todos found.")
            elif not show_all:
                print("No incomplete todos found.")
            return
        
        # Prepare data for table formatting
        table_data = []
        headers = ['ID', 'Status', 'Task', 'Priority', 'Created']
        
        for todo in filtered_todos:
            status = '[✓]' if todo.get('done', False) else '[ ]'
            priority = todo.get('priority', '-')
            created = todo.get('created', '-')
            
            # Format created date if it's a datetime string
            if created != '-':
                try:
                    if isinstance(created, str):
                        created_dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                        created = created_dt.strftime('%Y-%m-%d %H:%M')
                except:
                    pass  # Keep original format if parsing fails
            
            table_data.append([
                str(todo['id']),
                status,
                todo['text'],
                priority,
                created
            ])
        
        # Format and display table
        formatted_table = utils.format_table(headers, table_data)
        print(formatted_table)
        
    except Exception as e:
        print(f"Error listing todos: {e}")


def done(args):
    """
    Mark one or more todos as completed.
    
    Args:
        args: List of command-line arguments containing todo IDs
    
    Usage:
        done 1
        done 1 2 3
    """
    if not args:
        print("Error: No todo ID(s) provided")
        return
    
    try:
        # Parse todo IDs
        todo_ids = []
        for arg in args:
            try:
                todo_ids.append(int(arg))
            except ValueError:
                print(f"Error: '{arg}' is not a valid todo ID")
                return
        
        # Load todos
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Create a mapping of ID to todo for quick lookup
        todo_map = {todo['id']: todo for todo in todos}
        
        # Validate all IDs exist before processing
        for todo_id in todo_ids:
            if todo_id not in todo_map:
                print(f"Error: Todo #{todo_id} not found")
                return
        
        # Mark todos as done
        completed_todos = []
        current_time = datetime.now().isoformat()
        
        for todo_id in todo_ids:
            todo = todo_map[todo_id]
            if todo.get('done', False):
                print(f"Todo #{todo_id} is already completed")
                continue
            
            todo['done'] = True
            todo['completed_at'] = current_time
            completed_todos.append(todo)
        
        if completed_todos:
            # Save changes
            app.save_todos(todos)
            
            # Display confirmations
            for todo in completed_todos:
                print(f"Completed: #{todo['id']} - {todo['text']}")
        
    except Exception as e:
        print(f"Error marking todos as done: {e}")


def remove(args):
    """
    Remove todos by ID or remove all completed todos.
    
    Args:
        args: List of command-line arguments
    
    Usage:
        remove 1
        remove --done
    """
    if not args:
        print("Error: No todo ID or --done flag provided")
        return
    
    try:
        # Check for --done flag
        if '--done' in args:
            # Remove all completed todos
            todos = app.load_todos()
            
            if not todos:
                print("No todos found.")
                return
            
            # Find completed todos
            completed_todos = [todo for todo in todos if todo.get('done', False)]
            
            if not completed_todos:
                print("No completed todos to remove.")
                return
            
            # Remove completed todos
            remaining_todos = [todo for todo in todos if not todo.get('done', False)]
            app.save_todos(remaining_todos)
            
            print(f"Removed {len(completed_todos)} completed todo(s)")
            for todo in completed_todos:
                print(f"  #{todo['id']} - {todo['text']}")
            
        else:
            # Remove specific todo by ID
            if len(args) != 1:
                print("Error: Please provide exactly one todo ID")
                return
            
            try:
                todo_id = int(args[0])
            except ValueError:
                print(f"Error: '{args[0]}' is not a valid todo ID")
                return
            
            # Load todos
            todos = app.load_todos()
            
            if not todos:
                print("No todos found.")
                return
            
            # Find todo to remove
            todo_to_remove = None
            for todo in todos:
                if todo['id'] == todo_id:
                    todo_to_remove = todo
                    break
            
            if not todo_to_remove:
                print(f"Error: Todo #{todo_id} not found")
                return
            
            # Remove todo using app function
            success = app.delete_todo(todo_id)
            
            if success:
                print(f"Removed: #{todo_to_remove['id']} - {todo_to_remove['text']}")
            else:
                print(f"Error: Failed to remove todo #{todo_id}")
        
    except Exception as e:
        print(f"Error removing todo(s): {e}")


def help(args):
    """
    Display usage information and command examples.
    
    Args:
        args: List of command-line arguments (unused)
    """
    help_text = """
Todo CLI - Command Usage

COMMANDS:
  add <task>              Add a new todo item
  list [--all|--done]     Display todos (default: incomplete only)
  done <id> [<id>...]     Mark todo(s) as completed
  remove <id>             Remove a specific todo
  remove --done           Remove all completed todos
  help                    Show this help message

OPTIONS:
  --priority <level>      Set priority when adding (use with 'add')
  --all                   Show all todos (use with 'list')
  --done                  Show only completed todos (use with 'list')

EXAMPLES:
  todo add Buy groceries
  todo add --priority high Fix critical bug
  todo add "Meeting at 3pm with client"
  
  todo list
  todo list --all
  todo list --done
  
  todo done 1
  todo done 1 2 3
  
  todo remove 1
  todo remove --done
  
  todo help

NOTES:
  - Todo IDs are automatically assigned when items are created
  - Use quotes around task descriptions containing special characters
  - Multiple todo IDs can be marked as done in a single command
  - The --done flag with remove will delete ALL completed todos
"""
    print(help_text.strip())