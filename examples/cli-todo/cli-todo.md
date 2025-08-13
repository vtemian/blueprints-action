# CLI Todo Application

Build a command-line todo application that manages tasks with a simple text-based storage system. The application should work without any external dependencies - use only standard library features.

## Core Requirements

### Data Storage
- Store todos in a JSON file in the user's home directory (`~/.todos.json`)
- Create the file automatically if it doesn't exist
- Handle file read/write errors gracefully

### Todo Structure
Each todo should have:
- id: unique identifier (timestamp-based or incremental)
- text: the todo description
- done: boolean status
- created: creation timestamp
- completed: completion timestamp (when marked as done)
- priority: optional (high, medium, low)
- tags: optional list of tags

## Commands

### Add a todo
```
todo add "Buy groceries"
todo add "Finish report" --priority high
todo add "Call dentist" --tags personal,health
```

### List todos
```
todo list              # Show all incomplete todos
todo list --all        # Show all todos including completed
todo list --done       # Show only completed todos
todo list --tag work   # Filter by tag
todo list --priority high  # Filter by priority
```

Output format:
```
ID  | Status | Priority | Todo
----+--------+----------+------------------------
1   | [ ]    | high     | Finish report
2   | [ ]    | medium   | Buy groceries
3   | [✓]    | low      | Call dentist
```

### Mark todo as complete
```
todo done 1
todo done 1 2 3    # Mark multiple as done
```

### Remove a todo
```
todo remove 1
todo rm 1          # Alias for remove
todo remove --done  # Remove all completed todos
```

### Update a todo
```
todo update 1 "Buy groceries and cook dinner"
todo update 1 --priority low
todo update 1 --add-tag shopping
todo update 1 --remove-tag personal
```

### Search todos
```
todo search "groceries"     # Search in todo text
todo search "report" --all  # Search including completed
```

### Show statistics
```
todo stats
```

Output:
```
Todo Statistics:
- Total: 15
- Pending: 8
- Completed: 7
- Completed today: 2
- High priority: 3
- Overdue: 1
```

### Clear all todos
```
todo clear          # Prompt for confirmation
todo clear --force  # No confirmation
```

### Show help
```
todo help
todo help add      # Show help for specific command
```

## Implementation Requirements

### Command Line Parsing
- Parse arguments without external libraries
- Support both short and long options
- Handle quoted strings properly
- Provide clear error messages for invalid commands

### Error Handling
- File not found: create new todo file
- Invalid JSON: backup corrupted file and create new
- Invalid command: show help for that command
- Invalid ID: show error message
- File permissions: show clear error message

### Display
- Use colors if terminal supports it (optional)
- Align columns properly
- Truncate long todos with "..." if needed
- Show relative times (e.g., "2 hours ago", "yesterday")

### Performance
- Lazy loading of todo file
- Efficient searching and filtering
- Minimal memory usage

## Language-Specific Implementation Notes

### Python
- Use argparse from standard library
- Use json module for storage
- Use datetime for timestamps
- Use os.path for file paths

### Node.js
- Use process.argv for arguments
- Use fs module for file operations
- Use built-in JSON support
- Use os.homedir() for home directory

### Go
- Use flag package or manual parsing
- Use encoding/json for storage
- Use time package for timestamps
- Use os.UserHomeDir() for home directory

### Rust
- Use std::env for arguments
- Use serde_json (if allowed) or manual JSON parsing
- Use std::fs for file operations
- Use dirs::home_dir() or env vars

### C/C++
- Use argc/argv for arguments
- Implement simple JSON parser/writer
- Use file I/O from stdio.h/fstream
- Use getenv("HOME") for home directory

## Example Usage Session

```bash
$ todo add "Write documentation"
Added: #1 - Write documentation

$ todo add "Review PRs" --priority high
Added: #2 - Review PRs [high priority]

$ todo list
ID  | Status | Priority | Todo
----+--------+----------+------------------------
2   | [ ]    | high     | Review PRs
1   | [ ]    | medium   | Write documentation

$ todo done 2
Completed: #2 - Review PRs

$ todo list
ID  | Status | Priority | Todo
----+--------+----------+------------------------
1   | [ ]    | medium   | Write documentation

$ todo stats
Todo Statistics:
- Total: 2
- Pending: 1
- Completed: 1
- Completed today: 1
```

## Testing Considerations

Include tests for:
- Adding todos with various options
- Listing with different filters
- Marking todos as complete/incomplete
- Removing todos
- Handling edge cases (empty list, invalid IDs)
- File corruption recovery
- Concurrent access (optional)