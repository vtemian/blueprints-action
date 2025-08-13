# main

CLI Todo application with no external dependencies.

Dependencies: none (standard library only)

Requirements:
- Command-line argument parsing without external libraries
- Support commands: add, list, done, remove, update, search, stats, clear, help
- Store todos in ~/.todos.json file
- Handle all errors gracefully

Entry point:
- Parse command and arguments from sys.argv (Python) or process.argv (Node.js)
- Route to appropriate command handler
- Display results or errors
- Exit with appropriate code (0 for success, 1 for error)

Command routing:
- Use simple if/elif or switch statement
- Show help if no command or invalid command
- Pass remaining arguments to command handler