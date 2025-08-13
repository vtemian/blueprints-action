# commands.stats

Show statistics command.

Dependencies: @storage.todos, @utils.display, datetime

Requirements:
- Calculate and display todo statistics
- Show totals, pending, completed
- Show completed today
- Show by priority
- Show oldest pending

Usage:
```
todo stats
```

Output format:
```
Todo Statistics:
- Total: 15
- Pending: 8
- Completed: 7
- Completed today: 2
- High priority: 3
- Oldest pending: "Fix bug" (5 days ago)
```

Calculations:
- Count todos by status
- Count completed today (compare dates)
- Group by priority
- Find oldest incomplete todo
- Calculate completion rate percentage