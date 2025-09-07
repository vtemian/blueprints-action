/**
 * CLI Command Handlers Module
 * Implements todo application command-line interface handlers
 * @module commands
 */

import * as app from '@app';
import * as utils from '@utils';
import * as datetime from 'datetime';

/**
 * Parse command line arguments to extract flags and values
 * @param {string[]} args - Array of command line arguments
 * @returns {Object} Parsed arguments object with flags and remaining args
 */
function parseArgs(args) {
    const flags = {};
    const remaining = [];
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg.startsWith('--')) {
            const flagName = arg.slice(2);
            
            // Check if next argument is a value (doesn't start with --)
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                flags[flagName] = args[i + 1];
                i++; // Skip next argument as it's the value
            } else {
                flags[flagName] = true;
            }
        } else {
            remaining.push(arg);
        }
    }
    
    return { flags, remaining };
}

/**
 * Validate that a todo ID exists in the todos list
 * @param {number} id - Todo ID to validate
 * @param {Array} todos - Array of todo objects
 * @returns {Object|null} Todo object if found, null otherwise
 */
function validateTodoId(id, todos) {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
        return null;
    }
    
    return todos.find(todo => todo.id === numericId) || null;
}

/**
 * Add a new todo item
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
export async function add(args) {
    try {
        const { flags, remaining } = parseArgs(args);
        
        // Join remaining arguments as task description
        const text = remaining.join(' ').trim();
        
        if (!text) {
            console.error('Error: Task description is required');
            console.log('Usage: add <description> [--priority <level>]');
            console.log('Example: add "Buy groceries" --priority high');
            return;
        }
        
        // Extract priority from flags, default to 'normal'
        const priority = flags.priority || 'normal';
        
        // Validate priority level
        const validPriorities = ['low', 'normal', 'high', 'urgent'];
        if (!validPriorities.includes(priority.toLowerCase())) {
            console.error(`Error: Invalid priority "${priority}". Valid options: ${validPriorities.join(', ')}`);
            return;
        }
        
        // Add todo using app module
        const todo = await app.add_todo(text, priority.toLowerCase());
        
        if (!todo) {
            console.error('Error: Failed to create todo item');
            return;
        }
        
        console.log(`Added: #${todo.id} - ${todo.description}`);
        
    } catch (error) {
        console.error('Error adding todo:', error.message);
        process.exit(1);
    }
}

/**
 * List todo items with optional filtering
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
export async function list(args) {
    try {
        const { flags } = parseArgs(args);
        
        // Load todos from app
        const todos = await app.load_todos();
        
        if (!Array.isArray(todos)) {
            console.error('Error: Failed to load todos');
            return;
        }
        
        let filteredTodos = todos;
        
        // Apply filters based on flags
        if (flags.done) {
            filteredTodos = todos.filter(todo => todo.done === true);
        } else if (!flags.all) {
            // Default: show incomplete todos only
            filteredTodos = todos.filter(todo => todo.done !== true);
        }
        
        if (filteredTodos.length === 0) {
            if (flags.done) {
                console.log('No completed todos found.');
            } else if (flags.all) {
                console.log('No todos found.');
            } else {
                console.log('No pending todos found.');
            }
            return;
        }
        
        // Prepare data for table formatting
        const tableData = filteredTodos.map(todo => ({
            ID: todo.id.toString(),
            Status: todo.done ? '[✓]' : '[ ]',
            Description: todo.description || 'No description',
            Priority: (todo.priority || 'normal').toUpperCase()
        }));
        
        // Format and display table
        const formattedTable = utils.format_table(tableData, {
            headers: ['ID', 'Status', 'Description', 'Priority'],
            alignment: ['right', 'center', 'left', 'center']
        });
        
        console.log(formattedTable);
        console.log(`\nTotal: ${filteredTodos.length} todo(s)`);
        
    } catch (error) {
        console.error('Error listing todos:', error.message);
        process.exit(1);
    }
}

/**
 * Mark one or more todos as completed
 * @param {string[]} args - Command line arguments containing todo IDs
 * @returns {Promise<void>}
 */
export async function done(args) {
    try {
        const { remaining } = parseArgs(args);
        
        if (remaining.length === 0) {
            console.error('Error: Todo ID(s) required');
            console.log('Usage: done <id1> [id2] [id3] ...');
            console.log('Example: done 1 3 5');
            return;
        }
        
        // Load current todos
        const todos = await app.load_todos();
        
        if (!Array.isArray(todos)) {
            console.error('Error: Failed to load todos');
            return;
        }
        
        const completedTodos = [];
        const errors = [];
        
        // Process each ID
        for (const idStr of remaining) {
            const todo = validateTodoId(idStr, todos);
            
            if (!todo) {
                errors.push(`Invalid todo ID: ${idStr}`);
                continue;
            }
            
            if (todo.done) {
                errors.push(`Todo #${todo.id} is already completed`);
                continue;
            }
            
            // Mark as completed
            todo.done = true;
            todo.completed_at = datetime.now();
            
            completedTodos.push(todo);
        }
        
        // Save changes if any todos were completed
        if (completedTodos.length > 0) {
            await app.save_todos(todos);
            
            // Display success messages
            completedTodos.forEach(todo => {
                console.log(`Completed: #${todo.id} - ${todo.description}`);
            });
        }
        
        // Display any errors
        if (errors.length > 0) {
            console.error('\nErrors:');
            errors.forEach(error => console.error(`  ${error}`));
        }
        
        if (completedTodos.length === 0 && errors.length > 0) {
            process.exit(1);
        }
        
    } catch (error) {
        console.error('Error marking todos as done:', error.message);
        process.exit(1);
    }
}

/**
 * Remove todo items by ID or remove all completed todos
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
export async function remove(args) {
    try {
        const { flags, remaining } = parseArgs(args);
        
        // Load current todos
        const todos = await app.load_todos();
        
        if (!Array.isArray(todos)) {
            console.error('Error: Failed to load todos');
            return;
        }
        
        if (flags.done) {
            // Remove all completed todos
            const completedTodos = todos.filter(todo => todo.done === true);
            
            if (completedTodos.length === 0) {
                console.log('No completed todos to remove.');
                return;
            }
            
            // Remove completed todos
            for (const todo of completedTodos) {
                await app.delete_todo(todo.id);
                console.log(`Removed: #${todo.id} - ${todo.description}`);
            }
            
            console.log(`\nRemoved ${completedTodos.length} completed todo(s).`);
            
        } else {
            // Remove specific todo by ID
            if (remaining.length === 0) {
                console.error('Error: Todo ID required or use --done flag');
                console.log('Usage: remove <id> OR remove --done');
                console.log('Examples:');
                console.log('  remove 1        # Remove todo with ID 1');
                console.log('  remove --done   # Remove all completed todos');
                return;
            }
            
            if (remaining.length > 1) {
                console.error('Error: Only one todo ID allowed (or use --done for batch removal)');
                return;
            }
            
            const idStr = remaining[0];
            const todo = validateTodoId(idStr, todos);
            
            if (!todo) {
                console.error(`Error: Todo with ID "${idStr}" not found`);
                return;
            }
            
            // Delete the todo
            const success = await app.delete_todo(todo.id);
            
            if (!success) {
                console.error(`Error: Failed to remove todo #${todo.id}`);
                return;
            }
            
            console.log(`Removed: #${todo.id} - ${todo.description}`);
        }
        
    } catch (error) {
        console.error('Error removing todo:', error.message);
        process.exit(1);
    }
}

/**
 * Display help information for all commands
 * @param {string[]} args - Command line arguments (unused)
 * @returns {void}
 */
export function help(args) {
    const helpText = `
Todo CLI Application - Help

USAGE:
  todo <command> [options] [arguments]

COMMANDS:

  add <description> [--priority <level>]
    Add a new todo item with optional priority
    Priority levels: low, normal, high, urgent (default: normal)
    
    Examples:
      todo add "Buy groceries"
      todo add "Fix bug in login" --priority high
      todo add "Review documentation" --priority low

  list [--all] [--done]
    List todo items with optional filtering
    
    Options:
      --all     Show all todos (completed and pending)
      --done    Show only completed todos
      (default) Show only pending todos
    
    Examples:
      todo list           # Show pending todos
      todo list --all     # Show all todos
      todo list --done    # Show completed todos

  done <id1> [id2] [id3] ...
    Mark one or more todos as completed
    
    Examples:
      todo done 1         # Mark todo #1 as completed
      todo done 1 3 5     # Mark todos #1, #3, and #5 as completed

  remove <id> | remove --done
    Remove a specific todo by ID or remove all completed todos
    
    Examples:
      todo remove 1       # Remove todo #1
      todo remove --done  # Remove all completed todos

  help
    Display this help information

EXAMPLES:
  todo add "Learn JavaScript" --priority high
  todo list
  todo done 1
  todo list --all
  todo remove --done
  todo help

For more information, visit: https://github.com/your-repo/todo-cli
`;

    console.log(helpText);
}

// Validate dependencies at module load
try {
    if (typeof app.add_todo !== 'function' || 
        typeof app.load_todos !== 'function' || 
        typeof app.save_todos !== 'function' || 
        typeof app.delete_todo !== 'function') {
        console.warn('Warning: Some app module functions may not be available');
    }
    
    if (typeof utils.format_table !== 'function') {
        console.warn('Warning: utils.format_table function may not be available');
    }
    
    if (typeof datetime.now !== 'function') {
        console.warn('Warning: datetime.now function may not be available');
    }
} catch (error) {
    console.warn('Warning: Could not validate all dependencies:', error.message);
}