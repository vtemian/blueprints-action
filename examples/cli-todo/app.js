const fs = require('fs');
const path = require('path');
const os = require('os');

// Constants
const TODOS_FILE = path.join(os.homedir(), '.todos.json');
const BACKUP_FILE = path.join(os.homedir(), '.todos.json.backup');
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Load todos from the JSON file
 * @returns {Array} Array of todo objects
 * @throws {Error} If file operations fail
 */
function loadTodos() {
    try {
        // Check if file exists
        if (!fs.existsSync(TODOS_FILE)) {
            // Create empty todos file
            saveTodos([]);
            return [];
        }

        const data = fs.readFileSync(TODOS_FILE, 'utf8');
        
        // Handle empty file
        if (!data.trim()) {
            return [];
        }

        const todos = JSON.parse(data);
        
        // Validate that todos is an array
        if (!Array.isArray(todos)) {
            throw new Error('Invalid todos format: expected array');
        }

        return todos;
    } catch (error) {
        if (error instanceof SyntaxError) {
            // JSON is corrupted, create backup and start fresh
            console.warn('Corrupted todos file detected. Creating backup...');
            try {
                fs.copyFileSync(TODOS_FILE, BACKUP_FILE);
                console.log(`Backup created at ${BACKUP_FILE}`);
            } catch (backupError) {
                console.error('Failed to create backup:', backupError.message);
            }
            
            // Initialize with empty array
            saveTodos([]);
            return [];
        }
        
        throw new Error(`Failed to load todos: ${error.message}`);
    }
}

/**
 * Save todos array to the JSON file
 * @param {Array} todos - Array of todo objects
 * @throws {Error} If file operations fail or input is invalid
 */
function saveTodos(todos) {
    if (!Array.isArray(todos)) {
        throw new Error('Invalid input: todos must be an array');
    }

    try {
        const data = JSON.stringify(todos, null, 2);
        fs.writeFileSync(TODOS_FILE, data, 'utf8');
    } catch (error) {
        throw new Error(`Failed to save todos: ${error.message}`);
    }
}

/**
 * Generate unique ID for new todo
 * @param {Array} todos - Existing todos array
 * @returns {number} Unique ID
 */
function generateId(todos) {
    if (todos.length === 0) {
        return 1;
    }
    
    const maxId = Math.max(...todos.map(todo => todo.id || 0));
    return maxId + 1;
}

/**
 * Validate todo text input
 * @param {string} text - Todo text to validate
 * @throws {Error} If text is invalid
 */
function validateTodoText(text) {
    if (typeof text !== 'string') {
        throw new Error('Todo text must be a string');
    }
    
    if (!text.trim()) {
        throw new Error('Todo text cannot be empty');
    }
}

/**
 * Validate priority input
 * @param {string} priority - Priority to validate
 * @throws {Error} If priority is invalid
 */
function validatePriority(priority) {
    if (typeof priority !== 'string') {
        throw new Error('Priority must be a string');
    }
    
    if (!VALID_PRIORITIES.includes(priority.toLowerCase())) {
        throw new Error(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }
}

/**
 * Add a new todo
 * @param {string} text - Todo description
 * @param {string} priority - Todo priority (default: "medium")
 * @returns {Object} The created todo object
 * @throws {Error} If input validation fails or file operations fail
 */
function addTodo(text, priority = 'medium') {
    validateTodoText(text);
    validatePriority(priority);
    
    const todos = loadTodos();
    
    const newTodo = {
        id: generateId(todos),
        text: text.trim(),
        done: false,
        created: new Date().toISOString(),
        priority: priority.toLowerCase()
    };
    
    todos.push(newTodo);
    saveTodos(todos);
    
    return newTodo;
}

/**
 * Get a todo by ID
 * @param {number} id - Todo ID
 * @returns {Object|null} Todo object or null if not found
 * @throws {Error} If ID is invalid
 */
function getTodo(id) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error('ID must be a positive integer');
    }
    
    const todos = loadTodos();
    return todos.find(todo => todo.id === id) || null;
}

/**
 * Update a todo by ID
 * @param {number} id - Todo ID
 * @param {Object} changes - Object containing fields to update
 * @returns {Object} Updated todo object
 * @throws {Error} If todo not found or validation fails
 */
function updateTodo(id, changes) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error('ID must be a positive integer');
    }
    
    if (!changes || typeof changes !== 'object') {
        throw new Error('Changes must be an object');
    }
    
    const todos = loadTodos();
    const todoIndex = todos.findIndex(todo => todo.id === id);
    
    if (todoIndex === -1) {
        throw new Error(`Todo with ID ${id} not found`);
    }
    
    // Validate changes
    if (changes.hasOwnProperty('text')) {
        validateTodoText(changes.text);
        changes.text = changes.text.trim();
    }
    
    if (changes.hasOwnProperty('priority')) {
        validatePriority(changes.priority);
        changes.priority = changes.priority.toLowerCase();
    }
    
    if (changes.hasOwnProperty('done') && typeof changes.done !== 'boolean') {
        throw new Error('Done status must be a boolean');
    }
    
    // Prevent modification of id and created fields
    const { id: _, created: __, ...validChanges } = changes;
    
    // Update todo
    todos[todoIndex] = { ...todos[todoIndex], ...validChanges };
    saveTodos(todos);
    
    return todos[todoIndex];
}

/**
 * Delete a todo by ID
 * @param {number} id - Todo ID
 * @returns {boolean} True if todo was deleted, false if not found
 * @throws {Error} If ID is invalid
 */
function deleteTodo(id) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error('ID must be a positive integer');
    }
    
    const todos = loadTodos();
    const initialLength = todos.length;
    const filteredTodos = todos.filter(todo => todo.id !== id);
    
    if (filteredTodos.length === initialLength) {
        return false; // Todo not found
    }
    
    saveTodos(filteredTodos);
    return true;
}

/**
 * Filter todos by completion status and/or priority
 * @param {Array} todos - Array of todos to filter
 * @param {boolean|null} done - Filter by completion status (null for all)
 * @param {string|null} priority - Filter by priority (null for all)
 * @returns {Array} Filtered todos array
 * @throws {Error} If input validation fails
 */
function filterTodos(todos, done = null, priority = null) {
    if (!Array.isArray(todos)) {
        throw new Error('Todos must be an array');
    }
    
    if (done !== null && typeof done !== 'boolean') {
        throw new Error('Done filter must be a boolean or null');
    }
    
    if (priority !== null) {
        if (typeof priority !== 'string') {
            throw new Error('Priority filter must be a string or null');
        }
        if (!VALID_PRIORITIES.includes(priority.toLowerCase())) {
            throw new Error(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
        }
    }
    
    return todos.filter(todo => {
        // Filter by done status
        if (done !== null && todo.done !== done) {
            return false;
        }
        
        // Filter by priority
        if (priority !== null && todo.priority !== priority.toLowerCase()) {
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
    VALID_PRIORITIES,
    TODOS_FILE
};