#!/usr/bin/env node

import * as commands from './commands.js';
import process from 'process';

/**
 * Parse command line arguments, skipping node executable and script name
 * @returns {Object} Parsed command and arguments
 */
function parseArguments() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    const commandArgs = args.slice(1);
    
    return { command, args: commandArgs };
}

/**
 * Route commands to their respective handlers
 * @param {string} command - The command to execute
 * @param {Array} args - Arguments passed to the command
 */
async function routeCommand(command, args) {
    // Command routing mapping
    const commandMap = {
        'add': commands.add,
        'list': commands.list,
        'done': commands.done,
        'remove': commands.remove,
        'help': commands.help
    };

    // Check if command exists
    if (!commandMap[command]) {
        console.error(`Error: Unknown command '${command}'`);
        console.error('Run "todo help" to see available commands.');
        return false;
    }

    try {
        // Execute the command with provided arguments
        await commandMap[command](args);
        return true;
    } catch (error) {
        // Handle different types of errors
        if (error.code === 'ENOENT') {
            console.error('Error: Todo data file not found. Add your first todo to get started.');
        } else if (error.code === 'EACCES') {
            console.error('Error: Permission denied. Check file permissions.');
        } else if (error.message.includes('Invalid arguments')) {
            console.error(`Error: ${error.message}`);
            console.error(`Run "todo help" for usage information.`);
        } else if (error.message.includes('Todo not found')) {
            console.error(`Error: ${error.message}`);
        } else {
            console.error(`Error: ${error.message || 'An unexpected error occurred'}`);
        }
        return false;
    }
}

/**
 * Main application entry point
 */
async function main() {
    try {
        // Parse command line arguments
        const { command, args } = parseArguments();
        
        // Route and execute command
        const success = await routeCommand(command, args);
        
        // Exit with appropriate code
        process.exit(success ? 0 : 1);
        
    } catch (error) {
        // Handle any unhandled errors in main execution
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error.message);
    process.exit(1);
});

// Start the application
main();