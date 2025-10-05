import { app } from './app.js';
import { utils } from './utils.js';

/**
 * Parses command line arguments to extract flags and remaining arguments
 * @param {string[]} args - Array of command line arguments
 * @returns {Object} Object containing flags and remaining arguments
 */
function parseArgs(args) {
  const flags = {};
  const remaining = [];
  
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const flagName = arg.slice(2);
      flags[flagName] = true;
    } else {
      remaining.push(arg);
    }
  }
  
  return { flags, remaining };
}

/**
 * Parses priority flag from arguments and removes it from the text
 * @param {string[]} args - Array of arguments
 * @returns {Object} Object containing priority and cleaned text
 */
function parsePriorityAndText(args) {
  const { flags, remaining } = parseArgs(args);
  const priority = flags.priority ? 'high' : 'normal';
  const text = remaining.join(' ').trim();
  
  return { priority, text };
}

/**
 * Validates that a todo ID exists in the todos array
 * @param {number} id - Todo ID to validate
 * @param {Array} todos - Array of todos
 * @returns {boolean} True if ID exists
 */
function validateTodoId(id, todos) {
  return todos.some(todo => todo.id === parseInt(id));
}

/**
 * Gets current timestamp in ISO format
 * @returns {string} Current timestamp
 */
function getCurrentTimestamp() {
  return new Date().toISOString();
}

/**
 * Adds a new todo item
 * @param {string[]} args - Command arguments
 * @returns {Promise<string>} Success or error message
 */
async function add(args) {
  try {
    if (args.length === 0) {
      return 'Error: Please provide a task description';
    }

    const { priority, text } = parsePriorityAndText(args);
    
    if (!text) {
      return 'Error: Task description cannot be empty';
    }

    const todo = await app.add_todo(text, priority);
    return `Added: #${todo.id} - ${todo.text}`;
  } catch (error) {
    return `Error adding todo: ${error.message}`;
  }
}

/**
 * Lists todo items with optional filtering
 * @param {string[]} args - Command arguments
 * @returns {Promise<string>} Formatted todo list or error message
 */
async function list(args) {
  try {
    const { flags } = parseArgs(args);
    const todos = await app.load_todos();

    if (todos.length === 0) {
      return 'No todos found. Use "add" command to create your first todo.';
    }

    let filteredTodos = todos;

    if (flags.done) {
      filteredTodos = todos.filter(todo => todo.done);
    } else if (!flags.all) {
      filteredTodos = todos.filter(todo => !todo.done);
    }

    if (filteredTodos.length === 0) {
      const filterType = flags.done ? 'completed' : 'pending';
      return `No ${filterType} todos found.`;
    }

    const tableData = filteredTodos.map(todo => ({
      ID: todo.id,
      Status: todo.done ? '[✓]' : '[ ]',
      Task: todo.text,
      Priority: todo.priority || 'normal',
      Created: todo.created ? new Date(todo.created).toLocaleDateString() : 'N/A',
      Completed: todo.done && todo.completed ? new Date(todo.completed).toLocaleDateString() : ''
    }));

    return utils.format_table(tableData);
  } catch (error) {
    return `Error loading todos: ${error.message}`;
  }
}

/**
 * Marks one or more todos as completed
 * @param {string[]} args - Command arguments containing todo IDs
 * @returns {Promise<string>} Success or error message
 */
async function done(args) {
  try {
    if (args.length === 0) {
      return 'Error: Please provide at least one todo ID';
    }

    const todos = await app.load_todos();
    const ids = args.map(arg => parseInt(arg)).filter(id => !isNaN(id));

    if (ids.length === 0) {
      return 'Error: Please provide valid todo IDs (numbers only)';
    }

    const results = [];
    const errors = [];
    const timestamp = getCurrentTimestamp();

    for (const id of ids) {
      if (!validateTodoId(id, todos)) {
        errors.push(`Todo #${id} not found`);
        continue;
      }

      const todo = todos.find(t => t.id === id);
      if (todo.done) {
        errors.push(`Todo #${id} is already completed`);
        continue;
      }

      todo.done = true;
      todo.completed = timestamp;
      results.push(`Completed: #${todo.id} - ${todo.text}`);
    }

    if (results.length > 0) {
      await app.save_todos(todos);
    }

    const output = [];
    if (results.length > 0) {
      output.push(...results);
    }
    if (errors.length > 0) {
      output.push('Errors:', ...errors);
    }

    return output.join('\n');
  } catch (error) {
    return `Error marking todos as done: ${error.message}`;
  }
}

/**
 * Removes a specific todo or all completed todos
 * @param {string[]} args - Command arguments
 * @returns {Promise<string>} Success or error message
 */
async function remove(args) {
  try {
    const { flags, remaining } = parseArgs(args);
    const todos = await app.load_todos();

    if (flags.done) {
      const completedTodos = todos.filter(todo => todo.done);
      
      if (completedTodos.length === 0) {
        return 'No completed todos to remove';
      }

      const remainingTodos = todos.filter(todo => !todo.done);
      await app.save_todos(remainingTodos);
      
      return `Removed ${completedTodos.length} completed todo(s)`;
    }

    if (remaining.length === 0) {
      return 'Error: Please provide a todo ID or use --done flag';
    }

    const id = parseInt(remaining[0]);
    if (isNaN(id)) {
      return 'Error: Please provide a valid todo ID (number)';
    }

    if (!validateTodoId(id, todos)) {
      return `Error: Todo #${id} not found`;
    }

    const todoToRemove = todos.find(todo => todo.id === id);
    await app.delete_todo(id);
    
    return `Removed: #${todoToRemove.id} - ${todoToRemove.text}`;
  } catch (error) {
    return `Error removing todo: ${error.message}`;
  }
}

/**
 * Displays help information for all commands
 * @param {string[]} args - Command arguments (unused)
 * @returns {string} Help text
 */
function help(args) {
  return `
Todo Application - Command Reference

USAGE:
  todo <command> [arguments] [flags]

COMMANDS:

  add <description> [--priority]
    Add a new todo item
    Examples:
      todo add "Buy groceries"
      todo add "Important meeting" --priority

  list [--all] [--done]
    List todo items
    --all    Show all todos (completed and pending)
    --done   Show only completed todos
    Default: Show only pending todos
    Examples:
      todo list
      todo list --all
      todo list --done

  done <id> [id2] [id3] ...
    Mark one or more todos as completed
    Examples:
      todo done 1
      todo done 1 2 3

  remove <id>
  remove --done
    Remove a specific todo by ID, or all completed todos
    Examples:
      todo remove 1
      todo remove --done

  help
    Show this help message

EXAMPLES:
  todo add "Learn JavaScript"
  todo add "Deploy application" --priority
  todo list
  todo done 1
  todo list --all
  todo remove --done
  todo help

For more information, visit: https://github.com/your-repo/todo-cli
`;
}

export const commands = {
  add,
  list,
  done,
  remove,
  help
};