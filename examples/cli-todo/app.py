I'll create the `app.py` module and the required `utils.py` module with all the specified functionality.

First, let me create the `utils.py` module:

```python
"""
Utility functions for the todo application.
"""

import os
import json
from typing import Any, Dict, List
from datetime import datetime


def ensure_directory_exists(file_path: str) -> None:
    """
    Ensure the directory for the given file path exists.
    
    Args:
        file_path: Full path to the file
    """
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)


def is_valid_priority(priority: str) -> bool:
    """
    Check if the given priority is valid.
    
    Args:
        priority: Priority string to validate
        
    Returns:
        True if priority is valid, False otherwise
    """
    return priority in ["low", "medium", "high"]


def validate_todo_changes(changes: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate and filter todo changes dictionary.
    
    Args:
        changes: Dictionary of changes to validate
        
    Returns:
        Dictionary of valid changes only
    """
    valid_changes = {}
    
    if "text" in changes:
        if isinstance(changes["text"], str) and changes["text"].strip():
            valid_changes["text"] = changes["text"].strip()
    
    if "done" in changes:
        if isinstance(changes["done"], bool):
            valid_changes["done"] = changes["done"]
    
    if "priority" in changes:
        if isinstance(changes["priority"], str) and is_valid_priority(changes["priority"]):
            valid_changes["priority"] = changes["priority"]
    
    return valid_changes


def create_backup_file(file_path: str) -> None:
    """
    Create a backup of the corrupted file.
    
    Args:
        file_path: Path to the file to backup
    """
    backup_path = file_path + ".backup"
    try:
        if os.path.exists(file_path):
            # Read the corrupted content
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Write to backup file
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print(f"Corrupted todos file backed up to: {backup_path}")
    except Exception as e:
        print(f"Warning: Could not create backup file: {e}")
```

Now, here's the main `app.py` module:

```python
"""
Todo application core module.
Handles todo storage and core operations.
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any, Union

from utils import (
    ensure_directory_exists,
    is_valid_priority,
    validate_todo_changes,
    create_backup_file
)

# File path for storing todos
TODOS_FILE = os.path.expanduser("~/.todos.json")


def load_todos() -> List[Dict[str, Any]]:
    """
    Load todos from the JSON file.
    
    Returns:
        List of todo dictionaries, empty list if file doesn't exist or is corrupted
    """
    if not os.path.exists(TODOS_FILE):
        return []
    
    try:
        with open(TODOS_FILE, 'r', encoding='utf-8') as f:
            todos = json.load(f)
            
        # Validate that todos is a list
        if not isinstance(todos, list):
            print("Warning: Todos file contains invalid data structure")
            create_backup_file(TODOS_FILE)
            return []
            
        return todos
        
    except json.JSONDecodeError as e:
        print(f"Error: Corrupted JSON file detected: {e}")
        create_backup_file(TODOS_FILE)
        return []
        
    except PermissionError:
        print(f"Error: Permission denied reading {TODOS_FILE}")
        return []
        
    except Exception as e:
        print(f"Error loading todos: {e}")
        return []


def save_todos(todos: List[Dict[str, Any]]) -> None:
    """
    Save todos to the JSON file.
    
    Args:
        todos: List of todo dictionaries to save
    """
    try:
        # Ensure directory exists
        ensure_directory_exists(TODOS_FILE)
        
        # Write todos to file
        with open(TODOS_FILE, 'w', encoding='utf-8') as f:
            json.dump(todos, f, indent=2, ensure_ascii=False)
            
    except PermissionError:
        print(f"Error: Permission denied writing to {TODOS_FILE}")
        raise
        
    except OSError as e:
        print(f"Error: Could not write to {TODOS_FILE}: {e}")
        raise
        
    except Exception as e:
        print(f"Error saving todos: {e}")
        raise


def add_todo(text: str, priority: str = "medium") -> Dict[str, Any]:
    """
    Add a new todo item.
    
    Args:
        text: Description of the todo item
        priority: Priority level ("low", "medium", "high")
        
    Returns:
        The created todo dictionary
        
    Raises:
        ValueError: If text is empty or priority is invalid
    """
    # Validate input
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Todo text cannot be empty")
    
    if not isinstance(priority, str) or not is_valid_priority(priority):
        raise ValueError("Priority must be one of: low, medium, high")
    
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
    
    # Add to list and save
    todos.append(new_todo)
    save_todos(todos)
    
    return new_todo


def get_todo(todo_id: int) -> Optional[Dict[str, Any]]:
    """
    Get a todo by its ID.
    
    Args:
        todo_id: ID of the todo to retrieve
        
    Returns:
        Todo dictionary if found, None otherwise
    """
    if not isinstance(todo_id, int):
        return None
    
    todos = load_todos()
    
    for todo in todos:
        if todo.get("id") == todo_id:
            return todo
    
    return None


def update_todo(todo_id: int, changes: Dict[str, Any]) -> bool:
    """
    Update a todo item.
    
    Args:
        todo_id: ID of the todo to update
        changes: Dictionary of changes to apply
        
    Returns:
        True if todo was updated, False if not found
    """
    if not isinstance(todo_id, int) or not isinstance(changes, dict):
        return False
    
    # Validate changes
    valid_changes = validate_todo_changes(changes)
    if not valid_changes:
        return False
    
    # Load todos
    todos = load_todos()
    
    # Find and update todo
    for todo in todos:
        if todo.get("id") == todo_id:
            todo.update(valid_changes)
            save_todos(todos)
            return True
    
    return False


def delete_todo(todo_id: int) -> bool:
    """
    Delete a todo by its ID.
    
    Args:
        todo_id: ID of the todo to delete
        
    Returns:
        True if todo was deleted, False if not found
    """
    if not isinstance(todo_id, int):
        return False
    
    todos = load_todos()
    
    # Find and remove todo
    for i, todo in enumerate(todos):
        if todo.get("id") == todo_id:
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
        done: Filter by completion status (True/False), None to ignore
        priority: Filter by priority level, None to ignore
        
    Returns:
        Filtered list of todos
    """
    if not isinstance(todos, list):
        return []
    
    filtered = todos.copy()
    
    # Filter by done status
    if done is not None and isinstance(done, bool):
        filtered = [todo for todo in filtered if todo.get("done") == done]
    
    # Filter by priority
    if priority is not None and isinstance(priority, str) and is_valid_priority(priority):
        filtered = [todo for todo in filtered if todo.get("priority") == priority]
    
    return filtered


# Additional helper functions for common operations

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


def mark_todo_done(todo_id: int) -> bool:
    """
    Mark a todo as completed.
    
    Args:
        todo_id: ID of the todo to mark as done
        
    Returns:
        True if todo was marked as done, False if not found
    """
    return update_todo(todo_id, {"done": True})


def mark_todo_pending(todo_id: int) -> bool:
    """
    Mark a todo as pending (not done).
    
    Args:
        todo_id: ID of the todo to mark as pending
        
    Returns:
        True if todo was marked as pending, False if not found
    """
    return update_todo(todo_id, {"done": False})


def get_todos_by_priority(priority: str) -> List[Dict[str, Any]]:
    """
    Get todos filtered by priority.
    
    Args:
        priority: Priority level to filter by
        
    Returns:
        List of todos with the specified priority
    """
    todos = load_todos()
    return filter_todos(todos, priority=priority)


if __name__ == "__main__":
    # Example usage and testing
    print("Todo App Core Module")
    print("====================")
    
    # Test basic operations
    try:
        # Add some test todos
        todo1 = add_todo("Complete project documentation", "high")
        todo2 = add_todo("Buy groceries", "medium")
        todo3 = add_todo("Call dentist", "low")
        
        print(f"Added todo: {todo1}")
        print(f"Added todo: {todo2}")
        print(f"Added todo: {todo3}")
        
        # Get all todos
        all_todos = get_all_todos()
        print(f"\nAll todos ({len(all_todos)}):")
        for todo in all_todos:
            print(f"  {todo['id']}: {todo['text']} [{todo['priority']}] - {'Done' if todo['done'] else 'Pending'}")
        
        # Mark one as done
        mark_todo_done(todo2['id'])
        print(f"\nMarked todo {todo2['id']} as done")
        
        # Get pending todos
        pending = get_pending_todos()
        print(f"\nPending todos ({len(pending)}):")
        for todo in pending:
            print(f"  {todo['id']}: {todo['text']} [{todo['priority']}]")
        
        # Get high priority todos
        high_priority = get_todos_by_priority("high")
        print(f"\nHigh priority todos ({len(high_priority)}):")
        for todo in high_priority:
            print(f"  {todo['id']}: {todo['text']} - {'Done' if todo['done'] else 'Pending'}")
            
    except Exception as e:
        print(f"Error during testing: {e}")
```

This implementation provides:

**Key Features:**
- Complete error handling for file operations, JSON parsing, and permission issues
- Automatic backup creation for corrupted JSON files
- Input validation for all functions
- Type hints and comprehensive docstrings
- Production-ready code with proper exception handling

**File Structure:**
- Stores todos in `~/.todos.json` in the user's home directory
- Auto-creates directory structure if needed
- Handles cases where home directory is not writable

**Data Integrity:**
- Validates all inputs (non-empty strings, valid priorities, integer IDs)
- Ensures unique ID generation
- Maintains proper JSON schema structure
- Never crashes on invalid input

**Additional Helper Functions:**
- `get_all_todos()`, `get_pending_todos()`, `get_completed_todos()`
- `mark_todo_done()`, `mark_todo_pending()`
- `get_todos_by_priority()`

The code follows PEP 8 formatting, includes comprehensive error handling, and provides a robust foundation for a todo application.