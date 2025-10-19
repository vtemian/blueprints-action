/**
 * Comprehensive utility module for argument parsing and display formatting
 * @module utils
 * @version 1.0.0
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
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

/**
 * Check if terminal supports colors
 * @returns {boolean} True if colors are supported
 */
const supportsColor = () => {
  if (typeof process === 'undefined') return false;
  
  const { env, stdout } = process;
  
  if (env.FORCE_COLOR) return true;
  if (env.NO_COLOR || env.NODE_DISABLE_COLORS) return false;
  
  return stdout && stdout.isTTY && (
    env.TERM !== 'dumb' &&
    (env.COLORTERM || env.TERM?.includes('color') || env.TERM?.includes('256'))
  );
};

const COLOR_SUPPORT = supportsColor();

/**
 * Apply color to text if terminal supports it
 * @param {string} text - Text to colorize
 * @param {string} color - Color name from COLORS object
 * @returns {string} Colorized text or plain text
 * @example
 * colorize('Success!', 'green') // Returns colored text if supported
 */
export const colorize = (text, color) => {
  if (typeof text !== 'string') {
    throw new TypeError('Text must be a string');
  }
  
  if (!COLOR_SUPPORT || !COLORS[color]) {
    return text;
  }
  
  return `${COLORS[color]}${text}${COLORS.reset}`;
};

/**
 * Get green colored text (for success/completed items)
 * @param {string} text - Text to colorize
 * @returns {string} Green colored text or plain text
 */
export const green = (text) => colorize(text, 'green');

/**
 * Get red colored text (for errors/high priority items)
 * @param {string} text - Text to colorize
 * @returns {string} Red colored text or plain text
 */
export const red = (text) => colorize(text, 'red');

/**
 * Get yellow colored text (for warnings)
 * @param {string} text - Text to colorize
 * @returns {string} Yellow colored text or plain text
 */
export const yellow = (text) => colorize(text, 'yellow');

/**
 * Get bold text
 * @param {string} text - Text to make bold
 * @returns {string} Bold text or plain text
 */
export const bold = (text) => colorize(text, 'bold');

// ============================================================================
// ARGUMENT PARSING FUNCTIONS
// ============================================================================

/**
 * Parse array of command-line style arguments
 * @param {string[]} args - Array of command-line arguments
 * @returns {{command: string|null, text: string, flags: string[]}} Parsed arguments object
 * @throws {TypeError} When args is not an array
 * @example
 * parseArgs(['add', 'Buy milk', '--priority', 'high', '-f'])
 * // Returns: { command: 'add', text: 'Buy milk', flags: ['--priority', 'high', '-f'] }
 */
export const parseArgs = (args) => {
  if (!Array.isArray(args)) {
    throw new TypeError('Arguments must be an array');
  }

  if (args.length === 0) {
    return { command: null, text: '', flags: [] };
  }

  const result = {
    command: null,
    text: '',
    flags: []
  };

  let textParts = [];
  let i = 0;

  // First non-flag argument is the command
  if (args[i] && !args[i].startsWith('-')) {
    result.command = args[i];
    i++;
  }

  // Process remaining arguments
  while (i < args.length) {
    const arg = args[i];
    
    if (arg.startsWith('-')) {
      // This is a flag
      result.flags.push(arg);
      
      // Check if next argument is a flag value (doesn't start with -)
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.flags.push(args[i + 1]);
        i += 2;
      } else {
        i++;
      }
    } else {
      // This is text content
      textParts.push(arg);
      i++;
    }
  }

  result.text = textParts.join(' ');
  return result;
};

/**
 * Check if a flag exists in arguments array
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to search for (without dashes)
 * @returns {boolean} True if flag exists
 * @throws {TypeError} When args is not an array or flag is not a string
 * @example
 * getFlag(['--verbose', '-f', 'value'], 'verbose') // Returns: true
 * getFlag(['--verbose', '-f', 'value'], 'f') // Returns: true
 */
export const getFlag = (args, flag) => {
  if (!Array.isArray(args)) {
    throw new TypeError('Arguments must be an array');
  }
  
  if (typeof flag !== 'string') {
    throw new TypeError('Flag must be a string');
  }

  const shortFlag = `-${flag}`;
  const longFlag = `--${flag}`;
  
  return args.includes(shortFlag) || args.includes(longFlag);
};

/**
 * Get the value following a flag in arguments array
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to search for (without dashes)
 * @returns {string|null} Value following the flag, or null if not found
 * @throws {TypeError} When args is not an array or flag is not a string
 * @example
 * getFlagValue(['--priority', 'high', '-f'], 'priority') // Returns: 'high'
 * getFlagValue(['--priority', 'high', '-f'], 'missing') // Returns: null
 */
export const getFlagValue = (args, flag) => {
  if (!Array.isArray(args)) {
    throw new TypeError('Arguments must be an array');
  }
  
  if (typeof flag !== 'string') {
    throw new TypeError('Flag must be a string');
  }

  const shortFlag = `-${flag}`;
  const longFlag = `--${flag}`;
  
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === shortFlag || args[i] === longFlag) {
      const nextArg = args[i + 1];
      // Return the next argument if it's not another flag
      return nextArg && !nextArg.startsWith('-') ? nextArg : null;
    }
  }
  
  return null;
};

/**
 * Extract and validate numeric IDs from arguments
 * @param {string[]} args - Array of arguments
 * @returns {number[]} Array of valid numeric IDs
 * @throws {TypeError} When args is not an array
 * @example
 * parseIds(['1', '2', 'invalid', '3.5', '4']) // Returns: [1, 2, 4]
 */
export const parseIds = (args) => {
  if (!Array.isArray(args)) {
    throw new TypeError('Arguments must be an array');
  }

  return args
    .map(arg => {
      const num = parseInt(arg, 10);
      return Number.isInteger(num) && num > 0 ? num : null;
    })
    .filter(id => id !== null);
};

// ============================================================================
// DISPLAY FORMATTING FUNCTIONS
// ============================================================================

/**
 * Generate ASCII table with proper column alignment and borders
 * @param {string[]} headers - Array of column headers
 * @param {string[][]} rows - Array of row data arrays
 * @returns {string} Formatted ASCII table
 * @throws {TypeError} When headers is not an array or rows is not an array of arrays
 * @example
 * formatTable(['ID', 'Name'], [['1', 'John'], ['2', 'Jane']])
 * // Returns formatted ASCII table with borders
 */
export const formatTable = (headers, rows) => {
  if (!Array.isArray(headers)) {
    throw new TypeError('Headers must be an array');
  }
  
  if (!Array.isArray(rows)) {
    throw new TypeError('Rows must be an array');
  }

  if (headers.length === 0) {
    return '';
  }

  // Validate that all rows are arrays
  for (const row of rows) {
    if (!Array.isArray(row)) {
      throw new TypeError('Each row must be an array');
    }
  }

  // Calculate column widths
  const colWidths = headers.map((header, index) => {
    const headerWidth = String(header).length;
    const maxRowWidth = rows.reduce((max, row) => {
      const cellContent = row[index] != null ? String(row[index]) : '';
      return Math.max(max, cellContent.length);
    }, 0);
    return Math.max(headerWidth, maxRowWidth);
  });

  // Helper function to create separator line
  const createSeparator = () => {
    return '+' + colWidths.map(width => '-'.repeat(width + 2)).join('+') + '+';
  };

  // Helper function to format a row
  const formatRow = (rowData) => {
    const cells = rowData.map((cell, index) => {
      const content = cell != null ? String(cell) : '';
      return ` ${content.padEnd(colWidths[index])} `;
    });
    return '|' + cells.join('|') + '|';
  };

  // Build the table
  const lines = [];
  
  // Top border
  lines.push(createSeparator());
  
  // Header row
  lines.push(formatRow(headers));
  
  // Header separator
  lines.push(createSeparator());
  
  // Data rows
  for (const row of rows) {
    lines.push(formatRow(row));
  }
  
  // Bottom border
  lines.push(createSeparator());

  return lines.join('\n');
};

/**
 * Format todo object for display
 * @param {Object} todo - Todo object
 * @param {number} todo.id - Todo ID
 * @param {string} todo.status - Todo status ('completed' or other)
 * @param {string} todo.priority - Todo priority level
 * @param {string} todo.text - Todo text content
 * @param {Date|string} todo.date - Todo creation date
 * @returns {string} Formatted todo string
 * @throws {TypeError} When todo is not an object or missing required fields
 * @example
 * formatTodo({id: 1, status: 'completed', priority: 'high', text: 'Buy milk', date: new Date()})
 * // Returns: "✓ [1] Buy milk (high priority) - 5 minutes ago"
 */
export const formatTodo = (todo) => {
  if (!todo || typeof todo !== 'object') {
    throw new TypeError('Todo must be an object');
  }

  const { id, status, priority, text, date } = todo;

  if (typeof id !== 'number') {
    throw new TypeError('Todo ID must be a number');
  }

  if (typeof text !== 'string') {
    throw new TypeError('Todo text must be a string');
  }

  // Status indicator
  const statusIcon = status === 'completed' ? green('✓') : '○';
  
  // Priority indicator
  const priorityText = priority === 'high' ? red(`(${priority} priority)`) : 
                      priority ? `(${priority} priority)` : '';
  
  // Date formatting
  const dateText = date ? formatDate(date) : '';
  
  // Combine parts
  const parts = [
    statusIcon,
    `[${id}]`,
    text,
    priorityText,
    dateText ? `- ${dateText}` : ''
  ].filter(part => part);

  return parts.join(' ');
};

/**
 * Truncate text with ellipsis, handling edge cases
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length including ellipsis
 * @returns {string} Truncated text with ellipsis if needed
 * @throws {TypeError} When text is not a string or maxLen is not a number
 * @example
 * truncate('This is a long text', 10) // Returns: 'This is...'
 * truncate('Short', 10) // Returns: 'Short'
 */
export const truncate = (text, maxLen) => {
  if (typeof text !== 'string') {
    throw new TypeError('Text must be a string');
  }
  
  if (typeof maxLen !== 'number' || !Number.isInteger(maxLen) || maxLen < 0) {
    throw new TypeError('Maximum length must be a non-negative integer');
  }

  if (maxLen === 0) {
    return '';
  }

  if (maxLen <= 3) {
    return text.slice(0, maxLen);
  }

  if (text.length <= maxLen) {
    return text;
  }

  return text.slice(0, maxLen - 3) + '...';
};

/**
 * Convert Date object to relative time string
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted relative time string
 * @throws {TypeError} When date cannot be converted to a valid Date
 * @example
 * formatDate(new Date(Date.now() - 30 * 60 * 1000)) // Returns: '30 minutes ago'
 * formatDate(new Date(Date.now() - 2 * 60 * 60 * 1000)) // Returns: '2 hours ago'
 */
export const formatDate = (date) => {
  let dateObj;
  
  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string' || typeof date === 'number') {
    dateObj = new Date(date);
  } else {
    throw new TypeError('Date must be a Date object, string, or number');
  }

  if (isNaN(dateObj.getTime())) {
    throw new TypeError('Invalid date provided');
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

  // Less than 1 hour: "X minutes ago"
  if (diffMinutes < 60) {
    const minutes = Math.max(0, diffMinutes);