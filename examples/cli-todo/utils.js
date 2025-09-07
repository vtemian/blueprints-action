/**
 * Utility module for argument parsing and display formatting
 * @fileoverview Production-ready utility functions for CLI applications
 * @author Generated Utility Module
 * @version 1.0.0
 */

'use strict';

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

/**
 * Check if terminal supports colors
 * @returns {boolean} True if colors are supported
 */
const supportsColor = () => {
  try {
    if (typeof process === 'undefined' || !process.stdout) {
      return false;
    }
    
    const { env, stdout } = process;
    
    // Check for explicit color support
    if (env.FORCE_COLOR) {
      return true;
    }
    
    // Check for no color flags
    if (env.NO_COLOR || env.NODE_DISABLE_COLORS) {
      return false;
    }
    
    // Check if stdout is a TTY and supports colors
    return stdout.isTTY && (
      env.TERM !== 'dumb' &&
      (env.COLORTERM || env.TERM === 'truecolor' || /^screen|^xterm|^vt100|color|ansi|cygwin|linux/i.test(env.TERM))
    );
  } catch (error) {
    return false;
  }
};

/**
 * Apply color to text if colors are supported
 * @param {string} text - Text to colorize
 * @param {string} color - Color name from COLORS object
 * @returns {string} Colored or plain text
 */
const colorize = (text, color) => {
  if (!supportsColor() || !COLORS[color]) {
    return text;
  }
  return `${COLORS[color]}${text}${COLORS.reset}`;
};

/**
 * Parse command line arguments into structured format
 * @param {string[]} args - Array of command line arguments
 * @returns {Object} Parsed arguments object
 * @example
 * parseArgs(['add', 'Buy milk', '--priority', 'high', '--due', '2024-01-01'])
 * // Returns: { command: 'add', text: 'Buy milk', flags: ['--priority', '--due'], values: { priority: 'high', due: '2024-01-01' } }
 */
const parseArgs = (args) => {
  try {
    if (!Array.isArray(args)) {
      throw new TypeError('Arguments must be an array');
    }

    const result = {
      command: null,
      text: null,
      flags: [],
      values: {},
      remaining: []
    };

    if (args.length === 0) {
      return result;
    }

    let i = 0;
    
    // First non-flag argument is the command
    if (args[i] && !args[i].startsWith('-')) {
      result.command = args[i];
      i++;
    }

    // Process remaining arguments
    while (i < args.length) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        // Long flag
        const flag = arg.substring(2);
        result.flags.push(arg);
        
        // Check if next argument is a value (not a flag)
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          result.values[flag] = args[i + 1];
          i += 2;
        } else {
          result.values[flag] = true;
          i++;
        }
      } else if (arg.startsWith('-') && arg.length > 1) {
        // Short flag(s)
        const flags = arg.substring(1).split('');
        flags.forEach(flag => {
          result.flags.push(`-${flag}`);
          result.values[flag] = true;
        });
        i++;
      } else {
        // Regular argument (could be text or remaining)
        if (!result.text && result.command) {
          result.text = arg;
        } else {
          result.remaining.push(arg);
        }
        i++;
      }
    }

    return result;
  } catch (error) {
    throw new Error(`Failed to parse arguments: ${error.message}`);
  }
};

/**
 * Check if a specific flag exists in arguments
 * @param {string[]} args - Array of command line arguments
 * @param {string} flag - Flag to search for (with or without dashes)
 * @returns {boolean} True if flag exists
 * @example
 * getFlag(['--verbose', '-h', 'command'], 'verbose') // Returns: true
 * getFlag(['--verbose', '-h', 'command'], 'help') // Returns: true
 */
const getFlag = (args, flag) => {
  try {
    if (!Array.isArray(args)) {
      throw new TypeError('Arguments must be an array');
    }
    
    if (typeof flag !== 'string' || flag.length === 0) {
      throw new TypeError('Flag must be a non-empty string');
    }

    const normalizedFlag = flag.startsWith('-') ? flag : `--${flag}`;
    const shortFlag = flag.length === 1 ? `-${flag}` : `-${flag.charAt(0)}`;
    
    return args.some(arg => 
      arg === normalizedFlag || 
      arg === shortFlag ||
      (arg.startsWith('-') && !arg.startsWith('--') && arg.includes(flag.charAt(0)))
    );
  } catch (error) {
    throw new Error(`Failed to check flag: ${error.message}`);
  }
};

/**
 * Get the value that follows a specific flag
 * @param {string[]} args - Array of command line arguments
 * @param {string} flag - Flag to search for
 * @returns {string|null} Value following the flag, or null if not found
 * @example
 * getFlagValue(['--priority', 'high', '--due', '2024-01-01'], 'priority') // Returns: 'high'
 */
const getFlagValue = (args, flag) => {
  try {
    if (!Array.isArray(args)) {
      throw new TypeError('Arguments must be an array');
    }
    
    if (typeof flag !== 'string' || flag.length === 0) {
      throw new TypeError('Flag must be a non-empty string');
    }

    const normalizedFlag = flag.startsWith('-') ? flag : `--${flag}`;
    
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] === normalizedFlag) {
        const nextArg = args[i + 1];
        // Return value if it's not another flag
        if (!nextArg.startsWith('-')) {
          return nextArg;
        }
      }
    }
    
    return null;
  } catch (error) {
    throw new Error(`Failed to get flag value: ${error.message}`);
  }
};

/**
 * Extract and return array of numeric IDs from arguments
 * @param {string[]} args - Array of command line arguments
 * @returns {number[]} Array of numeric IDs
 * @example
 * parseIds(['1', '2', '5', 'not-a-number', '10']) // Returns: [1, 2, 5, 10]
 */
const parseIds = (args) => {
  try {
    if (!Array.isArray(args)) {
      throw new TypeError('Arguments must be an array');
    }

    return args
      .map(arg => {
        const num = parseInt(arg, 10);
        return isNaN(num) ? null : num;
      })
      .filter(id => id !== null && id > 0);
  } catch (error) {
    throw new Error(`Failed to parse IDs: ${error.message}`);
  }
};

/**
 * Create properly aligned ASCII table with borders
 * @param {string[]} headers - Array of column headers
 * @param {string[][]} rows - Array of row data arrays
 * @returns {string} Formatted table string
 * @example
 * formatTable(['ID', 'Status', 'Todo'], [['1', '[ ]', 'Buy milk'], ['2', '[✓]', 'Walk dog']])
 */
const formatTable = (headers, rows) => {
  try {
    if (!Array.isArray(headers) || !Array.isArray(rows)) {
      throw new TypeError('Headers and rows must be arrays');
    }

    if (headers.length === 0) {
      return '';
    }

    // Calculate column widths
    const colWidths = headers.map((header, index) => {
      const headerWidth = header.length;
      const maxRowWidth = rows.reduce((max, row) => {
        const cellContent = row[index] || '';
        return Math.max(max, cellContent.length);
      }, 0);
      return Math.max(headerWidth, maxRowWidth);
    });

    // Helper function to pad text
    const padText = (text, width) => {
      const str = String(text || '');
      return str + ' '.repeat(Math.max(0, width - str.length));
    };

    // Build table
    const lines = [];
    
    // Header row
    const headerRow = headers
      .map((header, index) => padText(header, colWidths[index]))
      .join(' | ');
    lines.push(headerRow);
    
    // Separator row
    const separator = colWidths
      .map(width => '-'.repeat(width))
      .join('-+-');
    lines.push(separator);
    
    // Data rows
    rows.forEach(row => {
      const dataRow = headers
        .map((_, index) => padText(row[index] || '', colWidths[index]))
        .join(' | ');
      lines.push(dataRow);
    });

    return lines.join('\n');
  } catch (error) {
    throw new Error(`Failed to format table: ${error.message}`);
  }
};

/**
 * Format a single todo object for display
 * @param {Object} todo - Todo object with id, text, completed, priority, etc.
 * @returns {string} Formatted todo string
 * @example
 * formatTodo({ id: 1, text: 'Buy milk', completed: false, priority: 'high' })
 * // Returns: "1. [ ] Buy milk (high priority)"
 */
const formatTodo = (todo) => {
  try {
    if (!todo || typeof todo !== 'object') {
      throw new TypeError('Todo must be an object');
    }

    const {
      id = '?',
      text = 'No description',
      completed = false,
      priority = null,
      createdAt = null,
      dueDate = null
    } = todo;

    // Status indicator
    const status = completed ? '[✓]' : '[ ]';
    const statusColored = completed 
      ? colorize('[✓]', 'green') 
      : '[ ]';

    // Priority indicator
    let priorityText = '';
    if (priority) {
      const priorityColor = priority === 'high' ? 'red' : priority === 'medium' ? 'yellow' : 'blue';
      priorityText = ` (${colorize(priority, priorityColor)} priority)`;
    }

    // Date information
    let dateText = '';
    if (dueDate) {
      dateText = ` [Due: ${formatDate(dueDate)}]`;
    } else if (createdAt) {
      dateText = ` [Created: ${formatDate(createdAt)}]`;
    }

    return `${id}. ${statusColored} ${text}${priorityText}${dateText}`;
  } catch (error) {
    throw new Error(`Failed to format todo: ${error.message}`);
  }
};

/**
 * Truncate text with ellipsis if exceeds max length
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length (default: 50)
 * @returns {string} Truncated text
 * @example
 * truncate('This is a very long text that needs truncating', 20)
 * // Returns: "This is a very lo..."
 */
const truncate = (text, maxLen = 50) => {
  try {
    if (typeof text !== 'string') {
      text = String(text || '');
    }
    
    if (typeof maxLen !== 'number' || maxLen < 0) {
      throw new TypeError('Max length must be a non-negative number');
    }

    if (maxLen < 3) {
      return text.substring(0, maxLen);
    }

    return text.length <= maxLen ? text : text.substring(0, maxLen - 3) + '...';
  } catch (error) {
    throw new Error(`Failed to truncate text: ${error.message}`);
  }
};

/**
 * Convert date to relative time format
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted relative time or absolute date
 * @example
 * formatDate(new Date(Date.now() - 30 * 60 * 1000)) // Returns: "30 minutes ago"
 * formatDate(new Date(Date.now() - 25 * 60 * 60 * 1000)) // Returns: "1 day ago"
 */
const formatDate = (date) => {
  try {
    let dateObj;
    
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
      dateObj = new Date(date);
    } else {
      throw new TypeError('Date must be a Date object, string, or number');
    }

    if (isNaN(dateObj.getTime())) {
      throw new Error('Invalid date provided');
    }

    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Future dates
    if (diffMs < 0) {
      const futureDays = Math.abs(diffDays);
      if (futureDays === 0) {
        return 'today';
      } else if (futureDays === 1) {
        return 'tomorrow';
      } else if (futureDays < 7) {
        return `in ${futureDays} days`;
      } else {
        return dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
    }

    // Past dates
    if (diffMinutes < 60) {
      return diffMinutes <= 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
    } else if (diffHours < 24) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else if (diffDays < 7) {
      return diffDays === 1 ? '1 day ago' : `${diffDays}