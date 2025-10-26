"""
Todo storage module with core operations for managing todos in ~/.todos.json file.
Provides robust file operations with proper error handling and data validation.
"""

import json
import os
from datetime import datetime
from utils import *


# File path for storing todos
TODOS_FILE = os.path.expanduser("~/.todos.json")
BACKUP_SUFFIX = ".backup"

# Valid priority values
VALID_PRIORITIES = {"low", "medium", "high"}


def load_todos():
    """
    Load todos from the JSON file.
    
    Returns:
        list: List of todo dictionaries. Returns empty list if file doesn't exist
              or is corrupted.
    
    Raises:
        PermissionError: If file cannot be read due to permission issues.
        OSError: If file system error occurs during read operation.
    """
    if not os.path.exists(TODOS_FILE):
        # Create empty todos file if it doesn't exist
        save_todos([])
        return []
    
    try:
        with open(TODOS_FILE, 'r', encoding='utf-8') as file:
            content = file.read().strip()
            if not content:
                return []
            
            todos = json.loads(content)
            
            # Validate that todos is a list
            if not isinstance(todos, list):
                raise ValueError("Todos file must contain a JSON array")
            
            # Validate each todo structure
            validated_todos = []
            for todo in todos:
                if _validate_todo_structure(todo):
                    validated_todos.append(todo)
            
            return validated_todos
            
    except (json.JSONDecodeError, ValueError) as e:
        # Handle corrupted JSON by backing up and recreating
        backup_file = TODOS_FILE + BACKUP_SUFFIX
        try:
            # Create backup of corrupted file
            if os.path.exists(TODOS_FILE):
                with open(TODOS_FILE, 'r', encoding='utf-8') as src:
                    with open(backup_file, 'w', encoding='utf-8') as dst:
                        dst.write(src.read())
                print(f"Warning: Corrupted todos file backed up to {backup_file}")
        except OSError:
            pass  # Backup failed, but continue with recreation
        
        # Recreate empty todos file
        save_todos([])
        return []
    
    except PermissionError:
        raise PermissionError(f"Permission denied: Cannot read todos file at {TODOS_FILE}")
    except OSError as e:
        raise OSError(f"File system error reading todos: {e}")


def save_todos(todos):
    """
    Save todos list to the JSON file.
    
    Args:
        todos (list): List of todo dictionaries to save.
    
    Raises:
        PermissionError: If file cannot be written due to permission issues.
        OSError: If file system error occurs during write operation.
        TypeError: If todos is not a list or contains invalid data types.
    """
    if not isinstance(todos, list):
        raise TypeError("Todos must be a list")
    
    # Validate all todos before saving
    for i, todo in enumerate(todos):
        if not _validate_todo_structure(todo):
            raise ValueError(f"Invalid todo structure at index {i}")
    
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(TODOS_FILE), exist_ok=True)
        
        # Write to temporary file first, then rename for atomic operation
        temp_file = TODOS_FILE + ".tmp"
        with open(temp_file, 'w', encoding='utf-8') as file:
            json.dump(todos, file, indent=2, ensure_ascii=False)
        
        # Atomic rename
        os.replace(temp_file, TODOS_FILE)
        
    except PermissionError:
        raise PermissionError(f"Permission denied: Cannot write todos file at {TODOS_FILE}")
    except OSError as e:
        # Clean up temp file if it exists
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass
        raise OSError(f"File system error writing todos: {e}")


def add_todo(text, priority="medium"):
    """
    Add a new todo with auto-generated ID and timestamp.
    
    Args:
        text (str): Description of the todo task.
        priority (str): Priority level ("low", "medium", "high"). Defaults to "medium".
    
    Returns:
        dict: The newly created todo dictionary.
    
    Raises:
        ValueError: If text is empty or priority is invalid.
        TypeError: If text is not a string.
    """
    if not isinstance(text, str):
        raise TypeError("Todo text must be a string")
    
    if not text.strip():
        raise ValueError("Todo text cannot be empty")
    
    if priority not in VALID_PRIORITIES:
        raise ValueError(f"Priority must be one of: {', '.join(VALID_PRIORITIES)}")
    
    todos = load_todos()
    
    # Generate unique sequential ID
    next_id = max((todo.get('id', 0) for todo in todos), default=0) + 1
    
    # Create new todo
    new_todo = {
        "id": next_id,
        "text": text.strip(),
        "done": False,
        "created": datetime.now().isoformat(),
        "priority": priority
    }
    
    todos.append(new_todo)
    save_todos(todos)
    
    return new_todo


def get_todo(id):
    """
    Find and return todo by ID.
    
    Args:
        id (int): The ID of the todo to find.
    
    Returns:
        dict or None: Todo dictionary if found, None otherwise.
    
    Raises:
        TypeError: If id is not an integer.
    """
    if not isinstance(id, int):
        raise TypeError("Todo ID must be an integer")
    
    todos = load_todos()
    
    for todo in todos:
        if todo.get('id') == id:
            return todo.copy()  # Return copy to prevent external modification
    
    return None


def update_todo(id, changes):
    """
    Update specific fields of existing todo by ID.
    
    Args:
        id (int): The ID of the todo to update.
        changes (dict): Dictionary containing fields to update.
    
    Returns:
        dict or None: Updated todo dictionary if found and updated, None if not found.
    
    Raises:
        TypeError: If id is not an integer or changes is not a dictionary.
        ValueError: If changes contain invalid field values.
    """
    if not isinstance(id, int):
        raise TypeError("Todo ID must be an integer")
    
    if not isinstance(changes, dict):
        raise TypeError("Changes must be a dictionary")
    
    # Validate changes
    allowed_fields = {"text", "done", "priority"}
    for field, value in changes.items():
        if field not in allowed_fields:
            raise ValueError(f"Cannot update field '{field}'. Allowed fields: {', '.join(allowed_fields)}")
        
        if field == "text" and (not isinstance(value, str) or not value.strip()):
            raise ValueError("Text must be a non-empty string")
        
        if field == "done" and not isinstance(value, bool):
            raise ValueError("Done must be a boolean")
        
        if field == "priority" and value not in VALID_PRIORITIES:
            raise ValueError(f"Priority must be one of: {', '.join(VALID_PRIORITIES)}")
    
    todos = load_todos()
    
    for i, todo in enumerate(todos):
        if todo.get('id') == id:
            # Update specified fields
            for field, value in changes.items():
                if field == "text":
                    todo[field] = value.strip()
                else:
                    todo[field] = value
            
            save_todos(todos)
            return todo.copy()
    
    return None


def delete_todo(id):
    """
    Remove todo by ID.
    
    Args:
        id (int): The ID of the todo to delete.
    
    Returns:
        bool: True if todo was found and deleted, False otherwise.
    
    Raises:
        TypeError: If id is not an integer.
    """
    if not isinstance(id, int):
        raise TypeError("Todo ID must be an integer")
    
    todos = load_todos()
    
    for i, todo in enumerate(todos):
        if todo.get('id') == id:
            todos.pop(i)
            save_todos(todos)
            return True
    
    return False


def filter_todos(todos, done=None, priority=None):
    """
    Filter todos by done status and/or priority.
    
    Args:
        todos (list): List of todo dictionaries to filter.
        done (bool, optional): Filter by completion status. None means no filter.
        priority (str, optional): Filter by priority level. None means no filter.
    
    Returns:
        list: Filtered list of todo dictionaries.
    
    Raises:
        TypeError: If todos is not a list.
        ValueError: If priority is invalid.
    """
    if not isinstance(todos, list):
        raise TypeError("Todos must be a list")
    
    if priority is not None and priority not in VALID_PRIORITIES:
        raise ValueError(f"Priority must be one of: {', '.join(VALID_PRIORITIES)}")
    
    filtered = []
    
    for todo in todos:
        # Skip invalid todos
        if not _validate_todo_structure(todo):
            continue
        
        # Apply done filter
        if done is not None and todo.get('done') != done:
            continue
        
        # Apply priority filter
        if priority is not None and todo.get('priority') != priority:
            continue
        
        filtered.append(todo)
    
    return filtered


def _validate_todo_structure(todo):
    """
    Validate that a todo has the correct structure and data types.
    
    Args:
        todo: Object to validate as a todo.
    
    Returns:
        bool: True if todo structure is valid, False otherwise.
    """
    if not isinstance(todo, dict):
        return False
    
    required_fields = {"id", "text", "done", "created", "priority"}
    if not all(field in todo for field in required_fields):
        return False
    
    # Validate field types and values
    if not isinstance(todo.get('id'), int) or todo['id'] <= 0:
        return False
    
    if not isinstance(todo.get('text'), str) or not todo['text'].strip():
        return False
    
    if not isinstance(todo.get('done'), bool):
        return False
    
    if not isinstance(todo.get('created'), str):
        return False
    
    if todo.get('priority') not in VALID_PRIORITIES:
        return False
    
    # Validate datetime format
    try:
        datetime.fromisoformat(todo['created'])
    except (ValueError, TypeError):
        return False
    
    return True