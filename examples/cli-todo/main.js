#!/usr/bin/env node

/**
 * Todo CLI Application - Main Entry Point
 * Handles command-line argument parsing, routing, and error management
 */

// Import required modules
import { commands } from './commands.js';
import { fileExists, ensureTodoFile } from './utils.js';

/**
 * Main CLI orchestration function
 * Parses arguments, routes commands, and handles errors
 */
async function main() {
    try {
        // Parse command-line arguments (skip 'node' and script name)
        const args = process.argv.slice(2);
        
        // Handle empty arguments - show help
        if (args.length === 0) {
            await executeCommand('help', []);
            process.exit(0);
        }

        // Extract command and its arguments
        const [command, ...commandArgs] = args;
        
        // Validate and route command
        await routeCommand(command.toLowerCase(), commandArgs);
        
        // Successful execution
        process.exit(0);
        
    } catch (error) {
        // Handle any uncaught errors
        console.error('Error:', error.message);
        process.exit(1);
    }
}

/**
 * Routes commands to appropriate handler functions
 * @param {string} command - The command to execute
 * @param {string[]} args - Arguments for the command
 */
async function routeCommand(command, args) {
    // Define valid commands and their argument requirements
    const commandMap = {
        'add': { handler: commands.add, minArgs: 1, usage: 'add <task description>' },
        'list': { handler: commands.list, minArgs: 0, usage: 'list' },
        'done': { handler: commands.done, minArgs: 1, usage: 'done <task_id>' },
        'remove': { handler: commands.remove, minArgs: 1, usage: 'remove <task_id>' },
        'help': { handler: commands.help, minArgs: 0, usage: 'help' }
    };

    // Check if command exists
    if (!commandMap[command]) {
        console.error(`Unknown command: ${command}`);
        console.error('Run "todo help" to see available commands.');
        process.exit(1);
    }

    const { handler, minArgs, usage } = commandMap[command];

    // Validate argument count
    if (args.length < minArgs) {
        console.error(`Missing required arguments for "${command}" command.`);
        console.error(`Usage: todo ${usage}`);
        process.exit(1);
    }

    // Execute the command
    await executeCommand(command, args, handler);
}

/**
 * Executes a command with proper error handling
 * @param {string} commandName - Name of the command being executed
 * @param {string[]} args - Command arguments
 * @param {Function} handler - Command handler function
 */
async function executeCommand(commandName, args, handler = null) {
    try {
        // For non-help commands, ensure todo file exists
        if (commandName !== 'help') {
            await ensureTodoFile();
        }

        // Execute the command handler
        if (handler) {
            await handler(args);
        } else {
            // Fallback for help command when called directly
            await commands.help();
        }

    } catch (error) {
        // Handle specific error types with user-friendly messages
        handleCommandError(error, commandName);
    }
}

/**
 * Handles different types of errors with appropriate user messages
 * @param {Error} error - The error that occurred
 * @param {string} commandName - The command that failed
 */
function handleCommandError(error, commandName) {
    let errorMessage = 'An unexpected error occurred.';

    // Handle specific error types
    if (error.code === 'ENOENT') {
        errorMessage = 'Unable to access todo file. Please check file permissions.';
    } else if (error.code === 'EACCES') {
        errorMessage = 'Permission denied. Unable to read or write todo file.';
    } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
        errorMessage = 'Too many open files. Please try again.';
    } else if (error.name === 'ValidationError') {
        errorMessage = error.message;
    } else if (error.name === 'TodoNotFoundError') {
        errorMessage = `Task not found. Use "todo list" to see available tasks.`;
    } else if (error.name === 'InvalidIdError') {
        errorMessage = 'Invalid task ID. Please provide a valid number.';
    } else if (error.message) {
        errorMessage = error.message;
    }

    console.error(`Error executing "${commandName}" command: ${errorMessage}`);
    process.exit(1);
}

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection:', reason);
    process.exit(1);
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
    process.exit(1);
});

// Execute main function if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { main };