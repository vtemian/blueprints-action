"""
Todo storage and core operations module with JSON file persistence.

This module provides a complete todo management system with persistent storage
using JSON files. It includes robust error handling, data validation, and
thread-safe operations.
"""

import json
import os
import shutil
from datetime import datetime
from typing import List, Dict, Any, Optional, Union
import threading
from pathlib import Path

# Thread lock for file operations
_file_lock = threading.Lock()

# Valid priority values
VALID_PRIORITIES = {"low", "medium", "high"}

# Storage file path
TODOS_FILE = os.path.expanduser("~/.todos.json")


class TodoError(Exception):
    """Base exception for todo operations."""
    pass


class TodoValidationError(TodoError):
    """Exception raised for todo validation errors."""
    pass


class TodoNotFoundError(TodoError):
    """Exception raised when a todo is not found."""
    pass


class TodoStorageError(TodoError):
    """Exception raised for storage-related errors."""
    pass


def _validate_todo_structure(todo: Dict[str, Any]) -> None:
    """
    Validate that a todo has the correct structure and data types.
    
    Args:
        todo: Dictionary representing a todo item
        
    Raises:
        TodoValidationError: If todo structure is invalid
    """
    required_fields = {"id", "text", "done", "created", "priority"}
    
    if not isinstance(todo, dict):
        raise TodoValidationError("Todo must be a dictionary")
    
    if not all(field in todo for field in required_fields):
        missing = required_fields - set(todo.keys())
        raise TodoValidationError(f"Missing required fields: {missing}")
    
    if not isinstance(todo["id"], int) or todo["id"] <= 0:
        raise TodoValidationError("Todo ID must be a positive integer")
    
    if not isinstance(todo["text"], str) or not todo["text"].strip():
        raise TodoValidationError("Todo text must be a non-empty string")
    
    if not isinstance(todo["done"], bool):
        raise TodoValidationError("Todo done status must be a boolean")
    
    if not isinstance(todo["created"], str):
        raise TodoValidationError("Todo created timestamp must be a string")
    
    # Validate ISO format datetime
    try:
        datetime.fromisoformat(todo["created"].replace('Z', '+00:00'))
    except ValueError:
        raise TodoValidationError("Todo created timestamp must be in ISO format")
    
    if todo["priority"] not in VALID_PRIORITIES:
        raise TodoValidationError(f"Priority must be one of: {VALID_PRIORITIES}")


def _validate_priority(priority: str) -> None:
    """
    Validate priority value.
    
    Args:
        priority: Priority string to validate
        
    Raises:
        TodoValidationError: If priority is invalid
    """
    if priority not in VALID_PRIORITIES:
        raise TodoValidationError(f"Priority must be one of: {VALID_PRIORITIES}")


def _backup_corrupted_file(file_path: str) -> None:
    """
    Create a backup of corrupted JSON file.
    
    Args:
        file_path: Path to the corrupted file
    """
    backup_path = f"{file_path}.backup"
    try:
        shutil.copy2(file_path, backup_path)
        print(f"Corrupted file backed up to: {backup_path}")
    except Exception as e:
        print(f"Warning: Could not create backup of corrupted file: {e}")


def load_todos() -> List[Dict[str, Any]]:
    """
    Load todos from the JSON storage file.
    
    Returns:
        List of todo dictionaries
        
    Raises:
        TodoStorageError: If there are file permission or other storage issues
    """
    with _file_lock:
        try:
            # Check if file exists
            if not os.path.exists(TODOS_FILE):
                # Create empty todos file
                with open(TODOS_FILE, 'w', encoding='utf-8') as f:
                    json.dump([], f)
                return []
            
            # Check if file is empty
            if os.path.getsize(TODOS_FILE) == 0:
                with open(TODOS_FILE, 'w', encoding='utf-8') as f:
                    json.dump([], f)
                return []
            
            # Load todos from file
            with open(TODOS_FILE, 'r', encoding='utf-8') as f:
                todos = json.load(f)
            
            # Validate that we got a list
            if not isinstance(todos, list):
                raise json.JSONDecodeError("Root element must be a list", "", 0)
            
            # Validate each todo structure
            for i, todo in enumerate(todos):
                try:
                    _validate_todo_structure(todo)
                except TodoValidationError as e:
                    raise TodoStorageError(f"Invalid todo at index {i}: {e}")
            
            return todos
            
        except json.JSONDecodeError as e:
            # Handle corrupted JSON
            _backup_corrupted_file(TODOS_FILE)
            # Recreate empty file
            try:
                with open(TODOS_FILE, 'w', encoding='utf-8') as f:
                    json.dump([], f)
                print("Corrupted JSON file recreated as empty todos list")
                return []
            except PermissionError:
                raise TodoStorageError(f"Permission denied: Cannot recreate todos file at {TODOS_FILE}")
            except Exception as recreate_error:
                raise TodoStorageError(f"Failed to recreate todos file: {recreate_error}")
                
        except PermissionError:
            raise TodoStorageError(f"Permission denied: Cannot read todos file at {TODOS_FILE}")
        except Exception as e:
            raise TodoStorageError(f"Unexpected error loading todos: {e}")


def save_todos(todos: List[Dict[str, Any]]) -> None:
    """
    Save todos to the JSON storage file.
    
    Args:
        todos: List of todo dictionaries to save
        
    Raises:
        TodoValidationError: If todos data is invalid
        TodoStorageError: If there are file permission or other storage issues
    """
    if not isinstance(todos, list):
        raise TodoValidationError("Todos must be a list")
    
    # Validate all todos before saving
    for i, todo in enumerate(todos):
        try:
            _validate_todo_structure(todo)
        except TodoValidationError as e:
            raise TodoValidationError(f"Invalid todo at index {i}: {e}")
    
    with _file_lock:
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(TODOS_FILE), exist_ok=True)
            
            # Write to temporary file first for atomic operation
            temp_file = f"{TODOS_FILE}.tmp"
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(todos, f, indent=2, ensure_ascii=False)
            
            # Atomic move
            if os.name == 'nt':  # Windows
                if os.path.exists(TODOS_FILE):
                    os.remove(TODOS_FILE)
            os.rename(temp_file, TODOS_FILE)
            
        except PermissionError:
            raise TodoStorageError(f"Permission denied: Cannot write to todos file at {TODOS_FILE}")
        except Exception as e:
            # Clean up temp file if it exists
            if os.path.exists(f"{TODOS_FILE}.tmp"):
                try:
                    os.remove(f"{TODOS_FILE}.tmp")
                except:
                    pass
            raise TodoStorageError(f"Unexpected error saving todos: {e}")


def add_todo(text: str, priority: str = "medium") -> Dict[str, Any]:
    """
    Add a new todo item.
    
    Args:
        text: Description of the todo task
        priority: Priority level (low, medium, high)
        
    Returns:
        The created todo dictionary
        
    Raises:
        TodoValidationError: If input parameters are invalid
        TodoStorageError: If there are storage issues
    """
    if not isinstance(text, str) or not text.strip():
        raise TodoValidationError("Todo text must be a non-empty string")
    
    _validate_priority(priority)
    
    todos = load_todos()
    
    # Generate new ID
    new_id = max((todo["id"] for todo in todos), default=0) + 1
    
    # Create new todo
    new_todo = {
        "id": new_id,
        "text": text.strip(),
        "done": False,
        "created": datetime.now().isoformat(),
        "priority": priority
    }
    
    todos.append(new_todo)
    save_todos(todos)
    
    return new_todo


def get_todo(todo_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieve a todo by its ID.
    
    Args:
        todo_id: ID of the todo to retrieve
        
    Returns:
        Todo dictionary if found, None otherwise
        
    Raises:
        TodoValidationError: If todo_id is invalid
        TodoStorageError: If there are storage issues
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        raise TodoValidationError("Todo ID must be a positive integer")
    
    todos = load_todos()
    
    for todo in todos:
        if todo["id"] == todo_id:
            return todo.copy()  # Return a copy to prevent external modification
    
    return None


def update_todo(todo_id: int, changes: Dict[str, Any]) -> Dict[str, Any]:
    """
    Update specific fields of an existing todo.
    
    Args:
        todo_id: ID of the todo to update
        changes: Dictionary of fields to update
        
    Returns:
        Updated todo dictionary
        
    Raises:
        TodoValidationError: If parameters are invalid
        TodoNotFoundError: If todo with given ID doesn't exist
        TodoStorageError: If there are storage issues
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        raise TodoValidationError("Todo ID must be a positive integer")
    
    if not isinstance(changes, dict):
        raise TodoValidationError("Changes must be a dictionary")
    
    if not changes:
        raise TodoValidationError("Changes dictionary cannot be empty")
    
    # Validate change fields
    allowed_fields = {"text", "done", "priority"}
    invalid_fields = set(changes.keys()) - allowed_fields
    if invalid_fields:
        raise TodoValidationError(f"Cannot update fields: {invalid_fields}")
    
    # Validate individual change values
    if "text" in changes:
        if not isinstance(changes["text"], str) or not changes["text"].strip():
            raise TodoValidationError("Todo text must be a non-empty string")
    
    if "done" in changes:
        if not isinstance(changes["done"], bool):
            raise TodoValidationError("Todo done status must be a boolean")
    
    if "priority" in changes:
        _validate_priority(changes["priority"])
    
    todos = load_todos()
    
    # Find and update todo
    for i, todo in enumerate(todos):
        if todo["id"] == todo_id:
            # Apply changes
            for field, value in changes.items():
                if field == "text":
                    todos[i][field] = value.strip()
                else:
                    todos[i][field] = value
            
            save_todos(todos)
            return todos[i].copy()
    
    raise TodoNotFoundError(f"Todo with ID {todo_id} not found")


def delete_todo(todo_id: int) -> bool:
    """
    Delete a todo by its ID.
    
    Args:
        todo_id: ID of the todo to delete
        
    Returns:
        True if todo was deleted, False if not found
        
    Raises:
        TodoValidationError: If todo_id is invalid
        TodoStorageError: If there are storage issues
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        raise TodoValidationError("Todo ID must be a positive integer")
    
    todos = load_todos()
    
    # Find and remove todo
    for i, todo in enumerate(todos):
        if todo["id"] == todo_id:
            todos.pop(i)
            save_todos(todos)
            return True
    
    return False


def filter_todos(
    todos: List[Dict[str, Any]], 
    done: Optional[bool] = None, 
    priority: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Filter todos by done status and/or priority.
    
    Args:
        todos: List of todo dictionaries to filter
        done: Filter by completion status (None for no filter)
        priority: Filter by priority level (None for no filter)
        
    Returns:
        Filtered list of todo dictionaries
        
    Raises:
        TodoValidationError: If parameters are invalid
    """
    if not isinstance(todos, list):
        raise TodoValidationError("Todos must be a list")
    
    if done is not None and not isinstance(done, bool):
        raise TodoValidationError("Done filter must be a boolean or None")
    
    if priority is not None:
        _validate_priority(priority)
    
    # Validate all todos in the input list
    for i, todo in enumerate(todos):
        try:
            _validate_todo_structure(todo)
        except TodoValidationError as e:
            raise TodoValidationError(f"Invalid todo at index {i}: {e}")
    
    filtered_todos = []
    
    for todo in todos:
        # Apply done filter
        if done is not None and todo["done"] != done:
            continue
        
        # Apply priority filter
        if priority is not None and todo["priority"] != priority:
            continue
        
        filtered_todos.append(todo.copy())
    
    return filtered_todos


# Utility functions for common operations
def get_all_todos() -> List[Dict[str, Any]]:
    """
    Get all todos.
    
    Returns:
        List of all todo dictionaries
    """
    return load_todos()


def get_pending_todos() -> List[Dict[str, Any]]:
    """
    Get all pending (not done) todos.
    
    Returns:
        List of pending todo dictionaries
    """
    todos = load_todos()
    return filter_todos(todos, done=False)


def get_completed_todos() -> List[Dict[str, Any]]:
    """
    Get all completed todos.
    
    Returns:
        List of completed todo dictionaries
    """
    todos = load_todos()
    return filter_todos(todos, done=True)


def mark_todo_done(todo_id: int) -> Dict[str, Any]:
    """
    Mark a todo as completed.
    
    Args:
        todo_id: ID of the todo to mark as done
        
    Returns:
        Updated todo dictionary
        
    Raises:
        TodoValidationError: If todo_id is invalid
        TodoNotFoundError: If todo doesn't exist
        TodoStorageError: If there are storage issues
    """
    return update_todo(todo_id, {"done": True})


def mark_todo_pending(todo_id: int) -> Dict[str, Any]:
    """
    Mark a todo as pending (not done).
    
    Args:
        todo_id: ID of the todo to mark as pending
        
    Returns:
        Updated todo dictionary
        
    Raises:
        TodoValidationError: If todo_id is invalid
        TodoNotFoundError: If todo doesn't exist
        TodoStorageError: If there are storage issues
    """
    return update_todo(todo_id, {"done": False})


if