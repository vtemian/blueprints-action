# Blueprints Action

A GitHub Action that automatically generates code from Blueprint markdown files using [blueprints.md](https://github.com/vtemian/blueprints.md). Works like a static site generator, but for code generation.

## Features

- 🚀 **Automatic Code Generation**: Generate production-ready code from markdown blueprints
- 📦 **Project Generation**: Generate entire project structures with `generate-project` mode
- 🔄 **Smart Change Detection**: Only process changed blueprint files in PRs and pushes
- 🤖 **AI-Powered**: Uses Claude AI to understand requirements and generate code
- 📁 **Flexible Output**: Configure where generated code is placed
- 🔧 **Auto-Commit**: Optionally commit generated code automatically
- ⚡ **Fast**: Uses `uvx` for minimal overhead and quick execution

## Quick Start

### Basic Usage

```yaml
name: Generate Code

on:
  push:
    paths:
      - '*.md'  # or your source directory

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          src: '.'  # Process .md files in root directory
```

### Advanced Configuration

```yaml
name: Generate and Commit Code

on:
  push:
    branches: [ main ]
    paths:
      - 'specs/**/*.md'
  pull_request:
    paths:
      - 'specs/**/*.md'

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for change detection
          
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          src: 'specs'  # Look for .md files in specs directory
          output-dir: './src/generated'
          language: 'typescript'
          process-only-changed: true
          auto-commit: true
          commit-message: 'chore: regenerate code from blueprints'
          fail-on-error: false
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api-key` | Claude API key for code generation | ✅ | - |
| `mode` | Generation mode: `project` for full project, `file` for individual files | ❌ | `project` |
| `src` | Source directory containing blueprint markdown files | ❌ | `.` |
| `output-dir` | Directory where generated code will be placed | ❌ | `./` |
| `language` | Target programming language (python, javascript, typescript, etc.) | ❌ | `python` |
| `quality-improvement` | Enable iterative quality improvement | ❌ | `true` |
| `quality-iterations` | Maximum quality improvement iterations | ❌ | `2` |
| `process-only-changed` | Only process changed files in PR/push (file mode only) | ❌ | `true` |
| `auto-commit` | Automatically commit generated code | ❌ | `false` |
| `commit-branch` | Branch to commit generated code to (e.g., `generated`, `gh-pages`) | ❌ | - |
| `base-branch` | Base branch for the commit branch (defaults to current) | ❌ | - |
| `commit-message` | Commit message for generated code | ❌ | `chore: generate code from blueprints` |
| `fail-on-error` | Fail the action if code generation fails | ❌ | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `generated-files` | List of generated files |
| `status` | Generation status (`success`, `partial-success`, `no-files`) |

## Setup

### 1. Add API Key

Add your Anthropic API key to your repository secrets:

1. Go to your repository Settings → Secrets and variables → Actions
2. Add a new secret named `ANTHROPIC_API_KEY`
3. Paste your Claude API key

### 2. Create Your First Blueprint

Create a blueprint markdown file in your repository (e.g., `api.md`, `specs/user-service.md`, etc.):

```markdown
# User API

Create a REST API for user management with the following endpoints:
- GET /users - List all users
- GET /users/:id - Get user by ID
- POST /users - Create new user
- PUT /users/:id - Update user
- DELETE /users/:id - Delete user

Use Express.js and include validation and error handling.
```

### 3. Add Workflow

Create `.github/workflows/blueprints.yml`:

```yaml
name: Generate Code

on:
  push:
    paths:
      - '**/*.md'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          src: '.'  # or 'specs', 'blueprints', etc.
```

## Examples

### Project Generation Mode (Default)

Generate an entire project structure from all blueprints in a directory:

```yaml
name: Generate Project

on:
  push:
    branches: [ main ]
    paths:
      - 'blueprints/**/*.md'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: 'project'  # Generate entire project structure
          src: 'blueprints'
          output-dir: './generated'
```

### File-by-File Mode

Process blueprints individually (useful for incremental updates):

```yaml
name: Generate Files

on:
  pull_request:
    paths:
      - 'specs/**/*.md'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: 'file'  # Process files individually
          src: 'specs'
          output-dir: './src'
          process-only-changed: true  # Only process changed files
```

### Generate to Separate Branch (Recommended)

Keep your blueprints in `main` and generated code in a `generated` branch:

```yaml
name: Generate Code

on:
  push:
    branches: [ main ]
    paths:
      - '**/*.md'

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: 'project'
          src: 'specs'
          output-dir: './src'
          auto-commit: true
          commit-branch: 'generated'  # Commit to 'generated' branch
          base-branch: 'main'         # Based on 'main' branch
```

### Generate TypeScript Code

```yaml
- uses: vtemian/blueprints-action@v1
  with:
    api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    language: typescript
    output-dir: './src'
```

### Generate on Pull Request

```yaml
on:
  pull_request:
    paths:
      - 'docs/**/*.md'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          src: 'docs'
          process-only-changed: true
```

### Generate and Create PR from Branch

```yaml
name: Generate and PR

on:
  push:
    branches: [ main ]
    paths:
      - 'specs/**/*.md'

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          src: 'specs'
          auto-commit: true
          commit-branch: 'generated-${{ github.run_number }}'
          
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          base: main
          head: 'generated-${{ github.run_number }}'
          title: 'Generated code from blueprints'
          body: |
            Auto-generated code from blueprint markdown files.
            
            This PR was automatically created from blueprint changes.
```

### Manual Trigger

```yaml
on:
  workflow_dispatch:
    inputs:
      src-directory:
        description: 'Source directory for blueprints'
        required: false
        default: '.'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          src: ${{ github.event.inputs.src-directory }}
```

## Generation Modes

### Project Mode (`mode: 'project'`)
- **Default mode** - Generates a complete project structure
- Processes all blueprint files together for consistency
- Understands relationships between blueprints
- Creates proper project organization with imports/dependencies
- Best for: Initial project setup, complete regeneration

### File Mode (`mode: 'file'`)
- Processes each blueprint file independently
- Supports change detection (`process-only-changed`)
- Faster for incremental updates
- Each file gets its own output based on language extension
- Best for: Quick iterations, PR-based workflows, individual component updates

## Blueprint File Format

Blueprint files are markdown files that describe what code should be generated. In file mode, the generated file will have the same base name as the blueprint with the appropriate language extension (e.g., `api.md` → `api.py` for Python, `api.ts` for TypeScript).

Blueprints can include:

- High-level requirements
- API specifications
- Database schemas
- Business logic descriptions
- UI component specifications

Example blueprint:

```markdown
# Authentication Service

## Requirements
- JWT-based authentication
- User registration with email verification
- Password reset functionality
- Role-based access control

## Tech Stack
- Node.js with TypeScript
- Express.js
- PostgreSQL
- Redis for sessions

## API Endpoints
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- POST /auth/refresh
- POST /auth/forgot-password
- POST /auth/reset-password
```

## Tips

### Commit Branch Strategy

Using a separate branch for generated code keeps your main branch clean and focused on blueprints:

```yaml
auto-commit: true
commit-branch: 'generated'  # Generated code goes here
base-branch: 'main'         # Based on main branch
```

Benefits:
- **Clean separation**: Blueprints in `main`, generated code in `generated`
- **Easy review**: See all generated changes in one branch
- **Rollback friendly**: Can reset the generated branch without affecting blueprints
- **Similar to static sites**: Like GitHub Pages with source and gh-pages branches

Common patterns:
- `generated` - Single branch for all generated code
- `generated-${{ github.run_number }}` - Unique branch per run for PRs
- `deploy/production` - For production-ready generated code

### Organizing Blueprints

You can organize your blueprint files however makes sense for your project:

```
# Option 1: Root directory
api.md
user-service.md
database-schema.md

# Option 2: Specs directory
specs/
├── api.md
├── user-service.md
└── database-schema.md

# Option 3: By feature
features/
├── auth/
│   └── authentication.md
├── users/
│   └── user-management.md
└── products/
    └── product-catalog.md
```

### Change Detection

The action automatically detects changed files in:
- Pull requests: Files changed between base and head branches
- Pushes: Files changed in the commit
- Manual triggers: All matching files

### Performance

- Use `process-only-changed: true` to only regenerate changed blueprints
- The action uses `uvx` for fast Python package execution
- Blueprints are processed sequentially to avoid API rate limits

## Troubleshooting

### No files generated

Check that:
- Your blueprint files match the pattern
- The API key is correctly set
- Blueprint files contain valid markdown

### Generation fails

- Check the action logs for specific error messages
- Ensure your blueprints are clear and well-structured
- Set `fail-on-error: false` to continue on errors

### Changes not committed

Ensure:
- `auto-commit: true` is set
- The workflow has `contents: write` permission
- There are actual changes to commit

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please [open an issue](https://github.com/vtemian/blueprints-action/issues).