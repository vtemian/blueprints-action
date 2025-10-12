#!/usr/bin/env node

import { createRequire } from 'module';
import process from 'process';
import * as commands from './commands.js';
import app from './app.js';

const require = createRequire(import.meta.url);

/**
 * Main entry point for the Todo CLI application
 * Parses command-line arguments and routes to appropriate command handlers
 * 
 * @async
 * @function main
 * @returns {Promise<void>}
 * 
 * @example
 * node index.js add "Buy groceries"
 * node index.js list
 * node index.js done 1
 * node index.js remove 1
 * node index.js help
 */
async function main() {
  try {
    // Initialize the application
    await app.initialize();

    // Parse command-line arguments (skip node path and script path)
    const args = process.argv.slice(2);
    
    // Extract command and arguments
    const [command, ...commandArgs] = args;
    
    // Default to help if no command provided
    const actualCommand = command || 'help';

    // Route commands to appropriate handlers
    switch (actualCommand.toLowerCase()) {
      case 'add':
        await handleAddCommand(commandArgs);
        break;
        
      case 'list':
        await handleListCommand(commandArgs);
        break;
        
      case 'done':
        await handleDoneCommand(commandArgs);
        break;
        
      case 'remove':
        await handleRemoveCommand(commandArgs);
        break;
        
      case 'help':
      case '--help':
      case '-h':
        await handleHelpCommand();
        break;
        
      default:
        console.error(`Error: Unknown command '${actualCommand}'`);
        console.error('Run "todo help" to see available commands.');
        process.exit(1);
    }

    // Exit successfully
    process.exit(0);

  } catch (error) {
    await handleGlobalError(error);
  }
}

/**
 * Handle the 'add' command with proper validation
 * @param {string[]} args - Command arguments
 */
async function handleAddCommand(args) {
  if (args.length === 0) {
    console.error('Error: Missing todo description');
    console.error('Usage: todo add <description>');
    console.error('Example: todo add "Buy groceries"');
    process.exit(1);
  }

  const description = args.join(' ').trim();
  
  if (description.length === 0) {
    console.error('Error: Todo description cannot be empty');
    process.exit(1);
  }

  try {
    await commands.add(description);
  } catch (error) {
    console.error(`Error adding todo: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle the 'list' command
 * @param {string[]} args - Command arguments
 */
async function handleListCommand(args) {
  try {
    const filter = args[0] || 'all'; // Support filtering: all, pending, completed
    await commands.list(filter);
  } catch (error) {
    console.error(`Error listing todos: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle the 'done' command with ID validation
 * @param {string[]} args - Command arguments
 */
async function handleDoneCommand(args) {
  if (args.length === 0) {
    console.error('Error: Missing todo ID');
    console.error('Usage: todo done <id>');
    console.error('Example: todo done 1');
    process.exit(1);
  }

  const todoId = parseInt(args[0], 10);
  
  if (isNaN(todoId) || todoId <= 0) {
    console.error('Error: Todo ID must be a positive number');
    console.error('Use "todo list" to see available todo IDs');
    process.exit(1);
  }

  try {
    await commands.done(todoId);
  } catch (error) {
    if (error.code === 'TODO_NOT_FOUND') {
      console.error(`Error: Todo with ID ${todoId} not found`);
      console.error('Use "todo list" to see available todos');
    } else {
      console.error(`Error marking todo as done: ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Handle the 'remove' command with ID validation
 * @param {string[]} args - Command arguments
 */
async function handleRemoveCommand(args) {
  if (args.length === 0) {
    console.error('Error: Missing todo ID');
    console.error('Usage: todo remove <id>');
    console.error('Example: todo remove 1');
    process.exit(1);
  }

  const todoId = parseInt(args[0], 10);
  
  if (isNaN(todoId) || todoId <= 0) {
    console.error('Error: Todo ID must be a positive number');
    console.error('Use "todo list" to see available todo IDs');
    process.exit(1);
  }

  try {
    await commands.remove(todoId);
  } catch (error) {
    if (error.code === 'TODO_NOT_FOUND') {
      console.error(`Error: Todo with ID ${todoId} not found`);
      console.error('Use "todo list" to see available todos');
    } else {
      console.error(`Error removing todo: ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Handle the 'help' command
 */
async function handleHelpCommand() {
  try {
    await commands.help();
  } catch (error) {
    console.error(`Error displaying help: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle global errors with user-friendly messages
 * @param {Error} error - The error to handle
 */
async function handleGlobalError(error) {
  // Handle specific error types
  switch (error.code) {
    case 'ENOENT':
      console.error('Error: Todo data file not found. It will be created when you add your first todo.');
      break;
      
    case 'EACCES':
      console.error('Error: Permission denied. Check file permissions for the todo data directory.');
      break;
      
    case 'ENOSPC':
      console.error('Error: No space left on device. Free up some disk space and try again.');
      break;
      
    case 'EMFILE':
    case 'ENFILE':
      console.error('Error: Too many open files. Close some applications and try again.');
      break;
      
    default:
      // Log detailed error in development, user-friendly message in production
      if (process.env.NODE_ENV === 'development') {
        console.error('Detailed error information:');
        console.error(error);
      } else {
        console.error(`An unexpected error occurred: ${error.message}`);
        console.error('If this problem persists, please report it as a bug.');
      }
      break;
  }
  
  process.exit(1);
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Execute main function
main();