"""
Todo Storage and Core Operations Module

This module provides persistent storage and core operations for todo items.
Todos are stored in ~/.todos.json with automatic backup and recovery capabilities.
"""

import json
import os
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from utils import generate_id, validate_priority, setup_logging

# Configure logging
logger = setup_logging(__name__)

# Constants
TODO_FILE = Path.home() / ".todos.json"
BACKUP_FILE = Path.home() / ".todos.json.backup"
VALID_PRIORITIES = ["low", "medium", "high"]
REQUIRED_TODO_FIELDS = {"id", "text", "done", "created", "priority"}


class TodoError(Exception):
    """Base exception for todo operations."""
    pass


class TodoValidationError(TodoError):
    """Raised when todo data validation fails."""
    pass


class TodoStorageError(TodoError):
    """Raised when file storage operations fail."""
    pass


def _serialize_datetime(obj: Any) -> str:
    """
    Custom JSON serializer for datetime objects.
    
    Args:
        obj: Object to serialize
        
    Returns:
        ISO format string for datetime objects
        
    Raises:
        TypeError: If object is not serializable
    """
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _deserialize_datetime(todo: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert datetime strings back to datetime objects in todo dict.
    
    Args:
        todo: Todo dictionary with string datetime
        
    Returns:
        Todo dictionary with datetime object
    """
    if "created" in todo and isinstance(todo["created"], str):
        try:
            todo["created"] = datetime.fromisoformat(todo["created"])
        except ValueError as e:
            logger.warning(f"Invalid datetime format in todo {todo.get('id')}: {e}")
            todo["created"] = datetime.now()
    return todo


def _validate_todo(todo: Dict[str, Any]) -> bool:
    """
    Validate todo structure and required fields.
    
    Args:
        todo: Todo dictionary to validate
        
    Returns:
        True if valid
        
    Raises:
        TodoValidationError: If validation fails
    """
    if not isinstance(todo, dict):
        raise TodoValidationError("Todo must be a dictionary")
    
    missing_fields = REQUIRED_TODO_FIELDS - set(todo.keys())
    if missing_fields:
        raise TodoValidationError(f"Missing required fields: {missing_fields}")
    
    if not isinstance(todo["id"], int) or todo["id"] <= 0:
        raise TodoValidationError("Todo ID must be a positive integer")
    
    if not isinstance(todo["text"], str) or not todo["text"].strip():
        raise TodoValidationError("Todo text must be a non-empty string")
    
    if not isinstance(todo["done"], bool):
        raise TodoValidationError("Todo done status must be a boolean")
    
    if todo["priority"] not in VALID_PRIORITIES:
        raise TodoValidationError(f"Priority must be one of: {VALID_PRIORITIES}")
    
    if not isinstance(todo["created"], (datetime, str)):
        raise TodoValidationError("Created field must be a datetime or ISO string")
    
    return True


def _create_backup(file_path: Path) -> bool:
    """
    Create backup of existing file.
    
    Args:
        file_path: Path to file to backup
        
    Returns:
        True if backup created successfully
    """
    try:
        if file_path.exists():
            backup_content = file_path.read_text(encoding='utf-8')
            BACKUP_FILE.write_text(backup_content, encoding='utf-8')
            logger.info(f"Created backup at {BACKUP_FILE}")
            return True
    except (OSError, PermissionError) as e:
        logger.error(f"Failed to create backup: {e}")
    return False


def _atomic_write(file_path: Path, content: str) -> None:
    """
    Perform atomic write operation using temporary file.
    
    Args:
        file_path: Target file path
        content: Content to write
        
    Raises:
        TodoStorageError: If write operation fails
    """
    temp_file = file_path.with_suffix('.tmp')
    try:
        # Write to temporary file first
        temp_file.write_text(content, encoding='utf-8')
        # Atomic move to target location
        temp_file.replace(file_path)
        logger.debug(f"Successfully wrote to {file_path}")
    except (OSError, PermissionError) as e:
        # Clean up temp file if it exists
        if temp_file.exists():
            try:
                temp_file.unlink()
            except OSError:
                pass
        raise TodoStorageError(f"Failed to write todos file: {e}")


def load_todos() -> List[Dict[str, Any]]:
    """
    Load todos from persistent storage.
    
    Returns:
        List of todo dictionaries
        
    Raises:
        TodoStorageError: If file operations fail critically
    """
    if not TODO_FILE.exists():
        logger.info("Todo file doesn't exist, returning empty list")
        return []
    
    try:
        content = TODO_FILE.read_text(encoding='utf-8')
        if not content.strip():
            logger.info("Todo file is empty, returning empty list")
            return []
        
        todos_data = json.loads(content)
        
        if not isinstance(todos_data, list):
            raise json.JSONDecodeError("Root element is not a list", content, 0)
        
        # Validate and deserialize each todo
        todos = []
        for i, todo in enumerate(todos_data):
            try:
                _validate_todo(todo)
                todos.append(_deserialize_datetime(todo))
            except TodoValidationError as e:
                logger.warning(f"Skipping invalid todo at index {i}: {e}")
                continue
        
        logger.info(f"Loaded {len(todos)} todos from storage")
        return todos
        
    except json.JSONDecodeError as e:
        logger.error(f"Corrupted JSON in todos file: {e}")
        _create_backup(TODO_FILE)
        
        # Try to recover from backup
        if BACKUP_FILE.exists():
            try:
                backup_content = BACKUP_FILE.read_text(encoding='utf-8')
                backup_todos = json.loads(backup_content)
                logger.info("Recovered todos from backup file")
                return backup_todos
            except (json.JSONDecodeError, OSError) as backup_error:
                logger.error(f"Backup file also corrupted: {backup_error}")
        
        # Create fresh file
        logger.info("Creating fresh todos file")
        save_todos([])
        return []
        
    except PermissionError as e:
        raise TodoStorageError(f"Permission denied accessing todos file: {e}")
    except OSError as e:
        raise TodoStorageError(f"Failed to read todos file: {e}")


def save_todos(todos: List[Dict[str, Any]]) -> None:
    """
    Save todos to persistent storage.
    
    Args:
        todos: List of todo dictionaries to save
        
    Raises:
        TodoStorageError: If save operation fails
        TodoValidationError: If todo data is invalid
    """
    if not isinstance(todos, list):
        raise TodoValidationError("Todos must be provided as a list")
    
    # Validate all todos before saving
    for i, todo in enumerate(todos):
        try:
            _validate_todo(todo)
        except TodoValidationError as e:
            raise TodoValidationError(f"Invalid todo at index {i}: {e}")
    
    try:
        # Create backup before overwriting
        _create_backup(TODO_FILE)
        
        # Serialize to JSON with custom datetime handling
        json_content = json.dumps(
            todos,
            default=_serialize_datetime,
            indent=2,
            ensure_ascii=False
        )
        
        # Atomic write operation
        _atomic_write(TODO_FILE, json_content)
        logger.info(f"Saved {len(todos)} todos to storage")
        
    except (TypeError, ValueError) as e:
        raise TodoValidationError(f"Failed to serialize todos: {e}")


def add_todo(text: str, priority: str = "medium") -> Dict[str, Any]:
    """
    Add a new todo item.
    
    Args:
        text: Todo description text
        priority: Priority level (low, medium, high)
        
    Returns:
        The created todo dictionary
        
    Raises:
        TodoValidationError: If input validation fails
        TodoStorageError: If save operation fails
    """
    if not isinstance(text, str) or not text.strip():
        raise TodoValidationError("Todo text must be a non-empty string")
    
    if not validate_priority(priority):
        raise TodoValidationError(f"Priority must be one of: {VALID_PRIORITIES}")
    
    # Load existing todos to get next ID
    todos = load_todos()
    
    # Generate new ID
    next_id = generate_id([todo["id"] for todo in todos])
    
    # Create new todo
    new_todo = {
        "id": next_id,
        "text": text.strip(),
        "done": False,
        "created": datetime.now(),
        "priority": priority
    }
    
    # Add to list and save
    todos.append(new_todo)
    save_todos(todos)
    
    logger.info(f"Added new todo with ID {next_id}")
    return new_todo


def get_todo(todo_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieve a todo by ID.
    
    Args:
        todo_id: ID of the todo to retrieve
        
    Returns:
        Todo dictionary if found, None otherwise
        
    Raises:
        TodoValidationError: If ID is invalid
        TodoStorageError: If load operation fails
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        raise TodoValidationError("Todo ID must be a positive integer")
    
    todos = load_todos()
    
    for todo in todos:
        if todo["id"] == todo_id:
            return todo
    
    return None


def update_todo(todo_id: int, changes: Dict[str, Any]) -> bool:
    """
    Update a todo item with new values.
    
    Args:
        todo_id: ID of the todo to update
        changes: Dictionary of fields to update
        
    Returns:
        True if update successful, False if todo not found
        
    Raises:
        TodoValidationError: If input validation fails
        TodoStorageError: If save operation fails
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        raise TodoValidationError("Todo ID must be a positive integer")
    
    if not isinstance(changes, dict) or not changes:
        raise TodoValidationError("Changes must be a non-empty dictionary")
    
    # Validate change fields
    allowed_fields = {"text", "done", "priority"}
    invalid_fields = set(changes.keys()) - allowed_fields
    if invalid_fields:
        raise TodoValidationError(f"Cannot update fields: {invalid_fields}")
    
    todos = load_todos()
    
    # Find and update todo
    for todo in todos:
        if todo["id"] == todo_id:
            # Create updated todo for validation
            updated_todo = todo.copy()
            updated_todo.update(changes)
            
            # Validate updated todo
            _validate_todo(updated_todo)
            
            # Apply changes
            todo.update(changes)
            save_todos(todos)
            
            logger.info(f"Updated todo {todo_id} with changes: {changes}")
            return True
    
    logger.warning(f"Todo with ID {todo_id} not found for update")
    return False


def delete_todo(todo_id: int) -> bool:
    """
    Delete a todo item by ID.
    
    Args:
        todo_id: ID of the todo to delete
        
    Returns:
        True if deletion successful, False if todo not found
        
    Raises:
        TodoValidationError: If ID is invalid
        TodoStorageError: If save operation fails
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        raise TodoValidationError("Todo ID must be a positive integer")
    
    todos = load_todos()
    original_count = len(todos)
    
    # Filter out the todo to delete
    todos = [todo for todo in todos if todo["id"] != todo_id]
    
    if len(todos) < original_count:
        save_todos(todos)
        logger.info(f"Deleted todo with ID {todo_id}")
        return True
    
    logger.warning(f"Todo with ID {todo_id} not found for deletion")
    return False


def filter_todos(
    todos: List[Dict[str, Any]], 
    done: Optional[bool] = None, 
    priority: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Filter todos by completion status and/or priority.
    
    Args:
        todos: List of todo dictionaries to filter
        done: Filter by completion status (None for all)
        priority: Filter by priority level (None for all)
        
    Returns:
        Filtered list of todo dictionaries
        
    Raises:
        TodoValidationError: If filter parameters are invalid
    """
    if not isinstance(todos, list):
        raise TodoValidationError("Todos must be a list")
    
    if done is not None and not isinstance(done, bool):
        raise TodoValidationError("Done filter must be a boolean or None")
    
    if priority is not None and priority not in VALID_PRIORITIES:
        raise TodoValidationError(f"Priority filter must be one of: {VALID_PRIORITIES}")
    
    filtered_todos = todos
    
    # Filter by completion status
    if done is not None:
        filtered_todos = [todo for todo in filtered_todos if todo["done"] == done]
    
    # Filter by priority
    if priority is not None:
        filtered_todos = [todo for todo in filtered_todos if todo["priority"] == priority]
    
    logger.debug(f"Filtered {len(todos)} todos to {len(filtered_todos)} results")
    return filtered_todos


# Module initialization
if __name__ == "__main__":
    # Basic module test
    try:
        todos = load_todos()
        print(f"Loaded {len(todos)} todos")
    except Exception as e:
        print(f"Error testing module: {e}")