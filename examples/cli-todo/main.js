#!/usr/bin/env node

/**
 * CLI Todo Application Entry Point
 * 
 * A production-ready command-line interface for managing todos.
 * Supports add, list, done, remove, and help commands with comprehensive error handling.
 * 
 * @author Senior JavaScript Developer
 * @version 1.0.0
 */

'use strict';

const process = require('process');

// Import application modules
let app, commands;

try {
  // Try importing from modular structure first, fallback to single files
  try {
    app = require('./app/index.js');
    commands = require('./commands/index.js');
  } catch (moduleError) {
    app = require('./app.js');
    commands = require('./commands.js');
  }
} catch (importError) {
  console.error('Error: Failed to load application modules.');
  console.error('Please ensure app.js and commands.js exist in the project directory.');
  process.exit(1);
}

/**
 * Display usage information for specific commands
 */
const showCommandUsage = (command) => {
  const usageMap = {
    add: 'Usage: todo add <task description>',
    done: 'Usage: todo done <task id>',
    remove: 'Usage: todo remove <task id>',
    list: 'Usage: todo list'
  };
  
  console.error(`Error: Missing required arguments for '${command}' command.`);
  console.error(usageMap[command] || 'Usage: todo help');
};

/**
 * Validate command arguments
 */
const validateCommand = (command, args) => {
  switch (command) {
    case 'add':
      if (args.length === 0) {
        showCommandUsage('add');
        return false;
      }
      break;
    case 'done':
    case 'remove':
      if (args.length === 0) {
        showCommandUsage(command);
        return false;
      }
      // Validate that the argument is a number for done/remove commands
      const id = parseInt(args[0], 10);
      if (isNaN(id) || id <= 0) {
        console.error(`Error: Invalid task ID '${args[0]}'. Please provide a valid positive number.`);
        return false;
      }
      break;
    case 'list':
    case 'help':
      // These commands don't require additional arguments
      break;
    default:
      return false;
  }
  return true;
};

/**
 * Route commands to appropriate handlers
 */
const routeCommand = async (command, args) => {
  // Validate command exists
  if (!commands[command]) {
    console.error(`Error: Unknown command '${command}'.`);
    await commands.help();
    process.exit(1);
  }

  // Validate command arguments
  if (!validateCommand(command, args)) {
    process.exit(1);
  }

  // Execute the command
  try {
    switch (command) {
      case 'add':
        // Join all arguments to support multi-word task descriptions
        const taskDescription = args.join(' ').trim();
        await commands.add(taskDescription);
        break;
      case 'list':
        await commands.list();
        break;
      case 'done':
        const doneId = parseInt(args[0], 10);
        await commands.done(doneId);
        break;
      case 'remove':
        const removeId = parseInt(args[0], 10);
        await commands.remove(removeId);
        break;
      case 'help':
        await commands.help();
        break;
      default:
        // This should never be reached due to earlier validation
        throw new Error(`Unhandled command: ${command}`);
    }
  } catch (error) {
    // Handle specific error types
    if (error.code === 'ENOENT') {
      console.error('Error: Todo data file not found. Run "todo add <task>" to create your first todo.');
    } else if (error.code === 'EACCES') {
      console.error('Error: Permission denied. Please check file permissions.');
    } else if (error.code === 'ENOSPC') {
      console.error('Error: No space left on device. Please free up some disk space.');
    } else if (error.message && error.message.includes('JSON')) {
      console.error('Error: Todo data file is corrupted. Please check the file format.');
    } else if (error.message) {
      // Display user-friendly error messages from commands
      console.error(`Error: ${error.message}`);
    } else {
      // Fallback for unexpected errors
      console.error('Error: An unexpected error occurred while executing the command.');
      console.error('Please try again or contact support if the problem persists.');
    }
    
    process.exit(1);
  }
};

/**
 * Main application entry point
 */
const main = async () => {
  try {
    // Parse command line arguments (strip 'node' and script name)
    const args = process.argv.slice(2);
    
    // Handle no arguments - show help
    if (args.length === 0) {
      await commands.help();
      process.exit(0);
    }
    
    // Extract command and remaining arguments
    const [command, ...commandArgs] = args;
    const normalizedCommand = command.toLowerCase().trim();
    
    // Handle help command variations
    if (normalizedCommand === 'help' || normalizedCommand === '--help' || normalizedCommand === '-h') {
      await commands.help();
      process.exit(0);
    }
    
    // Route to appropriate command handler
    await routeCommand(normalizedCommand, commandArgs);
    
    // Successful execution
    process.exit(0);
    
  } catch (error) {
    // Handle any uncaught errors in main execution
    console.error('Error: A critical error occurred.');
    
    // Log detailed error in development/debug mode
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      console.error('Debug information:', error);
    }
    
    process.exit(1);
  }
};

/**
 * Handle uncaught exceptions and unhandled promise rejections
 */
process.on('uncaughtException', (error) => {
  console.error('Error: A critical system error occurred.');
  if (process.env.NODE_ENV === 'development') {
    console.error('Uncaught Exception:', error);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Error: An unhandled promise rejection occurred.');
  if (process.env.NODE_ENV === 'development') {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  }
  process.exit(1);
});

/**
 * Handle process termination signals gracefully
 */
process.on('SIGINT', () => {
  console.log('\nOperation cancelled by user.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nApplication terminated.');
  process.exit(0);
});

// Execute main function only if this file is run directly
if (require.main === module) {
  main();
}

// Export for testing purposes
module.exports = {
  main,
  routeCommand,
  validateCommand
};