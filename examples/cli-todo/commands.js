/**
 * CLI Commands Module
 * Implements command-line interface operations for todo management
 */

import { add_todo, load_todos, delete_todo, save_todos, get_todo_by_id } from '@app';
import { format_table } from '@utils';

/**
 * Parses command line arguments to extract flags and values
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
            
            // Check if next argument is a value (not a flag)
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
 * Validates that todo IDs exist in the current todo list
 * @param {number[]} ids - Array of todo IDs to validate
 * @param {Object[]} todos - Array of todo objects
 * @returns {Object} Validation result with valid/invalid IDs
 */
function validateTodoIds(ids, todos) {
    const valid = [];
    const invalid = [];
    
    ids.forEach(id => {
        const todo = todos.find(t => t.id === id);
        if (todo) {
            valid.push({ id, todo });
        } else {
            invalid.push(id);
        }
    });
    
    return { valid, invalid };
}

/**
 * Formats todo items for display with checkboxes
 * @param {Object[]} todos - Array of todo objects
 * @returns {string} Formatted table string
 */
function formatTodoTable(todos) {
    if (todos.length === 0) {
        return 'No todos found.';
    }
    
    const tableData = todos.map(todo => ({
        ID: `#${todo.id}`,
        Status: todo.done ? '[✓]' : '[ ]',
        Description: todo.description,
        Priority: todo.priority || 'normal',
        Created: new Date(todo.created_at).toLocaleDateString(),
        Completed: todo.done && todo.completed_at 
            ? new Date(todo.completed_at).toLocaleDateString() 
            : '-'
    }));
    
    return format_table(tableData);
}

/**
 * Add a new todo item
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
export async function add(args) {
    try {
        const { flags, remaining } = parseArgs(args);
        
        if (remaining.length === 0) {
            throw new Error('Task description is required. Usage: add <description> [--priority <level>]');
        }
        
        const description = remaining.join(' ').trim();
        if (!description) {
            throw new Error('Task description cannot be empty.');
        }
        
        const priority = flags.priority || 'normal';
        const validPriorities = ['low', 'normal', 'high', 'urgent'];
        
        if (!validPriorities.includes(priority.toLowerCase())) {
            throw new Error(`Invalid priority "${priority}". Valid options: ${validPriorities.join(', ')}`);
        }
        
        const todo = await add_todo(description, priority.toLowerCase());
        console.log(`Added: #${todo.id} - ${todo.description}`);
        
    } catch (error) {
        console.error(`Error adding todo: ${error.message}`);
        throw error;
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
        
        const todos = await load_todos();
        let filteredTodos = todos;
        
        if (flags.done) {
            filteredTodos = todos.filter(todo => todo.done);
        } else if (!flags.all) {
            // Default: show only pending todos
            filteredTodos = todos.filter(todo => !todo.done);
        }
        
        // Sort by priority and creation date
        const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
        filteredTodos.sort((a, b) => {
            const priorityDiff = (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
            if (priorityDiff !== 0) return priorityDiff;
            return new Date(a.created_at) - new Date(b.created_at);
        });
        
        const output = formatTodoTable(filteredTodos);
        console.log(output);
        
        // Show summary
        const totalCount = todos.length;
        const doneCount = todos.filter(t => t.done).length;
        const pendingCount = totalCount - doneCount;
        
        console.log(`\nSummary: ${totalCount} total, ${pendingCount} pending, ${doneCount} completed`);
        
    } catch (error) {
        console.error(`Error listing todos: ${error.message}`);
        throw error;
    }
}

/**
 * Mark todo items as completed
 * @param {string[]} args - Command line arguments containing todo IDs
 * @returns {Promise<void>}
 */
export async function done(args) {
    try {
        const { remaining } = parseArgs(args);
        
        if (remaining.length === 0) {
            throw new Error('Todo ID(s) required. Usage: done <id1> [id2] [id3]...');
        }
        
        // Parse and validate IDs
        const ids = remaining.map(arg => {
            const id = parseInt(arg, 10);
            if (isNaN(id) || id <= 0) {
                throw new Error(`Invalid todo ID: "${arg}". IDs must be positive numbers.`);
            }
            return id;
        });
        
        const todos = await load_todos();
        const { valid, invalid } = validateTodoIds(ids, todos);
        
        if (invalid.length > 0) {
            throw new Error(`Todo(s) not found: ${invalid.map(id => `#${id}`).join(', ')}`);
        }
        
        // Mark todos as completed
        const completedTodos = [];
        const alreadyDone = [];
        const timestamp = new Date().toISOString();
        
        valid.forEach(({ id, todo }) => {
            if (todo.done) {
                alreadyDone.push(todo);
            } else {
                todo.done = true;
                todo.completed_at = timestamp;
                completedTodos.push(todo);
            }
        });
        
        if (completedTodos.length > 0) {
            await save_todos(todos);
            completedTodos.forEach(todo => {
                console.log(`Completed: #${todo.id} - ${todo.description}`);
            });
        }
        
        if (alreadyDone.length > 0) {
            alreadyDone.forEach(todo => {
                console.log(`Already completed: #${todo.id} - ${todo.description}`);
            });
        }
        
    } catch (error) {
        console.error(`Error marking todos as done: ${error.message}`);
        throw error;
    }
}

/**
 * Remove todo items
 * @param {string[]} args - Command line arguments containing todo IDs or flags
 * @returns {Promise<void>}
 */
export async function remove(args) {
    try {
        const { flags, remaining } = parseArgs(args);
        
        const todos = await load_todos();
        let todosToRemove = [];
        
        if (flags.done) {
            // Remove all completed todos
            todosToRemove = todos.filter(todo => todo.done);
            
            if (todosToRemove.length === 0) {
                console.log('No completed todos to remove.');
                return;
            }
            
            // Confirm bulk deletion
            console.log(`This will remove ${todosToRemove.length} completed todo(s). Continue? (This action cannot be undone)`);
            
        } else {
            // Remove specific todos by ID
            if (remaining.length === 0) {
                throw new Error('Todo ID(s) required or use --done flag. Usage: remove <id1> [id2]... or remove --done');
            }
            
            const ids = remaining.map(arg => {
                const id = parseInt(arg, 10);
                if (isNaN(id) || id <= 0) {
                    throw new Error(`Invalid todo ID: "${arg}". IDs must be positive numbers.`);
                }
                return id;
            });
            
            const { valid, invalid } = validateTodoIds(ids, todos);
            
            if (invalid.length > 0) {
                throw new Error(`Todo(s) not found: ${invalid.map(id => `#${id}`).join(', ')}`);
            }
            
            todosToRemove = valid.map(v => v.todo);
        }
        
        // Remove todos
        const removedTodos = [];
        for (const todo of todosToRemove) {
            try {
                await delete_todo(todo.id);
                removedTodos.push(todo);
            } catch (error) {
                console.error(`Failed to remove todo #${todo.id}: ${error.message}`);
            }
        }
        
        if (removedTodos.length > 0) {
            removedTodos.forEach(todo => {
                console.log(`Removed: #${todo.id} - ${todo.description}`);
            });
            
            if (flags.done) {
                console.log(`Successfully removed ${removedTodos.length} completed todo(s).`);
            }
        }
        
    } catch (error) {
        console.error(`Error removing todos: ${error.message}`);
        throw error;
    }
}

/**
 * Display help information
 * @param {string[]} args - Command line arguments (unused)
 * @returns {void}
 */
export function help(args) {
    const helpText = `
Todo CLI - Command Line Todo Manager

USAGE:
    todo <command> [arguments] [flags]

COMMANDS:
    add <description> [--priority <level>]
        Add a new todo item
        Priority levels: low, normal, high, urgent (default: normal)
        
        Examples:
            todo add "Buy groceries"
            todo add "Fix critical bug" --priority urgent
            todo add "Review documentation" --priority low

    list [--all | --done]
        List todo items
        --all    Show all todos (pending and completed)
        --done   Show only completed todos
        Default: Show only pending todos
        
        Examples:
            todo list
            todo list --all
            todo list --done

    done <id1> [id2] [id3]...
        Mark one or more todos as completed
        
        Examples:
            todo done 1
            todo done 1 3 5

    remove <id1> [id2]... | remove --done
        Remove one or more todos by ID, or remove all completed todos
        --done   Remove all completed todos
        
        Examples:
            todo remove 1
            todo remove 1 3 5
            todo remove --done

    help
        Show this help message

EXAMPLES:
    todo add "Learn JavaScript" --priority high
    todo list
    todo done 1
    todo list --all
    todo remove --done

NOTES:
    - Todo IDs are displayed with each item (e.g., #1, #2, #3)
    - Completed todos are marked with [✓], pending todos with [ ]
    - Todos are sorted by priority (urgent → high → normal → low) then by creation date
    - Use quotes around descriptions that contain spaces or special characters
    - All operations provide confirmation messages and error details
`;

    console.log(helpText.trim());
}

// Export all command functions
export default {
    add,
    list,
    done,
    remove,
    help
};