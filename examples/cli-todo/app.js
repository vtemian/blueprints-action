/**
 * Todo Storage and Core Operations Module
 * Handles persistent storage and CRUD operations for todos
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// File paths
const TODOS_FILE = path.join(os.homedir(), '.todos.json');
const BACKUP_FILE = path.join(os.homedir(), '.todos.json.backup');

// Valid priority levels
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Custom error classes for better error handling
 */
class TodoError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TodoError';
    this.code = code;
  }
}

class TodoNotFoundError extends TodoError {
  constructor(id) {
    super(`Todo with ID ${id} not found`, 'TODO_NOT_FOUND');
    this.name = 'TodoNotFoundError';
  }
}

class TodoValidationError extends TodoError {
  constructor(message) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'TodoValidationError';
  }
}

class TodoFileError extends TodoError {
  constructor(message, originalError) {
    super(message, 'FILE_ERROR');
    this.name = 'TodoFileError';
    this.originalError = originalError;
  }
}

/**
 * Validates todo structure
 * @param {Object} todo - Todo object to validate
 * @throws {TodoValidationError} If todo structure is invalid
 */
function validateTodo(todo) {
  if (!todo || typeof todo !== 'object') {
    throw new TodoValidationError('Todo must be an object');
  }

  if (typeof todo.id !== 'number' || todo.id <= 0) {
    throw new TodoValidationError('Todo ID must be a positive number');
  }

  if (typeof todo.text !== 'string' || todo.text.trim().length === 0) {
    throw new TodoValidationError('Todo text must be a non-empty string');
  }

  if (typeof todo.done !== 'boolean') {
    throw new TodoValidationError('Todo done status must be a boolean');
  }

  if (!todo.created || isNaN(new Date(todo.created).getTime())) {
    throw new TodoValidationError('Todo must have a valid created date');
  }

  if (!VALID_PRIORITIES.includes(todo.priority)) {
    throw new TodoValidationError(`Todo priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
}

/**
 * Validates an array of todos
 * @param {Array} todos - Array of todos to validate
 * @throws {TodoValidationError} If todos array is invalid
 */
function validateTodosArray(todos) {
  if (!Array.isArray(todos)) {
    throw new TodoValidationError('Todos must be an array');
  }

  todos.forEach((todo, index) => {
    try {
      validateTodo(todo);
    } catch (error) {
      throw new TodoValidationError(`Invalid todo at index ${index}: ${error.message}`);
    }
  });

  // Check for duplicate IDs
  const ids = todos.map(todo => todo.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    throw new TodoValidationError(`Duplicate todo IDs found: ${duplicateIds.join(', ')}`);
  }
}

/**
 * Sanitizes text input by trimming whitespace and limiting length
 * @param {string} text - Text to sanitize
 * @param {number} maxLength - Maximum allowed length (default: 500)
 * @returns {string} Sanitized text
 */
function sanitizeText(text, maxLength = 500) {
  if (typeof text !== 'string') {
    throw new TodoValidationError('Text must be a string');
  }

  const sanitized = text.trim();
  
  if (sanitized.length === 0) {
    throw new TodoValidationError('Text cannot be empty');
  }

  if (sanitized.length > maxLength) {
    throw new TodoValidationError(`Text cannot exceed ${maxLength} characters`);
  }

  return sanitized;
}

/**
 * Performs atomic file write operation
 * @param {string} filePath - Path to the file
 * @param {string} data - Data to write
 * @throws {TodoFileError} If file operation fails
 */
async function atomicWrite(filePath, data) {
  const tempFile = `${filePath}.tmp`;
  
  try {
    await fs.writeFile(tempFile, data, 'utf8');
    await fs.rename(tempFile, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempFile);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    throw new TodoFileError(`Failed to write file: ${error.message}`, error);
  }
}

/**
 * Loads todos from the JSON file
 * @returns {Promise<Array>} Array of todo objects
 * @throws {TodoFileError} If file operations fail
 * @throws {TodoValidationError} If data validation fails
 */
async function loadTodos() {
  try {
    // Check if file exists
    try {
      await fs.access(TODOS_FILE);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create empty array
        await saveTodos([]);
        return [];
      }
      throw error;
    }

    // Read file content
    const data = await fs.readFile(TODOS_FILE, 'utf8');
    
    // Handle empty file
    if (!data.trim()) {
      await saveTodos([]);
      return [];
    }

    let todos;
    try {
      todos = JSON.parse(data);
    } catch (parseError) {
      // Handle corrupted JSON
      console.warn('Corrupted todos file detected. Creating backup and recreating...');
      
      try {
        await fs.copyFile(TODOS_FILE, BACKUP_FILE);
        console.log(`Backup created at: ${BACKUP_FILE}`);
      } catch (backupError) {
        console.warn('Failed to create backup:', backupError.message);
      }

      // Recreate with empty array
      await saveTodos([]);
      return [];
    }

    // Validate loaded data
    validateTodosArray(todos);
    
    return todos;

  } catch (error) {
    if (error instanceof TodoValidationError) {
      throw error;
    }
    
    if (error.code === 'EACCES') {
      throw new TodoFileError('Permission denied. Check file permissions for todos file.', error);
    }
    
    if (error.code === 'ENOSPC') {
      throw new TodoFileError('No space left on device. Cannot read todos file.', error);
    }
    
    throw new TodoFileError(`Failed to load todos: ${error.message}`, error);
  }
}

/**
 * Saves todos array to the JSON file
 * @param {Array} todos - Array of todo objects to save
 * @throws {TodoFileError} If file operations fail
 * @throws {TodoValidationError} If data validation fails
 */
async function saveTodos(todos) {
  try {
    validateTodosArray(todos);
    
    const data = JSON.stringify(todos, null, 2);
    await atomicWrite(TODOS_FILE, data);
    
  } catch (error) {
    if (error instanceof TodoValidationError) {
      throw error;
    }
    
    if (error.code === 'EACCES') {
      throw new TodoFileError('Permission denied. Check write permissions for todos directory.', error);
    }
    
    if (error.code === 'ENOSPC') {
      throw new TodoFileError('No space left on device. Cannot save todos.', error);
    }
    
    throw new TodoFileError(`Failed to save todos: ${error.message}`, error);
  }
}

/**
 * Adds a new todo item
 * @param {string} text - Todo description
 * @param {string} priority - Priority level (low, medium, high)
 * @returns {Promise<Object>} The created todo object
 * @throws {TodoValidationError} If input validation fails
 * @throws {TodoFileError} If file operations fail
 */
async function addTodo(text, priority = 'medium') {
  try {
    const sanitizedText = sanitizeText(text);
    
    if (!VALID_PRIORITIES.includes(priority)) {
      throw new TodoValidationError(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    const todos = await loadTodos();
    
    // Generate new ID
    const maxId = todos.length > 0 ? Math.max(...todos.map(todo => todo.id)) : 0;
    const newId = maxId + 1;

    const newTodo = {
      id: newId,
      text: sanitizedText,
      done: false,
      created: new Date().toISOString(),
      priority: priority
    };

    todos.push(newTodo);
    await saveTodos(todos);
    
    return newTodo;

  } catch (error) {
    if (error instanceof TodoError) {
      throw error;
    }
    throw new TodoError(`Failed to add todo: ${error.message}`, 'ADD_ERROR');
  }
}

/**
 * Retrieves a todo by ID
 * @param {number} id - Todo ID to find
 * @returns {Promise<Object>} The found todo object
 * @throws {TodoNotFoundError} If todo with given ID doesn't exist
 * @throws {TodoValidationError} If ID is invalid
 * @throws {TodoFileError} If file operations fail
 */
async function getTodo(id) {
  try {
    if (typeof id !== 'number' || id <= 0) {
      throw new TodoValidationError('ID must be a positive number');
    }

    const todos = await loadTodos();
    const todo = todos.find(t => t.id === id);
    
    if (!todo) {
      throw new TodoNotFoundError(id);
    }
    
    return todo;

  } catch (error) {
    if (error instanceof TodoError) {
      throw error;
    }
    throw new TodoError(`Failed to get todo: ${error.message}`, 'GET_ERROR');
  }
}

/**
 * Updates an existing todo with new values
 * @param {number} id - Todo ID to update
 * @param {Object} changes - Object containing fields to update
 * @returns {Promise<Object>} The updated todo object
 * @throws {TodoNotFoundError} If todo with given ID doesn't exist
 * @throws {TodoValidationError} If validation fails
 * @throws {TodoFileError} If file operations fail
 */
async function updateTodo(id, changes) {
  try {
    if (typeof id !== 'number' || id <= 0) {
      throw new TodoValidationError('ID must be a positive number');
    }

    if (!changes || typeof changes !== 'object') {
      throw new TodoValidationError('Changes must be an object');
    }

    // Validate change fields
    const allowedFields = ['text', 'done', 'priority'];
    const invalidFields = Object.keys(changes).filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      throw new TodoValidationError(`Invalid fields: ${invalidFields.join(', ')}. Allowed fields: ${allowedFields.join(', ')}`);
    }

    const todos = await loadTodos();
    const todoIndex = todos.findIndex(t => t.id === id);
    
    if (todoIndex === -1) {
      throw new TodoNotFoundError(id);
    }

    const todo = { ...todos[todoIndex] };

    // Apply and validate changes
    if (changes.text !== undefined) {
      todo.text = sanitizeText(changes.text);
    }

    if (changes.done !== undefined) {
      if (typeof changes.done !== 'boolean') {
        throw new TodoValidationError('Done status must be a boolean');
      }
      todo.done = changes.done;
    }

    if (changes.priority !== undefined) {
      if (!VALID_PRIORITIES.includes(changes.priority)) {
        throw new TodoValidationError(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
      }
      todo.priority = changes.priority;
    }

    // Validate the updated todo
    validateTodo(todo);

    todos[todoIndex] = todo;
    await saveTodos(todos);
    
    return todo;

  } catch (error) {
    if (error instanceof TodoError) {
      throw error;
    }
    throw new TodoError(`Failed to update todo: ${error.message}`, 'UPDATE_ERROR');
  }
}

/**
 * Deletes a todo by ID
 * @param {number} id - Todo ID to delete
 * @returns {Promise<Object>} The deleted todo object
 * @throws {TodoNotFoundError} If todo with given ID doesn't exist
 * @throws {TodoValidationError} If ID is invalid
 * @throws {TodoFileError} If file operations fail
 */
async function deleteTodo(id) {
  try {
    if (typeof id !== 'number' || id <= 0) {
      throw new TodoValidationError('ID must be a positive number');
    }

    const todos = await loadTodos();
    const todoIndex = todos.findIndex(t => t.id === id);
    
    if (todoIndex === -1) {
      throw new TodoNotFoundError(id);
    }

    const deletedTodo = todos[todoIndex];
    todos.splice(todoIndex, 1);
    
    await saveTodos(todos);
    
    return deletedTodo;

  } catch (error) {
    if (error instanceof TodoError) {
      throw error;
    }
    throw new TodoError(`Failed to delete todo: ${error.message}`, 'DELETE_ERROR');
  }
}

/**
 * Filters todos based on completion status and/or priority
 * @param {Array} todos - Array of todos to filter
 * @param {boolean|null} done - Filter by completion status (null for all)
 * @param {string|null} priority - Filter by priority level (null for all)
 * @returns {Array} Filtered array of todos
 * @throws {TodoValidationError} If filter parameters are invalid
 */
function filterTodos(todos, done = null, priority = null) {
  try {
    validateTodosArray(todos);

    if (done !== null && typeof done !== 'boolean') {
      throw new TodoValidationError('Done filter must be a boolean or null');
    }

    if (priority !== null && !VALID_PRIORITIES.includes(priority)) {
      throw new TodoValidationError(`Priority filter must be one of: ${VALID_PRIORITIES.join(', ')} or null`);
    }

    return todos.filter(todo => {
      if (done !== null && todo.done !== done) {
        return false;
      }
      
      if (priority !== null && todo.priority !== priority) {
        return false;
      }
      
      return true;
    });

  } catch (error) {
    if (error instanceof TodoError) {
      throw error;
    }
    throw new TodoError(`Failed to filter todos: ${error.message}`, 'FILTER_ERROR');
  }
}

// Export all functions and error classes
module.exports = {
  // Core functions
  loadTodos,