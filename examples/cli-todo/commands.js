/**
 * CLI Commands Module
 * Handles all command-line operations for the todo application
 */

import app from './app.js';
import utils from './utils.js';

/**
 * Adds a new todo item to the list
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
export const add = async (args) => {
  try {
    // Parse priority flag
    const priorityIndex = args.findIndex(arg => arg === '--priority');
    let priority = 'normal';
    let textArgs = [...args];

    if (priorityIndex !== -1) {
      if (priorityIndex + 1 < args.length) {
        priority = args[priorityIndex + 1];
        // Remove priority flag and its value from text args
        textArgs.splice(priorityIndex, 2);
      } else {
        throw new Error('Priority flag requires a value');
      }
    }

    // Join remaining arguments as task text
    const text = textArgs.join(' ').trim();
    
    if (!text) {
      throw new Error('Task description is required');
    }

    // Validate priority value
    const validPriorities = ['low', 'normal', 'high'];
    if (!validPriorities.includes(priority.toLowerCase())) {
      throw new Error(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
    }

    const todo = await app.add_todo(text, priority.toLowerCase());
    console.log(`Added: #${todo.id} - ${todo.text}`);

  } catch (error) {
    console.error(`Error adding todo: ${error.message}`);
  }
};

/**
 * Lists todos based on specified filters
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
export const list = async (args) => {
  try {
    // Parse flags
    const showAll = args.includes('--all');
    const showDone = args.includes('--done');

    const todos = await app.load_todos();

    if (!todos || todos.length === 0) {
      console.log('No todos found.');
      return;
    }

    // Filter todos based on flags
    let filteredTodos = todos;
    if (showDone) {
      filteredTodos = todos.filter(todo => todo.done);
    } else if (!showAll) {
      filteredTodos = todos.filter(todo => !todo.done);
    }

    if (filteredTodos.length === 0) {
      const filterType = showDone ? 'completed' : showAll ? '' : 'incomplete';
      console.log(`No ${filterType} todos found.`.trim());
      return;
    }

    // Format todos for display
    const formattedTodos = filteredTodos.map(todo => ({
      ID: todo.id,
      Status: todo.done ? '[✓]' : '[ ]',
      Priority: todo.priority ? todo.priority.toUpperCase() : 'NORMAL',
      Task: todo.text,
      Created: todo.created_at ? new Date(todo.created_at).toLocaleDateString() : 'N/A',
      Completed: todo.done && todo.completed_at ? new Date(todo.completed_at).toLocaleDateString() : ''
    }));

    console.log(utils.format_table(formattedTodos));

  } catch (error) {
    console.error(`Error listing todos: ${error.message}`);
  }
};

/**
 * Marks one or more todos as completed
 * @param {string[]} args - Command line arguments (todo IDs)
 * @returns {Promise<void>}
 */
export const done = async (args) => {
  try {
    if (args.length === 0) {
      throw new Error('At least one todo ID is required');
    }

    const todos = await app.load_todos();
    const completedTodos = [];

    for (const arg of args) {
      const id = parseInt(arg, 10);
      
      if (isNaN(id)) {
        console.error(`Invalid ID: "${arg}" is not a number`);
        continue;
      }

      const todo = todos.find(t => t.id === id);
      if (!todo) {
        console.error(`Todo with ID ${id} not found`);
        continue;
      }

      if (todo.done) {
        console.log(`Todo #${id} is already completed`);
        continue;
      }

      // Mark as done and add timestamp
      todo.done = true;
      todo.completed_at = new Date().toISOString();
      completedTodos.push(todo);
    }

    if (completedTodos.length > 0) {
      await app.save_todos(todos);
      
      completedTodos.forEach(todo => {
        console.log(`Completed: #${todo.id} - ${todo.text}`);
      });
    }

  } catch (error) {
    console.error(`Error marking todos as done: ${error.message}`);
  }
};

/**
 * Removes todos by ID or removes all completed todos
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
export const remove = async (args) => {
  try {
    const removeDone = args.includes('--done');

    if (removeDone) {
      // Remove all completed todos
      const todos = await app.load_todos();
      const completedTodos = todos.filter(todo => todo.done);
      
      if (completedTodos.length === 0) {
        console.log('No completed todos to remove.');
        return;
      }

      const remainingTodos = todos.filter(todo => !todo.done);
      await app.save_todos(remainingTodos);
      
      console.log(`Removed ${completedTodos.length} completed todo(s)`);
      completedTodos.forEach(todo => {
        console.log(`Removed: #${todo.id} - ${todo.text}`);
      });

    } else {
      // Remove specific todo by ID
      if (args.length === 0) {
        throw new Error('Todo ID is required (or use --done flag to remove all completed todos)');
      }

      const id = parseInt(args[0], 10);
      if (isNaN(id)) {
        throw new Error(`Invalid ID: "${args[0]}" is not a number`);
      }

      const todos = await app.load_todos();
      const todoIndex = todos.findIndex(t => t.id === id);
      
      if (todoIndex === -1) {
        throw new Error(`Todo with ID ${id} not found`);
      }

      const removedTodo = todos[todoIndex];
      await app.delete_todo(id);
      
      console.log(`Removed: #${removedTodo.id} - ${removedTodo.text}`);
    }

  } catch (error) {
    console.error(`Error removing todo: ${error.message}`);
  }
};

/**
 * Displays help information for all available commands
 * @param {string[]} args - Command line arguments (unused)
 * @returns {void}
 */
export const help = (args) => {
  const helpText = `
Todo CLI - Command Line Task Manager

USAGE:
  todo <command> [options] [arguments]

COMMANDS:
  add <text> [--priority <level>]    Add a new todo item
                                     Priority levels: low, normal, high
                                     Example: todo add "Buy groceries" --priority high

  list [--all] [--done]             List todo items
                                     --all: Show all todos (completed and incomplete)
                                     --done: Show only completed todos
                                     Default: Show only incomplete todos
                                     Example: todo list --all

  done <id> [id2] [id3] ...         Mark todo(s) as completed
                                     Accepts multiple IDs separated by spaces
                                     Example: todo done 1 3 5

  remove <id>                       Remove a specific todo by ID
         --done                     Remove all completed todos
                                     Example: todo remove 2
                                     Example: todo remove --done

  help                              Show this help message

EXAMPLES:
  todo add "Complete project documentation"
  todo add "Call dentist" --priority high
  todo list
  todo list --all
  todo done 1
  todo done 1 2 3
  todo remove 5
  todo remove --done

STATUS INDICATORS:
  [✓] - Completed todo
  [ ] - Incomplete todo

For more information, visit: https://github.com/your-repo/todo-cli
`;

  console.log(helpText);
};

/**
 * Parses command line flags and returns their values
 * @param {string[]} args - Command line arguments
 * @param {string} flag - Flag to search for (e.g., '--priority')
 * @returns {string|null} - Flag value or null if not found
 */
const parseFlag = (args, flag) => {
  const flagIndex = args.findIndex(arg => arg === flag);
  if (flagIndex !== -1 && flagIndex + 1 < args.length) {
    return args[flagIndex + 1];
  }
  return null;
};

/**
 * Validates that a todo ID is a positive integer
 * @param {string} id - ID to validate
 * @returns {number} - Parsed ID
 * @throws {Error} - If ID is invalid
 */
const validateTodoId = (id) => {
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId) || parsedId <= 0) {
    throw new Error(`Invalid todo ID: "${id}". ID must be a positive number.`);
  }
  return parsedId;
};

// Export all command functions
export default {
  add,
  list,
  done,
  remove,
  help
};