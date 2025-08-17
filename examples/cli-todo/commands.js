/**
 * CLI Commands Module for Todo Application
 * Implements command-line interface operations for managing todos
 */

import app from './app.js';
import utils from './utils.js';

/**
 * Parses command line arguments into flags and parameters
 * @param {string[]} args - Array of command arguments
 * @returns {Object} Parsed arguments with flags and params
 */
function parseArgs(args) {
  const flags = {};
  const params = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const flagName = arg.slice(2);
      // Check if next argument is a value for this flag
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[flagName] = args[i + 1];
        i++; // Skip next argument as it's the flag value
      } else {
        flags[flagName] = true;
      }
    } else {
      params.push(arg);
    }
  }
  
  return { flags, params };
}

/**
 * Validates todo ID format and existence
 * @param {string} id - Todo ID to validate
 * @param {Array} todos - Array of existing todos
 * @returns {number} Parsed and validated ID
 * @throws {Error} If ID is invalid or doesn't exist
 */
function validateTodoId(id, todos) {
  const numId = parseInt(id, 10);
  
  if (isNaN(numId) || numId <= 0) {
    throw new Error(`Invalid todo ID: ${id}. ID must be a positive number.`);
  }
  
  const todo = todos.find(t => t.id === numId);
  if (!todo) {
    throw new Error(`Todo with ID ${numId} not found.`);
  }
  
  return numId;
}

/**
 * Validates priority level
 * @param {string} priority - Priority to validate
 * @returns {string} Validated priority
 * @throws {Error} If priority is invalid
 */
function validatePriority(priority) {
  const validPriorities = ['low', 'medium', 'high'];
  const normalizedPriority = priority.toLowerCase();
  
  if (!validPriorities.includes(normalizedPriority)) {
    throw new Error(`Invalid priority: ${priority}. Must be one of: ${validPriorities.join(', ')}`);
  }
  
  return normalizedPriority;
}

/**
 * Add a new todo item
 * @param {string[]} args - Command arguments
 * @returns {Promise<void>}
 */
async function add(args) {
  try {
    const { flags, params } = parseArgs(args);
    
    // Join remaining parameters as todo description
    const description = params.join(' ').trim();
    
    if (!description) {
      throw new Error('Todo description cannot be empty. Usage: add <description> [--priority <level>]');
    }
    
    // Validate and set priority
    let priority = 'medium'; // default
    if (flags.priority) {
      priority = validatePriority(flags.priority);
    }
    
    const todoData = {
      description,
      priority,
      done: false,
      created: new Date().toISOString(),
      completed: null
    };
    
    const newTodo = await app.add_todo(todoData);
    console.log(`✅ Added: #${newTodo.id} - ${newTodo.description}`);
    
  } catch (error) {
    console.error(`❌ Error adding todo: ${error.message}`);
    throw error;
  }
}

/**
 * List todos with filtering options
 * @param {string[]} args - Command arguments
 * @returns {Promise<void>}
 */
async function list(args) {
  try {
    const { flags } = parseArgs(args);
    
    const todos = await app.load_todos();
    
    if (!todos || todos.length === 0) {
      console.log('📝 No todos found. Use "add" command to create your first todo!');
      return;
    }
    
    // Filter todos based on flags
    let filteredTodos = todos;
    
    if (flags.done) {
      filteredTodos = todos.filter(todo => todo.done);
      if (filteredTodos.length === 0) {
        console.log('✅ No completed todos found.');
        return;
      }
    } else if (!flags.all) {
      // Default: show only incomplete todos
      filteredTodos = todos.filter(todo => !todo.done);
      if (filteredTodos.length === 0) {
        console.log('🎉 All todos completed! Use --all flag to see completed todos.');
        return;
      }
    }
    
    // Prepare data for table formatting
    const tableData = filteredTodos.map(todo => ({
      ID: todo.id.toString(),
      Status: todo.done ? '[✓]' : '[ ]',
      Description: todo.description,
      Priority: todo.priority.toUpperCase(),
      Created: new Date(todo.created).toLocaleDateString(),
      ...(todo.done && todo.completed && {
        Completed: new Date(todo.completed).toLocaleDateString()
      })
    }));
    
    const columns = ['ID', 'Status', 'Description', 'Priority', 'Created'];
    if (flags.all || flags.done) {
      columns.push('Completed');
    }
    
    console.log(`\n📋 Todo List (${filteredTodos.length} items):`);
    console.log(utils.format_table(tableData, columns));
    
  } catch (error) {
    console.error(`❌ Error listing todos: ${error.message}`);
    throw error;
  }
}

/**
 * Mark one or more todos as completed
 * @param {string[]} args - Command arguments containing todo IDs
 * @returns {Promise<void>}
 */
async function done(args) {
  try {
    const { params } = parseArgs(args);
    
    if (params.length === 0) {
      throw new Error('Please specify todo ID(s) to mark as done. Usage: done <id1> [id2] [id3]...');
    }
    
    const todos = await app.load_todos();
    const completedTodos = [];
    const timestamp = new Date().toISOString();
    
    // Process each ID
    for (const idStr of params) {
      const id = validateTodoId(idStr, todos);
      const todo = todos.find(t => t.id === id);
      
      if (todo.done) {
        console.log(`ℹ️  Todo #${id} is already completed.`);
        continue;
      }
      
      // Mark as done
      todo.done = true;
      todo.completed = timestamp;
      
      await app.update_todo(todo);
      completedTodos.push(todo);
      
      console.log(`✅ Completed: #${todo.id} - ${todo.description}`);
    }
    
    if (completedTodos.length > 0) {
      console.log(`\n🎉 Marked ${completedTodos.length} todo(s) as completed!`);
    }
    
  } catch (error) {
    console.error(`❌ Error marking todos as done: ${error.message}`);
    throw error;
  }
}

/**
 * Remove todos by ID or remove all completed todos
 * @param {string[]} args - Command arguments
 * @returns {Promise<void>}
 */
async function remove(args) {
  try {
    const { flags, params } = parseArgs(args);
    const todos = await app.load_todos();
    
    if (flags.done) {
      // Remove all completed todos
      const completedTodos = todos.filter(todo => todo.done);
      
      if (completedTodos.length === 0) {
        console.log('ℹ️  No completed todos to remove.');
        return;
      }
      
      // Confirm bulk deletion
      console.log(`⚠️  This will remove ${completedTodos.length} completed todo(s). Continue? (This action cannot be undone)`);
      
      // In a real CLI app, you'd prompt for confirmation here
      // For this example, we'll proceed with the deletion
      
      let removedCount = 0;
      for (const todo of completedTodos) {
        await app.delete_todo(todo.id);
        removedCount++;
      }
      
      console.log(`🗑️  Removed ${removedCount} completed todos.`);
      
    } else if (params.length > 0) {
      // Remove specific todos by ID
      const removedTodos = [];
      
      for (const idStr of params) {
        const id = validateTodoId(idStr, todos);
        const todo = todos.find(t => t.id === id);
        
        await app.delete_todo(id);
        removedTodos.push(todo);
        
        console.log(`🗑️  Removed: #${todo.id} - ${todo.description}`);
      }
      
      if (removedTodos.length > 0) {
        console.log(`\nRemoved ${removedTodos.length} todo(s).`);
      }
      
    } else {
      throw new Error('Please specify todo ID(s) to remove or use --done flag. Usage: remove <id1> [id2]... OR remove --done');
    }
    
  } catch (error) {
    console.error(`❌ Error removing todos: ${error.message}`);
    throw error;
  }
}

/**
 * Display help information for all commands
 * @param {string[]} args - Command arguments (unused)
 * @returns {void}
 */
function help(args) {
  const helpText = `
📚 Todo CLI Application Help

USAGE:
  todo <command> [options] [arguments]

COMMANDS:

  add <description> [--priority <level>]
    Add a new todo item
    
    Options:
      --priority    Set priority level (low, medium, high)
                   Default: medium
    
    Examples:
      todo add "Buy groceries"
      todo add "Finish project" --priority high

  list [--all] [--done]
    Display todo items
    
    Options:
      --all        Show all todos (completed and incomplete)
      --done       Show only completed todos
      (no flags)   Show only incomplete todos (default)
    
    Examples:
      todo list
      todo list --all
      todo list --done

  done <id1> [id2] [id3]...
    Mark one or more todos as completed
    
    Arguments:
      id           Todo ID number(s) to mark as done
    
    Examples:
      todo done 1
      todo done 1 3 5

  remove <id1> [id2]... | remove --done
    Remove todos by ID or remove all completed todos
    
    Options:
      --done       Remove all completed todos
    
    Arguments:
      id           Todo ID number(s) to remove
    
    Examples:
      todo remove 1
      todo remove 1 2 3
      todo remove --done

  help
    Show this help information

NOTES:
  • Todo IDs are displayed when listing todos
  • Use quotes around descriptions with spaces
  • Priority levels: low, medium, high
  • Completed todos show completion timestamp
  • Use --all flag to see both completed and incomplete todos

For more information, visit: https://github.com/your-repo/todo-cli
`;

  console.log(helpText);
}

// Export commands object
export default {
  add,
  list,
  done,
  remove,
  help
};