/**
 * Utility functions for parsing and display operations
 * @module utils
 */

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

/**
 * Check if ANSI colors are supported in the current environment
 * @returns {boolean} True if colors are supported
 */
function supportsColor() {
  if (typeof process === 'undefined') return false;
  if (process.env.FORCE_COLOR) return true;
  if (process.env.NO_COLOR) return false;
  return process.stdout && process.stdout.isTTY;
}

/**
 * Apply color to text if colors are supported
 * @param {string} text - Text to colorize
 * @param {string} color - Color name from COLORS object
 * @returns {string} Colorized text or plain text
 */
function colorize(text, color) {
  if (!supportsColor() || !COLORS[color]) return text;
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// =============================================================================
// ARGUMENT PARSING FUNCTIONS
// =============================================================================

/**
 * Extract command, text, and flags from argument array
 * @param {string[]} args - Array of command line arguments
 * @returns {{command: string|null, text: string, flags: string[]}} Parsed arguments
 */
export function parseArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    return { command: null, text: '', flags: [] };
  }

  const flags = [];
  const textParts = [];
  let command = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (typeof arg !== 'string') continue;

    if (arg.startsWith('-')) {
      flags.push(arg);
      // Skip next argument if it's a flag value (doesn't start with -)
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        i++; // Skip the flag value
      }
    } else if (command === null) {
      command = arg;
    } else {
      textParts.push(arg);
    }
  }

  return {
    command,
    text: textParts.join(' '),
    flags
  };
}

/**
 * Check if a specific flag exists in arguments
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to search for (with or without dashes)
 * @returns {boolean} True if flag exists
 */
export function getFlag(args, flag) {
  if (!Array.isArray(args) || typeof flag !== 'string') return false;

  const normalizedFlag = flag.startsWith('-') ? flag : `--${flag}`;
  const shortFlag = flag.startsWith('-') ? 
    (flag.startsWith('--') ? `-${flag.slice(2)[0]}` : flag) : 
    `-${flag[0]}`;

  return args.some(arg => 
    typeof arg === 'string' && (arg === normalizedFlag || arg === shortFlag)
  );
}

/**
 * Get the value immediately following a flag
 * @param {string[]} args - Array of arguments
 * @param {string} flag - Flag to search for
 * @returns {string|null} Flag value or null if not found
 */
export function getFlagValue(args, flag) {
  if (!Array.isArray(args) || typeof flag !== 'string') return null;

  const normalizedFlag = flag.startsWith('-') ? flag : `--${flag}`;
  const shortFlag = flag.startsWith('-') ? 
    (flag.startsWith('--') ? `-${flag.slice(2)[0]}` : flag) : 
    `-${flag[0]}`;

  for (let i = 0; i < args.length - 1; i++) {
    const arg = args[i];
    if (typeof arg === 'string' && (arg === normalizedFlag || arg === shortFlag)) {
      const nextArg = args[i + 1];
      if (typeof nextArg === 'string' && !nextArg.startsWith('-')) {
        return nextArg;
      }
    }
  }

  return null;
}

/**
 * Extract numeric IDs from arguments
 * @param {string[]} args - Array of arguments
 * @returns {number[]} Array of numeric IDs
 */
export function parseIds(args) {
  if (!Array.isArray(args)) return [];

  return args
    .filter(arg => typeof arg === 'string' || typeof arg === 'number')
    .map(arg => {
      const num = typeof arg === 'number' ? arg : parseFloat(arg);
      return Number.isInteger(num) && num > 0 ? num : null;
    })
    .filter(num => num !== null);
}

// =============================================================================
// DISPLAY FORMATTING FUNCTIONS
// =============================================================================

/**
 * Create aligned ASCII table with borders
 * @param {string[]} headers - Table headers
 * @param {string[][]} rows - Table rows
 * @returns {string} Formatted ASCII table
 */
export function formatTable(headers, rows) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) return '';
  if (headers.length === 0) return '';

  // Ensure all headers are strings
  const safeHeaders = headers.map(h => String(h ?? ''));
  
  // Ensure all rows are arrays and pad/truncate to match header length
  const safeRows = rows.map(row => {
    if (!Array.isArray(row)) return new Array(safeHeaders.length).fill('');
    const safeRow = row.map(cell => String(cell ?? ''));
    // Pad or truncate row to match header length
    while (safeRow.length < safeHeaders.length) safeRow.push('');
    return safeRow.slice(0, safeHeaders.length);
  });

  // Calculate column widths
  const colWidths = safeHeaders.map((header, i) => {
    const headerWidth = header.length;
    const maxRowWidth = safeRows.reduce((max, row) => 
      Math.max(max, (row[i] || '').length), 0
    );
    return Math.max(headerWidth, maxRowWidth);
  });

  // Create border line
  const borderLine = '+' + colWidths.map(width => '-'.repeat(width + 2)).join('+') + '+';
  
  // Format header
  const headerLine = '|' + safeHeaders.map((header, i) => 
    ` ${header.padEnd(colWidths[i])} `
  ).join('|') + '|';

  // Format rows
  const rowLines = safeRows.map(row => 
    '|' + row.map((cell, i) => 
      ` ${cell.padEnd(colWidths[i])} `
    ).join('|') + '|'
  );

  // Combine all parts
  return [
    borderLine,
    headerLine,
    borderLine,
    ...rowLines,
    borderLine
  ].join('\n');
}

/**
 * Format single todo item for display
 * @param {Object} todo - Todo object with id, status, priority, text properties
 * @returns {string} Formatted todo item
 */
export function formatTodo(todo) {
  if (!todo || typeof todo !== 'object') return '';

  const { id = '', status = '', priority = '', text = '' } = todo;
  
  // Status indicator
  const statusIcon = status === 'completed' ? '✓' : '○';
  const statusText = colorize(statusIcon, status === 'completed' ? 'green' : 'gray');
  
  // Priority indicator
  let priorityText = '';
  if (priority === 'high') {
    priorityText = colorize('[HIGH]', 'red') + ' ';
  } else if (priority === 'medium') {
    priorityText = colorize('[MED]', 'yellow') + ' ';
  }
  
  // ID formatting
  const idText = id ? colorize(`#${id}`, 'blue') + ' ' : '';
  
  // Text formatting - apply strikethrough effect for completed items
  let todoText = String(text);
  if (status === 'completed' && supportsColor()) {
    todoText = colorize(todoText, 'gray');
  }
  
  return `${statusText} ${idText}${priorityText}${todoText}`.trim();
}

/**
 * Shorten text with ellipsis if it exceeds maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated text with ellipsis if needed
 */
export function truncate(text, maxLen) {
  if (typeof text !== 'string') text = String(text ?? '');
  if (typeof maxLen !== 'number' || maxLen < 0) return text;
  
  if (text.length <= maxLen) return text;
  if (maxLen <= 3) return text.slice(0, maxLen);
  
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Convert date to relative time string
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted relative time or absolute date
 */
export function formatDate(date) {
  let dateObj;
  
  try {
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
      dateObj = new Date(date);
    } else {
      return '';
    }
    
    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      return String(date);
    }
  } catch (error) {
    return String(date);
  }
  
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  // Handle future dates
  if (diffMs < 0) {
    return dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
  }
  
  // Less than 1 hour
  if (diffMinutes < 60) {
    if (diffMinutes <= 0) return 'just now';
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  
  // Less than 24 hours
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  
  // Less than 7 days
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }
  
  // 7 days or older - return YYYY-MM-DD format
  return dateObj.toISOString().split('T')[0];
}

// Export all functions
export {
  // Re-export for completeness (already exported above)
  // parseArgs, getFlag, getFlagValue, parseIds,
  // formatTable, formatTodo, truncate, formatDate
};