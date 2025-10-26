/**
 * Utility module for command-line todo application
 * Provides argument parsing, display formatting, and color support
 * @module utils
 */

import path from 'path';

// ANSI color codes
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

// Check if terminal supports colors
const supportsColor = process.stdout.isTTY && process.env.NODE_ENV !== 'test';

/**
 * Parse command line arguments into structured object
 * @param {string[]} args - Array of command line arguments
 * @returns {{command: string, text: string, flags: object}} Parsed arguments
 */
export function parseArgs(args) {
  if (!Array.isArray(args)) {
    return { command: '', text: '', flags: {} };
  }

  const result = {
    command: '',
    text: '',
    flags: {}
  };

  const cleanArgs = args.slice(); // Create copy to avoid mutation
  const flags = {};
  const textParts = [];
  let command = '';

  for (let i = 0; i < cleanArgs.length; i++) {
    const arg = cleanArgs[i];
    
    if (arg.startsWith('--')) {
      // Long flag format
      const flagName = arg.slice(2);
      const nextArg = cleanArgs[i + 1];
      
      if (nextArg && !nextArg.startsWith('-')) {
        flags[flagName] = nextArg;
        i++; // Skip next argument as it's the flag value
      } else {
        flags[flagName] = true;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Short flag format
      const flagName = arg.slice(1);
      const nextArg = cleanArgs[i + 1];
      
      if (nextArg && !nextArg.startsWith('-')) {
        flags[flagName] = nextArg;
        i++; // Skip next argument as it's the flag value
      } else {
        flags[flagName] = true;
      }
    } else if (!command) {
      // First non-flag argument is the command
      command = arg;
    } else {
      // Remaining arguments are text
      textParts.push(arg);
    }
  }

  result.command = command;
  result.text = textParts.join(' ');
  result.flags = flags;

  return result;
}

/**
 * Check if a flag exists in arguments
 * @param {string[]} args - Array of command line arguments
 * @param {string} flag - Flag name to check for
 * @returns {boolean} True if flag exists
 */
export function getFlag(args, flag) {
  if (!Array.isArray(args) || typeof flag !== 'string') {
    return false;
  }

  return args.includes(`--${flag}`) || args.includes(`-${flag}`);
}

/**
 * Get the value associated with a flag
 * @param {string[]} args - Array of command line arguments
 * @param {string} flag - Flag name to get value for
 * @returns {string|null} Flag value or null if not found
 */
export function getFlagValue(args, flag) {
  if (!Array.isArray(args) || typeof flag !== 'string') {
    return null;
  }

  // Check long format first
  const longFlagIndex = args.indexOf(`--${flag}`);
  if (longFlagIndex !== -1 && longFlagIndex + 1 < args.length) {
    const value = args[longFlagIndex + 1];
    if (!value.startsWith('-')) {
      return value;
    }
  }

  // Check short format
  const shortFlagIndex = args.indexOf(`-${flag}`);
  if (shortFlagIndex !== -1 && shortFlagIndex + 1 < args.length) {
    const value = args[shortFlagIndex + 1];
    if (!value.startsWith('-')) {
      return value;
    }
  }

  return null;
}

/**
 * Extract numeric IDs from arguments
 * @param {string[]} args - Array of command line arguments
 * @returns {number[]} Array of valid numeric IDs
 */
export function parseIds(args) {
  if (!Array.isArray(args)) {
    return [];
  }

  return args
    .map(arg => {
      const num = parseInt(arg, 10);
      return isNaN(num) ? null : num;
    })
    .filter(id => id !== null && id > 0);
}

/**
 * Create ASCII table with proper alignment
 * @param {string[]} headers - Table headers
 * @param {string[][]} rows - Table rows
 * @returns {string} Formatted ASCII table
 */
export function formatTable(headers, rows) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    return '';
  }

  if (headers.length === 0) {
    return '';
  }

  // Calculate column widths
  const colWidths = headers.map((header, index) => {
    const headerWidth = String(header).length;
    const maxRowWidth = rows.reduce((max, row) => {
      const cellValue = row[index] ? String(row[index]) : '';
      return Math.max(max, cellValue.length);
    }, 0);
    return Math.max(headerWidth, maxRowWidth);
  });

  // Format header row
  const headerRow = '| ' + headers.map((header, index) => 
    String(header).padEnd(colWidths[index])
  ).join(' | ') + ' |';

  // Format separator row
  const separatorRow = '|' + colWidths.map(width => 
    '-'.repeat(width + 2)
  ).join('|') + '|';

  // Format data rows
  const dataRows = rows.map(row => 
    '| ' + headers.map((_, index) => {
      const cellValue = row[index] ? String(row[index]) : '';
      return cellValue.padEnd(colWidths[index]);
    }).join(' | ') + ' |'
  );

  return [headerRow, separatorRow, ...dataRows].join('\n');
}

/**
 * Format a single todo item for display
 * @param {object} todo - Todo object with id, status, priority, text properties
 * @returns {string} Formatted todo string
 */
export function formatTodo(todo) {
  if (!todo || typeof todo !== 'object') {
    return '';
  }

  const {
    id = '',
    status = 'pending',
    priority = 'medium',
    text = '',
    created,
    completed
  } = todo;

  const statusIcon = status === 'completed' ? '✓' : '○';
  const priorityIndicator = priority === 'high' ? '!' : priority === 'low' ? '-' : '';
  
  let formattedText = `[${id}] ${statusIcon} ${text}`;
  
  if (priorityIndicator) {
    formattedText += ` ${priorityIndicator}`;
  }

  // Add date information if available
  if (completed && status === 'completed') {
    formattedText += ` (completed ${formatDate(completed)})`;
  } else if (created) {
    formattedText += ` (created ${formatDate(created)})`;
  }

  // Apply colors if supported
  if (supportsColor) {
    if (status === 'completed') {
      formattedText = colorize(formattedText, 'green');
    } else if (priority === 'high') {
      formattedText = colorize(formattedText, 'red');
    }
  }

  return formattedText;
}

/**
 * Truncate text with ellipsis if longer than maxLen
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated text
 */
export function truncate(text, maxLen) {
  if (typeof text !== 'string' || typeof maxLen !== 'number') {
    return String(text || '');
  }

  if (maxLen <= 0) {
    return '';
  }

  if (text.length <= maxLen) {
    return text;
  }

  if (maxLen <= 3) {
    return '...'.slice(0, maxLen);
  }

  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Format date as relative time or absolute date
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date) {
    return 'unknown';
  }

  let dateObj;
  
  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    return 'invalid date';
  }

  if (isNaN(dateObj.getTime())) {
    return 'invalid date';
  }

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    return diffMinutes <= 0 ? 'just now' : `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else {
    // Format as YYYY-MM-DD
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Apply ANSI color codes to text
 * @param {string} text - Text to colorize
 * @param {string} color - Color name
 * @returns {string} Colorized text or plain text if colors not supported
 */
export function colorize(text, color) {
  if (!supportsColor || typeof text !== 'string' || typeof color !== 'string') {
    return String(text || '');
  }

  const colorCode = COLORS[color.toLowerCase()];
  if (!colorCode) {
    return text;
  }

  return `${colorCode}${text}${COLORS.reset}`;
}

/**
 * Check if terminal supports colors
 * @returns {boolean} True if colors are supported
 */
export function hasColorSupport() {
  return supportsColor;
}

/**
 * Pad string to specified width
 * @param {string} str - String to pad
 * @param {number} width - Target width
 * @param {string} align - Alignment: 'left', 'right', 'center'
 * @returns {string} Padded string
 */
export function padString(str, width, align = 'left') {
  const text = String(str || '');
  
  if (typeof width !== 'number' || width <= 0) {
    return text;
  }

  if (text.length >= width) {
    return text;
  }

  const padding = width - text.length;

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center':
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    case 'left':
    default:
      return text + ' '.repeat(padding);
  }
}

/**
 * Validate and sanitize user input
 * @param {string} input - User input to validate
 * @param {object} options - Validation options
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input, options = {}) {
  if (typeof input !== 'string') {
    return '';
  }

  const {
    maxLength = 1000,
    allowEmpty = false,
    trim = true
  } = options;

  let sanitized = input;

  if (trim) {
    sanitized = sanitized.trim();
  }

  if (!allowEmpty && sanitized.length === 0) {
    return '';
  }

  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  // Remove potentially dangerous characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Create a simple progress bar
 * @param {number} current - Current progress value
 * @param {number} total - Total progress value
 * @param {number} width - Width of progress bar
 * @returns {string} Progress bar string
 */
export function createProgressBar(current, total, width = 20) {
  if (typeof current !== 'number' || typeof total !== 'number' || typeof width !== 'number') {
    return '';
  }

  if (total <= 0 || width <= 0) {
    return '';
  }

  const percentage = Math.min(Math.max(current / total, 0), 1);
  const filled = Math.floor(percentage * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percent = Math.round(percentage * 100);

  return `[${bar}] ${percent}%`;
}