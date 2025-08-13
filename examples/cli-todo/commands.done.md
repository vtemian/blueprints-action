# commands.done

Mark todo as complete command.

Dependencies: @storage.todos, datetime

Requirements:
- Accept one or multiple todo IDs
- Set done to true
- Set completed timestamp
- Save changes

Usage:
```
todo done 1
todo done 1 2 3
```

Implementation:
- Parse ID(s) from arguments
- Validate IDs exist
- Mark each as done
- Show confirmation for each

Output:
- Success: "Completed: #1 - Finish report"
- Error: "Todo #99 not found"

Edge cases:
- Already completed: Show "Already completed: #1"
- Invalid ID format: Show error
- No ID provided: Show usage