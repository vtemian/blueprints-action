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

# Function to get changed markdown files in src directory
get_changed_files() {
    local src_dir="$1"
    
    if [ "$GITHUB_EVENT_NAME" == "pull_request" ]; then
        # For PRs, get files changed between base and head
        git diff --name-only --diff-filter=AMR "$GITHUB_BASE_REF...$GITHUB_HEAD_REF" | grep "^${src_dir}/.*\.md$" || true
    elif [ "$GITHUB_EVENT_NAME" == "push" ]; then
        # For pushes, get files changed in the commit
        if [ -n "$GITHUB_BEFORE" ] && [ "$GITHUB_BEFORE" != "0000000000000000000000000000000000000000" ]; then
            git diff --name-only --diff-filter=AMR "$GITHUB_BEFORE..$GITHUB_SHA" | grep "^${src_dir}/.*\.md$" || true
        else
            # First commit or force push - process all markdown files in src
            find "$src_dir" -type f -name "*.md" 2>/dev/null || true
        fi
    else
        # For other events, process all markdown files in src
        find "$src_dir" -type f -name "*.md" 2>/dev/null || true
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
    SRC_DIR="${SRC_DIR:-.}"
    OUTPUT_DIR="${OUTPUT_DIR:-.}"
    LANGUAGE="${LANGUAGE:-python}"
    QUALITY_IMPROVEMENT="${QUALITY_IMPROVEMENT:-true}"
    QUALITY_ITERATIONS="${QUALITY_ITERATIONS:-2}"
    PROCESS_ONLY_CHANGED="${PROCESS_ONLY_CHANGED:-false}"
    AUTO_COMMIT="${AUTO_COMMIT:-false}"
    COMMIT_BRANCH="${COMMIT_BRANCH:-}"
    BASE_BRANCH="${BASE_BRANCH:-}"
    COMMIT_MESSAGE="${COMMIT_MESSAGE:-chore: generate code from blueprints}"
    FAIL_ON_ERROR="${FAIL_ON_ERROR:-true}"
    
    # Normalize source directory path (remove trailing slash)
    SRC_DIR="${SRC_DIR%/}"
    
    # Initialize counters
    GENERATED_FILES=""
    FAILED_FILES=""
    SUCCESS_COUNT=0
    FAIL_COUNT=0
    
    # Decide whether to process individual changed files or the full project
    if [ "$PROCESS_ONLY_CHANGED" == "true" ] && [ -n "$GITHUB_EVENT_NAME" ]; then
        # Process only changed files in PR/push context
        log "Processing only changed files in $SRC_DIR..."
        FILES=$(get_changed_files "$SRC_DIR")
        
        if [ -z "$FILES" ]; then
            warning "No changed blueprint files found to process"
            echo "generated-files=" >> $GITHUB_OUTPUT
            echo "status=no-files" >> $GITHUB_OUTPUT
            exit 0
        fi
        
        # Count files
        FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
        log "Found $FILE_COUNT changed blueprint file(s) to process"
        
        # Process each changed file individually
        for file in $FILES; do
            if [ -z "$file" ]; then
                continue
            fi
            
            log "Processing: $file"
            
            # Determine output path based on the blueprint file name
            BASE_NAME=$(basename "$file" .md)
            
            # Determine file extension based on language
            case "$LANGUAGE" in
                python) EXT=".py" ;;
                javascript) EXT=".js" ;;
                typescript) EXT=".ts" ;;
                java) EXT=".java" ;;
                go) EXT=".go" ;;
                rust) EXT=".rs" ;;
                cpp|c++) EXT=".cpp" ;;
                c) EXT=".c" ;;
                *) EXT="" ;;  # Let blueprints-md decide
            esac
            
            OUTPUT_PATH="$OUTPUT_DIR/${BASE_NAME}${EXT}"
            
            # Build command with optional parameters
            CMD="uvx blueprints-md generate \"$file\" --output \"$OUTPUT_PATH\" --language \"$LANGUAGE\" --api-key \"$ANTHROPIC_API_KEY\" --force --verbose"
            
            # Add quality improvement options
            if [ "$QUALITY_IMPROVEMENT" == "true" ]; then
                CMD="$CMD --quality-improvement --quality-iterations $QUALITY_ITERATIONS"
            else
                CMD="$CMD --no-quality-improvement"
            fi
            
            # Run blueprints-md using uvx
            if eval "$CMD" 2>&1 | tee /tmp/blueprint-output.log; then
                SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
                log "✓ Successfully generated code from: $file"
                
                # Extract generated files from output
                GENERATED=$(grep -E "Generated:|Created:|Written:|Output:" /tmp/blueprint-output.log | sed 's/.*: //' || true)
                if [ -n "$GENERATED" ]; then
                    GENERATED_FILES="$GENERATED_FILES$GENERATED\n"
                else
                    GENERATED_FILES="$GENERATED_FILES$OUTPUT_PATH\n"
                fi
            else
                FAIL_COUNT=$((FAIL_COUNT + 1))
                error "✗ Failed to generate code from: $file"
                FAILED_FILES="$FAILED_FILES$file "
                
                # Check for specific error types
                if grep -q "credit balance is too low" /tmp/blueprint-output.log; then
                    error "API credit balance is too low. Please add credits to your Anthropic account."
                elif grep -q "401" /tmp/blueprint-output.log; then
                    error "API authentication failed. Please check your ANTHROPIC_API_KEY."
                fi
                
                if [ "$FAIL_ON_ERROR" == "true" ]; then
                    error "Stopping due to generation failure (fail-on-error=true)"
                    exit 1
                fi
            fi
        done
    else
        # Full project generation mode
        log "Generating full project from $SRC_DIR..."
        
        # Build command for project generation
        # Note: generate-project doesn't have --output-dir, it generates in current directory
        # So we need to change to output dir and use absolute path for source
        mkdir -p "$OUTPUT_DIR"
        ORIGINAL_DIR=$(pwd)
        cd "$OUTPUT_DIR"
        
        # Use absolute path for source directory
        if [[ "$SRC_DIR" = /* ]]; then
            # Already absolute
            SRC_PATH="$SRC_DIR"
        else
            # Make it absolute
            SRC_PATH="$ORIGINAL_DIR/$SRC_DIR"
        fi
        
        CMD="uvx blueprints-md generate-project \"$SRC_PATH\" --language \"$LANGUAGE\" --api-key \"$ANTHROPIC_API_KEY\" --verbose"
        
        # Add quality improvement options
        if [ "$QUALITY_IMPROVEMENT" == "true" ]; then
            CMD="$CMD --quality-improvement --quality-iterations $QUALITY_ITERATIONS"
        else
            CMD="$CMD --no-quality-improvement"
        fi
        
        # Run blueprints-md generate-project
        if eval "$CMD" 2>&1 | tee /tmp/blueprint-output.log; then
            SUCCESS_COUNT=1
            log "✓ Successfully generated project from: $SRC_DIR"
            
            # Extract generated files from output
            GENERATED=$(grep -E "Generated:|Created:|Written:|Output:" /tmp/blueprint-output.log | sed 's/.*: //' || true)
            if [ -n "$GENERATED" ]; then
                GENERATED_FILES="$GENERATED"
            else
                GENERATED_FILES="$OUTPUT_DIR"
            fi
        else
            FAIL_COUNT=1
            error "✗ Failed to generate project from: $SRC_DIR"
            
            # Check for specific error types
            if grep -q "credit balance is too low" /tmp/blueprint-output.log; then
                error "API credit balance is too low. Please add credits to your Anthropic account."
            elif grep -q "401" /tmp/blueprint-output.log; then
                error "API authentication failed. Please check your ANTHROPIC_API_KEY."
            fi
            
            if [ "$FAIL_ON_ERROR" == "true" ]; then
                cd "$ORIGINAL_DIR"
                error "Stopping due to generation failure (fail-on-error=true)"
                exit 1
            fi
        fi
        
        # Return to original directory
        cd "$ORIGINAL_DIR"
    fi
    
    # Summary
    log "Generation complete: $SUCCESS_COUNT succeeded, $FAIL_COUNT failed"
    
    # Auto-commit if enabled
    if [ "$AUTO_COMMIT" == "true" ] && [ $SUCCESS_COUNT -gt 0 ]; then
        log "Auto-committing generated files..."
        
        # Configure git
        git config --local user.email "github-actions[bot]@users.noreply.github.com"
        git config --local user.name "github-actions[bot]"
        
        # Handle commit branch workflow
        if [ -n "$COMMIT_BRANCH" ]; then
            # Debug: Show current state
            log "DEBUG: Current working directory contents:"
            ls -la
            log "DEBUG: Git status before branch operations:"
            git status --short
            
            # Save generated files to temporary location
            TEMP_GEN_DIR=$(mktemp -d)
            log "Saving generated files to temporary location: $TEMP_GEN_DIR"
            
            # Copy all generated files to temp location (excluding .git and source blueprints)
            if [ "$SRC_DIR" = "." ]; then
                # If source is root, only copy non-md files
                find . -maxdepth 10 -type f ! -path "./.git/*" ! -name "*.md" -exec cp --parents {} "$TEMP_GEN_DIR/" \; 2>/dev/null || true
            else
                # Copy everything except .git and the source directory
                rsync -av --exclude='.git' --exclude="$SRC_DIR" . "$TEMP_GEN_DIR/" 2>/dev/null || \
                    (for item in $(ls -A | grep -v "^\.git$" | grep -v "^$SRC_DIR$"); do cp -r "$item" "$TEMP_GEN_DIR/" 2>/dev/null || true; done)
            fi
            
            log "DEBUG: Contents saved to temp dir:"
            ls -la "$TEMP_GEN_DIR"
            
            # Save current branch
            CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
            
            # Determine base branch
            if [ -z "$BASE_BRANCH" ]; then
                BASE_BRANCH="$CURRENT_BRANCH"
            fi
            
            log "Switching to commit branch: $COMMIT_BRANCH (base: $BASE_BRANCH)"
            
            # Clean way to handle untracked files: add them temporarily then stash
            log "Preparing workspace for branch switch..."
            git add -A 2>/dev/null || true
            git stash push -m "blueprints-action: temporary stash for branch switch" || true
            
            # Check if commit branch exists remotely
            if git ls-remote --exit-code --heads origin "$COMMIT_BRANCH" >/dev/null 2>&1; then
                # Branch exists, fetch and checkout
                git fetch origin "$COMMIT_BRANCH"
                git checkout -B "$COMMIT_BRANCH" "origin/$COMMIT_BRANCH"
                
                # Clean out ALL existing files except .git
                log "Cleaning ALL files from $COMMIT_BRANCH branch..."
                find . -maxdepth 1 ! -name '.git' ! -name '.' ! -name '..' -exec rm -rf {} + 2>/dev/null || true
            else
                # Branch doesn't exist, create empty orphan branch
                log "Creating new orphan branch $COMMIT_BRANCH for generated code only..."
                git checkout --orphan "$COMMIT_BRANCH"
                
                # Remove all files from index and working tree
                git rm -rf . 2>/dev/null || true
                
                # Clean any remaining untracked files
                find . -maxdepth 1 ! -name '.git' ! -name '.' ! -name '..' -exec rm -rf {} + 2>/dev/null || true
            fi
            
            # Copy generated files from temp location
            log "Copying generated files to commit branch..."
            cp -r "$TEMP_GEN_DIR"/* . 2>/dev/null || true
            cp -r "$TEMP_GEN_DIR"/.[^.]* . 2>/dev/null || true
            
            # Clean up temp directory
            rm -rf "$TEMP_GEN_DIR"
        fi
        
        # Add all generated files
        log "Adding generated files to git..."
        git add -A
        
        # Show what will be committed
        log "Files to be committed:"
        git status --short
        
        # Check if there are changes to commit
        if git diff --staged --quiet; then
            warning "No changes to commit"
        else
            git commit -m "$COMMIT_MESSAGE"
            log "Changes committed"
            
            # Push the branch
            if [ -n "$COMMIT_BRANCH" ]; then
                git push -u origin "$COMMIT_BRANCH"
                log "Changes pushed to branch: $COMMIT_BRANCH"
                
                # Switch back to original branch
                git checkout "$CURRENT_BRANCH"
                log "Switched back to branch: $CURRENT_BRANCH"
                
                # Restore the stashed changes if any
                git stash pop 2>/dev/null || true
            elif [ "$GITHUB_EVENT_NAME" != "pull_request" ]; then
                git push
                log "Changes pushed"
            fi
        fi
    fi
    
    # Set outputs
    echo "generated-files=$GENERATED_FILES" >> $GITHUB_OUTPUT
    
    if [ "${FAIL_COUNT:-0}" -gt 0 ]; then
        echo "status=partial-success" >> $GITHUB_OUTPUT
        warning "Some files failed to generate: $FAILED_FILES"
    else
        echo "status=success" >> $GITHUB_OUTPUT
    fi
    
    log "Blueprint action completed"
}

# Run main function
main "$@"