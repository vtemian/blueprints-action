"""
Todo storage and core operations module with JSON file persistence.

This module provides a complete todo management system with persistent storage
using JSON files. It handles todo creation, retrieval, updates, deletion, and
filtering operations with robust error handling and data integrity features.

Storage location: ~/.todos.json
Dependencies: json, os, datetime, @utils (local import)
"""

import json
import os
import shutil
from datetime import datetime
from typing import List, Dict, Optional, Any, Union

try:
    from utils import *  # Local utils import as specified
except ImportError:
    # Graceful fallback if utils module is not available
    pass

# Constants
TODOS_FILE = os.path.expanduser("~/.todos.json")
BACKUP_SUFFIX = ".backup"
VALID_PRIORITIES = {"low", "medium", "high"}
DEFAULT_PRIORITY = "medium"


def load_todos() -> List[Dict[str, Any]]:
    """
    Read todos from ~/.todos.json and return as list of todo dictionaries.
    
    Auto-creates the file if it doesn't exist. Handles corrupted JSON by
    backing up the corrupted file and creating a clean empty file.
    
    Returns:
        List[Dict[str, Any]]: List of todo dictionaries
        
    Raises:
        PermissionError: If file cannot be read due to permissions
        OSError: If file operations fail for other reasons
    """
    try:
        # Check if file exists, create if not
        if not os.path.exists(TODOS_FILE):
            _create_empty_todos_file()
            return []
            
        with open(TODOS_FILE, 'r', encoding='utf-8') as file:
            content = file.read().strip()
            if not content:
                return []
            todos = json.loads(content)
            
        # Validate that we got a list
        if not isinstance(todos, list):
            raise ValueError("Todos file must contain a JSON array")
            
        return todos
        
    except json.JSONDecodeError as e:
        print(f"Warning: Corrupted todos file detected. Creating backup...")
        _backup_corrupted_file()
        _create_empty_todos_file()
        print(f"Created clean todos file. Corrupted file backed up to {TODOS_FILE}{BACKUP_SUFFIX}")
        return []
        
    except PermissionError:
        raise PermissionError(f"Permission denied: Cannot read todos file at {TODOS_FILE}")
        
    except OSError as e:
        raise OSError(f"Failed to load todos: {e}")


def save_todos(todos: List[Dict[str, Any]]) -> None:
    """
    Write todos list to ~/.todos.json using atomic operations.
    
    Args:
        todos (List[Dict[str, Any]]): List of todo dictionaries to save
        
    Raises:
        TypeError: If todos is not a list
        PermissionError: If file cannot be written due to permissions
        OSError: If file operations fail
    """
    if not isinstance(todos, list):
        raise TypeError("Todos must be a list")
        
    # Validate each todo structure
    for i, todo in enumerate(todos):
        if not isinstance(todo, dict):
            raise TypeError(f"Todo at index {i} must be a dictionary")
        _validate_todo_structure(todo)
    
    temp_file = f"{TODOS_FILE}.tmp"
    
    try:
        # Write to temporary file first (atomic operation)
        with open(temp_file, 'w', encoding='utf-8') as file:
            json.dump(todos, file, indent=2, ensure_ascii=False)
            file.flush()  # Ensure data is written to disk
            os.fsync(file.fileno())  # Force write to disk
            
        # Atomically replace the original file
        if os.name == 'nt':  # Windows
            if os.path.exists(TODOS_FILE):
                os.replace(temp_file, TODOS_FILE)
            else:
                os.rename(temp_file, TODOS_FILE)
        else:  # Unix-like systems
            os.rename(temp_file, TODOS_FILE)
            
    except PermissionError:
        # Clean up temp file if it exists
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass
        raise PermissionError(f"Permission denied: Cannot write to todos file at {TODOS_FILE}")
        
    except OSError as e:
        # Clean up temp file if it exists
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass
        raise OSError(f"Failed to save todos: {e}")


def add_todo(text: str, priority: str = DEFAULT_PRIORITY) -> Dict[str, Any]:
    """
    Create a new todo with auto-generated ID and timestamp.
    
    Args:
        text (str): Description of the todo task
        priority (str): Priority level (low, medium, high). Defaults to "medium"
        
    Returns:
        Dict[str, Any]: The newly created todo dictionary
        
    Raises:
        ValueError: If text is empty or priority is invalid
        TypeError: If arguments are not strings
    """
    if not isinstance(text, str):
        raise TypeError("Todo text must be a string")
    if not isinstance(priority, str):
        raise TypeError("Priority must be a string")
        
    text = text.strip()
    if not text:
        raise ValueError("Todo text cannot be empty")
        
    priority = priority.lower()
    if priority not in VALID_PRIORITIES:
        raise ValueError(f"Priority must be one of: {', '.join(VALID_PRIORITIES)}")
    
    todos = load_todos()
    
    # Generate unique sequential ID
    next_id = 1
    if todos:
        existing_ids = [todo.get('id', 0) for todo in todos if isinstance(todo.get('id'), int)]
        if existing_ids:
            next_id = max(existing_ids) + 1
    
    # Create new todo
    new_todo = {
        "id": next_id,
        "text": text,
        "done": False,
        "created": datetime.now().isoformat(),
        "priority": priority
    }
    
    todos.append(new_todo)
    save_todos(todos)
    
    return new_todo


def get_todo(todo_id: int) -> Optional[Dict[str, Any]]:
    """
    Find and return todo by ID.
    
    Args:
        todo_id (int): The ID of the todo to retrieve
        
    Returns:
        Optional[Dict[str, Any]]: Todo dictionary if found, None otherwise
        
    Raises:
        TypeError: If todo_id is not an integer
    """
    if not isinstance(todo_id, int):
        raise TypeError("Todo ID must be an integer")
        
    todos = load_todos()
    
    for todo in todos:
        if todo.get('id') == todo_id:
            return todo.copy()  # Return a copy to prevent external modification
            
    return None


def update_todo(todo_id: int, changes: Dict[str, Any]) -> bool:
    """
    Update specific fields of an existing todo by ID.
    
    Args:
        todo_id (int): The ID of the todo to update
        changes (Dict[str, Any]): Dictionary of fields to update
        
    Returns:
        bool: True if todo was found and updated, False otherwise
        
    Raises:
        TypeError: If arguments are not of correct types
        ValueError: If changes contain invalid values
    """
    if not isinstance(todo_id, int):
        raise TypeError("Todo ID must be an integer")
    if not isinstance(changes, dict):
        raise TypeError("Changes must be a dictionary")
        
    if not changes:
        return False  # No changes to apply
        
    # Validate changes
    allowed_fields = {"text", "done", "priority"}
    for field, value in changes.items():
        if field not in allowed_fields:
            raise ValueError(f"Cannot update field '{field}'. Allowed fields: {', '.join(allowed_fields)}")
            
        if field == "text":
            if not isinstance(value, str) or not value.strip():
                raise ValueError("Text must be a non-empty string")
        elif field == "done":
            if not isinstance(value, bool):
                raise ValueError("Done must be a boolean")
        elif field == "priority":
            if not isinstance(value, str) or value.lower() not in VALID_PRIORITIES:
                raise ValueError(f"Priority must be one of: {', '.join(VALID_PRIORITIES)}")
    
    todos = load_todos()
    
    for todo in todos:
        if todo.get('id') == todo_id:
            # Apply changes
            for field, value in changes.items():
                if field == "text":
                    todo[field] = value.strip()
                elif field == "priority":
                    todo[field] = value.lower()
                else:
                    todo[field] = value
                    
            save_todos(todos)
            return True
            
    return False


def delete_todo(todo_id: int) -> bool:
    """
    Remove todo by ID.
    
    Args:
        todo_id (int): The ID of the todo to delete
        
    Returns:
        bool: True if todo was found and deleted, False otherwise
        
    Raises:
        TypeError: If todo_id is not an integer
    """
    if not isinstance(todo_id, int):
        raise TypeError("Todo ID must be an integer")
        
    todos = load_todos()
    original_length = len(todos)
    
    # Filter out the todo with matching ID
    todos = [todo for todo in todos if todo.get('id') != todo_id]
    
    if len(todos) < original_length:
        save_todos(todos)
        return True
        
    return False


def filter_todos(todos: List[Dict[str, Any]], done: Optional[bool] = None, 
                priority: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Filter todos by completion status and/or priority.
    
    Args:
        todos (List[Dict[str, Any]]): List of todos to filter
        done (Optional[bool]): Filter by completion status. None means no filter
        priority (Optional[str]): Filter by priority level. None means no filter
        
    Returns:
        List[Dict[str, Any]]: Filtered list of todos
        
    Raises:
        TypeError: If todos is not a list
        ValueError: If priority is invalid
    """
    if not isinstance(todos, list):
        raise TypeError("Todos must be a list")
        
    if priority is not None:
        if not isinstance(priority, str):
            raise TypeError("Priority must be a string")
        priority = priority.lower()
        if priority not in VALID_PRIORITIES:
            raise ValueError(f"Priority must be one of: {', '.join(VALID_PRIORITIES)}")
    
    filtered_todos = []
    
    for todo in todos:
        if not isinstance(todo, dict):
            continue  # Skip invalid todos
            
        # Apply done filter
        if done is not None and todo.get('done') != done:
            continue
            
        # Apply priority filter
        if priority is not None and todo.get('priority', '').lower() != priority:
            continue
            
        filtered_todos.append(todo)
    
    return filtered_todos


# Helper functions

def _create_empty_todos_file() -> None:
    """Create an empty todos file with proper structure."""
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(TODOS_FILE), exist_ok=True)
        
        with open(TODOS_FILE, 'w', encoding='utf-8') as file:
            json.dump([], file)
            
    except OSError as e:
        raise OSError(f"Failed to create todos file: {e}")


def _backup_corrupted_file() -> None:
    """Create a backup of the corrupted todos file."""
    backup_file = f"{TODOS_FILE}{BACKUP_SUFFIX}"
    try:
        shutil.copy2(TODOS_FILE, backup_file)
    except OSError:
        # If backup fails, we'll still continue with creating a clean file
        pass


def _validate_todo_structure(todo: Dict[str, Any]) -> None:
    """
    Validate that a todo dictionary has the required structure.
    
    Args:
        todo (Dict[str, Any]): Todo dictionary to validate
        
    Raises:
        ValueError: If todo structure is invalid
    """
    required_fields = {"id", "text", "done", "created", "priority"}
    
    if not all(field in todo for field in required_fields):
        missing = required_fields - set(todo.keys())
        raise ValueError(f"Todo missing required fields: {', '.join(missing)}")
    
    if not isinstance(todo["id"], int):
        raise ValueError("Todo ID must be an integer")
    if not isinstance(todo["text"], str):
        raise ValueError("Todo text must be a string")
    if not isinstance(todo["done"], bool):
        raise ValueError("Todo done must be a boolean")
    if not isinstance(todo["created"], str):
        raise ValueError("Todo created must be a string")
    if not isinstance(todo["priority"], str) or todo["priority"] not in VALID_PRIORITIES:
        raise ValueError(f"Todo priority must be one of: {', '.join(VALID_PRIORITIES)}")