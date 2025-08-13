# utils.display

Display formatting utilities for terminal output.

Dependencies: datetime (standard library only)

Requirements:
- Format todos as aligned table
- Show colored output if terminal supports
- Format dates as relative time
- Truncate long text

Functions:
- format_table(headers, rows): Create aligned table
- format_todo_row(todo): Format single todo for display
- format_relative_time(date): Convert to "2 hours ago"
- truncate_text(text, max_length): Add ellipsis if too long
- colorize(text, color): Add ANSI color codes (optional)

Table formatting:
- Calculate column widths
- Add separator line
- Align columns properly
- Handle Unicode characters

Relative time:
- "just now" (< 1 minute)
- "X minutes ago"
- "X hours ago"  
- "yesterday"
- "X days ago"
- Full date if > 7 days

Colors (if supported):
- Green for completed
- Red for high priority
- Yellow for medium priority
- Gray for completed items