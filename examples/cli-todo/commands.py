"""
CLI Commands Module

This module implements command-line interface operations for the todo application.
Provides functions for adding, listing, completing, removing, and getting help for todos.
"""

import argparse
import sys
from typing import List, Optional, Dict, Any
from datetime import datetime

import app
import utils


def add(args: List[str]) -> None:
    """
    Add a new todo item with optional priority.
    
    Args:
        args: Command line arguments containing task description and optional --priority flag
        
    Usage:
        add "Task description" [--priority high|medium|low]
    """
    if not args:
        print("Error: Task description is required")
        print("Usage: add \"Task description\" [--priority high|medium|low]")
        return
    
    try:
        # Parse arguments manually to handle task description and priority
        task_parts = []
        priority = "medium"  # default priority
        
        i = 0
        while i < len(args):
            if args[i] == "--priority" and i + 1 < len(args):
                priority_value = args[i + 1].lower()
                if priority_value in ["high", "medium", "low"]:
                    priority = priority_value
                    i += 2
                else:
                    print(f"Error: Invalid priority '{args[i + 1]}'. Use: high, medium, or low")
                    return
            else:
                task_parts.append(args[i])
                i += 1
        
        if not task_parts:
            print("Error: Task description is required")
            return
            
        task_description = " ".join(task_parts)
        
        # Add the todo using the app module
        todo_id = app.add_todo(task_description, priority=priority)
        print(f"Added: #{todo_id} - {task_description}")
        
    except Exception as e:
        print(f"Error adding todo: {e}")


def list(args: List[str]) -> None:
    """
    List todos with optional filtering.
    
    Args:
        args: Command line arguments containing optional --all or --done flags
        
    Usage:
        list [--all|--done]
    """
    try:
        # Parse flags
        show_all = "--all" in args
        show_done = "--done" in args
        
        if show_all and show_done:
            print("Error: Cannot use both --all and --done flags together")
            return
        
        # Load todos
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Filter todos based on flags
        filtered_todos = []
        
        for todo in todos:
            if show_done and todo.get("done", False):
                filtered_todos.append(todo)
            elif show_all:
                filtered_todos.append(todo)
            elif not show_done and not todo.get("done", False):
                filtered_todos.append(todo)
        
        if not filtered_todos:
            status_msg = "completed" if show_done else "pending"
            print(f"No {status_msg} todos found.")
            return
        
        # Format todos for display
        table_data = []
        headers = ["ID", "Status", "Priority", "Description", "Created"]
        
        for todo in filtered_todos:
            status = "[✓]" if todo.get("done", False) else "[ ]"
            priority = todo.get("priority", "medium").upper()
            description = todo.get("description", "")
            created = todo.get("created", "")
            
            # Format created date if it exists
            if created:
                try:
                    created_dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                    created = created_dt.strftime("%Y-%m-%d %H:%M")
                except (ValueError, AttributeError):
                    created = str(created)[:16]  # Truncate if parsing fails
            
            table_data.append([
                str(todo.get("id", "")),
                status,
                priority,
                description[:50] + "..." if len(description) > 50 else description,
                created
            ])
        
        # Display formatted table
        formatted_table = utils.format_table(headers, table_data)
        print(formatted_table)
        
        # Show summary
        total = len(filtered_todos)
        if show_all:
            completed = sum(1 for todo in filtered_todos if todo.get("done", False))
            pending = total - completed
            print(f"\nTotal: {total} todos ({completed} completed, {pending} pending)")
        else:
            status = "completed" if show_done else "pending"
            print(f"\nTotal: {total} {status} todos")
            
    except Exception as e:
        print(f"Error listing todos: {e}")


def done(args: List[str]) -> None:
    """
    Mark one or more todos as completed.
    
    Args:
        args: Command line arguments containing todo ID(s)
        
    Usage:
        done <id1> [id2] [id3] ...
    """
    if not args:
        print("Error: Todo ID(s) required")
        print("Usage: done <id1> [id2] [id3] ...")
        return
    
    try:
        # Parse and validate IDs
        todo_ids = []
        for arg in args:
            try:
                todo_id = int(arg)
                todo_ids.append(todo_id)
            except ValueError:
                print(f"Error: Invalid todo ID '{arg}'. IDs must be numbers.")
                return
        
        # Load todos
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Find and validate todos exist
        todos_to_complete = []
        existing_ids = {todo.get("id") for todo in todos}
        
        for todo_id in todo_ids:
            if todo_id not in existing_ids:
                print(f"Error: Todo with ID {todo_id} not found.")
                return
            
            # Find the todo
            for todo in todos:
                if todo.get("id") == todo_id:
                    if todo.get("done", False):
                        print(f"Warning: Todo #{todo_id} is already completed.")
                    else:
                        todos_to_complete.append(todo)
                    break
        
        if not todos_to_complete:
            print("No todos to mark as completed.")
            return
        
        # Mark todos as completed
        current_time = datetime.now().isoformat()
        completed_todos = []
        
        for todo in todos_to_complete:
            todo["done"] = True
            todo["completed_at"] = current_time
            completed_todos.append(todo)
        
        # Save changes
        app.save_todos(todos)
        
        # Display success messages
        for todo in completed_todos:
            print(f"Completed: #{todo['id']} - {todo.get('description', '')}")
        
        if len(completed_todos) > 1:
            print(f"\nMarked {len(completed_todos)} todos as completed.")
            
    except Exception as e:
        print(f"Error marking todos as done: {e}")


def remove(args: List[str]) -> None:
    """
    Remove one or more todos by ID or remove all completed todos.
    
    Args:
        args: Command line arguments containing todo ID(s) or --done flag
        
    Usage:
        remove <id1> [id2] [id3] ...
        remove --done
    """
    if not args:
        print("Error: Todo ID(s) or --done flag required")
        print("Usage: remove <id1> [id2] [id3] ... OR remove --done")
        return
    
    try:
        # Check for --done flag
        if "--done" in args:
            if len(args) > 1:
                print("Error: Cannot use --done flag with specific IDs")
                return
            _remove_completed_todos()
            return
        
        # Parse and validate IDs
        todo_ids = []
        for arg in args:
            try:
                todo_id = int(arg)
                todo_ids.append(todo_id)
            except ValueError:
                print(f"Error: Invalid todo ID '{arg}'. IDs must be numbers.")
                return
        
        # Load todos
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        # Find and validate todos exist
        todos_to_remove = []
        existing_ids = {todo.get("id") for todo in todos}
        
        for todo_id in todo_ids:
            if todo_id not in existing_ids:
                print(f"Error: Todo with ID {todo_id} not found.")
                return
            
            # Find the todo
            for todo in todos:
                if todo.get("id") == todo_id:
                    todos_to_remove.append(todo)
                    break
        
        # Remove todos
        removed_todos = []
        for todo in todos_to_remove:
            try:
                app.delete_todo(todo["id"])
                removed_todos.append(todo)
            except Exception as e:
                print(f"Error removing todo #{todo['id']}: {e}")
        
        # Display success messages
        for todo in removed_todos:
            print(f"Removed: #{todo['id']} - {todo.get('description', '')}")
        
        if len(removed_todos) > 1:
            print(f"\nRemoved {len(removed_todos)} todos.")
            
    except Exception as e:
        print(f"Error removing todos: {e}")


def _remove_completed_todos() -> None:
    """Helper function to remove all completed todos."""
    try:
        todos = app.load_todos()
        
        if not todos:
            print("No todos found.")
            return
        
        completed_todos = [todo for todo in todos if todo.get("done", False)]
        
        if not completed_todos:
            print("No completed todos to remove.")
            return
        
        # Remove completed todos
        removed_count = 0
        for todo in completed_todos:
            try:
                app.delete_todo(todo["id"])
                removed_count += 1
                print(f"Removed: #{todo['id']} - {todo.get('description', '')}")
            except Exception as e:
                print(f"Error removing todo #{todo['id']}: {e}")
        
        if removed_count > 0:
            print(f"\nRemoved {removed_count} completed todos.")
            
    except Exception as e:
        print(f"Error removing completed todos: {e}")


def help(args: List[str]) -> None:
    """
    Display help information and usage examples.
    
    Args:
        args: Command line arguments (unused)
    """
    help_text = """
Todo CLI - Command Line Task Manager

USAGE:
    python todo.py <command> [arguments]

COMMANDS:
    add <description> [--priority high|medium|low]
        Add a new todo item with optional priority
        Examples:
            add "Buy groceries"
            add "Complete project" --priority high

    list [--all|--done]
        List todos with optional filtering
        Examples:
            list                    # Show pending todos
            list --all             # Show all todos
            list --done            # Show completed todos only

    done <id1> [id2] [id3] ...
        Mark one or more todos as completed
        Examples:
            done 1                 # Mark todo #1 as done
            done 1 2 3            # Mark multiple todos as done

    remove <id1> [id2] [id3] ...
    remove --done
        Remove todos by ID or remove all completed todos
        Examples:
            remove 1               # Remove todo #1
            remove 1 2 3          # Remove multiple todos
            remove --done         # Remove all completed todos

    help
        Show this help message

EXAMPLES:
    python todo.py add "Learn Python" --priority high
    python todo.py list --all
    python todo.py done 1 2
    python todo.py remove --done

NOTES:
    - Todo IDs are automatically assigned when adding new todos
    - Priorities: high, medium (default), low
    - Completed todos show [✓], pending todos show [ ]
    - Use quotes around task descriptions with spaces
    """
    
    print(help_text.strip())