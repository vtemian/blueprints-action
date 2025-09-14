/**
 * CLI Commands Module for Todo Application
 * Provides command functions for managing todos via command line interface
 */

import { add_todo, load_todos, delete_todo, save_todos } from '@app';
import { format_table } from '@utils';
import { DateTime } from 'luxon'; // Using luxon for datetime operations

/**
 * Parse command line arguments into flags and remaining args
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed flags and remaining arguments
 */
const parseArgs = (args) => {
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
};

/**
 * Validate that todo IDs exist in the loaded todos
 * @param {number[]} ids - Array of todo IDs to validate
 * @param {Object[]} todos - Array of todo objects
 * @returns {Object} Validation result with valid/invalid IDs
 */
const validateTodoIds = (ids, todos) => {
  const validIds = [];
  const invalidIds = [];
  
  ids.forEach(id => {
    const todo = todos.find(t => t.id === id);
    if (todo) {
      validIds.push({ id, todo });
    } else {
      invalidIds.push(id);
    }
  });
  
  return { validIds, invalidIds };
};

/**
 * Add a new todo item
 * @param {string[]} args - Command arguments
 */
export const add = async (args) => {
  try {
    const { flags, remaining } = parseArgs(args);
    
    // Join remaining arguments as todo text
    const text = remaining.join(' ').trim();
    
    if (!text) {
      console.error('Error: Todo text cannot be empty');
      console.log('Usage: todo add "Task description" [--priority high|medium|low]');
      return;
    }
    
    // Extract priority with default value
    const priority = flags.priority || 'medium';
    
    // Validate priority value
    const validPriorities = ['low', 'medium', 'high'];
    if (!validPriorities.includes(priority.toLowerCase())) {
      console.error(`Error: Invalid priority "${priority}". Must be one of: ${validPriorities.join(', ')}`);
      return;
    }
    
    // Add the todo
    const newTodo = await add_todo({
      text,
      priority: priority.toLowerCase(),
      done: false,
      created_at: DateTime.now().toISO()
    });
    
    console.log(`Added: #${newTodo.id} - ${newTodo.text}`);
    
  } catch (error) {
    console.error(`Error adding todo: ${error.message}`);
  }
};

/**
 * List todos with optional filtering
 * @param {string[]} args - Command arguments
 */
export const list = async (args) => {
  try {
    const { flags } = parseArgs(args);
    
    // Load all todos
    const todos = await load_todos();
    
    if (!todos || todos.length === 0) {
      console.log('No todos found. Add some with: todo add "Task description"');
      return;
    }
    
    // Filter todos based on flags
    let filteredTodos = todos;
    
    if (flags.done) {
      filteredTodos = todos.filter(todo => todo.done);
    } else if (!flags.all) {
      // Default: show incomplete todos only
      filteredTodos = todos.filter(todo => !todo.done);
    }
    
    if (filteredTodos.length === 0) {
      const filterMsg = flags.done ? 'completed' : flags.all ? '' : 'incomplete';
      console.log(`No ${filterMsg} todos found.`);
      return;
    }
    
    // Prepare data for table formatting
    const tableData = filteredTodos.map(todo => ({
      ID: todo.id,
      Status: todo.done ? '[✓]' : '[ ]',
      Task: todo.text,
      Priority: todo.priority.toUpperCase(),
      Created: DateTime.fromISO(todo.created_at).toFormat('yyyy-MM-dd HH:mm'),
      ...(todo.done && todo.completed_at && {
        Completed: DateTime.fromISO(todo.completed_at).toFormat('yyyy-MM-dd HH:mm')
      })
    }));
    
    // Display formatted table
    console.log(format_table(tableData));
    
    // Show summary
    const totalCount = todos.length;
    const doneCount = todos.filter(t => t.done).length;
    const pendingCount = totalCount - doneCount;
    
    console.log(`\nSummary: ${totalCount} total, ${doneCount} completed, ${pendingCount} pending`);
    
  } catch (error) {
    console.error(`Error listing todos: ${error.message}`);
  }
};

/**
 * Mark todos as completed
 * @param {string[]} args - Command arguments containing todo IDs
 */
export const done = async (args) => {
  try {
    const { remaining } = parseArgs(args);
    
    if (remaining.length === 0) {
      console.error('Error: Please specify one or more todo IDs');
      console.log('Usage: todo done 1 2 3');
      return;
    }
    
    // Parse and validate IDs
    const ids = remaining.map(arg => {
      const id = parseInt(arg, 10);
      if (isNaN(id)) {
        throw new Error(`Invalid ID: "${arg}". IDs must be numbers.`);
      }
      return id;
    });
    
    // Load todos and validate IDs
    const todos = await load_todos();
    const { validIds, invalidIds } = validateTodoIds(ids, todos);
    
    if (invalidIds.length > 0) {
      console.error(`Error: Invalid todo IDs: ${invalidIds.join(', ')}`);
      return;
    }
    
    // Mark todos as done
    const completedAt = DateTime.now().toISO();
    let updatedCount = 0;
    
    validIds.forEach(({ todo }) => {
      if (!todo.done) {
        todo.done = true;
        todo.completed_at = completedAt;
        updatedCount++;
        console.log(`Completed: #${todo.id} - ${todo.text}`);
      } else {
        console.log(`Already completed: #${todo.id} - ${todo.text}`);
      }
    });
    
    if (updatedCount > 0) {
      await save_todos(todos);
      console.log(`\n${updatedCount} todo(s) marked as completed.`);
    }
    
  } catch (error) {
    console.error(`Error marking todos as done: ${error.message}`);
  }
};

/**
 * Remove todos by ID or remove all completed todos
 * @param {string[]} args - Command arguments
 */
export const remove = async (args) => {
  try {
    const { flags, remaining } = parseArgs(args);
    
    if (flags.done) {
      // Remove all completed todos
      const todos = await load_todos();
      const completedTodos = todos.filter(todo => todo.done);
      
      if (completedTodos.length === 0) {
        console.log('No completed todos to remove.');
        return;
      }
      
      console.log(`Found ${completedTodos.length} completed todo(s):`);
      completedTodos.forEach(todo => {
        console.log(`  #${todo.id} - ${todo.text}`);
      });
      
      // In a real CLI, you might want to add confirmation prompt here
      console.log('\nRemoving all completed todos...');
      
      for (const todo of completedTodos) {
        await delete_todo(todo.id);
        console.log(`Removed: #${todo.id} - ${todo.text}`);
      }
      
      console.log(`\n${completedTodos.length} completed todo(s) removed.`);
      
    } else {
      // Remove specific todo by ID
      if (remaining.length === 0) {
        console.error('Error: Please specify a todo ID or use --done flag');
        console.log('Usage: todo remove 1  OR  todo remove --done');
        return;
      }
      
      if (remaining.length > 1) {
        console.error('Error: Please specify only one todo ID');
        return;
      }
      
      const id = parseInt(remaining[0], 10);
      if (isNaN(id)) {
        console.error(`Error: Invalid ID "${remaining[0]}". ID must be a number.`);
        return;
      }
      
      // Load todos and validate ID
      const todos = await load_todos();
      const todo = todos.find(t => t.id === id);
      
      if (!todo) {
        console.error(`Error: Todo with ID ${id} not found.`);
        return;
      }
      
      // Delete the todo
      await delete_todo(id);
      console.log(`Removed: #${id} - ${todo.text}`);
    }
    
  } catch (error) {
    console.error(`Error removing todo: ${error.message}`);
  }
};

/**
 * Display help information
 * @param {string[]} args - Command arguments (unused)
 */
export const help = (args) => {
  const helpText = `
Todo CLI Application - Help

USAGE:
  todo <command> [arguments] [flags]

COMMANDS:
  add <text>              Add a new todo item
  list                    List todos (incomplete by default)
  done <id> [id...]       Mark todo(s) as completed
  remove <id>             Remove a specific todo
  remove --done           Remove all completed todos
  help                    Show this help message

FLAGS:
  --priority <level>      Set priority when adding (low|medium|high)
  --all                   Show all todos when listing
  --done                  Show only completed todos when listing
                         OR remove all completed todos when removing

EXAMPLES:
  todo add "Buy groceries"
  todo add "Finish project" --priority high
  todo list
  todo list --all
  todo list --done
  todo done 1
  todo done 1 2 3
  todo remove 1
  todo remove --done

NOTES:
  - Todo IDs are automatically assigned when created
  - Use quotes around todo text if it contains spaces
  - Priority defaults to 'medium' if not specified
  - List command shows incomplete todos by default
  - Completed todos show completion timestamp
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