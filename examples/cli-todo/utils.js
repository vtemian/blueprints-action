/**
 * Utility functions for parsing and display
 * @module utils
 */

const os = require('os');
const tty = require('tty');

// ANSI Color Constants
const COLORS = {
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  BOLD: '\x1b[1m'
};

/**
 * Detect if terminal supports color output
 * @returns {boolean} True if colors are supported
 */
function supportsColor() {
  if (process.env.NO_COLOR || process.env.NODE_DISABLE_COLORS) {
    return false;
  }
  
  if (process.env.FORCE_COLOR) {
    return true;
  }
  
  return tty.isatty(process.stdout.fd) && process.env.TERM !== 'dumb';
}

/**
 * Apply color to text if colors are supported
 * @param {string} text - Text to colorize
 * @param {string} color - ANSI color code
 * @returns {string} Colored or plain text
 */
function colorize(text, color) {
  if (typeof text !== 'string') {
    text = String(text);
  }
  
  return supportsColor() ? `${color}${text}${COLORS.RESET}` : text;
}

/**
 * Apply green color to text
 * @param {string} text - Text to colorize
 * @returns {string} Green colored text or plain text
 */
function green(text) {
  return colorize(text, COLORS.GREEN);
}

/**
 * Apply red color to text
 * @param {string} text - Text to colorize
 * @returns {string} Red colored text or plain text
 */
function red(text) {
  return colorize(text, COLORS.RED);
}

/**
 * Apply bold formatting to text
 * @param {string} text - Text to make bold
 * @returns {string} Bold text or plain text
 */
function bold(text) {
  return colorize(text, COLORS.BOLD);
}

// Argument Parsing Functions

/**
 * Extract command, text, and flags from array of strings
 * @param {string[]} args - Array of command line arguments
 * @returns {Object} Parsed arguments object with command, text, and flags
 * @example
 * parseArgs(['add', 'Buy milk', '--priority', 'high', '-d'])
 * // Returns: { command: 'add', text: 'Buy milk', flags: ['--priority', 'high', '-d'] }
 */
function parseArgs(args) {
  if (!Array.isArray(args)) {
    return { command: null, text: '', flags: [] };
  }

  if (args.length === 0) {
    return { command: null, text: '', flags: [] };
  }

  const command = args[0] || null;
  const flags = [];
  const textParts = [];
  let i = 1;

  while (i < args.length) {
    const arg = args[i];
    
    if (typeof arg !== 'string') {
      i++;
      continue;
    }

    // Check if it's a flag
    if (arg.startsWith('-')) {
      flags.push(arg);
      
      // Check if next argument is a flag value (doesn't start with -)
      if (i + 1 < args.length && 
          typeof args[i + 1] === 'string' && 
          !args[i + 1].startsWith('-')) {
        flags.push(args[i + 1]);
        i += 2;
      } else {
        i++;
      }
    } else {
      textParts.push(arg);
      i++;
    }
  }

  return {
    command,
    text: textParts.join(' '),
    flags
  };
}

/**
 * Check if a flag exists in arguments array
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to search for (without dashes)
 * @returns {boolean} True if flag exists
 * @example
 * getFlag(['--verbose', '-d', '--priority', 'high'], 'verbose') // true
 * getFlag(['--verbose', '-d'], 'd') // true
 */
function getFlag(args, flag) {
  if (!Array.isArray(args) || typeof flag !== 'string') {
    return false;
  }

  const longFlag = `--${flag}`;
  const shortFlag = `-${flag}`;

  return args.some(arg => 
    typeof arg === 'string' && (arg === longFlag || arg === shortFlag)
  );
}

/**
 * Get the value associated with a flag
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to search for (without dashes)
 * @returns {string|null} Flag value or null if not found
 * @example
 * getFlagValue(['--priority', 'high', '-t', 'work'], 'priority') // 'high'
 * getFlagValue(['--priority', 'high', '-t', 'work'], 't') // 'work'
 */
function getFlagValue(args, flag) {
  if (!Array.isArray(args) || typeof flag !== 'string') {
    return null;
  }

  const longFlag = `--${flag}`;
  const shortFlag = `-${flag}`;

  for (let i = 0; i < args.length - 1; i++) {
    if (typeof args[i] === 'string' && 
        (args[i] === longFlag || args[i] === shortFlag)) {
      const nextArg = args[i + 1];
      if (typeof nextArg === 'string' && !nextArg.startsWith('-')) {
        return nextArg;
      }
    }
  }

  return null;
}

/**
 * Extract and validate numeric IDs from arguments
 * @param {string[]} args - Array of arguments
 * @returns {number[]} Array of valid numeric IDs
 * @example
 * parseIds(['1', '2', 'invalid', '3.5', '4']) // [1, 2, 4]
 */
function parseIds(args) {
  if (!Array.isArray(args)) {
    return [];
  }

  return args
    .map(arg => {
      if (typeof arg === 'number') {
        return Number.isInteger(arg) && arg > 0 ? arg : null;
      }
      
      if (typeof arg === 'string') {
        const num = parseInt(arg, 10);
        return !isNaN(num) && num > 0 && num.toString() === arg ? num : null;
      }
      
      return null;
    })
    .filter(id => id !== null);
}

// Display Formatting Functions

/**
 * Create an aligned ASCII table with headers and rows
 * @param {string[]} headers - Array of column headers
 * @param {string[][]} rows - Array of row arrays
 * @returns {string} Formatted table string
 * @example
 * formatTable(['ID', 'Name'], [['1', 'John'], ['2', 'Jane']])
 */
function formatTable(headers, rows) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    return '';
  }

  if (headers.length === 0) {
    return '';
  }

  // Convert all values to strings and handle null/undefined
  const stringHeaders = headers.map(h => h == null ? '' : String(h));
  const stringRows = rows.map(row => {
    if (!Array.isArray(row)) {
      return new Array(headers.length).fill('');
    }
    return row.map(cell => cell == null ? '' : String(cell));
  });

  // Calculate column widths (considering ANSI color codes)
  const getDisplayWidth = (str) => {
    return str.replace(/\x1b\[[0-9;]*m/g, '').length;
  };

  const columnWidths = stringHeaders.map((header, colIndex) => {
    const headerWidth = getDisplayWidth(header);
    const maxRowWidth = stringRows.reduce((max, row) => {
      const cellWidth = row[colIndex] ? getDisplayWidth(row[colIndex]) : 0;
      return Math.max(max, cellWidth);
    }, 0);
    return Math.max(headerWidth, maxRowWidth);
  });

  // Pad text considering ANSI codes
  const padText = (text, width) => {
    const displayWidth = getDisplayWidth(text);
    const padding = Math.max(0, width - displayWidth);
    return text + ' '.repeat(padding);
  };

  // Build table
  let result = '';

  // Header row
  const headerRow = stringHeaders
    .map((header, i) => padText(header, columnWidths[i]))
    .join(' | ');
  result += headerRow + '\n';

  // Separator row
  const separator = columnWidths
    .map(width => '-'.repeat(width))
    .join('-+-');
  result += separator + '\n';

  // Data rows
  stringRows.forEach(row => {
    const formattedRow = stringHeaders
      .map((_, i) => {
        const cell = row[i] || '';
        return padText(cell, columnWidths[i]);
      })
      .join(' | ');
    result += formattedRow + '\n';
  });

  return result.trim();
}

/**
 * Format a single todo object for display
 * @param {Object} todo - Todo object with id, status, priority, text properties
 * @returns {string[]} Array of formatted strings for table row
 * @example
 * formatTodo({ id: 1, status: 'pending', priority: 'high', text: 'Buy milk' })
 * // Returns: ['1', '[ ]', 'high', 'Buy milk']
 */
function formatTodo(todo) {
  if (!todo || typeof todo !== 'object') {
    return ['', '', '', ''];
  }

  const id = todo.id != null ? String(todo.id) : '';
  
  let status = '[ ]';
  if (todo.status === 'completed' || todo.status === 'done') {
    status = green('[✓]');
  }

  let priority = todo.priority != null ? String(todo.priority) : '';
  if (priority === 'high') {
    priority = red(priority);
  }

  const text = todo.text != null ? String(todo.text) : '';

  return [id, status, priority, text];
}

/**
 * Truncate text with ellipsis if longer than maxLen
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated text
 * @example
 * truncate('This is a long text', 10) // 'This is...'
 */
function truncate(text, maxLen) {
  if (typeof text !== 'string') {
    text = String(text || '');
  }

  if (typeof maxLen !== 'number' || maxLen < 0) {
    return text;
  }

  if (maxLen <= 3) {
    return text.slice(0, maxLen);
  }

  return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
}

/**
 * Convert Date object to relative time string
 * @param {Date} date - Date object to format
 * @returns {string} Formatted date string
 * @example
 * formatDate(new Date(Date.now() - 30 * 60 * 1000)) // '30 minutes ago'
 * formatDate(new Date(Date.now() - 2 * 60 * 60 * 1000)) // '2 hours ago'
 */
function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'Invalid date';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  // Handle future dates
  if (diffMs < 0) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

module.exports = {
  // Color functions
  supportsColor,
  colorize,
  green,
  red,
  bold,
  
  // Argument parsing
  parseArgs,
  getFlag,
  getFlagValue,
  parseIds,
  
  // Display formatting
  formatTable,
  formatTodo,
  truncate,
  formatDate,
  
  // Constants
  COLORS
};