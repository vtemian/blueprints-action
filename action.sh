#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo -e "${GREEN}[Blueprints Action]${NC} $1"
}

error() {
    echo -e "${RED}[Blueprints Action ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[Blueprints Action WARNING]${NC} $1"
}

# Function to get changed files
get_changed_files() {
    local pattern="$1"
    
    if [ "$GITHUB_EVENT_NAME" == "pull_request" ]; then
        # For PRs, get files changed between base and head
        git diff --name-only --diff-filter=AMR "$GITHUB_BASE_REF...$GITHUB_HEAD_REF" | grep -E "$pattern" || true
    elif [ "$GITHUB_EVENT_NAME" == "push" ]; then
        # For pushes, get files changed in the commit
        if [ -n "$GITHUB_BEFORE" ] && [ "$GITHUB_BEFORE" != "0000000000000000000000000000000000000000" ]; then
            git diff --name-only --diff-filter=AMR "$GITHUB_BEFORE..$GITHUB_SHA" | grep -E "$pattern" || true
        else
            # First commit or force push - process all matching files
            find . -type f -name "*.md" | grep -E "$pattern" || true
        fi
    else
        # For other events, process all matching files
        find . -type f -name "*.md" | grep -E "$pattern" || true
    fi
}

# Main execution
main() {
    log "Starting Blueprint code generation..."
    
    # Validate required environment variables
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        error "ANTHROPIC_API_KEY is not set"
        exit 1
    fi
    
    # Set defaults
    BLUEPRINT_FILES="${BLUEPRINT_FILES:-blueprints/**/*.md}"
    OUTPUT_DIR="${OUTPUT_DIR:-.}"
    PROCESS_ONLY_CHANGED="${PROCESS_ONLY_CHANGED:-true}"
    AUTO_COMMIT="${AUTO_COMMIT:-false}"
    COMMIT_MESSAGE="${COMMIT_MESSAGE:-chore: generate code from blueprints}"
    FAIL_ON_ERROR="${FAIL_ON_ERROR:-true}"
    
    # Convert glob pattern to regex for grep
    PATTERN=$(echo "$BLUEPRINT_FILES" | sed 's/\*\*/\.\*/g' | sed 's/\*/[^\/]*/g')
    
    # Get files to process
    if [ "$PROCESS_ONLY_CHANGED" == "true" ] && [ -n "$GITHUB_EVENT_NAME" ]; then
        log "Processing only changed files..."
        FILES=$(get_changed_files "$PATTERN")
    else
        log "Processing all blueprint files..."
        FILES=$(find . -type f -path "./$BLUEPRINT_FILES" 2>/dev/null || true)
    fi
    
    if [ -z "$FILES" ]; then
        warning "No blueprint files found to process"
        echo "generated-files=" >> $GITHUB_OUTPUT
        echo "status=no-files" >> $GITHUB_OUTPUT
        exit 0
    fi
    
    # Count files
    FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
    log "Found $FILE_COUNT blueprint file(s) to process"
    
    # Process each file
    GENERATED_FILES=""
    FAILED_FILES=""
    SUCCESS_COUNT=0
    FAIL_COUNT=0
    
    for file in $FILES; do
        if [ -z "$file" ]; then
            continue
        fi
        
        log "Processing: $file"
        
        # Run blueprints-md using uvx
        if uvx blueprints-md generate "$file" --output-dir "$OUTPUT_DIR" 2>&1 | tee /tmp/blueprint-output.log; then
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
            log "✓ Successfully generated code from: $file"
            
            # Extract generated files from output if possible
            # This assumes blueprints-md outputs the generated file paths
            GENERATED=$(grep -E "Generated:|Created:|Written:" /tmp/blueprint-output.log | sed 's/.*: //' || true)
            if [ -n "$GENERATED" ]; then
                GENERATED_FILES="$GENERATED_FILES$GENERATED\n"
            fi
        else
            FAIL_COUNT=$((FAIL_COUNT + 1))
            error "✗ Failed to generate code from: $file"
            FAILED_FILES="$FAILED_FILES$file "
            
            if [ "$FAIL_ON_ERROR" == "true" ]; then
                error "Stopping due to generation failure (fail-on-error=true)"
                exit 1
            fi
        fi
    done
    
    # Summary
    log "Generation complete: $SUCCESS_COUNT succeeded, $FAIL_COUNT failed"
    
    # Auto-commit if enabled
    if [ "$AUTO_COMMIT" == "true" ] && [ $SUCCESS_COUNT -gt 0 ]; then
        log "Auto-committing generated files..."
        
        # Configure git
        git config --local user.email "github-actions[bot]@users.noreply.github.com"
        git config --local user.name "github-actions[bot]"
        
        # Add all generated files
        git add -A
        
        # Check if there are changes to commit
        if git diff --staged --quiet; then
            warning "No changes to commit"
        else
            git commit -m "$COMMIT_MESSAGE"
            log "Changes committed"
            
            # Push if we're not in a PR
            if [ "$GITHUB_EVENT_NAME" != "pull_request" ]; then
                git push
                log "Changes pushed"
            fi
        fi
    fi
    
    # Set outputs
    echo "generated-files=$GENERATED_FILES" >> $GITHUB_OUTPUT
    
    if [ $FAIL_COUNT -gt 0 ]; then
        echo "status=partial-success" >> $GITHUB_OUTPUT
        warning "Some files failed to generate: $FAILED_FILES"
    else
        echo "status=success" >> $GITHUB_OUTPUT
    fi
    
    log "Blueprint action completed"
}

# Run main function
main "$@"