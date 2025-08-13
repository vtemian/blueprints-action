# commands.add

Add new todo command implementation.

Dependencies: @storage.todos, @utils.parser, datetime

Requirements:
- Parse todo text from arguments
- Support --priority flag (high, medium, low)
- Support --tags flag (comma-separated)
- Generate unique ID
- Set created timestamp
- Save to storage

Usage:
```
todo add "Buy groceries"
todo add "Finish report" --priority high
todo add "Call dentist" --tags personal,health
```

Implementation:
- Extract todo text (required)
- Parse optional flags
- Create todo object with defaults
- Add to todos list
- Save and confirm

Output:
- Success: "Added: #1 - Buy groceries"
- Error: Clear message about what went wrong