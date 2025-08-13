# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action for blueprints.md - an AI-powered code generation tool that transforms markdown blueprints into production-ready code. The action should:
- Process changed .md blueprint files in GitHub workflows
- Generate code using the blueprints.md approach
- Work similarly to a static site generator but for code generation
- Integrate with CI/CD pipelines

## Key Implementation Requirements

### GitHub Action Structure
- Create `action.yml` as the main action definition
- Implement the action using Node.js (recommended) or Docker container
- Process only changed .md files to optimize performance
- Support configuration via action inputs

### Core Functionality
1. **Change Detection**: Identify modified blueprint .md files in commits/PRs
2. **Blueprint Processing**: Parse and validate blueprint markdown files
3. **Code Generation**: Generate code from blueprints using AI (Claude API)
4. **Output Management**: Write generated code to appropriate directories
5. **Error Handling**: Provide clear feedback on generation failures

### Expected Action Inputs
- `api-key`: Claude API key for generation
- `blueprint-dir`: Directory containing blueprint .md files (default: `blueprints/`)
- `output-dir`: Where to generate code (default: `src/`)
- `auto-commit`: Whether to commit generated code (default: false)
- `parallel`: Enable concurrent processing (default: true)

## Development Commands

```bash
# Initialize Node.js project
npm init -y

# Install dependencies
npm install @actions/core @actions/github @anthropic-ai/sdk

# Run tests
npm test

# Build action
npm run build

# Local testing
npm run local-test
```

## Architecture Decisions

- Use Node.js for the action implementation (faster cold starts than Docker)
- Leverage GitHub Actions toolkit (@actions/core, @actions/github)
- Process blueprints incrementally based on git diff
- Support both push and pull_request events
- Cache dependencies between runs for performance

## Testing Strategy

- Unit tests for blueprint parsing and validation
- Integration tests with mock GitHub events
- End-to-end tests with sample blueprints
- Test matrix across different Node.js versions

## Key Files to Create

1. `action.yml` - GitHub Action metadata and configuration
2. `index.js` or `src/index.ts` - Main action entry point
3. `lib/blueprint-processor.js` - Blueprint parsing and validation
4. `lib/code-generator.js` - AI-powered code generation logic
5. `lib/git-utils.js` - Git operations and change detection
6. `.github/workflows/test.yml` - CI workflow for testing the action