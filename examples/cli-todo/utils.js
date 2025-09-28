/**
 * Utility module for argument parsing and display formatting
 * Supports both Node.js and browser environments
 * @module utils
 */

// Environment detection
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
const isTTY = isNode && process.stdout && process.stdout.isTTY;

// ANSI color codes with automatic terminal detection
const colors = {
  green: isTTY ? '\x1b[32m' : '',
  red: isTTY ? '\x1b[31m' : '',
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : ''
};

/**
 * Parse command-line style arguments array
 * @param {string[]|string} args - Arguments to parse (array or space-separated string)
 * @returns {Object} Parsed arguments with command, text, and flags
 * @example
 * parseArgs(['add', 'Buy milk', '--priority', 'high', '-f'])
 * // Returns: { command: 'add', text: 'Buy milk', flags: ['--priority', '-f'], values: { priority: 'high' } }
 */
function parseArgs(args) {
  try {
    // Handle different input types
    if (!args) return { command: '', text: '', flags: [], values: {} };
    
    if (typeof args === 'string') {
      args = args.trim().split(/\s+/);
    }
    
    if (!Array.isArray(args)) {
      console.warn('parseArgs: Invalid input type, expected array or string');
      return { command: '', text: '', flags: [], values: {} };
    }

    const result = {
      command: '',
      text: '',
      flags: [],
      values: {}
    };

    if (args.length === 0) return result;

    let i = 0;
    
    // First non-flag argument is the command
    while (i < args.length && (args[i].startsWith('-') || args[i].startsWith('--'))) {
      i++;
    }
    
    if (i < args.length) {
      result.command = args[i];
      i++;
    }

    // Parse remaining arguments
    const textParts = [];
    
    while (i < args.length) {
      const arg = args[i];
      
      if (arg.startsWith('--') || arg.startsWith('-')) {
        result.flags.push(arg);
        
        // Check if next argument is a value (not a flag)
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          const flagName = arg.replace(/^-+/, '');
          result.values[flagName] = args[i + 1];
          i += 2;
        } else {
          i++;
        }
      } else {
        textParts.push(arg);
        i++;
      }
    }
    
    result.text = textParts.join(' ');
    
    return result;
  } catch (error) {
    console.warn('parseArgs: Error parsing arguments:', error.message);
    return { command: '', text: '', flags: [], values: {} };
  }
}

/**
 * Check if a flag exists in arguments array
 * @param {string[]|string} args - Arguments array or string
 * @param {string} flag - Flag to check for (without dashes)
 * @returns {boolean} True if flag exists
 * @example
 * getFlag(['--verbose', '-f'], 'verbose') // Returns: true
 * getFlag(['--verbose', '-f'], 'f') // Returns: true
 */
function getFlag(args, flag) {
  try {
    if (!args || !flag) return false;
    
    if (typeof args === 'string') {
      args = args.trim().split(/\s+/);
    }
    
    if (!Array.isArray(args)) return false;
    
    const normalizedFlag = flag.replace(/^-+/, '');
    
    return args.some(arg => {
      if (typeof arg !== 'string') return false;
      const normalizedArg = arg.replace(/^-+/, '');
      return normalizedArg === normalizedFlag;
    });
  } catch (error) {
    console.warn('getFlag: Error checking flag:', error.message);
    return false;
  }
}

/**
 * Extract value following a flag
 * @param {string[]|string} args - Arguments array or string
 * @param {string} flag - Flag to get value for (without dashes)
 * @returns {string|null} Flag value or null if not found
 * @example
 * getFlagValue(['--priority', 'high', '--name', 'test'], 'priority') // Returns: 'high'
 */
function getFlagValue(args, flag) {
  try {
    if (!args || !flag) return null;
    
    if (typeof args === 'string') {
      args = args.trim().split(/\s+/);
    }
    
    if (!Array.isArray(args)) return null;
    
    const normalizedFlag = flag.replace(/^-+/, '');
    
    for (let i = 0; i < args.length - 1; i++) {
      const arg = args[i];
      if (typeof arg === 'string') {
        const normalizedArg = arg.replace(/^-+/, '');
        if (normalizedArg === normalizedFlag) {
          const nextArg = args[i + 1];
          // Return value only if next argument is not a flag
          if (typeof nextArg === 'string' && !nextArg.startsWith('-')) {
            return nextArg;
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.warn('getFlagValue: Error getting flag value:', error.message);
    return null;
  }
}

/**
 * Extract and validate numeric IDs from arguments
 * @param {string[]|string} args - Arguments array or string
 * @returns {number[]} Array of valid numeric IDs
 * @example
 * parseIds(['1', '2', 'invalid', '3.5', '4']) // Returns: [1, 2, 4]
 */
function parseIds(args) {
  try {
    if (!args) return [];
    
    if (typeof args === 'string') {
      args = args.trim().split(/\s+/);
    }
    
    if (!Array.isArray(args)) return [];
    
    const ids = [];
    
    for (const arg of args) {
      if (typeof arg === 'string' || typeof arg === 'number') {
        const num = parseInt(arg, 10);
        if (!isNaN(num) && isFinite(num) && num > 0 && num.toString() === parseInt(arg, 10).toString()) {
          ids.push(num);
        }
      }
    }
    
    return ids;
  } catch (error) {
    console.warn('parseIds: Error parsing IDs:', error.message);
    return [];
  }
}

/**
 * Generate ASCII table with proper column alignment and borders
 * @param {string[]} headers - Table headers
 * @param {string[][]} rows - Table rows data
 * @returns {string} Formatted ASCII table
 * @example
 * formatTable(['ID', 'Status', 'Task'], [['1', '✓', 'Buy milk'], ['2', '○', 'Walk dog']])
 */
function formatTable(headers, rows) {
  try {
    if (!Array.isArray(headers) || !Array.isArray(rows)) {
      console.warn('formatTable: Invalid input - headers and rows must be arrays');
      return '';
    }
    
    if (headers.length === 0) return '';
    
    // Calculate column widths
    const colWidths = headers.map((header, i) => {
      const headerWidth = String(header || '').length;
      const maxRowWidth = rows.reduce((max, row) => {
        const cellContent = String(row[i] || '');
        // Remove ANSI codes for width calculation
        const cleanContent = cellContent.replace(/\x1b\[[0-9;]*m/g, '');
        return Math.max(max, cleanContent.length);
      }, 0);
      return Math.max(headerWidth, maxRowWidth);
    });
    
    // Create separator line
    const separator = '├' + colWidths.map(width => '─'.repeat(width + 2)).join('┼') + '┤';
    const topBorder = '┌' + colWidths.map(width => '─'.repeat(width + 2)).join('┬') + '┐';
    const bottomBorder = '└' + colWidths.map(width => '─'.repeat(width + 2)).join('┴') + '┘';
    
    // Format header row
    const headerRow = '│' + headers.map((header, i) => {
      const content = String(header || '');
      return ` ${content.padEnd(colWidths[i])} `;
    }).join('│') + '│';
    
    // Format data rows
    const dataRows = rows.map(row => {
      return '│' + headers.map((_, i) => {
        const content = String(row[i] || '');
        const cleanContent = content.replace(/\x1b\[[0-9;]*m/g, '');
        const padding = colWidths[i] - cleanContent.length;
        return ` ${content}${' '.repeat(Math.max(0, padding))} `;
      }).join('│') + '│';
    });
    
    // Combine all parts
    const result = [
      topBorder,
      headerRow,
      separator,
      ...dataRows,
      bottomBorder
    ].join('\n');
    
    return result;
  } catch (error) {
    console.warn('formatTable: Error formatting table:', error.message);
    return '';
  }
}

/**
 * Format todo object for display
 * @param {Object} todo - Todo object with id, status, priority, text properties
 * @returns {string[]} Array of formatted strings for table row
 * @example
 * formatTodo({id: 1, status: 'completed', priority: 'high', text: 'Buy milk'})
 * // Returns: ['1', '✓', 'HIGH', 'Buy milk']
 */
function formatTodo(todo) {
  try {
    if (!todo || typeof todo !== 'object') {
      console.warn('formatTodo: Invalid todo object');
      return ['', '', '', ''];
    }
    
    const id = String(todo.id || '');
    
    // Format status with colors
    let status = '';
    if (todo.status === 'completed' || todo.status === 'done') {
      status = `${colors.green}[✓]${colors.reset}`;
    } else {
      status = '[○]';
    }
    
    // Format priority with colors
    let priority = String(todo.priority || 'normal').toUpperCase();
    if (priority === 'HIGH' || priority === 'URGENT') {
      priority = `${colors.red}${priority}${colors.reset}`;
    }
    
    const text = String(todo.text || '');
    
    return [id, status, priority, text];
  } catch (error) {
    console.warn('formatTodo: Error formatting todo:', error.message);
    return ['', '', '', ''];
  }
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length (default: 50)
 * @returns {string} Truncated text with ellipsis if needed
 * @example
 * truncate('This is a very long text', 10) // Returns: 'This is...'
 */
function truncate(text, maxLen = 50) {
  try {
    if (text == null) return '';
    
    const str = String(text);
    const length = parseInt(maxLen, 10);
    
    if (isNaN(length) || length < 0) {
      console.warn('truncate: Invalid maxLen, using default');
      return truncate(str, 50);
    }
    
    if (length <= 3) return str.substring(0, length);
    
    if (str.length <= length) return str;
    
    return str.substring(0, length - 3) + '...';
  } catch (error) {
    console.warn('truncate: Error truncating text:', error.message);
    return String(text || '');
  }
}

/**
 * Convert Date object to relative time or formatted date
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted relative time or date string
 * @example
 * formatDate(new Date(Date.now() - 30 * 60 * 1000)) // Returns: '30 minutes ago'
 * formatDate(new Date('2023-01-01')) // Returns: '2023-01-01'
 */
function formatDate(date) {
  try {
    let dateObj;
    
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
      dateObj = new Date(date);
    } else {
      console.warn('formatDate: Invalid date input');
      return 'Invalid Date';
    }
    
    if (isNaN(dateObj.getTime())) {
      console.warn('formatDate: Invalid date');
      return 'Invalid Date';
    }
    
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    
    // Handle future dates
    if (diffMs < 0) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
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
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (error) {
    console.warn('formatDate: Error formatting date:', error.message);
    return 'Invalid Date';
  }
}

// Export for both Node.js and browser environments
const utils = {
  parseArgs,
  getFlag,
  getFlagValue,
  parseIds,
  formatTable,
  formatTodo,