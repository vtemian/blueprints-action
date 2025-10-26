// Package utils provides utility functions for parsing command-line arguments
// and formatting display output with proper error handling and validation.
package utils

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// ANSI color constants for terminal output
const (
	ColorReset  = "\033[0m"
	ColorRed    = "\033[31m"
	ColorGreen  = "\033[32m"
	ColorYellow = "\033[33m"
	ColorBlue   = "\033[34m"
	ColorPurple = "\033[35m"
	ColorCyan   = "\033[36m"
	ColorWhite  = "\033[37m"
	ColorBold   = "\033[1m"
)

// Display formatting constants
const (
	DefaultMaxLen     = 50
	TablePadding      = 2
	MinColumnWidth    = 3
	DateFormat        = "2006-01-02"
	EllipsisIndicator = "..."
)

// Todo represents a todo item structure for display formatting
type Todo struct {
	ID          int
	Title       string
	Description string
	Completed   bool
	CreatedAt   time.Time
	DueDate     *time.Time
	Priority    string
}

// Argument Parsing Functions

// ParseArgs extracts command, text, and flags from a string slice.
// The first non-flag argument is treated as the command, subsequent non-flag
// arguments are joined as text. Flags can be in format --flag, -flag, or --flag=value.
//
// Example:
//   args := []string{"add", "Buy groceries", "--priority=high", "-urgent"}
//   cmd, text, flags, err := ParseArgs(args)
//   // cmd: "add", text: "Buy groceries", flags: {"priority": "high", "urgent": ""}
func ParseArgs(args []string) (command string, text string, flags map[string]string, err error) {
	if len(args) == 0 {
		return "", "", make(map[string]string), nil
	}

	flags = make(map[string]string)
	var textParts []string
	commandSet := false

	for i := 0; i < len(args); i++ {
		arg := args[i]

		// Handle flags
		if strings.HasPrefix(arg, "-") {
			flagName, flagValue, hasValue := parseFlag(arg)
			if flagName == "" {
				return "", "", nil, fmt.Errorf("invalid flag format: %s", arg)
			}

			if hasValue {
				flags[flagName] = flagValue
			} else {
				// Check if next argument is the value (not starting with -)
				if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
					flags[flagName] = args[i+1]
					i++ // Skip next argument as it's the flag value
				} else {
					flags[flagName] = ""
				}
			}
		} else {
			// First non-flag argument is command
			if !commandSet {
				command = arg
				commandSet = true
			} else {
				// Subsequent non-flag arguments are text
				textParts = append(textParts, arg)
			}
		}
	}

	text = strings.Join(textParts, " ")
	return command, text, flags, nil
}

// parseFlag parses a flag argument and returns flag name, value, and whether value was embedded
func parseFlag(arg string) (name, value string, hasValue bool) {
	// Remove leading dashes
	flag := strings.TrimLeft(arg, "-")
	if flag == "" || flag == arg {
		return "", "", false
	}

	// Check for embedded value (--flag=value)
	if idx := strings.Index(flag, "="); idx != -1 {
		return flag[:idx], flag[idx+1:], true
	}

	return flag, "", false
}

// GetFlag checks if a flag exists in the args slice.
// Supports both short (-f) and long (--flag) format.
func GetFlag(args []string, flag string) bool {
	if len(args) == 0 || flag == "" {
		return false
	}

	// Normalize flag name (remove leading dashes)
	flag = strings.TrimLeft(flag, "-")

	for _, arg := range args {
		if strings.HasPrefix(arg, "-") {
			argFlag := strings.TrimLeft(arg, "-")
			// Handle --flag=value format
			if idx := strings.Index(argFlag, "="); idx != -1 {
				argFlag = argFlag[:idx]
			}
			if argFlag == flag {
				return true
			}
		}
	}
	return false
}

// GetFlagValue retrieves the value following a flag.
// Returns empty string if flag is not found or has no value.
// Supports --flag=value and --flag value formats.
func GetFlagValue(args []string, flag string) string {
	if len(args) == 0 || flag == "" {
		return ""
	}

	flag = strings.TrimLeft(flag, "-")

	for i, arg := range args {
		if strings.HasPrefix(arg, "-") {
			argFlag := strings.TrimLeft(arg, "-")

			// Handle --flag=value format
			if idx := strings.Index(argFlag, "="); idx != -1 {
				if argFlag[:idx] == flag {
					return argFlag[idx+1:]
				}
			} else if argFlag == flag {
				// Handle --flag value format
				if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
					return args[i+1]
				}
			}
		}
	}
	return ""
}

// ParseIDs extracts all numeric IDs from args and returns them as a slice of integers.
// Non-numeric arguments are ignored. Returns error if any numeric string is invalid.
func ParseIDs(args []string) ([]int, error) {
	if len(args) == 0 {
		return []int{}, nil
	}

	var ids []int
	for _, arg := range args {
		// Skip flags
		if strings.HasPrefix(arg, "-") {
			continue
		}

		// Try to parse as integer
		if id, err := strconv.Atoi(arg); err == nil {
			if id < 0 {
				return nil, fmt.Errorf("negative ID not allowed: %d", id)
			}
			ids = append(ids, id)
		}
		// Silently ignore non-numeric arguments
	}

	return ids, nil
}

// Display Formatting Functions

// FormatTable creates an aligned ASCII table with proper spacing and borders.
// Headers and rows must have the same number of columns.
// Returns empty string if headers is empty.
//
// Example output:
//   +----+-------+--------+
//   | ID | Title | Status |
//   +----+-------+--------+
//   | 1  | Task1 | Done   |
//   | 2  | Task2 | Pending|
//   +----+-------+--------+
func FormatTable(headers []string, rows [][]string) string {
	if len(headers) == 0 {
		return ""
	}

	// Validate that all rows have the same number of columns as headers
	for i, row := range rows {
		if len(row) != len(headers) {
			// Pad or truncate row to match headers length
			if len(row) < len(headers) {
				// Pad with empty strings
				for len(row) < len(headers) {
					row = append(row, "")
				}
				rows[i] = row
			} else {
				// Truncate to headers length
				rows[i] = row[:len(headers)]
			}
		}
	}

	// Calculate column widths
	colWidths := make([]int, len(headers))
	for i, header := range headers {
		colWidths[i] = max(utf8.RuneCountInString(header), MinColumnWidth)
	}

	for _, row := range rows {
		for i, cell := range row {
			if i < len(colWidths) {
				colWidths[i] = max(colWidths[i], utf8.RuneCountInString(cell))
			}
		}
	}

	var builder strings.Builder

	// Build separator line
	separator := buildSeparator(colWidths)

	// Top border
	builder.WriteString(separator)
	builder.WriteString("\n")

	// Headers
	builder.WriteString(formatRow(headers, colWidths))
	builder.WriteString("\n")

	// Header separator
	builder.WriteString(separator)
	builder.WriteString("\n")

	// Data rows
	for _, row := range rows {
		builder.WriteString(formatRow(row, colWidths))
		builder.WriteString("\n")
	}

	// Bottom border
	builder.WriteString(separator)

	return builder.String()
}

// buildSeparator creates a horizontal separator line for the table
func buildSeparator(colWidths []int) string {
	var builder strings.Builder
	builder.WriteString("+")
	for _, width := range colWidths {
		builder.WriteString(strings.Repeat("-", width+TablePadding))
		builder.WriteString("+")
	}
	return builder.String()
}

// formatRow formats a single table row with proper padding
func formatRow(cells []string, colWidths []int) string {
	var builder strings.Builder
	builder.WriteString("|")
	for i, cell := range cells {
		if i < len(colWidths) {
			padding := colWidths[i] - utf8.RuneCountInString(cell)
			builder.WriteString(" ")
			builder.WriteString(cell)
			builder.WriteString(strings.Repeat(" ", padding+1))
			builder.WriteString("|")
		}
	}
	return builder.String()
}

// FormatTodo formats a single todo item for display with color coding and proper alignment.
// Completed todos are shown in green, overdue todos in red, high priority in yellow.
func FormatTodo(todo Todo) string {
	var builder strings.Builder

	// Status indicator with color
	status := "[ ]"
	statusColor := ColorWhite
	if todo.Completed {
		status = "[✓]"
		statusColor = ColorGreen
	} else if todo.DueDate != nil && todo.DueDate.Before(time.Now()) {
		statusColor = ColorRed
	} else if strings.ToLower(todo.Priority) == "high" {
		statusColor = ColorYellow
	}

	// Format: [✓] 1. Task Title (due: 2023-12-01) [HIGH]
	builder.WriteString(statusColor)
	builder.WriteString(status)
	builder.WriteString(ColorReset)
	builder.WriteString(fmt.Sprintf(" %d. ", todo.ID))

	// Title with priority color
	if strings.ToLower(todo.Priority) == "high" {
		builder.WriteString(ColorYellow)
		builder.WriteString(ColorBold)
	}
	builder.WriteString(todo.Title)
	if strings.ToLower(todo.Priority) == "high" {
		builder.WriteString(ColorReset)
	}

	// Due date if present
	if todo.DueDate != nil {
		builder.WriteString(" (due: ")
		if todo.DueDate.Before(time.Now()) && !todo.Completed {
			builder.WriteString(ColorRed)
		}
		builder.WriteString(todo.DueDate.Format(DateFormat))
		builder.WriteString(ColorReset)
		builder.WriteString(")")
	}

	// Priority indicator
	if todo.Priority != "" && strings.ToLower(todo.Priority) != "normal" {
		builder.WriteString(" [")
		builder.WriteString(strings.ToUpper(todo.Priority))
		builder.WriteString("]")
	}

	// Description if present
	if todo.Description != "" {
		builder.WriteString("\n    ")
		builder.WriteString(ColorCyan)
		builder.WriteString(Truncate(todo.Description, 80))
		builder.WriteString(ColorReset)
	}

	// Creation date
	builder.WriteString("\n    Created: ")
	builder.WriteString(FormatDate(todo.CreatedAt))

	return builder.String()
}

// Truncate shortens text to maxLen characters, adding "..." if truncated.
// Properly handles Unicode characters and ensures the result doesn't exceed maxLen.
func Truncate(text string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}

	if maxLen <= len(EllipsisIndicator) {
		// If maxLen is too small for ellipsis, just return truncated text
		runes := []rune(text)
		if len(runes) <= maxLen {
			return text
		}
		return string(runes[:maxLen])
	}

	runes := []rune(text)
	if len(runes) <= maxLen {
		return text
	}

	truncateLen := maxLen - len(EllipsisIndicator)
	return string(runes[:truncateLen]) + EllipsisIndicator
}

// FormatDate converts time.Time to relative format for recent dates or absolute date for older ones.
// Rules:
// - < 1 hour: "X minutes ago"
// - < 24 hours: "X hours ago"  
// - < 7 days: "X days ago"
// - Older: "2006-01-02" format
func FormatDate(date time.Time) string {
	if date.IsZero() {
		return "Never"
	}

	now := time.Now()
	duration := now.Sub(date)

	// Handle future dates
	if duration < 0 {
		duration = -duration
		if duration < time.Hour {
			minutes := int(duration.Minutes())
			if minutes <= 1 {
				return "in 1 minute"
			}
			return fmt.Sprintf("in %d minutes", minutes)
		} else if duration < 24*time.Hour {
			hours := int(duration.Hours())
			if hours == 1 {
				return "in 1 hour"
			}
			return fmt.Sprintf("in %d hours", hours)
		} else if duration < 7*24*time.Hour {
			days := int(duration.Hours() / 24)
			if days == 1 {
				return "in 1 day"
			}
			return fmt.Sprintf("in %d days", days)
		}
		return date.Format(DateFormat)
	}

	// Handle past dates
	if duration < time.Hour {
		minutes := int(duration.Minutes())
		if minutes <= 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", minutes)
	} else if duration < 24*time.Hour {
		hours := int(duration.Hours())
		if hours == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)
	} else if duration < 7*24*time.Hour {
		days := int(duration.Hours() / 24)
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	}

	return date.Format(DateFormat)
}

// Color Helper Functions

// Colorize wraps text with ANSI color codes.
// Returns plain text if color is empty or invalid.
func Colorize(text, color string) string {
	if text == "" || color == "" {
		return text
	}
	return color + text + ColorReset
}

// StripColors removes ANSI color codes from text.
// Useful for calculating