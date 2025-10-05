// Package utils provides utility functions for argument parsing and display formatting.
// It includes functions for parsing command-line arguments, extracting flags and values,
// and formatting data for terminal display with proper alignment and color support.
package utils

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// ParseArgs extracts command, text, and flags from command-line arguments.
// The first non-flag argument is treated as the command.
// Remaining non-flag arguments are joined as text.
// Flags are parsed as key-value pairs (--key=value or --key value).
func ParseArgs(args []string) (command, text string, flags map[string]string) {
	if len(args) == 0 {
		return "", "", make(map[string]string)
	}

	flags = make(map[string]string)
	var textParts []string
	commandSet := false

	for i := 0; i < len(args); i++ {
		arg := args[i]

		// Check if it's a flag
		if strings.HasPrefix(arg, "--") || strings.HasPrefix(arg, "-") {
			flagName, flagValue := parseFlag(args, i)
			if flagValue != "" {
				flags[flagName] = flagValue
				// Skip next argument if it was used as flag value
				if i+1 < len(args) && !strings.Contains(arg, "=") && 
				   !strings.HasPrefix(args[i+1], "-") {
					i++
				}
			} else {
				flags[flagName] = "true"
			}
		} else {
			// Non-flag argument
			if !commandSet {
				command = arg
				commandSet = true
			} else {
				textParts = append(textParts, arg)
			}
		}
	}

	text = strings.Join(textParts, " ")
	return command, text, flags
}

// parseFlag extracts flag name and value from arguments starting at index i.
func parseFlag(args []string, i int) (name, value string) {
	arg := args[i]
	
	// Remove leading dashes
	if strings.HasPrefix(arg, "--") {
		arg = arg[2:]
	} else if strings.HasPrefix(arg, "-") {
		arg = arg[1:]
	}

	// Check for --key=value format
	if strings.Contains(arg, "=") {
		parts := strings.SplitN(arg, "=", 2)
		return parts[0], parts[1]
	}

	// Check for --key value format
	if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
		return arg, args[i+1]
	}

	// Flag without value
	return arg, ""
}

// GetFlag checks if a flag exists in the arguments.
// Supports both --flag and -flag formats.
func GetFlag(args []string, flag string) bool {
	if len(args) == 0 || flag == "" {
		return false
	}

	for _, arg := range args {
		if arg == "--"+flag || arg == "-"+flag {
			return true
		}
		// Check for --flag=value format
		if strings.HasPrefix(arg, "--"+flag+"=") || strings.HasPrefix(arg, "-"+flag+"=") {
			return true
		}
	}
	return false
}

// GetFlagValue returns the value associated with a flag.
// Returns empty string if flag is not found or has no value.
func GetFlagValue(args []string, flag string) string {
	if len(args) == 0 || flag == "" {
		return ""
	}

	for i, arg := range args {
		// Check for --flag=value format
		if strings.HasPrefix(arg, "--"+flag+"=") {
			return strings.TrimPrefix(arg, "--"+flag+"=")
		}
		if strings.HasPrefix(arg, "-"+flag+"=") {
			return strings.TrimPrefix(arg, "-"+flag+"=")
		}

		// Check for --flag value format
		if (arg == "--"+flag || arg == "-"+flag) && i+1 < len(args) {
			nextArg := args[i+1]
			if !strings.HasPrefix(nextArg, "-") {
				return nextArg
			}
		}
	}
	return ""
}

// ParseIDs extracts all numeric IDs from arguments.
// Skips invalid numbers and returns only valid integers.
func ParseIDs(args []string) []int {
	if len(args) == 0 {
		return []int{}
	}

	var ids []int
	for _, arg := range args {
		// Skip flags
		if strings.HasPrefix(arg, "-") {
			continue
		}

		if id, err := strconv.Atoi(arg); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// FormatTable creates an aligned ASCII table with proper padding and separators.
// Uses | separators and - and + for borders with proper column alignment.
func FormatTable(headers []string, rows [][]string) string {
	if len(headers) == 0 {
		return ""
	}

	// Calculate column widths
	colWidths := make([]int, len(headers))
	for i, header := range headers {
		colWidths[i] = len(header)
	}

	// Check all rows for maximum width
	for _, row := range rows {
		for i, cell := range row {
			if i < len(colWidths) && len(cell) > colWidths[i] {
				colWidths[i] = len(cell)
			}
		}
	}

	var result strings.Builder

	// Build top border
	result.WriteString("+")
	for _, width := range colWidths {
		result.WriteString(strings.Repeat("-", width+2))
		result.WriteString("+")
	}
	result.WriteString("\n")

	// Build header row
	result.WriteString("|")
	for i, header := range headers {
		result.WriteString(" ")
		result.WriteString(header)
		result.WriteString(strings.Repeat(" ", colWidths[i]-len(header)+1))
		result.WriteString("|")
	}
	result.WriteString("\n")

	// Build separator
	result.WriteString("+")
	for _, width := range colWidths {
		result.WriteString(strings.Repeat("-", width+2))
		result.WriteString("+")
	}
	result.WriteString("\n")

	// Build data rows
	for _, row := range rows {
		result.WriteString("|")
		for i := 0; i < len(colWidths); i++ {
			result.WriteString(" ")
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			result.WriteString(cell)
			result.WriteString(strings.Repeat(" ", colWidths[i]-len(cell)+1))
			result.WriteString("|")
		}
		result.WriteString("\n")
	}

	// Build bottom border
	result.WriteString("+")
	for _, width := range colWidths {
		result.WriteString(strings.Repeat("-", width+2))
		result.WriteString("+")
	}

	return result.String()
}

// FormatTodo formats a single todo item for display.
// Status formatting: [ ] for incomplete, [✓] for complete.
// Includes color support for status and priority.
func FormatTodo(id int, status string, priority string, todo string) string {
	if todo == "" {
		return ""
	}

	var statusSymbol string
	var statusColor string

	switch strings.ToLower(status) {
	case "complete", "done", "finished":
		statusSymbol = "[✓]"
		statusColor = "green"
	default:
		statusSymbol = "[ ]"
		statusColor = "reset"
	}

	var priorityColor string
	switch strings.ToLower(priority) {
	case "high", "urgent":
		priorityColor = "red"
	case "medium":
		priorityColor = "reset"
	case "low":
		priorityColor = "green"
	default:
		priorityColor = "reset"
	}

	var result strings.Builder
	result.WriteString(fmt.Sprintf("%d. ", id))
	result.WriteString(colorize(statusSymbol, statusColor))
	result.WriteString(" ")
	
	if priority != "" {
		result.WriteString("[")
		result.WriteString(colorize(strings.ToUpper(priority), priorityColor))
		result.WriteString("] ")
	}
	
	result.WriteString(todo)

	return result.String()
}

// Truncate shortens text with "..." if longer than maxLen.
// Returns original text if maxLen is less than 4 or text is shorter.
func Truncate(text string, maxLen int) string {
	if maxLen < 4 || len(text) <= maxLen {
		return text
	}
	return text[:maxLen-3] + "..."
}

// FormatDate converts time to relative format.
// Returns "X minutes ago", "X hours ago", "X days ago", or "YYYY-MM-DD" for older dates.
func FormatDate(date time.Time) string {
	if date.IsZero() {
		return ""
	}

	now := time.Now()
	diff := now.Sub(date)

	if diff < 0 {
		// Future date, return formatted date
		return date.Format("2006-01-02")
	}

	minutes := int(diff.Minutes())
	hours := int(diff.Hours())
	days := int(diff.Hours() / 24)

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
	case days < 30:
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	default:
		return date.Format("2006-01-02")
	}
}

// colorize applies ANSI color codes to text.
// Supports colors: green, red, reset.
// Detects terminal color support and gracefully falls back.
func colorize(text, color string) string {
	// Check if terminal supports colors
	if !supportsColor() {
		return text
	}

	var colorCode string
	switch strings.ToLower(color) {
	case "green":
		colorCode = "\033[32m"
	case "red":
		colorCode = "\033[31m"
	case "yellow":
		colorCode = "\033[33m"
	case "blue":
		colorCode = "\033[34m"
	case "reset":
		return text
	default:
		return text
	}

	return colorCode + text + "\033[0m"
}

// supportsColor detects if the terminal supports ANSI colors.
func supportsColor() bool {
	term := os.Getenv("TERM")
	if term == "" {
		return false
	}

	// Common terminals that support colors
	colorTerms := []string{
		"xterm", "xterm-color", "xterm-256color",
		"screen", "screen-256color",
		"tmux", "tmux-256color",
		"rxvt", "ansi", "cygwin",
	}

	for _, colorTerm := range colorTerms {
		if strings.Contains(term, colorTerm) {
			return true
		}
	}

	// Check for explicit color support environment variables
	if os.Getenv("COLORTERM") != "" {
		return true
	}

	return false
}