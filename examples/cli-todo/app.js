/**
 * Todo Storage Module
 * Handles todo storage and core operations with file-based persistence
 * @module app
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import * as utils from './utils.js';

// Constants
const TODOS_FILE_PATH = path.join(os.homedir(), '.todos.json');
const BACKUP_FILE_PATH = path.join(os.homedir(), '.todos.json.backup');
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const DEFAULT_PRIORITY = 'medium';

/**
 * Loads todos from the storage file
 * Handles file creation, corruption, and various error scenarios
 * @returns {Array} Array of todo objects
 * @throws {Error} For critical file system errors (excluding ENOENT and JSON parse errors)
 */
export function loadTodos() {
    try {
        // Check if file exists, create if it doesn't
        if (!fs.existsSync(TODOS_FILE_PATH)) {
            console.log('Todos file not found, creating new file...');
            fs.writeFileSync(TODOS_FILE_PATH, JSON.stringify([], null, 2), 'utf8');
            return [];
        }

        // Read file content
        const fileContent = fs.readFileSync(TODOS_FILE_PATH, 'utf8');
        
        // Handle empty file
        if (!fileContent.trim()) {
            console.log('Empty todos file detected, initializing with empty array...');
            fs.writeFileSync(TODOS_FILE_PATH, JSON.stringify([], null, 2), 'utf8');
            return [];
        }

        // Parse JSON content
        const todos = JSON.parse(fileContent);
        
        // Validate that parsed content is an array
        if (!Array.isArray(todos)) {
            throw new Error('Invalid todos format: expected array');
        }

        // Validate todo structure
        const validTodos = todos.filter(todo => validateTodoStructure(todo));
        
        // If some todos were invalid, save the cleaned version
        if (validTodos.length !== todos.length) {
            console.warn(`Removed ${todos.length - validTodos.length} invalid todo(s)`);
            saveTodos(validTodos);
        }

        return validTodos;

    } catch (error) {
        if (error.code === 'ENOENT') {
            // File not found - create new file
            console.log('Todos file not found, creating new file...');
            fs.writeFileSync(TODOS_FILE_PATH, JSON.stringify([], null, 2), 'utf8');
            return [];
        } else if (error.code === 'EACCES') {
            // Permission denied
            throw new Error(`Permission denied accessing todos file: ${TODOS_FILE_PATH}`);
        } else if (error instanceof SyntaxError || error.name === 'SyntaxError') {
            // JSON parse error - backup and recreate
            console.warn('Corrupted todos file detected, creating backup and starting fresh...');
            try {
                // Create backup of corrupted file
                const corruptedContent = fs.readFileSync(TODOS_FILE_PATH, 'utf8');
                fs.writeFileSync(BACKUP_FILE_PATH, corruptedContent, 'utf8');
                console.log(`Backup created at: ${BACKUP_FILE_PATH}`);
                
                // Create fresh todos file
                fs.writeFileSync(TODOS_FILE_PATH, JSON.stringify([], null, 2), 'utf8');
                return [];
            } catch (backupError) {
                throw new Error(`Failed to handle corrupted todos file: ${backupError.message}`);
            }
        } else {
            // Other unexpected errors
            throw new Error(`Failed to load todos: ${error.message}`);
        }
    }
}

/**
 * Saves todos array to the storage file
 * @param {Array} todos - Array of todo objects to save
 * @throws {Error} For file system errors or invalid input
 */
export function saveTodos(todos) {
    // Validate input
    if (!Array.isArray(todos)) {
        throw new Error('Invalid input: todos must be an array');
    }

    // Validate each todo structure
    const invalidTodos = todos.filter(todo => !validateTodoStructure(todo));
    if (invalidTodos.length > 0) {
        throw new Error(`Cannot save: ${invalidTodos.length} todo(s) have invalid structure`);
    }

    try {
        // Write to file with pretty formatting
        const jsonContent = JSON.stringify(todos, null, 2);
        fs.writeFileSync(TODOS_FILE_PATH, jsonContent, 'utf8');
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
 * Adds a new todo to the storage
 * @param {string} text - The todo description
 * @param {string} [priority="medium"] - Priority level (low, medium, high)
 * @returns {Object} The created todo object
 * @throws {Error} For invalid input or storage errors
 */
export function addTodo(text, priority = DEFAULT_PRIORITY) {
    // Validate input parameters
    if (typeof text !== 'string' || !text.trim()) {
        throw new Error('Todo text must be a non-empty string');
    }

    if (!VALID_PRIORITIES.includes(priority)) {
        throw new Error(`Invalid priority: ${priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    // Load existing todos
    const todos = loadTodos();
    
    // Generate new ID (find max ID and increment)
    const maxId = todos.length > 0 ? Math.max(...todos.map(todo => todo.id)) : 0;
    const newId = maxId + 1;

    // Create new todo object
    const newTodo = {
        id: newId,
        text: text.trim(),
        done: false,
        created: new Date().toISOString(),
        priority: priority
    };

    // Add to todos array and save
    todos.push(newTodo);
    saveTodos(todos);

    return newTodo;
}

/**
 * Retrieves a todo by its ID
 * @param {number} id - The todo ID to search for
 * @returns {Object|null} The todo object if found, null otherwise
 * @throws {Error} For invalid ID parameter
 */
export function getTodo(id) {
    // Validate ID parameter
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('Todo ID must be a positive integer');
    }

    // Load todos and find by ID
    const todos = loadTodos();
    const todo = todos.find(todo => todo.id === id);
    
    return todo || null;
}

/**
 * Updates an existing todo with new values
 * @param {number} id - The ID of the todo to update
 * @param {Object} changes - Object containing fields to update
 * @returns {Object|null} The updated todo object, or null if not found
 * @throws {Error} For invalid parameters or update failures
 */
export function updateTodo(id, changes) {
    // Validate ID parameter
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('Todo ID must be a positive integer');
    }

    // Validate changes parameter
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw new Error('Changes must be a non-null object');
    }

    // Validate allowed fields and values
    const allowedFields = ['text', 'done', 'priority'];
    const changeKeys = Object.keys(changes);
    
    if (changeKeys.length === 0) {
        throw new Error('No valid changes provided');
    }

    // Check for invalid fields
    const invalidFields = changeKeys.filter(key => !allowedFields.includes(key));
    if (invalidFields.length > 0) {
        throw new Error(`Invalid fields: ${invalidFields.join(', ')}. Allowed: ${allowedFields.join(', ')}`);
    }

    // Validate specific field values
    if ('text' in changes && (typeof changes.text !== 'string' || !changes.text.trim())) {
        throw new Error('Text must be a non-empty string');
    }
    
    if ('done' in changes && typeof changes.done !== 'boolean') {
        throw new Error('Done must be a boolean value');
    }
    
    if ('priority' in changes && !VALID_PRIORITIES.includes(changes.priority)) {
        throw new Error(`Invalid priority: ${changes.priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    // Load todos and find the target
    const todos = loadTodos();
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

    // Update the todos array and save
    todos[todoIndex] = updatedTodo;
    saveTodos(todos);

    return updatedTodo;
}

/**
 * Deletes a todo by its ID
 * @param {number} id - The ID of the todo to delete
 * @returns {boolean} True if deleted successfully, false if not found
 * @throws {Error} For invalid ID parameter or deletion failures
 */
export function deleteTodo(id) {
    // Validate ID parameter
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('Todo ID must be a positive integer');
    }

    // Load todos and find the target
    const todos = loadTodos();
    const initialLength = todos.length;
    const filteredTodos = todos.filter(todo => todo.id !== id);

    // Check if any todo was removed
    if (filteredTodos.length === initialLength) {
        return false; // Todo not found
    }

    // Save the updated todos array
    saveTodos(filteredTodos);
    return true;
}

/**
 * Filters todos based on completion status and/or priority
 * @param {Array} todos - Array of todos to filter
 * @param {Object} [options={}] - Filter options
 * @param {boolean} [options.done] - Filter by completion status
 * @param {string} [options.priority] - Filter by priority level
 * @returns {Array} Filtered array of todos
 * @throws {Error} For invalid parameters
 */
export function filterTodos(todos, options = {}) {
    // Validate todos parameter
    if (!Array.isArray(todos)) {
        throw new Error('Todos must be an array');
    }

    // Validate options parameter
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('Options must be an object');
    }

    // Validate option values
    if ('done' in options && typeof options.done !== 'boolean') {
        throw new Error('Done filter must be a boolean value');
    }

    if ('priority' in options && !VALID_PRIORITIES.includes(options.priority)) {
        throw new Error(`Invalid priority filter: ${options.priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    // Apply filters
    let filteredTodos = [...todos];

    // Filter by completion status
    if ('done' in options) {
        filteredTodos = filteredTodos.filter(todo => todo.done === options.done);
    }

    // Filter by priority
    if ('priority' in options) {
        filteredTodos = filteredTodos.filter(todo => todo.priority === options.priority);
    }

    return filteredTodos;
}

/**
 * Validates the structure of a todo object
 * @private
 * @param {*} todo - The todo object to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateTodoStructure(todo) {
    if (!todo || typeof todo !== 'object' || Array.isArray(todo)) {
        return false;
    }

    // Check required fields and types
    const requiredFields = {
        id: 'number',
        text: 'string',
        done: 'boolean',
        created: 'string',
        priority: 'string'
    };

    for (const [field, expectedType] of Object.entries(requiredFields)) {
        if (!(field in todo) || typeof todo[field] !== expectedType) {
            return false;
        }
    }

    // Validate specific field constraints
    if (!Number.isInteger(todo.id) || todo.id <= 0) {
        return false;
    }

    if (!todo.text.trim()) {
        return false;
    }

    if (!VALID_PRIORITIES.includes(todo.priority)) {
        return false;
    }

    // Validate ISO date string
    try {
        const date = new Date(todo.created);
        if (isNaN(date.getTime()) || date.toISOString() !== todo.created) {
            return false;
        }
    } catch {
        return false;
    }

    return true;
}