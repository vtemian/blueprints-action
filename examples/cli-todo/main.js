#!/usr/bin/env node

/**
 * Todo CLI Application Entry Point
 * 
 * Main entry point for the command-line todo application.
 * Handles argument parsing, command routing, and error management.
 * 
 * @author Todo CLI Team
 * @version 1.0.0
 */

const process = require('process');
const app = require('./app');
const commands = require('./commands');

/**
 * Parses command-line arguments and extracts command and parameters
 * 
 * @param {string[]} argv - Process arguments array
 * @returns {Object} Parsed command object with command name and arguments
 */
function parseCommand(argv) {
  // Skip 'node' and script path (first 2 elements)
  const args = argv.slice(2);
  
  if (args.length === 0) {
    return { command: 'help', args: [] };
  }
  
  const [command, ...commandArgs] = args;
  return {
    command: command.toLowerCase(),
    args: commandArgs
  };
}

/**
 * Validates if the provided command is supported
 * 
 * @param {string} command - Command name to validate
 * @returns {boolean} True if command is valid, false otherwise
 */
function isValidCommand(command) {
  const validCommands = ['add', 'list', 'done', 'remove', 'help'];
  return validCommands.includes(command);
}

/**
 * Routes command to appropriate handler function
 * 
 * @param {string} command - Command name
 * @param {string[]} args - Command arguments
 * @returns {Promise<void>} Promise that resolves when command completes
 */
async function routeCommand(command, args) {
  switch (command) {
    case 'add':
      if (args.length === 0) {
        console.error('Error: Missing task description');
        console.error('Usage: todo add <task description>');
        process.exit(1);
      }
      await commands.add(args.join(' '));
      break;
      
    case 'list':
      await commands.list();
      break;
      
    case 'done':
      if (args.length === 0) {
        console.error('Error: Missing task ID');
        console.error('Usage: todo done <task-id>');
        process.exit(1);
      }
      const taskId = parseInt(args[0], 10);
      if (isNaN(taskId)) {
        console.error('Error: Task ID must be a number');
        process.exit(1);
      }
      await commands.done(taskId);
      break;
      
    case 'remove':
      if (args.length === 0) {
        console.error('Error: Missing task ID');
        console.error('Usage: todo remove <task-id>');
        process.exit(1);
      }
      const removeId = parseInt(args[0], 10);
      if (isNaN(removeId)) {
        console.error('Error: Task ID must be a number');
        process.exit(1);
      }
      await commands.remove(removeId);
      break;
      
    case 'help':
    default:
      await commands.help();
      break;
  }
}

/**
 * Main application function
 * Orchestrates the entire CLI flow from argument parsing to command execution
 * 
 * @returns {Promise<void>} Promise that resolves when application completes
 */
async function main() {
  try {
    // Initialize application
    await app.initialize();
    
    // Parse command-line arguments
    const { command, args } = parseCommand(process.argv);
    
    // Validate command
    if (!isValidCommand(command)) {
      console.error(`Error: Unknown command '${command}'`);
      console.error('Run "todo help" to see available commands');
      process.exit(1);
    }
    
    // Route and execute command
    await routeCommand(command, args);
    
    // Successful execution
    process.exit(0);
    
  } catch (error) {
    // Handle different types of errors
    if (error.code === 'ENOENT') {
      console.error('Error: Todo data file not found or inaccessible');
    } else if (error.code === 'EACCES') {
      console.error('Error: Permission denied accessing todo data');
    } else if (error.code === 'ENOSPC') {
      console.error('Error: No space left on device');
    } else if (error.name === 'ValidationError') {
      console.error(`Error: ${error.message}`);
    } else if (error.name === 'TaskNotFoundError') {
      console.error(`Error: ${error.message}`);
    } else {
      // Generic error handling
      console.error('Error: An unexpected error occurred');
      
      // In development, show full error details
      if (process.env.NODE_ENV === 'development') {
        console.error('Debug info:', error);
      }
    }
    
    // Exit with error code
    process.exit(1);
  }
}

/**
 * Handle uncaught exceptions gracefully
 */
process.on('uncaughtException', (error) => {
  console.error('Fatal Error: Uncaught exception occurred');
  if (process.env.NODE_ENV === 'development') {
    console.error(error);
  }
  process.exit(1);
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Fatal Error: Unhandled promise rejection');
  if (process.env.NODE_ENV === 'development') {
    console.error('Reason:', reason);
    console.error('Promise:', promise);
  }
  process.exit(1);
});

/**
 * Handle graceful shutdown on SIGINT (Ctrl+C)
 */
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down...');
  process.exit(0);
});

/**
 * Handle graceful shutdown on SIGTERM
 */
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Execute main function if this file is run directly
if (require.main === module) {
  main();
}

// Export main function for testing purposes
module.exports = {
  main,
  parseCommand,
  isValidCommand,
  routeCommand
};