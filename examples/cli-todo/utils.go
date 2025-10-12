package utils

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// ANSI color constants
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

// Todo represents a todo item structure
type Todo struct {
	ID          int
	Text        string
	Completed   bool
	Priority    string
	CreatedAt   time.Time
	CompletedAt *time.Time
}

var (
	// colorsEnabled determines if ANSI colors should be used
	colorsEnabled = supportsColor()
)

// supportsColor checks if the terminal supports ANSI colors
func supportsColor() bool {
	term := os.Getenv("TERM")
	if term == "" || term == "dumb" {
		return false
	}
	
	// Check if output is being redirected
	if fileInfo, _ := os.Stdout.Stat(); (fileInfo.Mode() & os.ModeCharDevice) == 0 {
		return false
	}
	
	return true
}

// Colorize applies ANSI color to text if colors are enabled
func Colorize(text, color string) string {
	if !colorsEnabled {
		return text
	}
	return color + text + ColorReset
}

// ParseArgs extracts command, text, and flags from string slice
func ParseArgs(args []string) (command string, text string, flags []string) {
	if len(args) == 0 {
		return "", "", []string{}
	}
	
	command = args[0]
	var textParts []string
	
	for i := 1; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "-") {
			flags = append(flags, arg)
		} else {
			textParts = append(textParts, arg)
		}
	}
	
	text = strings.Join(textParts, " ")
	return command, text, flags
}

// GetFlag checks if a flag exists in args
func GetFlag(args []string, flag string) bool {
	if !strings.HasPrefix(flag, "-") {
		flag = "-" + flag
	}
	
	for _, arg := range args {
		if arg == flag {
			return true
		}
	}
	return false
}

// GetFlagValue gets the value after a specified flag
func GetFlagValue(args []string, flag string) string {
	if !strings.HasPrefix(flag, "-") {
		flag = "-" + flag
	}
	
	for i, arg := range args {
		if arg == flag && i+1 < len(args) {
			nextArg := args[i+1]
			// Don't return another flag as a value
			if !strings.HasPrefix(nextArg, "-") {
				return nextArg
			}
		}
	}
	return ""
}

// ParseIDs extracts numeric IDs from arguments
func ParseIDs(args []string) []int {
	var ids []int
	
	for _, arg := range args {
		if id, err := strconv.Atoi(arg); err == nil && id > 0 {
			ids = append(ids, id)
		}
	}
	
	return ids
}

// FormatTable creates an aligned ASCII table with borders
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
			if i < len(colWidths) {
				// Remove ANSI color codes for width calculation
				cleanCell := removeANSICodes(cell)
				if len(cleanCell) > colWidths[i] {
					colWidths[i] = len(cleanCell)
				}
			}
		}
	}
	
	var builder strings.Builder
	
	// Build header row
	for i, header := range headers {
		if i > 0 {
			builder.WriteString(" | ")
		}
		builder.WriteString(padRight(header, colWidths[i]))
	}
	builder.WriteString("\n")
	
	// Build separator row
	for i := range headers {
		if i > 0 {
			builder.WriteString("-+-")
		}
		builder.WriteString(strings.Repeat("-", colWidths[i]))
	}
	builder.WriteString("\n")
	
	// Build data rows
	for _, row := range rows {
		for i := 0; i < len(headers); i++ {
			if i > 0 {
				builder.WriteString(" | ")
			}
			
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			
			// Pad considering ANSI codes
			cleanCell := removeANSICodes(cell)
			padding := colWidths[i] - len(cleanCell)
			builder.WriteString(cell)
			if padding > 0 {
				builder.WriteString(strings.Repeat(" ", padding))
			}
		}
		builder.WriteString("\n")
	}
	
	return builder.String()
}

// FormatTodo formats a single todo item for display
func FormatTodo(todo Todo) string {
	status := "[ ]"
	if todo.Completed {
		status = "[✓]"
	}
	
	// Apply colors based on status and priority
	statusColored := status
	priorityColored := todo.Priority
	textColored := todo.Text
	
	if colorsEnabled {
		if todo.Completed {
			statusColored = Colorize(status, ColorGreen)
			textColored = Colorize(todo.Text, ColorGreen)
		} else if todo.Priority == "high" {
			priorityColored = Colorize(todo.Priority, ColorRed)
		} else if todo.Priority == "medium" {
			priorityColored = Colorize(todo.Priority, ColorYellow)
		}
	}
	
	return fmt.Sprintf("%d | %s | %s | %s",
		todo.ID,
		statusColored,
		priorityColored,
		textColored,
	)
}

// Truncate shortens text with ellipsis if needed
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
	
	return text[:maxLen-3] + "..."
}

// FormatDate converts time to relative format
func FormatDate(date time.Time) string {
	now := time.Now()
	duration := now.Sub(date)
	
	if duration < 0 {
		// Future date, return absolute format
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

// Helper functions

// padRight pads a string to the right with spaces
func padRight(text string, width int) string {
	if len(text) >= width {
		return text
	}
	return text + strings.Repeat(" ", width-len(text))
}

// removeANSICodes removes ANSI escape sequences from text for length calculation
func removeANSICodes(text string) string {
	// Simple ANSI code removal - matches \033[...m patterns
	result := strings.Builder{}
	inEscape := false
	
	for i := 0; i < len(text); i++ {
		if i < len(text)-1 && text[i] == '\033' && text[i+1] == '[' {
			inEscape = true
			continue
		}
		
		if inEscape {
			if text[i] == 'm' {
				inEscape = false
			}
			continue
		}
		
		result.WriteByte(text[i])
	}
	
	return result.String()
}

// SetColorsEnabled allows manual control over color output
func SetColorsEnabled(enabled bool) {
	colorsEnabled = enabled
}

// IsColorsEnabled returns whether colors are currently enabled
func IsColorsEnabled() bool {
	return colorsEnabled
}