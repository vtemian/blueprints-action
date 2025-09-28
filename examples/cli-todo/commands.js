/**
 * CLI Commands Module
 * Handles all command-line interface operations for the todo application
 */

import app from './app.js';
import utils from './utils.js';

/**
 * Parses command line arguments into flags and positional arguments
 * @param {string[]} args - Raw command arguments
 * @returns {Object} Parsed arguments with flags and remaining args
 */
function parseArgs(args) {
    const flags = {};
    const remaining = [];
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg.startsWith('--')) {
            const flagName = arg.substring(2);
            
            // Check if next argument is a value (doesn't start with --)
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                flags[flagName] = args[i + 1];
                i++; // Skip next argument as it's the flag value
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
 * Validates that a todo ID exists in the todo list
 * @param {number} id - Todo ID to validate
 * @param {Array} todos - Array of todos
 * @throws {Error} If todo ID doesn't exist
 */
function validateTodoId(id, todos) {
    const todo = todos.find(t => t.id === id);
    if (!todo) {
        throw new Error(`Todo with ID ${id} not found`);
    }
    return todo;
}

/**
 * Gets current timestamp in ISO format
 * @returns {string} Current timestamp
 */
function getCurrentTimestamp() {
    return new Date().toISOString();
}

/**
 * Add a new todo item
 * @param {string[]} args - Command arguments
 * @returns {Promise<string>} Success message
 */
export async function add(args) {
    try {
        const { flags, remaining } = parseArgs(args);
        
        // Join remaining arguments as task text
        const text = remaining.join(' ').trim();
        
        if (!text) {
            throw new Error('Task description cannot be empty');
        }
        
        // Parse priority flag
        let priority = 'medium'; // default
        if (flags.priority) {
            const validPriorities = ['low', 'medium', 'high'];
            if (!validPriorities.includes(flags.priority.toLowerCase())) {
                throw new Error(`Invalid priority: ${flags.priority}. Valid options: ${validPriorities.join(', ')}`);
            }
            priority = flags.priority.toLowerCase();
        }
        
        const todoData = {
            text,
            priority,
            done: false,
            created_at: getCurrentTimestamp()
        };
        
        const newTodo = await app.addTodo(todoData);
        return `Added: #${newTodo.id} - ${newTodo.text}`;
        
    } catch (error) {
        throw new Error(`Failed to add todo: ${error.message}`);
    }
}

/**
 * List todos with optional filtering
 * @param {string[]} args - Command arguments
 * @returns {Promise<string>} Formatted todo list
 */
export async function list(args) {
    try {
        const { flags } = parseArgs(args);
        
        // Validate mutually exclusive flags
        if (flags.all && flags.done) {
            throw new Error('Cannot use --all and --done flags together');
        }
        
        const todos = await app.loadTodos();
        
        if (!todos || todos.length === 0) {
            return 'No todos found.';
        }
        
        // Filter todos based on flags
        let filteredTodos;
        if (flags.all) {
            filteredTodos = todos;
        } else if (flags.done) {
            filteredTodos = todos.filter(todo => todo.done);
        } else {
            // Default: show incomplete only
            filteredTodos = todos.filter(todo => !todo.done);
        }
        
        if (filteredTodos.length === 0) {
            const filterType = flags.done ? 'completed' : 'pending';
            return `No ${filterType} todos found.`;
        }
        
        // Format todos for display
        const formattedTodos = filteredTodos.map(todo => ({
            ID: todo.id,
            Status: todo.done ? '[✓]' : '[ ]',
            Task: todo.text,
            Priority: todo.priority.toUpperCase(),
            Created: new Date(todo.created_at).toLocaleDateString()
        }));
        
        return utils.formatTable(formattedTodos);
        
    } catch (error) {
        throw new Error(`Failed to list todos: ${error.message}`);
    }
}

/**
 * Mark one or more todos as completed
 * @param {string[]} args - Command arguments (todo IDs)
 * @returns {Promise<string>} Success message
 */
export async function done(args) {
    try {
        const { remaining } = parseArgs(args);
        
        if (remaining.length === 0) {
            throw new Error('Please provide at least one todo ID');
        }
        
        // Parse and validate todo IDs
        const todoIds = [];
        for (const arg of remaining) {
            const id = parseInt(arg, 10);
            if (isNaN(id) || id <= 0) {
                throw new Error(`Invalid todo ID: ${arg}`);
            }
            todoIds.push(id);
        }
        
        // Load todos and validate all IDs exist
        const todos = await app.loadTodos();
        const todosToComplete = [];
        
        for (const id of todoIds) {
            const todo = validateTodoId(id, todos);
            if (todo.done) {
                throw new Error(`Todo #${id} is already completed`);
            }
            todosToComplete.push(todo);
        }
        
        // Mark todos as completed
        const completedTodos = [];
        const timestamp = getCurrentTimestamp();
        
        for (const todo of todosToComplete) {
            todo.done = true;
            todo.completed_at = timestamp;
            await app.updateTodo(todo.id, todo);
            completedTodos.push(`Completed: #${todo.id} - ${todo.text}`);
        }
        
        return completedTodos.join('\n');
        
    } catch (error) {
        throw new Error(`Failed to mark todos as done: ${error.message}`);
    }
}

/**
 * Remove one or more todos
 * @param {string[]} args - Command arguments
 * @returns {Promise<string>} Success message
 */
export async function remove(args) {
    try {
        const { flags, remaining } = parseArgs(args);
        
        const todos = await app.loadTodos();
        const removedTodos = [];
        
        if (flags.done) {
            // Remove all completed todos
            const completedTodos = todos.filter(todo => todo.done);
            
            if (completedTodos.length === 0) {
                return 'No completed todos to remove.';
            }
            
            for (const todo of completedTodos) {
                await app.deleteTodo(todo.id);
                removedTodos.push(`Removed: #${todo.id} - ${todo.text}`);
            }
            
        } else {
            // Remove specific todo by ID
            if (remaining.length === 0) {
                throw new Error('Please provide a todo ID or use --done flag');
            }
            
            if (remaining.length > 1) {
                throw new Error('Please provide only one todo ID for removal');
            }
            
            const id = parseInt(remaining[0], 10);
            if (isNaN(id) || id <= 0) {
                throw new Error(`Invalid todo ID: ${remaining[0]}`);
            }
            
            const todo = validateTodoId(id, todos);
            await app.deleteTodo(id);
            removedTodos.push(`Removed: #${todo.id} - ${todo.text}`);
        }
        
        return removedTodos.join('\n');
        
    } catch (error) {
        throw new Error(`Failed to remove todos: ${error.message}`);
    }
}

/**
 * Display help information
 * @param {string[]} args - Command arguments (unused)
 * @returns {Promise<string>} Help text
 */
export async function help(args) {
    const helpText = `
Todo CLI - Command Reference

USAGE:
  todo <command> [options] [arguments]

COMMANDS:

  add <text> [--priority <level>]
    Add a new todo item
    
    Options:
      --priority    Set priority level (low, medium, high)
                   Default: medium
    
    Examples:
      todo add "Buy groceries"
      todo add "Fix bug in login" --priority high
      todo add "Review documentation" --priority low

  list [--all | --done]
    Display todo items
    
    Options:
      --all        Show all todos (completed and pending)
      --done       Show only completed todos
      (default)    Show only pending todos
    
    Examples:
      todo list
      todo list --all
      todo list --done

  done <id> [<id2> <id3> ...]
    Mark one or more todos as completed
    
    Arguments:
      <id>         Todo ID number(s) to mark as done
    
    Examples:
      todo done 1
      todo done 1 3 5
      todo done 2

  remove <id> | remove --done
    Remove todo item(s)
    
    Arguments:
      <id>         Specific todo ID to remove
    
    Options:
      --done       Remove all completed todos
    
    Examples:
      todo remove 1
      todo remove --done

  help
    Display this help information

NOTES:
  - Todo IDs are displayed in the list command
  - Priorities: low, medium, high
  - Use quotes around task text with spaces
  - Flags can be used in any order

For more information, visit: https://github.com/your-repo/todo-cli
`;

    return helpText.trim();
}

// Export all commands
export default {
    add,
    list,
    done,
    remove,
    help
};