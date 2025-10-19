// Package utils provides utility functions for parsing command-line arguments
// and formatting display output. It includes functions for argument parsing,
// table formatting, date formatting, and text manipulation operations.
//
// The package is designed to work with command-line applications that need
// to parse arguments, display tabular data, and format various types of output
// in a consistent and user-friendly manner.
package utils

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Todo represents a todo item with basic fields for display formatting.
type Todo struct {
	ID       int       // Unique identifier for the todo item
	Status   string    // Status of the todo (e.g., "pending", "completed")
	Priority string    // Priority level (e.g., "high", "medium", "low")
	Text     string    // The todo item description
	Created  time.Time // Creation timestamp
}

// ANSI color codes for terminal output
const (
	colorReset  = "\033[0m"
	colorGreen  = "\033[32m"
	colorRed    = "\033[31m"
	colorYellow = "\033[33m"
)

// isTerminal checks if the output is a terminal that supports colors.
// This is a simplified check that works on most Unix-like systems.
func isTerminal() bool {
	fileInfo, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (fileInfo.Mode() & os.ModeCharDevice) != 0
}

// colorize applies ANSI color codes to text if terminal supports it.
func colorize(text, color string) string {
	if !isTerminal() {
		return text
	}
	return color + text + colorReset
}

// ParseArgs extracts command, remaining text, and flags from a string slice.
// The first non-flag argument is treated as the command, subsequent non-flag
// arguments are joined as text, and flag arguments are parsed into a map.
//
// Flags can be in format -flag or --flag. Flag values are supported in
// format -flag=value or --flag=value.
//
// Example:
//   args := []string{"add", "Buy milk", "--priority=high", "-urgent"}
//   cmd, text, flags := ParseArgs(args)
//   // cmd = "add", text = "Buy milk", flags = {"priority": "high", "urgent": ""}
func ParseArgs(args []string) (command string, text string, flags map[string]string) {
	if args == nil {
		return "", "", make(map[string]string)
	}

	flags = make(map[string]string)
	var textParts []string
	commandSet := false

	for _, arg := range args {
		if strings.HasPrefix(arg, "--") {
			// Handle --flag or --flag=value
			flag := strings.TrimPrefix(arg, "--")
			if idx := strings.Index(flag, "="); idx != -1 {
				flags[flag[:idx]] = flag[idx+1:]
			} else {
				flags[flag] = ""
			}
		} else if strings.HasPrefix(arg, "-") {
			// Handle -flag or -flag=value
			flag := strings.TrimPrefix(arg, "-")
			if idx := strings.Index(flag, "="); idx != -1 {
				flags[flag[:idx]] = flag[idx+1:]
			} else {
				flags[flag] = ""
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

// GetFlag checks if a flag exists in the arguments slice.
// Supports both -flag and --flag formats.
//
// Example:
//   args := []string{"add", "task", "--urgent", "-v"}
//   hasUrgent := GetFlag(args, "urgent")  // returns true
//   hasVerbose := GetFlag(args, "v")      // returns true
//   hasQuiet := GetFlag(args, "quiet")    // returns false
func GetFlag(args []string, flag string) bool {
	if args == nil || flag == "" {
		return false
	}

	shortFlag := "-" + flag
	longFlag := "--" + flag

	for _, arg := range args {
		if arg == shortFlag || arg == longFlag {
			return true
		}
		// Check for flag=value format
		if strings.HasPrefix(arg, shortFlag+"=") || strings.HasPrefix(arg, longFlag+"=") {
			return true
		}
	}
	return false
}

// GetFlagValue retrieves the value associated with a flag.
// Returns the value and a boolean indicating if the flag was found.
// Supports both -flag=value and --flag=value formats.
//
// Example:
//   args := []string{"add", "task", "--priority=high", "-n=5"}
//   priority, found := GetFlagValue(args, "priority")  // returns "high", true
//   count, found := GetFlagValue(args, "n")           // returns "5", true
//   missing, found := GetFlagValue(args, "missing")   // returns "", false
func GetFlagValue(args []string, flag string) (string, bool) {
	if args == nil || flag == "" {
		return "", false
	}

	shortPrefix := "-" + flag + "="
	longPrefix := "--" + flag + "="

	for _, arg := range args {
		if strings.HasPrefix(arg, shortPrefix) {
			return strings.TrimPrefix(arg, shortPrefix), true
		}
		if strings.HasPrefix(arg, longPrefix) {
			return strings.TrimPrefix(arg, longPrefix), true
		}
	}
	return "", false
}

// ParseIDs extracts numeric IDs from arguments, skipping non-numeric values.
// Returns an error if any numeric-looking argument cannot be parsed as an integer.
//
// Example:
//   args := []string{"delete", "1", "5", "10", "task"}
//   ids, err := ParseIDs(args)  // returns [1, 5, 10], nil
func ParseIDs(args []string) ([]int, error) {
	if args == nil {
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
			ids = append(ids, id)
		} else {
			// If it looks like it should be a number but isn't, return error
			if len(arg) > 0 && (arg[0] >= '0' && arg[0] <= '9') {
				return nil, fmt.Errorf("invalid ID format: %s", arg)
			}
		}
	}
	return ids, nil
}

// FormatTable creates a formatted ASCII table with headers and rows.
// Automatically calculates column widths and adds proper borders and padding.
// Handles Unicode characters correctly for width calculations.
//
// Example:
//   headers := []string{"ID", "Status", "Task"}
//   rows := [][]string{
//       {"1", "pending", "Buy milk"},
//       {"2", "completed", "Walk dog"},
//   }
//   table := FormatTable(headers, rows)
func FormatTable(headers []string, rows [][]string) string {
	if len(headers) == 0 {
		return ""
	}

	// Calculate column widths
	colWidths := make([]int, len(headers))
	
	// Initialize with header widths
	for i, header := range headers {
		colWidths[i] = utf8.RuneCountInString(header)
	}

	// Check row widths
	for _, row := range rows {
		for i, cell := range row {
			if i < len(colWidths) {
				cellWidth := utf8.RuneCountInString(cell)
				if cellWidth > colWidths[i] {
					colWidths[i] = cellWidth
				}
			}
		}
	}

	var builder strings.Builder

	// Build separator line
	buildSeparator := func() string {
		var sep strings.Builder
		sep.WriteString("+")
		for _, width := range colWidths {
			sep.WriteString(strings.Repeat("-", width+2))
			sep.WriteString("+")
		}
		return sep.String()
	}

	// Build row
	buildRow := func(cells []string) string {
		var row strings.Builder
		row.WriteString("|")
		for i, cell := range cells {
			if i < len(colWidths) {
				padding := colWidths[i] - utf8.RuneCountInString(cell)
				row.WriteString(" ")
				row.WriteString(cell)
				row.WriteString(strings.Repeat(" ", padding+1))
				row.WriteString("|")
			}
		}
		return row.String()
	}

	// Top border
	separator := buildSeparator()
	builder.WriteString(separator)
	builder.WriteString("\n")

	// Headers
	builder.WriteString(buildRow(headers))
	builder.WriteString("\n")

	// Header separator
	builder.WriteString(separator)
	builder.WriteString("\n")

	// Data rows
	for _, row := range rows {
		builder.WriteString(buildRow(row))
		builder.WriteString("\n")
	}

	// Bottom border
	builder.WriteString(separator)

	return builder.String()
}

// FormatTodo formats a single Todo item for display.
// Applies color coding based on status and priority if terminal supports it.
//
// Example output: "[1] ✓ HIGH: Buy milk (2 hours ago)"
func FormatTodo(todo Todo) string {
	if todo.Text == "" {
		return ""
	}

	var builder strings.Builder

	// ID
	builder.WriteString(fmt.Sprintf("[%d] ", todo.ID))

	// Status indicator
	statusSymbol := "○"
	if todo.Status == "completed" {
		statusSymbol = colorize("✓", colorGreen)
	} else if todo.Priority == "high" {
		statusSymbol = colorize("!", colorRed)
	}
	builder.WriteString(statusSymbol)
	builder.WriteString(" ")

	// Priority
	if todo.Priority != "" {
		priority := strings.ToUpper(todo.Priority)
		if todo.Priority == "high" {
			priority = colorize(priority, colorRed)
		} else if todo.Priority == "medium" {
			priority = colorize(priority, colorYellow)
		}
		builder.WriteString(priority)
		builder.WriteString(": ")
	}

	// Text
	text := todo.Text
	if todo.Status == "completed" {
		text = colorize(text, colorGreen)
	}
	builder.WriteString(text)

	// Date
	if !todo.Created.IsZero() {
		dateStr := FormatDate(todo.Created)
		builder.WriteString(fmt.Sprintf(" (%s)", dateStr))
	}

	return builder.String()
}

// Truncate shortens text to maxLen characters, adding ellipsis if truncated.
// Properly handles Unicode characters and ensures the result doesn't exceed maxLen.
//
// Example:
//   text := "This is a very long todo item description"
//   short := Truncate(text, 20)  // returns "This is a very lo..."
func Truncate(text string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}

	if utf8.RuneCountInString(text) <= maxLen {
		return text
	}

	if maxLen <= 3 {
		return strings.Repeat(".", maxLen)
	}

	// Convert to runes for proper Unicode handling
	runes := []rune(text)
	truncated := string(runes[:maxLen-3])
	return truncated + "..."
}

// FormatDate converts a time.Time to a human-readable relative time string.
// Returns relative time for recent dates (minutes, hours, days ago) and
// absolute date (YYYY-MM-DD) for dates older than 7 days.
//
// Examples:
//   - "2 minutes ago"
//   - "1 hour ago"
//   - "3 days ago"
//   - "2023-12-01" (for dates > 7 days ago)
func FormatDate(date time.Time) string {
	if date.IsZero() {
		return ""
	}

	now := time.Now()
	duration := now.Sub(date)

	// Handle future dates
	if duration < 0 {
		duration = -duration
		if duration < time.Minute {
			return "in a few seconds"
		} else if duration < time.Hour {
			minutes := int(duration.Minutes())
			if minutes == 1 {
				return "in 1 minute"
			}
			return fmt.Sprintf("in %d minutes", minutes)
		} else if duration < 24*time.Hour {
			hours := int(duration.Hours())
			if hours == 1 {
				return "in 1 hour"
			}
			return fmt.Sprintf("in %d hours", hours)
		}
		return date.Format("2006-01-02")
	}

	// Past dates
	if duration < time.Minute {
		return "just now"
	} else if duration < time.Hour {
		minutes := int(duration.Minutes())
		if minutes == 1 {
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

	// For dates older than 7 days, return absolute date
	return date.Format("2006-01-02")
}

// StringInSlice checks if a string exists in a slice of strings.
// This is a helper function for common string operations.
func StringInSlice(str string, slice []string) bool {
	for _, s := range slice {
		if s == str {
			return true
		}
	}
	return false
}

// PadRight pads a string with spaces to reach the specified width.
// Handles Unicode characters correctly.
func PadRight(str string, width int) string {
	strWidth := utf8.RuneCountInString(str)
	if strWidth >= width {
		return str
	}
	return str + strings.Repeat(" ", width-strWidth)
}

// PadLeft pads a string with spaces on the left to reach the specified width.
// Handles Unicode characters correctly.
func PadLeft(str string, width int) string {
	strWidth := utf8.RuneCountInString(str)
	if strWidth >= width {
		return str
	}
	return strings.Repeat(" ", width-strWidth) + str
}

// Center centers a string within the specified width by adding spaces.
// Handles Unicode characters correctly.
func Center(str string, width int) string {
	strWidth := utf8.RuneCountInString(str)
	if strWidth >= width {
		return str
	}
	
	totalPadding := width - strWidth
	leftPadding := totalPadding / 2