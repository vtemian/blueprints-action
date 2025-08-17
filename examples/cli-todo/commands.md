# commands

Command implementations for CLI operations.

Dependencies: @app, @utils, datetime

Requirements:

## add(args)
- Parse text from remaining arguments
- Extract --priority flag if present
- Create todo via app.add_todo()
- Display: "Added: #1 - Task description"

## list(args)
- Parse --all or --done flags
- Load todos via app.load_todos()
- Filter based on flags
- Format as table using utils.format_table()
- Display with status indicators [✓] or [ ]

## done(args)
- Parse todo ID(s) from arguments
- Mark each as done (set done=true, add timestamp)
- Save changes
- Display: "Completed: #1 - Task description"

## remove(args)
- Parse todo ID from arguments
- Support --done flag to remove all completed
- Delete via app.delete_todo()
- Display: "Removed: #1 - Task description"

## help(args)
- Display usage information
- List all commands with descriptions
- Show examples

Common patterns:
- All commands load → modify → save
- Show clear success/error messages
- Validate IDs exist before operations