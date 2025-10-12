"""
Utility functions for parsing and display operations.

This module provides utility functions for command-line argument parsing,
data formatting, and display operations with support for tables, todos,
and date formatting.
"""

from datetime import datetime


def parse_args(args):
    """
    Extract command, text, and flags from argument list.
    
    Args:
        args (list): List of command-line arguments
        
    Returns:
        dict: Dictionary containing 'command', 'text', and 'flags'
        
    Example:
        >>> parse_args(['add', 'Buy milk', '--priority', 'high'])
        {'command': 'add', 'text': 'Buy milk', 'flags': ['--priority', 'high']}
    """
    if not args or not isinstance(args, list):
        return {'command': None, 'text': '', 'flags': []}
    
    command = args[0] if args else None
    text_parts = []
    flags = []
    
    i = 1
    while i < len(args):
        arg = args[i]
        if arg.startswith('-'):
            # This is a flag, collect it and potentially its value
            flags.append(arg)
            # Check if next argument is a value (not a flag)
            if i + 1 < len(args) and not args[i + 1].startswith('-'):
                flags.append(args[i + 1])
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


def get_flag(args, flag):
    """
    Return boolean if flag exists in args (handle both -flag and --flag).
    
    Args:
        args (list): List of arguments to search
        flag (str): Flag name (without dashes)
        
    Returns:
        bool: True if flag is found, False otherwise
        
    Example:
        >>> get_flag(['--verbose', '-h'], 'verbose')
        True
        >>> get_flag(['--verbose', '-h'], 'help')
        True
    """
    if not args or not isinstance(args, list) or not flag:
        return False
    
    flag_variants = [f'-{flag}', f'--{flag}']
    return any(arg in flag_variants for arg in args)


def get_flag_value(args, flag):
    """
    Return value immediately following flag, None if not found.
    
    Args:
        args (list): List of arguments to search
        flag (str): Flag name (without dashes)
        
    Returns:
        str or None: Value following the flag, or None if not found
        
    Example:
        >>> get_flag_value(['--priority', 'high', '--verbose'], 'priority')
        'high'
        >>> get_flag_value(['--priority', 'high'], 'missing')
        None
    """
    if not args or not isinstance(args, list) or not flag:
        return None
    
    flag_variants = [f'-{flag}', f'--{flag}']
    
    for i, arg in enumerate(args):
        if arg in flag_variants and i + 1 < len(args):
            next_arg = args[i + 1]
            # Return the next argument if it's not a flag
            if not next_arg.startswith('-'):
                return next_arg
    
    return None


def parse_ids(args):
    """
    Extract and return list of numeric IDs from arguments.
    
    Args:
        args (list): List of arguments to parse
        
    Returns:
        list: List of integer IDs found in arguments
        
    Example:
        >>> parse_ids(['delete', '1', '2', '5', 'text'])
        [1, 2, 5]
    """
    if not args or not isinstance(args, list):
        return []
    
    ids = []
    for arg in args:
        try:
            # Try to convert to integer
            id_val = int(arg)
            if id_val > 0:  # Only positive IDs
                ids.append(id_val)
        except (ValueError, TypeError):
            # Not a valid integer, skip
            continue
    
    return ids


def format_table(headers, rows):
    """
    Create ASCII table with proper alignment and borders.
    
    Args:
        headers (list): List of column headers
        rows (list): List of row data (each row is a list)
        
    Returns:
        str: Formatted ASCII table
        
    Example:
        >>> headers = ['ID', 'Task', 'Status']
        >>> rows = [['1', 'Buy milk', 'pending'], ['2', 'Walk dog', 'done']]
        >>> print(format_table(headers, rows))
        +----+----------+---------+
        | ID | Task     | Status  |
        +----+----------+---------+
        | 1  | Buy milk | pending |
        | 2  | Walk dog | done    |
        +----+----------+---------+
    """
    if not headers or not isinstance(headers, list):
        return ""
    
    if not rows:
        rows = []
    
    # Convert all data to strings and handle None values
    str_headers = [str(h) if h is not None else '' for h in headers]
    str_rows = []
    
    for row in rows:
        if isinstance(row, list):
            str_row = [str(cell) if cell is not None else '' for cell in row]
            # Pad row to match header length
            while len(str_row) < len(str_headers):
                str_row.append('')
            str_rows.append(str_row[:len(str_headers)])  # Truncate if too long
    
    # Calculate column widths
    col_widths = [len(header) for header in str_headers]
    
    for row in str_rows:
        for i, cell in enumerate(row):
            if i < len(col_widths):
                col_widths[i] = max(col_widths[i], len(cell))
    
    # Create separator line
    separator = '+' + '+'.join('-' * (width + 2) for width in col_widths) + '+'
    
    # Build table
    table_lines = [separator]
    
    # Header row
    header_row = '|'
    for i, header in enumerate(str_headers):
        header_row += f' {header.ljust(col_widths[i])} |'
    table_lines.append(header_row)
    table_lines.append(separator)
    
    # Data rows
    for row in str_rows:
        data_row = '|'
        for i, cell in enumerate(row):
            data_row += f' {cell.ljust(col_widths[i])} |'
        table_lines.append(data_row)
    
    table_lines.append(separator)
    
    return '\n'.join(table_lines)


def format_todo(todo):
    """
    Format single todo item with color coding.
    
    Args:
        todo (dict): Todo item with keys: id, status, priority, text
        
    Returns:
        str: Formatted todo string with color coding
        
    Example:
        >>> todo = {'id': 1, 'status': 'done', 'priority': 'high', 'text': 'Buy milk'}
        >>> format_todo(todo)
        '[1] ✓ Buy milk (high)'
    """
    if not todo or not isinstance(todo, dict):
        return ""
    
    # Extract fields with defaults
    todo_id = todo.get('id', '')
    status = todo.get('status', 'pending')
    priority = todo.get('priority', '')
    text = todo.get('text', '')
    
    # Status symbol
    status_symbol = '✓' if status == 'done' else '○'
    
    # Build formatted string
    formatted = f"[{todo_id}] {status_symbol} {text}"
    
    if priority:
        formatted += f" ({priority})"
    
    # Apply color coding (simple ANSI codes with fallback)
    try:
        if status == 'done':
            # Green for completed
            formatted = f"\033[32m{formatted}\033[0m"
        elif priority == 'high':
            # Red for high priority
            formatted = f"\033[31m{formatted}\033[0m"
    except Exception:
        # Fallback to no color if there's any issue
        pass
    
    return formatted


def truncate(text, max_len):
    """
    Truncate text with ellipsis if longer than max_len.
    
    Args:
        text (str): Text to truncate
        max_len (int): Maximum length allowed
        
    Returns:
        str: Truncated text with ellipsis if needed
        
    Example:
        >>> truncate("This is a long text", 10)
        'This is...'
    """
    if not isinstance(text, str):
        text = str(text) if text is not None else ''
    
    if not isinstance(max_len, int) or max_len < 0:
        return text
    
    if max_len == 0:
        return ''
    
    if len(text) <= max_len:
        return text
    
    if max_len <= 3:
        return text[:max_len]
    
    return text[:max_len - 3] + '...'


def format_date(date):
    """
    Convert datetime to relative format or YYYY-MM-DD.
    
    Rules:
    - Less than 60 minutes: "X minutes ago"
    - Less than 24 hours: "X hours ago"  
    - Less than 7 days: "X days ago"
    - Older: "YYYY-MM-DD"
    
    Args:
        date (datetime): Datetime object to format
        
    Returns:
        str: Formatted date string
        
    Example:
        >>> from datetime import datetime, timedelta
        >>> now = datetime.now()
        >>> format_date(now - timedelta(minutes=30))
        '30 minutes ago'
    """
    if not isinstance(date, datetime):
        return str(date) if date is not None else ''
    
    try:
        now = datetime.now()
        
        # Handle timezone-naive datetime objects
        if date.tzinfo is not None and now.tzinfo is None:
            # If input has timezone but now doesn't, make now timezone-aware
            # This is a simple approach - in production you'd want proper timezone handling
            pass
        elif date.tzinfo is None and now.tzinfo is not None:
            # If now has timezone but input doesn't, use naive now
            now = now.replace(tzinfo=None)
        
        # Calculate time difference
        if date > now:
            # Future date, just return the date
            return date.strftime('%Y-%m-%d')
        
        diff = now - date
        total_seconds = diff.total_seconds()
        
        if total_seconds < 60:
            # Less than a minute
            return "just now"
        elif total_seconds < 3600:  # Less than 60 minutes
            minutes = int(total_seconds // 60)
            return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        elif total_seconds < 86400:  # Less than 24 hours
            hours = int(total_seconds // 3600)
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        elif total_seconds < 604800:  # Less than 7 days
            days = int(total_seconds // 86400)
            return f"{days} day{'s' if days != 1 else ''} ago"
        else:
            # Older than 7 days
            return date.strftime('%Y-%m-%d')
            
    except Exception:
        # Fallback for any datetime calculation errors
        try:
            return date.strftime('%Y-%m-%d')
        except Exception:
            return str(date)