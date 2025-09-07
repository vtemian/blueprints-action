"""
Todo storage and core operations module.

This module provides functionality for managing todos with persistent JSON storage.
Todos are stored in ~/.todos.json with automatic backup and recovery capabilities.
"""

import json
import os
from datetime import datetime
from typing import List, Dict, Optional, Any, Union
from utils import *

# Module-level constants
TODOS_FILE = os.path.expanduser("~/.todos.json")
BACKUP_SUFFIX = ".backup"
VALID_PRIORITIES = ["low", "medium", "high"]


def _ensure_todos_file() -> None:
    """
    Ensure the todos file exists. Create empty file if missing.
    
    Raises:
        PermissionError: If unable to create or access the file
        OSError: If file system operation fails
    """
    if not os.path.exists(TODOS_FILE):
        try:
            with open(TODOS_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f, indent=2)
        except (PermissionError, OSError) as e:
            raise PermissionError(f"Cannot create todos file at {TODOS_FILE}: {e}")


def _backup_corrupted_file() -> None:
    """
    Create backup of corrupted todos file before recreating.
    
    Raises:
        OSError: If backup operation fails
    """
    backup_path = TODOS_FILE + BACKUP_SUFFIX
    try:
        if os.path.exists(TODOS_FILE):
            # Create backup with timestamp to avoid overwriting
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = f"{TODOS_FILE}.{timestamp}{BACKUP_SUFFIX}"
            os.rename(TODOS_FILE, backup_path)
            print(f"Corrupted todos file backed up to: {backup_path}")
    except OSError as e:
        print(f"Warning: Could not backup corrupted file: {e}")


def _validate_priority(priority: str) -> bool:
    """
    Validate priority value.
    
    Args:
        priority: Priority string to validate
        
    Returns:
        bool: True if valid priority, False otherwise
    """
    return priority in VALID_PRIORITIES


def _validate_todo_id(todo_id: Any) -> bool:
    """
    Validate todo ID is a positive integer.
    
    Args:
        todo_id: ID value to validate
        
    Returns:
        bool: True if valid ID, False otherwise
    """
    try:
        return isinstance(todo_id, int) and todo_id > 0
    except (TypeError, ValueError):
        return False


def _get_next_id(todos: List[Dict]) -> int:
    """
    Generate next available ID for new todo.
    
    Args:
        todos: List of existing todos
        
    Returns:
        int: Next available ID
    """
    if not todos:
        return 1
    
    max_id = 0
    for todo in todos:
        if isinstance(todo.get('id'), int) and todo['id'] > max_id:
            max_id = todo['id']
    
    return max_id + 1


def load_todos() -> List[Dict]:
    """
    Load todos from JSON file.
    
    Returns:
        List[Dict]: List of todo dictionaries
        
    Raises:
        PermissionError: If file cannot be accessed
        OSError: If file system operation fails
    """
    _ensure_todos_file()
    
    try:
        with open(TODOS_FILE, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            if not content:
                return []
            
            todos = json.loads(content)
            
            # Validate loaded data structure
            if not isinstance(todos, list):
                raise ValueError("Invalid todos file format: expected list")
            
            return todos
            
    except json.JSONDecodeError as e:
        print(f"Error: Corrupted todos file detected: {e}")
        _backup_corrupted_file()
        _ensure_todos_file()
        return []
        
    except PermissionError as e:
        raise PermissionError(f"Permission denied accessing todos file: {e}")
        
    except OSError as e:
        raise OSError(f"Error reading todos file: {e}")


def save_todos(todos: List[Dict]) -> None:
    """
    Save todos list to JSON file.
    
    Args:
        todos: List of todo dictionaries to save
        
    Raises:
        PermissionError: If file cannot be written
        OSError: If file system operation fails
        TypeError: If todos data is not serializable
    """
    if not isinstance(todos, list):
        raise TypeError("Todos must be a list")
    
    try:
        # Write to temporary file first for atomic operation
        temp_file = TODOS_FILE + ".tmp"
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(todos, f, indent=2, ensure_ascii=False)
        
        # Atomic rename
        os.replace(temp_file, TODOS_FILE)
        
    except PermissionError as e:
        raise PermissionError(f"Permission denied writing todos file: {e}")
        
    except OSError as e:
        raise OSError(f"Error writing todos file: {e}")
        
    except (TypeError, ValueError) as e:
        raise TypeError(f"Cannot serialize todos data: {e}")


def add_todo(text: str, priority: str = "medium") -> Dict:
    """
    Add new todo item.
    
    Args:
        text: Todo description text
        priority: Priority level ("low", "medium", "high")
        
    Returns:
        Dict: The created todo dictionary
        
    Raises:
        ValueError: If text is empty or priority is invalid
        PermissionError: If file cannot be accessed
        OSError: If file system operation fails
    """
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Todo text cannot be empty")
    
    if not _validate_priority(priority):
        raise ValueError(f"Invalid priority '{priority}'. Must be one of: {VALID_PRIORITIES}")
    
    todos = load_todos()
    
    new_todo = {
        "id": _get_next_id(todos),
        "text": text.strip(),
        "done": False,
        "created": datetime.now().isoformat(),
        "priority": priority
    }
    
    todos.append(new_todo)
    save_todos(todos)
    
    return new_todo


def get_todo(todo_id: Union[int, str]) -> Optional[Dict]:
    """
    Retrieve todo by ID.
    
    Args:
        todo_id: ID of todo to retrieve
        
    Returns:
        Optional[Dict]: Todo dictionary if found, None otherwise
        
    Raises:
        ValueError: If todo_id is not a valid integer
        PermissionError: If file cannot be accessed
        OSError: If file system operation fails
    """
    try:
        todo_id = int(todo_id)
    except (TypeError, ValueError):
        raise ValueError("Todo ID must be a valid integer")
    
    if not _validate_todo_id(todo_id):
        return None
    
    todos = load_todos()
    
    for todo in todos:
        if todo.get('id') == todo_id:
            return todo.copy()  # Return copy to prevent external modification
    
    return None


def update_todo(todo_id: Union[int, str], changes: Dict[str, Any]) -> Optional[Dict]:
    """
    Update existing todo with provided changes.
    
    Args:
        todo_id: ID of todo to update
        changes: Dictionary of fields to update
        
    Returns:
        Optional[Dict]: Updated todo dictionary if found, None otherwise
        
    Raises:
        ValueError: If todo_id is invalid or changes contain invalid data
        PermissionError: If file cannot be accessed
        OSError: If file system operation fails
    """
    try:
        todo_id = int(todo_id)
    except (TypeError, ValueError):
        raise ValueError("Todo ID must be a valid integer")
    
    if not _validate_todo_id(todo_id):
        return None
    
    if not isinstance(changes, dict):
        raise ValueError("Changes must be a dictionary")
    
    # Validate changes
    if 'priority' in changes and not _validate_priority(changes['priority']):
        raise ValueError(f"Invalid priority '{changes['priority']}'. Must be one of: {VALID_PRIORITIES}")
    
    if 'text' in changes and (not isinstance(changes['text'], str) or not changes['text'].strip()):
        raise ValueError("Todo text cannot be empty")
    
    if 'done' in changes and not isinstance(changes['done'], bool):
        raise ValueError("Done status must be a boolean")
    
    # Prevent modification of protected fields
    protected_fields = {'id', 'created'}
    for field in protected_fields:
        if field in changes:
            raise ValueError(f"Cannot modify protected field: {field}")
    
    todos = load_todos()
    
    for i, todo in enumerate(todos):
        if todo.get('id') == todo_id:
            # Apply changes
            for key, value in changes.items():
                if key == 'text':
                    todo[key] = value.strip()
                else:
                    todo[key] = value
            
            save_todos(todos)
            return todo.copy()
    
    return None


def delete_todo(todo_id: Union[int, str]) -> bool:
    """
    Delete todo by ID.
    
    Args:
        todo_id: ID of todo to delete
        
    Returns:
        bool: True if todo was deleted, False if not found
        
    Raises:
        ValueError: If todo_id is not a valid integer
        PermissionError: If file cannot be accessed
        OSError: If file system operation fails
    """
    try:
        todo_id = int(todo_id)
    except (TypeError, ValueError):
        raise ValueError("Todo ID must be a valid integer")
    
    if not _validate_todo_id(todo_id):
        return False
    
    todos = load_todos()
    
    for i, todo in enumerate(todos):
        if todo.get('id') == todo_id:
            todos.pop(i)
            save_todos(todos)
            return True
    
    return False


def filter_todos(todos: List[Dict], done: Optional[bool] = None, priority: Optional[str] = None) -> List[Dict]:
    """
    Filter todos by completion status and/or priority.
    
    Args:
        todos: List of todo dictionaries to filter
        done: Filter by completion status (None for all)
        priority: Filter by priority level (None for all)
        
    Returns:
        List[Dict]: Filtered list of todos
        
    Raises:
        ValueError: If priority is invalid
        TypeError: If todos is not a list
    """
    if not isinstance(todos, list):
        raise TypeError("Todos must be a list")
    
    if priority is not None and not _validate_priority(priority):
        raise ValueError(f"Invalid priority '{priority}'. Must be one of: {VALID_PRIORITIES}")
    
    if done is not None and not isinstance(done, bool):
        raise ValueError("Done filter must be a boolean or None")
    
    filtered = []
    
    for todo in todos:
        # Skip invalid todo entries
        if not isinstance(todo, dict):
            continue
        
        # Apply done filter
        if done is not None and todo.get('done') != done:
            continue
        
        # Apply priority filter
        if priority is not None and todo.get('priority') != priority:
            continue
        
        filtered.append(todo.copy())
    
    return filtered