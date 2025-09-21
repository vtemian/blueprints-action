import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Constants
const TODOS_FILE = join(homedir(), '.todos.json');
const BACKUP_FILE = join(homedir(), '.todos.json.backup');
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Validates todo structure
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
    throw new Error('Todo done status must be a boolean');
  }
  
  if (todo.priority && !VALID_PRIORITIES.includes(todo.priority)) {
    throw new Error(`Todo priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
}

/**
 * Validates an array of todos
 * @param {Array} todos - Array of todos to validate
 * @throws {Error} If todos array is invalid
 */
function validateTodosArray(todos) {
  if (!Array.isArray(todos)) {
    throw new Error('Todos must be an array');
  }
  
  todos.forEach((todo, index) => {
    try {
      validateTodo(todo);
      if (typeof todo.id !== 'number' || todo.id <= 0) {
        throw new Error('Todo ID must be a positive number');
      }
    } catch (error) {
      throw new Error(`Invalid todo at index ${index}: ${error.message}`);
    }
  });
}

/**
 * Creates a backup of the current todos file
 * @param {string} corruptedData - The corrupted JSON data to backup
 */
async function createBackup(corruptedData) {
  try {
    await fs.writeFile(BACKUP_FILE, corruptedData, 'utf8');
    console.warn(`Corrupted todos file backed up to: ${BACKUP_FILE}`);
  } catch (error) {
    console.error('Failed to create backup of corrupted todos file:', error.message);
  }
}

/**
 * Loads todos from the file system
 * @returns {Promise<Array>} Array of todo objects
 * @throws {Error} If file operations fail due to permissions or other critical errors
 */
export async function loadTodos() {
  try {
    const data = await fs.readFile(TODOS_FILE, 'utf8');
    
    if (data.trim() === '') {
      console.warn('Todos file is empty, initializing with empty array');
      return [];
    }
    
    let todos;
    try {
      todos = JSON.parse(data);
    } catch (parseError) {
      console.error('Corrupted JSON detected, creating backup and reinitializing');
      await createBackup(data);
      return [];
    }
    
    try {
      validateTodosArray(todos);
      return todos;
    } catch (validationError) {
      console.error('Invalid todos structure detected, creating backup and reinitializing');
      await createBackup(data);
      return [];
    }
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty array
      return [];
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied accessing todos file: ${TODOS_FILE}`);
    } else {
      throw new Error(`Failed to load todos: ${error.message}`);
    }
  }
}

/**
 * Saves todos array to the file system
 * @param {Array} todos - Array of todo objects to save
 * @throws {Error} If validation fails or file operations fail
 */
export async function saveTodos(todos) {
  if (!Array.isArray(todos)) {
    throw new Error('Todos must be an array');
  }
  
  // Validate all todos before saving
  validateTodosArray(todos);
  
  const jsonData = JSON.stringify(todos, null, 2);
  
  try {
    // Atomic write: write to temporary file first, then rename
    const tempFile = `${TODOS_FILE}.tmp`;
    await fs.writeFile(tempFile, jsonData, 'utf8');
    await fs.rename(tempFile, TODOS_FILE);
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied writing to todos file: ${TODOS_FILE}`);
    } else if (error.code === 'ENOSPC') {
      throw new Error('Insufficient disk space to save todos');
    } else {
      throw new Error(`Failed to save todos: ${error.message}`);
    }
  }
}

/**
 * Adds a new todo item
 * @param {string} text - Todo description text
 * @param {string} priority - Todo priority (low, medium, high)
 * @returns {Promise<Object>} The created todo object
 * @throws {Error} If parameters are invalid or save operation fails
 */
export async function addTodo(text, priority = 'medium') {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('Todo text must be a non-empty string');
  }
  
  if (!VALID_PRIORITIES.includes(priority)) {
    throw new Error(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
  
  const todos = await loadTodos();
  
  // Generate new ID (highest existing ID + 1, or 1 if no todos exist)
  const maxId = todos.length > 0 ? Math.max(...todos.map(todo => todo.id)) : 0;
  
  const newTodo = {
    id: maxId + 1,
    text: text.trim(),
    done: false,
    created: new Date().toISOString(),
    priority
  };
  
  todos.push(newTodo);
  await saveTodos(todos);
  
  return newTodo;
}

/**
 * Retrieves a todo by ID
 * @param {number} id - Todo ID to find
 * @returns {Promise<Object|null>} Todo object or null if not found
 * @throws {Error} If ID is invalid or load operation fails
 */
export async function getTodo(id) {
  if (typeof id !== 'number' || id <= 0 || !Number.isInteger(id)) {
    throw new Error('Todo ID must be a positive integer');
  }
  
  const todos = await loadTodos();
  return todos.find(todo => todo.id === id) || null;
}

/**
 * Updates a todo with new values
 * @param {number} id - Todo ID to update
 * @param {Object} changes - Object containing fields to update
 * @returns {Promise<Object|null>} Updated todo object or null if not found
 * @throws {Error} If parameters are invalid or save operation fails
 */
export async function updateTodo(id, changes) {
  if (typeof id !== 'number' || id <= 0 || !Number.isInteger(id)) {
    throw new Error('Todo ID must be a positive integer');
  }
  
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new Error('Changes must be an object');
  }
  
  const allowedFields = ['text', 'done', 'priority'];
  const changeKeys = Object.keys(changes);
  
  if (changeKeys.length === 0) {
    throw new Error('Changes object cannot be empty');
  }
  
  // Validate that only allowed fields are being changed
  const invalidFields = changeKeys.filter(key => !allowedFields.includes(key));
  if (invalidFields.length > 0) {
    throw new Error(`Invalid fields in changes: ${invalidFields.join(', ')}. Allowed fields: ${allowedFields.join(', ')}`);
  }
  
  // Validate individual field values
  if ('text' in changes && (typeof changes.text !== 'string' || changes.text.trim() === '')) {
    throw new Error('Text must be a non-empty string');
  }
  
  if ('done' in changes && typeof changes.done !== 'boolean') {
    throw new Error('Done status must be a boolean');
  }
  
  if ('priority' in changes && !VALID_PRIORITIES.includes(changes.priority)) {
    throw new Error(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
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
 * Deletes a todo by ID
 * @param {number} id - Todo ID to delete
 * @returns {Promise<boolean>} True if deleted, false if not found
 * @throws {Error} If ID is invalid or save operation fails
 */
export async function deleteTodo(id) {
  if (typeof id !== 'number' || id <= 0 || !Number.isInteger(id)) {
    throw new Error('Todo ID must be a positive integer');
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
 * @param {boolean|null} done - Filter by completion status (null for all)
 * @param {string|null} priority - Filter by priority (null for all)
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
    const matchesDone = done === null || todo.done === done;
    const matchesPriority = priority === null || todo.priority === priority;
    return matchesDone && matchesPriority;
  });
}