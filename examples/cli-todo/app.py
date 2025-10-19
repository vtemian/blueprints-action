"""
Todo Storage Module

This module provides core todo storage and operations using JSON file persistence.
All todos are stored in ~/.todos.json with automatic backup and recovery capabilities.
"""

import json
import os
import datetime
from utils import *


def load_todos():
    """
    Load todos from ~/.todos.json file.
    
    Returns:
        list: List of todo dictionaries. Returns empty list if file doesn't exist
              or is corrupted.
    """
    file_path = os.path.expanduser("~/.todos.json")
    
    try:
        # Check if file exists, create empty one if not
        if not os.path.exists(file_path):
            with open(file_path, 'w') as f:
                json.dump([], f, indent=2)
            return []
        
        # Read and parse JSON file
        with open(file_path, 'r') as f:
            content = f.read().strip()
            
            # Handle empty file case
            if not content:
                with open(file_path, 'w') as write_f:
                    json.dump([], write_f, indent=2)
                return []
            
            todos = json.loads(content)
            
            # Validate that we have a list
            if not isinstance(todos, list):
                raise json.JSONDecodeError("Root element is not a list", content, 0)
            
            # Validate each todo structure
            validated_todos = []
            for todo in todos:
                if (isinstance(todo, dict) and 
                    'id' in todo and 'text' in todo and 'done' in todo and 
                    'created' in todo and 'priority' in todo):
                    validated_todos.append(todo)
                else:
                    print(f"Warning: Skipping invalid todo structure: {todo}")
            
            return validated_todos
            
    except FileNotFoundError:
        print(f"Error: Could not find {file_path}")
        return []
    except PermissionError:
        print(f"Error: Permission denied accessing {file_path}")
        return []
    except json.JSONDecodeError as e:
        print(f"Error: Corrupted JSON in {file_path}. Creating backup and starting fresh.")
        # Create backup of corrupted file
        backup_path = file_path + ".backup"
        try:
            if os.path.exists(file_path):
                os.rename(file_path, backup_path)
                print(f"Backup created at {backup_path}")
        except OSError:
            print("Warning: Could not create backup file")
        
        # Create new empty file
        try:
            with open(file_path, 'w') as f:
                json.dump([], f, indent=2)
        except (PermissionError, OSError):
            print(f"Error: Could not recreate {file_path}")
        
        return []


def save_todos(todos):
    """
    Save todos list to ~/.todos.json file.
    
    Args:
        todos (list): List of todo dictionaries to save
    """
    if not isinstance(todos, list):
        print("Error: todos must be a list")
        return
    
    file_path = os.path.expanduser("~/.todos.json")
    
    try:
        with open(file_path, 'w') as f:
            json.dump(todos, f, indent=2)
    except PermissionError:
        print(f"Error: Permission denied writing to {file_path}")
    except OSError as e:
        print(f"Error: Could not write to {file_path}: {e}")


def add_todo(text, priority="medium"):
    """
    Create and add a new todo item.
    
    Args:
        text (str): Description of the todo task
        priority (str): Priority level ("low", "medium", "high"). Defaults to "medium"
    
    Returns:
        dict: The created todo item, or None if creation failed
    """
    if not isinstance(text, str) or not text.strip():
        print("Error: Todo text must be a non-empty string")
        return None
    
    # Validate and normalize priority
    valid_priorities = ["low", "medium", "high"]
    if priority not in valid_priorities:
        print(f"Warning: Invalid priority '{priority}'. Using 'medium' instead.")
        priority = "medium"
    
    # Load existing todos to generate new ID
    todos = load_todos()
    
    # Generate new ID
    if todos:
        new_id = max(todo['id'] for todo in todos) + 1
    else:
        new_id = 1
    
    # Create new todo
    new_todo = {
        "id": new_id,
        "text": text.strip(),
        "done": False,
        "created": datetime.datetime.now().isoformat(),
        "priority": priority
    }
    
    # Add to todos list and save
    todos.append(new_todo)
    save_todos(todos)
    
    return new_todo


def get_todo(id):
    """
    Find and return a todo by its ID.
    
    Args:
        id (int): The ID of the todo to find
    
    Returns:
        dict: The todo item if found, None otherwise
    """
    try:
        id = int(id)
    except (ValueError, TypeError):
        print("Error: ID must be a valid integer")
        return None
    
    todos = load_todos()
    
    for todo in todos:
        if todo['id'] == id:
            return todo
    
    return None


def update_todo(id, changes):
    """
    Update a todo item with the provided changes.
    
    Args:
        id (int): The ID of the todo to update
        changes (dict): Dictionary containing fields to update
    
    Returns:
        dict: The updated todo item, or None if todo not found or update failed
    """
    try:
        id = int(id)
    except (ValueError, TypeError):
        print("Error: ID must be a valid integer")
        return None
    
    if not isinstance(changes, dict):
        print("Error: Changes must be a dictionary")
        return None
    
    todos = load_todos()
    
    # Find the todo to update
    todo_index = None
    for i, todo in enumerate(todos):
        if todo['id'] == id:
            todo_index = i
            break
    
    if todo_index is None:
        print(f"Error: Todo with ID {id} not found")
        return None
    
    # Apply changes with validation
    updated_todo = todos[todo_index].copy()
    
    for key, value in changes.items():
        if key == 'id':
            print("Warning: Cannot change todo ID")
            continue
        elif key == 'created':
            print("Warning: Cannot change creation timestamp")
            continue
        elif key == 'priority':
            valid_priorities = ["low", "medium", "high"]
            if value not in valid_priorities:
                print(f"Warning: Invalid priority '{value}'. Keeping current priority.")
                continue
        elif key == 'done':
            if not isinstance(value, bool):
                print(f"Warning: 'done' must be boolean. Skipping update for this field.")
                continue
        elif key == 'text':
            if not isinstance(value, str) or not value.strip():
                print(f"Warning: 'text' must be non-empty string. Skipping update for this field.")
                continue
            value = value.strip()
        
        updated_todo[key] = value
    
    # Update the todo in the list and save
    todos[todo_index] = updated_todo
    save_todos(todos)
    
    return updated_todo


def delete_todo(id):
    """
    Delete a todo item by its ID.
    
    Args:
        id (int): The ID of the todo to delete
    
    Returns:
        bool: True if todo was found and deleted, False otherwise
    """
    try:
        id = int(id)
    except (ValueError, TypeError):
        print("Error: ID must be a valid integer")
        return False
    
    todos = load_todos()
    
    # Find and remove the todo
    for i, todo in enumerate(todos):
        if todo['id'] == id:
            todos.pop(i)
            save_todos(todos)
            return True
    
    return False


def filter_todos(todos, done=None, priority=None):
    """
    Filter todos by completion status and/or priority.
    
    Args:
        todos (list): List of todo dictionaries to filter
        done (bool, optional): Filter by completion status (True/False)
        priority (str, optional): Filter by priority ("low", "medium", "high")
    
    Returns:
        list: Filtered list of todos (does not modify original list)
    """
    if not isinstance(todos, list):
        print("Error: todos must be a list")
        return []
    
    # Create a copy to avoid modifying the original list
    filtered = todos.copy()
    
    # Filter by done status
    if done is not None:
        if not isinstance(done, bool):
            print("Warning: 'done' filter must be boolean. Ignoring done filter.")
        else:
            filtered = [todo for todo in filtered if todo.get('done') == done]
    
    # Filter by priority
    if priority is not None:
        valid_priorities = ["low", "medium", "high"]
        if priority not in valid_priorities:
            print(f"Warning: Invalid priority filter '{priority}'. Ignoring priority filter.")
        else:
            filtered = [todo for todo in filtered if todo.get('priority') == priority]
    
    return filtered