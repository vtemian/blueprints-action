"""
Todo Storage and Core Operations Module

This module provides comprehensive todo management functionality with persistent
JSON file storage, robust error handling, and data validation.

Author: Assistant
Date: 2024
"""

import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional, Union
from utils import *  # Assuming local utils module exists


# Constants
TODO_FILE = os.path.expanduser("~/.todos.json")
BACKUP_FILE = TODO_FILE + ".backup"
VALID_PRIORITIES = {"low", "medium", "high"}


def load_todos() -> List[Dict[str, Any]]:
    """
    Load todos from the JSON file with comprehensive error handling.
    
    Creates an empty todos file if it doesn't exist. If the JSON is corrupted,
    backs up the corrupted file and creates a new empty one.
    
    Returns:
        List[Dict[str, Any]]: List of todo dictionaries, empty list if file 
                             doesn't exist or on any error
    
    Raises:
        None: All exceptions are handled gracefully
    """
    try:
        # Check if file exists
        if not os.path.exists(TODO_FILE):
            print(f"Todo file not found at {TODO_FILE}. Creating new empty file.")
            save_todos([])
            return []
        
        # Attempt to read and parse the JSON file
        with open(TODO_FILE, 'r', encoding='utf-8') as file:
            todos = json.load(file)
            
        # Validate that todos is a list
        if not isinstance(todos, list):
            print(f"Warning: Todo file contains invalid data type. Expected list, got {type(todos).__name__}")
            _backup_and_recreate()
            return []
            
        # Validate each todo structure
        validated_todos = []
        for i, todo in enumerate(todos):
            if _validate_todo_structure(todo):
                validated_todos.append(todo)
            else:
                print(f"Warning: Invalid todo structure at index {i}, skipping: {todo}")
        
        return validated_todos
        
    except json.JSONDecodeError as e:
        print(f"Error: Corrupted JSON in todo file: {e}")
        _backup_and_recreate()
        return []
        
    except PermissionError:
        print(f"Error: Permission denied accessing {TODO_FILE}")
        return []
        
    except FileNotFoundError:
        print(f"Todo file not found at {TODO_FILE}. Creating new empty file.")
        save_todos([])
        return []
        
    except Exception as e:
        print(f"Unexpected error loading todos: {e}")
        return []


def save_todos(todos: List[Dict[str, Any]]) -> bool:
    """
    Save todos list to JSON file with proper formatting and error handling.
    
    Args:
        todos (List[Dict[str, Any]]): List of todo dictionaries to save
        
    Returns:
        bool: True if save was successful, False otherwise
        
    Raises:
        None: All exceptions are handled gracefully
    """
    if not isinstance(todos, list):
        print(f"Error: Expected list of todos, got {type(todos).__name__}")
        return False
    
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(TODO_FILE), exist_ok=True)
        
        # Write to file with proper JSON formatting
        with open(TODO_FILE, 'w', encoding='utf-8') as file:
            json.dump(todos, file, indent=2, ensure_ascii=False)
            
        return True
        
    except PermissionError:
        print(f"Error: Permission denied writing to {TODO_FILE}")
        return False
        
    except OSError as e:
        print(f"Error: Could not write to {TODO_FILE}: {e}")
        return False
        
    except Exception as e:
        print(f"Unexpected error saving todos: {e}")
        return False


def add_todo(text: str, priority: str = "medium") -> Optional[Dict[str, Any]]:
    """
    Create and add a new todo with validation.
    
    Args:
        text (str): Task description (must be non-empty)
        priority (str): Priority level ("low", "medium", or "high")
        
    Returns:
        Optional[Dict[str, Any]]: The newly created todo dict, or None if failed
        
    Raises:
        None: All exceptions are handled gracefully
    """
    # Input validation
    if not isinstance(text, str) or not text.strip():
        print("Error: Todo text must be a non-empty string")
        return None
        
    if not isinstance(priority, str) or priority not in VALID_PRIORITIES:
        print(f"Error: Priority must be one of {VALID_PRIORITIES}")
        return None
    
    try:
        # Load existing todos
        todos = load_todos()
        
        # Generate new ID (thread-safe by finding max existing ID)
        new_id = max((todo.get('id', 0) for todo in todos), default=0) + 1
        
        # Create new todo
        new_todo = {
            'id': new_id,
            'text': text.strip(),
            'done': False,
            'created': datetime.now().isoformat(),
            'priority': priority
        }
        
        # Add to list and save
        todos.append(new_todo)
        
        if save_todos(todos):
            print(f"Todo added successfully with ID {new_id}")
            return new_todo
        else:
            print("Error: Failed to save new todo")
            return None
            
    except Exception as e:
        print(f"Unexpected error adding todo: {e}")
        return None


def get_todo(todo_id: Union[int, str]) -> Optional[Dict[str, Any]]:
    """
    Find and return a todo by its ID.
    
    Args:
        todo_id (Union[int, str]): The ID of the todo to find
        
    Returns:
        Optional[Dict[str, Any]]: The todo dict if found, None otherwise
        
    Raises:
        None: All exceptions are handled gracefully
    """
    # Input validation
    try:
        todo_id = int(todo_id)
        if todo_id <= 0:
            print("Error: Todo ID must be a positive integer")
            return None
    except (ValueError, TypeError):
        print("Error: Todo ID must be a valid integer")
        return None
    
    try:
        todos = load_todos()
        
        for todo in todos:
            if todo.get('id') == todo_id:
                return todo
                
        return None
        
    except Exception as e:
        print(f"Unexpected error getting todo: {e}")
        return None


def update_todo(todo_id: Union[int, str], changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Update a todo's fields from a changes dictionary.
    
    Args:
        todo_id (Union[int, str]): The ID of the todo to update
        changes (Dict[str, Any]): Dictionary of fields to update
        
    Returns:
        Optional[Dict[str, Any]]: The updated todo dict, or None if failed
        
    Raises:
        None: All exceptions are handled gracefully
    """
    # Input validation
    try:
        todo_id = int(todo_id)
        if todo_id <= 0:
            print("Error: Todo ID must be a positive integer")
            return None
    except (ValueError, TypeError):
        print("Error: Todo ID must be a valid integer")
        return None
    
    if not isinstance(changes, dict):
        print("Error: Changes must be a dictionary")
        return None
    
    if not changes:
        print("Warning: No changes provided")
        return get_todo(todo_id)
    
    try:
        todos = load_todos()
        
        # Find the todo to update
        todo_index = None
        for i, todo in enumerate(todos):
            if todo.get('id') == todo_id:
                todo_index = i
                break
        
        if todo_index is None:
            print(f"Error: Todo with ID {todo_id} not found")
            return None
        
        # Validate and apply changes
        todo = todos[todo_index].copy()
        
        for field, value in changes.items():
            if field == 'id':
                print("Warning: Cannot change todo ID")
                continue
            elif field == 'text':
                if not isinstance(value, str) or not value.strip():
                    print("Error: Text must be a non-empty string")
                    return None
                todo[field] = value.strip()
            elif field == 'done':
                if not isinstance(value, bool):
                    print("Error: Done status must be a boolean")
                    return None
                todo[field] = value
            elif field == 'priority':
                if not isinstance(value, str) or value not in VALID_PRIORITIES:
                    print(f"Error: Priority must be one of {VALID_PRIORITIES}")
                    return None
                todo[field] = value
            elif field == 'created':
                print("Warning: Cannot change creation date")
                continue
            else:
                print(f"Warning: Unknown field '{field}' ignored")
        
        # Update the todo in the list
        todos[todo_index] = todo
        
        if save_todos(todos):
            print(f"Todo {todo_id} updated successfully")
            return todo
        else:
            print("Error: Failed to save updated todo")
            return None
            
    except Exception as e:
        print(f"Unexpected error updating todo: {e}")
        return None


def delete_todo(todo_id: Union[int, str]) -> bool:
    """
    Remove a todo by its ID.
    
    Args:
        todo_id (Union[int, str]): The ID of the todo to delete
        
    Returns:
        bool: True if todo was deleted, False if not found or failed
        
    Raises:
        None: All exceptions are handled gracefully
    """
    # Input validation
    try:
        todo_id = int(todo_id)
        if todo_id <= 0:
            print("Error: Todo ID must be a positive integer")
            return False
    except (ValueError, TypeError):
        print("Error: Todo ID must be a valid integer")
        return False
    
    try:
        todos = load_todos()
        
        # Find and remove the todo
        original_length = len(todos)
        todos = [todo for todo in todos if todo.get('id') != todo_id]
        
        if len(todos) == original_length:
            print(f"Error: Todo with ID {todo_id} not found")
            return False
        
        if save_todos(todos):
            print(f"Todo {todo_id} deleted successfully")
            return True
        else:
            print("Error: Failed to save after deletion")
            return False
            
    except Exception as e:
        print(f"Unexpected error deleting todo: {e}")
        return False


def filter_todos(todos: List[Dict[str, Any]], done: Optional[bool] = None, 
                priority: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Filter todos by completion status and/or priority.
    
    Args:
        todos (List[Dict[str, Any]]): List of todos to filter
        done (Optional[bool]): Filter by completion status (None for all)
        priority (Optional[str]): Filter by priority level (None for all)
        
    Returns:
        List[Dict[str, Any]]: Filtered list of todos
        
    Raises:
        None: All exceptions are handled gracefully
    """
    # Input validation
    if not isinstance(todos, list):
        print(f"Error: Expected list of todos, got {type(todos).__name__}")
        return []
    
    if done is not None and not isinstance(done, bool):
        print("Error: Done filter must be a boolean or None")
        return []
    
    if priority is not None and (not isinstance(priority, str) or priority not in VALID_PRIORITIES):
        print(f"Error: Priority filter must be one of {VALID_PRIORITIES} or None")
        return []
    
    try:
        filtered_todos = []
        
        for todo in todos:
            # Validate todo structure
            if not _validate_todo_structure(todo):
                continue
            
            # Apply filters
            if done is not None and todo.get('done') != done:
                continue
                
            if priority is not None and todo.get('priority') != priority:
                continue
            
            filtered_todos.append(todo)
        
        return filtered_todos
        
    except Exception as e:
        print(f"Unexpected error filtering todos: {e}")
        return []


def _validate_todo_structure(todo: Any) -> bool:
    """
    Validate that a todo has the correct structure and data types.
    
    Args:
        todo (Any): The todo object to validate
        
    Returns:
        bool: True if valid, False otherwise
    """
    if not isinstance(todo, dict):
        return False
    
    required_fields = {'id', 'text', 'done', 'created', 'priority'}
    if not all(field in todo for field in required_fields):
        return False
    
    # Validate field types and values
    if not isinstance(todo['id'], int) or todo['id'] <= 0:
        return False
    
    if not isinstance(todo['text'], str) or not todo['text'].strip():
        return False
    
    if not isinstance(todo['done'], bool):
        return False
    
    if not isinstance(todo['created'], str):
        return False
    
    if not isinstance(todo['priority'], str) or todo['priority'] not in VALID_PRIORITIES:
        return False
    
    return True


def _backup_and_recreate() -> None:
    """
    Backup corrupted todo file and create a new empty one.
    
    This is a helper function used when the JSON file is corrupted.
    """
    try:
        if os.path.exists(TODO_FILE):
            # Create backup
            with open(TODO_FILE, 'r', encoding='utf-8') as src:
                with open(BACKUP_FILE, 'w', encoding='utf-8') as dst:
                    dst.write(src.read())
            print(f"Corrupted file backed up to {BACKUP_FILE}")
        
        # Create new empty file
        save_todos([])
        print(f"Created new empty todo file at {TODO_FILE}")
        
    except Exception as e:
        print(f"Error during backup and recreation: {e}")


if __name__ == "__main__":
    # Basic testing functionality
    print("Todo Storage Module - Basic Test")
    print("=" * 40)
    
    # Test adding a todo
    todo1 = add_todo("Test todo item", "high")
    if todo1:
        print(f"Added: {todo1}")
    
    # Test loading todos
    all_todos = load_todos()
    print(f"Loaded {len(all_todos)} todos")
    
    # Test filtering
    high_priority = filter_todos(all_todos, priority="high")
    print(f"High priority todos: {len(high_priority)}")