# commands.remove

Remove todo command implementation.

Dependencies: @storage.todos

Requirements:
- Remove by ID
- Support --done flag to remove all completed
- Confirm before removing
- Update todo list

Usage:
```
todo remove 1
todo rm 1
todo remove --done
```

Implementation:
- Parse ID or flag
- Find todo(s) to remove
- Show what will be removed
- Remove from list
- Save changes

Output:
- Success: "Removed: #1 - Buy groceries"
- With --done: "Removed 3 completed todos"

Confirmation:
- Single: "Remove 'Buy groceries'? (y/n)"
- Multiple: "Remove 3 completed todos? (y/n)"