"""
Todo Storage and Management System

A comprehensive todo management system with persistent JSON storage,
robust error handling, and atomic file operations.

Author: Assistant
Version: 1.0.0
"""

import json
import os
import datetime
import shutil
from typing import List, Dict, Optional, Any, Union

# from utils import *  # Not implemented yet


# Configuration constants
TODO_FILE_PATH = os.path.expanduser("~/.todos.json")
BACKUP_FILE_PATH = f"{TODO_FILE_PATH}.backup"
VALID_PRIORITIES = {"low", "medium", "high"}
DEFAULT_PRIORITY = "medium"


def load_todos() -> List[Dict[str, Any]]:
    """
    Load todos from the JSON file with comprehensive error handling.
    
    Handles missing files, corrupted JSON, and permission errors gracefully.
    Creates backup of corrupted files before attempting recovery.
    
    Returns:
        List[Dict[str, Any]]: List of todo dictionaries, empty list if file 
                             doesn't exist or is corrupted.
    
    Raises:
        PermissionError: If file exists but cannot be read due to permissions.
    """
    try:
        if not os.path.exists(TODO_FILE_PATH):
            print(f"Info: Todo file {TODO_FILE_PATH} does not exist. Starting with empty list.")
            return []
        
        with open(TODO_FILE_PATH, 'r', encoding='utf-8') as file:
            todos = json.load(file)
            
        # Validate that todos is a list
        if not isinstance(todos, list):
            raise ValueError("Todo file contains invalid data structure (not a list)")
            
        # Validate each todo item structure
        for i, todo in enumerate(todos):
            if not isinstance(todo, dict):
                raise ValueError(f"Todo item {i} is not a dictionary")
            
            required_fields = {'id', 'text', 'done', 'created', 'priority'}
            if not required_fields.issubset(todo.keys()):
                missing = required_fields - todo.keys()
                raise ValueError(f"Todo item {i} missing required fields: {missing}")
        
        print(f"Info: Successfully loaded {len(todos)} todos from {TODO_FILE_PATH}")
        return todos
        
    except FileNotFoundError:
        print(f"Info: Todo file {TODO_FILE_PATH} not found. Starting with empty list.")
        return []
        
    except PermissionError as e:
        print(f"Error: Permission denied accessing {TODO_FILE_PATH}: {e}")
        raise
        
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Error: Corrupted todo file detected: {e}")
        
        # Create backup of corrupted file
        try:
            if os.path.exists(TODO_FILE_PATH):
                shutil.copy2(TODO_FILE_PATH, BACKUP_FILE_PATH)
                print(f"Info: Corrupted file backed up to {BACKUP_FILE_PATH}")
        except Exception as backup_error:
            print(f"Warning: Could not create backup: {backup_error}")
        
        print("Info: Starting with empty todo list due to file corruption.")
        return []
        
    except Exception as e:
        print(f"Error: Unexpected error loading todos: {e}")
        return []


def save_todos(todos: List[Dict[str, Any]]) -> bool:
    """
    Save todos to JSON file using atomic write operations.
    
    Uses temporary file and atomic rename to prevent data corruption
    during write operations.
    
    Args:
        todos (List[Dict[str, Any]]): List of todo dictionaries to save.
        
    Returns:
        bool: True if save successful, False otherwise.
        
    Raises:
        PermissionError: If unable to write to file due to permissions.
        ValueError: If todos data is invalid.
    """
    if not isinstance(todos, list):
        raise ValueError("Todos must be a list")
    
    # Validate each todo before saving
    for i, todo in enumerate(todos):
        if not isinstance(todo, dict):
            raise ValueError(f"Todo item {i} must be a dictionary")
        
        required_fields = {'id', 'text', 'done', 'created', 'priority'}
        if not required_fields.issubset(todo.keys()):
            missing = required_fields - todo.keys()
            raise ValueError(f"Todo item {i} missing required fields: {missing}")
    
    temp_file_path = f"{TODO_FILE_PATH}.tmp"
    
    try:
        # Write to temporary file first
        with open(temp_file_path, 'w', encoding='utf-8') as temp_file:
            json.dump(todos, temp_file, indent=2, ensure_ascii=False)
            temp_file.flush()  # Ensure data is written to disk
            os.fsync(temp_file.fileno())  # Force write to disk
        
        # Atomic rename - this is atomic on most filesystems
        os.rename(temp_file_path, TODO_FILE_PATH)
        
        print(f"Info: Successfully saved {len(todos)} todos to {TODO_FILE_PATH}")
        return True
        
    except PermissionError as e:
        print(f"Error: Permission denied writing to {TODO_FILE_PATH}: {e}")
        # Clean up temp file if it exists
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
        raise
        
    except Exception as e:
        print(f"Error: Failed to save todos: {e}")
        # Clean up temp file if it exists
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
        return False


def add_todo(text: str, priority: str = DEFAULT_PRIORITY) -> Optional[Dict[str, Any]]:
    """
    Add a new todo item with auto-incrementing ID and current timestamp.
    
    Args:
        text (str): Description of the todo task.
        priority (str): Priority level ("low", "medium", "high").
                       Defaults to "medium".
    
    Returns:
        Optional[Dict[str, Any]]: The created todo dictionary if successful,
                                 None if creation failed.
    
    Raises:
        ValueError: If text is empty or priority is invalid.
    """
    # Validate input parameters
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Todo text must be a non-empty string")
    
    if priority not in VALID_PRIORITIES:
        raise ValueError(f"Priority must be one of: {', '.join(VALID_PRIORITIES)}")
    
    try:
        # Load existing todos to determine next ID
        todos = load_todos()
        
        # Generate new ID (max existing ID + 1, or 1 if no todos exist)
        if todos:
            max_id = max(todo.get('id', 0) for todo in todos)
            new_id = max_id + 1
        else:
            new_id = 1
        
        # Create new todo
        new_todo = {
            'id': new_id,
            'text': text.strip(),
            'done': False,
            'created': datetime.datetime.now().isoformat(),
            'priority': priority
        }
        
        # Add to todos list and save
        todos.append(new_todo)
        
        if save_todos(todos):
            print(f"Info: Added new todo with ID {new_id}")
            return new_todo
        else:
            print("Error: Failed to save new todo")
            return None
            
    except Exception as e:
        print(f"Error: Failed to add todo: {e}")
        return None


def get_todo(todo_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieve a specific todo by its ID.
    
    Args:
        todo_id (int): The ID of the todo to retrieve.
        
    Returns:
        Optional[Dict[str, Any]]: The todo dictionary if found, None otherwise.
        
    Raises:
        ValueError: If todo_id is not a positive integer.
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        raise ValueError("Todo ID must be a positive integer")
    
    try:
        todos = load_todos()
        
        for todo in todos:
            if todo.get('id') == todo_id:
                return todo
        
        print(f"Info: Todo with ID {todo_id} not found")
        return None
        
    except Exception as e:
        print(f"Error: Failed to retrieve todo {todo_id}: {e}")
        return None


def update_todo(todo_id: int, changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Update specific fields of an existing todo.
    
    Args:
        todo_id (int): The ID of the todo to update.
        changes (Dict[str, Any]): Dictionary of fields to update.
                                 Valid keys: 'text', 'done', 'priority'
    
    Returns:
        Optional[Dict[str, Any]]: The updated todo dictionary if successful,
                                 None if todo not found or update failed.
    
    Raises:
        ValueError: If todo_id is invalid or changes contain invalid data.
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        raise ValueError("Todo ID must be a positive integer")
    
    if not isinstance(changes, dict) or not changes:
        raise ValueError("Changes must be a non-empty dictionary")
    
    # Validate allowed fields
    allowed_fields = {'text', 'done', 'priority'}
    invalid_fields = set(changes.keys()) - allowed_fields
    if invalid_fields:
        raise ValueError(f"Invalid fields in changes: {', '.join(invalid_fields)}")
    
    # Validate specific field values
    if 'text' in changes:
        if not isinstance(changes['text'], str) or not changes['text'].strip():
            raise ValueError("Text must be a non-empty string")
    
    if 'done' in changes:
        if not isinstance(changes['done'], bool):
            raise ValueError("Done must be a boolean value")
    
    if 'priority' in changes:
        if changes['priority'] not in VALID_PRIORITIES:
            raise ValueError(f"Priority must be one of: {', '.join(VALID_PRIORITIES)}")
    
    try:
        todos = load_todos()
        
        # Find the todo to update
        todo_index = None
        for i, todo in enumerate(todos):
            if todo.get('id') == todo_id:
                todo_index = i
                break
        
        if todo_index is None:
            print(f"Info: Todo with ID {todo_id} not found")
            return None
        
        # Apply changes
        updated_todo = todos[todo_index].copy()
        for field, value in changes.items():
            if field == 'text':
                updated_todo[field] = value.strip()
            else:
                updated_todo[field] = value
        
        # Update the todo in the list
        todos[todo_index] = updated_todo
        
        # Save changes
        if save_todos(todos):
            print(f"Info: Updated todo {todo_id}")
            return updated_todo
        else:
            print(f"Error: Failed to save updates for todo {todo_id}")
            return None
            
    except Exception as e:
        print(f"Error: Failed to update todo {todo_id}: {e}")
        return None


def delete_todo(todo_id: int) -> bool:
    """
    Delete a todo by its ID.
    
    Args:
        todo_id (int): The ID of the todo to delete.
        
    Returns:
        bool: True if deletion successful, False if todo not found or 
              deletion failed.
              
    Raises:
        ValueError: If todo_id is not a positive integer.
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        raise ValueError("Todo ID must be a positive integer")
    
    try:
        todos = load_todos()
        
        # Find and remove the todo
        original_length = len(todos)
        todos = [todo for todo in todos if todo.get('id') != todo_id]
        
        if len(todos) == original_length:
            print(f"Info: Todo with ID {todo_id} not found")
            return False
        
        # Save the updated list
        if save_todos(todos):
            print(f"Info: Deleted todo {todo_id}")
            return True
        else:
            print(f"Error: Failed to save after deleting todo {todo_id}")
            return False
            
    except Exception as e:
        print(f"Error: Failed to delete todo {todo_id}: {e}")
        return False


def filter_todos(todos: List[Dict[str, Any]], 
                done: Optional[bool] = None, 
                priority: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Filter todos by completion status and/or priority level.
    
    Args:
        todos (List[Dict[str, Any]]): List of todo dictionaries to filter.
        done (Optional[bool]): Filter by completion status. 
                              None means no filtering by status.
        priority (Optional[str]): Filter by priority level.
                                 None means no filtering by priority.
    
    Returns:
        List[Dict[str, Any]]: Filtered list of todo dictionaries.
        
    Raises:
        ValueError: If todos is not a list or priority is invalid.
    """
    if not isinstance(todos, list):
        raise ValueError("Todos must be a list")
    
    if priority is not None and priority not in VALID_PRIORITIES:
        raise ValueError(f"Priority must be one of: {', '.join(VALID_PRIORITIES)}")
    
    if done is not None and not isinstance(done, bool):
        raise ValueError("Done filter must be a boolean value")
    
    try:
        filtered_todos = todos.copy()
        
        # Filter by completion status
        if done is not None:
            filtered_todos = [
                todo for todo in filtered_todos 
                if todo.get('done') == done
            ]
        
        # Filter by priority
        if priority is not None:
            filtered_todos = [
                todo for todo in filtered_todos 
                if todo.get('priority') == priority
            ]
        
        print(f"Info: Filtered {len(todos)} todos to {len(filtered_todos)} results")
        return filtered_todos
        
    except Exception as e:
        print(f"Error: Failed to filter todos: {e}")
        return []


# Utility functions for common operations
def get_all_todos() -> List[Dict[str, Any]]:
    """
    Convenience function to get all todos.
    
    Returns:
        List[Dict[str, Any]]: List of all todo dictionaries.
    """
    return load_todos()


def get_pending_todos() -> List[Dict[str, Any]]:
    """
    Convenience function to get all pending (not done) todos.
    
    Returns:
        List[Dict[str, Any]]: List of pending todo dictionaries.
    """
    todos = load_todos()
    return filter_todos(todos, done=False)


def get_completed_todos() -> List[Dict[str, Any]]:
    """
    Convenience function to get all completed todos.
    
    Returns:
        List[Dict[str, Any]]: List of completed todo dictionaries.
    """
    todos = load_todos()
    return filter_todos(todos, done=True)


def mark_todo_done(todo_id: int) -> Optional[Dict[str, Any]]:
    """
    Convenience function to mark a todo as completed.
    
    Args:
        todo_id (int): The ID of the todo to mark