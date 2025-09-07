// Package utils provides utility functions for parsing command-line arguments
// and formatting display output with support for tables, todos, and dates.
package utils

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Todo represents a todo item with basic fields for display formatting.
type Todo struct {
	ID       int
	Status   string
	Priority string
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
)

// supportsColor checks if the terminal supports ANSI color codes
func supportsColor() bool {
	term := os.Getenv("TERM")
	if term == "" || term == "dumb" {
		return false
	}
	
	// Check for common terminals that support color
	colorTerms := []string{"xterm", "screen", "tmux", "rxvt", "ansi"}
	for _, colorTerm := range colorTerms {
		if strings.Contains(term, colorTerm) {
			return true
		}
	}
	
	// Check for explicit color support environment variables
	return os.Getenv("COLORTERM") != "" || os.Getenv("FORCE_COLOR") != ""
}

// colorize applies ANSI color codes if terminal supports them
func colorize(text, color string) string {
	if !supportsColor() {
		return text
	}
	return color + text + ColorReset
}

// ParseArgs extracts command, text, and flags from command-line arguments.
// Returns the first non-flag argument as command, remaining non-flag text,
// and a map of flags with their values.
func ParseArgs(args []string) (command, text string, flags map[string]string) {
	if len(args) == 0 {
		return "", "", make(map[string]string)
	}
	
	flags = make(map[string]string)
	var nonFlagArgs []string
	
	for i := 0; i < len(args); i++ {
		arg := args[i]
		
		// Handle flags starting with - or --
		if strings.HasPrefix(arg, "-") {
			flagName := strings.TrimLeft(arg, "-")
			
			// Check if next argument is the flag value (doesn't start with -)
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				flags[flagName] = args[i+1]
				i++ // Skip the next argument as it's the flag value
			} else {
				flags[flagName] = "true" // Boolean flag
			}
		} else {
			nonFlagArgs = append(nonFlagArgs, arg)
		}
	}
	
	// First non-flag argument is the command
	if len(nonFlagArgs) > 0 {
		command = nonFlagArgs[0]
		if len(nonFlagArgs) > 1 {
			text = strings.Join(nonFlagArgs[1:], " ")
		}
	}
	
	return command, text, flags
}

// GetFlag checks if a specific flag exists in the arguments.
func GetFlag(args []string, flag string) bool {
	for _, arg := range args {
		if arg == "-"+flag || arg == "--"+flag {
			return true
		}
	}
	return false
}

// GetFlagValue retrieves the value associated with a specific flag.
// Returns empty string if flag is not found or has no value.
func GetFlagValue(args []string, flag string) string {
	for i, arg := range args {
		if (arg == "-"+flag || arg == "--"+flag) && i+1 < len(args) {
			nextArg := args[i+1]
			// Ensure the next argument is not another flag
			if !strings.HasPrefix(nextArg, "-") {
				return nextArg
			}
		}
	}
	return ""
}

// ParseIDs extracts numeric IDs from command-line arguments.
// Skips non-numeric arguments and returns a slice of valid integers.
func ParseIDs(args []string) []int {
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

// FormatTable creates a properly aligned ASCII table with headers and rows.
// Returns a formatted string with borders and proper column alignment.
func FormatTable(headers []string, rows [][]string) string {
	if len(headers) == 0 {
		return ""
	}
	
	// Calculate column widths
	colWidths := make([]int, len(headers))
	
	// Initialize with header lengths
	for i, header := range headers {
		colWidths[i] = len(header)
	}
	
	// Check row lengths and update column widths
	for _, row := range rows {
		for i, cell := range row {
			if i < len(colWidths) && len(cell) > colWidths[i] {
				colWidths[i] = len(cell)
			}
		}
	}
	
	var builder strings.Builder
	
	// Format header row
	for i, header := range headers {
		if i > 0 {
			builder.WriteString(" | ")
		}
		builder.WriteString(fmt.Sprintf("%-*s", colWidths[i], header))
	}
	builder.WriteString("\n")
	
	// Format separator row
	for i, width := range colWidths {
		if i > 0 {
			builder.WriteString("-+-")
		}
		builder.WriteString(strings.Repeat("-", width))
	}
	builder.WriteString("\n")
	
	// Format data rows
	for _, row := range rows {
		for i := 0; i < len(colWidths); i++ {
			if i > 0 {
				builder.WriteString(" | ")
			}
			
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			builder.WriteString(fmt.Sprintf("%-*s", colWidths[i], cell))
		}
		builder.WriteString("\n")
	}
	
	return builder.String()
}

// FormatTodo formats a single todo item with color support and proper alignment.
// Applies colors based on status and priority if terminal supports it.
func FormatTodo(todo Todo) string {
	var builder strings.Builder
	
	// Format ID
	builder.WriteString(fmt.Sprintf("%-3d | ", todo.ID))
	
	// Format status with color
	status := todo.Status
	if strings.Contains(status, "✓") || strings.Contains(status, "x") {
		status = colorize(status, ColorGreen)
	}
	builder.WriteString(fmt.Sprintf("%-8s | ", status))
	
	// Format priority with color
	priority := todo.Priority
	switch strings.ToLower(priority) {
	case "high":
		priority = colorize(priority, ColorRed)
	case "medium":
		priority = colorize(priority, ColorYellow)
	case "low":
		priority = colorize(priority, ColorBlue)
	}
	builder.WriteString(fmt.Sprintf("%-8s | ", priority))
	
	// Format text (truncate if too long)
	text := Truncate(todo.Text, 50)
	builder.WriteString(text)
	
	return builder.String()
}

// Truncate shortens text to maxLen characters and adds ellipsis if needed.
// Preserves word boundaries when possible.
func Truncate(text string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	
	if len(text) <= maxLen {
		return text
	}
	
	if maxLen <= 3 {
		return text[:maxLen]
	}
	
	// Try to truncate at word boundary
	truncated := text[:maxLen-3]
	if lastSpace := strings.LastIndex(truncated, " "); lastSpace > maxLen/2 {
		return text[:lastSpace] + "..."
	}
	
	return truncated + "..."
}

// FormatDate converts a time.Time to a human-readable relative format.
// Shows relative time for recent dates, absolute date for older ones.
func FormatDate(date time.Time) string {
	if date.IsZero() {
		return "never"
	}
	
	now := time.Now()
	duration := now.Sub(date)
	
	// Handle future dates
	if duration < 0 {
		duration = -duration
		switch {
		case duration < time.Hour:
			minutes := int(duration.Minutes())
			if minutes <= 1 {
				return "in 1 minute"
			}
			return fmt.Sprintf("in %d minutes", minutes)
		case duration < 24*time.Hour:
			hours := int(duration.Hours())
			if hours == 1 {
				return "in 1 hour"
			}
			return fmt.Sprintf("in %d hours", hours)
		case duration < 7*24*time.Hour:
			days := int(duration.Hours() / 24)
			if days == 1 {
				return "in 1 day"
			}
			return fmt.Sprintf("in %d days", days)
		default:
			return date.Format("2006-01-02")
		}
	}
	
	// Handle past dates
	switch {
	case duration < time.Minute:
		return "just now"
	case duration < time.Hour:
		minutes := int(duration.Minutes())
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

// ValidateArgs performs basic validation on command-line arguments.
// Returns an error if arguments are malformed or contain invalid patterns.
func ValidateArgs(args []string) error {
	for i, arg := range args {
		// Check for malformed flags
		if strings.HasPrefix(arg, "-") && len(arg) == 1 {
			return fmt.Errorf("invalid flag at position %d: single dash without flag name", i)
		}
		
		// Check for empty arguments (shouldn't happen but good to validate)
		if arg == "" {
			return fmt.Errorf("empty argument at position %d", i)
		}
	}
	return nil
}

// SplitCommand splits a command string into individual arguments,
// respecting quoted strings and escaped characters.
func SplitCommand(command string) ([]string, error) {
	var args []string
	var current strings.Builder
	var inQuotes bool
	var quoteChar rune
	
	for i, char := range command {
		switch {
		case char == '"' || char == '\'':
			if !inQuotes {
				inQuotes = true
				quoteChar = char
			} else if char == quoteChar {
				inQuotes = false
				quoteChar = 0
			} else {
				current.WriteRune(char)
			}
		case char == ' ' && !inQuotes:
			if current.Len() > 0 {
				args = append(args, current.String())
				current.Reset()
			}
		case char == '\\' && i+1 < len(command):
			// Handle escaped characters
			next := rune(command[i+1])
			current.WriteRune(next)
			// Skip the next character since we've processed it
			continue
		default:
			current.WriteRune(char)
		}
	}
	
	if inQuotes {
		return nil, fmt.Errorf("unclosed quote in command: %c", quoteChar)
	}
	
	if current.Len() > 0 {
		args = append(args, current.String())
	}
	
	return args, nil
}