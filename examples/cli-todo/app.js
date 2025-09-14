/**
 * Todo Storage Module
 * Handles persistent storage and core operations for todo items
 * Storage location: ~/.todos.json
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Configuration
const TODO_FILE = path.join(os.homedir(), '.todos.json');
const BACKUP_FILE = path.join(os.homedir(), '.todos.json.backup');
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Loads todos from the storage file
 * @returns {Promise<Array>} Array of todo objects
 * @throws {Error} If file operations fail
 */
async function loadTodos() {
    try {
        // Check if file exists
        try {
            await fs.access(TODO_FILE);
        } catch (error) {
            // File doesn't exist, create empty array
            await saveTodos([]);
            return [];
        }

        // Read file content
        const data = await fs.readFile(TODO_FILE, 'utf8');
        
        // Handle empty file
        if (!data.trim()) {
            await saveTodos([]);
            return [];
        }

        // Parse JSON with corruption handling
        try {
            const todos = JSON.parse(data);
            
            // Validate data structure
            if (!Array.isArray(todos)) {
                throw new Error('Invalid data structure: expected array');
            }

            // Validate each todo item
            todos.forEach((todo, index) => {
                if (!todo || typeof todo !== 'object') {
                    throw new Error(`Invalid todo at index ${index}: not an object`);
                }
                if (!todo.hasOwnProperty('id') || !todo.hasOwnProperty('text') || !todo.hasOwnProperty('done')) {
                    throw new Error(`Invalid todo at index ${index}: missing required fields`);
                }
            });

            return todos;
        } catch (parseError) {
            console.warn(`Corrupted todos file detected: ${parseError.message}`);
            
            // Backup corrupted file
            try {
                await fs.copyFile(TODO_FILE, BACKUP_FILE);
                console.log(`Corrupted file backed up to: ${BACKUP_FILE}`);
            } catch (backupError) {
                console.warn(`Failed to create backup: ${backupError.message}`);
            }

            // Create fresh file
            await saveTodos([]);
            return [];
        }
    } catch (error) {
        if (error.code === 'EACCES') {
            throw new Error(`Permission denied accessing todos file: ${TODO_FILE}`);
        } else if (error.code === 'ENOENT') {
            // Directory doesn't exist
            throw new Error(`Home directory not accessible: ${os.homedir()}`);
        }
        throw new Error(`Failed to load todos: ${error.message}`);
    }
}

/**
 * Saves todos array to the storage file
 * @param {Array} todos - Array of todo objects to save
 * @returns {Promise<void>}
 * @throws {Error} If file operations fail or todos is not an array
 */
async function saveTodos(todos) {
    // Validate input
    if (!Array.isArray(todos)) {
        throw new Error('Invalid input: todos must be an array');
    }

    try {
        // Create JSON string with pretty formatting
        const jsonData = JSON.stringify(todos, null, 2);
        
        // Write to temporary file first for atomic operation
        const tempFile = `${TODO_FILE}.tmp`;
        await fs.writeFile(tempFile, jsonData, 'utf8');
        
        // Rename temp file to actual file (atomic operation)
        await fs.rename(tempFile, TODO_FILE);
    } catch (error) {
        // Clean up temp file if it exists
        try {
            await fs.unlink(`${TODO_FILE}.tmp`);
        } catch (cleanupError) {
            // Ignore cleanup errors
        }

        if (error.code === 'EACCES') {
            throw new Error(`Permission denied writing to todos file: ${TODO_FILE}`);
        } else if (error.code === 'ENOSPC') {
            throw new Error('Insufficient disk space to save todos');
        }
        throw new Error(`Failed to save todos: ${error.message}`);
    }
}

/**
 * Adds a new todo item
 * @param {string} text - The todo description
 * @param {string} priority - Priority level (low, medium, high)
 * @returns {Promise<Object>} The created todo object
 * @throws {Error} If validation fails or save operation fails
 */
async function addTodo(text, priority = 'medium') {
    // Validate input
    if (!text || typeof text !== 'string' || !text.trim()) {
        throw new Error('Todo text is required and must be a non-empty string');
    }

    if (!VALID_PRIORITIES.includes(priority)) {
        throw new Error(`Invalid priority: ${priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    // Load existing todos
    const todos = await loadTodos();

    // Generate new ID
    const maxId = todos.length > 0 ? Math.max(...todos.map(todo => todo.id)) : 0;
    const newId = maxId + 1;

    // Create new todo
    const newTodo = {
        id: newId,
        text: text.trim(),
        done: false,
        created: new Date().toISOString(),
        priority: priority
    };

    // Add to array and save
    todos.push(newTodo);
    await saveTodos(todos);

    return newTodo;
}

/**
 * Retrieves a todo by ID
 * @param {number} id - The todo ID to find
 * @returns {Promise<Object|null>} The todo object or null if not found
 * @throws {Error} If ID is invalid or load operation fails
 */
async function getTodo(id) {
    // Validate input
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('Todo ID must be a positive integer');
    }

    const todos = await loadTodos();
    return todos.find(todo => todo.id === id) || null;
}

/**
 * Updates a todo with the provided changes
 * @param {number} id - The todo ID to update
 * @param {Object} changes - Object containing fields to update
 * @returns {Promise<Object>} The updated todo object
 * @throws {Error} If todo not found, validation fails, or save operation fails
 */
async function updateTodo(id, changes) {
    // Validate input
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('Todo ID must be a positive integer');
    }

    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw new Error('Changes must be a valid object');
    }

    // Validate changes
    if (changes.hasOwnProperty('text') && (!changes.text || typeof changes.text !== 'string' || !changes.text.trim())) {
        throw new Error('Todo text must be a non-empty string');
    }

    if (changes.hasOwnProperty('done') && typeof changes.done !== 'boolean') {
        throw new Error('Todo done status must be a boolean');
    }

    if (changes.hasOwnProperty('priority') && !VALID_PRIORITIES.includes(changes.priority)) {
        throw new Error(`Invalid priority: ${changes.priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    // Prevent modification of protected fields
    const protectedFields = ['id', 'created'];
    const invalidFields = Object.keys(changes).filter(field => protectedFields.includes(field));
    if (invalidFields.length > 0) {
        throw new Error(`Cannot modify protected fields: ${invalidFields.join(', ')}`);
    }

    // Load todos and find target
    const todos = await loadTodos();
    const todoIndex = todos.findIndex(todo => todo.id === id);

    if (todoIndex === -1) {
        throw new Error(`Todo with ID ${id} not found`);
    }

    // Apply changes
    const updatedTodo = { ...todos[todoIndex], ...changes };
    
    // Trim text if it was updated
    if (changes.hasOwnProperty('text')) {
        updatedTodo.text = changes.text.trim();
    }

    todos[todoIndex] = updatedTodo;
    await saveTodos(todos);

    return updatedTodo;
}

/**
 * Deletes a todo by ID
 * @param {number} id - The todo ID to delete
 * @returns {Promise<boolean>} True if deleted, false if not found
 * @throws {Error} If ID is invalid or save operation fails
 */
async function deleteTodo(id) {
    // Validate input
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('Todo ID must be a positive integer');
    }

    // Load todos and find target
    const todos = await loadTodos();
    const todoIndex = todos.findIndex(todo => todo.id === id);

    if (todoIndex === -1) {
        return false;
    }

    // Remove todo and save
    todos.splice(todoIndex, 1);
    await saveTodos(todos);

    return true;
}

/**
 * Filters todos based on completion status and/or priority
 * @param {Array} todos - Array of todos to filter
 * @param {boolean|null} done - Filter by completion status (null for all)
 * @param {string|null} priority - Filter by priority level (null for all)
 * @returns {Array} Filtered array of todos
 * @throws {Error} If validation fails
 */
function filterTodos(todos, done = null, priority = null) {
    // Validate input
    if (!Array.isArray(todos)) {
        throw new Error('Todos must be an array');
    }

    if (done !== null && typeof done !== 'boolean') {
        throw new Error('Done filter must be a boolean or null');
    }

    if (priority !== null && !VALID_PRIORITIES.includes(priority)) {
        throw new Error(`Invalid priority filter: ${priority}. Must be one of: ${VALID_PRIORITIES.join(', ')} or null`);
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
    filterTodos,
    // Export constants for testing/external use
    TODO_FILE,
    VALID_PRIORITIES
};