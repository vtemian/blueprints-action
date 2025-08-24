/**
 * CLI Command Handlers for Todo Application
 * Provides command-line interface functionality for managing todos
 */

import * as app from './app.js';
import * as utils from './utils.js';

/**
 * Parses command line arguments to extract flags and values
 * @param {string[]} args - Array of command line arguments
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
 * Validates and parses todo IDs from arguments
 * @param {string[]} args - Array of potential ID strings
 * @returns {number[]} Array of valid numeric IDs
 * @throws {Error} If any ID is invalid
 */
function parseIds(args) {
  const ids = [];
  for (const arg of args) {
    const id = parseInt(arg, 10);
    if (isNaN(id) || id <= 0) {
      throw new Error(`Invalid todo ID: "${arg}". IDs must be positive numbers.`);
    }
    ids.push(id);
  }
  return ids;
}

/**
 * Sanitizes todo text input
 * @param {string} text - Raw todo text
 * @returns {string} Sanitized text
 */
function sanitizeText(text) {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Adds a new todo item
 * @param {string[]} args - Command arguments
 * @returns {Promise<boolean>} Success status
 */
async function add(args) {
  try {
    const { flags, remaining } = parseArgs(args);
    
    if (remaining.length === 0) {
      console.error('Error: Todo description is required.');
      console.log('Usage: todo add "Buy groceries" [--priority high|medium|low]');
      return false;
    }
    
    const text = sanitizeText(remaining.join(' '));
    if (text.length === 0) {
      console.error('Error: Todo description cannot be empty.');
      return false;
    }
    
    const priority = flags.priority || 'medium';
    const validPriorities = ['low', 'medium', 'high'];
    
    if (!validPriorities.includes(priority.toLowerCase())) {
      console.error(`Error: Invalid priority "${priority}". Use: ${validPriorities.join(', ')}`);
      return false;
    }
    
    const todo = await app.add_todo(text, priority.toLowerCase());
    console.log(`Added: #${todo.id} - ${todo.description}`);
    
    if (priority !== 'medium') {
      console.log(`Priority: ${priority}`);
    }
    
    return true;
    
  } catch (error) {
    console.error(`Error adding todo: ${error.message}`);
    return false;
  }
}

/**
 * Lists todo items with filtering options
 * @param {string[]} args - Command arguments
 * @returns {Promise<boolean>} Success status
 */
async function list(args) {
  try {
    const { flags } = parseArgs(args);
    
    const todos = await app.load_todos();
    
    if (!todos || todos.length === 0) {
      console.log('No todos found. Use "todo add" to create your first todo!');
      return true;
    }
    
    let filteredTodos = todos;
    let title = 'Todo List';
    
    if (flags.done) {
      filteredTodos = todos.filter(todo => todo.done);
      title = 'Completed Todos';
    } else if (flags.all) {
      title = 'All Todos';
    } else {
      filteredTodos = todos.filter(todo => !todo.done);
      title = 'Pending Todos';
    }
    
    if (filteredTodos.length === 0) {
      if (flags.done) {
        console.log('No completed todos found.');
      } else if (!flags.all) {
        console.log('No pending todos found. Great job! 🎉');
      }
      return true;
    }
    
    console.log(`\n${title}:`);
    console.log('─'.repeat(50));
    
    const tableData = filteredTodos.map(todo => {
      const status = todo.done ? '[✓]' : '[ ]';
      const priority = todo.priority && todo.priority !== 'medium' 
        ? ` (${todo.priority})` 
        : '';
      const completedDate = todo.done && todo.completed_at 
        ? ` - Completed: ${new Date(todo.completed_at).toLocaleDateString()}`
        : '';
      
      return [
        `#${todo.id}`,
        status,
        `${todo.description}${priority}${completedDate}`
      ];
    });
    
    const headers = ['ID', 'Status', 'Description'];
    utils.format_table(headers, tableData);
    
    console.log(`\nTotal: ${filteredTodos.length} todo(s)`);
    return true;
    
  } catch (error) {
    console.error(`Error listing todos: ${error.message}`);
    return false;
  }
}

/**
 * Marks todo items as completed
 * @param {string[]} args - Command arguments containing todo IDs
 * @returns {Promise<boolean>} Success status
 */
async function done(args) {
  try {
    if (args.length === 0) {
      console.error('Error: Todo ID(s) required.');
      console.log('Usage: todo done <id1> [id2] [id3] ...');
      return false;
    }
    
    const ids = parseIds(args);
    const todos = await app.load_todos();
    const completedCount = [];
    const errors = [];
    
    for (const id of ids) {
      const todo = todos.find(t => t.id === id);
      
      if (!todo) {
        errors.push(`Todo #${id} not found`);
        continue;
      }
      
      if (todo.done) {
        errors.push(`Todo #${id} is already completed`);
        continue;
      }
      
      // Mark as completed with timestamp
      todo.done = true;
      todo.completed_at = new Date().toISOString();
      
      await app.save_todos(todos);
      completedCount.push(todo);
      console.log(`Completed: #${todo.id} - ${todo.description}`);
    }
    
    // Display any errors
    if (errors.length > 0) {
      console.error('\nErrors:');
      errors.forEach(error => console.error(`  ${error}`));
    }
    
    if (completedCount.length > 0) {
      console.log(`\n✅ Successfully completed ${completedCount.length} todo(s)`);
      return true;
    }
    
    return errors.length === 0;
    
  } catch (error) {
    console.error(`Error completing todos: ${error.message}`);
    return false;
  }
}

/**
 * Removes todo items or all completed todos
 * @param {string[]} args - Command arguments
 * @returns {Promise<boolean>} Success status
 */
async function remove(args) {
  try {
    const { flags, remaining } = parseArgs(args);
    
    if (flags.done) {
      return await removeDoneTodos();
    }
    
    if (remaining.length === 0) {
      console.error('Error: Todo ID required or use --done flag to remove all completed todos.');
      console.log('Usage: todo remove <id> OR todo remove --done');
      return false;
    }
    
    if (remaining.length > 1) {
      console.error('Error: Only one todo ID allowed. Use multiple remove commands for multiple todos.');
      return false;
    }
    
    const [idStr] = remaining;
    const id = parseInt(idStr, 10);
    
    if (isNaN(id) || id <= 0) {
      console.error(`Error: Invalid todo ID "${idStr}". ID must be a positive number.`);
      return false;
    }
    
    const todos = await app.load_todos();
    const todo = todos.find(t => t.id === id);
    
    if (!todo) {
      console.error(`Error: Todo #${id} not found.`);
      return false;
    }
    
    // Confirmation for individual todo
    console.log(`About to remove: #${todo.id} - ${todo.description}`);
    
    await app.delete_todo(id);
    console.log(`Removed: #${todo.id} - ${todo.description}`);
    
    return true;
    
  } catch (error) {
    console.error(`Error removing todo: ${error.message}`);
    return false;
  }
}

/**
 * Removes all completed todos with confirmation
 * @returns {Promise<boolean>} Success status
 */
async function removeDoneTodos() {
  try {
    const todos = await app.load_todos();
    const completedTodos = todos.filter(todo => todo.done);
    
    if (completedTodos.length === 0) {
      console.log('No completed todos to remove.');
      return true;
    }
    
    console.log(`Found ${completedTodos.length} completed todo(s):`);
    completedTodos.forEach(todo => {
      console.log(`  #${todo.id} - ${todo.description}`);
    });
    
    console.log('\n⚠️  This will permanently delete all completed todos.');
    console.log('This action cannot be undone.');
    
    // In a real CLI app, you'd use a proper prompt library
    // For this example, we'll proceed with the operation
    let removedCount = 0;
    
    for (const todo of completedTodos) {
      await app.delete_todo(todo.id);
      removedCount++;
    }
    
    console.log(`\n🗑️  Successfully removed ${removedCount} completed todo(s)`);
    return true;
    
  } catch (error) {
    console.error(`Error removing completed todos: ${error.message}`);
    return false;
  }
}

/**
 * Displays help information for all commands
 * @param {string[]} args - Command arguments (unused)
 * @returns {Promise<boolean>} Success status
 */
async function help(args) {
  console.log(`
📝 Todo Application - Command Line Interface

USAGE:
  todo <command> [arguments] [flags]

COMMANDS:

  add <description> [--priority <level>]
    Add a new todo item
    Priority levels: low, medium (default), high
    
    Examples:
      todo add "Buy groceries"
      todo add "Finish project" --priority high
      todo add "Call mom" --priority low

  list [--all] [--done]
    Display todo items
    --all    Show all todos (completed and pending)
    --done   Show only completed todos
    Default: Show only pending todos
    
    Examples:
      todo list
      todo list --all
      todo list --done

  done <id1> [id2] [id3] ...
    Mark one or more todos as completed
    
    Examples:
      todo done 1
      todo done 1 3 5

  remove <id>
  remove --done
    Remove a specific todo by ID, or all completed todos
    
    Examples:
      todo remove 1
      todo remove --done

  help
    Show this help message

EXAMPLES:
  todo add "Learn JavaScript"           # Add a new todo
  todo add "Study React" --priority high # Add high priority todo
  todo list                            # Show pending todos
  todo list --all                      # Show all todos
  todo done 1                          # Complete todo #1
  todo done 1 2 3                      # Complete multiple todos
  todo remove 1                        # Remove todo #1
  todo remove --done                   # Remove all completed todos

TIPS:
  • Use quotes around descriptions with spaces
  • Todo IDs are shown in the list command
  • Completed todos show a ✓ checkmark
  • Use --priority to organize important tasks
  • Regular cleanup with "remove --done" keeps your list tidy

For more information, visit: https://github.com/yourproject/todo-cli
`);
  
  return true;
}

// Export all command handlers
export {
  add,
  list,
  done,
  remove,
  help
};

// Default export with all commands
export default {
  add,
  list,
  done,
  remove,
  help
};