#!/usr/bin/env node

/**
 * Todo CLI Application Entry Point
 * 
 * Main entry point for the command-line todo application.
 * Handles argument parsing, command routing, and error management.
 * 
 * Usage: node todo-cli.js [command] [args...]
 * Commands: add, list, done, remove, help
 */

const commands = require('./commands');
const app = require('./app');

/**
 * Main CLI function that processes command-line arguments and routes to appropriate handlers
 * 
 * @async
 * @function main
 * @returns {Promise<void>}
 * @throws {Error} Various errors related to command execution, file operations, or invalid input
 */
async function main() {
    try {
        // Initialize the application
        await app.initialize();

        // Parse command-line arguments (skip node path and script path)
        const args = process.argv.slice(2);
        
        // Handle empty arguments or help command
        if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
            await commands.help();
            process.exit(0);
        }

        // Extract primary command and remaining arguments
        const [primaryCommand, ...commandArgs] = args;
        const command = primaryCommand.toLowerCase().trim();

        // Validate command exists
        if (!command) {
            console.error('Error: No command provided.');
            await commands.help();
            process.exit(1);
        }

        // Route commands to appropriate handlers
        switch (command) {
            case 'add':
                if (commandArgs.length === 0) {
                    console.error('Error: Missing required argument for "add" command.');
                    console.error('Usage: todo-cli add <task description>');
                    console.error('Example: todo-cli add "Buy groceries"');
                    process.exit(1);
                }
                await commands.add(commandArgs.join(' '));
                break;

            case 'list':
                await commands.list(commandArgs);
                break;

            case 'done':
                if (commandArgs.length === 0) {
                    console.error('Error: Missing required argument for "done" command.');
                    console.error('Usage: todo-cli done <task_id>');
                    console.error('Example: todo-cli done 1');
                    process.exit(1);
                }
                
                const taskId = parseInt(commandArgs[0], 10);
                if (isNaN(taskId) || taskId <= 0) {
                    console.error('Error: Task ID must be a positive number.');
                    console.error('Usage: todo-cli done <task_id>');
                    process.exit(1);
                }
                
                await commands.done(taskId);
                break;

            case 'remove':
                if (commandArgs.length === 0) {
                    console.error('Error: Missing required argument for "remove" command.');
                    console.error('Usage: todo-cli remove <task_id>');
                    console.error('Example: todo-cli remove 1');
                    process.exit(1);
                }
                
                const removeId = parseInt(commandArgs[0], 10);
                if (isNaN(removeId) || removeId <= 0) {
                    console.error('Error: Task ID must be a positive number.');
                    console.error('Usage: todo-cli remove <task_id>');
                    process.exit(1);
                }
                
                await commands.remove(removeId);
                break;

            default:
                console.error(`Error: Unknown command "${command}".`);
                console.error('');
                await commands.help();
                process.exit(1);
        }

        // Successful execution
        process.exit(0);

    } catch (error) {
        // Handle different types of errors with appropriate messages
        if (error.code === 'ENOENT') {
            console.error('Error: Todo data file not found or inaccessible.');
            console.error('The application may need to be initialized or you may lack file permissions.');
        } else if (error.code === 'EACCES') {
            console.error('Error: Permission denied accessing todo data file.');
            console.error('Please check file permissions and try again.');
        } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
            console.error('Error: Too many open files. Please try again later.');
        } else if (error.code === 'ENOSPC') {
            console.error('Error: No space left on device. Cannot save todo data.');
        } else if (error.name === 'ValidationError') {
            console.error(`Error: ${error.message}`);
        } else if (error.name === 'TaskNotFoundError') {
            console.error(`Error: ${error.message}`);
        } else {
            // Log unexpected errors with details for debugging
            console.error('An unexpected error occurred:');
            console.error(`Error: ${error.message}`);
            
            // In development, show stack trace
            if (process.env.NODE_ENV === 'development') {
                console.error('Stack trace:', error.stack);
            }
        }
        
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
    process.exit(1);
});

// Handle process termination signals gracefully
process.on('SIGINT', () => {
    console.log('\nTodo CLI application terminated by user.');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nTodo CLI application terminated.');
    process.exit(0);
});

// Execute main function if this file is run directly
if (require.main === module) {
    main();
}

module.exports = { main };