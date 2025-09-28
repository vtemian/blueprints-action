// Package utils provides utility functions for command-line argument parsing,
// display formatting, and text processing operations.
package utils

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// ANSI color codes for terminal output
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

// ParseArgs extracts command, text, and flags from a string slice.
// Returns the first non-flag argument as command, remaining non-flag arguments
// joined as text, and a map of flags with their values.
func ParseArgs(args []string) (command string, text string, flags map[string]string) {
	if args == nil {
		return "", "", make(map[string]string)
	}

	flags = make(map[string]string)
	var nonFlagArgs []string

	for i := 0; i < len(args); i++ {
		arg := args[i]
		
		if strings.HasPrefix(arg, "--") {
			// Handle --flag=value format
			if strings.Contains(arg, "=") {
				parts := strings.SplitN(arg[2:], "=", 2)
				if len(parts) == 2 {
					flags[parts[0]] = parts[1]
				}
			} else {
				// Handle --flag format (check if next arg is value)
				flagName := arg[2:]
				if i+1 < len(args) && !strings.HasPrefix(args[i+1], "--") {
					flags[flagName] = args[i+1]
					i++ // Skip next argument as it's the flag value
				} else {
					flags[flagName] = "true"
				}
			}
		} else {
			nonFlagArgs = append(nonFlagArgs, arg)
		}
	}

	if len(nonFlagArgs) > 0 {
		command = nonFlagArgs[0]
		if len(nonFlagArgs) > 1 {
			text = strings.Join(nonFlagArgs[1:], " ")
		}
	}

	return command, text, flags
}

// GetFlag checks if a specific flag exists in the arguments.
// Returns true if the flag is present, false otherwise.
func GetFlag(args []string, flag string) bool {
	if args == nil || flag == "" {
		return false
	}

	flagWithPrefix := "--" + flag

	for _, arg := range args {
		if arg == flagWithPrefix || strings.HasPrefix(arg, flagWithPrefix+"=") {
			return true
		}
	}

	return false
}

// GetFlagValue retrieves the value associated with a specific flag.
// Returns the flag value if found, empty string otherwise.
func GetFlagValue(args []string, flag string) string {
	if args == nil || flag == "" {
		return ""
	}

	flagWithPrefix := "--" + flag

	for i, arg := range args {
		if strings.HasPrefix(arg, flagWithPrefix+"=") {
			// Handle --flag=value format
			parts := strings.SplitN(arg, "=", 2)
			if len(parts) == 2 {
				return parts[1]
			}
		} else if arg == flagWithPrefix {
			// Handle --flag value format
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "--") {
				return args[i+1]
			}
		}
	}

	return ""
}

// ParseIDs extracts numeric IDs from arguments.
// Returns a slice of integers found in the arguments.
func ParseIDs(args []string) []int {
	if args == nil {
		return []int{}
	}

	var ids []int

	for _, arg := range args {
		// Skip flags
		if strings.HasPrefix(arg, "--") {
			continue
		}

		// Try to parse as integer
		if id, err := strconv.Atoi(arg); err == nil {
			ids = append(ids, id)
		}
	}

	return ids
}

// FormatTable creates an aligned ASCII table with borders.
// Takes headers and rows, returns a formatted string representation.
func FormatTable(headers []string, rows [][]string) string {
	if headers == nil {
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

	var result strings.Builder

	// Create separator line
	createSeparator := func() string {
		var sep strings.Builder
		sep.WriteString("+")
		for _, width := range colWidths {
			sep.WriteString(strings.Repeat("-", width+2))
			sep.WriteString("+")
		}
		return sep.String()
	}

	// Create row line
	createRow := func(cells []string) string {
		var row strings.Builder
		row.WriteString("|")
		for i, cell := range cells {
			if i < len(colWidths) {
				padding := colWidths[i] - utf8.RuneCountInString(cell)
				row.WriteString(" " + cell + strings.Repeat(" ", padding) + " |")
			}
		}
		return row.String()
	}

	// Build table
	separator := createSeparator()
	
	result.WriteString(separator + "\n")
	result.WriteString(createRow(headers) + "\n")
	result.WriteString(separator + "\n")

	for _, row := range rows {
		result.WriteString(createRow(row) + "\n")
	}
	
	result.WriteString(separator)

	return result.String()
}

// FormatTodo formats a single todo item for display.
// Expects a map with keys: "id", "text", "completed", "created_at".
func FormatTodo(todo map[string]interface{}) string {
	if todo == nil {
		return ""
	}

	var result strings.Builder

	// Get ID
	id := "?"
	if idVal, ok := todo["id"]; ok {
		id = fmt.Sprintf("%v", idVal)
	}

	// Get text
	text := ""
	if textVal, ok := todo["text"]; ok {
		text = fmt.Sprintf("%v", textVal)
	}

	// Get completion status
	completed := false
	if completedVal, ok := todo["completed"]; ok {
		if b, ok := completedVal.(bool); ok {
			completed = b
		}
	}

	// Get creation date
	dateStr := ""
	if createdVal, ok := todo["created_at"]; ok {
		if t, ok := createdVal.(time.Time); ok {
			dateStr = FormatDate(t)
		} else if s, ok := createdVal.(string); ok {
			if t, err := time.Parse(time.RFC3339, s); err == nil {
				dateStr = FormatDate(t)
			} else {
				dateStr = s
			}
		}
	}

	// Format output
	status := "[ ]"
	if completed {
		status = ColorGreen + "[✓]" + ColorReset
		text = ColorGreen + text + ColorReset
	}

	result.WriteString(fmt.Sprintf("%s%s%s %s", ColorBlue, id, ColorReset, status))
	if text != "" {
		result.WriteString(" " + text)
	}
	if dateStr != "" {
		result.WriteString(fmt.Sprintf(" %s(%s)%s", ColorYellow, dateStr, ColorReset))
	}

	return result.String()
}

// Truncate shortens text with ellipsis if it exceeds maxLen.
// Properly handles Unicode characters.
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

	runes := []rune(text)
	return string(runes[:maxLen-3]) + "..."
}

// FormatDate converts a time.Time to a relative time format.
// Returns human-readable relative time or absolute date for older items.
func FormatDate(date time.Time) string {
	if date.IsZero() {
		return ""
	}

	now := time.Now()
	duration := now.Sub(date)

	switch {
	case duration < time.Hour:
		minutes := int(duration.Minutes())
		if minutes <= 0 {
			return "just now"
		}
		if minutes == 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", minutes)

	case duration < 24*time.Hour:
		hours := int(duration.Hours())
		if hours == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)

	case duration < 7*24*time.Hour:
		days := int(duration.Hours() / 24)
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)

	default:
		return date.Format("2006-01-02")
	}
}

// ColorSupported checks if the current environment supports ANSI colors.
// This is a simple implementation that can be extended based on environment variables.
func ColorSupported() bool {
	// In a real implementation, you might check TERM environment variable
	// For now, we'll assume colors are supported
	return true
}

// StripColors removes ANSI color codes from a string.
// Useful for length calculations or plain text output.
func StripColors(text string) string {
	if text == "" {
		return ""
	}

	// Simple implementation to remove common ANSI escape sequences
	result := text
	colors := []string{
		ColorReset, ColorRed, ColorGreen, ColorYellow,
		ColorBlue, ColorPurple, ColorCyan, ColorWhite, ColorBold,
	}

	for _, color := range colors {
		result = strings.ReplaceAll(result, color, "")
	}

	return result
}

// ValidateInput performs basic validation on string input.
// Returns an error if the input is invalid.
func ValidateInput(input string, maxLength int) error {
	if maxLength > 0 && utf8.RuneCountInString(input) > maxLength {
		return fmt.Errorf("input exceeds maximum length of %d characters", maxLength)
	}

	if !utf8.ValidString(input) {
		return fmt.Errorf("input contains invalid UTF-8 sequences")
	}

	return nil
}

// JoinNonEmpty joins non-empty strings with the specified separator.
// Useful for building formatted output without empty segments.
func JoinNonEmpty(separator string, parts ...string) string {
	var nonEmpty []string
	
	for _, part := range parts {
		if strings.TrimSpace(part) != "" {
			nonEmpty = append(nonEmpty, part)
		}
	}
	
	return strings.Join(nonEmpty, separator)
}