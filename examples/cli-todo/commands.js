// cli-handlers.js
import app from './app.js';
import utils from './utils.js';

/**
 * Parse command line arguments to extract flags and remaining args
 * @param {string[]} args - Command line arguments
 * @param {string[]} flags - Flag names to look for (without --)
 * @returns {Object} - { flags: {}, remainingArgs: [] }
 */
function parseArgs(args, flags = []) {
    const parsedFlags = {};
    const remainingArgs = [];
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg.startsWith('--')) {
            const flagName = arg.substring(2);
            
            if (flags.includes(flagName)) {
                // Check if next argument is a value for this flag
                if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                    parsedFlags[flagName] = args[i + 1];
                    i++; // Skip next argument as it's the flag value
                } else {
                    parsedFlags[flagName] = true;
                }
            } else {
                throw new Error(`Unknown flag: ${arg}`);
            }
        } else {
            remainingArgs.push(arg);
        }
    }
    
    return { flags: parsedFlags, remainingArgs };
}

/**
 * Validate that IDs are numeric and convert to integers
 * @param {string[]} ids - Array of ID strings
 * @returns {number[]} - Array of validated integer IDs
 */
function validateIds(ids) {
    const validIds = [];
    
    for (const id of ids) {
        const numId = parseInt(id, 10);
        if (isNaN(numId) || numId <= 0) {
            throw new Error(`Invalid ID: "${id}". IDs must be positive numbers.`);
        }
        validIds.push(numId);
    }
    
    return validIds;
}

/**
 * Add a new todo item
 * @param {string[]} args - Command arguments
 */
async function add(args) {
    try {
        if (!args || args.length === 0) {
            throw new Error('Task description is required. Usage: add <description> [--priority <level>]');
        }

        const { flags, remainingArgs } = parseArgs(args, ['priority']);
        
        if (remainingArgs.length === 0) {
            throw new Error('Task description cannot be empty.');
        }

        const description = remainingArgs.join(' ').trim();
        const priority = flags.priority || 'medium';
        
        // Validate priority level
        const validPriorities = ['low', 'medium', 'high'];
        if (!validPriorities.includes(priority.toLowerCase())) {
            throw new Error(`Invalid priority: "${priority}". Valid options: ${validPriorities.join(', ')}`);
        }

        const todo = await app.add_todo(description, priority.toLowerCase());
        console.log(`Added: #${todo.id} - ${todo.description}`);
        
    } catch (error) {
        console.error(`Error adding todo: ${error.message}`);
        process.exit(1);
    }
}

/**
 * List todo items with filtering options
 * @param {string[]} args - Command arguments
 */
async function list(args) {
    try {
        const { flags } = parseArgs(args || [], ['all', 'done']);
        
        const todos = await app.load_todos();
        
        if (!todos || todos.length === 0) {
            console.log('No todos found. Use "add" command to create your first todo!');
            return;
        }

        let filteredTodos = todos;
        
        // Apply filters
        if (flags.done) {
            filteredTodos = todos.filter(todo => todo.done);
        } else if (!flags.all) {
            // Default: show only incomplete todos
            filteredTodos = todos.filter(todo => !todo.done);
        }

        if (filteredTodos.length === 0) {
            if (flags.done) {
                console.log('No completed todos found.');
            } else if (!flags.all) {
                console.log('No pending todos found. Great job! 🎉');
            }
            return;
        }

        // Prepare data for table formatting
        const tableData = filteredTodos.map(todo => ({
            ID: todo.id.toString(),
            Status: todo.done ? '[✓]' : '[ ]',
            Priority: todo.priority ? todo.priority.toUpperCase() : 'MEDIUM',
            Description: todo.description,
            Created: todo.created ? new Date(todo.created).toLocaleDateString() : 'N/A',
            Completed: todo.done && todo.completed ? new Date(todo.completed).toLocaleDateString() : ''
        }));

        const headers = ['ID', 'Status', 'Priority', 'Description', 'Created', 'Completed'];
        const formattedTable = utils.format_table(tableData, headers);
        
        console.log('\n' + formattedTable + '\n');
        console.log(`Total: ${filteredTodos.length} todo(s)`);
        
    } catch (error) {
        console.error(`Error listing todos: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Mark one or more todos as completed
 * @param {string[]} args - Command arguments (todo IDs)
 */
async function done(args) {
    try {
        if (!args || args.length === 0) {
            throw new Error('Todo ID(s) required. Usage: done <id1> [id2] [id3] ...');
        }

        const { remainingArgs } = parseArgs(args, []);
        const ids = validateIds(remainingArgs);
        
        const todos = await app.load_todos();
        const completedTodos = [];
        
        for (const id of ids) {
            const todo = todos.find(t => t.id === id);
            
            if (!todo) {
                throw new Error(`Todo with ID ${id} not found.`);
            }
            
            if (todo.done) {
                console.log(`Todo #${id} is already completed.`);
                continue;
            }
            
            // Mark as done and add completion timestamp
            todo.done = true;
            todo.completed = new Date().toISOString();
            
            completedTodos.push(todo);
        }
        
        if (completedTodos.length > 0) {
            await app.save_todos(todos);
            
            for (const todo of completedTodos) {
                console.log(`Completed: #${todo.id} - ${todo.description}`);
            }
            
            console.log(`\n🎉 Marked ${completedTodos.length} todo(s) as completed!`);
        }
        
    } catch (error) {
        console.error(`Error marking todos as done: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Remove todo items (single ID or bulk removal of completed todos)
 * @param {string[]} args - Command arguments
 */
async function remove(args) {
    try {
        if (!args || args.length === 0) {
            throw new Error('Todo ID required or use --done flag. Usage: remove <id> OR remove --done');
        }

        const { flags, remainingArgs } = parseArgs(args, ['done']);
        
        const todos = await app.load_todos();
        
        if (flags.done) {
            // Bulk removal of completed todos
            const completedTodos = todos.filter(todo => todo.done);
            
            if (completedTodos.length === 0) {
                console.log('No completed todos to remove.');
                return;
            }
            
            // Confirm bulk operation
            console.log(`Found ${completedTodos.length} completed todo(s) to remove:`);
            completedTodos.forEach(todo => {
                console.log(`  #${todo.id} - ${todo.description}`);
            });
            
            // In a real CLI, you might want to add interactive confirmation
            console.log('\nRemoving all completed todos...');
            
            const remainingTodos = todos.filter(todo => !todo.done);
            await app.save_todos(remainingTodos);
            
            console.log(`✅ Removed ${completedTodos.length} completed todo(s).`);
            
        } else {
            // Single todo removal
            if (remainingArgs.length === 0) {
                throw new Error('Todo ID is required when not using --done flag.');
            }
            
            if (remainingArgs.length > 1) {
                throw new Error('Only one ID allowed for single removal. Use --done flag for bulk removal.');
            }
            
            const [id] = validateIds(remainingArgs);
            const todoIndex = todos.findIndex(t => t.id === id);
            
            if (todoIndex === -1) {
                throw new Error(`Todo with ID ${id} not found.`);
            }
            
            const removedTodo = todos[todoIndex];
            await app.delete_todo(id);
            
            console.log(`Removed: #${removedTodo.id} - ${removedTodo.description}`);
        }
        
    } catch (error) {
        console.error(`Error removing todo(s): ${error.message}`);
        process.exit(1);
    }
}

/**
 * Display help information for all commands
 * @param {string[]} args - Command arguments (unused)
 */
function help(args) {
    const helpText = `
📝 TODO CLI Application - Help

USAGE:
  todo <command> [arguments] [flags]

COMMANDS:

  add <description> [--priority <level>]
    Add a new todo item with optional priority
    Priority levels: low, medium, high (default: medium)
    
    Examples:
      todo add "Buy groceries"
      todo add "Finish project report" --priority high
      todo add "Call dentist" --priority low

  list [--all] [--done]
    Display todo items with filtering options
    
    Flags:
      --all   Show all todos (completed and incomplete)
      --done  Show only completed todos
      (no flags) Show only incomplete todos (default)
    
    Examples:
      todo list
      todo list --all
      todo list --done

  done <id1> [id2] [id3] ...
    Mark one or more todos as completed
    Supports multiple IDs in a single command
    
    Examples:
      todo done 1
      todo done 1 3 5
      todo done 2

  remove <id>
  remove --done
    Remove a specific todo by ID, or remove all completed todos
    
    Examples:
      todo remove 1
      todo remove --done

  help
    Display this help information

EXAMPLES:
  # Create a new todo
  todo add "Learn JavaScript" --priority high
  
  # List all incomplete todos
  todo list
  
  # Mark todos 1 and 3 as completed
  todo done 1 3
  
  # View all todos including completed ones
  todo list --all
  
  # Remove completed todos
  todo remove --done
  
  # Remove a specific todo
  todo remove 2

TIPS:
  • Use quotes around descriptions with spaces
  • IDs are assigned automatically when adding todos
  • Completed todos show [✓], incomplete show [ ]
  • Use --done flag with remove to clean up completed tasks
  • Priority affects display order in some views

For more information, visit: https://github.com/your-repo/todo-cli
`;

    console.log(helpText);
}

// Export all command handlers
export default {
    add,
    list,
    done,
    remove,
    help
};