"""
Utility functions for parsing and display operations.

This module provides comprehensive utilities for command-line argument parsing,
data formatting, and display operations with ANSI color support and proper
error handling.
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
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    END = '\033[0m'


def _supports_color() -> bool:
    """
    Check if the terminal supports ANSI color codes.
    
    Returns:
        bool: True if colors are supported, False otherwise.
    """
    return (
        hasattr(sys.stdout, 'isatty') and 
        sys.stdout.isatty() and 
        sys.platform != 'win32'
    )


def _colorize(text: str, color: str) -> str:
    """
    Apply color to text if terminal supports it.
    
    Args:
        text: The text to colorize.
        color: The ANSI color code.
        
    Returns:
        str: Colorized text or plain text if colors not supported.
    """
    if _supports_color():
        return f"{color}{text}{Colors.END}"
    return text


# Argument Parsing Functions

def parse_args(args: List[str]) -> Dict[str, Any]:
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args: List of command-line arguments.
        
    Returns:
        Dict containing 'command', 'text', and 'flags' keys.
        
    Raises:
        TypeError: If args is not a list.
        
    Example:
        >>> parse_args(['add', 'Buy milk', '--priority', 'high'])
        {'command': 'add', 'text': 'Buy milk', 'flags': ['--priority', 'high']}
    """
    if not isinstance(args, list):
        raise TypeError("Arguments must be provided as a list")
    
    if not args:
        return {'command': None, 'text': '', 'flags': []}
    
    # First argument is typically the command
    command = args[0] if args else None
    
    # Find where flags start (arguments beginning with '-')
    flag_start = None
    for i, arg in enumerate(args[1:], 1):
        if arg.startswith('-'):
            flag_start = i
            break
    
    # Extract text (everything between command and flags)
    if flag_start is not None:
        text_parts = args[1:flag_start]
        flags = args[flag_start:]
    else:
        text_parts = args[1:]
        flags = []
    
    text = ' '.join(text_parts)
    
    return {
        'command': command,
        'text': text,
        'flags': flags
    }


def get_flag(args: List[str], flag: str) -> bool:
    """
    Check if a specific flag exists in arguments.
    
    Args:
        args: List of arguments to search.
        flag: Flag to search for (with or without dashes).
        
    Returns:
        bool: True if flag exists, False otherwise.
        
    Raises:
        TypeError: If args is not a list or flag is not a string.
        
    Example:
        >>> get_flag(['--priority', 'high', '--done'], '--done')
        True
    """
    if not isinstance(args, list):
        raise TypeError("Arguments must be provided as a list")
    if not isinstance(flag, str):
        raise TypeError("Flag must be a string")
    
    # Normalize flag format
    if not flag.startswith('-'):
        flag = f"--{flag}"
    
    return flag in args


def get_flag_value(args: List[str], flag: str) -> Optional[str]:
    """
    Get the value that follows a specific flag.
    
    Args:
        args: List of arguments to search.
        flag: Flag to find the value for.
        
    Returns:
        Optional[str]: The value following the flag, or None if not found.
        
    Raises:
        TypeError: If args is not a list or flag is not a string.
        ValueError: If flag is found but has no value.
        
    Example:
        >>> get_flag_value(['--priority', 'high'], '--priority')
        'high'
    """
    if not isinstance(args, list):
        raise TypeError("Arguments must be provided as a list")
    if not isinstance(flag, str):
        raise TypeError("Flag must be a string")
    
    # Normalize flag format
    if not flag.startswith('-'):
        flag = f"--{flag}"
    
    try:
        flag_index = args.index(flag)
        if flag_index + 1 < len(args) and not args[flag_index + 1].startswith('-'):
            return args[flag_index + 1]
        else:
            raise ValueError(f"Flag '{flag}' found but no value provided")
    except ValueError as e:
        if "is not in list" in str(e):
            return None
        raise


def parse_ids(args: List[str]) -> List[int]:
    """
    Extract and validate numeric IDs from arguments.
    
    Args:
        args: List of arguments that may contain IDs.
        
    Returns:
        List[int]: List of valid integer IDs.
        
    Raises:
        TypeError: If args is not a list.
        ValueError: If any ID cannot be converted to integer.
        
    Example:
        >>> parse_ids(['1', '2', '5'])
        [1, 2, 5]
    """
    if not isinstance(args, list):
        raise TypeError("Arguments must be provided as a list")
    
    ids = []
    for arg in args:
        if isinstance(arg, str) and not arg.startswith('-'):
            try:
                id_val = int(arg)
                if id_val <= 0:
                    raise ValueError(f"ID must be a positive integer, got: {id_val}")
                ids.append(id_val)
            except ValueError as e:
                if "invalid literal" in str(e):
                    continue  # Skip non-numeric arguments
                raise
    
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
        
    Raises:
        TypeError: If headers or rows are not lists.
        ValueError: If rows have inconsistent column counts.
        
    Example:
        >>> headers = ['ID', 'Status', 'Todo']
        >>> rows = [['1', '[ ]', 'Buy milk'], ['2', '[✓]', 'Walk dog']]
        >>> print(format_table(headers, rows))
        ID | Status | Todo
        ---+--------+---------
        1  | [ ]    | Buy milk
        2  | [✓]    | Walk dog
    """
    if not isinstance(headers, list):
        raise TypeError("Headers must be provided as a list")
    if not isinstance(rows, list):
        raise TypeError("Rows must be provided as a list")
    
    if not headers:
        return ""
    
    # Validate row consistency
    expected_cols = len(headers)
    for i, row in enumerate(rows):
        if not isinstance(row, list):
            raise TypeError(f"Row {i} must be a list")
        if len(row) != expected_cols:
            raise ValueError(f"Row {i} has {len(row)} columns, expected {expected_cols}")
    
    # Calculate column widths
    col_widths = []
    for i, header in enumerate(headers):
        max_width = len(str(header))
        for row in rows:
            # Remove ANSI codes for width calculation
            clean_text = _strip_ansi_codes(str(row[i]))
            max_width = max(max_width, len(clean_text))
        col_widths.append(max_width)
    
    # Build table
    lines = []
    
    # Header row
    header_parts = []
    separator_parts = []
    for i, header in enumerate(headers):
        header_parts.append(str(header).ljust(col_widths[i]))
        separator_parts.append('-' * col_widths[i])
    
    lines.append(' | '.join(header_parts))
    lines.append('-+-'.join(separator_parts))
    
    # Data rows
    for row in rows:
        row_parts = []
        for i, cell in enumerate(row):
            cell_str = str(cell)
            # Calculate padding considering ANSI codes
            clean_cell = _strip_ansi_codes(cell_str)
            padding = col_widths[i] - len(clean_cell)
            padded_cell = cell_str + ' ' * padding
            row_parts.append(padded_cell)
        lines.append(' | '.join(row_parts))
    
    return '\n'.join(lines)


def _strip_ansi_codes(text: str) -> str:
    """
    Remove ANSI escape codes from text for length calculation.
    
    Args:
        text: Text that may contain ANSI codes.
        
    Returns:
        str: Text with ANSI codes removed.
    """
    import re
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)


def format_todo(todo: Dict[str, Any]) -> str:
    """
    Format a single todo item for display.
    
    Args:
        todo: Dictionary containing todo information with keys:
              'id', 'text', 'completed', 'priority', 'created_at'.
              
    Returns:
        str: Formatted todo string.
        
    Raises:
        TypeError: If todo is not a dictionary.
        KeyError: If required keys are missing.
        
    Example:
        >>> todo = {'id': 1, 'text': 'Buy milk', 'completed': False, 
        ...          'priority': 'high', 'created_at': datetime.now()}
        >>> format_todo(todo)
        '1 | [ ] | high | Buy milk | 5 minutes ago'
    """
    if not isinstance(todo, dict):
        raise TypeError("Todo must be a dictionary")
    
    required_keys = ['id', 'text', 'completed', 'priority', 'created_at']
    for key in required_keys:
        if key not in todo:
            raise KeyError(f"Missing required key: {key}")
    
    # Format status
    status = '[✓]' if todo['completed'] else '[ ]'
    if todo['completed']:
        status = _colorize(status, Colors.GREEN)
    
    # Format priority
    priority = str(todo['priority'])
    if priority.lower() == 'high':
        priority = _colorize(priority, Colors.RED)
    elif priority.lower() == 'medium':
        priority = _colorize(priority, Colors.YELLOW)
    
    # Format date
    date_str = format_date(todo['created_at'])
    
    # Truncate text if too long
    text = truncate(str(todo['text']), 50)
    
    return f"{todo['id']} | {status} | {priority} | {text} | {date_str}"


def truncate(text: str, max_len: int) -> str:
    """
    Truncate text with ellipsis when needed.
    
    Args:
        text: Text to potentially truncate.
        max_len: Maximum allowed length.
        
    Returns:
        str: Truncated text with ellipsis if needed.
        
    Raises:
        TypeError: If text is not a string or max_len is not an integer.
        ValueError: If max_len is less than 4.
        
    Example:
        >>> truncate("This is a very long text", 10)
        'This is...'
    """
    if not isinstance(text, str):
        raise TypeError("Text must be a string")
    if not isinstance(max_len, int):
        raise TypeError("Max length must be an integer")
    if max_len < 4:
        raise ValueError("Max length must be at least 4 to accommodate ellipsis")
    
    if len(text) <= max_len:
        return text
    
    return text[:max_len - 3] + '...'


def format_date(date: Union[datetime, str, None]) -> str:
    """
    Convert datetime to relative time format.
    
    Args:
        date: Datetime object, ISO string, or None.
        
    Returns:
        str: Formatted relative time string.
        
    Raises:
        TypeError: If date is not datetime, string, or None.
        ValueError: If string date cannot be parsed.
        
    Example:
        >>> from datetime import datetime, timedelta
        >>> past_date = datetime.now() - timedelta(hours=2)
        >>> format_date(past_date)
        '2 hours ago'
    """
    if date is None:
        return 'Unknown'
    
    # Handle string dates
    if isinstance(date, str):
        try:
            # Try parsing ISO format
            date = datetime.fromisoformat(date.replace('Z', '+00:00'))
        except ValueError:
            try:
                # Try parsing common formats
                date = datetime.strptime(date, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                raise ValueError(f"Unable to parse date string: {date}")
    
    if not isinstance(date, datetime):
        raise TypeError("Date must be a datetime object, string, or None")
    
    now = datetime.now()
    
    # Handle future dates
    if date > now:
        return format_date_absolute(date)
    
    diff = now - date
    
    # Less than 1 hour
    if diff < timedelta(hours=1):
        minutes = max(1, int(diff.total_seconds() / 60))
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    
    # Less than 24 hours
    elif diff < timedelta(days=1):
        hours = int(diff.total_seconds() / 3600)
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    
    # Less than 7 days
    elif diff < timedelta(days=7):
        days = diff.days
        return f"{days} day{'s' if days != 1 else ''} ago"
    
    # Older than 7 days
    else:
        return format_date_absolute(date)


def format_date_absolute(date: datetime) -> str:
    """
    Format datetime in YYYY-MM-DD format.
    
    Args:
        date: Datetime object to format.
        
    Returns:
        str: Date in YYYY-MM-DD format.
        
    Raises:
        TypeError: If date is not a datetime object.
    """
    if not isinstance(date, datetime):
        raise TypeError("Date must be a datetime object")
    
    return date.strftime('%Y-%m-%d')


# Utility helper functions

def validate_todo_dict(todo: Dict[str, Any]) -> bool:
    """