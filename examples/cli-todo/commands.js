/**
 * CLI Commands Module for Todo List Operations
 * Provides command-line interface functions for managing todos
 */

import * as app from './app.js';
import * as utils from './utils.js';

/**
 * Parses command line arguments into flags and remaining args
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed arguments with flags and remaining args
 */
function parseArgs(args) {
  const flags = {};
  const remaining = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      if (arg.includes('=')) {
        // Handle --flag=value format
        const [key, value] = arg.substring(2).split('=', 2);
        flags[key] = value || true;
      } else {
        // Handle --flag format, check if next arg is value
        const key = arg.substring(2);
        if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          flags[key] = args[i + 1];
          i++; // Skip next arg as it's the value
        } else {
          flags[key] = true;
        }
      }
    } else {
      remaining.push(arg);
    }
  }
  
  return { flags, remaining };
}

/**
 * Validates that todo IDs exist in the todo list
 * @param {number[]} ids - Array of todo IDs to validate
 * @param {Object[]} todos - Array of todo objects
 * @returns {Object} Validation result with valid IDs and errors
 */
function validateTodoIds(ids, todos) {
  const validIds = [];
  const errors = [];
  
  for (const id of ids) {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      errors.push(`Invalid ID: "${id}" is not a number`);
      continue;
    }
    
    const todo = todos.find(t => t.id === numId);
    if (!todo) {
      errors.push(`Todo #${numId} not found`);
      continue;
    }
    
    validIds.push(numId);
  }
  
  return { validIds, errors };
}

/**
 * Formats success message for todo operations
 * @param {string} action - Action performed (Added, Completed, Removed)
 * @param {Object} todo - Todo object
 * @returns {string} Formatted message
 */
function formatSuccessMessage(action, todo) {
  const status = todo.done ? '[✓]' : '[ ]';
  return `${action}: #${todo.id} ${status} ${todo.text}`;
}

/**
 * Add a new todo item
 * @param {string[]} args - Command arguments
 * @returns {Promise<number>} Status code (0 for success, 1 for error)
 */
async function add(args) {
  try {
    const { flags, remaining } = parseArgs(args);
    
    // Join remaining arguments as task text
    const text = remaining.join(' ').trim();
    
    if (!text) {
      console.error('Error: Task description is required');
      console.log('Usage: todo add "Task description" [--priority=high|medium|low]');
      return 1;
    }
    
    // Validate priority if provided
    const priority = flags.priority || 'medium';
    const validPriorities = ['low', 'medium', 'high'];
    if (!validPriorities.includes(priority.toLowerCase())) {
      console.error(`Error: Invalid priority "${priority}". Use: ${validPriorities.join(', ')}`);
      return 1;
    }
    
    const todoData = {
      text,
      priority: priority.toLowerCase(),
      done: false,
      created_at: new Date().toISOString()
    };
    
    const newTodo = await app.add_todo(todoData);
    console.log(formatSuccessMessage('Added', newTodo));
    
    return 0;
  } catch (error) {
    console.error(`Error adding todo: ${error.message}`);
    return 1;
  }
}

/**
 * List todo items with filtering options
 * @param {string[]} args - Command arguments
 * @returns {Promise<number>} Status code (0 for success, 1 for error)
 */
async function list(args) {
  try {
    const { flags } = parseArgs(args);
    
    // Validate mutually exclusive flags
    if (flags.all && flags.done) {
      console.error('Error: --all and --done flags cannot be used together');
      return 1;
    }
    
    const todos = await app.load_todos();
    
    if (todos.length === 0) {
      console.log('No todos found. Use "todo add" to create your first todo!');
      return 0;
    }
    
    // Filter todos based on flags
    let filteredTodos = todos;
    if (flags.done) {
      filteredTodos = todos.filter(todo => todo.done);
    } else if (!flags.all) {
      // Default: show incomplete only
      filteredTodos = todos.filter(todo => !todo.done);
    }
    
    if (filteredTodos.length === 0) {
      const filterMsg = flags.done ? 'completed' : 'pending';
      console.log(`No ${filterMsg} todos found.`);
      return 0;
    }
    
    // Prepare data for table formatting
    const tableData = filteredTodos.map(todo => ({
      ID: `#${todo.id}`,
      Status: todo.done ? '[✓]' : '[ ]',
      Priority: todo.priority.toUpperCase(),
      Task: todo.text,
      Created: todo.created_at ? new Date(todo.created_at).toLocaleDateString() : 'N/A'
    }));
    
    console.log(utils.format_table(tableData));
    console.log(`\nShowing ${filteredTodos.length} of ${todos.length} todos`);
    
    return 0;
  } catch (error) {
    console.error(`Error listing todos: ${error.message}`);
    return 1;
  }
}

/**
 * Mark todo items as completed
 * @param {string[]} args - Command arguments (todo IDs)
 * @returns {Promise<number>} Status code (0 for success, 1 for error)
 */
async function done(args) {
  try {
    const { remaining } = parseArgs(args);
    
    if (remaining.length === 0) {
      console.error('Error: Todo ID(s) required');
      console.log('Usage: todo done <id1> [id2] [id3] ...');
      return 1;
    }
    
    const todos = await app.load_todos();
    const { validIds, errors } = validateTodoIds(remaining, todos);
    
    // Display validation errors
    if (errors.length > 0) {
      errors.forEach(error => console.error(`Error: ${error}`));
      if (validIds.length === 0) {
        return 1;
      }
    }
    
    let completedCount = 0;
    
    // Mark todos as done
    for (const id of validIds) {
      const todo = todos.find(t => t.id === id);
      if (todo.done) {
        console.log(`Todo #${id} is already completed`);
        continue;
      }
      
      todo.done = true;
      todo.completed_at = new Date().toISOString();
      
      await app.update_todo(id, todo);
      console.log(formatSuccessMessage('Completed', todo));
      completedCount++;
    }
    
    if (completedCount > 0) {
      console.log(`\n✓ Marked ${completedCount} todo(s) as completed`);
    }
    
    return errors.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(`Error completing todos: ${error.message}`);
    return 1;
  }
}

/**
 * Remove todo items
 * @param {string[]} args - Command arguments
 * @returns {Promise<number>} Status code (0 for success, 1 for error)
 */
async function remove(args) {
  try {
    const { flags, remaining } = parseArgs(args);
    
    if (flags.done) {
      // Bulk remove completed todos
      const todos = await app.load_todos();
      const completedTodos = todos.filter(todo => todo.done);
      
      if (completedTodos.length === 0) {
        console.log('No completed todos to remove');
        return 0;
      }
      
      // Confirm bulk operation
      console.log(`About to remove ${completedTodos.length} completed todo(s):`);
      completedTodos.forEach(todo => {
        console.log(`  #${todo.id} - ${todo.text}`);
      });
      
      // In a real CLI, you might want to add confirmation prompt here
      console.log('\nRemoving completed todos...');
      
      for (const todo of completedTodos) {
        await app.delete_todo(todo.id);
        console.log(formatSuccessMessage('Removed', todo));
      }
      
      console.log(`\n✓ Removed ${completedTodos.length} completed todo(s)`);
      return 0;
    }
    
    if (remaining.length === 0) {
      console.error('Error: Todo ID required or use --done flag');
      console.log('Usage: todo remove <id> OR todo remove --done');
      return 1;
    }
    
    const todos = await app.load_todos();
    const { validIds, errors } = validateTodoIds(remaining, todos);
    
    // Display validation errors
    if (errors.length > 0) {
      errors.forEach(error => console.error(`Error: ${error}`));
      if (validIds.length === 0) {
        return 1;
      }
    }
    
    // Remove todos
    for (const id of validIds) {
      const todo = todos.find(t => t.id === id);
      await app.delete_todo(id);
      console.log(formatSuccessMessage('Removed', todo));
    }
    
    if (validIds.length > 0) {
      console.log(`\n✓ Removed ${validIds.length} todo(s)`);
    }
    
    return errors.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(`Error removing todos: ${error.message}`);
    return 1;
  }
}

/**
 * Display help information
 * @param {string[]} args - Command arguments (unused)
 * @returns {Promise<number>} Status code (always 0)
 */
async function help(args) {
  const helpText = `
📝 Todo CLI - Task Management Tool

USAGE:
  todo <command> [options] [arguments]

COMMANDS:
  add <text>              Add a new todo item
    --priority=<level>    Set priority (low, medium, high)
    
  list                    Show pending todos
    --all                 Show all todos (pending and completed)
    --done                Show completed todos only
    
  done <id> [id2...]      Mark todo(s) as completed
  
  remove <id>             Remove a specific todo
    --done                Remove all completed todos
    
  help                    Show this help message

EXAMPLES:
  todo add "Buy groceries" --priority=high
  todo add "Call dentist"
  todo list
  todo list --all
  todo list --done
  todo done 1
  todo done 1 2 3
  todo remove 1
  todo remove --done

TIPS:
  • Use quotes around task descriptions with spaces
  • Todo IDs are shown in the list command
  • Completed todos are marked with [✓]
  • Pending todos are marked with [ ]
  • Priority levels: low, medium (default), high

For more information, visit: https://github.com/your-repo/todo-cli
`;

  console.log(helpText);
  return 0;
}

// Export all command functions
export {
  add,
  list,
  done,
  remove,
  help,
  parseArgs,
  validateTodoIds,
  formatSuccessMessage
};

// Default export as commands object for convenience
export default {
  add,
  list,
  done,
  remove,
  help
};