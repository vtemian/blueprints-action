"""
Utility module for command-line todo application.

This module provides functions for argument parsing, display formatting,
and other common utilities needed for a CLI todo manager.
"""

import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple, Union


# ANSI color codes for terminal output
class Colors:
    """ANSI color codes for terminal formatting."""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    RESET = '\033[0m'
    
    @classmethod
    def is_supported(cls) -> bool:
        """Check if ANSI colors are supported in current terminal."""
        import os
        return os.getenv('TERM') not in (None, 'dumb') and hasattr(os.sys.stdout, 'isatty') and os.sys.stdout.isatty()


def parse_args(args: List[str]) -> Dict[str, Any]:
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args: List of command line arguments
        
    Returns:
        Dictionary containing:
        - 'command': First non-flag argument or None
        - 'text': Remaining non-flag arguments joined as string
        - 'flags': Dictionary of flag names to values/True
        
    Example:
        >>> parse_args(['add', 'Buy milk', '--priority', 'high', '-d'])
        {
            'command': 'add',
            'text': 'Buy milk',
            'flags': {'priority': 'high', 'd': True}
        }
    """
    if not args:
        return {'command': None, 'text': '', 'flags': {}}
    
    result = {'command': None, 'text': '', 'flags': {}}
    text_parts = []
    i = 0
    
    while i < len(args):
        arg = args[i]
        
        # Handle flags
        if arg.startswith('--'):
            flag_name = arg[2:]
            if i + 1 < len(args) and not args[i + 1].startswith('-'):
                result['flags'][flag_name] = args[i + 1]
                i += 2
            else:
                result['flags'][flag_name] = True
                i += 1
        elif arg.startswith('-') and len(arg) > 1:
            flag_name = arg[1:]
            if i + 1 < len(args) and not args[i + 1].startswith('-'):
                result['flags'][flag_name] = args[i + 1]
                i += 2
            else:
                result['flags'][flag_name] = True
                i += 1
        else:
            # First non-flag argument is command
            if result['command'] is None:
                result['command'] = arg
            else:
                text_parts.append(arg)
            i += 1
    
    result['text'] = ' '.join(text_parts)
    return result


def get_flag(args: List[str], flag: str) -> bool:
    """
    Check if a specific flag exists in arguments.
    
    Args:
        args: List of command line arguments
        flag: Flag name to search for (without dashes)
        
    Returns:
        True if flag exists, False otherwise
        
    Example:
        >>> get_flag(['add', 'task', '--done', '-v'], 'done')
        True
        >>> get_flag(['add', 'task'], 'done')
        False
    """
    if not args or not flag:
        return False
    
    flag_variants = [f'--{flag}', f'-{flag}']
    return any(arg in flag_variants for arg in args)


def get_flag_value(args: List[str], flag: str) -> Optional[str]:
    """
    Get the value that follows a flag.
    
    Args:
        args: List of command line arguments
        flag: Flag name to search for (without dashes)
        
    Returns:
        Value following the flag, or None if flag not found or has no value
        
    Example:
        >>> get_flag_value(['add', 'task', '--priority', 'high'], 'priority')
        'high'
        >>> get_flag_value(['add', 'task', '--done'], 'done')
        None
    """
    if not args or not flag:
        return None
    
    flag_variants = [f'--{flag}', f'-{flag}']
    
    for i, arg in enumerate(args):
        if arg in flag_variants:
            if i + 1 < len(args) and not args[i + 1].startswith('-'):
                return args[i + 1]
            break
    
    return None


def parse_ids(args: List[str]) -> List[int]:
    """
    Extract numeric IDs from arguments.
    
    Args:
        args: List of command line arguments
        
    Returns:
        List of integer IDs found in arguments
        
    Example:
        >>> parse_ids(['complete', '1', '3', '5'])
        [1, 3, 5]
        >>> parse_ids(['add', 'task', 'with', '123', 'in', 'text'])
        [123]
    """
    if not args:
        return []
    
    ids = []
    for arg in args:
        if arg.isdigit():
            try:
                ids.append(int(arg))
            except ValueError:
                continue
    
    return ids


def format_table(headers: List[str], rows: List[List[str]]) -> str:
    """
    Create aligned ASCII table with proper spacing.
    
    Args:
        headers: List of column headers
        rows: List of rows, each row is a list of cell values
        
    Returns:
        Formatted table as string
        
    Example:
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
                clean_text = re.sub(r'\033\[[0-9;]*m', '', str(row[col_idx]))
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
            # Calculate padding considering ANSI codes
            clean_cell = re.sub(r'\033\[[0-9;]*m', '', cell)
            padding = width - len(clean_cell)
            padded_cell = cell + ' ' * max(0, padding)
            row_parts.append(padded_cell)
        result.append(' | '.join(row_parts))
    
    return '\n'.join(result)


def format_todo(todo: Dict[str, Any]) -> str:
    """
    Format a single todo item for display.
    
    Args:
        todo: Dictionary containing todo data with keys:
              - id: Todo ID
              - text: Todo text
              - completed: Boolean completion status
              - priority: Priority level (optional)
              - created_at: Creation datetime (optional)
              
    Returns:
        Formatted todo string
        
    Example:
        >>> todo = {'id': 1, 'text': 'Buy milk', 'completed': False, 'priority': 'high'}
        >>> format_todo(todo)
        '1. [ ] Buy milk (high priority)'
    """
    if not todo or 'id' not in todo:
        return ""
    
    todo_id = todo.get('id', 0)
    text = todo.get('text', '')
    completed = todo.get('completed', False)
    priority = todo.get('priority', '')
    created_at = todo.get('created_at')
    
    # Status indicator
    status = '[✓]' if completed else '[ ]'
    
    # Build the formatted string
    parts = [f"{todo_id}. {status} {text}"]
    
    # Add priority if present
    if priority:
        priority_text = f"({priority} priority)"
        if Colors.is_supported():
            if priority.lower() == 'high':
                priority_text = f"{Colors.RED}{priority_text}{Colors.RESET}"
            elif priority.lower() == 'medium':
                priority_text = f"{Colors.YELLOW}{priority_text}{Colors.RESET}"
        parts.append(priority_text)
    
    # Add creation date if present
    if created_at:
        date_text = format_date(created_at)
        parts.append(f"({date_text})")
    
    result = ' '.join(parts)
    
    # Apply color for completed items
    if completed and Colors.is_supported():
        result = f"{Colors.GREEN}{result}{Colors.RESET}"
    
    return result


def truncate(text: str, max_len: int) -> str:
    """
    Shorten text with ellipsis if too long.
    
    Args:
        text: Text to potentially truncate
        max_len: Maximum allowed length
        
    Returns:
        Original text if short enough, otherwise truncated with '...'
        
    Example:
        >>> truncate("This is a very long text", 10)
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
        return text[:max_len]
    
    return text[:max_len - 3] + '...'


def format_date(date: Union[datetime, str]) -> str:
    """
    Convert datetime to relative time format.
    
    Args:
        date: Datetime object or ISO format string
        
    Returns:
        Formatted relative time string
        
    Rules:
        - Less than 1 hour: "X minutes ago"
        - Less than 24 hours: "X hours ago"
        - Less than 7 days: "X days ago"
        - 7+ days: "YYYY-MM-DD"
        
    Example:
        >>> from datetime import datetime, timedelta
        >>> now = datetime.now()
        >>> format_date(now - timedelta(minutes=30))
        '30 minutes ago'
    """
    if not date:
        return ""
    
    # Convert string to datetime if needed
    if isinstance(date, str):
        try:
            # Try parsing ISO format
            if 'T' in date:
                date = datetime.fromisoformat(date.replace('Z', '+00:00'))
            else:
                date = datetime.fromisoformat(date)
        except ValueError:
            return str(date)
    
    if not isinstance(date, datetime):
        return str(date)
    
    # Get current time - handle timezone awareness
    now = datetime.now()
    if date.tzinfo is not None:
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
    elif now.tzinfo is not None:
        now = now.replace(tzinfo=None)
    
    try:
        diff = now - date
        total_seconds = diff.total_seconds()
        
        if total_seconds < 0:
            # Future date
            return date.strftime('%Y-%m-%d')
        
        minutes = int(total_seconds // 60)
        hours = int(total_seconds // 3600)
        days = diff.days
        
        if minutes < 60:
            if minutes <= 1:
                return "1 minute ago"
            return f"{minutes} minutes ago"
        elif hours < 24:
            if hours == 1:
                return "1 hour ago"
            return f"{hours} hours ago"
        elif days < 7:
            if days == 1:
                return "1 day ago"
            return f"{days} days ago"
        else:
            return date.strftime('%Y-%m-%d')
            
    except (TypeError, AttributeError, OverflowError):
        # Fallback for any datetime calculation errors
        return date.strftime('%Y-%m-%d') if hasattr(date, 'strftime') else str(date)


# Example usage and testing
if __name__ == "__main__":
    # Test argument parsing
    test_args = ['add', 'Buy groceries', '--priority', 'high', '-d']
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
    print("\nFormatted table:")
    print(table)
    
    # Test date formatting
    from datetime import timedelta
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