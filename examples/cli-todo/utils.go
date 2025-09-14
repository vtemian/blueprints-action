// Package utils provides utility functions for parsing command-line arguments
// and formatting display output. It includes functions for argument parsing,
// table formatting, date formatting, and text manipulation.
package utils

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// ANSI color codes for terminal output
const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
)

// supportsColor checks if the terminal supports ANSI color codes
func supportsColor() bool {
	term := os.Getenv("TERM")
	return term != "" && term != "dumb"
}

// colorize applies color to text if terminal supports it
func colorize(text, color string) string {
	if supportsColor() {
		return color + text + colorReset
	}
	return text
}

// ParseArgs extracts command, remaining text, and flags from command-line arguments.
// It returns the first non-flag argument as command, concatenated remaining non-flag
// arguments as text, and all flags with their values in a map.
//
// Flags can be in format -flag, --flag, -flag=value, or --flag=value.
// For flags without explicit values, the value in the map will be "true".
func ParseArgs(args []string) (command string, text string, flags map[string]string) {
	if args == nil {
		return "", "", make(map[string]string)
	}

	flags = make(map[string]string)
	var textParts []string
	commandFound := false

	for i := 0; i < len(args); i++ {
		arg := args[i]

		// Check if this is a flag
		if strings.HasPrefix(arg, "-") {
			flagName, flagValue := parseFlag(arg)
			if flagName != "" {
				// Check if value is in next argument (for flags without =)
				if flagValue == "true" && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
					// Only use next arg as value if it doesn't look like a flag
					flagValue = args[i+1]
					i++ // Skip next argument as it's the flag value
				}
				flags[flagName] = flagValue
			}
		} else {
			// This is not a flag
			if !commandFound {
				command = arg
				commandFound = true
			} else {
				textParts = append(textParts, arg)
			}
		}
	}

	text = strings.Join(textParts, " ")
	return command, text, flags
}

// parseFlag extracts flag name and value from a flag argument
func parseFlag(arg string) (name, value string) {
	// Remove leading dashes
	flag := strings.TrimLeft(arg, "-")
	if flag == "" || flag == arg {
		return "", ""
	}

	// Check for = separator
	if idx := strings.Index(flag, "="); idx != -1 {
		return flag[:idx], flag[idx+1:]
	}

	return flag, "true"
}

// GetFlag checks if a flag exists in the arguments.
// Supports both -flag and --flag formats.
func GetFlag(args []string, flag string) bool {
	if args == nil || flag == "" {
		return false
	}

	for _, arg := range args {
		if arg == "-"+flag || arg == "--"+flag {
			return true
		}
		// Check for flag with value (flag=value)
		if strings.HasPrefix(arg, "-"+flag+"=") || strings.HasPrefix(arg, "--"+flag+"=") {
			return true
		}
	}
	return false
}

// GetFlagValue returns the value associated with a flag.
// Returns empty string if flag is not found.
// Supports formats: -flag value, --flag value, -flag=value, --flag=value
func GetFlagValue(args []string, flag string) string {
	if args == nil || flag == "" {
		return ""
	}

	for i, arg := range args {
		// Check for flag=value format
		if strings.HasPrefix(arg, "-"+flag+"=") {
			return strings.TrimPrefix(arg, "-"+flag+"=")
		}
		if strings.HasPrefix(arg, "--"+flag+"=") {
			return strings.TrimPrefix(arg, "--"+flag+"=")
		}

		// Check for flag value format (value in next argument)
		if (arg == "-"+flag || arg == "--"+flag) && i+1 < len(args) {
			nextArg := args[i+1]
			// Make sure next argument is not another flag
			if !strings.HasPrefix(nextArg, "-") {
				return nextArg
			}
		}
	}
	return ""
}

// ParseIDs extracts all numeric IDs from arguments, skipping invalid numbers.
// Returns a slice of integers found in the arguments.
func ParseIDs(args []string) []int {
	if args == nil {
		return []int{}
	}

	var ids []int
	for _, arg := range args {
		// Try to parse each argument as an integer
		if id, err := strconv.Atoi(arg); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// FormatTable creates a properly aligned ASCII table with borders.
// Takes headers and rows of data, returns formatted table string.
// Handles empty inputs gracefully and calculates column widths dynamically.
func FormatTable(headers []string, rows [][]string) string {
	if len(headers) == 0 {
		return ""
	}

	// Calculate column widths
	colWidths := make([]int, len(headers))
	
	// Initialize with header widths
	for i, header := range headers {
		colWidths[i] = len(header)
	}

	// Check row widths
	for _, row := range rows {
		for i, cell := range row {
			if i < len(colWidths) && len(cell) > colWidths[i] {
				colWidths[i] = len(cell)
			}
		}
	}

	var result strings.Builder

	// Create top border
	result.WriteString("+")
	for _, width := range colWidths {
		result.WriteString(strings.Repeat("-", width+2))
		result.WriteString("+")
	}
	result.WriteString("\n")

	// Write headers
	result.WriteString("|")
	for i, header := range headers {
		result.WriteString(fmt.Sprintf(" %-*s |", colWidths[i], header))
	}
	result.WriteString("\n")

	// Create separator
	result.WriteString("+")
	for _, width := range colWidths {
		result.WriteString(strings.Repeat("-", width+2))
		result.WriteString("+")
	}
	result.WriteString("\n")

	// Write rows
	for _, row := range rows {
		result.WriteString("|")
		for i := 0; i < len(colWidths); i++ {
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			result.WriteString(fmt.Sprintf(" %-*s |", colWidths[i], cell))
		}
		result.WriteString("\n")
	}

	// Create bottom border
	result.WriteString("+")
	for _, width := range colWidths {
		result.WriteString(strings.Repeat("-", width+2))
		result.WriteString("+")
	}

	return result.String()
}

// FormatTodo formats a single todo item for display.
// Applies appropriate colors based on status and priority.
// Status should be "completed" or "pending", priority should be "high", "medium", or "low".
func FormatTodo(id int, status string, priority string, text string) string {
	var statusIcon string
	var formattedText string

	// Determine status icon and text color
	if strings.ToLower(status) == "completed" {
		statusIcon = "[✓]"
		formattedText = colorize(text, colorGreen)
	} else {
		statusIcon = "[ ]"
		if strings.ToLower(priority) == "high" {
			formattedText = colorize(text, colorRed)
		} else {
			formattedText = text
		}
	}

	return fmt.Sprintf("%d. %s %s", id, statusIcon, formattedText)
}

// Truncate shortens text to maxLen characters, adding "..." if truncated.
// Preserves the total length as maxLen (including the "...").
// Returns original text if it's shorter than or equal to maxLen.
func Truncate(text string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	
	if len(text) <= maxLen {
		return text
	}

	if maxLen <= 3 {
		return strings.Repeat(".", maxLen)
	}

	return text[:maxLen-3] + "..."
}

// FormatDate converts a time.Time to a relative time string or absolute date.
// Returns:
// - "X minutes ago" for times less than 1 hour ago
// - "X hours ago" for times less than 24 hours ago  
// - "X days ago" for times less than 7 days ago
// - "2006-01-02" format for older dates
func FormatDate(date time.Time) string {
	now := time.Now()
	duration := now.Sub(date)

	// Handle future dates
	if duration < 0 {
		duration = -duration
	}

	minutes := int(duration.Minutes())
	hours := int(duration.Hours())
	days := int(duration.Hours() / 24)

	switch {
	case minutes < 60:
		if minutes <= 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", minutes)
	case hours < 24:
		if hours == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)
	case days < 7:
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	default:
		return date.Format("2006-01-02")
	}
}