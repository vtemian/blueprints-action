/**
 * Utility functions for parsing and display in a todo application
 * @fileoverview ES6 module providing argument parsing and display formatting utilities
 */

// ANSI color codes with terminal detection
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

/**
 * Detects if the current terminal supports colors
 * @returns {boolean} True if colors are supported
 */
const supportsColor = () => {
  if (typeof process === 'undefined') return false;
  
  const { env, stdout } = process;
  
  if (env.FORCE_COLOR) return true;
  if (env.NO_COLOR || env.NODE_DISABLE_COLORS) return false;
  
  return stdout && stdout.isTTY && (
    env.TERM !== 'dumb' &&
    (env.COLORTERM || env.TERM === 'xterm-256color' || env.TERM?.includes('color'))
  );
};

const COLOR_SUPPORT = supportsColor();

/**
 * Applies color to text if terminal supports it
 * @param {string} text - Text to colorize
 * @param {string} color - Color name from COLORS object
 * @returns {string} Colorized text or plain text
 */
const colorize = (text, color) => {
  if (!COLOR_SUPPORT || !COLORS[color]) return text;
  return `${COLORS[color]}${text}${COLORS.reset}`;
};

// ============================================================================
// ARGUMENT PARSING FUNCTIONS
// ============================================================================

/**
 * Extracts command, text, and flags from an array of command-line arguments
 * @param {string[]} args - Array of command-line arguments
 * @returns {Object} Parsed arguments object with command, text, and flags
 * @throws {TypeError} If args is not an array
 * 
 * @example
 * parseArgs(['add', 'Buy milk', '--priority', 'high', '--due', 'tomorrow'])
 * // Returns: { command: 'add', text: 'Buy milk', flags: ['--priority', 'high', '--due', 'tomorrow'] }
 */
export const parseArgs = (args) => {
  if (!Array.isArray(args)) {
    throw new TypeError('Arguments must be an array');
  }

  if (args.length === 0) {
    return { command: null, text: '', flags: [] };
  }

  const argsCopy = [...args];
  const command = argsCopy.shift() || null;
  
  // Find first flag (starts with -)
  const firstFlagIndex = argsCopy.findIndex(arg => 
    typeof arg === 'string' && arg.startsWith('-')
  );
  
  let text = '';
  let flags = [];
  
  if (firstFlagIndex === -1) {
    // No flags found, everything else is text
    text = argsCopy.join(' ');
  } else {
    // Split between text and flags
    text = argsCopy.slice(0, firstFlagIndex).join(' ');
    flags = argsCopy.slice(firstFlagIndex);
  }
  
  return {
    command,
    text: text.trim(),
    flags: flags.filter(flag => typeof flag === 'string')
  };
};

/**
 * Checks if a specific flag exists in the arguments array
 * @param {string[]} args - Array of arguments to search
 * @param {string} flag - Flag to search for (with or without dashes)
 * @returns {boolean} True if flag exists
 * @throws {TypeError} If args is not an array or flag is not a string
 * 
 * @example
 * getFlag(['--priority', 'high', '-v'], 'priority') // Returns: true
 * getFlag(['--priority', 'high', '-v'], '--verbose') // Returns: false
 */
export const getFlag = (args, flag) => {
  if (!Array.isArray(args)) {
    throw new TypeError('Arguments must be an array');
  }
  if (typeof flag !== 'string') {
    throw new TypeError('Flag must be a string');
  }

  if (!flag) return false;

  // Normalize flag format
  const normalizedFlag = flag.startsWith('-') ? flag : `--${flag}`;
  const shortFlag = flag.startsWith('-') ? flag.replace(/^-+/, '') : flag;
  
  return args.some(arg => 
    typeof arg === 'string' && (
      arg === normalizedFlag || 
      arg === `-${shortFlag.charAt(0)}` ||
      arg === `--${shortFlag}`
    )
  );
};

/**
 * Gets the value that follows a specific flag in the arguments array
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to find the value for
 * @returns {string|null} Value following the flag, or null if not found
 * @throws {TypeError} If args is not an array or flag is not a string
 * 
 * @example
 * getFlagValue(['--priority', 'high', '--due', 'tomorrow'], 'priority') // Returns: 'high'
 * getFlagValue(['--priority', 'high'], 'due') // Returns: null
 */
export const getFlagValue = (args, flag) => {
  if (!Array.isArray(args)) {
    throw new TypeError('Arguments must be an array');
  }
  if (typeof flag !== 'string') {
    throw new TypeError('Flag must be a string');
  }

  if (!flag) return null;

  // Normalize flag format
  const normalizedFlag = flag.startsWith('-') ? flag : `--${flag}`;
  const shortFlag = flag.startsWith('-') ? flag.replace(/^-+/, '') : flag;
  
  for (let i = 0; i < args.length - 1; i++) {
    const arg = args[i];
    if (typeof arg === 'string' && (
      arg === normalizedFlag || 
      arg === `-${shortFlag.charAt(0)}` ||
      arg === `--${shortFlag}`
    )) {
      const nextArg = args[i + 1];
      return typeof nextArg === 'string' && !nextArg.startsWith('-') ? nextArg : null;
    }
  }
  
  return null;
};

/**
 * Extracts and validates numeric IDs from arguments
 * @param {string[]} args - Array of arguments that may contain IDs
 * @returns {number[]} Array of valid numeric IDs
 * @throws {TypeError} If args is not an array
 * 
 * @example
 * parseIds(['1', '2', 'invalid', '3.5', '4']) // Returns: [1, 2, 4]
 * parseIds(['delete', '1', '2']) // Returns: [1, 2]
 */
export const parseIds = (args) => {
  if (!Array.isArray(args)) {
    throw new TypeError('Arguments must be an array');
  }

  return args
    .filter(arg => typeof arg === 'string' || typeof arg === 'number')
    .map(arg => {
      const num = typeof arg === 'number' ? arg : parseFloat(arg);
      return Number.isInteger(num) && num > 0 ? num : null;
    })
    .filter(id => id !== null);
};

// ============================================================================
// DISPLAY FORMATTING FUNCTIONS
// ============================================================================

/**
 * Creates an aligned ASCII table with proper spacing and borders
 * @param {string[]} headers - Array of column headers
 * @param {string[][]} rows - Array of rows, each row is an array of cell values
 * @returns {string} Formatted ASCII table
 * @throws {TypeError} If headers is not an array or rows is not an array of arrays
 * 
 * @example
 * formatTable(['ID', 'Status'], [['1', '[ ]'], ['2', '[✓]']])
 * // Returns formatted table string
 */
export const formatTable = (headers, rows) => {
  if (!Array.isArray(headers)) {
    throw new TypeError('Headers must be an array');
  }
  if (!Array.isArray(rows)) {
    throw new TypeError('Rows must be an array');
  }

  if (headers.length === 0) return '';

  // Validate rows structure
  rows.forEach((row, index) => {
    if (!Array.isArray(row)) {
      throw new TypeError(`Row ${index} must be an array`);
    }
  });

  // Calculate column widths (accounting for ANSI codes)
  const getDisplayLength = (str) => {
    if (typeof str !== 'string') return String(str).length;
    // Remove ANSI escape codes for length calculation
    return str.replace(/\x1b\[[0-9;]*m/g, '').length;
  };

  const columnWidths = headers.map((header, colIndex) => {
    const headerWidth = getDisplayLength(String(header));
    const maxRowWidth = rows.reduce((max, row) => {
      const cellValue = row[colIndex] || '';
      return Math.max(max, getDisplayLength(String(cellValue)));
    }, 0);
    return Math.max(headerWidth, maxRowWidth);
  });

  // Pad text accounting for ANSI codes
  const padText = (text, width, align = 'left') => {
    const str = String(text);
    const displayLength = getDisplayLength(str);
    const padding = Math.max(0, width - displayLength);
    
    if (align === 'right') {
      return ' '.repeat(padding) + str;
    }
    return str + ' '.repeat(padding);
  };

  // Build table
  const lines = [];
  
  // Header row
  const headerRow = headers
    .map((header, i) => padText(header, columnWidths[i]))
    .join(' | ');
  lines.push(headerRow);
  
  // Separator row
  const separator = columnWidths
    .map(width => '-'.repeat(width))
    .join('-+-');
  lines.push(separator);
  
  // Data rows
  rows.forEach(row => {
    const formattedRow = headers
      .map((_, colIndex) => {
        const cellValue = row[colIndex] || '';
        return padText(cellValue, columnWidths[colIndex]);
      })
      .join(' | ');
    lines.push(formattedRow);
  });
  
  return lines.join('\n');
};

/**
 * Formats a single todo object for display with colors and proper alignment
 * @param {Object} todo - Todo object to format
 * @param {number} todo.id - Todo ID
 * @param {string} todo.text - Todo text
 * @param {boolean} todo.completed - Completion status
 * @param {string} [todo.priority] - Priority level
 * @param {Date|string} [todo.createdAt] - Creation date
 * @returns {string} Formatted todo string
 * @throws {TypeError} If todo is not an object or missing required fields
 * 
 * @example
 * formatTodo({ id: 1, text: 'Buy milk', completed: false, priority: 'high' })
 * // Returns: "1   | [ ]    | high     | Buy milk"
 */
export const formatTodo = (todo) => {
  if (!todo || typeof todo !== 'object') {
    throw new TypeError('Todo must be an object');
  }
  
  const { id, text, completed, priority, createdAt } = todo;
  
  if (typeof id !== 'number' || typeof text !== 'string') {
    throw new TypeError('Todo must have numeric id and string text');
  }

  const status = completed ? '[✓]' : '[ ]';
  const coloredStatus = completed ? colorize(status, 'green') : status;
  
  let priorityDisplay = priority || 'normal';
  if (priority === 'high') {
    priorityDisplay = colorize(priorityDisplay, 'red');
  } else if (priority === 'medium') {
    priorityDisplay = colorize(priorityDisplay, 'yellow');
  }
  
  const truncatedText = truncate(text, 50);
  const dateDisplay = createdAt ? formatDate(createdAt) : '';
  
  return `${id} | ${coloredStatus} | ${priorityDisplay} | ${truncatedText}${dateDisplay ? ` (${colorize(dateDisplay, 'gray')})` : ''}`;
};

/**
 * Truncates text to specified length with ellipsis, handling Unicode properly
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length before truncation
 * @returns {string} Truncated text with ellipsis if needed
 * @throws {TypeError} If text is not a string or maxLen is not a number
 * 
 * @example
 * truncate('This is a very long text', 10) // Returns: 'This is...'
 * truncate('Short', 10) // Returns: 'Short'
 */
export const truncate = (text, maxLen) => {
  if (typeof text !== 'string') {
    throw new TypeError('Text must be a string');
  }
  if (typeof maxLen !== 'number' || maxLen < 0) {
    throw new TypeError('Maximum length must be a non-negative number');
  }

  if (maxLen === 0) return '';
  if (maxLen <= 3) return text.slice(0, maxLen);
  
  // Handle Unicode characters properly
  const chars = Array.from(text);
  
  if (chars.length <= maxLen) {
    return text;
  }
  
  return chars.slice(0, maxLen - 3).join('') + '...';
};

/**
 * Converts date to relative time format with specific rules
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted relative time string
 * @throws {TypeError} If date cannot be converted to a valid Date
 * 
 * @example
 * formatDate(new Date(Date.now() - 30 * 60 * 1000)) // Returns: '30 minutes ago'
 * formatDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)) // Returns: '2 days ago'
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
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  // Handle future dates
  if (diffMs < 0) {
    const futureDiffMinutes = Math.abs(diffMinutes);
    const futureDiffHours = Math.abs(diffHours);
    const futureDiffDays = Math.abs(diffDays);
    
    if (futureDiffMin