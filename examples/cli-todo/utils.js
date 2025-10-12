/**
 * Utility module for parsing and display operations
 * Provides functions for argument parsing and formatted output
 */

// ANSI color codes with fallback support
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

// Check if colors are supported (basic terminal detection)
const supportsColor = () => {
  return typeof process !== 'undefined' && 
         process.stdout && 
         process.stdout.isTTY && 
         process.env.TERM !== 'dumb';
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
 * Validate that input is an array
 * @param {*} input - Input to validate
 * @param {string} functionName - Name of calling function for error messages
 * @throws {TypeError} If input is not an array
 */
const validateArray = (input, functionName) => {
  if (!Array.isArray(input)) {
    throw new TypeError(`${functionName}: Expected array, got ${typeof input}`);
  }
};

/**
 * Validate that input is a string
 * @param {*} input - Input to validate
 * @param {string} functionName - Name of calling function for error messages
 * @throws {TypeError} If input is not a string
 */
const validateString = (input, functionName) => {
  if (typeof input !== 'string') {
    throw new TypeError(`${functionName}: Expected string, got ${typeof input}`);
  }
};

/**
 * Extract command, text, and flags from argument array
 * @param {string[]} args - Array of command line arguments
 * @returns {Object} Parsed arguments object with command, text, and flags
 * @throws {TypeError} If args is not an array
 */
export const parseArgs = (args) => {
  validateArray(args, 'parseArgs');
  
  const result = {
    command: null,
    text: [],
    flags: []
  };
  
  if (args.length === 0) {
    return result;
  }
  
  // First non-flag argument is the command
  let commandFound = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (typeof arg !== 'string') {
      continue; // Skip non-string arguments
    }
    
    if (arg.startsWith('-')) {
      result.flags.push(arg);
      // Skip next argument if it's a flag value (doesn't start with -)
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        i++; // Skip the flag value
      }
    } else if (!commandFound) {
      result.command = arg;
      commandFound = true;
    } else {
      result.text.push(arg);
    }
  }
  
  return result;
};

/**
 * Check if a specific flag exists in arguments
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to search for (with or without -)
 * @returns {boolean} True if flag exists
 * @throws {TypeError} If args is not an array or flag is not a string
 */
export const getFlag = (args, flag) => {
  validateArray(args, 'getFlag');
  validateString(flag, 'getFlag');
  
  const normalizedFlag = flag.startsWith('-') ? flag : `-${flag}`;
  return args.some(arg => typeof arg === 'string' && arg === normalizedFlag);
};

/**
 * Get the value that follows a specific flag
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to search for
 * @returns {string|null} Value following the flag, or null if not found
 * @throws {TypeError} If args is not an array or flag is not a string
 */
export const getFlagValue = (args, flag) => {
  validateArray(args, 'getFlagValue');
  validateString(flag, 'getFlagValue');
  
  const normalizedFlag = flag.startsWith('-') ? flag : `-${flag}`;
  
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === normalizedFlag) {
      const nextArg = args[i + 1];
      // Return the next argument if it exists and doesn't start with -
      if (typeof nextArg === 'string' && !nextArg.startsWith('-')) {
        return nextArg;
      }
    }
  }
  
  return null;
};

/**
 * Extract and validate numeric IDs from arguments
 * @param {string[]} args - Array of arguments
 * @returns {number[]} Array of valid numeric IDs
 * @throws {TypeError} If args is not an array
 */
export const parseIds = (args) => {
  validateArray(args, 'parseIds');
  
  const ids = [];
  
  for (const arg of args) {
    if (typeof arg === 'string') {
      // Try to parse as number
      const num = parseInt(arg, 10);
      if (!isNaN(num) && num > 0 && num.toString() === arg) {
        ids.push(num);
      }
    } else if (typeof arg === 'number' && Number.isInteger(arg) && arg > 0) {
      ids.push(arg);
    }
  }
  
  // Remove duplicates and sort
  return [...new Set(ids)].sort((a, b) => a - b);
};

/**
 * Calculate the display width of a string (accounting for ANSI codes)
 * @param {string} str - String to measure
 * @returns {number} Display width
 */
const getDisplayWidth = (str) => {
  if (typeof str !== 'string') return 0;
  // Remove ANSI escape codes for width calculation
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
};

/**
 * Pad string to specified width
 * @param {string} str - String to pad
 * @param {number} width - Target width
 * @param {string} align - Alignment: 'left', 'right', or 'center'
 * @returns {string} Padded string
 */
const padString = (str, width, align = 'left') => {
  const displayWidth = getDisplayWidth(str);
  const padding = Math.max(0, width - displayWidth);
  
  switch (align) {
    case 'right':
      return ' '.repeat(padding) + str;
    case 'center':
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
    default: // 'left'
      return str + ' '.repeat(padding);
  }
};

/**
 * Create properly aligned ASCII table with borders
 * @param {string[]} headers - Array of column headers
 * @param {string[][]} rows - Array of row data arrays
 * @returns {string} Formatted table string
 * @throws {TypeError} If headers is not an array or rows is not an array of arrays
 */
export const formatTable = (headers, rows) => {
  validateArray(headers, 'formatTable');
  validateArray(rows, 'formatTable');
  
  if (headers.length === 0) {
    return '';
  }
  
  // Validate that all rows are arrays
  for (let i = 0; i < rows.length; i++) {
    if (!Array.isArray(rows[i])) {
      throw new TypeError(`formatTable: Row ${i} is not an array`);
    }
  }
  
  // Calculate column widths
  const columnWidths = headers.map((header, index) => {
    let maxWidth = getDisplayWidth(String(header));
    
    for (const row of rows) {
      if (row[index] !== undefined && row[index] !== null) {
        const cellWidth = getDisplayWidth(String(row[index]));
        maxWidth = Math.max(maxWidth, cellWidth);
      }
    }
    
    return Math.max(maxWidth, 3); // Minimum width of 3
  });
  
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) + 
                    (columnWidths.length - 1) * 3 + 4; // 3 chars per separator + 4 for borders
  
  let result = '';
  
  // Header row
  const headerRow = headers.map((header, index) => 
    padString(String(header), columnWidths[index])
  ).join(' | ');
  result += `${headerRow}\n`;
  
  // Separator row
  const separator = columnWidths.map(width => '-'.repeat(width)).join('-+-');
  result += `${separator}\n`;
  
  // Data rows
  for (const row of rows) {
    const formattedRow = headers.map((_, index) => {
      const cellValue = row[index] !== undefined && row[index] !== null ? 
                       String(row[index]) : '';
      return padString(cellValue, columnWidths[index]);
    }).join(' | ');
    result += `${formattedRow}\n`;
  }
  
  return result.trimEnd();
};

/**
 * Format a single todo item for consistent display
 * @param {Object} todo - Todo object with id, text, completed, priority, createdAt
 * @returns {string} Formatted todo string
 * @throws {TypeError} If todo is not an object
 */
export const formatTodo = (todo) => {
  if (!todo || typeof todo !== 'object') {
    throw new TypeError('formatTodo: Expected todo object');
  }
  
  const {
    id = '',
    text = '',
    completed = false,
    priority = 'medium',
    createdAt = new Date()
  } = todo;
  
  const checkbox = completed ? '[✓]' : '[ ]';
  const coloredCheckbox = completed ? colorize(checkbox, 'green') : checkbox;
  
  let formattedText = String(text);
  if (priority === 'high' && !completed) {
    formattedText = colorize(formattedText, 'red');
  }
  
  const date = formatDate(createdAt);
  const idStr = id ? `${id}. ` : '';
  
  return `${idStr}${coloredCheckbox} ${formattedText} (${date})`;
};

/**
 * Truncate text with ellipsis when exceeding length
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length (must be >= 3 for ellipsis)
 * @returns {string} Truncated text
 * @throws {TypeError} If text is not a string or maxLen is not a number
 */
export const truncate = (text, maxLen) => {
  validateString(text, 'truncate');
  
  if (typeof maxLen !== 'number' || !Number.isInteger(maxLen) || maxLen < 0) {
    throw new TypeError('truncate: maxLen must be a non-negative integer');
  }
  
  if (maxLen === 0) {
    return '';
  }
  
  if (text.length <= maxLen) {
    return text;
  }
  
  if (maxLen < 3) {
    return text.substring(0, maxLen);
  }
  
  return text.substring(0, maxLen - 3) + '...';
};

/**
 * Convert dates to relative time format
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string
 * @throws {TypeError} If date cannot be converted to a valid Date
 */
export const formatDate = (date) => {
  let dateObj;
  
  try {
    dateObj = new Date(date);
  } catch (error) {
    throw new TypeError('formatDate: Invalid date input');
  }
  
  if (isNaN(dateObj.getTime())) {
    throw new TypeError('formatDate: Invalid date input');
  }
  
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  
  // Handle future dates
  if (diffMs < 0) {
    return dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
  }
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 60) {
    return diffMinutes <= 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }
  
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  
  if (diffDays < 7) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }
  
  // Format as YYYY-MM-DD for older dates
  return dateObj.toISOString().split('T')[0];
};

// Export all functions as named exports
export default {
  parseArgs,
  getFlag,
  getFlagValue,
  parseIds,
  formatTable,
  formatTodo,
  truncate,
  formatDate
};