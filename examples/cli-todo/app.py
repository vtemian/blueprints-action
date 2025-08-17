"""
Todo storage and core operations module with JSON file persistence.

This module provides a complete todo management system with persistent storage
in JSON format. It handles file operations, data validation, and core CRUD
operations for todo items.

Storage location: ~/.todos.json
Dependencies: json, os, datetime, utils
"""

import json
import os
import shutil
from datetime import datetime
from typing import List, Dict, Any, Optional, Union
import utils


# Constants
TODOS_FILENAME = '.todos.json'
BACKUP_SUFFIX = '.backup'
VALID_PRIORITIES = {'low', 'medium', 'high'}
DEFAULT_PRIORITY = 'medium'


def _get_todos_path() -> str:
    """
    Get the full path to the todos JSON file.
    
    Returns:
        str: Full path to ~/.todos.json
    """
    return os.path.expanduser(f'~/{TODOS_FILENAME}')


def _get_backup_path() -> str:
    """
    Get the full path to the backup todos JSON file.
    
    Returns:
        str: Full path to ~/.todos.json.backup
    """
    return os.path.expanduser(f'~/{TODOS_FILENAME}{BACKUP_SUFFIX}')


def _generate_next_id(todos: List[Dict[str, Any]]) -> int:
    """
    Generate the next available ID for a new todo.
    
    Args:
        todos: List of existing todos
        
    Returns:
        int: Next available ID (max existing ID + 1, or 1 if no todos exist)
    """
    if not todos:
        return 1
    return max(todo.get('id', 0) for todo in todos) + 1


def _validate_priority(priority: str) -> None:
    """
    Validate that priority is one of the accepted values.
    
    Args:
        priority: Priority string to validate
        
    Raises:
        ValueError: If priority is not in VALID_PRIORITIES
    """
    if priority not in VALID_PRIORITIES:
        raise ValueError(
            f"Priority must be one of {VALID_PRIORITIES}, got: {priority}"
        )


def _validate_todo_text(text: str) -> None:
    """
    Validate todo text input.
    
    Args:
        text: Todo text to validate
        
    Raises:
        TypeError: If text is not a string
        ValueError: If text is empty or only whitespace
    """
    if not isinstance(text, str):
        raise TypeError(f"Todo text must be a string, got: {type(text).__name__}")
    
    if not text.strip():
        raise ValueError("Todo text cannot be empty or only whitespace")


def _validate_todo_id(todo_id: Union[int, str]) -> int:
    """
    Validate and convert todo ID to integer.
    
    Args:
        todo_id: ID to validate and convert
        
    Returns:
        int: Validated integer ID
        
    Raises:
        TypeError: If ID cannot be converted to int
        ValueError: If ID is not positive
    """
    try:
        id_int = int(todo_id)
    except (ValueError, TypeError):
        raise TypeError(f"Todo ID must be convertible to integer, got: {todo_id}")
    
    if id_int <= 0:
        raise ValueError(f"Todo ID must be positive, got: {id_int}")
    
    return id_int


def _create_empty_todos_file() -> None:
    """
    Create an empty todos file with an empty JSON array.
    
    Raises:
        PermissionError: If unable to create file due to permissions
        OSError: If unable to create file due to other OS-level issues
    """
    todos_path = _get_todos_path()
    try:
        with open(todos_path, 'w', encoding='utf-8') as f:
            json.dump([], f, indent=2)
    except PermissionError:
        raise PermissionError(
            f"Permission denied: Cannot create todos file at {todos_path}. "
            "Please check file permissions and try again."
        )
    except OSError as e:
        raise OSError(
            f"Failed to create todos file at {todos_path}: {e}. "
            "Please check disk space and file system permissions."
        )


def _backup_corrupted_file() -> None:
    """
    Create a backup of the corrupted todos file.
    
    Raises:
        OSError: If backup operation fails
    """
    todos_path = _get_todos_path()
    backup_path = _get_backup_path()
    
    try:
        shutil.copy2(todos_path, backup_path)
        print(f"Warning: Corrupted todos file backed up to {backup_path}")
    except OSError as e:
        print(f"Warning: Failed to backup corrupted file: {e}")


def load_todos() -> List[Dict[str, Any]]:
    """
    Load todos from the JSON file.
    
    Creates an empty file if it doesn't exist. If the file is corrupted,
    backs it up and creates a new empty file.
    
    Returns:
        List[Dict[str, Any]]: List of todo dictionaries
        
    Raises:
        PermissionError: If unable to read file due to permissions
        OSError: If unable to access file due to other OS-level issues
    """
    todos_path = _get_todos_path()
    
    # Create file if it doesn't exist
    if not os.path.exists(todos_path):
        _create_empty_todos_file()
        return []
    
    try:
        with open(todos_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            
            # Handle empty file
            if not content:
                return []
            
            todos = json.loads(content)
            
            # Validate that we got a list
            if not isinstance(todos, list):
                raise json.JSONDecodeError("Root element is not a list", content, 0)
            
            return todos
            
    except json.JSONDecodeError as e:
        print(f"Warning: Corrupted JSON in todos file: {e}")
        _backup_corrupted_file()
        _create_empty_todos_file()
        return []
        
    except PermissionError:
        raise PermissionError(
            f"Permission denied: Cannot read todos file at {todos_path}. "
            "Please check file permissions and try again."
        )
    except OSError as e:
        raise OSError(
            f"Failed to read todos file at {todos_path}: {e}. "
            "Please check file accessibility and try again."
        )


def save_todos(todos: List[Dict[str, Any]]) -> None:
    """
    Save todos to the JSON file with atomic write operation.
    
    Args:
        todos: List of todo dictionaries to save
        
    Raises:
        TypeError: If todos is not a list
        PermissionError: If unable to write file due to permissions
        OSError: If unable to write file due to other OS-level issues
    """
    if not isinstance(todos, list):
        raise TypeError(f"Todos must be a list, got: {type(todos).__name__}")
    
    todos_path = _get_todos_path()
    temp_path = f"{todos_path}.tmp"
    
    try:
        # Write to temporary file first (atomic operation)
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(todos, f, indent=2, ensure_ascii=False)
        
        # Move temporary file to final location
        if os.name == 'nt':  # Windows
            if os.path.exists(todos_path):
                os.remove(todos_path)
        os.rename(temp_path, todos_path)
        
    except PermissionError:
        # Clean up temp file if it exists
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise PermissionError(
            f"Permission denied: Cannot write todos file at {todos_path}. "
            "Please check file permissions and try again."
        )
    except OSError as e:
        # Clean up temp file if it exists
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise OSError(
            f"Failed to write todos file at {todos_path}: {e}. "
            "Please check disk space and file system permissions."
        )


def add_todo(text: str, priority: str = DEFAULT_PRIORITY) -> Dict[str, Any]:
    """
    Add a new todo item.
    
    Args:
        text: Description of the todo item
        priority: Priority level ('low', 'medium', 'high')
        
    Returns:
        Dict[str, Any]: The newly created todo item
        
    Raises:
        TypeError: If text is not a string
        ValueError: If text is empty or priority is invalid
        PermissionError: If unable to save todos
        OSError: If unable to access todos file
    """
    _validate_todo_text(text)
    _validate_priority(priority)
    
    todos = load_todos()
    
    new_todo = {
        'id': _generate_next_id(todos),
        'text': text.strip(),
        'done': False,
        'created': datetime.now().isoformat(),
        'priority': priority
    }
    
    todos.append(new_todo)
    save_todos(todos)
    
    return new_todo


def get_todo(todo_id: Union[int, str]) -> Optional[Dict[str, Any]]:
    """
    Get a todo item by ID.
    
    Args:
        todo_id: ID of the todo to retrieve
        
    Returns:
        Optional[Dict[str, Any]]: Todo item if found, None otherwise
        
    Raises:
        TypeError: If todo_id cannot be converted to int
        ValueError: If todo_id is not positive
        PermissionError: If unable to load todos
        OSError: If unable to access todos file
    """
    validated_id = _validate_todo_id(todo_id)
    todos = load_todos()
    
    for todo in todos:
        if todo.get('id') == validated_id:
            return todo
    
    return None


def update_todo(todo_id: Union[int, str], changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Update a todo item by ID.
    
    Args:
        todo_id: ID of the todo to update
        changes: Dictionary of fields to update
        
    Returns:
        Optional[Dict[str, Any]]: Updated todo item if found, None otherwise
        
    Raises:
        TypeError: If todo_id cannot be converted to int or changes is not a dict
        ValueError: If todo_id is not positive or changes contain invalid values
        PermissionError: If unable to save todos
        OSError: If unable to access todos file
    """
    validated_id = _validate_todo_id(todo_id)
    
    if not isinstance(changes, dict):
        raise TypeError(f"Changes must be a dictionary, got: {type(changes).__name__}")
    
    if not changes:
        raise ValueError("Changes dictionary cannot be empty")
    
    # Validate changes
    if 'text' in changes:
        _validate_todo_text(changes['text'])
        changes['text'] = changes['text'].strip()
    
    if 'priority' in changes:
        _validate_priority(changes['priority'])
    
    if 'done' in changes and not isinstance(changes['done'], bool):
        raise TypeError(f"'done' field must be boolean, got: {type(changes['done']).__name__}")
    
    # Prevent modification of protected fields
    protected_fields = {'id', 'created'}
    for field in protected_fields:
        if field in changes:
            raise ValueError(f"Cannot modify protected field: {field}")
    
    todos = load_todos()
    
    for todo in todos:
        if todo.get('id') == validated_id:
            todo.update(changes)
            save_todos(todos)
            return todo
    
    return None


def delete_todo(todo_id: Union[int, str]) -> bool:
    """
    Delete a todo item by ID.
    
    Args:
        todo_id: ID of the todo to delete
        
    Returns:
        bool: True if todo was deleted, False if not found
        
    Raises:
        TypeError: If todo_id cannot be converted to int
        ValueError: If todo_id is not positive
        PermissionError: If unable to save todos
        OSError: If unable to access todos file
    """
    validated_id = _validate_todo_id(todo_id)
    todos = load_todos()
    
    for i, todo in enumerate(todos):
        if todo.get('id') == validated_id:
            todos.pop(i)
            save_todos(todos)
            return True
    
    return False


def filter_todos(todos: List[Dict[str, Any]], 
                done: Optional[bool] = None, 
                priority: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Filter todos by done status and/or priority.
    
    Args:
        todos: List of todos to filter
        done: Filter by completion status (None for no filter)
        priority: Filter by priority level (None for no filter)
        
    Returns:
        List[Dict[str, Any]]: Filtered list of todos
        
    Raises:
        TypeError: If todos is not a list or done is not boolean
        ValueError: If priority is not valid
    """
    if not isinstance(todos, list):
        raise TypeError(f"Todos must be a list, got: {type(todos).__name__}")
    
    if done is not None and not isinstance(done, bool):
        raise TypeError(f"'done' filter must be boolean or None, got: {type(done).__name__}")
    
    if priority is not None:
        _validate_priority(priority)
    
    filtered_todos = todos
    
    if done is not None:
        filtered_todos = [
            todo for todo in filtered_todos 
            if todo.get('done', False) == done
        ]
    
    if priority is not None:
        filtered_todos = [
            todo for todo in filtered_todos 
            if todo.get('priority', DEFAULT_PRIORITY) == priority
        ]
    
    return filtered_todos


# Additional utility functions for common operations

def get_all_todos() -> List[Dict[str, Any]]:
    """
    Get all todos (convenience function).
    
    Returns:
        List[Dict[str, Any]]: All todos
    """
    return load_todos()


def get_pending_todos() -> List[Dict[str, Any]]:
    """
    Get all pending (not done) todos.
    
    Returns:
        List[Dict[str, Any]]: All pending todos
    """
    todos = load_todos()
    return filter_todos(todos, done=False)


def get_completed_todos() -> List[Dict[str, Any]]:
    """
    Get all completed todos.
    
    Returns:
        List[Dict[str, Any]]: All completed todos
    """
    todos = load_todos()
    return filter_todos(todos, done=True)


def mark_todo_done(todo_id: Union[int, str]) -> Optional[Dict[str, Any]]:
    """
    Mark a todo as completed.
    
    Args:
        todo_id: ID of the todo to mark as done
        
    Returns:
        Optional[Dict[str, Any]]: Updated todo if found, None otherwise
    """
    return update_todo(todo_id, {'done': True})


def mark_todo_pending(todo_id: Union[int, str]) -> Optional[Dict[str, Any]]:
    """
    Mark a todo as pending (not done).