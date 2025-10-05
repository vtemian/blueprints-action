/**
 * Utility module for parsing and display operations
 * @module utils
 */

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
 * Check if the current environment supports colors
 * @returns {boolean} True if colors are supported
 */
function supportsColor() {
  // Check if running in Node.js
  if (typeof process !== 'undefined' && process.stdout) {
    return process.stdout.isTTY && 
           (process.env.COLORTERM || 
            process.env.TERM === 'xterm-256color' || 
            process.env.TERM === 'xterm');
  }
  
  // Browser environment - assume no color support for console output
  return false;
}

/**
 * Apply color to text if color support is available
 * @param {string} text - Text to colorize
 * @param {string} color - Color name from COLORS object
 * @returns {string} Colorized text or plain text
 */
function colorize(text, color) {
  if (!supportsColor() || !COLORS[color]) {
    return text;
  }
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

/**
 * Validate that input is an array
 * @param {*} input - Input to validate
 * @param {string} paramName - Parameter name for error messages
 * @throws {TypeError} If input is not an array
 */
function validateArray(input, paramName) {
  if (!Array.isArray(input)) {
    throw new TypeError(`${paramName} must be an array, got ${typeof input}`);
  }
}

/**
 * Validate that input is a string
 * @param {*} input - Input to validate
 * @param {string} paramName - Parameter name for error messages
 * @throws {TypeError} If input is not a string
 */
function validateString(input, paramName) {
  if (typeof input !== 'string') {
    throw new TypeError(`${paramName} must be a string, got ${typeof input}`);
  }
}

/**
 * Validate that input is a number
 * @param {*} input - Input to validate
 * @param {string} paramName - Parameter name for error messages
 * @throws {TypeError} If input is not a number
 */
function validateNumber(input, paramName) {
  if (typeof input !== 'number' || isNaN(input)) {
    throw new TypeError(`${paramName} must be a valid number, got ${typeof input}`);
  }
}

/**
 * Get the display width of a string (accounting for Unicode characters)
 * @param {string} str - String to measure
 * @returns {number} Display width
 */
function getDisplayWidth(str) {
  if (typeof str !== 'string') return 0;
  
  // Remove ANSI color codes for width calculation
  const cleanStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  
  // Simple approach: count characters (could be enhanced for full Unicode support)
  return cleanStr.length;
}

/**
 * Pad string to specified width
 * @param {string} str - String to pad
 * @param {number} width - Target width
 * @param {string} align - Alignment: 'left', 'right', or 'center'
 * @returns {string} Padded string
 */
function padString(str, width, align = 'left') {
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
}

/**
 * Parse command line arguments into structured format
 * @param {string[]} args - Array of command line arguments
 * @returns {Object} Parsed arguments with command, text, and flags
 * @throws {TypeError} If args is not an array
 * 
 * @example
 * parse_args(['add', 'Buy milk', '--priority', 'high', '--due', '2024-01-01'])
 * // Returns: { command: 'add', text: 'Buy milk', flags: ['--priority', 'high', '--due', '2024-01-01'] }
 */
export function parse_args(args) {
  validateArray(args, 'args');
  
  if (args.length === 0) {
    return { command: null, text: null, flags: [] };
  }
  
  const command = args[0];
  let text = null;
  const flags = [];
  
  let i = 1;
  
  // Look for the first non-flag argument as text
  while (i < args.length && !args[i].startsWith('-')) {
    if (text === null) {
      text = args[i];
    } else {
      text += ' ' + args[i];
    }
    i++;
  }
  
  // Collect remaining arguments as flags
  while (i < args.length) {
    flags.push(args[i]);
    i++;
  }
  
  return { command, text, flags };
}

/**
 * Check if a specific flag exists in arguments
 * @param {string[]} args - Array of arguments to search
 * @param {string} flag - Flag to search for (with or without dashes)
 * @returns {boolean} True if flag exists
 * @throws {TypeError} If args is not an array or flag is not a string
 * 
 * @example
 * get_flag(['--verbose', '--output', 'file.txt'], 'verbose') // Returns: true
 * get_flag(['--verbose', '--output', 'file.txt'], '--help') // Returns: false
 */
export function get_flag(args, flag) {
  validateArray(args, 'args');
  validateString(flag, 'flag');
  
  const normalizedFlag = flag.startsWith('-') ? flag : `--${flag}`;
  const shortFlag = flag.startsWith('-') ? flag.replace(/^-+/, '-') : `-${flag.charAt(0)}`;
  
  return args.some(arg => arg === normalizedFlag || arg === shortFlag);
}

/**
 * Get the value following a specific flag
 * @param {string[]} args - Array of arguments to search
 * @param {string} flag - Flag to search for
 * @returns {string|null} Value following the flag, or null if not found
 * @throws {TypeError} If args is not an array or flag is not a string
 * 
 * @example
 * get_flag_value(['--output', 'file.txt', '--verbose'], 'output') // Returns: 'file.txt'
 * get_flag_value(['--verbose'], 'output') // Returns: null
 */
export function get_flag_value(args, flag) {
  validateArray(args, 'args');
  validateString(flag, 'flag');
  
  const normalizedFlag = flag.startsWith('-') ? flag : `--${flag}`;
  const shortFlag = flag.startsWith('-') ? flag.replace(/^-+/, '-') : `-${flag.charAt(0)}`;
  
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === normalizedFlag || args[i] === shortFlag) {
      return args[i + 1];
    }
  }
  
  return null;
}

/**
 * Extract and validate numeric IDs from arguments
 * @param {string[]} args - Array of arguments containing potential IDs
 * @returns {number[]} Array of valid numeric IDs
 * @throws {TypeError} If args is not an array
 * @throws {Error} If no valid IDs are found
 * 
 * @example
 * parse_ids(['1', '2', '5', 'invalid', '10']) // Returns: [1, 2, 5, 10]
 * parse_ids(['invalid', 'also-invalid']) // Throws: Error
 */
export function parse_ids(args) {
  validateArray(args, 'args');
  
  const ids = [];
  
  for (const arg of args) {
    // Skip flags
    if (typeof arg === 'string' && arg.startsWith('-')) {
      continue;
    }
    
    const num = Number(arg);
    if (!isNaN(num) && Number.isInteger(num) && num > 0) {
      ids.push(num);
    }
  }
  
  if (ids.length === 0) {
    throw new Error('No valid numeric IDs found in arguments');
  }
  
  return ids;
}

/**
 * Create an aligned ASCII table with proper spacing
 * @param {string[]} headers - Array of column headers
 * @param {string[][]} rows - Array of rows, each row is an array of cell values
 * @returns {string} Formatted ASCII table
 * @throws {TypeError} If headers is not an array or rows is not an array of arrays
 * @throws {Error} If row length doesn't match header length
 * 
 * @example
 * format_table(['ID', 'Status', 'Todo'], [['1', '[ ]', 'Buy milk'], ['2', '[✓]', 'Walk dog']])
 * // Returns formatted table string
 */
export function format_table(headers, rows) {
  validateArray(headers, 'headers');
  validateArray(rows, 'rows');
  
  if (headers.length === 0) {
    return '';
  }
  
  // Validate that all rows are arrays with correct length
  for (let i = 0; i < rows.length; i++) {
    if (!Array.isArray(rows[i])) {
      throw new TypeError(`Row ${i} must be an array`);
    }
    if (rows[i].length !== headers.length) {
      throw new Error(`Row ${i} has ${rows[i].length} columns, expected ${headers.length}`);
    }
  }
  
  // Calculate column widths
  const columnWidths = headers.map((header, colIndex) => {
    let maxWidth = getDisplayWidth(String(header));
    
    for (const row of rows) {
      const cellWidth = getDisplayWidth(String(row[colIndex] || ''));
      maxWidth = Math.max(maxWidth, cellWidth);
    }
    
    return maxWidth;
  });
  
  // Build table
  const lines = [];
  
  // Header row
  const headerRow = headers.map((header, i) => 
    padString(String(header), columnWidths[i])
  ).join(' | ');
  lines.push(headerRow);
  
  // Separator row
  const separator = columnWidths.map(width => '-'.repeat(width)).join('-+-');
  lines.push(separator);
  
  // Data rows
  for (const row of rows) {
    const dataRow = row.map((cell, i) => 
      padString(String(cell || ''), columnWidths[i])
    ).join(' | ');
    lines.push(dataRow);
  }
  
  return lines.join('\n');
}

/**
 * Format a single todo object for display
 * @param {Object} todo - Todo object with id, text, completed, priority, etc.
 * @param {number} todo.id - Todo ID
 * @param {string} todo.text - Todo text
 * @param {boolean} todo.completed - Completion status
 * @param {string} [todo.priority] - Priority level
 * @param {Date} [todo.created] - Creation date
 * @returns {string} Formatted todo string
 * @throws {TypeError} If todo is not an object
 * @throws {Error} If required todo properties are missing
 * 
 * @example
 * format_todo({id: 1, text: 'Buy milk', completed: false, priority: 'high'})
 * // Returns: "1. [ ] Buy milk (high priority)"
 */
export function format_todo(todo) {
  if (typeof todo !== 'object' || todo === null) {
    throw new TypeError('todo must be an object');
  }
  
  if (typeof todo.id === 'undefined' || typeof todo.text !== 'string') {
    throw new Error('todo must have id and text properties');
  }
  
  const id = String(todo.id);
  const status = todo.completed ? colorize('[✓]', 'green') : '[ ]';
  let text = todo.text;
  
  // Apply color based on priority or completion status
  if (todo.completed) {
    text = colorize(text, 'green');
  } else if (todo.priority === 'high') {
    text = colorize(text, 'red');
  } else if (todo.priority === 'medium') {
    text = colorize(text, 'yellow');
  }
  
  let result = `${id}. ${status} ${text}`;
  
  // Add priority indicator
  if (todo.priority && !todo.completed) {
    const priorityColor = todo.priority === 'high' ? 'red' : 
                         todo.priority === 'medium' ? 'yellow' : 'gray';
    result += ` (${colorize(todo.priority + ' priority', priorityColor)})`;
  }
  
  // Add creation date if available
  if (todo.created instanceof Date) {
    const dateStr = format_date(todo.created);
    result += ` ${colorize(`(${dateStr})`, 'gray')}`;
  }
  
  return result;
}

/**
 * Truncate text with ellipsis when exceeding maximum length
 * @param {string} text - Text to truncate
 * @param {number} max_len - Maximum length (must be >= 3 for ellipsis)
 * @returns {string} Truncated text with ellipsis if needed
 * @throws {TypeError} If text is not a string or max_len is not a number
 * @throws {Error} If max_len is less than 3
 * 
 * @example
 * truncate('This is a very long text', 10) // Returns: 'This is...'
 * truncate('Short', 10) // Returns: 'Short'
 */
export function truncate(text, max_len) {
  validateString(text, 'text');
  validateNumber(max_len, 'max_len');
  
  if (max_len < 3) {
    throw new Error('max_len must be at least 3 to accommodate ellipsis');
  }
  
  if (getDisplayWidth(text) <= max_len) {
    return text;
  }
  
  // Handle Unicode characters properly
  let truncated = '';
  let width = 0;
  
  for (const char of text) {
    if (width + 3 > max_len) { // Reserve space for ellipsis
      break;
    }
    truncated += char;
    width += 1; // Simplified width calculation
  }
  
  return truncated + '...';
}

/**
 * Convert dates to relative time format or absolute format for older dates