"""
Utility module for parsing and display functionality.

This module provides utility functions for command-line argument parsing,
table formatting, and display operations with optional ANSI color support.
"""

import os
import sys
from datetime import datetime, timezone
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
    if os.environ.get('NO_COLOR'):
        return False
    
    # Check TERM environment variable
    term = os.environ.get('TERM', '').lower()
    if term in ('dumb', ''):
        return False
    
    # Check for common color-supporting terminals
    return any(color_term in term for color_term in ['color', 'xterm', 'screen', 'tmux'])


def _colorize(text: str, color: str) -> str:
    """
    Apply color to text if terminal supports it.
    
    Args:
        text: Text to colorize.
        color: ANSI color code.
        
    Returns:
        str: Colored text or plain text if colors not supported.
    """
    if _supports_color():
        return f"{color}{text}{Colors.RESET}"
    return text


# Argument Parsing Functions

def parse_args(args: List[str]) -> Dict[str, Any]:
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args: List of command-line arguments.
        
    Returns:
        dict: Dictionary containing 'command', 'text', and 'flags'.
        
    Raises:
        ValueError: If args is None or empty.
    """
    if not args:
        raise ValueError("Arguments list cannot be empty")
    
    if not isinstance(args, list):
        raise TypeError("Arguments must be a list")
    
    result = {
        'command': '',
        'text': '',
        'flags': []
    }
    
    # First argument is typically the command
    result['command'] = str(args[0]) if args else ''
    
    text_parts = []
    flags = []
    
    i = 1
    while i < len(args):
        arg = str(args[i])
        if arg.startswith('-'):
            flags.append(arg)
            # Check if next argument is a flag value (doesn't start with -)
            if i + 1 < len(args) and not str(args[i + 1]).startswith('-'):
                flags.append(str(args[i + 1]))
                i += 2
            else:
                i += 1
        else:
            text_parts.append(arg)
            i += 1
    
    result['text'] = ' '.join(text_parts)
    result['flags'] = flags
    
    return result


def get_flag(args: List[str], flag: str) -> bool:
    """
    Check if a specific flag exists in arguments.
    
    Args:
        args: List of command-line arguments.
        flag: Flag to search for (with or without leading dash).
        
    Returns:
        bool: True if flag exists, False otherwise.
    """
    if not args or not isinstance(args, list):
        return False
    
    if not flag:
        return False
    
    # Normalize flag format
    normalized_flag = flag if flag.startswith('-') else f'-{flag}'
    
    return normalized_flag in [str(arg) for arg in args]


def get_flag_value(args: List[str], flag: str) -> Optional[str]:
    """
    Get the value that follows a specific flag.
    
    Args:
        args: List of command-line arguments.
        flag: Flag to search for (with or without leading dash).
        
    Returns:
        str or None: Value following the flag, or None if flag not found or no value.
    """
    if not args or not isinstance(args, list):
        return None
    
    if not flag:
        return None
    
    # Normalize flag format
    normalized_flag = flag if flag.startswith('-') else f'-{flag}'
    
    try:
        for i, arg in enumerate(args):
            if str(arg) == normalized_flag and i + 1 < len(args):
                next_arg = str(args[i + 1])
                # Return value only if it doesn't look like another flag
                if not next_arg.startswith('-'):
                    return next_arg
    except (IndexError, TypeError):
        pass
    
    return None


def parse_ids(args: List[str]) -> List[int]:
    """
    Extract and return numeric IDs from arguments.
    
    Args:
        args: List of command-line arguments.
        
    Returns:
        list: List of integer IDs found in arguments.
    """
    if not args or not isinstance(args, list):
        return []
    
    ids = []
    for arg in args:
        try:
            # Convert to string first, then try to parse as int
            arg_str = str(arg).strip()
            if arg_str.isdigit():
                ids.append(int(arg_str))
        except (ValueError, TypeError):
            continue
    
    return ids


# Display Formatting Functions

def format_table(headers: List[str], rows: List[List[str]]) -> str:
    """
    Create properly aligned ASCII table with borders.
    
    Args:
        headers: List of column headers.
        rows: List of rows, where each row is a list of cell values.
        
    Returns:
        str: Formatted ASCII table.
        
    Raises:
        ValueError: If headers is empty or rows have inconsistent column counts.
    """
    if not headers:
        raise ValueError("Headers cannot be empty")
    
    if not isinstance(headers, list):
        raise TypeError("Headers must be a list")
    
    if not isinstance(rows, list):
        raise TypeError("Rows must be a list")
    
    # Convert all values to strings and validate row lengths
    str_headers = [str(h) for h in headers]
    str_rows = []
    
    for i, row in enumerate(rows):
        if not isinstance(row, list):
            raise TypeError(f"Row {i} must be a list")
        
        if len(row) != len(headers):
            raise ValueError(f"Row {i} has {len(row)} columns, expected {len(headers)}")
        
        str_rows.append([str(cell) for cell in row])
    
    # Calculate column widths
    col_widths = [len(header) for header in str_headers]
    
    for row in str_rows:
        for i, cell in enumerate(row):
            col_widths[i] = max(col_widths[i], len(cell))
    
    # Build table
    lines = []
    
    # Header row
    header_cells = [header.ljust(width) for header, width in zip(str_headers, col_widths)]
    lines.append(" | ".join(header_cells))
    
    # Separator row
    separator_cells = ["-" * width for width in col_widths]
    lines.append("-+-".join(separator_cells))
    
    # Data rows
    for row in str_rows:
        row_cells = [cell.ljust(width) for cell, width in zip(row, col_widths)]
        lines.append(" | ".join(row_cells))
    
    return "\n".join(lines)


def format_todo(todo: Dict[str, Any]) -> str:
    """
    Format a single todo item for display.
    
    Args:
        todo: Dictionary containing todo item data with keys like 'id', 'text', 
              'completed', 'priority', 'created_date'.
              
    Returns:
        str: Formatted todo item string.
        
    Raises:
        TypeError: If todo is not a dictionary.
    """
    if not isinstance(todo, dict):
        raise TypeError("Todo must be a dictionary")
    
    # Extract fields with defaults
    todo_id = todo.get('id', '')
    text = str(todo.get('text', ''))
    completed = bool(todo.get('completed', False))
    priority = str(todo.get('priority', 'medium')).lower()
    created_date = todo.get('created_date')
    
    # Format status
    status = "[✓]" if completed else "[ ]"
    if completed:
        status = _colorize(status, Colors.GREEN)
    
    # Format priority
    priority_display = priority
    if priority == 'high':
        priority_display = _colorize(priority, Colors.RED)
    elif priority == 'medium':
        priority_display = _colorize(priority, Colors.YELLOW)
    
    # Format text (truncate if too long)
    text_display = truncate(text, 50)
    if completed:
        text_display = _colorize(text_display, Colors.GREEN)
    
    # Format date if available
    date_display = ""
    if created_date:
        try:
            date_display = f" ({format_date(created_date)})"
        except (TypeError, ValueError):
            pass
    
    return f"{todo_id} {status} [{priority_display}] {text_display}{date_display}"


def truncate(text: str, max_len: int) -> str:
    """
    Truncate text with ellipsis if too long.
    
    Args:
        text: Text to potentially truncate.
        max_len: Maximum length before truncation.
        
    Returns:
        str: Original text or truncated text with ellipsis.
        
    Raises:
        ValueError: If max_len is less than 4 (minimum for "...").
        TypeError: If text is not convertible to string.
    """
    if max_len < 4:
        raise ValueError("max_len must be at least 4 to accommodate ellipsis")
    
    try:
        text_str = str(text)
    except Exception as e:
        raise TypeError(f"Text must be convertible to string: {e}")
    
    if len(text_str) <= max_len:
        return text_str
    
    return text_str[:max_len - 3] + "..."


def format_date(date: Union[datetime, str]) -> str:
    """
    Convert datetime to relative time format.
    
    Args:
        date: Datetime object or ISO format string.
        
    Returns:
        str: Formatted relative time string.
        
    Raises:
        TypeError: If date is not datetime or string.
        ValueError: If date string cannot be parsed.
    """
    if date is None:
        raise ValueError("Date cannot be None")
    
    # Parse date if it's a string
    if isinstance(date, str):
        try:
            # Try parsing ISO format
            if 'T' in date:
                date = datetime.fromisoformat(date.replace('Z', '+00:00'))
            else:
                date = datetime.strptime(date, '%Y-%m-%d')
        except ValueError as e:
            raise ValueError(f"Cannot parse date string '{date}': {e}")
    elif not isinstance(date, datetime):
        raise TypeError("Date must be datetime object or string")
    
    # Ensure we have timezone info for comparison
    now = datetime.now(timezone.utc)
    
    # Make date timezone-aware if it isn't
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    
    # Calculate time difference
    try:
        diff = now - date
        total_seconds = diff.total_seconds()
    except (TypeError, OverflowError):
        # Fallback to simple date format
        return date.strftime('%Y-%m-%d')
    
    # Handle future dates
    if total_seconds < 0:
        return date.strftime('%Y-%m-%d')
    
    # Format based on time difference
    if total_seconds < 3600:  # Less than 1 hour
        minutes = max(1, int(total_seconds // 60))
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    elif total_seconds < 86400:  # Less than 24 hours
        hours = int(total_seconds // 3600)
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    elif total_seconds < 604800:  # Less than 7 days
        days = int(total_seconds // 86400)
        return f"{days} day{'s' if days != 1 else ''} ago"
    else:  # Older than 7 days
        return date.strftime('%Y-%m-%d')