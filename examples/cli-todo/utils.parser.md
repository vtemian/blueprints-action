# utils.parser

Command-line argument parsing without external libraries.

Dependencies: none (standard library only)

Requirements:
- Parse arguments manually from argv
- Support both short (-p) and long (--priority) options
- Handle quoted strings properly
- Extract flags and values

Functions:
- parse_args(args): Parse command line arguments
- get_flag_value(args, flag): Get value for a flag
- has_flag(args, flag): Check if flag exists
- extract_text(args): Get non-flag arguments as text
- parse_ids(args): Extract numeric IDs

Parsing rules:
- Flags start with - or --
- Flag values are the next argument
- Quoted strings are preserved
- Multiple values separated by commas

Example:
```python
args = ['add', 'Buy groceries', '--priority', 'high', '--tags', 'shopping,urgent']
parsed = parse_args(args)
# Returns: {
#   'command': 'add',
#   'text': 'Buy groceries',
#   'priority': 'high',
#   'tags': ['shopping', 'urgent']
# }
```