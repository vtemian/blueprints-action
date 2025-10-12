"""
Todo Storage and Core Operations Module

This module provides a complete todo management system with persistent storage
using JSON files. It handles todo creation, retrieval, updating, deletion,
and filtering operations with comprehensive error handling and data validation.

The todos are stored in ~/.todos.json with automatic backup and recovery
capabilities for corrupted data files.
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Union


# File path for storing todos
TODOS_FILE = os.path.expanduser("~/.todos.json")
BACKUP_FILE = os.path.expanduser("~/.todos.json.backup")

# Valid priority levels
VALID_PRIORITIES = {"low", "medium", "high"}

# Fields that can be updated
UPDATABLE_FIELDS = {"text", "done", "priority"}


def load_todos() -> List[Dict]:
    """
    Load todos from the JSON file.
    
    Automatically creates an empty todos file if it doesn't exist.
    Handles corrupted JSON by creating a backup and starting fresh.
    
    Returns:
        List[Dict]: List of todo dictionaries, empty list if file errors occur
        
    Example:
        >>> todos = load_todos()
        >>> print(len(todos))
        0
    """
    try:
        # Check if file exists
        if not os.path.exists(TODOS_FILE):
            # Create empty todos file
            _create_empty_todos_file()
            return []
        
        # Read and parse JSON file
        with open(TODOS_FILE, 'r', encoding='utf-8') as file:
            content = file.read().strip()
            
            # Handle empty file
            if not content:
                return []
                
            todos = json.loads(content)
            
            # Ensure we have a list
            if not isinstance(todos, list):
                raise ValueError("Todos file must contain a JSON array")
                
            return todos
            
    except json.JSONDecodeError as e:
        print(f"Warning: Corrupted todos file detected. Creating backup and starting fresh.")
        _backup_corrupted_file()
        _create_empty_todos_file()
        return []
        
    except (FileNotFoundError, PermissionError, OSError) as e:
        print(f"Warning: Could not load todos file: {e}")
        return []
        
    except Exception as e:
        print(f"Warning: Unexpected error loading todos: {e}")
        return []


def save_todos(todos: List[Dict]) -> bool:
    """
    Save todos list to the JSON file.
    
    Creates the directory structure if it doesn't exist and handles
    permission errors gracefully.
    
    Args:
        todos (List[Dict]): List of todo dictionaries to save
        
    Returns:
        bool: True if save was successful, False otherwise
        
    Example:
        >>> todos = [{"id": 1, "text": "Test", "done": False, "created": "2024-01-01T10:00:00", "priority": "medium"}]
        >>> success = save_todos(todos)
        >>> print(success)
        True
    """
    try:
        # Validate input
        if not isinstance(todos, list):
            print("Error: todos must be a list")
            return False
            
        # Create directory if it doesn't exist
        todos_dir = os.path.dirname(TODOS_FILE)
        if todos_dir and not os.path.exists(todos_dir):
            os.makedirs(todos_dir, exist_ok=True)
        
        # Write todos to file with proper formatting
        with open(TODOS_FILE, 'w', encoding='utf-8') as file:
            json.dump(todos, file, indent=2, ensure_ascii=False)
            
        return True
        
    except PermissionError as e:
        print(f"Error: Permission denied writing to todos file: {e}")
        return False
        
    except OSError as e:
        print(f"Error: Could not write to todos file: {e}")
        return False
        
    except Exception as e:
        print(f"Error: Unexpected error saving todos: {e}")
        return False


def add_todo(text: str, priority: str = "medium") -> Dict:
    """
    Add a new todo item.
    
    Generates a unique ID, sets creation timestamp, and validates priority.
    Automatically saves the updated todos list.
    
    Args:
        text (str): Description of the todo task
        priority (str): Priority level ("low", "medium", "high")
        
    Returns:
        Dict: The created todo dictionary
        
    Raises:
        ValueError: If text is empty or priority is invalid
        
    Example:
        >>> todo = add_todo("Buy groceries", "high")
        >>> print(todo["text"])
        Buy groceries
    """
    # Validate input
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Todo text cannot be empty")
        
    if priority not in VALID_PRIORITIES:
        raise ValueError(f"Priority must be one of: {', '.join(VALID_PRIORITIES)}")
    
    # Load existing todos
    todos = load_todos()
    
    # Generate unique ID
    if todos:
        max_id = max(todo.get("id", 0) for todo in todos)
        new_id = max_id + 1
    else:
        new_id = 1
    
    # Create new todo
    new_todo = {
        "id": new_id,
        "text": text.strip(),
        "done": False,
        "created": datetime.now().isoformat(),
        "priority": priority
    }
    
    # Add to todos list and save
    todos.append(new_todo)
    save_todos(todos)
    
    return new_todo


def get_todo(todo_id: int) -> Optional[Dict]:
    """
    Retrieve a todo by its ID.
    
    Args:
        todo_id (int): The ID of the todo to retrieve
        
    Returns:
        Optional[Dict]: The todo dictionary if found, None otherwise
        
    Example:
        >>> todo = get_todo(1)
        >>> if todo:
        ...     print(todo["text"])
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        return None
        
    todos = load_todos()
    
    for todo in todos:
        if todo.get("id") == todo_id:
            return todo
            
    return None


def update_todo(todo_id: int, changes: Dict) -> bool:
    """
    Update an existing todo with the provided changes.
    
    Only allows updating specific fields: text, done, priority.
    Validates priority values and saves changes automatically.
    
    Args:
        todo_id (int): The ID of the todo to update
        changes (Dict): Dictionary of fields to update
        
    Returns:
        bool: True if update was successful, False otherwise
        
    Example:
        >>> success = update_todo(1, {"done": True, "priority": "low"})
        >>> print(success)
        True
    """
    # Validate input
    if not isinstance(todo_id, int) or todo_id <= 0:
        return False
        
    if not isinstance(changes, dict) or not changes:
        return False
    
    # Check for invalid fields
    invalid_fields = set(changes.keys()) - UPDATABLE_FIELDS
    if invalid_fields:
        print(f"Warning: Invalid fields ignored: {', '.join(invalid_fields)}")
        changes = {k: v for k, v in changes.items() if k in UPDATABLE_FIELDS}
    
    # Validate priority if being updated
    if "priority" in changes and changes["priority"] not in VALID_PRIORITIES:
        print(f"Error: Priority must be one of: {', '.join(VALID_PRIORITIES)}")
        return False
    
    # Validate text if being updated
    if "text" in changes and (not isinstance(changes["text"], str) or not changes["text"].strip()):
        print("Error: Todo text cannot be empty")
        return False
    
    # Load todos and find the target
    todos = load_todos()
    
    for todo in todos:
        if todo.get("id") == todo_id:
            # Apply changes
            for field, value in changes.items():
                if field == "text":
                    todo[field] = value.strip()
                else:
                    todo[field] = value
            
            # Save updated todos
            return save_todos(todos)
    
    return False


def delete_todo(todo_id: int) -> bool:
    """
    Delete a todo by its ID.
    
    Args:
        todo_id (int): The ID of the todo to delete
        
    Returns:
        bool: True if deletion was successful, False otherwise
        
    Example:
        >>> success = delete_todo(1)
        >>> print(success)
        True
    """
    if not isinstance(todo_id, int) or todo_id <= 0:
        return False
    
    todos = load_todos()
    original_length = len(todos)
    
    # Filter out the todo with matching ID
    todos = [todo for todo in todos if todo.get("id") != todo_id]
    
    # Check if anything was removed
    if len(todos) == original_length:
        return False
    
    # Save updated todos
    return save_todos(todos)


def filter_todos(todos: List[Dict], done: Optional[bool] = None, priority: Optional[str] = None) -> List[Dict]:
    """
    Filter todos by completion status and/or priority.
    
    Args:
        todos (List[Dict]): List of todos to filter
        done (Optional[bool]): Filter by completion status (None for no filter)
        priority (Optional[str]): Filter by priority level (None for no filter)
        
    Returns:
        List[Dict]: Filtered list of todos
        
    Example:
        >>> todos = load_todos()
        >>> completed = filter_todos(todos, done=True)
        >>> high_priority = filter_todos(todos, priority="high")
        >>> completed_high = filter_todos(todos, done=True, priority="high")
    """
    if not isinstance(todos, list):
        return []
    
    # Validate priority if provided
    if priority is not None and priority not in VALID_PRIORITIES:
        print(f"Warning: Invalid priority '{priority}', ignoring filter")
        priority = None
    
    filtered_todos = todos
    
    # Filter by done status
    if done is not None:
        filtered_todos = [todo for todo in filtered_todos if todo.get("done") == done]
    
    # Filter by priority
    if priority is not None:
        filtered_todos = [todo for todo in filtered_todos if todo.get("priority") == priority]
    
    return filtered_todos


def _create_empty_todos_file() -> None:
    """
    Create an empty todos JSON file.
    
    Private helper function to initialize the todos file.
    """
    try:
        todos_dir = os.path.dirname(TODOS_FILE)
        if todos_dir and not os.path.exists(todos_dir):
            os.makedirs(todos_dir, exist_ok=True)
            
        with open(TODOS_FILE, 'w', encoding='utf-8') as file:
            json.dump([], file)
            
    except Exception as e:
        print(f"Warning: Could not create empty todos file: {e}")


def _backup_corrupted_file() -> None:
    """
    Create a backup of the corrupted todos file.
    
    Private helper function to preserve corrupted data for potential recovery.
    """
    try:
        if os.path.exists(TODOS_FILE):
            # Read the corrupted content
            with open(TODOS_FILE, 'r', encoding='utf-8') as source:
                content = source.read()
            
            # Write to backup file
            with open(BACKUP_FILE, 'w', encoding='utf-8') as backup:
                backup.write(content)
                
            print(f"Corrupted file backed up to: {BACKUP_FILE}")
            
    except Exception as e:
        print(f"Warning: Could not create backup of corrupted file: {e}")


# Module-level constants for external use
__all__ = [
    'load_todos',
    'save_todos', 
    'add_todo',
    'get_todo',
    'update_todo',
    'delete_todo',
    'filter_todos',
    'VALID_PRIORITIES'
]