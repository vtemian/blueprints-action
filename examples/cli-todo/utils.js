/**
 * Utility functions for parsing command-line arguments and formatting display output
 * @module utils
 */

// ANSI color codes with graceful fallback
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Detect if terminal supports colors
const supportsColor = process.stdout.isTTY && process.env.TERM !== 'dumb';

/**
 * Apply color to text if terminal supports it
 * @param {string} text - Text to colorize
 * @param {string} color - Color name
 * @returns {string} Colorized text or plain text
 */
const colorize = (text, color) => {
  if (!supportsColor || !colors[color]) return text;
  return `${colors[color]}${text}${colors.reset}`;
};

/**
 * Parse array of command-line arguments into structured object
 * @param {string[]} args - Array of command-line arguments
 * @returns {Object} Parsed arguments with command, text, and flags
 * @example
 * parseArgs(['add', 'Buy milk', '--priority', 'high'])
 * // Returns: { command: 'add', text: 'Buy milk', flags: { priority: 'high' } }
 */
export const parseArgs = (args) => {
  if (!Array.isArray(args)) {
    throw new TypeError('Arguments must be an array');
  }

  const result = {
    command: null,
    text: '',
    flags: {}
  };

  if (args.length === 0) return result;

  let i = 0;
  
  // First non-flag argument is the command
  while (i < args.length && args[i].startsWith('-')) {
    i++;
    if (i < args.length && !args[i].startsWith('-')) i++; // Skip flag value
  }
  
  if (i < args.length) {
    result.command = args[i];
    i++;
  }

  // Collect text arguments (non-flags after command)
  const textParts = [];
  const flagArgs = [];

  for (let j = 0; j < args.length; j++) {
    if (args[j].startsWith('-')) {
      flagArgs.push(args[j]);
      if (j + 1 < args.length && !args[j + 1].startsWith('-')) {
        flagArgs.push(args[j + 1]);
        j++; // Skip the flag value
      }
    } else if (args[j] !== result.command) {
      textParts.push(args[j]);
    }
  }

  result.text = textParts.join(' ');

  // Parse flags
  for (let j = 0; j < flagArgs.length; j++) {
    if (flagArgs[j].startsWith('--')) {
      const flagName = flagArgs[j].slice(2);
      if (j + 1 < flagArgs.length && !flagArgs[j + 1].startsWith('-')) {
        result.flags[flagName] = flagArgs[j + 1];
        j++;
      } else {
        result.flags[flagName] = true;
      }
    } else if (flagArgs[j].startsWith('-')) {
      const flagName = flagArgs[j].slice(1);
      if (j + 1 < flagArgs.length && !flagArgs[j + 1].startsWith('-')) {
        result.flags[flagName] = flagArgs[j + 1];
        j++;
      } else {
        result.flags[flagName] = true;
      }
    }
  }

  return result;
};

/**
 * Check if a flag exists in arguments array
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to check for (without dashes)
 * @returns {boolean} True if flag exists
 * @example
 * getFlag(['--verbose', 'command'], 'verbose') // Returns: true
 */
export const getFlag = (args, flag) => {
  if (!Array.isArray(args) || typeof flag !== 'string') {
    return false;
  }

  return args.includes(`--${flag}`) || args.includes(`-${flag}`);
};

/**
 * Get value following a flag in arguments array
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to get value for (without dashes)
 * @returns {string|null} Flag value or null if not found
 * @example
 * getFlagValue(['--priority', 'high'], 'priority') // Returns: 'high'
 */
export const getFlagValue = (args, flag) => {
  if (!Array.isArray(args) || typeof flag !== 'string') {
    return null;
  }

  const longFlag = `--${flag}`;
  const shortFlag = `-${flag}`;

  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === longFlag || args[i] === shortFlag) {
      const nextArg = args[i + 1];
      return nextArg && !nextArg.startsWith('-') ? nextArg : null;
    }
  }

  return null;
};

/**
 * Extract numeric IDs from arguments
 * @param {string[]} args - Array of arguments
 * @returns {number[]} Array of numeric IDs
 * @example
 * parseIds(['1', '2', 'not-a-number', '3']) // Returns: [1, 2, 3]
 */
export const parseIds = (args) => {
  if (!Array.isArray(args)) {
    return [];
  }

  return args
    .map(arg => {
      const num = parseInt(arg, 10);
      return isNaN(num) ? null : num;
    })
    .filter(id => id !== null && id > 0);
};

/**
 * Create ASCII table with proper alignment and borders
 * @param {string[]} headers - Table headers
 * @param {string[][]} rows - Table rows
 * @returns {string} Formatted ASCII table
 * @example
 * formatTable(['ID', 'Task'], [['1', 'Buy milk'], ['2', 'Walk dog']])
 */
export const formatTable = (headers, rows) => {
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    throw new TypeError('Headers and rows must be arrays');
  }

  if (headers.length === 0) return '';

  // Calculate column widths
  const colWidths = headers.map((header, i) => {
    const headerWidth = header.length;
    const maxRowWidth = rows.reduce((max, row) => {
      const cellContent = row[i] || '';
      // Remove ANSI codes for width calculation
      const cleanContent = cellContent.replace(/\x1b\[[0-9;]*m/g, '');
      return Math.max(max, cleanContent.length);
    }, 0);
    return Math.max(headerWidth, maxRowWidth);
  });

  // Create separator line
  const separator = '|' + colWidths.map(width => '-'.repeat(width + 2)).join('|') + '|';

  // Format header
  const headerRow = '|' + headers.map((header, i) => 
    ` ${header.padEnd(colWidths[i])} `
  ).join('|') + '|';

  // Format rows
  const formattedRows = rows.map(row => 
    '|' + headers.map((_, i) => {
      const cellContent = row[i] || '';
      // Calculate padding considering ANSI codes
      const cleanContent = cellContent.replace(/\x1b\[[0-9;]*m/g, '');
      const padding = colWidths[i] - cleanContent.length;
      return ` ${cellContent}${' '.repeat(Math.max(0, padding))} `;
    }).join('|') + '|'
  );

  return [separator, headerRow, separator, ...formattedRows, separator].join('\n');
};

/**
 * Format todo object for display
 * @param {Object} todo - Todo object with id, status, priority, text, createdAt fields
 * @returns {string[]} Array of formatted strings for table row
 * @example
 * formatTodo({ id: 1, status: 'completed', priority: 'high', text: 'Buy milk', createdAt: new Date() })
 */
export const formatTodo = (todo) => {
  if (!todo || typeof todo !== 'object') {
    throw new TypeError('Todo must be an object');
  }

  const { id = '', status = '', priority = '', text = '', createdAt } = todo;

  // Format status with color
  let formattedStatus = status;
  if (status === 'completed') {
    formattedStatus = colorize('✓ completed', 'green');
  } else if (status === 'pending') {
    formattedStatus = '○ pending';
  }

  // Format priority with color
  let formattedPriority = priority;
  if (priority === 'high') {
    formattedPriority = colorize('HIGH', 'red');
  } else if (priority === 'medium') {
    formattedPriority = colorize('MED', 'yellow');
  } else if (priority === 'low') {
    formattedPriority = 'LOW';
  }

  // Format date
  const formattedDate = createdAt ? formatDate(createdAt) : '';

  return [
    String(id),
    formattedStatus,
    formattedPriority,
    truncate(String(text), 50),
    formattedDate
  ];
};

/**
 * Truncate text with ellipsis if longer than maxLen
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated text
 * @example
 * truncate('This is a long text', 10) // Returns: 'This is...'
 */
export const truncate = (text, maxLen) => {
  if (typeof text !== 'string') {
    text = String(text);
  }
  
  if (typeof maxLen !== 'number' || maxLen < 0) {
    return text;
  }

  if (text.length <= maxLen) {
    return text;
  }

  // Ensure we have room for ellipsis
  const truncateAt = Math.max(0, maxLen - 3);
  return text.slice(0, truncateAt) + '...';
};

/**
 * Convert Date object to relative time string
 * @param {Date} date - Date to format
 * @returns {string} Formatted relative time or absolute date
 * @example
 * formatDate(new Date(Date.now() - 30 * 60 * 1000)) // Returns: '30 minutes ago'
 */
export const formatDate = (date) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'Invalid date';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  // Handle future dates
  if (diffMs < 0) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else if (diffDays < 7) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  } else {
    // Format as YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

// Export colorize function for external use
export { colorize };

/* Example Usage:

// Parse command line arguments
const args = parseArgs(['add', 'Buy groceries', '--priority', 'high', '--due', 'tomorrow']);
console.log(args);
// Output: { command: 'add', text: 'Buy groceries', flags: { priority: 'high', due: 'tomorrow' } }

// Create a formatted table
const headers = ['ID', 'Status', 'Priority', 'Task', 'Created'];
const todos = [
  { id: 1, status: 'completed', priority: 'high', text: 'Buy milk', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  { id: 2, status: 'pending', priority: 'low', text: 'Walk the dog', createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }
];

const rows = todos.map(formatTodo);
console.log(formatTable(headers, rows));

*/