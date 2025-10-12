"""
Command implementations for CLI todo operations.

This module contains all the command functions that handle user interactions
with the todo application, including adding, listing, completing, and removing todos.
"""

import argparse
import sys
from datetime import datetime
from typing import List, Optional

import app
import utils


def add(args: List[str]) -> None:
    """
    Add a new todo item with optional priority.
    
    Args:
        args: Command line arguments containing todo text and optional --priority flag
        
    Examples:
        add Buy groceries
        add "Finish project" --priority high
    """
    if not args:
        print("Error: Todo text is required")
        print("Usage: add <todo_text> [--priority high|medium|low]")
        return
    
    # Parse priority flag
    priority = "medium"  # default
    todo_text_parts = []
    
    i = 0
    while i < len(args):
        if args[i] == "--priority" and i + 1 < len(args):
            priority_value = args[i + 1].lower()
            if priority_value in ["high", "medium", "low"]:
                priority = priority_value
                i += 2  # Skip both --priority and its value
            else:
                print(f"Error: Invalid priority '{args[i + 1]}'. Use high, medium, or low")
                return
        else:
            todo_text_parts.append(args[i])
            i += 1
    
    if not todo_text_parts:
        print("Error: Todo text is required")
        return
    
    todo_text = " ".join(todo_text_parts).strip()
    if not todo_text:
        print("Error: Todo text cannot be empty")
        return
    
    try:
        todo_id = app.add_todo(todo_text, priority)
        print(f"Added: #{todo_id} - {todo_text}")
        if priority != "medium":
            print(f"Priority: {priority}")
    except Exception as e:
        print(f"Error adding todo: {e}")


def list(args: List[str]) -> None:
    """
    List todos with optional filtering.
    
    Args:
        args: Command line arguments containing optional --all or --done flags
        
    Examples:
        list
        list --all
        list --done
    """
    show_all = "--all" in args
    show_done = "--done" in args
    
    try:
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Filter todos based on flags
        if show_done:
            filtered_todos = [todo for todo in todos if todo.get("done", False)]
        elif show_all:
            filtered_todos = todos
        else:
            # Default: show only incomplete todos
            filtered_todos = [todo for todo in todos if not todo.get("done", False)]
        
        if not filtered_todos:
            if show_done:
                print("No completed todos found.")
            else:
                print("No pending todos found.")
            return
        
        # Prepare data for table formatting
        table_data = []
        headers = ["ID", "Status", "Priority", "Task", "Created"]
        
        for todo in filtered_todos:
            status = "[✓]" if todo.get("done", False) else "[ ]"
            priority = todo.get("priority", "medium")
            task = todo.get("text", "")
            created = todo.get("created", "")
            
            # Format created date if it exists
            if created:
                try:
                    if isinstance(created, str):
                        created_dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                    else:
                        created_dt = created
                    created = created_dt.strftime("%Y-%m-%d %H:%M")
                except (ValueError, AttributeError):
                    created = str(created)[:16]  # Fallback formatting
            
            table_data.append([
                str(todo.get("id", "")),
                status,
                priority.capitalize(),
                task,
                created
            ])
        
        # Display formatted table
        formatted_table = utils.format_table(headers, table_data)
        print(formatted_table)
        
        # Show summary
        total_todos = len(todos)
        completed_todos = len([t for t in todos if t.get("done", False)])
        pending_todos = total_todos - completed_todos
        
        print(f"\nSummary: {total_todos} total, {completed_todos} completed, {pending_todos} pending")
        
    except Exception as e:
        print(f"Error loading todos: {e}")


def done(args: List[str]) -> None:
    """
    Mark one or more todos as completed.
    
    Args:
        args: Command line arguments containing todo IDs
        
    Examples:
        done 1
        done 1 3 5
    """
    if not args:
        print("Error: Todo ID(s) required")
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
        existing_ids = {todo.get("id") for todo in todos}
        
        # Validate all IDs exist before processing any
        invalid_ids = [tid for tid in todo_ids if tid not in existing_ids]
        if invalid_ids:
            print(f"Error: Todo ID(s) not found: {', '.join(map(str, invalid_ids))}")
            return
        
        # Mark todos as complete
        completed_count = 0
        for todo in todos:
            if todo.get("id") in todo_ids:
                if not todo.get("done", False):
                    todo["done"] = True
                    todo["completed_at"] = datetime.now().isoformat()
                    print(f"Completed: #{todo['id']} - {todo.get('text', '')}")
                    completed_count += 1
                else:
                    print(f"Already completed: #{todo['id']} - {todo.get('text', '')}")
        
        if completed_count > 0:
            app.save_todos(todos)
            print(f"\n{completed_count} todo(s) marked as completed.")
        
    except Exception as e:
        print(f"Error completing todos: {e}")


def remove(args: List[str]) -> None:
    """
    Remove todos by ID or remove all completed todos.
    
    Args:
        args: Command line arguments containing todo ID or --done flag
        
    Examples:
        remove 1
        remove --done
    """
    if not args:
        print("Error: Todo ID or --done flag required")
        print("Usage: remove <id> OR remove --done")
        return
    
    try:
        if "--done" in args:
            # Remove all completed todos
            todos = app.load_todos()
            completed_todos = [todo for todo in todos if todo.get("done", False)]
            
            if not completed_todos:
                print("No completed todos to remove.")
                return
            
            # Show what will be removed
            print("Removing completed todos:")
            for todo in completed_todos:
                print(f"  #{todo.get('id')} - {todo.get('text', '')}")
            
            # Remove completed todos
            remaining_todos = [todo for todo in todos if not todo.get("done", False)]
            app.save_todos(remaining_todos)
            
            print(f"\nRemoved {len(completed_todos)} completed todo(s).")
            
        else:
            # Remove specific todo by ID
            if len(args) != 1:
                print("Error: Please specify exactly one todo ID")
                return
            
            try:
                todo_id = int(args[0])
            except ValueError:
                print(f"Error: '{args[0]}' is not a valid todo ID")
                return
            
            todos = app.load_todos()
            todo_to_remove = None
            
            # Find the todo to remove
            for todo in todos:
                if todo.get("id") == todo_id:
                    todo_to_remove = todo
                    break
            
            if not todo_to_remove:
                print(f"Error: Todo ID {todo_id} not found")
                return
            
            # Remove the todo
            app.delete_todo(todo_id)
            print(f"Removed: #{todo_id} - {todo_to_remove.get('text', '')}")
            
    except Exception as e:
        print(f"Error removing todos: {e}")


def help(args: List[str]) -> None:
    """
    Display comprehensive usage information and examples.
    
    Args:
        args: Command line arguments (unused)
    """
    help_text = """
Todo CLI - Command Reference

USAGE:
    todo <command> [arguments]

COMMANDS:

    add <text> [--priority high|medium|low]
        Add a new todo item with optional priority
        
        Examples:
            todo add "Buy groceries"
            todo add "Finish project" --priority high
            todo add Call mom --priority low

    list [--all] [--done]
        Display todos in a formatted table
        
        Options:
            (no flags)  Show only pending todos
            --all       Show all todos (pending and completed)
            --done      Show only completed todos
        
        Examples:
            todo list
            todo list --all
            todo list --done

    done <id> [id2] [id3] ...
        Mark one or more todos as completed
        
        Examples:
            todo done 1
            todo done 1 3 5
            todo done 2

    remove <id>
    remove --done
        Remove a specific todo by ID, or remove all completed todos
        
        Examples:
            todo remove 1
            todo remove --done

    help
        Show this help message

EXAMPLES:
    # Add some todos
    todo add "Learn Python" --priority high
    todo add "Buy coffee"
    todo add "Walk the dog" --priority low
    
    # List all todos
    todo list
    
    # Complete a todo
    todo done 1
    
    # List only completed todos
    todo list --done
    
    # Remove completed todos
    todo remove --done

PRIORITY LEVELS:
    high    - Important and urgent tasks
    medium  - Default priority for regular tasks  
    low     - Nice-to-have or low-priority tasks

For more information, visit: https://github.com/yourusername/todo-cli
"""
    print(help_text.strip())


def _validate_todo_id(id_str: str) -> Optional[int]:
    """
    Helper function to validate and convert todo ID string to integer.
    
    Args:
        id_str: String representation of todo ID
        
    Returns:
        Integer ID if valid, None otherwise
    """
    try:
        todo_id = int(id_str)
        if todo_id <= 0:
            return None
        return todo_id
    except ValueError:
        return None


def _parse_priority(args: List[str]) -> tuple[List[str], str]:
    """
    Helper function to extract priority flag from arguments.
    
    Args:
        args: List of command arguments
        
    Returns:
        Tuple of (remaining_args, priority)
    """
    priority = "medium"
    remaining_args = []
    
    i = 0
    while i < len(args):
        if args[i] == "--priority" and i + 1 < len(args):
            priority_value = args[i + 1].lower()
            if priority_value in ["high", "medium", "low"]:
                priority = priority_value
            i += 2  # Skip both --priority and its value
        else:
            remaining_args.append(args[i])
            i += 1
    
    return remaining_args, priority