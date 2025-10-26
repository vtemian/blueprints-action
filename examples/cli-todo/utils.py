"""
Utility functions for parsing command-line arguments and formatting display output.

This module provides a collection of utility functions for:
- Parsing command-line arguments and extracting flags, values, and IDs
- Formatting data into aligned ASCII tables
- Converting datetime objects to human-readable relative time strings
- Text truncation and display formatting with optional ANSI color support

All functions are designed to be stateless and handle edge cases gracefully.
"""

import datetime
import os
import sys
from typing import List, Optional, Tuple, Dict, Any, Union


# ANSI color codes with fallback support
class Colors:
    """ANSI color codes with automatic terminal support detection."""
    
    def __init__(self):
        self._colors_enabled = self._detect_color_support()
    
    def _detect_color_support(self) -> bool:
        """Detect if the terminal supports ANSI colors."""
        if os.getenv('NO_COLOR'):
            return False
        if os.getenv('FORCE_COLOR'):
            return True
        return hasattr(sys.stdout, 'isatty') and sys.stdout.isatty()
    
    @property
    def GREEN(self) -> str:
        return '\033[92m' if self._colors_enabled else ''
    
    @property
    def RED(self) -> str:
        return '\033[91m' if self._colors_enabled else ''
    
    @property
    def RESET(self) -> str:
        return '\033[0m' if self._colors_enabled else ''


# Global color instance
_colors = Colors()


def parse_args(args: Union[List[str], None]) -> Tuple[Optional[str], Optional[str], List[str]]:
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args: List of command-line arguments or None
        
    Returns:
        Tuple of (command, text, flags) where:
        - command: First non-flag argument or None
        - text: Remaining non-flag arguments joined as string or None
        - flags: List of all flag arguments (starting with -)
        
    Examples:
        >>> parse_args(['add', 'Buy milk', '--priority', 'high'])
        ('add', 'Buy milk --priority high', ['--priority', 'high'])
        >>> parse_args(None)
        (None, None, [])
    """
    if not args or not isinstance(args, list):
        return None, None, []
    
    if not args:
        return None, None, []
    
    command = None
    text_parts = []
    flags = []
    
    for i, arg in enumerate(args):
        if not isinstance(arg, str):
            continue
            
        if arg.startswith('-'):
            flags.extend(args[i:])
            break
        elif command is None:
            command = arg
        else:
            text_parts.append(arg)
    
    # Reconstruct text including any flags that were part of the original text
    if text_parts or flags:
        remaining_args = text_parts + flags
        text = ' '.join(remaining_args) if remaining_args else None
    else:
        text = None
    
    return command, text, flags


def get_flag(args: Union[List[str], None], flag: str) -> bool:
    """
    Check if a specific flag exists in arguments.
    
    Args:
        args: List of arguments to search
        flag: Flag to search for (with or without leading dashes)
        
    Returns:
        True if flag is found, False otherwise
        
    Examples:
        >>> get_flag(['--verbose', 'test'], '--verbose')
        True
        >>> get_flag(['test'], '--verbose')
        False
    """
    if not args or not isinstance(args, list) or not isinstance(flag, str):
        return False
    
    # Normalize flag format
    normalized_flag = flag if flag.startswith('-') else f'--{flag}'
    
    return any(isinstance(arg, str) and arg == normalized_flag for arg in args)


def get_flag_value(args: Union[List[str], None], flag: str) -> Optional[str]:
    """
    Get the value that follows a specific flag.
    
    Args:
        args: List of arguments to search
        flag: Flag to search for (with or without leading dashes)
        
    Returns:
        Value following the flag, or None if flag not found or no value follows
        
    Examples:
        >>> get_flag_value(['--priority', 'high', 'test'], '--priority')
        'high'
        >>> get_flag_value(['--verbose'], '--verbose')
        None
    """
    if not args or not isinstance(args, list) or not isinstance(flag, str):
        return None
    
    # Normalize flag format
    normalized_flag = flag if flag.startswith('-') else f'--{flag}'
    
    for i, arg in enumerate(args):
        if isinstance(arg, str) and arg == normalized_flag:
            # Check if there's a next argument and it's not a flag
            if i + 1 < len(args) and isinstance(args[i + 1], str) and not args[i + 1].startswith('-'):
                return args[i + 1]
            break
    
    return None


def parse_ids(args: Union[List[str], None]) -> List[int]:
    """
    Extract and return list of numeric IDs from arguments.
    
    Args:
        args: List of arguments to parse
        
    Returns:
        List of integer IDs found in arguments
        
    Examples:
        >>> parse_ids(['1', '2', '3', 'not_a_number'])
        [1, 2, 3]
        >>> parse_ids(['delete', '5'])
        [5]
    """
    if not args or not isinstance(args, list):
        return []
    
    ids = []
    for arg in args:
        if isinstance(arg, str):
            try:
                # Only accept positive integers
                id_val = int(arg)
                if id_val > 0:
                    ids.append(id_val)
            except ValueError:
                continue
        elif isinstance(arg, int) and arg > 0:
            ids.append(arg)
    
    return ids


def format_table(headers: List[str], rows: List[List[str]]) -> str:
    """
    Create aligned ASCII table with proper padding.
    
    Args:
        headers: List of column headers
        rows: List of rows, where each row is a list of cell values
        
    Returns:
        Formatted ASCII table as string
        
    Examples:
        >>> headers = ['ID', 'Name']
        >>> rows = [['1', 'John'], ['2', 'Jane']]
        >>> print(format_table(headers, rows))
        ID | Name
        ---+-----
        1  | John
        2  | Jane
    """
    if not headers or not isinstance(headers, list):
        return ""
    
    # Convert all headers to strings
    str_headers = [str(h) if h is not None else "" for h in headers]
    
    if not rows or not isinstance(rows, list):
        rows = []
    
    # Convert all row data to strings and ensure consistent column count
    str_rows = []
    for row in rows:
        if isinstance(row, list):
            str_row = [str(cell) if cell is not None else "" for cell in row]
            # Pad or truncate row to match header count
            while len(str_row) < len(str_headers):
                str_row.append("")
            str_rows.append(str_row[:len(str_headers)])
    
    if not str_rows:
        return " | ".join(str_headers)
    
    # Calculate column widths
    col_widths = []
    for i in range(len(str_headers)):
        max_width = len(str_headers[i])
        for row in str_rows:
            if i < len(row):
                # Remove ANSI color codes for width calculation
                clean_text = _strip_ansi_codes(row[i])
                max_width = max(max_width, len(clean_text))
        col_widths.append(max_width)
    
    # Format header
    header_parts = []
    separator_parts = []
    for i, header in enumerate(str_headers):
        header_parts.append(header.ljust(col_widths[i]))
        separator_parts.append("-" * col_widths[i])
    
    result = [" | ".join(header_parts)]
    result.append("-+-".join(separator_parts))
    
    # Format rows
    for row in str_rows:
        row_parts = []
        for i in range(len(str_headers)):
            cell = row[i] if i < len(row) else ""
            # Calculate padding considering ANSI codes
            clean_cell = _strip_ansi_codes(cell)
            padding = col_widths[i] - len(clean_cell)
            padded_cell = cell + " " * padding
            row_parts.append(padded_cell)
        result.append(" | ".join(row_parts))
    
    return "\n".join(result)


def format_todo(todo: Dict[str, Any]) -> str:
    """
    Format a single todo item for display.
    
    Args:
        todo: Dictionary containing todo data with keys like 'id', 'completed', 
              'priority', 'text', 'created_at'
              
    Returns:
        Formatted string representation of the todo item
        
    Examples:
        >>> todo = {'id': 1, 'completed': False, 'priority': 'high', 'text': 'Buy milk'}
        >>> format_todo(todo)
        '1 | [ ] | high | Buy milk'
    """
    if not isinstance(todo, dict):
        return ""
    
    # Extract fields with defaults
    todo_id = str(todo.get('id', ''))
    completed = todo.get('completed', False)
    priority = str(todo.get('priority', ''))
    text = str(todo.get('text', ''))
    
    # Format status
    status = "[✓]" if completed else "[ ]"
    
    # Apply colors
    if completed:
        status = f"{_colors.GREEN}{status}{_colors.RESET}"
        text = f"{_colors.GREEN}{text}{_colors.RESET}"
    elif priority.lower() == 'high':
        priority = f"{_colors.RED}{priority}{_colors.RESET}"
        text = f"{_colors.RED}{text}{_colors.RESET}"
    
    return f"{todo_id} | {status} | {priority} | {text}"


def truncate(text: Union[str, None], max_len: int) -> str:
    """
    Truncate text and add ellipsis if needed.
    
    Args:
        text: Text to truncate
        max_len: Maximum length including ellipsis
        
    Returns:
        Truncated text with ellipsis if needed
        
    Examples:
        >>> truncate("This is a long text", 10)
        'This is...'
        >>> truncate("Short", 10)
        'Short'
    """
    if text is None:
        return ""
    
    if not isinstance(text, str):
        text = str(text)
    
    if not isinstance(max_len, int) or max_len < 0:
        return text
    
    if max_len == 0:
        return ""
    
    if len(text) <= max_len:
        return text
    
    if max_len <= 3:
        return "." * max_len
    
    return text[:max_len - 3] + "..."


def format_date(date: Union[datetime.datetime, None]) -> str:
    """
    Convert datetime to relative time string.
    
    Args:
        date: Datetime object to format
        
    Returns:
        Human-readable relative time string
        
    Examples:
        >>> from datetime import datetime, timedelta
        >>> now = datetime.now()
        >>> format_date(now - timedelta(minutes=30))
        '30 minutes ago'
        >>> format_date(now - timedelta(days=10))
        '2024-01-15'  # Actual date format
    """
    if not isinstance(date, datetime.datetime):
        return ""
    
    try:
        now = datetime.datetime.now()
        
        # Handle timezone-naive datetime objects
        if date.tzinfo is not None and now.tzinfo is None:
            # If input has timezone but now doesn't, make now timezone-aware
            now = now.replace(tzinfo=date.tzinfo)
        elif date.tzinfo is None and now.tzinfo is not None:
            # If now has timezone but input doesn't, make input timezone-aware
            date = date.replace(tzinfo=now.tzinfo)
        
        # Calculate time difference
        if date > now:
            # Future date, just return the date
            return date.strftime("%Y-%m-%d")
        
        diff = now - date
        total_seconds = diff.total_seconds()
        
        # Avoid division by zero
        if total_seconds < 0:
            return date.strftime("%Y-%m-%d")
        
        # Less than 1 hour
        if total_seconds < 3600:
            minutes = max(1, int(total_seconds // 60))
            return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        
        # Less than 24 hours
        elif total_seconds < 86400:
            hours = int(total_seconds // 3600)
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        
        # Less than 7 days
        elif diff.days < 7:
            days = diff.days
            return f"{days} day{'s' if days != 1 else ''} ago"
        
        # Older than 7 days
        else:
            return date.strftime("%Y-%m-%d")
            
    except (AttributeError, ValueError, OverflowError):
        return ""


def _strip_ansi_codes(text: str) -> str:
    """
    Remove ANSI color codes from text for accurate length calculation.
    
    Args:
        text: Text potentially containing ANSI codes
        
    Returns:
        Text with ANSI codes removed
    """
    import re
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)