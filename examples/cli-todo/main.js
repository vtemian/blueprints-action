#!/usr/bin/env node

/**
 * Todo CLI Application Entry Point
 * Main controller for command-line todo list management
 */

import process from 'process';
import app from '@app';
import * as commands from '@commands';

/**
 * Valid CLI commands mapping
 */
const VALID_COMMANDS = {
  'add': commands.add,
  'list': commands.list,
  'done': commands.done,
  'remove': commands.remove,
  'help': commands.help
};

/**
 * Routes command to appropriate handler function
 * @param {string} command - The command to execute
 * @param {string[]} args - Arguments to pass to the command
 * @returns {Promise<void>}
 */
async function routeCommand(command, args) {
  // Normalize command to lowercase
  const normalizedCommand = command?.toLowerCase();
  
  // Check if command exists in valid commands
  if (!normalizedCommand || !VALID_COMMANDS[normalizedCommand]) {
    console.error('Invalid command');
    await commands.help();
    process.exit(1);
  }

  // Get the command handler function
  const commandHandler = VALID_COMMANDS[normalizedCommand];
  
  try {
    // Execute the command with provided arguments
    await commandHandler(args);
  } catch (error) {
    // Handle specific error types
    if (error.code === 'MISSING_ARGS') {
      console.error(`Error: ${error.message}`);
      console.error(`Usage: ${error.usage || 'See help for usage information'}`);
      process.exit(1);
    } else if (error.code === 'ENOENT') {
      console.error('Error: Todo file not found. Use "add" command to create your first todo.');
      process.exit(1);
    } else if (error.code === 'EACCES') {
      console.error('Error: Permission denied. Check file permissions.');
      process.exit(1);
    } else if (error.code === 'ENOSPC') {
      console.error('Error: No space left on device.');
      process.exit(1);
    } else {
      // Handle unexpected errors
      console.error('An unexpected error occurred:', error.message);
      if (process.env.NODE_ENV === 'development') {
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  }
}

/**
 * Validates command line arguments
 * @param {string[]} argv - Process arguments array
 * @returns {Object} Parsed command and arguments
 */
function parseArguments(argv) {
  // Extract command from argv[2] (first argument after node and script)
  const command = argv[2];
  
  // Extract remaining arguments starting from argv[3]
  const args = argv.slice(3);
  
  return { command, args };
}

/**
 * Main CLI application function
 * Handles the complete flow of command parsing, routing, and execution
 */
async function main() {
  try {
    // Initialize the application
    await app.initialize?.();
    
    // Parse command line arguments
    const { command, args } = parseArguments(process.argv);
    
    // Handle no command provided - show help
    if (!command) {
      await commands.help();
      process.exit(0);
    }
    
    // Route and execute the command
    await routeCommand(command, args);
    
    // Successful execution
    process.exit(0);
    
  } catch (error) {
    // Handle initialization or unexpected errors
    console.error('Failed to start Todo CLI application:', error.message);
    
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

/**
 * Handle uncaught exceptions and unhandled rejections
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

/**
 * Handle graceful shutdown on SIGINT (Ctrl+C)
 */
process.on('SIGINT', () => {
  console.log('\nTodo CLI application interrupted. Goodbye!');
  process.exit(0);
});

/**
 * Handle graceful shutdown on SIGTERM
 */
process.on('SIGTERM', () => {
  console.log('Todo CLI application terminated. Goodbye!');
  process.exit(0);
});

// Execute main function if this module is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export main function for testing purposes
export default main;
export { routeCommand, parseArguments, VALID_COMMANDS };