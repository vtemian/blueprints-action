#!/usr/bin/env node

/**
 * CLI Todo Application Entry Point
 * Main controller for handling command line interface interactions
 */

import { createRequire } from 'module';
import process from 'process';

// Local module imports with error handling
let app, commands;

try {
  const appModule = await import('./app.js');
  const commandsModule = await import('./commands.js');
  
  app = appModule.default || appModule;
  commands = commandsModule.default || commandsModule;
} catch (importError) {
  console.error('Error: Failed to load application modules');
  console.error('Please ensure app.js and commands.js are present in the same directory');
  process.exit(1);
}

/**
 * Valid commands supported by the CLI application
 */
const VALID_COMMANDS = ['add', 'list', 'done', 'remove', 'help'];

/**
 * Parses command line arguments and extracts command and parameters
 * @returns {Object} Object containing command and arguments
 */
function parseCommandLineArgs() {
  // Skip first two elements (node path and script path)
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    return { command: 'help', args: [] };
  }
  
  const [command, ...remainingArgs] = args;
  return { 
    command: command.toLowerCase().trim(), 
    args: remainingArgs 
  };
}

/**
 * Validates if the provided command is supported
 * @param {string} command - The command to validate
 * @returns {boolean} True if command is valid, false otherwise
 */
function isValidCommand(command) {
  return VALID_COMMANDS.includes(command);
}

/**
 * Routes the command to appropriate handler function
 * @param {string} command - The command to execute
 * @param {Array} args - Arguments for the command
 */
async function routeCommand(command, args) {
  try {
    switch (command) {
      case 'add':
        if (args.length === 0) {
          console.error('Error: Missing task description');
          console.error('Usage: todo add <task description>');
          process.exit(1);
        }
        await commands.add(args);
        break;
        
      case 'list':
        await commands.list(args);
        break;
        
      case 'done':
        if (args.length === 0) {
          console.error('Error: Missing task ID or description');
          console.error('Usage: todo done <task_id>');
          process.exit(1);
        }
        await commands.done(args);
        break;
        
      case 'remove':
        if (args.length === 0) {
          console.error('Error: Missing task ID or description');
          console.error('Usage: todo remove <task_id>');
          process.exit(1);
        }
        await commands.remove(args);
        break;
        
      case 'help':
        await commands.help();
        break;
        
      default:
        console.error(`Error: Unknown command '${command}'`);
        console.error('Run "todo help" to see available commands');
        process.exit(1);
    }
  } catch (commandError) {
    handleCommandError(commandError, command);
  }
}

/**
 * Handles errors that occur during command execution
 * @param {Error} error - The error that occurred
 * @param {string} command - The command that was being executed
 */
function handleCommandError(error, command) {
  // Handle specific error types
  if (error.code === 'ENOENT') {
    console.error('Error: Todo data file not found or inaccessible');
    console.error('The application may need to be initialized first');
  } else if (error.code === 'EACCES') {
    console.error('Error: Permission denied accessing todo data');
    console.error('Please check file permissions');
  } else if (error.name === 'ValidationError') {
    console.error(`Error: ${error.message}`);
  } else if (error.name === 'NotFoundError') {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(`Error executing '${command}' command:`);
    console.error(error.message || 'An unexpected error occurred');
    
    // In development, show stack trace
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
  }
  
  process.exit(1);
}

/**
 * Main application entry point
 * Orchestrates command parsing, validation, and execution
 */
async function main() {
  try {
    // Parse command line arguments
    const { command, args } = parseCommandLineArgs();
    
    // Validate command
    if (!isValidCommand(command) && command !== 'help') {
      console.error(`Error: Invalid command '${command}'`);
      console.error('Run "todo help" to see available commands');
      process.exit(1);
    }
    
    // Route to appropriate command handler
    await routeCommand(command, args);
    
    // Successful execution
    process.exit(0);
    
  } catch (error) {
    // Handle any uncaught errors
    console.error('Fatal error: Application encountered an unexpected problem');
    console.error(error.message);
    
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  console.error('Please report this issue if it persists');
  process.exit(1);
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  console.error('Application will now exit');
  process.exit(1);
});

/**
 * Graceful shutdown on SIGINT (Ctrl+C)
 */
process.on('SIGINT', () => {
  console.log('\nOperation cancelled by user');
  process.exit(0);
});

// Execute main function only if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export main function for testing purposes
export { main, parseCommandLineArgs, isValidCommand, routeCommand };