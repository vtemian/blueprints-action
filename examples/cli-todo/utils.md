# utils

Utility functions for parsing and display.

Dependencies: datetime (standard library only)

Requirements:

## Argument parsing
- parse_args(args): Extract command, text, and flags
- get_flag(args, flag): Check if flag exists
- get_flag_value(args, flag): Get value after flag
- parse_ids(args): Extract numeric IDs

## Display formatting
- format_table(headers, rows): Create aligned ASCII table
- format_todo(todo): Format single todo for display
- truncate(text, max_len): Shorten with ellipsis
- format_date(date): Convert to relative time ("2 hours ago")

## Table example
```
ID  | Status | Priority | Todo
----+--------+----------+------------------------
1   | [ ]    | high     | Finish report
2   | [✓]    | medium   | Buy groceries
```

## Date formatting
- < 1 hour: "X minutes ago"
- < 24 hours: "X hours ago"
- < 7 days: "X days ago"
- Older: "YYYY-MM-DD"

## Colors (optional)
- Support ANSI colors if terminal allows
- Green for completed, red for high priority
- Graceful fallback to plain text