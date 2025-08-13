# storage.todos

JSON file storage for todos without external dependencies.

Dependencies: json, os, datetime (standard library only)

Requirements:
- File location: ~/.todos.json
- Create file if doesn't exist
- Handle corrupted JSON gracefully (backup and recreate)

Todo structure:
```json
{
  "id": 1,
  "text": "Task description",
  "done": false,
  "created": "2024-01-01T10:00:00",
  "completed": null,
  "priority": "medium",
  "tags": ["work", "urgent"]
}
```

Functions:
- load_todos(): Read and parse todos from file
- save_todos(todos): Write todos to file
- backup_corrupted_file(): Save corrupted file with timestamp
- get_next_id(todos): Get next available ID
- ensure_file_exists(): Create empty todos file if needed

Error handling:
- FileNotFoundError: Create new file
- JSONDecodeError: Backup and create new
- PermissionError: Show clear error message
- IOError: Show file system error