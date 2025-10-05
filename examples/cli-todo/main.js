#!/usr/bin/env node

/**
 * Todo CLI Application Entry Point
 * Main module that handles command-line argument parsing, routing, and error handling
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import process from 'process';
import app from './src/app.js';
import * as commands from './src/commands/index.js';

// ES6 module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main application entry point
 * Parses command line arguments, routes to appropriate handlers, and manages error handling
 * 
 * @async
 * @function main
 * @returns {Promise<void>}
 */
async function main() {
    try {
        // Initialize application
        await app.initialize();

        // Parse command line arguments (skip node path and script path)
        const args = process.argv.slice(2);
        
        // Handle empty arguments - show help
        if (args.length === 0) {
            await commands.help();
            process.exit(0);
        }

        // Extract command and remaining arguments
        const [command, ...commandArgs] = args;
        const normalizedCommand = command.toLowerCase().trim();

        // Validate and sanitize command input
        if (!normalizedCommand || typeof normalizedCommand !== 'string') {
            console.error('Error: Invalid command format');
            await commands.help();
            process.exit(1);
        }

        // Route to appropriate command handler
        switch (normalizedCommand) {
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
            case 'rm':
                await handleRemoveCommand(commandArgs);
                break;
                
            case 'help':
            case '--help':
            case '-h':
                await commands.help();
                break;
                
            default:
                console.error(`Error: Unknown command '${command}'`);
                console.error('Run "todo help" to see available commands');
                process.exit(1);
        }

        // Successful execution
        process.exit(0);

    } catch (error) {
        await handleGlobalError(error);
    }
}

/**
 * Handle 'add' command with validation
 * @param {string[]} args - Command arguments
 */
async function handleAddCommand(args) {
    if (args.length === 0) {
        console.error('Error: Missing todo description');
        console.error('Usage: todo add <description>');
        console.error('Example: todo add "Buy groceries"');
        process.exit(1);
    }

    // Join all arguments to form the complete description
    const description = args.join(' ').trim();
    
    if (description.length === 0) {
        console.error('Error: Todo description cannot be empty');
        process.exit(1);
    }

    if (description.length > 500) {
        console.error('Error: Todo description too long (max 500 characters)');
        process.exit(1);
    }

    await commands.add(description);
}

/**
 * Handle 'list' command with optional filters
 * @param {string[]} args - Command arguments
 */
async function handleListCommand(args) {
    // List command can accept optional filter arguments
    const options = parseListOptions(args);
    await commands.list(options);
}

/**
 * Handle 'done' command with validation
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
        console.error('Error: Invalid todo ID. Must be a positive number');
        console.error('Use "todo list" to see available todo IDs');
        process.exit(1);
    }

    await commands.done(todoId);
}

/**
 * Handle 'remove' command with validation
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
        console.error('Error: Invalid todo ID. Must be a positive number');
        console.error('Use "todo list" to see available todo IDs');
        process.exit(1);
    }

    await commands.remove(todoId);
}

/**
 * Parse list command options
 * @param {string[]} args - Command arguments
 * @returns {Object} Parsed options
 */
function parseListOptions(args) {
    const options = {
        filter: 'all', // all, pending, completed
        sort: 'id'     // id, date, priority
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i].toLowerCase();
        
        switch (arg) {
            case '--pending':
            case '-p':
                options.filter = 'pending';
                break;
            case '--completed':
            case '-c':
                options.filter = 'completed';
                break;
            case '--sort-date':
                options.sort = 'date';
                break;
            case '--sort-priority':
                options.sort = 'priority';
                break;
        }
    }

    return options;
}

/**
 * Handle global application errors
 * @param {Error} error - The error object
 */
async function handleGlobalError(error) {
    console.error('An unexpected error occurred:');
    
    // Handle specific error types
    if (error.code === 'ENOENT') {
        console.error('Error: Todo data file not found or inaccessible');
        console.error('The application will create a new todo list');
    } else if (error.code === 'EACCES') {
        console.error('Error: Permission denied accessing todo data file');
        console.error('Please check file permissions or run with appropriate privileges');
    } else if (error.code === 'ENOSPC') {
        console.error('Error: No space left on device');
        console.error('Please free up disk space and try again');
    } else if (error.name === 'ValidationError') {
        console.error(`Error: ${error.message}`);
    } else if (error.name === 'TodoNotFoundError') {
        console.error(`Error: ${error.message}`);
        console.error('Use "todo list" to see available todos');
    } else {
        // Generic error handling
        console.error(`Error: ${error.message || 'Unknown error occurred'}`);
        
        // In development, show stack trace
        if (process.env.NODE_ENV === 'development') {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
    }

    process.exit(1);
}

/**
 * Handle process termination signals gracefully
 */
function setupGracefulShutdown() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach(signal => {
        process.on(signal, async () => {
            console.log(`\nReceived ${signal}. Shutting down gracefully...`);
            
            try {
                await app.cleanup();
                console.log('Cleanup completed successfully');
                process.exit(0);
            } catch (error) {
                console.error('Error during cleanup:', error.message);
                process.exit(1);
            }
        });
    });
}

/**
 * Handle uncaught exceptions and unhandled rejections
 */
function setupErrorHandlers() {
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
}

// Initialize error handlers and graceful shutdown
setupErrorHandlers();
setupGracefulShutdown();

// Execute main function only if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(handleGlobalError);
}

export default main;