# Blueprints Action

A GitHub Action that generates code from markdown blueprints using [blueprints.md](https://github.com/vtemian/blueprints.md). Think of it as a static site generator, but for code.

## Quick Start

```yaml
name: Generate Code
on:
  push:
    paths: ['*.md']

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
          src: '.'
          auto-commit: true
          commit-branch: 'generated'
```

## Features

- 🚀 **Automatic Code Generation** - Transform markdown blueprints into production-ready code
- 🌳 **Branch-based Workflow** - Generated code goes to separate branches (like `gh-pages`)
- 🔄 **Smart Processing** - Full project generation or incremental file updates
- 🤖 **AI-Powered** - Uses Claude API for intelligent code generation
- ⚡ **Fast Execution** - Minimal overhead with `uvx`

## Setup

### 1. Add Your API Key

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add a new secret: `ANTHROPIC_API_KEY`
3. Paste your Claude API key

### 2. Create Your Workflow

Create `.github/workflows/blueprints.yml`:

```yaml
name: Generate Code
on:
  push:
    branches: [main]
    paths: ['blueprints/**/*.md']

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          src: 'blueprints'
          output-dir: './src'
          auto-commit: true
          commit-branch: 'generated'
          commit-message: 'chore: generate code from blueprints'
```

## Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `api-key` | **Required** - Claude API key | - |
| `src` | Directory containing blueprint markdown files | `.` |
| `output-dir` | Where to place generated code | `./` |
| `language` | Target language (python, javascript, typescript, go, rust, etc.) | `python` |
| `process-only-changed` | Process only changed files in PRs/pushes | `false` |
| `auto-commit` | Automatically commit generated code | `false` |
| `commit-branch` | Branch for generated code (e.g., `generated`) | - |
| `base-branch` | Base branch for commit branch | current branch |
| `commit-message` | Commit message | `chore: generate code from blueprints` |
| `quality-improvement` | Enable iterative quality improvement | `true` |
| `quality-iterations` | Number of improvement iterations | `2` |
| `fail-on-error` | Fail action if generation fails | `true` |

## Examples

### Separate Branch Strategy (Recommended)

Keep blueprints in `main`, generated code in `generated`:

```yaml
name: Generate to Branch
on:
  push:
    branches: [main]
    paths: ['specs/**/*.md']

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          src: 'specs'
          output-dir: './src'
          auto-commit: true
          commit-branch: 'generated'
          base-branch: 'main'
          
      - name: Output PR URL
        run: |
          echo "Create PR: https://github.com/${{ github.repository }}/compare/main...generated"
```

### Process Only Changed Files

For faster PR workflows:

```yaml
name: Generate Changed Files
on:
  pull_request:
    paths: ['blueprints/**/*.md']

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
          src: 'blueprints'
          process-only-changed: true
```

### Multi-Language Generation

Generate the same blueprint in multiple languages:

```yaml
name: Multi-Language
on: workflow_dispatch

jobs:
  generate:
    strategy:
      matrix:
        language: [python, javascript, go]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          src: 'blueprint'
          language: ${{ matrix.language }}
          auto-commit: true
          commit-branch: 'generated-${{ matrix.language }}'
```

## Writing Blueprints

### Simple Blueprint

Create a markdown file (e.g., `api.md`):

```markdown
# User API

Create a REST API for user management with:
- GET /users - List all users with pagination
- GET /users/:id - Get user by ID
- POST /users - Create new user
- PUT /users/:id - Update user
- DELETE /users/:id - Delete user

Include validation, error handling, and tests.
```

### Modular Blueprints

Use the Blueprint Specification format with `@` references:

```markdown
# api.users

User management API endpoints.

Dependencies: express, @models.user, @services.auth

Requirements:
- CRUD operations for users
- Authentication required for all endpoints
- Input validation with Joi
- Proper error responses
```

Reference other blueprints:
- `@models.user` - Reference in same directory
- `@../shared/utils` - Relative path reference
- `@services.auth` - Service reference

### Project Structure Example

```
blueprints/
├── main.md           # Entry point
├── api/
│   ├── users.md     # User endpoints
│   └── tasks.md     # Task endpoints
├── models/
│   ├── user.md      # User model
│   └── task.md      # Task model
└── services/
    └── auth.md      # Auth service
```

## How It Works

The action automatically selects the appropriate generation mode:

### Full Project Mode (Default)
- When `process-only-changed: false`
- Processes all blueprints together
- Understands relationships between files
- Best for: Initial setup, production builds

### Incremental Mode
- When `process-only-changed: true`
- Only processes changed files
- Faster for iterative development
- Best for: PRs, quick updates

## Included Examples

### Task Management API (`examples/task-api/`)
A modular Python FastAPI project:
- Authentication with JWT
- Database models
- RESTful endpoints
- Follows blueprints.md structure

### CLI Todo App (`examples/cli-todo/`)
A simple command-line application:
- No external dependencies
- Works in multiple languages
- Complete CRUD operations
- File-based storage

Try them:
```yaml
- uses: vtemian/blueprints-action@v1
  with:
    api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    src: 'examples/cli-todo'
    language: 'python'
```

## Outputs

| Output | Description |
|--------|-------------|
| `generated-files` | List of generated files |
| `status` | Generation status (`success`, `partial-success`, `no-files`) |

## Tips

### Branch Management
- Use descriptive branch names: `generated`, `generated-dev`, `generated-v1`
- Similar to GitHub Pages with `gh-pages` branch
- Easy to review, rollback, or reset

### Performance
- Use `process-only-changed: true` for faster PR builds
- Set `quality-iterations: 1` for draft code
- Blueprints process sequentially to avoid rate limits

### Debugging
- Check action logs for generation details
- Set `fail-on-error: false` to continue on errors
- Review the generated branch for output

## Troubleshooting

**No files generated?**
- Check your API key is set correctly
- Ensure blueprint files are valid markdown
- Review action logs for errors

**API errors?**
- "Credit balance too low" - Add credits to your Anthropic account
- "401 Unauthorized" - Check your `ANTHROPIC_API_KEY`

**Branch not created?**
- Ensure workflow has `contents: write` permission
- Check if branch already exists with old content

## License

MIT

## Contributing

Contributions welcome! Please submit a Pull Request.

## Support

For issues: [Open an issue](https://github.com/vtemian/blueprints-action/issues)