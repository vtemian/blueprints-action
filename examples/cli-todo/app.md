# app

Todo storage and core operations.

Dependencies: json, os, datetime, @utils

Requirements:
- Store todos in ~/.todos.json
- Auto-create file if doesn't exist
- Handle corrupted JSON (backup and recreate)

Todo structure:
```json
{
  "id": 1,
  "text": "Task description",
  "done": false,
  "created": "2024-01-01T10:00:00",
  "priority": "medium"
}
```

Core functions:
- load_todos(): Read todos from file
- save_todos(todos): Write todos to file
- add_todo(text, priority="medium"): Create new todo
- get_todo(id): Find todo by ID
- update_todo(id, changes): Update todo fields
- delete_todo(id): Remove todo
- filter_todos(todos, done=None, priority=None): Filter list

File operations:
- Create ~/.todos.json if missing
- Backup corrupted files as .todos.json.backup
- Handle permission errors gracefully