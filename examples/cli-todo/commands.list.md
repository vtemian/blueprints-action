# commands.list

List todos command implementation.

Dependencies: @storage.todos, @utils.display, @utils.parser

Requirements:
- Show incomplete todos by default
- Support --all flag (show all todos)
- Support --done flag (show only completed)
- Support --tag filter
- Support --priority filter
- Format as aligned table

Usage:
```
todo list
todo list --all
todo list --done
todo list --tag work
todo list --priority high
```

Display format:
```
ID  | Status | Priority | Todo
----+--------+----------+------------------------
1   | [ ]    | high     | Finish report
2   | [✓]    | medium   | Buy groceries
```

Filtering:
- Apply filters in order
- Show message if no todos match
- Sort by: incomplete first, then by created date