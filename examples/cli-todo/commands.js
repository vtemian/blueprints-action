/**
 * CLI Commands Module for Todo List Operations
 * 
 * This module provides a comprehensive set of command-line interface functions
 * for managing todo items with proper error handling, validation, and formatting.
 * 
 * @module commands
 * @version 1.0.0
 */

import app from '@app';
import utils from '@utils';
import { DateTime } from 'datetime';

// Constants for formatting and validation
const PRIORITY_LEVELS = ['low', 'medium', 'high'];
const ID_REGEX = /^\d+$/;
const FLAG_REGEX = /^--([a-zA-Z]+)(?:=(.+))?$/;

/**
 * Helper function to parse command line arguments and flags
 * @param {string[]} args - Array of command line arguments
 * @returns {Object} Parsed arguments object with text, flags, and ids
 */
const parseArguments = (args) => {
  const result = {
    text: [],
    flags: {},
    ids: []
  };

  if (!Array.isArray(args)) {
    return result;
  }

  args.forEach(arg => {
    const flagMatch = arg.match(FLAG_REGEX);
    
    if (flagMatch) {
      const [, flagName, flagValue] = flagMatch;
      result.flags[flagName] = flagValue || true;
    } else if (ID_REGEX.test(arg)) {
      result.ids.push(parseInt(arg, 10));
    } else {
      result.text.push(arg);
    }
  });

  return result;
};

/**
 * Validates if a todo ID exists in the todos array
 * @param {number} id - Todo ID to validate
 * @param {Array} todos - Array of todo items
 * @returns {boolean} True if ID exists, false otherwise
 */
const validateTodoId = (id, todos) => {
  return todos.some(todo => todo.id === id);
};

/**
 * Formats todo items for display in table format
 * @param {Array} todos - Array of todo items
 * @param {boolean} showAll - Whether to show all todos or just active ones
 * @returns {string} Formatted table string
 */
const formatTodoTable = (todos, showAll = false) => {
  if (!todos || todos.length === 0) {
    return 'No todos found.';
  }

  const filteredTodos = showAll ? todos : todos.filter(todo => !todo.completed);
  
  if (filteredTodos.length === 0) {
    return showAll ? 'No todos found.' : 'No active todos. Use --all to see completed items.';
  }

  const maxIdWidth = Math.max(2, ...filteredTodos.map(t => t.id.toString().length));
  const maxDescWidth = Math.max(11, ...filteredTodos.map(t => t.description.length));
  
  let output = `${'ID'.padEnd(maxIdWidth)} | Status | ${'Description'.padEnd(maxDescWidth)} | Priority | Created\n`;
  output += `${'-'.repeat(maxIdWidth)}-|--------|${'-'.repeat(maxDescWidth)}-|----------|--------\n`;
  
  filteredTodos.forEach(todo => {
    const status = todo.completed ? '[✓]' : '[ ]';
    const priority = todo.priority || 'medium';
    const created = todo.createdAt ? DateTime.fromISO(todo.createdAt).toFormat('MM/dd/yy') : 'N/A';
    
    output += `${todo.id.toString().padEnd(maxIdWidth)} | ${status.padEnd(6)} | ${todo.description.padEnd(maxDescWidth)} | ${priority.padEnd(8)} | ${created}\n`;
  });
  
  return output;
};

/**
 * Displays error message with consistent formatting
 * @param {string} message - Error message to display
 * @param {Error} [error] - Optional error object for debugging
 */
const displayError = (message, error = null) => {
  console.error(`❌ Error: ${message}`);
  if (error && process.env.NODE_ENV === 'development') {
    console.error('Debug info:', error.message);
  }
};

/**
 * Displays success message with consistent formatting
 * @param {string} message - Success message to display
 */
const displaySuccess = (message) => {
  console.log(`✅ ${message}`);
};

/**
 * Add a new todo item
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
export const add = async (args) => {
  try {
    const { text, flags } = parseArguments(args);
    
    if (text.length === 0) {
      displayError('Todo description is required. Usage: add "Task description" [--priority=high|medium|low]');
      return;
    }

    const description = text.join(' ').trim();
    const priority = flags.priority || 'medium';

    // Validate priority level
    if (!PRIORITY_LEVELS.includes(priority.toLowerCase())) {
      displayError(`Invalid priority level. Use: ${PRIORITY_LEVELS.join(', ')}`);
      return;
    }

    const todoData = {
      description,
      priority: priority.toLowerCase(),
      completed: false,
      createdAt: DateTime.now().toISO()
    };

    const newTodo = await app.add_todo(todoData);
    displaySuccess(`Added: #${newTodo.id} - ${newTodo.description}`);

  } catch (error) {
    displayError('Failed to add todo item', error);
  }
};

/**
 * List todo items with optional filtering
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
export const list = async (args) => {
  try {
    const { flags } = parseArguments(args);
    const todos = await app.load_todos();

    if (!todos || todos.length === 0) {
      console.log('No todos found. Add some todos to get started!');
      return;
    }

    let filteredTodos = todos;

    // Apply filters based on flags
    if (flags.done) {
      filteredTodos = todos.filter(todo => todo.completed);
      if (filteredTodos.length === 0) {
        console.log('No completed todos found.');
        return;
      }
    } else if (!flags.all) {
      filteredTodos = todos.filter(todo => !todo.completed);
      if (filteredTodos.length === 0) {
        console.log('No active todos found. Use --all to see completed items.');
        return;
      }
    }

    console.log(formatTodoTable(filteredTodos, flags.all || flags.done));

  } catch (error) {
    displayError('Failed to load todos', error);
  }
};

/**
 * Mark todo items as completed
 * @param {string[]} args - Command line arguments containing todo IDs
 * @returns {Promise<void>}
 */
export const done = async (args) => {
  try {
    const { ids } = parseArguments(args);

    if (ids.length === 0) {
      displayError('Todo ID(s) required. Usage: done 1 [2 3 ...]');
      return;
    }

    const todos = await app.load_todos();
    const completedTodos = [];
    const invalidIds = [];

    // Validate all IDs first
    ids.forEach(id => {
      if (!validateTodoId(id, todos)) {
        invalidIds.push(id);
      }
    });

    if (invalidIds.length > 0) {
      displayError(`Invalid todo ID(s): ${invalidIds.join(', ')}`);
      return;
    }

    // Mark todos as completed
    for (const id of ids) {
      const todo = todos.find(t => t.id === id);
      if (todo && !todo.completed) {
        todo.completed = true;
        todo.completedAt = DateTime.now().toISO();
        completedTodos.push(todo);
      }
    }

    if (completedTodos.length === 0) {
      console.log('Selected todos are already completed.');
      return;
    }

    await app.save_todos(todos);

    // Display success messages
    completedTodos.forEach(todo => {
      displaySuccess(`Completed: #${todo.id} - ${todo.description}`);
    });

  } catch (error) {
    displayError('Failed to mark todos as completed', error);
  }
};

/**
 * Remove todo items
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
export const remove = async (args) => {
  try {
    const { ids, flags } = parseArguments(args);
    const todos = await app.load_todos();

    if (todos.length === 0) {
      console.log('No todos to remove.');
      return;
    }

    let todosToRemove = [];

    if (flags.done) {
      // Remove all completed todos
      todosToRemove = todos.filter(todo => todo.completed);
      if (todosToRemove.length === 0) {
        console.log('No completed todos to remove.');
        return;
      }
    } else if (ids.length > 0) {
      // Remove specific todos by ID
      const invalidIds = [];
      
      ids.forEach(id => {
        const todo = todos.find(t => t.id === id);
        if (todo) {
          todosToRemove.push(todo);
        } else {
          invalidIds.push(id);
        }
      });

      if (invalidIds.length > 0) {
        displayError(`Invalid todo ID(s): ${invalidIds.join(', ')}`);
        return;
      }
    } else {
      displayError('Todo ID(s) required or use --done flag. Usage: remove 1 [2 3 ...] or remove --done');
      return;
    }

    // Remove todos
    for (const todo of todosToRemove) {
      await app.delete_todo(todo.id);
      displaySuccess(`Removed: #${todo.id} - ${todo.description}`);
    }

  } catch (error) {
    displayError('Failed to remove todos', error);
  }
};

/**
 * Display help information
 * @param {string[]} args - Command line arguments (unused)
 * @returns {void}
 */
export const help = (args) => {
  const helpText = `
📝 Todo CLI - Command Reference

USAGE:
  todo <command> [arguments] [flags]

COMMANDS:
  add <description>     Add a new todo item
  list                  Show todo items
  done <id> [id...]     Mark todo(s) as completed
  remove <id> [id...]   Remove todo item(s)
  help                  Show this help message

FLAGS:
  --priority=<level>    Set priority (high, medium, low) [add command]
  --all                 Show all todos including completed [list command]
  --done                Show only completed todos [list command]
                        Remove all completed todos [remove command]

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
  todo help

NOTES:
  • Todo IDs are automatically assigned
  • Priorities default to 'medium' if not specified
  • Use quotes around descriptions with spaces
  • Multiple IDs can be specified for done/remove commands
`;

  console.log(helpText);
};

// Export all command functions
export default {
  add,
  list,
  done,
  remove,
  help
};