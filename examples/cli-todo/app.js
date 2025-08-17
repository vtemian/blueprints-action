/**
 * Todo Storage and Core Operations Module
 * Handles persistent storage of todos in ~/.todos.json with comprehensive error handling
 */

const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Constants
const TODOS_FILENAME = '.todos.json';
const BACKUP_SUFFIX = '.backup';
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const DEFAULT_PRIORITY = 'medium';

// File paths
const TODOS_FILE_PATH = path.join(os.homedir(), TODOS_FILENAME);
const BACKUP_FILE_PATH = TODOS_FILE_PATH + BACKUP_SUFFIX;

/**
 * Validates if a todo object has the correct structure
 * @param {Object} todo - Todo object to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidTodo(todo) {
    return (
        todo &&
        typeof todo === 'object' &&
        typeof todo.id === 'number' &&
        typeof todo.text === 'string' &&
        typeof todo.done === 'boolean' &&
        typeof todo.created === 'string' &&
        typeof todo.priority === 'string' &&
        VALID_PRIORITIES.includes(todo.priority)
    );
}

/**
 * Validates priority value
 * @param {string} priority - Priority to validate
 * @returns {boolean} - True if valid priority
 */
function isValidPriority(priority) {
    return VALID_PRIORITIES.includes(priority);
}

/**
 * Generates the next available ID for a new todo
 * @param {Array} todos - Array of existing todos
 * @returns {number} - Next sequential ID
 */
function generateNextId(todos) {
    if (!Array.isArray(todos) || todos.length === 0) {
        return 1;
    }
    
    const maxId = Math.max(...todos.map(todo => todo.id || 0));
    return maxId + 1;
}

/**
 * Creates a backup of the corrupted todos file
 * @param {string} corruptedData - The corrupted JSON data
 */
async function createBackup(corruptedData) {
    try {
        await fs.writeFile(BACKUP_FILE_PATH, corruptedData, 'utf8');
        console.warn(`Corrupted todos file backed up to: ${BACKUP_FILE_PATH}`);
    } catch (error) {
        console.error('Failed to create backup of corrupted file:', error.message);
    }
}

/**
 * Loads todos from the JSON file with comprehensive error handling
 * @returns {Promise<Array>} - Array of todo objects
 * @throws {Error} - For file permission or other critical errors
 */
async function loadTodos() {
    try {
        const data = await fs.readFile(TODOS_FILE_PATH, 'utf8');
        
        // Handle empty file
        if (!data.trim()) {
            console.warn('Todos file is empty, starting with empty array');
            return [];
        }

        let todos;
        try {
            todos = JSON.parse(data);
        } catch (parseError) {
            console.error('JSON parsing failed:', parseError.message);
            await createBackup(data);
            console.warn('Starting with empty todos array due to corrupted file');
            return [];
        }

        // Validate that todos is an array
        if (!Array.isArray(todos)) {
            console.warn('Todos file does not contain an array, starting fresh');
            await createBackup(data);
            return [];
        }

        // Filter out invalid todos and log warnings
        const validTodos = todos.filter((todo, index) => {
            const valid = isValidTodo(todo);
            if (!valid) {
                console.warn(`Invalid todo at index ${index}, skipping:`, todo);
            }
            return valid;
        });

        if (validTodos.length !== todos.length) {
            console.warn(`Filtered out ${todos.length - validTodos.length} invalid todos`);
        }

        return validTodos;

    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return empty array
            console.info('Todos file does not exist, starting with empty array');
            return [];
        } else if (error.code === 'EACCES') {
            throw new Error(`Permission denied accessing todos file: ${TODOS_FILE_PATH}`);
        } else {
            throw new Error(`Failed to load todos: ${error.message}`);
        }
    }
}

/**
 * Saves todos array to the JSON file
 * @param {Array} todos - Array of todo objects to save
 * @returns {Promise<void>}
 * @throws {Error} - For validation or file operation errors
 */
async function saveTodos(todos) {
    // Input validation
    if (!Array.isArray(todos)) {
        throw new Error('Todos must be an array');
    }

    // Validate all todos
    const invalidTodos = todos.filter(todo => !isValidTodo(todo));
    if (invalidTodos.length > 0) {
        throw new Error(`Cannot save invalid todos: ${invalidTodos.length} invalid entries found`);
    }

    try {
        const jsonData = JSON.stringify(todos, null, 2);
        await fs.writeFile(TODOS_FILE_PATH, jsonData, 'utf8');
    } catch (error) {
        if (error.code === 'EACCES') {
            throw new Error(`Permission denied writing to todos file: ${TODOS_FILE_PATH}`);
        } else if (error.code === 'ENOSPC') {
            throw new Error('Insufficient disk space to save todos');
        } else {
            throw new Error(`Failed to save todos: ${error.message}`);
        }
    }
}

/**
 * Adds a new todo to the list
 * @param {string} text - Todo description text
 * @param {string} [priority="medium"] - Todo priority (low, medium, high)
 * @returns {Promise<Object>} - The created todo object
 * @throws {Error} - For validation or save errors
 */
async function addTodo(text, priority = DEFAULT_PRIORITY) {
    // Input validation
    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Todo text must be a non-empty string');
    }

    if (!isValidPriority(priority)) {
        throw new Error(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    try {
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
    } catch (error) {
        throw new Error(`Failed to add todo: ${error.message}`);
    }
}

/**
 * Retrieves a todo by its ID
 * @param {number} id - Todo ID to search for
 * @returns {Promise<Object|null>} - Todo object or null if not found
 * @throws {Error} - For validation or load errors
 */
async function getTodo(id) {
    // Input validation
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error('Todo ID must be a positive integer');
    }

    try {
        const todos = await loadTodos();
        return todos.find(todo => todo.id === id) || null;
    } catch (error) {
        throw new Error(`Failed to get todo: ${error.message}`);
    }
}

/**
 * Updates specific fields of an existing todo
 * @param {number} id - Todo ID to update
 * @param {Object} changes - Object containing fields to update
 * @returns {Promise<Object|null>} - Updated todo object or null if not found
 * @throws {Error} - For validation or save errors
 */
async function updateTodo(id, changes) {
    // Input validation
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error('Todo ID must be a positive integer');
    }

    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw new Error('Changes must be a non-null object');
    }

    // Validate change fields
    const allowedFields = ['text', 'done', 'priority'];
    const changeKeys = Object.keys(changes);
    
    if (changeKeys.length === 0) {
        throw new Error('No changes provided');
    }

    const invalidFields = changeKeys.filter(key => !allowedFields.includes(key));
    if (invalidFields.length > 0) {
        throw new Error(`Invalid fields: ${invalidFields.join(', ')}. Allowed: ${allowedFields.join(', ')}`);
    }

    // Validate specific field types and values
    if ('text' in changes && (typeof changes.text !== 'string' || changes.text.trim().length === 0)) {
        throw new Error('Text must be a non-empty string');
    }

    if ('done' in changes && typeof changes.done !== 'boolean') {
        throw new Error('Done must be a boolean');
    }

    if ('priority' in changes && !isValidPriority(changes.priority)) {
        throw new Error(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    try {
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
    } catch (error) {
        throw new Error(`Failed to update todo: ${error.message}`);
    }
}

/**
 * Deletes a todo by its ID
 * @param {number} id - Todo ID to delete
 * @returns {Promise<boolean>} - True if deleted, false if not found
 * @throws {Error} - For validation or save errors
 */
async function deleteTodo(id) {
    // Input validation
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error('Todo ID must be a positive integer');
    }

    try {
        const todos = await loadTodos();
        const initialLength = todos.length;
        const filteredTodos = todos.filter(todo => todo.id !== id);
        
        if (filteredTodos.length === initialLength) {
            return false; // Todo not found
        }

        await saveTodos(filteredTodos);
        return true;
    } catch (error) {
        throw new Error(`Failed to delete todo: ${error.message}`);
    }
}

/**
 * Filters todos by completion status and/or priority
 * @param {Array} todos - Array of todos to filter
 * @param {boolean|null} [done=null] - Filter by completion status (null for all)
 * @param {string|null} [priority=null] - Filter by priority (null for all)
 * @returns {Array} - Filtered array of todos
 * @throws {Error} - For validation errors
 */
function filterTodos(todos, done = null, priority = null) {
    // Input validation
    if (!Array.isArray(todos)) {
        throw new Error('Todos must be an array');
    }

    if (done !== null && typeof done !== 'boolean') {
        throw new Error('Done filter must be a boolean or null');
    }

    if (priority !== null && !isValidPriority(priority)) {
        throw new Error(`Invalid priority filter. Must be one of: ${VALID_PRIORITIES.join(', ')} or null`);
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
    loadTodos,
    saveTodos,
    addTodo,
    getTodo,
    updateTodo,
    deleteTodo,
    filterTodos
};