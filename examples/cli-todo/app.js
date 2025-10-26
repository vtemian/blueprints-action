import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

// Constants
const TODOS_FILE = path.join(os.homedir(), '.todos.json');
const BACKUP_SUFFIX = '.backup';
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Validates todo structure and required fields
 * @param {Object} todo - Todo object to validate
 * @throws {Error} If todo structure is invalid
 */
function validateTodo(todo) {
  if (!todo || typeof todo !== 'object') {
    throw new Error('Todo must be an object');
  }
  
  if (typeof todo.text !== 'string' || todo.text.trim() === '') {
    throw new Error('Todo text must be a non-empty string');
  }
  
  if (typeof todo.done !== 'boolean') {
    throw new Error('Todo done must be a boolean');
  }
  
  if (!VALID_PRIORITIES.includes(todo.priority)) {
    throw new Error(`Todo priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
  
  if (typeof todo.id !== 'number' || todo.id <= 0) {
    throw new Error('Todo id must be a positive number');
  }
  
  if (typeof todo.created !== 'string' || !isValidISODate(todo.created)) {
    throw new Error('Todo created must be a valid ISO 8601 date string');
  }
}

/**
 * Validates ISO 8601 date string
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid ISO 8601 date
 */
function isValidISODate(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date) && date.toISOString() === dateString;
}

/**
 * Validates priority value
 * @param {string} priority - Priority to validate
 * @throws {Error} If priority is invalid
 */
function validatePriority(priority) {
  if (!VALID_PRIORITIES.includes(priority)) {
    throw new Error(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
}

/**
 * Creates backup of corrupted todos file
 * @param {string} corruptedData - The corrupted JSON data
 */
async function createBackup(corruptedData) {
  try {
    const backupFile = TODOS_FILE + BACKUP_SUFFIX;
    await fs.writeFile(backupFile, corruptedData, 'utf8');
    console.warn(`Corrupted todos file backed up to: ${backupFile}`);
  } catch (error) {
    console.error('Failed to create backup of corrupted file:', error.message);
  }
}

/**
 * Generates next available ID for new todo
 * @param {Array} todos - Array of existing todos
 * @returns {number} Next available ID
 */
function generateNextId(todos) {
  if (!Array.isArray(todos) || todos.length === 0) {
    return 1;
  }
  
  const maxId = Math.max(...todos.map(todo => todo.id || 0));
  return maxId + 1;
}

/**
 * Asynchronously loads todos from the storage file
 * @returns {Promise<Array>} Array of todo objects
 * @throws {Error} If file operations fail due to permissions or other issues
 */
export async function loadTodos() {
  try {
    // Check if file exists
    await fs.access(TODOS_FILE);
    
    // Read file content
    const data = await fs.readFile(TODOS_FILE, 'utf8');
    
    // Handle empty file
    if (!data.trim()) {
      return [];
    }
    
    // Parse JSON
    let todos;
    try {
      todos = JSON.parse(data);
    } catch (parseError) {
      console.error('Corrupted JSON detected in todos file');
      await createBackup(data);
      
      // Recreate empty todos file
      await fs.writeFile(TODOS_FILE, '[]', 'utf8');
      return [];
    }
    
    // Validate that todos is an array
    if (!Array.isArray(todos)) {
      console.error('Invalid todos format: expected array');
      await createBackup(data);
      await fs.writeFile(TODOS_FILE, '[]', 'utf8');
      return [];
    }
    
    // Validate each todo structure
    const validTodos = [];
    for (const todo of todos) {
      try {
        validateTodo(todo);
        validTodos.push(todo);
      } catch (validationError) {
        console.warn(`Skipping invalid todo: ${validationError.message}`);
      }
    }
    
    return validTodos;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create it
      try {
        await fs.writeFile(TODOS_FILE, '[]', 'utf8');
        return [];
      } catch (createError) {
        throw new Error(`Failed to create todos file: ${createError.message}`);
      }
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied accessing todos file: ${TODOS_FILE}`);
    } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
      throw new Error('Too many open files. Please try again later.');
    } else {
      throw new Error(`Failed to load todos: ${error.message}`);
    }
  }
}

/**
 * Asynchronously saves todos array to the storage file
 * @param {Array} todos - Array of todo objects to save
 * @throws {Error} If todos array is invalid or file operations fail
 */
export async function saveTodos(todos) {
  if (!Array.isArray(todos)) {
    throw new Error('Todos must be an array');
  }
  
  // Validate all todos before saving
  for (const todo of todos) {
    validateTodo(todo);
  }
  
  try {
    const jsonData = JSON.stringify(todos, null, 2);
    await fs.writeFile(TODOS_FILE, jsonData, 'utf8');
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied writing to todos file: ${TODOS_FILE}`);
    } else if (error.code === 'ENOSPC') {
      throw new Error('Insufficient disk space to save todos');
    } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
      throw new Error('Too many open files. Please try again later.');
    } else {
      throw new Error(`Failed to save todos: ${error.message}`);
    }
  }
}

/**
 * Creates a new todo with auto-generated ID and timestamp
 * @param {string} text - Todo description text
 * @param {string} priority - Todo priority (low/medium/high), defaults to "medium"
 * @returns {Promise<Object>} The created todo object
 * @throws {Error} If parameters are invalid or save operation fails
 */
export async function addTodo(text, priority = 'medium') {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('Todo text must be a non-empty string');
  }
  
  validatePriority(priority);
  
  const todos = await loadTodos();
  const newTodo = {
    id: generateNextId(todos),
    text: text.trim(),
    done: false,
    created: new Date().toISOString(),
    priority: priority
  };
  
  todos.push(newTodo);
  await saveTodos(todos);
  
  return newTodo;
}

/**
 * Finds and returns a todo by its ID
 * @param {number} id - Todo ID to search for
 * @returns {Promise<Object|null>} Todo object if found, null otherwise
 * @throws {Error} If ID is invalid or load operation fails
 */
export async function getTodo(id) {
  if (typeof id !== 'number' || id <= 0) {
    throw new Error('Todo ID must be a positive number');
  }
  
  const todos = await loadTodos();
  return todos.find(todo => todo.id === id) || null;
}

/**
 * Updates specific fields of an existing todo
 * @param {number} id - ID of todo to update
 * @param {Object} changes - Object containing fields to update
 * @returns {Promise<Object|null>} Updated todo object if found, null otherwise
 * @throws {Error} If parameters are invalid or operations fail
 */
export async function updateTodo(id, changes) {
  if (typeof id !== 'number' || id <= 0) {
    throw new Error('Todo ID must be a positive number');
  }
  
  if (!changes || typeof changes !== 'object') {
    throw new Error('Changes must be an object');
  }
  
  // Validate changes object
  const allowedFields = ['text', 'done', 'priority'];
  const changeKeys = Object.keys(changes);
  
  if (changeKeys.length === 0) {
    throw new Error('Changes object cannot be empty');
  }
  
  for (const key of changeKeys) {
    if (!allowedFields.includes(key)) {
      throw new Error(`Invalid field: ${key}. Allowed fields: ${allowedFields.join(', ')}`);
    }
  }
  
  // Validate specific field types
  if ('text' in changes && (typeof changes.text !== 'string' || changes.text.trim() === '')) {
    throw new Error('Text must be a non-empty string');
  }
  
  if ('done' in changes && typeof changes.done !== 'boolean') {
    throw new Error('Done must be a boolean');
  }
  
  if ('priority' in changes) {
    validatePriority(changes.priority);
  }
  
  const todos = await loadTodos();
  const todoIndex = todos.findIndex(todo => todo.id === id);
  
  if (todoIndex === -1) {
    return null;
  }
  
  // Apply changes
  const updatedTodo = { ...todos[todoIndex] };
  
  if ('text' in changes) {
    updatedTodo.text = changes.text.trim();
  }
  
  if ('done' in changes) {
    updatedTodo.done = changes.done;
  }
  
  if ('priority' in changes) {
    updatedTodo.priority = changes.priority;
  }
  
  todos[todoIndex] = updatedTodo;
  await saveTodos(todos);
  
  return updatedTodo;
}

/**
 * Removes a todo by its ID
 * @param {number} id - ID of todo to delete
 * @returns {Promise<boolean>} True if todo was deleted, false if not found
 * @throws {Error} If ID is invalid or operations fail
 */
export async function deleteTodo(id) {
  if (typeof id !== 'number' || id <= 0) {
    throw new Error('Todo ID must be a positive number');
  }
  
  const todos = await loadTodos();
  const initialLength = todos.length;
  const filteredTodos = todos.filter(todo => todo.id !== id);
  
  if (filteredTodos.length === initialLength) {
    return false; // Todo not found
  }
  
  await saveTodos(filteredTodos);
  return true;
}

/**
 * Filters todos by completion status and/or priority
 * @param {Array} todos - Array of todos to filter
 * @param {boolean|null} done - Filter by completion status (null for no filter)
 * @param {string|null} priority - Filter by priority (null for no filter)
 * @returns {Array} Filtered array of todos
 * @throws {Error} If parameters are invalid
 */
export function filterTodos(todos, done = null, priority = null) {
  if (!Array.isArray(todos)) {
    throw new Error('Todos must be an array');
  }
  
  if (done !== null && typeof done !== 'boolean') {
    throw new Error('Done filter must be a boolean or null');
  }
  
  if (priority !== null && !VALID_PRIORITIES.includes(priority)) {
    throw new Error(`Priority filter must be one of: ${VALID_PRIORITIES.join(', ')}, or null`);
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