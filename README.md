# Blueprints Action

A GitHub Action that automatically generates code from Blueprint markdown files using [blueprints.md](https://github.com/vtemian/blueprints.md). Works like a static site generator, but for code generation.

## Features

- 🚀 **Automatic Code Generation**: Generate production-ready code from markdown blueprints
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
      - 'blueprints/**/*.md'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Advanced Configuration

```yaml
name: Generate and Commit Code

on:
  push:
    branches: [ main ]
    paths:
      - 'blueprints/**/*.md'
  pull_request:
    paths:
      - 'blueprints/**/*.md'

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
          blueprint-files: 'docs/blueprints/**/*.md'
          output-dir: './src/generated'
          process-only-changed: true
          auto-commit: true
          commit-message: 'chore: regenerate code from blueprints'
          fail-on-error: false
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api-key` | Claude API key for code generation | ✅ | - |
| `blueprint-files` | Pattern for blueprint files to process | ❌ | `blueprints/**/*.md` |
| `output-dir` | Directory where generated code will be placed | ❌ | `./` |
| `process-only-changed` | Only process changed files in PR/push | ❌ | `true` |
| `auto-commit` | Automatically commit generated code | ❌ | `false` |
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

### 2. Create Blueprint Directory

Create a `blueprints/` directory in your repository:

```bash
mkdir blueprints
```

### 3. Write Your First Blueprint

Create a blueprint file `blueprints/api.md`:

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

### 4. Add Workflow

Create `.github/workflows/blueprints.yml`:

```yaml
name: Generate Code

on:
  push:
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
```

## Examples

### Generate on Pull Request

```yaml
on:
  pull_request:
    paths:
      - 'blueprints/**/*.md'

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
          process-only-changed: true
```

### Generate and Create PR

```yaml
jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: vtemian/blueprints-action@v1
        id: generate
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          auto-commit: false
          
      - uses: peter-evans/create-pull-request@v5
        with:
          title: 'Generated code from blueprints'
          body: 'Auto-generated code from blueprint files'
          branch: generated-code
```

### Manual Trigger

```yaml
on:
  workflow_dispatch:
    inputs:
      blueprint-pattern:
        description: 'Blueprint file pattern'
        required: false
        default: 'blueprints/**/*.md'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: vtemian/blueprints-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          blueprint-files: ${{ github.event.inputs.blueprint-pattern }}
```

## Blueprint File Format

Blueprint files are markdown files that describe what code should be generated. They can include:

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

### Organizing Blueprints

```
blueprints/
├── api/
│   ├── users.md
│   ├── products.md
│   └── orders.md
├── frontend/
│   ├── components.md
│   └── pages.md
└── database/
    └── schema.md
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