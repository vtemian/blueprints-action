// Package utils provides utility functions for parsing command-line arguments
// and formatting display output with support for tables, colors, and date formatting.
package utils

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Todo represents a todo item with all necessary fields for formatting.
type Todo struct {
	ID       int
	Status   string // "completed" or "pending"
	Priority string // "high", "medium", "low"
	Text     string
	Date     time.Time
}

// ParseArgs extracts command, remaining text, and all flags from command-line arguments.
// Flags are in the format -flag or --flag, with optional values.
// Returns the first non-flag argument as command, concatenated remaining non-flag text,
// and a map of all flags with their values (empty string if no value provided).
func ParseArgs(args []string) (command string, text string, flags map[string]string) {
	if len(args) == 0 {
		return "", "", make(map[string]string)
	}

	flags = make(map[string]string)
	var textParts []string
	var foundCommand bool

	for i := 0; i < len(args); i++ {
		arg := args[i]

		// Check if this is a flag
		if strings.HasPrefix(arg, "-") {
			flagName := strings.TrimLeft(arg, "-")
			
			// Check if next argument is a value (not a flag and exists)
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				flags[flagName] = args[i+1]
				i++ // Skip the value in next iteration
			} else {
				flags[flagName] = ""
			}
		} else {
			// This is not a flag
			if !foundCommand {
				command = arg
				foundCommand = true
			} else {
				textParts = append(textParts, arg)
			}
		}
	}

	text = strings.Join(textParts, " ")
	return command, text, flags
}

// GetFlag checks if a flag exists in the arguments.
// Supports both -flag and --flag formats.
// Returns true if the flag is found, false otherwise.
func GetFlag(args []string, flag string) bool {
	if len(args) == 0 || flag == "" {
		return false
	}

	// Normalize flag name by removing leading dashes
	flag = strings.TrimLeft(flag, "-")

	for _, arg := range args {
		if strings.HasPrefix(arg, "-") {
			argFlag := strings.TrimLeft(arg, "-")
			if argFlag == flag {
				return true
			}
		}
	}
	return false
}

// GetFlagValue retrieves the value associated with a flag.
// Supports both -flag and --flag formats.
// Returns the value and true if found, empty string and false if not found.
func GetFlagValue(args []string, flag string) (string, bool) {
	if len(args) == 0 || flag == "" {
		return "", false
	}

	// Normalize flag name by removing leading dashes
	flag = strings.TrimLeft(flag, "-")

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "-") {
			argFlag := strings.TrimLeft(arg, "-")
			if argFlag == flag {
				// Check if next argument exists and is not a flag
				if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
					return args[i+1], true
				}
				// Flag found but no value
				return "", true
			}
		}
	}
	return "", false
}

// ParseIDs extracts all numeric IDs from arguments.
// Returns a slice of integers and an error if any non-numeric values
// are encountered that look like they should be IDs.
func ParseIDs(args []string) ([]int, error) {
	if len(args) == 0 {
		return nil, nil
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
			// Check if this looks like it should be a number but isn't
			if strings.TrimSpace(arg) != "" {
				// If it contains only digits and some invalid characters, it's likely a malformed ID
				hasDigit := false
				for _, r := range arg {
					if r >= '0' && r <= '9' {
						hasDigit = true
						break
					}
				}
				if hasDigit {
					return nil, fmt.Errorf("invalid ID format: %q", arg)
				}
			}
		}
	}

	return ids, nil
}

// FormatTable creates a properly aligned ASCII table with borders.
// Takes headers and rows of data, returns formatted table string.
// Handles empty inputs gracefully and ensures proper alignment.
func FormatTable(headers []string, rows [][]string) string {
	if len(headers) == 0 {
		return ""
	}

	var builder strings.Builder

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

	// Write headers
	for i, header := range headers {
		if i > 0 {
			builder.WriteString(" | ")
		}
		builder.WriteString(padRight(header, colWidths[i]))
	}
	builder.WriteString("\n")

	// Write separator
	for i := range headers {
		if i > 0 {
			builder.WriteString("-+-")
		}
		builder.WriteString(strings.Repeat("-", colWidths[i]))
	}
	builder.WriteString("\n")

	// Write rows
	for _, row := range rows {
		for i := 0; i < len(headers); i++ {
			if i > 0 {
				builder.WriteString(" | ")
			}
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			builder.WriteString(padRight(cell, colWidths[i]))
		}
		builder.WriteString("\n")
	}

	return builder.String()
}

// padRight pads a string to the specified width with spaces.
func padRight(s string, width int) string {
	runeCount := utf8.RuneCountInString(s)
	if runeCount >= width {
		return s
	}
	return s + strings.Repeat(" ", width-runeCount)
}

// FormatTodo formats a single todo item according to the specified format.
// Returns a formatted string representation of the todo.
func FormatTodo(todo Todo) string {
	status := "[ ]"
	if todo.Status == "completed" {
		status = "[✓]"
	}

	priority := todo.Priority
	if priority == "" {
		priority = "medium"
	}

	dateStr := FormatDate(todo.Date)
	
	return fmt.Sprintf("%d | %s | %s | %s | %s", 
		todo.ID, status, priority, todo.Text, dateStr)
}

// Truncate shortens text to maxLen characters, adding "..." if truncated.
// Handles Unicode properly and edge cases like negative lengths.
func Truncate(text string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}

	if maxLen <= 3 {
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

	return string(runes[:maxLen-3]) + "..."
}

// FormatDate formats a date according to relative time rules.
// Returns human-readable relative time or absolute date for older items.
func FormatDate(date time.Time) string {
	if date.IsZero() {
		return ""
	}

	now := time.Now()
	duration := now.Sub(date)

	if duration < 0 {
		// Future date
		return date.Format("2006-01-02")
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

// Colorize applies ANSI color codes to text if terminal supports colors.
// Supported colors: green, red, reset.
// Automatically detects terminal support and falls back to plain text.
func Colorize(text, color string) string {
	if !supportsColor() {
		return text
	}

	var colorCode string
	switch strings.ToLower(color) {
	case "green":
		colorCode = "\033[32m"
	case "red":
		colorCode = "\033[31m"
	case "reset":
		colorCode = "\033[0m"
	default:
		return text
	}

	return colorCode + text + "\033[0m"
}

// supportsColor detects if the terminal supports ANSI colors.
// Checks environment variables commonly used to indicate color support.
func supportsColor() bool {
	// Check if we're in a terminal
	term := os.Getenv("TERM")
	if term == "" || term == "dumb" {
		return false
	}

	// Check for explicit color support
	colorTerm := os.Getenv("COLORTERM")
	if colorTerm != "" {
		return true
	}

	// Check for common terminals that support color
	supportedTerms := []string{
		"xterm", "xterm-color", "xterm-256color",
		"screen", "screen-256color",
		"tmux", "tmux-256color",
		"rxvt", "ansi",
	}

	for _, supportedTerm := range supportedTerms {
		if strings.Contains(term, supportedTerm) {
			return true
		}
	}

	// Check if NO_COLOR is set (standard for disabling colors)
	if os.Getenv("NO_COLOR") != "" {
		return false
	}

	// Default to supporting color for most modern terminals
	return true
}