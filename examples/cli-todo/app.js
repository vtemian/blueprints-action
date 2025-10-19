/**
 * Todo Storage Module
 * Handles todo storage and core operations with persistent file storage
 * 
 * @example
 * const todoApp = require('./app.js');
 * 
 * async function example() {
 *   await todoApp.add_todo("Complete project", "high");
 *   const todos = await todoApp.load_todos();
 *   console.log(todos);
 * }
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Configuration
const TODOS_FILE = path.join(os.homedir(), '.todos.json');
const BACKUP_FILE = path.join(os.homedir(), '.todos.json.backup');

/**
 * Validates todo structure
 * @param {Object} todo - Todo object to validate
 * @returns {boolean} - True if valid todo structure
 */
function validateTodo(todo) {
  return (
    todo &&
    typeof todo === 'object' &&
    typeof todo.id === 'number' &&
    typeof todo.text === 'string' &&
    typeof todo.done === 'boolean' &&
    typeof todo.created === 'string' &&
    typeof todo.priority === 'string' &&
    ['low', 'medium', 'high'].includes(todo.priority)
  );
}

/**
 * Ensures atomic file write using temporary file
 * @param {string} filePath - Target file path
 * @param {string} data - Data to write
 */
async function atomicWrite(filePath, data) {
  const tempFile = `${filePath}.tmp.${Date.now()}`;
  try {
    await fs.writeFile(tempFile, data, 'utf8');
    await fs.rename(tempFile, filePath);
  } catch (error) {
    // Cleanup temp file if it exists
    try {
      await fs.unlink(tempFile);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Creates backup of corrupted file and returns empty todos array
 * @param {string} corruptedData - The corrupted JSON data
 * @returns {Array} - Empty todos array
 */
async function handleCorruptedFile(corruptedData) {
  try {
    await atomicWrite(BACKUP_FILE, corruptedData);
    console.warn(`Corrupted todos file backed up to: ${BACKUP_FILE}`);
  } catch (backupError) {
    console.error('Failed to create backup of corrupted file:', backupError.message);
  }
  
  // Create fresh empty todos file
  const emptyTodos = [];
  await save_todos(emptyTodos);
  return emptyTodos;
}

/**
 * Load todos from file system
 * @returns {Promise<Array>} Array of todo objects
 * @throws {Error} For file permission or other filesystem errors
 */
async function load_todos() {
  try {
    const data = await fs.readFile(TODOS_FILE, 'utf8');
    
    if (!data.trim()) {
      return [];
    }
    
    let todos;
    try {
      todos = JSON.parse(data);
    } catch (parseError) {
      console.error('JSON parse error, handling corrupted file:', parseError.message);
      return await handleCorruptedFile(data);
    }
    
    // Validate todos array structure
    if (!Array.isArray(todos)) {
      console.error('Invalid todos format: not an array');
      return await handleCorruptedFile(data);
    }
    
    // Validate each todo and filter out invalid ones
    const validTodos = todos.filter(todo => {
      const isValid = validateTodo(todo);
      if (!isValid) {
        console.warn('Removing invalid todo:', todo);
      }
      return isValid;
    });
    
    // If we filtered out invalid todos, save the cleaned version
    if (validTodos.length !== todos.length) {
      await save_todos(validTodos);
    }
    
    return validTodos;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create empty todos file
      const emptyTodos = [];
      await save_todos(emptyTodos);
      return emptyTodos;
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied accessing todos file: ${TODOS_FILE}`);
    } else {
      throw new Error(`Failed to load todos: ${error.message}`);
    }
  }
}

/**
 * Save todos array to file system
 * @param {Array} todos - Array of todo objects to save
 * @throws {Error} For validation or file system errors
 */
async function save_todos(todos) {
  // Input validation
  if (!Array.isArray(todos)) {
    throw new Error('Todos must be an array');
  }
  
  // Validate each todo
  for (const todo of todos) {
    if (!validateTodo(todo)) {
      throw new Error(`Invalid todo structure: ${JSON.stringify(todo)}`);
    }
  }
  
  try {
    const jsonData = JSON.stringify(todos, null, 2);
    await atomicWrite(TODOS_FILE, jsonData);
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied writing to todos file: ${TODOS_FILE}`);
    } else {
      throw new Error(`Failed to save todos: ${error.message}`);
    }
  }
}

/**
 * Add a new todo item
 * @param {string} text - Todo description text
 * @param {string} priority - Priority level: 'low', 'medium', or 'high'
 * @returns {Promise<Object>} The created todo object
 * @throws {Error} For validation or file system errors
 */
async function add_todo(text, priority = 'medium') {
  // Input validation
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Todo text must be a non-empty string');
  }
  
  if (!['low', 'medium', 'high'].includes(priority)) {
    throw new Error('Priority must be one of: low, medium, high');
  }
  
  const todos = await load_todos();
  
  // Generate new ID (max existing ID + 1, or 1 if no todos exist)
  const maxId = todos.length > 0 ? Math.max(...todos.map(todo => todo.id)) : 0;
  const newId = maxId + 1;
  
  const newTodo = {
    id: newId,
    text: text.trim(),
    done: false,
    created: new Date().toISOString(),
    priority: priority
  };
  
  todos.push(newTodo);
  await save_todos(todos);
  
  return newTodo;
}

/**
 * Get a todo by ID
 * @param {number} id - Todo ID to find
 * @returns {Promise<Object|null>} Todo object or null if not found
 * @throws {Error} For validation or file system errors
 */
async function get_todo(id) {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error('Todo ID must be a positive integer');
  }
  
  const todos = await load_todos();
  const todo = todos.find(todo => todo.id === id);
  
  return todo || null;
}

/**
 * Update an existing todo
 * @param {number} id - Todo ID to update
 * @param {Object} changes - Object containing fields to update
 * @returns {Promise<Object|null>} Updated todo object or null if not found
 * @throws {Error} For validation or file system errors
 */
async function update_todo(id, changes) {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error('Todo ID must be a positive integer');
  }
  
  if (!changes || typeof changes !== 'object') {
    throw new Error('Changes must be an object');
  }
  
  // Validate change fields
  const allowedFields = ['text', 'done', 'priority'];
  const changeKeys = Object.keys(changes);
  
  for (const key of changeKeys) {
    if (!allowedFields.includes(key)) {
      throw new Error(`Invalid field for update: ${key}. Allowed fields: ${allowedFields.join(', ')}`);
    }
  }
  
  // Validate specific field types and values
  if (changes.text !== undefined && (typeof changes.text !== 'string' || changes.text.trim().length === 0)) {
    throw new Error('Text must be a non-empty string');
  }
  
  if (changes.done !== undefined && typeof changes.done !== 'boolean') {
    throw new Error('Done must be a boolean');
  }
  
  if (changes.priority !== undefined && !['low', 'medium', 'high'].includes(changes.priority)) {
    throw new Error('Priority must be one of: low, medium, high');
  }
  
  const todos = await load_todos();
  const todoIndex = todos.findIndex(todo => todo.id === id);
  
  if (todoIndex === -1) {
    return null;
  }
  
  // Apply changes
  const updatedTodo = { ...todos[todoIndex] };
  
  if (changes.text !== undefined) {
    updatedTodo.text = changes.text.trim();
  }
  if (changes.done !== undefined) {
    updatedTodo.done = changes.done;
  }
  if (changes.priority !== undefined) {
    updatedTodo.priority = changes.priority;
  }
  
  todos[todoIndex] = updatedTodo;
  await save_todos(todos);
  
  return updatedTodo;
}

/**
 * Delete a todo by ID
 * @param {number} id - Todo ID to delete
 * @returns {Promise<boolean>} True if deleted, false if not found
 * @throws {Error} For validation or file system errors
 */
async function delete_todo(id) {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error('Todo ID must be a positive integer');
  }
  
  const todos = await load_todos();
  const initialLength = todos.length;
  const filteredTodos = todos.filter(todo => todo.id !== id);
  
  if (filteredTodos.length === initialLength) {
    return false; // Todo not found
  }
  
  await save_todos(filteredTodos);
  return true;
}

/**
 * Filter todos by completion status and/or priority
 * @param {Array} todos - Array of todos to filter
 * @param {boolean|null} done - Filter by completion status (null for no filter)
 * @param {string|null} priority - Filter by priority level (null for no filter)
 * @returns {Array} Filtered array of todos
 * @throws {Error} For validation errors
 */
function filter_todos(todos, done = null, priority = null) {
  if (!Array.isArray(todos)) {
    throw new Error('Todos must be an array');
  }
  
  if (done !== null && typeof done !== 'boolean') {
    throw new Error('Done filter must be a boolean or null');
  }
  
  if (priority !== null && !['low', 'medium', 'high'].includes(priority)) {
    throw new Error('Priority filter must be one of: low, medium, high, or null');
  }
  
  return todos.filter(todo => {
    // Filter by done status
    if (done !== null && todo.done !== done) {
      return false;
    }
    
    // Filter by priority
    if (priority !== null && todo.priority !== priority) {
      return false;
    }
    
    return true;
  });
}

// Export all functions
module.exports = {
  load_todos,
  save_todos,
  add_todo,
  get_todo,
  update_todo,
  delete_todo,
  filter_todos
};