"""
Utility module for parsing and display functions.

This module provides utilities for command-line argument parsing, table formatting,
date formatting, and text display with optional color support.
"""

import os
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


def _supports_color() -> bool:
    """
    Check if the terminal supports ANSI color codes.
    
    Returns:
        bool: True if color is supported, False otherwise.
    """
    # Check if output is redirected
    if not hasattr(sys.stdout, 'isatty') or not sys.stdout.isatty():
        return False
    
    # Check environment variables
    term = os.environ.get('TERM', '').lower()
    colorterm = os.environ.get('COLORTERM', '').lower()
    
    # Common terminals that support color
    color_terms = ['xterm', 'xterm-color', 'xterm-256color', 'screen', 'linux']
    
    return (
        any(ct in term for ct in color_terms) or
        colorterm in ['truecolor', '24bit'] or
        os.environ.get('FORCE_COLOR') == '1'
    )


def _colorize(text: str, color: str) -> str:
    """
    Apply color to text if color is supported.
    
    Args:
        text: Text to colorize
        color: ANSI color code
        
    Returns:
        str: Colorized text or plain text if color not supported
    """
    if _supports_color():
        return f"{color}{text}{Colors.RESET}"
    return text


# Argument Parsing Functions

def parse_args(args: List[str]) -> Dict[str, Any]:
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args: List of command-line arguments
        
    Returns:
        dict: Dictionary containing 'command', 'text', and 'flags'
        
    Example:
        >>> parse_args(['add', 'Buy milk', '--priority', 'high'])
        {'command': 'add', 'text': 'Buy milk', 'flags': ['--priority', 'high']}
    """
    if not args:
        return {'command': '', 'text': '', 'flags': []}
    
    result = {
        'command': args[0] if args else '',
        'text': '',
        'flags': []
    }
    
    # Find first flag (starts with - or --)
    flag_start = None
    for i, arg in enumerate(args[1:], 1):
        if arg.startswith('-'):
            flag_start = i
            break
    
    if flag_start is not None:
        # Text is between command and first flag
        result['text'] = ' '.join(args[1:flag_start]).strip()
        result['flags'] = args[flag_start:]
    else:
        # No flags, everything after command is text
        result['text'] = ' '.join(args[1:]).strip()
    
    return result


def get_flag(args: List[str], flag: str) -> bool:
    """
    Check if a flag exists in arguments.
    
    Args:
        args: List of arguments to search
        flag: Flag to look for (with or without dashes)
        
    Returns:
        bool: True if flag exists, False otherwise
        
    Example:
        >>> get_flag(['--priority', 'high', '--done'], 'priority')
        True
    """
    if not args or not flag:
        return False
    
    # Normalize flag format
    normalized_flag = flag if flag.startswith('-') else f'--{flag}'
    short_flag = f'-{flag.lstrip("-")[0]}' if len(flag.lstrip("-")) > 0 else ''
    
    return normalized_flag in args or short_flag in args


def get_flag_value(args: List[str], flag: str) -> Optional[str]:
    """
    Get the value that follows a flag.
    
    Args:
        args: List of arguments to search
        flag: Flag to look for
        
    Returns:
        str or None: Value following the flag, or None if not found
        
    Example:
        >>> get_flag_value(['--priority', 'high', '--done'], 'priority')
        'high'
    """
    if not args or not flag:
        return None
    
    # Normalize flag format
    normalized_flag = flag if flag.startswith('-') else f'--{flag}'
    short_flag = f'-{flag.lstrip("-")[0]}' if len(flag.lstrip("-")) > 0 else ''
    
    try:
        # Look for long flag
        if normalized_flag in args:
            idx = args.index(normalized_flag)
            if idx + 1 < len(args) and not args[idx + 1].startswith('-'):
                return args[idx + 1]
        
        # Look for short flag
        if short_flag in args:
            idx = args.index(short_flag)
            if idx + 1 < len(args) and not args[idx + 1].startswith('-'):
                return args[idx + 1]
    except (ValueError, IndexError):
        pass
    
    return None


def parse_ids(args: List[str]) -> List[int]:
    """
    Extract and validate numeric IDs from arguments.
    
    Args:
        args: List of arguments that may contain IDs
        
    Returns:
        list: List of valid integer IDs
        
    Raises:
        ValueError: If any ID is not a valid positive integer
        
    Example:
        >>> parse_ids(['1', '2', '5'])
        [1, 2, 5]
    """
    if not args:
        return []
    
    ids = []
    for arg in args:
        # Skip flags
        if arg.startswith('-'):
            continue
        
        try:
            id_val = int(arg)
            if id_val <= 0:
                raise ValueError(f"ID must be a positive integer, got: {arg}")
            ids.append(id_val)
        except ValueError as e:
            if "invalid literal" in str(e):
                raise ValueError(f"Invalid ID format: {arg}")
            raise
    
    return ids


# Display Formatting Functions

def format_table(headers: List[str], rows: List[List[str]]) -> str:
    """
    Create aligned ASCII table with proper spacing.
    
    Args:
        headers: List of column headers
        rows: List of rows, each row is a list of strings
        
    Returns:
        str: Formatted table as string
        
    Example:
        >>> headers = ['ID', 'Status', 'Todo']
        >>> rows = [['1', '[ ]', 'Buy milk'], ['2', '[✓]', 'Walk dog']]
        >>> print(format_table(headers, rows))
        ID | Status | Todo
        ---+--------+---------
        1  | [ ]    | Buy milk
        2  | [✓]    | Walk dog
    """
    if not headers:
        return ""
    
    # Handle empty rows
    if not rows:
        rows = []
    
    # Ensure all rows have the same number of columns as headers
    normalized_rows = []
    for row in rows:
        normalized_row = list(row) if row else []
        # Pad or truncate to match header count
        while len(normalized_row) < len(headers):
            normalized_row.append("")
        normalized_rows.append(normalized_row[:len(headers)])
    
    # Calculate column widths
    col_widths = []
    for i, header in enumerate(headers):
        max_width = len(header)
        for row in normalized_rows:
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
    sep_parts = []
    for width in col_widths:
        sep_parts.append("-" * width)
    lines.append("-+-".join(sep_parts))
    
    # Data rows
    for row in normalized_rows:
        row_parts = []
        for i, cell in enumerate(row):
            cell_str = str(cell) if cell is not None else ""
            row_parts.append(cell_str.ljust(col_widths[i]))
        lines.append(" | ".join(row_parts))
    
    return "\n".join(lines)


def format_todo(todo: Dict[str, Any]) -> str:
    """
    Format single todo item for display.
    
    Args:
        todo: Dictionary containing todo data with keys like 'id', 'text', 
              'completed', 'priority', 'created_at'
              
    Returns:
        str: Formatted todo string
        
    Example:
        >>> todo = {'id': 1, 'text': 'Buy milk', 'completed': False, 'priority': 'high'}
        >>> format_todo(todo)
        '1. [ ] Buy milk (high priority)'
    """
    if not todo or not isinstance(todo, dict):
        return ""
    
    # Extract fields with defaults
    todo_id = todo.get('id', '?')
    text = todo.get('text', 'No description')
    completed = todo.get('completed', False)
    priority = todo.get('priority', '')
    created_at = todo.get('created_at')
    
    # Status indicator
    status = '[✓]' if completed else '[ ]'
    
    # Apply colors
    if completed:
        status = _colorize(status, Colors.GREEN)
    elif priority == 'high':
        status = _colorize(status, Colors.RED)
        text = _colorize(text, Colors.RED)
    elif priority == 'medium':
        priority = _colorize(priority, Colors.YELLOW)
    
    # Build formatted string
    parts = [f"{todo_id}. {status} {text}"]
    
    # Add priority if present and not completed
    if priority and not completed:
        parts.append(f"({priority} priority)")
    
    # Add date if present
    if created_at:
        try:
            if isinstance(created_at, str):
                # Try to parse string date
                date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            elif isinstance(created_at, datetime):
                date_obj = created_at
            else:
                date_obj = None
            
            if date_obj:
                formatted_date = format_date(date_obj)
                parts.append(f"({formatted_date})")
        except (ValueError, AttributeError):
            pass  # Skip invalid dates
    
    return " ".join(parts)


def truncate(text: str, max_len: int) -> str:
    """
    Truncate text with ellipsis if exceeds length.
    
    Args:
        text: Text to truncate
        max_len: Maximum length including ellipsis
        
    Returns:
        str: Truncated text with ellipsis if needed
        
    Example:
        >>> truncate("This is a long sentence", 10)
        'This is...'
    """
    if not isinstance(text, str):
        text = str(text) if text is not None else ""
    
    if max_len <= 0:
        return ""
    
    if len(text) <= max_len:
        return text
    
    if max_len <= 3:
        return "." * max_len
    
    return text[:max_len - 3] + "..."


def format_date(date: datetime) -> str:
    """
    Convert datetime to relative time format.
    
    Args:
        date: Datetime object to format
        
    Returns:
        str: Formatted relative time string
        
    Example:
        >>> from datetime import datetime, timedelta
        >>> past_date = datetime.now() - timedelta(hours=2)
        >>> format_date(past_date)
        '2 hours ago'
    """
    if not isinstance(date, datetime):
        return "Invalid date"
    
    try:
        now = datetime.now()
        
        # Handle timezone-naive datetime objects
        if date.tzinfo is not None and now.tzinfo is None:
            # Convert timezone-aware date to naive for comparison
            date = date.replace(tzinfo=None)
        elif date.tzinfo is None and now.tzinfo is not None:
            # Convert timezone-aware now to naive for comparison
            now = now.replace(tzinfo=None)
        
        # Calculate time difference
        if date > now:
            # Future date - calculate time until
            diff = date - now
        else:
            # Past date - calculate time since
            diff = now - date
        
        total_seconds = diff.total_seconds()
        
        # Less than 1 hour
        if total_seconds < 3600:
            minutes = max(1, int(total_seconds // 60))
            return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        
        # Less than 24 hours
        elif total_seconds < 86400:
            hours = int(total_seconds // 3600)
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        
        # Less than 7 days
        elif total_seconds < 604800:
            days = int(total_seconds // 86400)
            return f"{days} day{'s' if days != 1 else ''} ago"
        
        # 7+ days - return formatted date
        else:
            return date.strftime("%Y-%m-%d")
    
    except (AttributeError, ValueError, OverflowError):
        return "Invalid date"


# Helper Functions

def validate_priority(priority: str) -> bool:
    """
    Validate priority value.
    
    Args:
        priority: Priority string to validate
        
    Returns:
        bool: True if valid priority, False otherwise
    """
    valid_priorities = ['low', 'medium', 'high']
    return priority.lower() in valid_priorities


def clean_text(text: str) -> str:
    """
    Clean and normalize text input.
    
    Args:
        text: Text to clean
        
    Returns:
        str: Cleaned text
    """
    if not isinstance(text, str):
        text = str(text) if text is not None else ""
    
    # Strip whitespace and normalize spaces
    return ' '.join(text.strip().split())