"""
Utility functions for todo application.

This module provides comprehensive utility functions for parsing command-line arguments,
formatting display output, and handling date/time operations for a todo application.

Author: Python Expert
Version: 1.0.0
"""

import sys
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple, Union


# Constants
ANSI_COLORS = {
    'RED': '\033[91m',
    'GREEN': '\033[92m',
    'YELLOW': '\033[93m',
    'BLUE': '\033[94m',
    'MAGENTA': '\033[95m',
    'CYAN': '\033[96m',
    'WHITE': '\033[97m',
    'BOLD': '\033[1m',
    'UNDERLINE': '\033[4m',
    'RESET': '\033[0m'
}

# Date thresholds
MINUTE_THRESHOLD = 60
HOUR_THRESHOLD = 3600
DAY_THRESHOLD = 86400
WEEK_THRESHOLD = 604800

# Default values
DEFAULT_MAX_LENGTH = 50
DEFAULT_TABLE_PADDING = 2


def _supports_color() -> bool:
    """
    Check if the terminal supports ANSI color codes.
    
    Returns:
        bool: True if terminal supports colors, False otherwise.
    """
    return (
        hasattr(sys.stdout, 'isatty') and 
        sys.stdout.isatty() and 
        'TERM' in sys.__dict__.get('environ', {}) and
        sys.__dict__.get('environ', {}).get('TERM') != 'dumb'
    )


def colorize(text: str, color: str) -> str:
    """
    Apply ANSI color to text if terminal supports it.
    
    Args:
        text (str): Text to colorize.
        color (str): Color name from ANSI_COLORS.
        
    Returns:
        str: Colorized text or plain text if colors not supported.
    """
    if not text or not isinstance(text, str):
        return str(text) if text is not None else ""
    
    if not _supports_color() or color not in ANSI_COLORS:
        return text
    
    return f"{ANSI_COLORS[color]}{text}{ANSI_COLORS['RESET']}"


# Argument Parsing Functions

def parse_args(args: Optional[List[str]]) -> Dict[str, Any]:
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args (Optional[List[str]]): List of command-line arguments.
        
    Returns:
        Dict[str, Any]: Dictionary containing 'command', 'text', and 'flags'.
        
    Example:
        >>> parse_args(['add', 'Buy milk', '--priority', 'high'])
        {'command': 'add', 'text': 'Buy milk', 'flags': ['--priority', 'high']}
    """
    if not args or not isinstance(args, list):
        return {'command': '', 'text': '', 'flags': []}
    
    # Filter out empty strings
    args = [arg for arg in args if arg and isinstance(arg, str)]
    
    if not args:
        return {'command': '', 'text': '', 'flags': []}
    
    command = args[0]
    flags = []
    text_parts = []
    
    i = 1
    while i < len(args):
        arg = args[i]
        if arg.startswith('-'):
            flags.append(arg)
            # Check if next argument is a flag value (doesn't start with -)
            if i + 1 < len(args) and not args[i + 1].startswith('-'):
                flags.append(args[i + 1])
                i += 2
            else:
                i += 1
        else:
            text_parts.append(arg)
            i += 1
    
    return {
        'command': command,
        'text': ' '.join(text_parts),
        'flags': flags
    }


def get_flag(args: Optional[List[str]], flag: str) -> bool:
    """
    Check if flag exists in arguments.
    
    Args:
        args (Optional[List[str]]): List of arguments.
        flag (str): Flag to search for (e.g., '--verbose', '-v').
        
    Returns:
        bool: True if flag exists, False otherwise.
        
    Example:
        >>> get_flag(['add', 'task', '--priority', 'high'], '--priority')
        True
    """
    if not args or not isinstance(args, list) or not flag:
        return False
    
    return flag in args


def get_flag_value(args: Optional[List[str]], flag: str) -> Optional[str]:
    """
    Get value after flag in arguments.
    
    Args:
        args (Optional[List[str]]): List of arguments.
        flag (str): Flag to search for.
        
    Returns:
        Optional[str]: Value after flag or None if not found.
        
    Example:
        >>> get_flag_value(['add', 'task', '--priority', 'high'], '--priority')
        'high'
    """
    if not args or not isinstance(args, list) or not flag:
        return None
    
    try:
        flag_index = args.index(flag)
        if flag_index + 1 < len(args):
            next_arg = args[flag_index + 1]
            # Return value only if it's not another flag
            if not next_arg.startswith('-'):
                return next_arg
    except (ValueError, IndexError):
        pass
    
    return None


def parse_ids(args: Optional[List[str]]) -> List[int]:
    """
    Extract numeric IDs from arguments.
    
    Args:
        args (Optional[List[str]]): List of arguments.
        
    Returns:
        List[int]: List of valid integer IDs.
        
    Example:
        >>> parse_ids(['complete', '1', '2', '5', 'invalid'])
        [1, 2, 5]
    """
    if not args or not isinstance(args, list):
        return []
    
    ids = []
    for arg in args:
        if isinstance(arg, str):
            try:
                id_val = int(arg)
                if id_val > 0:  # Only positive IDs
                    ids.append(id_val)
            except ValueError:
                continue
    
    return ids


# Display Formatting Functions

def format_table(headers: Optional[List[str]], rows: Optional[List[List[str]]]) -> str:
    """
    Create aligned ASCII table with borders.
    
    Args:
        headers (Optional[List[str]]): Table headers.
        rows (Optional[List[List[str]]]): Table rows.
        
    Returns:
        str: Formatted ASCII table.
        
    Example:
        >>> headers = ['ID', 'Status', 'Todo']
        >>> rows = [['1', '[ ]', 'Buy milk'], ['2', '[✓]', 'Walk dog']]
        >>> print(format_table(headers, rows))
        ID  | Status | Todo
        ----+--------+---------
        1   | [ ]    | Buy milk
        2   | [✓]    | Walk dog
    """
    if not headers or not isinstance(headers, list):
        return ""
    
    if not rows or not isinstance(rows, list):
        rows = []
    
    # Ensure all rows have same number of columns as headers
    normalized_rows = []
    for row in rows:
        if isinstance(row, list):
            normalized_row = []
            for i in range(len(headers)):
                if i < len(row) and row[i] is not None:
                    normalized_row.append(str(row[i]))
                else:
                    normalized_row.append("")
            normalized_rows.append(normalized_row)
    
    # Calculate column widths
    col_widths = [len(header) for header in headers]
    
    for row in normalized_rows:
        for i, cell in enumerate(row):
            if i < len(col_widths):
                # Remove ANSI codes for width calculation
                clean_cell = _strip_ansi_codes(cell)
                col_widths[i] = max(col_widths[i], len(clean_cell))
    
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
    for row in normalized_rows:
        row_parts = []
        for i, cell in enumerate(row):
            if i < len(col_widths):
                # Calculate padding considering ANSI codes
                clean_cell = _strip_ansi_codes(cell)
                padding = col_widths[i] - len(clean_cell)
                padded_cell = cell + " " * padding
                row_parts.append(padded_cell)
        lines.append(" | ".join(row_parts))
    
    return "\n".join(lines)


def _strip_ansi_codes(text: str) -> str:
    """
    Remove ANSI color codes from text for length calculation.
    
    Args:
        text (str): Text potentially containing ANSI codes.
        
    Returns:
        str: Text with ANSI codes removed.
    """
    import re
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)


def format_todo(todo: Any) -> str:
    """
    Format single todo item for display.
    
    Args:
        todo: Todo object with id, status, priority, text attributes.
        
    Returns:
        str: Formatted todo string.
        
    Example:
        >>> class Todo:
        ...     def __init__(self, id, status, priority, text):
        ...         self.id = id
        ...         self.status = status
        ...         self.priority = priority
        ...         self.text = text
        >>> todo = Todo(1, 'pending', 'high', 'Important task')
        >>> format_todo(todo)
        '1   | [ ]    | high     | Important task'
    """
    if not todo:
        return ""
    
    try:
        todo_id = str(getattr(todo, 'id', ''))
        status = getattr(todo, 'status', 'pending')
        priority = str(getattr(todo, 'priority', ''))
        text = str(getattr(todo, 'text', ''))
        
        # Format status
        if status == 'completed':
            status_display = colorize('[✓]', 'GREEN')
        else:
            status_display = '[ ]'
        
        # Format priority with color
        if priority.lower() == 'high':
            priority_display = colorize(priority, 'RED')
        elif priority.lower() == 'medium':
            priority_display = colorize(priority, 'YELLOW')
        else:
            priority_display = priority
        
        # Format text (apply color if completed)
        if status == 'completed':
            text_display = colorize(text, 'GREEN')
        else:
            text_display = text
        
        return f"{todo_id}   | {status_display}    | {priority_display}     | {text_display}"
        
    except Exception:
        return str(todo) if todo else ""


def truncate(text: Optional[str], max_len: int = DEFAULT_MAX_LENGTH) -> str:
    """
    Shorten text with ellipsis if exceeds length.
    
    Args:
        text (Optional[str]): Text to truncate.
        max_len (int): Maximum length before truncation.
        
    Returns:
        str: Truncated text with ellipsis if needed.
        
    Example:
        >>> truncate("This is a very long text", 10)
        'This is...'
    """
    if not text or not isinstance(text, str):
        return ""
    
    if max_len <= 0:
        return ""
    
    if len(text) <= max_len:
        return text
    
    if max_len <= 3:
        return "." * max_len
    
    return text[:max_len - 3] + "..."


def format_date(date: Optional[datetime]) -> str:
    """
    Convert datetime to relative time format.
    
    Args:
        date (Optional[datetime]): Datetime object to format.
        
    Returns:
        str: Formatted date string.
        
    Example:
        >>> from datetime import datetime, timedelta
        >>> now = datetime.now()
        >>> format_date(now - timedelta(minutes=30))
        '30 minutes ago'
    """
    if not date or not isinstance(date, datetime):
        return ""
    
    try:
        now = datetime.now()
        
        # Handle future dates
        if date > now:
            return date.strftime("%Y-%m-%d")
        
        diff = now - date
        total_seconds = int(diff.total_seconds())
        
        if total_seconds < MINUTE_THRESHOLD:
            return "just now"
        elif total_seconds < HOUR_THRESHOLD:
            minutes = total_seconds // 60
            return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        elif total_seconds < DAY_THRESHOLD:
            hours = total_seconds // HOUR_THRESHOLD
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        elif total_seconds < WEEK_THRESHOLD:
            days = total_seconds // DAY_THRESHOLD
            return f"{days} day{'s' if days != 1 else ''} ago"
        else:
            return date.strftime("%Y-%m-%d")
            
    except Exception:
        return ""


# Additional Helper Functions

def validate_priority(priority: Optional[str]) -> str:
    """
    Validate and normalize priority value.
    
    Args:
        priority (Optional[str]): Priority string to validate.
        
    Returns:
        str: Normalized priority ('low', 'medium', 'high') or 'medium' as default.
    """
    if not priority or not isinstance(priority, str):
        return 'medium'
    
    priority_lower = priority.lower().strip()
    valid_priorities = ['low', 'medium', 'high']
    
    if priority_lower in valid_priorities:
        return priority_lower
    
    return 'medium'


def format_list(items: Optional[List[Any]], separator: str = ", ") -> str:
    """
    Format a list of items into a string.
    
    Args:
        items (Optional[List[Any]]): List of items to format.
        separator (str): Separator between items.
        
    Returns:
        str: Formatted string of items.
    """
    if not items or not isinstance(items, list):
        return ""
    
    str_items = [str(item) for item in items if item is not None]
    return separator.join(str_items)


def safe_int(value: Any, default: int = 0) -> int:
    """
    Safely convert value to integer with default fallback.
    
    Args:
        value (Any): Value to convert.
        default (int): Default value if conversion fails.
        
    Returns:
        int: Converted integer or default value.
    """
    try:
        return int(value)