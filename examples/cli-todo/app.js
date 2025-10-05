/**
 * Todo Storage and Core Operations Module
 * Provides persistent storage and CRUD operations for todo items
 * @module app
 */

import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
// TODO: Replace with actual utils module when available
import * as utils from '@utils';

// Constants
const TODOS_FILENAME = '.todos.json';
const BACKUP_SUFFIX = '.backup';
const JSON_INDENT = 2;

/**
 * Get the full path to the todos file
 * @returns {string} Full path to ~/.todos.json
 */
const getTodosFilePath = () => path.join(os.homedir(), TODOS_FILENAME);

/**
 * Generate a unique ID for a new todo
 * Uses timestamp + random component to avoid collisions
 * @returns {number} Unique todo ID
 */
const generateTodoId = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return parseInt(`${timestamp}${random.toString().padStart(3, '0')}`);
};

/**
 * Validate todo structure
 * @param {Object} todo - Todo object to validate
 * @throws {Error} If todo structure is invalid
 */
const validateTodo = (todo) => {
  const requiredFields = ['id', 'text', 'done', 'created', 'priority'];
  const validPriorities = ['low', 'medium', 'high'];
  
  if (!todo || typeof todo !== 'object') {
    throw new Error('Todo must be an object');
  }
  
  for (const field of requiredFields) {
    if (!(field in todo)) {
      throw new Error(`Todo missing required field: ${field}`);
    }
  }
  
  if (typeof todo.id !== 'number') {
    throw new Error('Todo ID must be a number');
  }
  
  if (typeof todo.text !== 'string' || todo.text.trim() === '') {
    throw new Error('Todo text must be a non-empty string');
  }
  
  if (typeof todo.done !== 'boolean') {
    throw new Error('Todo done status must be a boolean');
  }
  
  if (!validPriorities.includes(todo.priority)) {
    throw new Error(`Todo priority must be one of: ${validPriorities.join(', ')}`);
  }
  
  // Validate ISO date string
  if (isNaN(Date.parse(todo.created))) {
    throw new Error('Todo created date must be a valid ISO date string');
  }
};

/**
 * Create backup of corrupted todos file
 * @param {string} filePath - Path to the todos file
 * @param {string} corruptedData - The corrupted JSON data
 */
const createBackup = async (filePath, corruptedData) => {
  try {
    const backupPath = filePath + BACKUP_SUFFIX;
    await fsPromises.writeFile(backupPath, corruptedData, 'utf8');
    console.warn(`Corrupted todos file backed up to: ${backupPath}`);
  } catch (error) {
    console.error('Failed to create backup of corrupted file:', error.message);
  }
};

/**
 * Initialize empty todos file
 * @param {string} filePath - Path to the todos file
 */
const initializeEmptyTodosFile = async (filePath) => {
  try {
    await fsPromises.writeFile(filePath, JSON.stringify([], null, JSON_INDENT), 'utf8');
  } catch (error) {
    throw new Error(`Failed to initialize todos file: ${error.message}`);
  }
};

/**
 * Load todos from the storage file
 * @returns {Promise<Array>} Array of todo objects
 * @throws {Error} If file operations fail
 */
export const loadTodos = async () => {
  const filePath = getTodosFilePath();
  
  try {
    const data = await fsPromises.readFile(filePath, 'utf8');
    
    if (!data.trim()) {
      // Empty file, return empty array
      return [];
    }
    
    let todos;
    try {
      todos = JSON.parse(data);
    } catch (parseError) {
      // Corrupted JSON, create backup and reinitialize
      console.error('Corrupted todos file detected, creating backup...');
      await createBackup(filePath, data);
      await initializeEmptyTodosFile(filePath);
      return [];
    }
    
    if (!Array.isArray(todos)) {
      throw new Error('Todos file contains invalid data structure');
    }
    
    // Validate each todo
    todos.forEach((todo, index) => {
      try {
        validateTodo(todo);
      } catch (validationError) {
        throw new Error(`Invalid todo at index ${index}: ${validationError.message}`);
      }
    });
    
    return todos;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create it
      await initializeEmptyTodosFile(filePath);
      return [];
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied accessing todos file: ${filePath}`);
    } else if (error.message.includes('Invalid todo') || error.message.includes('invalid data structure')) {
      // Re-throw validation errors
      throw error;
    } else {
      throw new Error(`Failed to load todos: ${error.message}`);
    }
  }
};

/**
 * Save todos to the storage file
 * @param {Array} todos - Array of todo objects to save
 * @throws {Error} If validation fails or file operations fail
 */
export const saveTodos = async (todos) => {
  if (!Array.isArray(todos)) {
    throw new Error('Todos must be an array');
  }
  
  // Validate all todos before saving
  todos.forEach((todo, index) => {
    try {
      validateTodo(todo);
    } catch (validationError) {
      throw new Error(`Invalid todo at index ${index}: ${validationError.message}`);
    }
  });
  
  const filePath = getTodosFilePath();
  const jsonData = JSON.stringify(todos, null, JSON_INDENT);
  
  try {
    // Atomic write: write to temp file first, then rename
    const tempPath = filePath + '.tmp';
    await fsPromises.writeFile(tempPath, jsonData, 'utf8');
    await fsPromises.rename(tempPath, filePath);
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied writing to todos file: ${filePath}`);
    } else if (error.code === 'ENOSPC') {
      throw new Error('Insufficient disk space to save todos');
    } else {
      throw new Error(`Failed to save todos: ${error.message}`);
    }
  }
};

/**
 * Add a new todo
 * @param {string} text - Todo description text
 * @param {string} [priority="medium"] - Todo priority (low, medium, high)
 * @returns {Promise<Object>} The created todo object
 * @throws {Error} If validation fails or save operation fails
 */
export const addTodo = async (text, priority = "medium") => {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('Todo text must be a non-empty string');
  }
  
  const validPriorities = ['low', 'medium', 'high'];
  if (!validPriorities.includes(priority)) {
    throw new Error(`Priority must be one of: ${validPriorities.join(', ')}`);
  }
  
  const todos = await loadTodos();
  
  const newTodo = {
    id: generateTodoId(),
    text: text.trim(),
    done: false,
    created: new Date().toISOString(),
    priority: priority
  };
  
  // Ensure ID is unique (handle edge case of collision)
  const existingIds = new Set(todos.map(todo => todo.id));
  while (existingIds.has(newTodo.id)) {
    newTodo.id = generateTodoId();
  }
  
  todos.push(newTodo);
  await saveTodos(todos);
  
  return newTodo;
};

/**
 * Get a todo by ID
 * @param {number} id - Todo ID to search for
 * @returns {Promise<Object|null>} Todo object if found, null otherwise
 * @throws {Error} If ID is invalid or load operation fails
 */
export const getTodo = async (id) => {
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    throw new Error('Todo ID must be an integer');
  }
  
  const todos = await loadTodos();
  return todos.find(todo => todo.id === id) || null;
};

/**
 * Update an existing todo
 * @param {number} id - Todo ID to update
 * @param {Object} changes - Object containing fields to update
 * @returns {Promise<Object|null>} Updated todo object if found, null otherwise
 * @throws {Error} If validation fails or save operation fails
 */
export const updateTodo = async (id, changes) => {
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    throw new Error('Todo ID must be an integer');
  }
  
  if (!changes || typeof changes !== 'object') {
    throw new Error('Changes must be an object');
  }
  
  const todos = await loadTodos();
  const todoIndex = todos.findIndex(todo => todo.id === id);
  
  if (todoIndex === -1) {
    return null;
  }
  
  // Create updated todo
  const updatedTodo = { ...todos[todoIndex], ...changes };
  
  // Preserve immutable fields
  updatedTodo.id = todos[todoIndex].id;
  updatedTodo.created = todos[todoIndex].created;
  
  // Validate updated todo
  validateTodo(updatedTodo);
  
  todos[todoIndex] = updatedTodo;
  await saveTodos(todos);
  
  return updatedTodo;
};

/**
 * Delete a todo by ID
 * @param {number} id - Todo ID to delete
 * @returns {Promise<boolean>} True if todo was deleted, false if not found
 * @throws {Error} If ID is invalid or save operation fails
 */
export const deleteTodo = async (id) => {
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    throw new Error('Todo ID must be an integer');
  }
  
  const todos = await loadTodos();
  const initialLength = todos.length;
  const filteredTodos = todos.filter(todo => todo.id !== id);
  
  if (filteredTodos.length === initialLength) {
    return false; // Todo not found
  }
  
  await saveTodos(filteredTodos);
  return true;
};

/**
 * Filter todos by done status and/or priority
 * @param {Array} todos - Array of todos to filter
 * @param {boolean|null} [done=null] - Filter by done status (null for no filter)
 * @param {string|null} [priority=null] - Filter by priority (null for no filter)
 * @returns {Array} Filtered array of todos
 * @throws {Error} If parameters are invalid
 */
export const filterTodos = (todos, done = null, priority = null) => {
  if (!Array.isArray(todos)) {
    throw new Error('Todos must be an array');
  }
  
  if (done !== null && typeof done !== 'boolean') {
    throw new Error('Done filter must be a boolean or null');
  }
  
  if (priority !== null) {
    const validPriorities = ['low', 'medium', 'high'];
    if (!validPriorities.includes(priority)) {
      throw new Error(`Priority filter must be one of: ${validPriorities.join(', ')} or null`);
    }
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
};

// Export all functions as named exports
export {
  getTodosFilePath,
  generateTodoId,
  validateTodo
};