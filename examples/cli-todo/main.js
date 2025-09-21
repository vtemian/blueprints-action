#!/usr/bin/env node

/**
 * Todo CLI Application Entry Point
 * Handles command-line argument parsing, routing, and error management
 */

const process = require('process');

// Import local modules with error handling
let app, commands;

try {
  app = require('./app.js');
  commands = require('./commands.js');
} catch (error) {
  console.error('Error: Failed to load required modules.');
  console.error('Please ensure app.js and commands.js exist in the same directory.');
  process.exit(1);
}

/**
 * Main CLI entry point
 * Parses command-line arguments and routes to appropriate command handlers
 */
async function main() {
  try {
    // Parse command-line arguments (skip node and script path)
    const args = process.argv.slice(2);
    const command = args[0];
    const commandArgs = args.slice(1);

    // Validate that commands module is properly loaded
    if (!commands || typeof commands !== 'object') {
      console.error('Error: Commands module is not properly configured.');
      process.exit(1);
    }

    // Route commands to appropriate handlers
    switch (command) {
      case 'add':
        await handleCommand('add', commandArgs, commands.add);
        break;

      case 'list':
        await handleCommand('list', commandArgs, commands.list);
        break;

      case 'done':
        await handleCommand('done', commandArgs, commands.done);
        break;

      case 'remove':
        await handleCommand('remove', commandArgs, commands.remove);
        break;

      case 'help':
      case undefined:
        await handleCommand('help', commandArgs, commands.help);
        break;

      default:
        console.error(`Error: Unknown command '${command}'`);
        console.error('Use "help" to see available commands.');
        if (typeof commands.help === 'function') {
          await commands.help();
        }
        process.exit(1);
    }

    // Successful execution
    process.exit(0);

  } catch (error) {
    handleError(error);
  }
}

/**
 * Handle individual command execution with error management
 * @param {string} commandName - Name of the command being executed
 * @param {Array} args - Arguments passed to the command
 * @param {Function} handler - Command handler function
 */
async function handleCommand(commandName, args, handler) {
  try {
    // Validate that handler exists and is a function
    if (typeof handler !== 'function') {
      console.error(`Error: Command '${commandName}' is not available.`);
      console.error('Please check your commands.js file.');
      process.exit(1);
    }

    // Execute command handler (support both sync and async)
    const result = handler(args);
    
    // Handle async command handlers
    if (result && typeof result.then === 'function') {
      await result;
    }

  } catch (error) {
    // Handle specific command errors
    if (error.code === 'MISSING_ARGS') {
      console.error(`Error: ${error.message}`);
      console.error(`Usage: ${commandName} ${error.usage || '<arguments>'}`);
      process.exit(1);
    }
    
    if (error.code === 'FILE_ERROR') {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }

    // Re-throw for main error handler
    throw error;
  }
}

/**
 * Global error handler for unhandled errors
 * @param {Error} error - The error object
 */
function handleError(error) {
  // Handle different types of errors
  if (error.code === 'ENOENT') {
    console.error('Error: Todo data file not found or inaccessible.');
  } else if (error.code === 'EACCES') {
    console.error('Error: Permission denied accessing todo data file.');
  } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
    console.error('Error: Too many open files. Please try again.');
  } else {
    console.error('Error: An unexpected error occurred.');
    
    // In development, show full error details
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack || error.message);
    } else {
      console.error(error.message || 'Unknown error');
    }
  }
  
  process.exit(1);
}

/**
 * Handle process termination signals gracefully
 */
process.on('SIGINT', () => {
  console.log('\nTodo CLI terminated by user.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nTodo CLI terminated.');
  process.exit(0);
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Error: Unhandled promise rejection.');
  if (process.env.NODE_ENV === 'development') {
    console.error('Promise:', promise);
    console.error('Reason:', reason);
  }
  process.exit(1);
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Error: Uncaught exception occurred.');
  if (process.env.NODE_ENV === 'development') {
    console.error(error.stack);
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

// Execute main function only if this file is run directly
if (require.main === module) {
  main();
}

// Export main function for testing purposes
module.exports = { main, handleCommand, handleError };