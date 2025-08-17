"""
Utility functions for parsing and display formatting.

This module provides utilities for command-line argument parsing, table formatting,
and date/time display with optional ANSI color support.
"""

import sys
from datetime import datetime, timedelta
from typing import List, Optional, Tuple, Dict, Any, Union


# ANSI color codes
class Colors:
    """ANSI color codes for terminal output."""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'


def _supports_color() -> bool:
    """
    Check if the terminal supports ANSI color codes.
    
    Returns:
        bool: True if colors are supported, False otherwise.
    """
    try:
        # Check if stdout is a TTY and not redirected
        if not hasattr(sys.stdout, 'isatty') or not sys.stdout.isatty():
            return False
        
        # Check for common environment variables that indicate color support
        import os
        term = os.environ.get('TERM', '').lower()
        colorterm = os.environ.get('COLORTERM', '').lower()
        
        if 'color' in term or 'color' in colorterm or term in ['xterm', 'xterm-256color', 'screen']:
            return True
            
        return False
    except Exception:
        return False


def _colorize(text: str, color: str) -> str:
    """
    Apply ANSI color to text if colors are supported.
    
    Args:
        text: The text to colorize.
        color: The ANSI color code.
        
    Returns:
        str: Colored text if supported, plain text otherwise.
    """
    if _supports_color():
        return f"{color}{text}{Colors.END}"
    return text


# Argument Parsing Functions

def parse_args(args: Optional[List[str]]) -> Tuple[Optional[str], Optional[str], List[str]]:
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args: List of command-line arguments (excluding script name).
        
    Returns:
        Tuple containing:
        - command (str or None): First non-flag argument
        - text (str or None): Remaining non-flag arguments joined as text
        - flags (List[str]): All flag arguments (starting with -)
        
    Examples:
        >>> parse_args(['add', 'Buy milk', '--priority', 'high'])
        ('add', 'Buy milk', ['--priority', 'high'])
        
        >>> parse_args(['-h', '--help'])
        (None, None, ['-h', '--help'])
        
        >>> parse_args([])
        (None, None, [])
    """
    if not args:
        return None, None, []
    
    if not isinstance(args, list):
        raise TypeError("Arguments must be a list of strings")
    
    command = None
    text_parts = []
    flags = []
    
    for i, arg in enumerate(args):
        if not isinstance(arg, str):
            raise TypeError(f"All arguments must be strings, got {type(arg)}")
            
        if arg.startswith('-'):
            # This and all remaining args are flags/values
            flags.extend(args[i:])
            break
        elif command is None:
            command = arg
        else:
            text_parts.append(arg)
    
    text = ' '.join(text_parts) if text_parts else None
    
    return command, text, flags


def get_flag(args: Optional[List[str]], flag: str) -> bool:
    """
    Check if a flag exists in arguments.
    
    Args:
        args: List of arguments to search.
        flag: Flag to search for (with or without leading dashes).
        
    Returns:
        bool: True if flag is found, False otherwise.
        
    Examples:
        >>> get_flag(['--verbose', '-h'], '--verbose')
        True
        
        >>> get_flag(['--verbose', '-h'], 'verbose')
        True
        
        >>> get_flag(['--verbose'], '--quiet')
        False
    """
    if not args or not flag:
        return False
    
    if not isinstance(args, list):
        raise TypeError("Arguments must be a list")
    
    if not isinstance(flag, str):
        raise TypeError("Flag must be a string")
    
    # Normalize flag (ensure it starts with -)
    normalized_flag = flag if flag.startswith('-') else f"--{flag}"
    
    return normalized_flag in args


def get_flag_value(args: Optional[List[str]], flag: str) -> Optional[str]:
    """
    Get the value following a flag in arguments.
    
    Args:
        args: List of arguments to search.
        flag: Flag to search for.
        
    Returns:
        str or None: Value following the flag, or None if flag not found or no value.
        
    Examples:
        >>> get_flag_value(['--priority', 'high', '--verbose'], '--priority')
        'high'
        
        >>> get_flag_value(['--priority', 'high'], 'priority')
        'high'
        
        >>> get_flag_value(['--verbose'], '--priority')
        None
    """
    if not args or not flag:
        return None
    
    if not isinstance(args, list):
        raise TypeError("Arguments must be a list")
    
    if not isinstance(flag, str):
        raise TypeError("Flag must be a string")
    
    # Normalize flag
    normalized_flag = flag if flag.startswith('-') else f"--{flag}"
    
    try:
        flag_index = args.index(normalized_flag)
        if flag_index + 1 < len(args) and not args[flag_index + 1].startswith('-'):
            return args[flag_index + 1]
    except ValueError:
        pass
    
    return None


def parse_ids(args: Optional[List[str]]) -> List[int]:
    """
    Extract numeric IDs from arguments.
    
    Args:
        args: List of arguments to parse.
        
    Returns:
        List[int]: List of valid integer IDs found in arguments.
        
    Examples:
        >>> parse_ids(['1', '2', '3'])
        [1, 2, 3]
        
        >>> parse_ids(['delete', '1', 'invalid', '2'])
        [1, 2]
        
        >>> parse_ids(['--flag', 'text'])
        []
    """
    if not args:
        return []
    
    if not isinstance(args, list):
        raise TypeError("Arguments must be a list")
    
    ids = []
    for arg in args:
        if not isinstance(arg, str):
            continue
            
        try:
            # Skip flags
            if arg.startswith('-'):
                continue
            id_val = int(arg)
            if id_val > 0:  # Only positive IDs
                ids.append(id_val)
        except ValueError:
            continue
    
    return ids


# Display Formatting Functions

def format_table(headers: List[str], rows: List[List[str]]) -> str:
    """
    Create aligned ASCII table with borders.
    
    Args:
        headers: List of column headers.
        rows: List of rows, where each row is a list of cell values.
        
    Returns:
        str: Formatted table as a string.
        
    Examples:
        >>> headers = ['ID', 'Name', 'Status']
        >>> rows = [['1', 'Task 1', 'Done'], ['2', 'Task 2', 'Pending']]
        >>> print(format_table(headers, rows))
        ID | Name   | Status
        ---+--------+--------
        1  | Task 1 | Done
        2  | Task 2 | Pending
    """
    if not headers:
        raise ValueError("Headers cannot be empty")
    
    if not isinstance(headers, list):
        raise TypeError("Headers must be a list")
    
    if not isinstance(rows, list):
        raise TypeError("Rows must be a list")
    
    # Convert all values to strings and handle None values
    str_headers = [str(h) if h is not None else '' for h in headers]
    str_rows = []
    
    for row in rows:
        if not isinstance(row, list):
            raise TypeError("Each row must be a list")
        str_row = [str(cell) if cell is not None else '' for cell in row]
        # Pad row to match header length
        while len(str_row) < len(str_headers):
            str_row.append('')
        str_rows.append(str_row)
    
    if not str_rows:
        # Return just headers if no rows
        return ' | '.join(str_headers)
    
    # Calculate column widths
    col_widths = [len(header) for header in str_headers]
    
    for row in str_rows:
        for i, cell in enumerate(row[:len(col_widths)]):
            col_widths[i] = max(col_widths[i], len(cell))
    
    # Format header
    header_line = ' | '.join(header.ljust(col_widths[i]) for i, header in enumerate(str_headers))
    
    # Format separator
    separator = '+'.join('-' * (width + 2) for width in col_widths)
    
    # Format rows
    formatted_rows = []
    for row in str_rows:
        formatted_row = ' | '.join(
            row[i].ljust(col_widths[i]) if i < len(row) else ''.ljust(col_widths[i])
            for i in range(len(col_widths))
        )
        formatted_rows.append(formatted_row)
    
    # Combine all parts
    result = [header_line, separator] + formatted_rows
    return '\n'.join(result)


def format_todo(todo: Dict[str, Any]) -> str:
    """
    Format a single todo item for display.
    
    Args:
        todo: Dictionary containing todo data with keys: id, text, completed, priority, created_at.
        
    Returns:
        str: Formatted todo string with optional colors.
        
    Examples:
        >>> todo = {'id': 1, 'text': 'Buy milk', 'completed': False, 'priority': 'high'}
        >>> format_todo(todo)
        '1. [ ] Buy milk (high priority)'
    """
    if not isinstance(todo, dict):
        raise TypeError("Todo must be a dictionary")
    
    # Extract values with defaults
    todo_id = todo.get('id', '?')
    text = todo.get('text', 'No description')
    completed = todo.get('completed', False)
    priority = todo.get('priority', 'normal')
    
    # Format status
    status = '[✓]' if completed else '[ ]'
    
    # Format priority
    priority_text = f" ({priority} priority)" if priority and priority != 'normal' else ''
    
    # Base format
    formatted = f"{todo_id}. {status} {text}{priority_text}"
    
    # Apply colors
    if completed:
        formatted = _colorize(formatted, Colors.GREEN)
    elif priority == 'high':
        formatted = _colorize(formatted, Colors.RED)
    elif priority == 'medium':
        formatted = _colorize(formatted, Colors.YELLOW)
    
    return formatted


def truncate(text: Optional[str], max_len: int) -> str:
    """
    Shorten text with ellipsis if needed.
    
    Args:
        text: Text to potentially truncate.
        max_len: Maximum length before truncation.
        
    Returns:
        str: Original text or truncated version with ellipsis.
        
    Examples:
        >>> truncate('This is a long sentence', 10)
        'This is...'
        
        >>> truncate('Short', 10)
        'Short'
        
        >>> truncate(None, 10)
        ''
    """
    if text is None:
        return ''
    
    if not isinstance(text, str):
        text = str(text)
    
    if not isinstance(max_len, int) or max_len < 0:
        raise ValueError("max_len must be a non-negative integer")
    
    if max_len == 0:
        return ''
    
    if len(text) <= max_len:
        return text
    
    if max_len <= 3:
        return text[:max_len]
    
    return text[:max_len - 3] + '...'


def format_date(date: Optional[Union[datetime, str]]) -> str:
    """
    Convert datetime to relative time string.
    
    Args:
        date: Datetime object or ISO format string to format.
        
    Returns:
        str: Formatted relative time string.
        
    Examples:
        >>> from datetime import datetime, timedelta
        >>> now = datetime.now()
        >>> format_date(now - timedelta(minutes=30))
        '30 minutes ago'
        
        >>> format_date(now - timedelta(hours=2))
        '2 hours ago'
        
        >>> format_date(now - timedelta(days=3))
        '3 days ago'
    """
    if date is None:
        return 'Unknown'
    
    # Handle string input
    if isinstance(date, str):
        try:
            # Try to parse ISO format
            date = datetime.fromisoformat(date.replace('Z', '+00:00'))
        except ValueError:
            try:
                # Try common format
                date = datetime.strptime(date, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                return 'Invalid date'
    
    if not isinstance(date, datetime):
        raise TypeError("Date must be a datetime object or ISO format string")
    
    try:
        now = datetime.now()
        
        # Handle timezone-aware datetimes
        if date.tzinfo is not None and now.tzinfo is None:
            # Convert to naive datetime for comparison
            date = date.replace(tzinfo=None)
        elif date.tzinfo is None and now.tzinfo is not None:
            now = now.replace(tzinfo=None)
        
        if date > now:
            # Future date - just return the date
            return date.strftime('%Y-%m-%d')
        
        diff = now - date
        
        # Less than 1 hour
        if diff < timedelta(hours=1):
            minutes = int(diff.total_seconds() / 60)
            if minutes <= 0:
                return 'Just now'
            elif minutes == 1:
                return '1 minute ago'
            else:
                return f'{minutes} minutes ago'
        
        # Less than 24 hours
        elif diff < timedelta(days=1):
            hours = int(diff.total_seconds() / 3600)
            if hours == 1:
                return '1 hour ago'
            else:
                return f'{hours} hours ago'
        
        # Less than 7 days
        elif diff < timedelta(days=7):
            days = diff.days
            if days == 1:
                return '1 day ago'
            else:
                return f'{days} days ago'
        
        # Older than 7 days
        else:
            return date.strftime('%Y-%m-%d')
            
    except Exception as e:
        return f'Date error: {str(e)}'


# Module-level constants
__version__ = '1.0.0'
__all__ = [
    'parse_args',
    'get_flag', 
    'get_flag_value',
    'parse_ids',
    'format_table',
    'format_todo',
    'truncate',
    'format_