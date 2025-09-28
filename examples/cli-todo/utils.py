"""
Utility module for command-line todo application.

This module provides argument parsing and display formatting utilities
for a todo list application with support for ANSI colors and table formatting.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
import sys
import os


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
    # Check if output is redirected or if we're on Windows without color support
    if not hasattr(sys.stdout, 'isatty') or not sys.stdout.isatty():
        return False
    
    # Check environment variables
    if os.environ.get('NO_COLOR'):
        return False
    
    term = os.environ.get('TERM', '').lower()
    if term in ('dumb', ''):
        return False
    
    return True


def _colorize(text: str, color: str) -> str:
    """
    Apply ANSI color to text if colors are supported.
    
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

def parse_args(args: List[str]) -> Tuple[Optional[str], Optional[str], List[str]]:
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args: List of command line arguments.
    
    Returns:
        Tuple containing (command, text, flags) where:
        - command: First non-flag argument or None
        - text: Remaining non-flag arguments joined as string or None
        - flags: List of all flag arguments (starting with -)
    
    Examples:
        >>> parse_args(['add', 'Buy milk', '--high'])
        ('add', 'Buy milk', ['--high'])
        >>> parse_args(['--help'])
        (None, None, ['--help'])
    """
    if not args:
        return None, None, []
    
    command = None
    text_parts = []
    flags = []
    
    for i, arg in enumerate(args):
        if arg.startswith('-'):
            flags.extend(args[i:])  # All remaining args are flags/values
            break
        elif command is None:
            command = arg
        else:
            text_parts.append(arg)
    
    text = ' '.join(text_parts) if text_parts else None
    
    return command, text, flags


def get_flag(args: List[str], flag: str) -> bool:
    """
    Check if a flag exists in arguments.
    
    Args:
        args: List of arguments to search.
        flag: Flag to search for (with or without leading dashes).
    
    Returns:
        bool: True if flag exists, False otherwise.
    
    Examples:
        >>> get_flag(['--help', '--verbose'], '--help')
        True
        >>> get_flag(['-h', '-v'], 'h')
        True
    """
    if not args or not flag:
        return False
    
    # Normalize flag format
    normalized_flag = flag if flag.startswith('-') else f"-{flag}"
    if not normalized_flag.startswith('--') and len(flag) == 1:
        normalized_flag = f"-{flag}"
    
    return normalized_flag in args


def get_flag_value(args: List[str], flag: str) -> Optional[str]:
    """
    Get the value that follows a flag.
    
    Args:
        args: List of arguments to search.
        flag: Flag to search for.
    
    Returns:
        str or None: Value following the flag, or None if flag not found or no value.
    
    Examples:
        >>> get_flag_value(['--priority', 'high', '--done'], '--priority')
        'high'
        >>> get_flag_value(['--help'], '--help')
        None
    """
    if not args or not flag:
        return None
    
    # Normalize flag format
    normalized_flag = flag if flag.startswith('-') else f"-{flag}"
    
    try:
        flag_index = args.index(normalized_flag)
        if flag_index + 1 < len(args) and not args[flag_index + 1].startswith('-'):
            return args[flag_index + 1]
    except ValueError:
        pass
    
    return None


def parse_ids(args: List[str]) -> List[int]:
    """
    Extract all numeric IDs from arguments.
    
    Args:
        args: List of arguments to parse.
    
    Returns:
        List[int]: List of integers found in arguments.
    
    Examples:
        >>> parse_ids(['delete', '1', '2', '5'])
        [1, 2, 5]
        >>> parse_ids(['add', 'task', '--priority', 'high'])
        []
    """
    if not args:
        return []
    
    ids = []
    for arg in args:
        if arg.startswith('-'):
            continue
        try:
            id_val = int(arg)
            if id_val > 0:  # Only positive IDs
                ids.append(id_val)
        except ValueError:
            continue
    
    return ids


# Display Formatting Functions

def format_table(headers: List[str], rows: List[List[str]]) -> str:
    """
    Create aligned ASCII table with proper spacing and separators.
    
    Args:
        headers: List of column headers.
        rows: List of rows, where each row is a list of strings.
    
    Returns:
        str: Formatted ASCII table.
    
    Examples:
        >>> headers = ['ID', 'Status', 'Task']
        >>> rows = [['1', '[ ]', 'Buy milk'], ['2', '[✓]', 'Walk dog']]
        >>> print(format_table(headers, rows))
        ID | Status | Task
        ---+--------+---------
        1  | [ ]    | Buy milk
        2  | [✓]    | Walk dog
    """
    if not headers:
        return ""
    
    if not rows:
        rows = []
    
    # Calculate column widths
    all_rows = [headers] + rows
    col_widths = []
    
    for col_idx in range(len(headers)):
        max_width = 0
        for row in all_rows:
            if col_idx < len(row):
                # Remove ANSI codes for width calculation
                clean_text = _strip_ansi(str(row[col_idx]))
                max_width = max(max_width, len(clean_text))
        col_widths.append(max_width)
    
    # Format header
    header_parts = []
    separator_parts = []
    
    for i, (header, width) in enumerate(zip(headers, col_widths)):
        header_parts.append(header.ljust(width))
        separator_parts.append('-' * width)
    
    result = []
    result.append(' | '.join(header_parts))
    result.append('-+-'.join(separator_parts))
    
    # Format rows
    for row in rows:
        row_parts = []
        for i, width in enumerate(col_widths):
            cell = str(row[i]) if i < len(row) else ""
            # Pad considering ANSI codes
            padding = width - len(_strip_ansi(cell))
            padded_cell = cell + ' ' * padding
            row_parts.append(padded_cell)
        result.append(' | '.join(row_parts))
    
    return '\n'.join(result)


def _strip_ansi(text: str) -> str:
    """
    Remove ANSI escape sequences from text.
    
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
        todo: Dictionary with keys: id, status, priority, text, and optionally created_date.
    
    Returns:
        str: Formatted todo string.
    
    Examples:
        >>> todo = {'id': 1, 'status': 'pending', 'priority': 'high', 'text': 'Buy milk'}
        >>> format_todo(todo)
        '1 | [ ] | high | Buy milk'
    """
    if not isinstance(todo, dict):
        return "Invalid todo format"
    
    # Extract fields with defaults
    todo_id = str(todo.get('id', '?'))
    status = todo.get('status', 'pending')
    priority = str(todo.get('priority', 'medium'))
    text = str(todo.get('text', ''))
    
    # Format status
    if status == 'completed' or status == 'done':
        status_symbol = _colorize('[✓]', Colors.GREEN)
    else:
        status_symbol = '[ ]'
    
    # Format priority with color
    if priority.lower() == 'high':
        priority_display = _colorize(priority, Colors.RED)
    elif priority.lower() == 'medium':
        priority_display = _colorize(priority, Colors.YELLOW)
    else:
        priority_display = priority
    
    # Format text with color for completed items
    if status == 'completed' or status == 'done':
        text_display = _colorize(text, Colors.GREEN)
    else:
        text_display = text
    
    return f"{todo_id} | {status_symbol} | {priority_display} | {text_display}"


def truncate(text: str, max_len: int) -> str:
    """
    Truncate text with ellipsis if longer than max_len.
    
    Args:
        text: Text to potentially truncate.
        max_len: Maximum length before truncation.
    
    Returns:
        str: Original text or truncated text with ellipsis.
    
    Examples:
        >>> truncate("This is a long sentence", 10)
        'This is...'
        >>> truncate("Short", 10)
        'Short'
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


def format_date(date: datetime) -> str:
    """
    Convert datetime to relative time string.
    
    Args:
        date: Datetime object to format.
    
    Returns:
        str: Formatted relative time string.
    
    Examples:
        >>> from datetime import datetime, timedelta
        >>> now = datetime.now()
        >>> format_date(now - timedelta(minutes=30))
        '30 minutes ago'
        >>> format_date(now - timedelta(days=10))
        '2024-01-15'  # Actual date will vary
    """
    if not isinstance(date, datetime):
        return "Invalid date"
    
    try:
        now = datetime.now()
        
        # Handle future dates
        if date > now:
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
    
    except Exception:
        return "Invalid date"


if __name__ == "__main__":
    # Simple test cases
    print("Testing utils module...")
    
    # Test parse_args
    cmd, text, flags = parse_args(['add', 'Buy milk', '--high'])
    print(f"parse_args: {cmd}, {text}, {flags}")
    
    # Test format_table
    headers = ['ID', 'Status', 'Priority', 'Todo']
    rows = [
        ['1', '[ ]', 'high', 'Finish report'],
        ['2', '[✓]', 'medium', 'Buy groceries']
    ]
    print("\nTable format:")
    print(format_table(headers, rows))
    
    # Test format_date
    now = datetime.now()
    print(f"\nDate formatting:")
    print(f"30 min ago: {format_date(now - timedelta(minutes=30))}")
    print(f"2 hours ago: {format_date(now - timedelta(hours=2))}")
    print(f"3 days ago: {format_date(now - timedelta(days=3))}")
    print(f"10 days ago: {format_date(now - timedelta(days=10))}")