// Package utils provides utility functions for parsing command line arguments
// and formatting display output for todo applications.
package utils

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Todo represents a todo item with basic fields
type Todo struct {
	ID       int
	Status   bool
	Priority string
	Text     string
	Created  time.Time
}

// ANSI color codes
const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
)

// supportsColor checks if the terminal supports ANSI colors
func supportsColor() bool {
	term := os.Getenv("TERM")
	if term == "" || term == "dumb" {
		return false
	}
	
	// Check for common terminals that support color
	colorTerms := []string{"xterm", "screen", "tmux", "rxvt", "color", "ansi", "cygwin", "linux"}
	for _, ct := range colorTerms {
		if strings.Contains(term, ct) {
			return true
		}
	}
	
	// Check for explicit color support environment variables
	return os.Getenv("COLORTERM") != "" || os.Getenv("FORCE_COLOR") != ""
}

// colorize applies ANSI color codes if terminal supports colors
func colorize(text, color string) string {
	if !supportsColor() {
		return text
	}
	return color + text + colorReset
}

// ParseArgs extracts command, text, and flags from command line arguments.
// Flags are identified by leading dashes (- or --).
// Returns the first non-flag argument as command, remaining non-flag text,
// and a map of flags with their values.
//
// Example:
//   args := []string{"add", "Buy milk", "--priority", "high", "-f"}
//   cmd, text, flags := ParseArgs(args)
//   // cmd: "add", text: "Buy milk", flags: {"priority": "high", "f": ""}
func ParseArgs(args []string) (command string, text string, flags map[string]string) {
	if len(args) == 0 {
		return "", "", make(map[string]string)
	}
	
	flags = make(map[string]string)
	var textParts []string
	var foundCommand bool
	
	for i := 0; i < len(args); i++ {
		arg := args[i]
		
		// Handle flags
		if strings.HasPrefix(arg, "-") {
			flagName := strings.TrimLeft(arg, "-")
			if flagName == "" {
				continue // Skip invalid flags like just "-" or "--"
			}
			
			// Check if next argument is the flag value (not another flag)
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				flags[flagName] = args[i+1]
				i++ // Skip the next argument as it's the flag value
			} else {
				flags[flagName] = "" // Boolean flag
			}
		} else {
			// First non-flag argument is the command
			if !foundCommand {
				command = arg
				foundCommand = true
			} else {
				// Remaining non-flag arguments are text
				textParts = append(textParts, arg)
			}
		}
	}
	
	text = strings.Join(textParts, " ")
	return command, text, flags
}

// GetFlag checks if a flag exists in the arguments.
// Supports both single dash (-f) and double dash (--flag) formats.
//
// Example:
//   args := []string{"add", "task", "-f", "--verbose"}
//   hasF := GetFlag(args, "f")        // true
//   hasV := GetFlag(args, "verbose")  // true
//   hasX := GetFlag(args, "x")        // false
func GetFlag(args []string, flag string) bool {
	for _, arg := range args {
		if arg == "-"+flag || arg == "--"+flag {
			return true
		}
	}
	return false
}

// GetFlagValue returns the value following a flag in the arguments.
// Returns empty string if flag is not found or has no value.
//
// Example:
//   args := []string{"add", "task", "--priority", "high", "-f"}
//   priority := GetFlagValue(args, "priority") // "high"
//   f := GetFlagValue(args, "f")               // ""
func GetFlagValue(args []string, flag string) string {
	for i, arg := range args {
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

// ParseIDs extracts and returns all numeric IDs from arguments.
// Ignores non-numeric arguments and invalid numbers.
//
// Example:
//   args := []string{"complete", "1", "3", "invalid", "5"}
//   ids := ParseIDs(args) // []int{1, 3, 5}
func ParseIDs(args []string) []int {
	var ids []int
	
	for _, arg := range args {
		// Skip flags
		if strings.HasPrefix(arg, "-") {
			continue
		}
		
		if id, err := strconv.Atoi(arg); err == nil && id > 0 {
			ids = append(ids, id)
		}
	}
	
	return ids
}

// FormatTable creates a properly aligned ASCII table with borders.
// Headers and rows must have the same number of columns.
// Returns empty string if headers is empty or if any row has mismatched columns.
//
// Example:
//   headers := []string{"ID", "Status", "Task"}
//   rows := [][]string{
//       {"1", "[ ]", "Buy milk"},
//       {"2", "[✓]", "Walk dog"},
//   }
//   table := FormatTable(headers, rows)
func FormatTable(headers []string, rows [][]string) string {
	if len(headers) == 0 {
		return ""
	}
	
	// Validate that all rows have the same number of columns as headers
	for _, row := range rows {
		if len(row) != len(headers) {
			return ""
		}
	}
	
	// Calculate column widths
	colWidths := make([]int, len(headers))
	
	// Initialize with header widths
	for i, header := range headers {
		colWidths[i] = utf8.RuneCountInString(header)
	}
	
	// Update with row data widths
	for _, row := range rows {
		for i, cell := range row {
			if width := utf8.RuneCountInString(cell); width > colWidths[i] {
				colWidths[i] = width
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
		for i, cell := range row {
			if i > 0 {
				result.WriteString(" | ")
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
// Applies color coding: green for completed todos, red for high priority incomplete todos.
//
// Example output:
//   "1   | [ ]    | high     | Buy groceries"
//   "2   | [✓]    | medium   | Walk the dog"
func FormatTodo(todo Todo) string {
	status := "[ ]"
	if todo.Status {
		status = "[✓]"
	}
	
	formatted := fmt.Sprintf("%-3d | %-6s | %-8s | %s",
		todo.ID,
		status,
		todo.Priority,
		todo.Text,
	)
	
	// Apply colors
	if todo.Status {
		return colorize(formatted, colorGreen)
	} else if strings.ToLower(todo.Priority) == "high" {
		return colorize(formatted, colorRed)
	}
	
	return formatted
}

// Truncate shortens text to maxLen characters, adding ellipsis if truncated.
// Properly handles Unicode characters and ensures the result doesn't exceed maxLen.
// Returns original text if maxLen is less than 4 or text is already short enough.
//
// Example:
//   Truncate("Hello, World!", 10) // "Hello, W..."
//   Truncate("Short", 10)         // "Short"
func Truncate(text string, maxLen int) string {
	if maxLen < 4 {
		return text
	}
	
	runes := []rune(text)
	if len(runes) <= maxLen {
		return text
	}
	
	return string(runes[:maxLen-3]) + "..."
}

// FormatDate converts a time to a relative time format.
// Rules:
//   - < 1 hour: "X minutes ago"
//   - < 24 hours: "X hours ago"
//   - < 7 days: "X days ago"
//   - Older: "YYYY-MM-DD"
//
// Example:
//   FormatDate(time.Now().Add(-30*time.Minute)) // "30 minutes ago"
//   FormatDate(time.Now().Add(-2*time.Hour))    // "2 hours ago"
//   FormatDate(time.Now().Add(-3*24*time.Hour)) // "3 days ago"
func FormatDate(date time.Time) string {
	now := time.Now()
	duration := now.Sub(date)
	
	switch {
	case duration < time.Hour:
		minutes := int(duration.Minutes())
		if minutes < 1 {
			return "just now"
		}
		return fmt.Sprintf("%d minutes ago", minutes)
		
	case duration < 24*time.Hour:
		hours := int(duration.Hours())
		return fmt.Sprintf("%d hours ago", hours)
		
	case duration < 7*24*time.Hour:
		days := int(duration.Hours() / 24)
		return fmt.Sprintf("%d days ago", days)
		
	default:
		return date.Format("2006-01-02")
	}
}

// Helper functions for color support

// ColorizeGreen applies green color to text if terminal supports colors
func ColorizeGreen(text string) string {
	return colorize(text, colorGreen)
}

// ColorizeRed applies red color to text if terminal supports colors
func ColorizeRed(text string) string {
	return colorize(text, colorRed)
}

// ColorizeYellow applies yellow color to text if terminal supports colors
func ColorizeYellow(text string) string {
	return colorize(text, colorYellow)
}

// Example usage:
//
// func main() {
//     // Parse command line arguments
//     args := os.Args[1:]
//     cmd, text, flags := utils.ParseArgs(args)
//     
//     // Create a todo
//     todo := utils.Todo{
//         ID:       1,
//         Status:   false,
//         Priority: "high",
//         Text:     "Complete the project",
//         Created:  time.Now().Add(-2 * time.Hour),
//     }
//     
//     // Format and display
//     fmt.Println(utils.FormatTodo(todo))
//     fmt.Println("Created:", utils.FormatDate(todo.Created))
//     
//     // Create a table
//     headers := []string{"ID", "Status", "Priority", "Todo"}
//     rows := [][]string{
//         {"1", "[ ]", "high", "Finish report"},
//         {"2", "[✓]", "medium", "Buy groceries"},
//     }
//     fmt.Print(utils.FormatTable(headers, rows))
// }