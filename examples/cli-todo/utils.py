"""
Utility functions for parsing and display operations.

This module provides utilities for command-line argument parsing, table formatting,
and display operations with optional ANSI color support.
"""

import datetime
import os
import sys
from typing import List, Dict, Any, Optional, Tuple, Union


# ANSI Color Constants
class Colors:
    """ANSI color codes for terminal output."""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    RESET = '\033[0m'


# Formatting Constants
TABLE_SEPARATOR = '+'
TABLE_HORIZONTAL = '-'
TABLE_VERTICAL = '|'
ELLIPSIS = '...'
COMPLETED_CHECKBOX = '[✓]'
INCOMPLETE_CHECKBOX = '[ ]'


def _supports_color() -> bool:
    """
    Check if the terminal supports ANSI color codes.
    
    Returns:
        bool: True if terminal supports colors, False otherwise.
    """
    # Check if output is redirected
    if not hasattr(sys.stdout, 'isatty') or not sys.stdout.isatty():
        return False
    
    # Check environment variables
    term = os.environ.get('TERM', '').lower()
    if 'color' in term or term in ('xterm', 'xterm-256color', 'screen'):
        return True
    
    # Check for Windows terminal support
    if os.name == 'nt':
        return os.environ.get('ANSICON') is not None
    
    return False


def _colorize(text: str, color: str, use_color: bool = None) -> str:
    """
    Apply ANSI color to text if color support is available.
    
    Args:
        text: Text to colorize
        color: ANSI color code
        use_color: Override color detection (None for auto-detect)
    
    Returns:
        str: Colorized text or plain text if colors not supported
    """
    if use_color is None:
        use_color = _supports_color()
    
    if use_color:
        return f"{color}{text}{Colors.RESET}"
    return text


def parse_args(args: List[str]) -> Dict[str, Any]:
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args: List of command-line arguments
    
    Returns:
        dict: Dictionary containing 'command', 'text', and 'flags'
    
    Examples:
        >>> parse_args(['add', 'Buy milk', '--priority', 'high'])
        {'command': 'add', 'text': 'Buy milk', 'flags': ['--priority', 'high']}
    """
    if not isinstance(args, list):
        raise TypeError("Arguments must be a list")
    
    if not args:
        return {'command': None, 'text': '', 'flags': []}
    
    result = {
        'command': None,
        'text': '',
        'flags': []
    }
    
    # First argument is typically the command
    if args and not args[0].startswith('-'):
        result['command'] = args[0]
        remaining_args = args[1:]
    else:
        remaining_args = args
    
    # Separate text and flags
    text_parts = []
    flags = []
    i = 0
    
    while i < len(remaining_args):
        arg = remaining_args[i]
        if arg.startswith('-'):
            flags.append(arg)
            # Check if next argument is a flag value (doesn't start with -)
            if (i + 1 < len(remaining_args) and 
                not remaining_args[i + 1].startswith('-')):
                flags.append(remaining_args[i + 1])
                i += 1
        else:
            # Only add to text if it's not already captured as a flag value
            if i == 0 or not remaining_args[i - 1].startswith('-'):
                text_parts.append(arg)
        i += 1
    
    result['text'] = ' '.join(text_parts)
    result['flags'] = flags
    
    return result


def get_flag(args: List[str], flag: str) -> bool:
    """
    Check if a specific flag exists in arguments.
    
    Args:
        args: List of arguments to search
        flag: Flag to search for (with or without dashes)
    
    Returns:
        bool: True if flag exists, False otherwise
    
    Examples:
        >>> get_flag(['--verbose', 'value'], '--verbose')
        True
        >>> get_flag(['-v'], 'v')
        True
    """
    if not isinstance(args, list):
        raise TypeError("Arguments must be a list")
    
    if not isinstance(flag, str):
        raise TypeError("Flag must be a string")
    
    # Normalize flag format
    if not flag.startswith('-'):
        if len(flag) == 1:
            flag = f'-{flag}'
        else:
            flag = f'--{flag}'
    
    return flag in args


def get_flag_value(args: List[str], flag: str) -> Optional[str]:
    """
    Get the value that follows a flag.
    
    Args:
        args: List of arguments to search
        flag: Flag to find the value for
    
    Returns:
        str or None: Value following the flag, or None if not found
    
    Examples:
        >>> get_flag_value(['--priority', 'high'], '--priority')
        'high'
        >>> get_flag_value(['-p', 'low'], 'p')
        'low'
    """
    if not isinstance(args, list):
        raise TypeError("Arguments must be a list")
    
    if not isinstance(flag, str):
        raise TypeError("Flag must be a string")
    
    # Normalize flag format
    if not flag.startswith('-'):
        if len(flag) == 1:
            flag = f'-{flag}'
        else:
            flag = f'--{flag}'
    
    try:
        flag_index = args.index(flag)
        if flag_index + 1 < len(args):
            next_arg = args[flag_index + 1]
            # Return value only if it doesn't look like another flag
            if not next_arg.startswith('-'):
                return next_arg
    except ValueError:
        pass
    
    return None


def parse_ids(args: List[str]) -> List[int]:
    """
    Extract and return numeric IDs from arguments.
    
    Args:
        args: List of arguments to parse
    
    Returns:
        list: List of integer IDs found in arguments
    
    Examples:
        >>> parse_ids(['delete', '1', '2', '5'])
        [1, 2, 5]
        >>> parse_ids(['update', 'abc', '10'])
        [10]
    """
    if not isinstance(args, list):
        raise TypeError("Arguments must be a list")
    
    ids = []
    for arg in args:
        if isinstance(arg, str) and arg.isdigit():
            try:
                ids.append(int(arg))
            except ValueError:
                continue
        elif isinstance(arg, int):
            ids.append(arg)
    
    return ids


def format_table(headers: List[str], rows: List[List[str]], 
                use_color: bool = None) -> str:
    """
    Create properly aligned ASCII table with borders.
    
    Args:
        headers: List of column headers
        rows: List of rows, each row is a list of strings
        use_color: Enable color support (None for auto-detect)
    
    Returns:
        str: Formatted ASCII table
    
    Examples:
        >>> headers = ['ID', 'Status', 'Todo']
        >>> rows = [['1', '[ ]', 'Buy milk'], ['2', '[✓]', 'Walk dog']]
        >>> print(format_table(headers, rows))
        ID | Status | Todo
        ---+--------+---------
        1  | [ ]    | Buy milk
        2  | [✓]    | Walk dog
    """
    if not isinstance(headers, list):
        raise TypeError("Headers must be a list")
    
    if not isinstance(rows, list):
        raise TypeError("Rows must be a list")
    
    if not headers:
        return ""
    
    # Validate that all rows have the same number of columns as headers
    for i, row in enumerate(rows):
        if not isinstance(row, list):
            raise TypeError(f"Row {i} must be a list")
        if len(row) != len(headers):
            raise ValueError(f"Row {i} has {len(row)} columns, expected {len(headers)}")
    
    # Calculate column widths
    col_widths = []
    for i, header in enumerate(headers):
        max_width = len(str(header))
        for row in rows:
            # Remove ANSI codes for width calculation
            cell_text = str(row[i])
            # Simple ANSI code removal for width calculation
            import re
            clean_text = re.sub(r'\033\[[0-9;]*m', '', cell_text)
            max_width = max(max_width, len(clean_text))
        col_widths.append(max_width)
    
    # Build table
    lines = []
    
    # Header row
    header_parts = []
    for i, header in enumerate(headers):
        header_parts.append(str(header).ljust(col_widths[i]))
    lines.append(f" {' | '.join(header_parts)} ")
    
    # Separator row
    separator_parts = []
    for width in col_widths:
        separator_parts.append(TABLE_HORIZONTAL * width)
    lines.append(f"-{f'-{TABLE_SEPARATOR}-'.join(separator_parts)}-")
    
    # Data rows
    for row in rows:
        row_parts = []
        for i, cell in enumerate(row):
            cell_str = str(cell)
            # Calculate padding considering ANSI codes
            import re
            clean_cell = re.sub(r'\033\[[0-9;]*m', '', cell_str)
            padding = col_widths[i] - len(clean_cell)
            padded_cell = cell_str + (' ' * padding)
            row_parts.append(padded_cell)
        lines.append(f" {' | '.join(row_parts)} ")
    
    return '\n'.join(lines)


def format_todo(todo: Dict[str, Any], use_color: bool = None) -> str:
    """
    Format a single todo item for display.
    
    Args:
        todo: Dictionary containing todo data with keys like 'id', 'completed', 
              'priority', 'text', 'created_at'
        use_color: Enable color support (None for auto-detect)
    
    Returns:
        str: Formatted todo string
    
    Examples:
        >>> todo = {'id': 1, 'completed': False, 'priority': 'high', 'text': 'Buy milk'}
        >>> format_todo(todo)
        '1 | [ ] | high | Buy milk'
    """
    if not isinstance(todo, dict):
        raise TypeError("Todo must be a dictionary")
    
    # Extract todo fields with defaults
    todo_id = str(todo.get('id', ''))
    completed = todo.get('completed', False)
    priority = str(todo.get('priority', ''))
    text = str(todo.get('text', ''))
    
    # Format status checkbox
    status = COMPLETED_CHECKBOX if completed else INCOMPLETE_CHECKBOX
    
    # Apply colors if supported
    if use_color is None:
        use_color = _supports_color()
    
    if use_color:
        if completed:
            status = _colorize(status, Colors.GREEN, use_color)
        elif priority.lower() == 'high':
            priority = _colorize(priority, Colors.RED, use_color)
        elif priority.lower() == 'medium':
            priority = _colorize(priority, Colors.YELLOW, use_color)
    
    return f"{todo_id} | {status} | {priority} | {text}"


def truncate(text: str, max_len: int) -> str:
    """
    Truncate text with ellipsis if exceeds length.
    
    Args:
        text: Text to truncate
        max_len: Maximum length including ellipsis
    
    Returns:
        str: Truncated text with ellipsis if needed
    
    Examples:
        >>> truncate("This is a long text", 10)
        'This is...'
        >>> truncate("Short", 10)
        'Short'
    """
    if not isinstance(text, str):
        text = str(text)
    
    if not isinstance(max_len, int) or max_len < 0:
        raise ValueError("max_len must be a non-negative integer")
    
    if max_len == 0:
        return ""
    
    if len(text) <= max_len:
        return text
    
    if max_len <= len(ELLIPSIS):
        return ELLIPSIS[:max_len]
    
    return text[:max_len - len(ELLIPSIS)] + ELLIPSIS


def format_date(date: Union[datetime.datetime, str, None]) -> str:
    """
    Convert datetime to relative time format.
    
    Args:
        date: Datetime object, ISO string, or None
    
    Returns:
        str: Formatted relative time string
    
    Examples:
        >>> from datetime import datetime, timedelta
        >>> recent = datetime.now() - timedelta(minutes=30)
        >>> format_date(recent)
        '30 minutes ago'
    """
    if date is None:
        return ""
    
    # Convert string to datetime if needed
    if isinstance(date, str):
        try:
            # Try parsing ISO format
            if 'T' in date:
                date = datetime.datetime.fromisoformat(date.replace('Z', '+00:00'))
            else:
                date = datetime.datetime.strptime(date, '%Y-%m-%d')
        except ValueError as e:
            raise ValueError(f"Invalid date format: {date}") from e
    
    if not isinstance(date, datetime.datetime):
        raise TypeError("Date must be a datetime object, ISO string, or None")
    
    now = datetime.datetime.now()
    
    # Handle timezone-aware datetimes
    if date.tzinfo is not None and now.tzinfo is None:
        # Convert to naive datetime for comparison
        date = date.replace(tzinfo=None)
    elif date.tzinfo is None and now.tzinfo is not None:
        now = now.replace(tzinfo=None)
    
    # Calculate time difference
    if date > now:
        # Future date - treat as "just now"
        return "just now"
    
    diff = now - date
    total_seconds = diff.total_seconds()
    
    # Less than 1 hour
    if total_seconds < 3600:
        minutes = int(total_seconds // 60)
        if minutes <= 0:
            return "just now"
        elif minutes == 1:
            return "1 minute ago"
        else:
            return f"{minutes} minutes ago"
    
    # Less than 24 hours
    elif total_seconds < 86400:
        hours = int(total_seconds // 3600)
        if hours == 1:
            return "1 hour ago"
        else:
            return f"{hours} hours ago"
    
    # Less than 7 days
    elif diff.days < 7:
        if diff.days == 1:
            return "1 day ago"
        else:
            return f"{diff.days} days ago"
    
    # Older than