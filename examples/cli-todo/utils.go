// Package utils provides utility functions for parsing command-line arguments
// and formatting display output with proper error handling and input validation.
package utils

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// ParseArgs parses command-line arguments into command, remaining text, and flag map.
// It handles edge cases like empty args, malformed flags, and quoted strings.
// Returns the first non-flag argument as command, concatenated remaining non-flag
// arguments as text, and all flags in a map.
func ParseArgs(args []string) (command string, text string, flags map[string]string) {
	flags = make(map[string]string)
	
	if len(args) == 0 {
		return "", "", flags
	}
	
	var nonFlagArgs []string
	
	for i := 0; i < len(args); i++ {
		arg := args[i]
		
		// Handle flags starting with - or --
		if strings.HasPrefix(arg, "-") {
			flagName := strings.TrimLeft(arg, "-")
			if flagName == "" {
				// Just a dash, treat as regular argument
				nonFlagArgs = append(nonFlagArgs, arg)
				continue
			}
			
			// Check if flag has value (flag=value format)
			if equalIndex := strings.Index(flagName, "="); equalIndex != -1 {
				key := flagName[:equalIndex]
				value := flagName[equalIndex+1:]
				if key != "" {
					flags[key] = value
				}
			} else {
				// Check if next argument is the value
				if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
					flags[flagName] = args[i+1]
					i++ // Skip next argument as it's the flag value
				} else {
					// Boolean flag
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

// GetFlag checks if a flag exists in arguments, supporting both -flag and --flag formats.
// Returns true if the flag is present, false otherwise.
func GetFlag(args []string, flag string) bool {
	if len(args) == 0 || flag == "" {
		return false
	}
	
	// Normalize flag name by removing leading dashes
	flag = strings.TrimLeft(flag, "-")
	
	for _, arg := range args {
		if strings.HasPrefix(arg, "-") {
			argFlag := strings.TrimLeft(arg, "-")
			
			// Handle flag=value format
			if equalIndex := strings.Index(argFlag, "="); equalIndex != -1 {
				argFlag = argFlag[:equalIndex]
			}
			
			if argFlag == flag {
				return true
			}
		}
	}
	
	return false
}

// GetFlagValue returns the value associated with a flag, or empty string if not found.
// Supports both -flag value and -flag=value formats.
func GetFlagValue(args []string, flag string) string {
	if len(args) == 0 || flag == "" {
		return ""
	}
	
	// Normalize flag name by removing leading dashes
	flag = strings.TrimLeft(flag, "-")
	
	for i, arg := range args {
		if strings.HasPrefix(arg, "-") {
			argFlag := strings.TrimLeft(arg, "-")
			
			// Handle flag=value format
			if equalIndex := strings.Index(argFlag, "="); equalIndex != -1 {
				if argFlag[:equalIndex] == flag {
					return argFlag[equalIndex+1:]
				}
			} else if argFlag == flag {
				// Check if next argument is the value
				if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
					return args[i+1]
				}
			}
		}
	}
	
	return ""
}

// ParseIDs extracts all numeric IDs from arguments, skipping invalid numbers gracefully.
// Returns a slice of integers found in the arguments.
func ParseIDs(args []string) []int {
	var ids []int
	
	for _, arg := range args {
		if id, err := strconv.Atoi(arg); err == nil {
			ids = append(ids, id)
		}
	}
	
	return ids
}

// FormatTable creates a properly aligned ASCII table with padding and separators.
// Handles empty data gracefully by returning appropriate messages.
func FormatTable(headers []string, rows [][]string) string {
	if len(headers) == 0 {
		return ""
	}
	
	if len(rows) == 0 {
		return strings.Join(headers, " | ") + "\n" + strings.Repeat("-", len(strings.Join(headers, " | ")))
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
			if i < len(colWidths) {
				if cellLen := len(cell); cellLen > colWidths[i] {
					colWidths[i] = cellLen
				}
			}
		}
	}
	
	var builder strings.Builder
	
	// Format header
	for i, header := range headers {
		if i > 0 {
			builder.WriteString(" | ")
		}
		builder.WriteString(fmt.Sprintf("%-*s", colWidths[i], header))
	}
	builder.WriteString("\n")
	
	// Add separator
	for i := range headers {
		if i > 0 {
			builder.WriteString("-+-")
		}
		builder.WriteString(strings.Repeat("-", colWidths[i]))
	}
	builder.WriteString("\n")
	
	// Format rows
	for _, row := range rows {
		for i := 0; i < len(headers); i++ {
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

// FormatTodo formats a todo item with ID, status checkbox, priority, and text.
// Expects a map with keys: "id", "completed", "priority", "text", "created".
func FormatTodo(todo map[string]interface{}) string {
	if todo == nil {
		return ""
	}
	
	var builder strings.Builder
	
	// Format ID
	if id, ok := todo["id"]; ok {
		builder.WriteString(fmt.Sprintf("[%v] ", id))
	}
	
	// Format status checkbox
	completed := false
	if c, ok := todo["completed"]; ok {
		if b, ok := c.(bool); ok {
			completed = b
		}
	}
	
	checkbox := "[ ]"
	if completed {
		checkbox = "[✓]"
	}
	
	// Apply color if supported
	if completed && isColorSupported() {
		checkbox = colorize(checkbox, "green")
	}
	
	builder.WriteString(checkbox)
	builder.WriteString(" ")
	
	// Format priority
	if priority, ok := todo["priority"]; ok {
		if p, ok := priority.(string); ok && p != "" && p != "normal" {
			priorityText := fmt.Sprintf("(%s) ", strings.ToUpper(p))
			if p == "high" && isColorSupported() {
				priorityText = colorize(priorityText, "red")
			}
			builder.WriteString(priorityText)
		}
	}
	
	// Format text
	if text, ok := todo["text"]; ok {
		if t, ok := text.(string); ok {
			if completed && isColorSupported() {
				builder.WriteString(colorize(t, "green"))
			} else {
				builder.WriteString(t)
			}
		}
	}
	
	// Format creation date if available
	if created, ok := todo["created"]; ok {
		if t, ok := created.(time.Time); ok {
			builder.WriteString(fmt.Sprintf(" (created %s)", FormatDate(t)))
		}
	}
	
	return builder.String()
}

// Truncate shortens text to maxLen characters, adding "..." if truncated.
// Handles edge cases like negative maxLen and ensures Unicode safety.
func Truncate(text string, maxLen int) string {
	if maxLen < 0 {
		return ""
	}
	
	if maxLen == 0 {
		return ""
	}
	
	// Convert to runes for proper Unicode handling
	runes := []rune(text)
	
	if len(runes) <= maxLen {
		return text
	}
	
	if maxLen <= 3 {
		return strings.Repeat(".", maxLen)
	}
	
	return string(runes[:maxLen-3]) + "..."
}

// FormatDate converts a time to relative format (e.g., "2 hours ago", "yesterday").
// Provides human-readable relative time descriptions.
func FormatDate(date time.Time) string {
	now := time.Now()
	duration := now.Sub(date)
	
	// Future dates
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
		} else if duration < 48*time.Hour {
			return "tomorrow"
		} else if duration < 7*24*time.Hour {
			days := int(duration.Hours() / 24)
			return fmt.Sprintf("in %d days", days)
		}
		
		return date.Format("Jan 2, 2006")
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
	} else if duration < 48*time.Hour {
		return "yesterday"
	} else if duration < 7*24*time.Hour {
		days := int(duration.Hours() / 24)
		return fmt.Sprintf("%d days ago", days)
	} else if duration < 30*24*time.Hour {
		weeks := int(duration.Hours() / (7 * 24))
		if weeks == 1 {
			return "1 week ago"
		}
		return fmt.Sprintf("%d weeks ago", weeks)
	} else if duration < 365*24*time.Hour {
		months := int(duration.Hours() / (30 * 24))
		if months == 1 {
			return "1 month ago"
		}
		return fmt.Sprintf("%d months ago", months)
	}
	
	return date.Format("Jan 2, 2006")
}

// colorize applies ANSI color codes to text with terminal detection.
// Automatically falls back to plain text on non-supporting terminals.
func colorize(text string, color string) string {
	if !isColorSupported() {
		return text
	}
	
	var colorCode string
	switch strings.ToLower(color) {
	case "red":
		colorCode = "\033[31m"
	case "green":
		colorCode = "\033[32m"
	case "yellow":
		colorCode = "\033[33m"
	case "blue":
		colorCode = "\033[34m"
	case "magenta":
		colorCode = "\033[35m"
	case "cyan":
		colorCode = "\033[36m"
	case "white":
		colorCode = "\033[37m"
	default:
		return text
	}
	
	return colorCode + text + "\033[0m"
}

// isColorSupported detects if the current terminal supports ANSI colors.
// Checks environment variables and runtime OS to determine color support.
func isColorSupported() bool {
	// Check if we're in a terminal
	if os.Getenv("TERM") == "dumb" {
		return false
	}
	
	// Check for explicit color support
	if os.Getenv("COLORTERM") != "" {
		return true
	}
	
	// Check common terminal types that support color
	term := os.Getenv("TERM")
	colorTerms := []string{
		"xterm", "xterm-color", "xterm-256color",
		"screen", "screen-256color",
		"tmux", "tmux-256color",
		"rxvt", "ansi",
	}
	
	for _, colorTerm := range colorTerms {
		if strings.Contains(term, colorTerm) {
			return true
		}
	}
	
	// Windows-specific checks
	if runtime.GOOS == "windows" {
		// Modern Windows terminals support ANSI colors
		if os.Getenv("WT_SESSION") != "" || // Windows Terminal
			os.Getenv("ConEmuPID") != "" || // ConEmu
			strings.Contains(os.Getenv("TERM_PROGRAM"), "vscode") { // VS Code
			return true
		}
		return false
	}
	
	// Default to true for Unix-like systems if TERM is set
	return term != ""
}