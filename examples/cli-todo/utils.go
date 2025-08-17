// Package utils provides utility functions for command-line todo application operations.
// It includes argument parsing, display formatting, and table generation functionality.
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
	ID       int
	Status   string // "completed" or "pending"
	Priority string // "high", "medium", "low"
	Text     string
	Created  time.Time
}

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
)

// colorSupported checks if the terminal supports ANSI colors
var colorSupported = checkColorSupport()

// checkColorSupport determines if the current terminal supports ANSI colors
func checkColorSupport() bool {
	term := os.Getenv("TERM")
	if term == "" {
		return false
	}
	
	// Check for common terminals that support colors
	colorTerms := []string{"xterm", "xterm-256color", "screen", "tmux", "rxvt"}
	for _, colorTerm := range colorTerms {
		if strings.Contains(term, colorTerm) {
			return true
		}
	}
	
	// Check COLORTERM environment variable
	return os.Getenv("COLORTERM") != ""
}

// Colorize applies ANSI color codes to text if terminal supports colors
func Colorize(text, color string) string {
	if !colorSupported {
		return text
	}
	return color + text + ColorReset
}

// ParseArgs extracts command, text, and flags from command line arguments.
// Returns the first non-flag argument as command, remaining non-flag text,
// and a map of flags with their values.
//
// Example: ["add", "--priority", "high", "Buy milk"] 
// Returns: command="add", text="Buy milk", flags={"priority": "high"}
func ParseArgs(args []string) (command, text string, flags map[string]string) {
	if len(args) == 0 {
		return "", "", make(map[string]string)
	}
	
	flags = make(map[string]string)
	var textParts []string
	var foundCommand bool
	
	for i := 0; i < len(args); i++ {
		arg := args[i]
		
		// Handle flags (--flag or -flag)
		if strings.HasPrefix(arg, "-") {
			flagName := strings.TrimLeft(arg, "-")
			if flagName == "" {
				continue
			}
			
			// Check if next argument is the flag value
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				flags[flagName] = args[i+1]
				i++ // Skip the flag value in next iteration
			} else {
				flags[flagName] = "true" // Boolean flag
			}
		} else {
			// First non-flag argument is the command
			if !foundCommand {
				command = arg
				foundCommand = true
			} else {
				// Remaining non-flag arguments form the text
				textParts = append(textParts, arg)
			}
		}
	}
	
	text = strings.Join(textParts, " ")
	return command, text, flags
}

// GetFlag checks if a flag exists in the arguments.
// Supports both --flag and -flag formats.
func GetFlag(args []string, flag string) bool {
	if len(args) == 0 || flag == "" {
		return false
	}
	
	// Normalize flag name (remove leading dashes)
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

// GetFlagValue returns the value that follows a flag in the arguments.
// Returns empty string if flag is not found or has no value.
//
// Example: ["--priority", "high"] with flag "priority" returns "high"
func GetFlagValue(args []string, flag string) string {
	if len(args) == 0 || flag == "" {
		return ""
	}
	
	// Normalize flag name
	flag = strings.TrimLeft(flag, "-")
	
	for i, arg := range args {
		if strings.HasPrefix(arg, "-") {
			argFlag := strings.TrimLeft(arg, "-")
			if argFlag == flag && i+1 < len(args) {
				nextArg := args[i+1]
				// Make sure next argument is not another flag
				if !strings.HasPrefix(nextArg, "-") {
					return nextArg
				}
			}
		}
	}
	return ""
}

// ParseIDs extracts numeric IDs from arguments.
// Returns empty slice if no valid IDs are found.
// Skips non-numeric arguments and flags.
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
		
		// Try to parse as integer
		if id, err := strconv.Atoi(arg); err == nil && id > 0 {
			ids = append(ids, id)
		}
	}
	
	return ids
}

// FormatTable creates an aligned ASCII table with borders and proper spacing.
// Returns empty string if headers is empty.
// Handles empty rows gracefully by creating header-only table.
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
	
	// Update widths based on row data
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
	
	// Build header row
	for i, header := range headers {
		if i > 0 {
			result.WriteString(" | ")
		}
		result.WriteString(padRight(header, colWidths[i]))
	}
	result.WriteString("\n")
	
	// Build separator row
	for i, width := range colWidths {
		if i > 0 {
			result.WriteString("-+-")
		}
		result.WriteString(strings.Repeat("-", width))
	}
	result.WriteString("\n")
	
	// Build data rows
	for _, row := range rows {
		for i := 0; i < len(headers); i++ {
			if i > 0 {
				result.WriteString(" | ")
			}
			
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			result.WriteString(padRight(cell, colWidths[i]))
		}
		result.WriteString("\n")
	}
	
	return result.String()
}

// padRight pads a string to the specified width with spaces
func padRight(s string, width int) string {
	runeCount := utf8.RuneCountInString(s)
	if runeCount >= width {
		return s
	}
	return s + strings.Repeat(" ", width-runeCount)
}

// FormatTodo formats a single todo item for display.
// Returns a formatted string with status indicator, priority, and text.
func FormatTodo(todo Todo) string {
	if todo.Text == "" {
		return ""
	}
	
	// Format status indicator
	statusIcon := "[ ]"
	if todo.Status == "completed" {
		statusIcon = "[✓]"
	}
	
	// Apply colors if supported
	if colorSupported {
		if todo.Status == "completed" {
			statusIcon = Colorize(statusIcon, ColorGreen)
		}
		
		// Color priority
		switch strings.ToLower(todo.Priority) {
		case "high":
			todo.Priority = Colorize(todo.Priority, ColorRed)
		case "medium":
			todo.Priority = Colorize(todo.Priority, ColorYellow)
		case "low":
			todo.Priority = Colorize(todo.Priority, ColorBlue)
		}
	}
	
	return fmt.Sprintf("%d %s %s %s", 
		todo.ID, 
		statusIcon, 
		todo.Priority, 
		todo.Text)
}

// Truncate shortens text to maxLen characters, adding ellipsis if truncated.
// Returns original text if maxLen <= 0 or text is shorter than maxLen.
// Handles Unicode characters properly.
func Truncate(text string, maxLen int) string {
	if maxLen <= 0 {
		return text
	}
	
	runes := []rune(text)
	if len(runes) <= maxLen {
		return text
	}
	
	if maxLen <= 3 {
		return string(runes[:maxLen])
	}
	
	return string(runes[:maxLen-3]) + "..."
}

// FormatDate converts a time to a relative time format.
// Uses the following rules:
// - < 1 hour: "X minutes ago"
// - < 24 hours: "X hours ago"
// - < 7 days: "X days ago"
// - Older: "YYYY-MM-DD"
func FormatDate(date time.Time) string {
	if date.IsZero() {
		return ""
	}
	
	now := time.Now()
	duration := now.Sub(date)
	
	// Handle future dates
	if duration < 0 {
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

// IsColorSupported returns whether the current terminal supports ANSI colors
func IsColorSupported() bool {
	return colorSupported
}

// SetColorSupport allows manual override of color support detection
// Useful for testing or when automatic detection fails
func SetColorSupport(enabled bool) {
	colorSupported = enabled
}