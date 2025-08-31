"""
Utility functions for parsing and display.

This module provides utilities for command-line argument parsing,
table formatting, and display functions with optional ANSI color support.
"""

import sys
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple, Union


# ANSI Color Codes
class Colors:
    """ANSI color codes for terminal output."""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    RESET = '\033[0m'


def supports_color() -> bool:
    """
    Check if the terminal supports ANSI color codes.
    
    Returns:
        bool: True if terminal supports colors, False otherwise.
    """
    # Check if stdout is a TTY and not redirected
    if not hasattr(sys.stdout, 'isatty') or not sys.stdout.isatty():
        return False
    
    # Check for common environment variables that indicate color support
    term = sys.platform
    if term == 'win32':
        # Windows 10+ supports ANSI colors
        import os
        return os.environ.get('ANSICON') is not None or \
               'TERM' in os.environ or \
               os.environ.get('ConEmuANSI') == 'ON'
    
    return True


def colorize(text: str, color: str) -> str:
    """
    Apply ANSI color to text if terminal supports it.
    
    Args:
        text: Text to colorize.
        color: ANSI color code.
        
    Returns:
        str: Colored text or plain text if colors not supported.
    """
    if not supports_color():
        return text
    return f"{color}{text}{Colors.RESET}"


# Argument Parsing Functions

def parse_args(args: Optional[List[str]]) -> Dict[str, Any]:
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args: List of command-line arguments.
        
    Returns:
        dict: Dictionary containing 'command', 'text', and 'flags'.
        
    Example:
        >>> parse_args(['add', 'Buy milk', '--priority', 'high'])
        {'command': 'add', 'text': 'Buy milk', 'flags': ['--priority', 'high']}
    """
    if not args or not isinstance(args, list):
        return {'command': None, 'text': '', 'flags': []}
    
    # Convert all args to strings
    str_args = [str(arg) for arg in args]
    
    if not str_args:
        return {'command': None, 'text': '', 'flags': []}
    
    command = str_args[0] if str_args else None
    text_parts = []
    flags = []
    
    i = 1
    while i < len(str_args):
        arg = str_args[i]
        if arg.startswith('-'):
            # This is a flag, add it and potentially its value
            flags.append(arg)
            # Check if next arg is a value (doesn't start with -)
            if i + 1 < len(str_args) and not str_args[i + 1].startswith('-'):
                flags.append(str_args[i + 1])
                i += 2
            else:
                i += 1
        else:
            # This is part of the text
            text_parts.append(arg)
            i += 1
    
    return {
        'command': command,
        'text': ' '.join(text_parts),
        'flags': flags
    }


def get_flag(args: Optional[List[str]], flag: str) -> bool:
    """
    Check if a specific flag exists in args.
    
    Args:
        args: List of arguments to search.
        flag: Flag to look for (e.g., '--verbose', '-v').
        
    Returns:
        bool: True if flag exists, False otherwise.
        
    Example:
        >>> get_flag(['--verbose', 'hello'], '--verbose')
        True
    """
    if not args or not isinstance(args, list) or not flag:
        return False
    
    return str(flag) in [str(arg) for arg in args]


def get_flag_value(args: Optional[List[str]], flag: str) -> Optional[str]:
    """
    Get the value that follows a flag.
    
    Args:
        args: List of arguments to search.
        flag: Flag to look for.
        
    Returns:
        str or None: Value following the flag, or None if not found.
        
    Example:
        >>> get_flag_value(['--priority', 'high', 'task'], '--priority')
        'high'
    """
    if not args or not isinstance(args, list) or not flag:
        return None
    
    str_args = [str(arg) for arg in args]
    
    try:
        flag_index = str_args.index(str(flag))
        if flag_index + 1 < len(str_args):
            next_arg = str_args[flag_index + 1]
            # Don't return another flag as a value
            if not next_arg.startswith('-'):
                return next_arg
    except ValueError:
        pass
    
    return None


def parse_ids(args: Optional[List[str]]) -> List[int]:
    """
    Extract numeric IDs from arguments.
    
    Args:
        args: List of arguments to parse.
        
    Returns:
        list: List of integer IDs found in arguments.
        
    Example:
        >>> parse_ids(['delete', '1', '3', 'hello', '5'])
        [1, 3, 5]
    """
    if not args or not isinstance(args, list):
        return []
    
    ids = []
    for arg in args:
        try:
            # Convert to string first, then try to parse as int
            str_arg = str(arg).strip()
            if str_arg.isdigit():
                ids.append(int(str_arg))
        except (ValueError, TypeError):
            continue
    
    return ids


# Display Formatting Functions

def format_table(headers: List[str], rows: List[List[str]]) -> str:
    """
    Create aligned ASCII table with proper spacing.
    
    Args:
        headers: List of column headers.
        rows: List of rows, where each row is a list of strings.
        
    Returns:
        str: Formatted ASCII table.
        
    Example:
        >>> headers = ['ID', 'Name']
        >>> rows = [['1', 'John'], ['2', 'Jane']]
        >>> print(format_table(headers, rows))
        ID | Name
        ---+-----
        1  | John
        2  | Jane
    """
    if not headers:
        return ""
    
    # Ensure all headers are strings
    headers = [str(h) for h in headers]
    
    # Ensure all row data are strings and handle empty rows
    processed_rows = []
    for row in rows:
        if not isinstance(row, list):
            continue
        processed_row = [str(cell) for cell in row]
        # Pad row to match header length
        while len(processed_row) < len(headers):
            processed_row.append("")
        processed_rows.append(processed_row)
    
    if not processed_rows:
        processed_rows = [[""] * len(headers)]
    
    # Calculate column widths
    col_widths = []
    for i, header in enumerate(headers):
        max_width = len(header)
        for row in processed_rows:
            if i < len(row):
                # Handle Unicode characters properly
                cell_width = len(str(row[i]))
                max_width = max(max_width, cell_width)
        col_widths.append(max_width)
    
    # Build table
    lines = []
    
    # Header row
    header_parts = []
    for i, header in enumerate(headers):
        header_parts.append(header.ljust(col_widths[i]))
    lines.append(" | ".join(header_parts))
    
    # Separator row
    separator_parts = []
    for width in col_widths:
        separator_parts.append("-" * width)
    lines.append("-+-".join(separator_parts))
    
    # Data rows
    for row in processed_rows:
        row_parts = []
        for i in range(len(headers)):
            cell = row[i] if i < len(row) else ""
            row_parts.append(cell.ljust(col_widths[i]))
        lines.append(" | ".join(row_parts))
    
    return "\n".join(lines)


def format_todo(todo: Dict[str, Any]) -> str:
    """
    Format a single todo item for display.
    
    Args:
        todo: Dictionary containing todo data with keys like 'id', 'text', 
              'completed', 'priority', 'created_at'.
              
    Returns:
        str: Formatted todo string.
        
    Example:
        >>> todo = {'id': 1, 'text': 'Buy milk', 'completed': False, 'priority': 'high'}
        >>> format_todo(todo)
        '1. [ ] Buy milk (high priority)'
    """
    if not isinstance(todo, dict):
        return "Invalid todo format"
    
    # Extract fields with defaults
    todo_id = todo.get('id', '?')
    text = str(todo.get('text', 'No description'))
    completed = todo.get('completed', False)
    priority = todo.get('priority', '')
    created_at = todo.get('created_at')
    
    # Format completion status
    status = "[✓]" if completed else "[ ]"
    if completed:
        status = colorize(status, Colors.GREEN)
    
    # Format priority
    priority_str = ""
    if priority:
        priority_text = f"({priority} priority)"
        if priority.lower() == 'high':
            priority_str = colorize(priority_text, Colors.RED)
        elif priority.lower() == 'medium':
            priority_str = colorize(priority_text, Colors.YELLOW)
        else:
            priority_str = priority_text
    
    # Format date if available
    date_str = ""
    if created_at:
        try:
            if isinstance(created_at, str):
                # Try to parse string date
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            if isinstance(created_at, datetime):
                date_str = f" - {format_date(created_at)}"
        except (ValueError, TypeError):
            pass
    
    # Combine parts
    parts = [f"{todo_id}. {status} {text}"]
    if priority_str:
        parts.append(f" {priority_str}")
    if date_str:
        parts.append(date_str)
    
    return "".join(parts)


def truncate(text: str, max_len: int) -> str:
    """
    Shorten text with ellipsis if too long.
    
    Args:
        text: Text to potentially truncate.
        max_len: Maximum length allowed.
        
    Returns:
        str: Original text or truncated version with ellipsis.
        
    Example:
        >>> truncate("This is a long sentence", 10)
        'This is...'
    """
    if not isinstance(text, str):
        text = str(text)
    
    if max_len <= 0:
        return ""
    
    if len(text) <= max_len:
        return text
    
    if max_len <= 3:
        return "." * max_len
    
    return text[:max_len - 3] + "..."


def format_date(date: Union[datetime, str]) -> str:
    """
    Convert datetime to relative time format.
    
    Args:
        date: Datetime object or ISO format string.
        
    Returns:
        str: Formatted relative time string.
        
    Rules:
        - Less than 1 hour: "X minutes ago"
        - Less than 24 hours: "X hours ago"
        - Less than 7 days: "X days ago"
        - Older than 7 days: "YYYY-MM-DD"
        
    Example:
        >>> from datetime import datetime, timedelta
        >>> recent = datetime.now() - timedelta(minutes=30)
        >>> format_date(recent)
        '30 minutes ago'
    """
    try:
        # Handle string input
        if isinstance(date, str):
            # Try to parse ISO format
            date = datetime.fromisoformat(date.replace('Z', '+00:00'))
        
        if not isinstance(date, datetime):
            return "Invalid date"
        
        now = datetime.now()
        
        # Handle timezone-aware datetime
        if date.tzinfo is not None and now.tzinfo is None:
            # Convert to naive datetime for comparison
            date = date.replace(tzinfo=None)
        elif date.tzinfo is None and now.tzinfo is not None:
            now = now.replace(tzinfo=None)
        
        # Calculate time difference
        if date > now:
            # Future date - just return the date
            return date.strftime("%Y-%m-%d")
        
        diff = now - date
        
        # Less than 1 hour
        if diff < timedelta(hours=1):
            minutes = int(diff.total_seconds() / 60)
            if minutes <= 0:
                return "just now"
            elif minutes == 1:
                return "1 minute ago"
            else:
                return f"{minutes} minutes ago"
        
        # Less than 24 hours
        elif diff < timedelta(days=1):
            hours = int(diff.total_seconds() / 3600)
            if hours == 1:
                return "1 hour ago"
            else:
                return f"{hours} hours ago"
        
        # Less than 7 days
        elif diff < timedelta(days=7):
            days = diff.days
            if days == 1:
                return "1 day ago"
            else:
                return f"{days} days ago"
        
        # Older than 7 days
        else:
            return date.strftime("%Y-%m-%d")
    
    except (ValueError, TypeError, AttributeError) as e:
        return "Invalid date"


# Example usage and testing
if __name__ == "__main__":
    # Test argument parsing
    test_args = ['add', 'Buy groceries', '--priority', 'high', '--due', 'tomorrow']
    parsed = parse_args(test_args)
    print("Parsed args:", parsed)
    
    # Test table formatting
    headers = ['ID', 'Status', 'Priority', 'Todo']
    rows = [
        ['1', '[ ]', 'high', 'Finish report'],
        ['2', '[✓]', 'medium', 'Buy groceries'],
        ['3', '[ ]', 'low', 'Call dentist']
    ]
    table = format_table(headers, rows)
    print("\nTable:")
    print(table)
    
    # Test date formatting
    now = datetime.now()
    test_dates = [
        now - timedelta(minutes=30),
        now - timedelta(hours=2),
        now - timedelta(days=3),
        now - timedelta(days=10)
    ]
    
    print("\nDate formatting:")
    for test_date in test_dates:
        print(f"{test_date} -> {format_date(test_date)}")