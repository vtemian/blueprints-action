#!/usr/bin/env node

'use strict';

import { createRequire } from 'module';
import * as commands from './commands.js';
import app from './app.js';

const require = createRequire(import.meta.url);
const process = require('process');

/**
 * Main entry point for the Todo CLI application
 * Parses command-line arguments and routes to appropriate command handlers
 * 
 * @async
 * @function main
 * @returns {Promise<void>}
 * @throws {Error} When command execution fails or invalid arguments provided
 */
async function main() {
    try {
        // Parse command-line arguments (skip node path and script path)
        const args = process.argv.slice(2);
        
        // Handle empty arguments - show help
        if (args.length === 0) {
            await commands.help();
            process.exit(0);
        }

        // Extract command and remaining arguments
        const [command, ...commandArgs] = args;
        const normalizedCommand = command.toLowerCase().trim();

        // Command routing logic
        switch (normalizedCommand) {
            case 'add':
                if (commandArgs.length === 0) {
                    console.error('Error: Missing task description');
                    console.error('Usage: todo add <task description>');
                    console.error('Example: todo add "Buy groceries"');
                    process.exit(1);
                }
                await commands.add(commandArgs.join(' '));
                break;

            case 'list':
                await commands.list();
                break;

            case 'done':
                if (commandArgs.length === 0) {
                    console.error('Error: Missing task ID');
                    console.error('Usage: todo done <task_id>');
                    console.error('Example: todo done 1');
                    process.exit(1);
                }
                
                const doneTaskId = parseInt(commandArgs[0], 10);
                if (isNaN(doneTaskId) || doneTaskId <= 0) {
                    console.error('Error: Task ID must be a positive number');
                    console.error('Usage: todo done <task_id>');
                    process.exit(1);
                }
                
                await commands.done(doneTaskId);
                break;

            case 'remove':
                if (commandArgs.length === 0) {
                    console.error('Error: Missing task ID');
                    console.error('Usage: todo remove <task_id>');
                    console.error('Example: todo remove 1');
                    process.exit(1);
                }
                
                const removeTaskId = parseInt(commandArgs[0], 10);
                if (isNaN(removeTaskId) || removeTaskId <= 0) {
                    console.error('Error: Task ID must be a positive number');
                    console.error('Usage: todo remove <task_id>');
                    process.exit(1);
                }
                
                await commands.remove(removeTaskId);
                break;

            case 'help':
            case '--help':
            case '-h':
                await commands.help();
                break;

            default:
                console.error(`Error: Unknown command '${command}'`);
                console.error('Run "todo help" to see available commands');
                await commands.help();
                process.exit(1);
        }

        // Successful completion
        process.exit(0);

    } catch (error) {
        // Handle different types of errors with appropriate messages
        if (error.code === 'ENOENT') {
            console.error('Error: Todo data file not found. Run "todo list" to initialize.');
        } else if (error.code === 'EACCES') {
            console.error('Error: Permission denied. Check file permissions for todo data.');
        } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
            console.error('Error: Too many open files. Please try again.');
        } else if (error.name === 'SyntaxError') {
            console.error('Error: Todo data file is corrupted. Please check the file format.');
        } else if (error.message.includes('Task not found')) {
            console.error(`Error: ${error.message}`);
            console.error('Run "todo list" to see available tasks');
        } else if (error.message.includes('Invalid task')) {
            console.error(`Error: ${error.message}`);
        } else {
            // Generic error handling
            console.error(`Error: ${error.message || 'An unexpected error occurred'}`);
            
            // In development, show stack trace
            if (process.env.NODE_ENV === 'development') {
                console.error('Stack trace:', error.stack);
            }
        }
        
        process.exit(1);
    }
}

/**
 * Error boundary for the main application
 * Ensures any unhandled errors are caught and logged appropriately
 */
async function bootstrap() {
    try {
        await main();
    } catch (error) {
        console.error('Fatal error: Application failed to start');
        console.error(error.message);
        
        if (process.env.NODE_ENV === 'development') {
            console.error('Stack trace:', error.stack);
        }
        
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
    if (process.env.NODE_ENV === 'development') {
        console.error('Stack trace:', error.stack);
    }
    process.exit(1);
});

// Graceful shutdown on SIGINT (Ctrl+C)
process.on('SIGINT', () => {
    console.log('\nTodo application interrupted. Goodbye!');
    process.exit(0);
});

// Graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
    console.log('Todo application terminated. Goodbye!');
    process.exit(0);
});

// Start the application
bootstrap();

export default main;