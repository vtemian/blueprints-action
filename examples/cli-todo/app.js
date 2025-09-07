/**
 * Todo Management Application Module
 * Provides core todo operations with JSON file persistence
 * @module TodoManager
 */

import { promises as fs } from 'fs/promises';
import path from 'path';
import os from 'os';
import { validateInput, deepClone } from '@utils';

// Configuration
const TODO_FILE = path.join(os.homedir(), '.todos.json');
const BACKUP_SUFFIX = '.backup';
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Custom error classes for different failure types
 */
export class TodoError extends Error {
    constructor(message, code = 'TODO_ERROR') {
        super(message);
        this.name = 'TodoError';
        this.code = code;
    }
}

export class TodoNotFoundError extends TodoError {
    constructor(id) {
        super(`Todo with ID ${id} not found`, 'TODO_NOT_FOUND');
        this.name = 'TodoNotFoundError';
    }
}

export class TodoValidationError extends TodoError {
    constructor(message) {
        super(message, 'TODO_VALIDATION_ERROR');
        this.name = 'TodoValidationError';
    }
}

export class TodoFileError extends TodoError {
    constructor(message, originalError) {
        super(message, 'TODO_FILE_ERROR');
        this.name = 'TodoFileError';
        this.originalError = originalError;
    }
}

/**
 * Validates todo text input
 * @param {string} text - The todo text to validate
 * @throws {TodoValidationError} When text is invalid
 */
function validateTodoText(text) {
    if (typeof text !== 'string') {
        throw new TodoValidationError('Todo text must be a string');
    }
    if (!text.trim()) {
        throw new TodoValidationError('Todo text cannot be empty');
    }
    if (text.length > 500) {
        throw new TodoValidationError('Todo text cannot exceed 500 characters');
    }
}

/**
 * Validates priority input
 * @param {string} priority - The priority to validate
 * @throws {TodoValidationError} When priority is invalid
 */
function validatePriority(priority) {
    if (typeof priority !== 'string' || !VALID_PRIORITIES.includes(priority)) {
        throw new TodoValidationError(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }
}

/**
 * Validates todo ID input
 * @param {number} id - The ID to validate
 * @throws {TodoValidationError} When ID is invalid
 */
function validateTodoId(id) {
    if (!Number.isInteger(id) || id <= 0) {
        throw new TodoValidationError('Todo ID must be a positive integer');
    }
}

/**
 * Creates a backup of corrupted JSON file
 * @param {string} filePath - Path to the corrupted file
 * @param {string} corruptedData - The corrupted JSON data
 */
async function createBackup(filePath, corruptedData) {
    try {
        const backupPath = filePath + BACKUP_SUFFIX;
        await fs.writeFile(backupPath, corruptedData, 'utf8');
        console.warn(`Corrupted todos file backed up to: ${backupPath}`);
    } catch (error) {
        console.error('Failed to create backup of corrupted file:', error.message);
    }
}

/**
 * Performs atomic file write operation
 * @param {string} filePath - Target file path
 * @param {string} data - Data to write
 */
async function atomicWrite(filePath, data) {
    const tempPath = filePath + '.tmp';
    try {
        await fs.writeFile(tempPath, data, 'utf8');
        await fs.rename(tempPath, filePath);
    } catch (error) {
        // Clean up temp file if it exists
        try {
            await fs.unlink(tempPath);
        } catch (cleanupError) {
            // Ignore cleanup errors
        }
        throw error;
    }
}

/**
 * Generates the next available ID for a new todo
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
 * Read and parse todos from the JSON file
 * @returns {Promise<Array>} Array of todo objects
 * @throws {TodoFileError} When file operations fail
 */
export async function load_todos() {
    try {
        const data = await fs.readFile(TODO_FILE, 'utf8');
        
        try {
            const todos = JSON.parse(data);
            
            // Validate that we got an array
            if (!Array.isArray(todos)) {
                throw new Error('Invalid data structure: expected array');
            }
            
            // Validate each todo object structure
            todos.forEach((todo, index) => {
                if (!todo || typeof todo !== 'object') {
                    throw new Error(`Invalid todo at index ${index}: not an object`);
                }
                if (!Number.isInteger(todo.id) || todo.id <= 0) {
                    throw new Error(`Invalid todo at index ${index}: invalid ID`);
                }
                if (typeof todo.text !== 'string') {
                    throw new Error(`Invalid todo at index ${index}: invalid text`);
                }
                if (typeof todo.done !== 'boolean') {
                    throw new Error(`Invalid todo at index ${index}: invalid done status`);
                }
            });
            
            return todos;
            
        } catch (parseError) {
            // Handle corrupted JSON
            console.warn('Corrupted todos file detected, creating backup...');
            await createBackup(TODO_FILE, data);
            
            // Create fresh empty file
            await save_todos([]);
            return [];
        }
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, create it
            await save_todos([]);
            return [];
        }
        
        if (error.code === 'EACCES') {
            throw new TodoFileError(
                `Permission denied accessing todos file: ${TODO_FILE}`,
                error
            );
        }
        
        // Re-throw TodoFileError as-is
        if (error instanceof TodoFileError) {
            throw error;
        }
        
        throw new TodoFileError(
            `Failed to load todos: ${error.message}`,
            error
        );
    }
}

/**
 * Write todos array to the JSON file
 * @param {Array} todos - Array of todo objects to save
 * @throws {TodoValidationError} When todos array is invalid
 * @throws {TodoFileError} When file operations fail
 */
export async function save_todos(todos) {
    // Validate input
    if (!Array.isArray(todos)) {
        throw new TodoValidationError('Todos must be an array');
    }
    
    try {
        const jsonData = JSON.stringify(todos, null, 2);
        await atomicWrite(TODO_FILE, jsonData);
    } catch (error) {
        if (error.code === 'EACCES') {
            throw new TodoFileError(
                `Permission denied writing to todos file: ${TODO_FILE}`,
                error
            );
        }
        
        if (error.code === 'ENOSPC') {
            throw new TodoFileError(
                'Insufficient disk space to save todos',
                error
            );
        }
        
        throw new TodoFileError(
            `Failed to save todos: ${error.message}`,
            error
        );
    }
}

/**
 * Create a new todo with auto-increment ID
 * @param {string} text - The todo description
 * @param {string} [priority="medium"] - Priority level (low, medium, high)
 * @returns {Promise<Object>} The created todo object
 * @throws {TodoValidationError} When input parameters are invalid
 * @throws {TodoFileError} When file operations fail
 */
export async function add_todo(text, priority = "medium") {
    // Validate inputs
    validateTodoText(text);
    validatePriority(priority);
    
    try {
        const todos = await load_todos();
        
        const newTodo = {
            id: generateNextId(todos),
            text: text.trim(),
            done: false,
            created: new Date().toISOString(),
            priority: priority
        };
        
        todos.push(newTodo);
        await save_todos(todos);
        
        return deepClone(newTodo);
        
    } catch (error) {
        if (error instanceof TodoValidationError || error instanceof TodoFileError) {
            throw error;
        }
        throw new TodoError(`Failed to add todo: ${error.message}`);
    }
}

/**
 * Find and return todo by ID
 * @param {number} id - The todo ID to search for
 * @returns {Promise<Object|null>} The todo object or null if not found
 * @throws {TodoValidationError} When ID is invalid
 * @throws {TodoFileError} When file operations fail
 */
export async function get_todo(id) {
    validateTodoId(id);
    
    try {
        const todos = await load_todos();
        const todo = todos.find(t => t.id === id);
        
        return todo ? deepClone(todo) : null;
        
    } catch (error) {
        if (error instanceof TodoValidationError || error instanceof TodoFileError) {
            throw error;
        }
        throw new TodoError(`Failed to get todo: ${error.message}`);
    }
}

/**
 * Update specific fields of an existing todo
 * @param {number} id - The todo ID to update
 * @param {Object} changes - Object containing fields to update
 * @param {string} [changes.text] - New todo text
 * @param {boolean} [changes.done] - New completion status
 * @param {string} [changes.priority] - New priority level
 * @returns {Promise<Object>} The updated todo object
 * @throws {TodoValidationError} When input parameters are invalid
 * @throws {TodoNotFoundError} When todo with given ID doesn't exist
 * @throws {TodoFileError} When file operations fail
 */
export async function update_todo(id, changes) {
    validateTodoId(id);
    
    if (!changes || typeof changes !== 'object') {
        throw new TodoValidationError('Changes must be an object');
    }
    
    // Validate individual change fields
    if (changes.hasOwnProperty('text')) {
        validateTodoText(changes.text);
    }
    
    if (changes.hasOwnProperty('done') && typeof changes.done !== 'boolean') {
        throw new TodoValidationError('Done status must be a boolean');
    }
    
    if (changes.hasOwnProperty('priority')) {
        validatePriority(changes.priority);
    }
    
    // Prevent modification of read-only fields
    const readOnlyFields = ['id', 'created'];
    const invalidFields = Object.keys(changes).filter(key => readOnlyFields.includes(key));
    if (invalidFields.length > 0) {
        throw new TodoValidationError(`Cannot modify read-only fields: ${invalidFields.join(', ')}`);
    }
    
    try {
        const todos = await load_todos();
        const todoIndex = todos.findIndex(t => t.id === id);
        
        if (todoIndex === -1) {
            throw new TodoNotFoundError(id);
        }
        
        // Apply changes
        const updatedTodo = {
            ...todos[todoIndex],
            ...Object.fromEntries(
                Object.entries(changes).map(([key, value]) => [
                    key,
                    key === 'text' ? value.trim() : value
                ])
            )
        };
        
        todos[todoIndex] = updatedTodo;
        await save_todos(todos);
        
        return deepClone(updatedTodo);
        
    } catch (error) {
        if (error instanceof TodoValidationError || 
            error instanceof TodoNotFoundError || 
            error instanceof TodoFileError) {
            throw error;
        }
        throw new TodoError(`Failed to update todo: ${error.message}`);
    }
}

/**
 * Remove todo by ID
 * @param {number} id - The todo ID to delete
 * @returns {Promise<boolean>} True if todo was deleted, false if not found
 * @throws {TodoValidationError} When ID is invalid
 * @throws {TodoFileError} When file operations fail
 */
export async function delete_todo(id) {
    validateTodoId(id);
    
    try {
        const todos = await load_todos();
        const initialLength = todos.length;
        const filteredTodos = todos.filter(t => t.id !== id);
        
        if (filteredTodos.length === initialLength) {
            return false; // Todo not found
        }
        
        await save_todos(filteredTodos);
        return true;
        
    } catch (error) {
        if (error instanceof TodoValidationError || error instanceof TodoFileError) {
            throw error;
        }
        throw new TodoError(`Failed to delete todo: ${error.message}`);
    }
}

/**
 * Filter todos by completion status and/or priority
 * @param {Array} todos - Array of todos to filter
 * @param {boolean|null} [done=null] - Filter by completion status (null = no filter)
 * @param {string|null} [priority=null] - Filter by priority (null = no filter)
 * @returns {Array} Filtered array of todos
 * @throws {TodoValidationError} When input parameters are invalid
 */
export function filter_todos(todos, done = null, priority = null) {
    if (!Array.isArray(todos)) {
        throw new TodoValidationError('Todos must be an array');
    }
    
    if (done !== null && typeof done !== 'boolean') {
        throw new TodoValidationError('Done filter must be a boolean or null');
    }
    
    if (priority !== null) {
        validatePriority(priority);
    }
    
    try {
        return todos.filter(todo => {
            // Filter by completion status
            if (done !== null && todo.done !== done) {
                return false;
            }
            
            // Filter by priority
            if (priority !== null && todo.priority !== priority) {
                return false;
            }
            
            return true;
        });
        
    } catch (error) {
        throw new TodoError(`Failed to filter todos: ${error.message}`);
    }
}

// Export configuration for external use
export const TODO_CONFIG = {
    FILE_PATH: TODO_FILE,
    VALID_PRIORITIES,
    BACKUP_SUFFIX
};