/**
 * Utility module for command-line todo application
 * Provides argument parsing, display formatting, and color support
 * @module utils
 */

const { stdout } = require('process');

// ANSI Color codes
const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m'
};

/**
 * Check if terminal supports color output
 * @returns {boolean} True if colors are supported
 */
function supports_color() {
  if (!stdout || !stdout.isTTY) return false;
  
  const { env } = process;
  
  if (env.FORCE_COLOR) return true;
  if (env.NO_COLOR || env.NODE_DISABLE_COLORS) return false;
  
  const term = env.TERM || '';
  return term !== 'dumb' && (
    term.includes('color') ||
    term.includes('256') ||
    term.includes('xterm') ||
    env.COLORTERM
  );
}

/**
 * Apply ANSI color to text if colors are supported
 * @param {string} text - Text to colorize
 * @param {string} color - Color code from COLORS object
 * @returns {string} Colorized text or plain text if colors not supported
 */
function colorize(text, color) {
  if (typeof text !== 'string') {
    throw new Error('Text must be a string');
  }
  
  if (!color || typeof color !== 'string') {
    return text;
  }
  
  if (!supports_color()) {
    return text;
  }
  
  return `${color}${text}${COLORS.RESET}`;
}

/**
 * Parse command line arguments into structured object
 * @param {string[]} args - Array of command line arguments
 * @returns {Object} Parsed arguments with command, text, and flags
 * @throws {Error} If args is not an array
 */
function parse_args(args) {
  if (!Array.isArray(args)) {
    throw new Error('Arguments must be an array');
  }
  
  if (args.length === 0) {
    return { command: null, text: '', flags: [] };
  }
  
  const result = {
    command: null,
    text: '',
    flags: []
  };
  
  const textParts = [];
  let i = 0;
  
  // First non-flag argument is the command
  while (i < args.length) {
    const arg = args[i];
    
    if (arg.startsWith('-')) {
      result.flags.push(arg);
      i++;
      // Skip flag value if it exists and doesn't start with -
      if (i < args.length && !args[i].startsWith('-')) {
        result.flags.push(args[i]);
        i++;
      }
    } else {
      if (result.command === null) {
        result.command = arg;
      } else {
        textParts.push(arg);
      }
      i++;
    }
  }
  
  result.text = textParts.join(' ');
  return result;
}

/**
 * Check if a flag exists in arguments array
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to search for (with or without -)
 * @returns {boolean} True if flag exists
 * @throws {Error} If args is not an array or flag is not a string
 */
function get_flag(args, flag) {
  if (!Array.isArray(args)) {
    throw new Error('Arguments must be an array');
  }
  
  if (typeof flag !== 'string') {
    throw new Error('Flag must be a string');
  }
  
  const normalizedFlag = flag.startsWith('-') ? flag : `-${flag}`;
  return args.includes(normalizedFlag) || args.includes(`-${normalizedFlag}`);
}

/**
 * Get the value immediately following a flag
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to search for
 * @returns {string|null} Value following the flag, or null if not found
 * @throws {Error} If args is not an array or flag is not a string
 */
function get_flag_value(args, flag) {
  if (!Array.isArray(args)) {
    throw new Error('Arguments must be an array');
  }
  
  if (typeof flag !== 'string') {
    throw new Error('Flag must be a string');
  }
  
  const normalizedFlag = flag.startsWith('-') ? flag : `-${flag}`;
  
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === normalizedFlag || args[i] === `-${normalizedFlag}`) {
      const nextArg = args[i + 1];
      // Return value if it doesn't start with - (not another flag)
      if (!nextArg.startsWith('-')) {
        return nextArg;
      }
    }
  }
  
  return null;
}

/**
 * Extract and validate numeric IDs from arguments
 * @param {string[]} args - Array of arguments
 * @returns {number[]} Array of positive integer IDs
 * @throws {Error} If args is not an array or contains invalid IDs
 */
function parse_ids(args) {
  if (!Array.isArray(args)) {
    throw new Error('Arguments must be an array');
  }
  
  const ids = [];
  
  for (const arg of args) {
    // Skip flags
    if (typeof arg === 'string' && arg.startsWith('-')) {
      continue;
    }
    
    const num = parseInt(arg, 10);
    
    // Check if it's a valid positive integer
    if (!isNaN(num) && num > 0 && num.toString() === arg.toString()) {
      ids.push(num);
    }
  }
  
  return ids;
}

/**
 * Create ASCII table with proper alignment and borders
 * @param {string[]} headers - Array of column headers
 * @param {string[][]} rows - Array of row data arrays
 * @returns {string} Formatted ASCII table
 * @throws {Error} If headers is not an array or rows structure is invalid
 */
function format_table(headers, rows) {
  if (!Array.isArray(headers)) {
    throw new Error('Headers must be an array');
  }
  
  if (!Array.isArray(rows)) {
    throw new Error('Rows must be an array');
  }
  
  if (headers.length === 0) {
    return '';
  }
  
  // Validate that all headers are strings
  for (const header of headers) {
    if (typeof header !== 'string') {
      throw new Error('All headers must be strings');
    }
  }
  
  // Validate rows structure
  for (const row of rows) {
    if (!Array.isArray(row)) {
      throw new Error('Each row must be an array');
    }
    if (row.length !== headers.length) {
      throw new Error('All rows must have the same number of columns as headers');
    }
  }
  
  // Calculate column widths
  const colWidths = headers.map((header, i) => {
    const headerWidth = header.length;
    const maxRowWidth = rows.reduce((max, row) => {
      const cellContent = String(row[i] || '');
      // Remove ANSI color codes for width calculation
      const cleanContent = cellContent.replace(/\x1b\[[0-9;]*m/g, '');
      return Math.max(max, cleanContent.length);
    }, 0);
    return Math.max(headerWidth, maxRowWidth);
  });
  
  // Build table
  const lines = [];
  
  // Header row
  const headerRow = headers.map((header, i) => 
    header.padEnd(colWidths[i])
  ).join(' | ');
  lines.push(headerRow);
  
  // Separator row
  const separator = colWidths.map(width => '-'.repeat(width)).join('-+-');
  lines.push(separator);
  
  // Data rows
  for (const row of rows) {
    const formattedRow = row.map((cell, i) => {
      const cellContent = String(cell || '');
      const cleanContent = cellContent.replace(/\x1b\[[0-9;]*m/g, '');
      const padding = colWidths[i] - cleanContent.length;
      return cellContent + ' '.repeat(Math.max(0, padding));
    }).join(' | ');
    lines.push(formattedRow);
  }
  
  return lines.join('\n');
}

/**
 * Format a single todo object for display
 * @param {Object} todo - Todo object with id, status, priority, text properties
 * @returns {string} Formatted todo string
 * @throws {Error} If todo is not an object or missing required properties
 */
function format_todo(todo) {
  if (!todo || typeof todo !== 'object') {
    throw new Error('Todo must be an object');
  }
  
  const { id, status, priority, text } = todo;
  
  if (id === undefined || status === undefined || priority === undefined || text === undefined) {
    throw new Error('Todo must have id, status, priority, and text properties');
  }
  
  const statusIcon = status ? '[✓]' : '[ ]';
  const formattedStatus = status ? colorize(statusIcon, COLORS.GREEN) : statusIcon;
  const formattedPriority = priority === 'high' ? colorize(priority, COLORS.RED) : priority;
  
  return `${id} | ${formattedStatus} | ${formattedPriority} | ${text}`;
}

/**
 * Truncate text with ellipsis, preserving whole words when possible
 * @param {string} text - Text to truncate
 * @param {number} max_len - Maximum length including ellipsis
 * @returns {string} Truncated text
 * @throws {Error} If text is not a string or max_len is not a positive number
 */
function truncate(text, max_len) {
  if (typeof text !== 'string') {
    throw new Error('Text must be a string');
  }
  
  if (typeof max_len !== 'number' || max_len < 1) {
    throw new Error('Max length must be a positive number');
  }
  
  if (text.length <= max_len) {
    return text;
  }
  
  if (max_len <= 3) {
    return '...'.substring(0, max_len);
  }
  
  // Try to preserve whole words
  const truncated = text.substring(0, max_len - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > max_len * 0.5) {
    // If we can preserve at least half the desired length with whole words
    return truncated.substring(0, lastSpace) + '...';
  } else {
    // Otherwise just truncate at character boundary
    return truncated + '...';
  }
}

/**
 * Convert Date object to relative time string
 * @param {Date} date - Date object to format
 * @returns {string} Formatted relative time string
 * @throws {Error} If date is not a valid Date object
 */
function format_date(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Date must be a valid Date object');
  }
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 60) {
    return `${Math.max(0, diffMinutes)} minutes ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hours ago`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    // Format as YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

// Export all functions
module.exports = {
  // Color support
  COLORS,
  supports_color,
  colorize,
  
  // Argument parsing
  parse_args,
  get_flag,
  get_flag_value,
  parse_ids,
  
  // Display formatting
  format_table,
  format_todo,
  truncate,
  format_date
};