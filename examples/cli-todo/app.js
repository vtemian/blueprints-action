const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Constants
const TODOS_FILE = path.join(os.homedir(), '.todos.json');
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Load todos from the JSON file
 * @returns {Promise<Array>} Array of todo objects
 */
async function loadTodos() {
    try {
        const data = await fs.readFile(TODOS_FILE, 'utf8');
        
        // Handle empty file
        if (!data.trim()) {
            return [];
        }
        
        try {
            const todos = JSON.parse(data);
            
            // Validate that we have an array
            if (!Array.isArray(todos)) {
                throw new Error('Invalid data structure: expected array');
            }
            
            // Validate each todo structure
            const validTodos = todos.filter(todo => {
                return todo && 
                       typeof todo.id === 'number' && 
                       typeof todo.text === 'string' && 
                       typeof todo.done === 'boolean' &&
                       typeof todo.created === 'string' &&
                       typeof todo.priority === 'string' &&
                       VALID_PRIORITIES.includes(todo.priority);
            });
            
            return validTodos;
            
        } catch (parseError) {
            // Backup corrupted file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = `${TODOS_FILE}.backup-${timestamp}`;
            
            try {
                await fs.copyFile(TODOS_FILE, backupFile);
                console.warn(`Corrupted todos file backed up to: ${backupFile}`);
            } catch (backupError) {
                console.error('Failed to backup corrupted file:', backupError.message);
            }
            
            // Create new empty file
            await saveTodos([]);
            return [];
        }
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, create it
            await saveTodos([]);
            return [];
        } else if (error.code === 'EACCES') {
            throw new Error(`Permission denied: Cannot read todos file at ${TODOS_FILE}. Please check file permissions.`);
        } else {
            throw new Error(`Failed to load todos: ${error.message}`);
        }
    }
}

/**
 * Save todos array to the JSON file
 * @param {Array} todos - Array of todo objects to save
 * @returns {Promise<void>}
 */
async function saveTodos(todos) {
    // Validate input
    if (!Array.isArray(todos)) {
        throw new Error('Invalid input: todos must be an array');
    }
    
    // Validate each todo structure before saving
    for (const todo of todos) {
        if (!todo || 
            typeof todo.id !== 'number' || 
            typeof todo.text !== 'string' || 
            typeof todo.done !== 'boolean' ||
            typeof todo.created !== 'string' ||
            typeof todo.priority !== 'string' ||
            !VALID_PRIORITIES.includes(todo.priority)) {
            throw new Error(`Invalid todo structure: ${JSON.stringify(todo)}`);
        }
    }
    
    try {
        const data = JSON.stringify(todos, null, 2);
        await fs.writeFile(TODOS_FILE, data, 'utf8');
    } catch (error) {
        if (error.code === 'EACCES') {
            throw new Error(`Permission denied: Cannot write to todos file at ${TODOS_FILE}. Please check file permissions.`);
        } else if (error.code === 'ENOSPC') {
            throw new Error('No space left on device: Cannot save todos file.');
        } else {
            throw new Error(`Failed to save todos: ${error.message}`);
        }
    }
}

/**
 * Add a new todo item
 * @param {string} text - The todo text description
 * @param {string} priority - Priority level (low, medium, high)
 * @returns {Promise<Object>} The created todo object
 */
async function addTodo(text, priority = 'medium') {
    // Validate input
    if (typeof text !== 'string' || !text.trim()) {
        throw new Error('Todo text must be a non-empty string');
    }
    
    if (!VALID_PRIORITIES.includes(priority)) {
        throw new Error(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }
    
    const todos = await loadTodos();
    
    // Generate new ID (highest existing ID + 1, or 1 if no todos exist)
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
    await saveTodos(todos);
    
    return newTodo;
}

/**
 * Get a todo by ID
 * @param {number} id - The todo ID to find
 * @returns {Promise<Object|null>} The todo object or null if not found
 */
async function getTodo(id) {
    // Validate input
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error('ID must be a positive integer');
    }
    
    const todos = await loadTodos();
    const todo = todos.find(todo => todo.id === id);
    
    return todo || null;
}

/**
 * Update an existing todo
 * @param {number} id - The todo ID to update
 * @param {Object} changes - Object containing fields to update
 * @returns {Promise<Object|null>} The updated todo object or null if not found
 */
async function updateTodo(id, changes) {
    // Validate input
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error('ID must be a positive integer');
    }
    
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw new Error('Changes must be a valid object');
    }
    
    // Validate allowed fields and their types
    const allowedFields = ['text', 'done', 'priority'];
    const changeKeys = Object.keys(changes);
    
    if (changeKeys.length === 0) {
        throw new Error('No valid changes provided');
    }
    
    for (const key of changeKeys) {
        if (!allowedFields.includes(key)) {
            throw new Error(`Invalid field: ${key}. Allowed fields: ${allowedFields.join(', ')}`);
        }
        
        if (key === 'text' && (typeof changes[key] !== 'string' || !changes[key].trim())) {
            throw new Error('Text must be a non-empty string');
        }
        
        if (key === 'done' && typeof changes[key] !== 'boolean') {
            throw new Error('Done must be a boolean');
        }
        
        if (key === 'priority' && !VALID_PRIORITIES.includes(changes[key])) {
            throw new Error(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
        }
    }
    
    const todos = await loadTodos();
    const todoIndex = todos.findIndex(todo => todo.id === id);
    
    if (todoIndex === -1) {
        return null;
    }
    
    // Apply changes
    const updatedTodo = { ...todos[todoIndex] };
    
    for (const [key, value] of Object.entries(changes)) {
        if (key === 'text') {
            updatedTodo[key] = value.trim();
        } else {
            updatedTodo[key] = value;
        }
    }
    
    todos[todoIndex] = updatedTodo;
    await saveTodos(todos);
    
    return updatedTodo;
}

/**
 * Delete a todo by ID
 * @param {number} id - The todo ID to delete
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteTodo(id) {
    // Validate input
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error('ID must be a positive integer');
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
 * Filter todos by done status and/or priority
 * @param {Array} todos - Array of todos to filter
 * @param {boolean|null} done - Filter by done status (null for no filter)
 * @param {string|null} priority - Filter by priority (null for no filter)
 * @returns {Array} Filtered array of todos
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