# Claudito

[![npm version](https://img.shields.io/npm/v/claudito.svg)](https://www.npmjs.com/package/claudito)
[![CI](https://github.com/comfortablynumb/claudito/actions/workflows/ci.yml/badge.svg)](https://github.com/comfortablynumb/claudito/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Warning**: This project is under active development. Features may change, and bugs are expected. Use at your own risk.

A web-based manager for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) agents. Run and monitor multiple Claude agents across different projects with a modern UI.

![Claudito Screenshot](doc/images/preview-01.png)

## What's New in 0.8.0

- **Shell Terminal**: Full PTY-based terminal integrated into the UI with proper terminal emulation via node-pty
- **Authentication**: Built-in login system

## Security Considerations

> **Important**: Claudito runs Claude Code agents that can execute code and modify files on your system. Take these precautions:

| Scenario | Recommended HOST | Notes |
|----------|------------------|-------|
| **Local development** | `127.0.0.1` or `localhost` | Only accessible from your machine (default) |
| **LAN access** | Your private IP (e.g., `192.168.1.x`) | Accessible from your local network |
| **All interfaces** | `0.0.0.0` | Accessible from anywhere - use with caution |

**Best Practices:**
1. **Use authentication**: Claudito requires login by default. Set custom credentials for production:
   ```bash
   CLAUDITO_USERNAME=myuser CLAUDITO_PASSWORD=mystrongpassword claudito
   ```
2. **Avoid exposing to the internet**: Use a reverse proxy with HTTPS if needed
3. **Configure firewall rules**: Only allow trusted IP addresses
4. **Review permission rules**: Configure Claude Code permissions to restrict agent capabilities

See [Security Recommendations](#security-recommendations) for more details.

## Quick Start

```bash
# Run directly with npx (no installation required)
npx claudito

# Or install globally
npm install -g claudito
claudito
```

Open your browser at **http://localhost:3000** to access the web UI.

## Table of Contents

- [Security Considerations](#security-considerations)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Features](#features)
- [Configuration](#configuration)
- [Data Storage](#data-storage)
- [API Reference](#api-reference)
- [Development](#development)
- [Security Recommendations](#security-recommendations)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Requirements

| Requirement | Version |
|-------------|---------|
| **Node.js** | 20.0.0 or higher |
| **Claude Code CLI** | Latest version |

### Installing and Authenticating Claude Code CLI

Before using Claudito, you must have the Claude Code CLI installed and **logged in**. Claudito works with either:
- **Claude Pro/Max subscription** (recommended for personal use)
- **Anthropic API key** (for API-based usage)

```bash
# Install Claude Code CLI (if not already installed)
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version

# Log in to Claude Code (required before using Claudito)
claude auth
```

> **Important:** Claudito requires an active Claude Code session. Make sure you can run `claude` directly in your terminal before starting Claudito.

For more details, see the [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code).

## Installation

### Option 1: Run with npx (Recommended)

No installation required. Run directly:

```bash
npx claudito
```

This downloads and runs the latest version automatically.

### Option 2: Global Installation

Install once, run anywhere:

```bash
npm install -g claudito
claudito
```

### Option 3: Local Installation

For development or integration into a project:

```bash
npm install claudito
npx claudito
```

## Usage

### Basic Usage

```bash
# Start with defaults (localhost:3000)
claudito

# Specify a custom port
claudito --port 8080
claudito -p 8080

# Listen on all network interfaces
claudito --host 0.0.0.0

# Combine options
claudito -p 8080 --host 0.0.0.0
```

### CLI Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--port <port>` | `-p` | Server port | `3000` |
| `--host <host>` | `-h` | Server host | `localhost` |
| `--version` | `-v` | Show version number | - |
| `--help` | - | Show help message | - |

### Environment Variables

All options can also be set via environment variables:

```bash
# Linux/macOS
PORT=8080 HOST=0.0.0.0 LOG_LEVEL=debug claudito

# Windows (PowerShell)
$env:PORT=8080; $env:HOST="0.0.0.0"; claudito

# Windows (CMD)
set PORT=8080 && set HOST=0.0.0.0 && claudito
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `localhost` | Server host |
| `NODE_ENV` | `development` | Environment mode |
| `LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
| `MAX_CONCURRENT_AGENTS` | `3` | Maximum concurrent agents |
| `DEV_MODE` | `true` (dev) / `false` (prod) | Enable development features |
| `CLAUDITO_USERNAME` | (generated) | Override login username |
| `CLAUDITO_PASSWORD` | (generated) | Override login password |
| `CLAUDITO_FORCE_SHELL_ENABLED` | `0` | Force-enable shell on all interfaces (security risk) |

## Features

### Agent Modes

#### Interactive Mode (Default)
Chat with Claude in real-time. The agent auto-starts when you send your first message.

- Real-time streaming of Claude's responses
- See tool usage as it happens (file reads, edits, bash commands)
- Code diffs with syntax highlighting and inline change highlighting
- Send follow-up messages naturally
- Toggle permission mode (Plan/Accept Edits) at runtime
- Plan mode with approve/reject/request changes options

#### Autonomous Mode
Runs through ROADMAP.md milestones automatically.

- Parse and display ROADMAP.md structure
- Generate roadmaps via Claude
- Execute tasks sequentially
- Track completion status
- Select specific milestones or tasks to run

### Project Management

- **Add Projects**: Point to any directory with a codebase
- **Multi-Project Support**: Manage multiple projects simultaneously
- **Concurrent Execution**: Run multiple agents at once (configurable limit)
- **Queue System**: Automatic queuing when at max capacity

### Authentication

Claudito includes built-in authentication to protect your agent manager:

- **Auto-generated credentials**: On each server start, a unique username and password are generated
- **QR Code login**: Scan the QR code displayed in the terminal for quick access
- **Session persistence**: Sessions last 7 days
- **Custom credentials**: Set `CLAUDITO_USERNAME` and `CLAUDITO_PASSWORD` environment variables for persistent credentials
- **Logout**: Click the logout button in the sidebar header

### User Interface

| Feature | Description |
|---------|-------------|
| **Tabbed Interface** | Switch between Agent Output, Project Files, Shell, and Git |
| **Shell Terminal** | Full PTY terminal with directory restriction to project folder |
| **File Browser** | Browse, view, edit, create, delete files and folders |
| **Syntax Highlighting** | 30+ languages supported via highlight.js |
| **Tool Visualization** | See Claude's tool usage with icons and arguments |
| **Code Diffs** | Side-by-side diff view with word-level inline change highlighting |
| **Context Monitor** | View token usage and context window utilization |
| **Task Tracking** | View Claude's current tasks and progress |
| **Project Optimizations** | Check for CLAUDE.md issues and optimization suggestions |
| **Font Controls** | Adjust text size with +/- buttons |
| **Keyboard Shortcuts** | Configurable keybindings (Ctrl+Enter or Enter to send) |
| **Image Support** | Paste or drag-and-drop images into messages |
| **Mobile Support** | Responsive design with collapsible sidebar, full-screen file/diff browsing |
| **Permission Mode Toggle** | Switch between Plan and Accept Edits modes at runtime |
| **Desktop Notifications** | Get notified when agent needs input (optional) |
| **Hidden Files Toggle** | Show/hide dotfiles and hidden folders in file browser |

### Git Integration

Full Git support directly in the UI:

| Feature | Description |
|---------|-------------|
| **Branch Management** | View, switch, and create branches |
| **File Staging** | Stage/unstage individual files or entire directories |
| **Commit** | Write commit messages and commit changes |
| **Push/Pull** | Sync with remote repositories |
| **Diff Preview** | Side-by-side diff view with inline word-level highlighting |
| **Tag Management** | Create and push tags |
| **Context Menu** | Right-click files/folders for quick actions |
| **Operation Blocking** | UI blocks during git operations to prevent conflicts |

### Real-time Features

- **Live Streaming**: WebSocket-based real-time updates
- **Conversation Stats**: Duration, message count, tool calls, tokens
- **Resource Monitor**: Running and queued agent counts
- **Context Usage**: Token usage persisted even when agent is stopped
- **Session Recovery**: Automatic recovery when Claude sessions are lost

### Diff Visualization

- **Side-by-Side View**: Original and modified content displayed side by side
- **Inline Change Highlighting**: Word-level diff showing exactly what changed within modified lines
- **Color Coding**: Red for removed, green for added, orange for modified lines
- **Syntax Highlighting**: Language-aware highlighting preserved in diffs

### Shell Terminal

A full PTY-based terminal integrated into the UI:

| Feature | Description |
|---------|-------------|
| **PTY Support** | True terminal emulation with proper input handling |
| **Directory Restriction** | Users cannot navigate outside the project folder |
| **Resize Support** | Terminal resizes with the browser window |
| **PowerShell/Bash** | Uses PowerShell on Windows, bash on Unix |
| **Session Persistence** | Shell sessions persist while browsing other tabs |

> **Security Note**: The shell terminal is **automatically disabled** when the server is bound to all interfaces (`0.0.0.0`). This prevents remote shell access. To enable shell on all interfaces, set `CLAUDITO_FORCE_SHELL_ENABLED=1` (not recommended).

### Additional Features

- **CLAUDE.md Editor**: Edit global and project-specific CLAUDE.md files with preview
- **Conversation History**: Browse, restore, and rename previous conversations
- **Session Resumption**: Resume Claude sessions across restarts
- **Debug Panel**: View logs, Claude I/O, process info, and troubleshoot issues
- **Optimizations Check**: Detect missing or oversized CLAUDE.md files
- **Append System Prompt**: Add custom instructions to Claude's system prompt
- **Offline Ready**: All assets served locally (no CDN dependencies)
- **Graceful Shutdown**: Properly stops agents and saves state on exit
- **PID Tracking**: Tracks agent processes and cleans up orphans on startup

## Configuration

### Global Settings

Access settings via the gear icon in the UI sidebar.

| Setting | Description | Default |
|---------|-------------|---------|
| `maxConcurrentAgents` | Maximum simultaneous agents (1-10) | `3` |
| `sendWithCtrlEnter` | Ctrl+Enter sends (true) or Enter sends (false) | `true` |
| `historyLimit` | Max conversations in history | `25` |
| `agentPromptTemplate` | Template for autonomous mode instructions | (see below) |

### Permission Configuration

Control what Claude agents can do without prompting. Access via Settings > Claude Code Permissions.

> **⚠️ Important Limitation**: Claudito currently only supports **Accept Edits** and **Plan** permission modes. The **Default** mode (which prompts for permission on each action) is not yet supported because Claudito cannot currently handle Claude's permission prompts. We're working on adding this functionality in a future release.

#### Permission Modes

| Mode | Description | Supported |
|------|-------------|-----------|
| `acceptEdits` | Auto-approve file edits | ✅ Yes |
| `plan` | Review plan before execution | ✅ Yes |
| `default` | Ask for each action | ❌ Not yet |

#### Permission Rules

Rules follow the format: `Tool` or `Tool(specifier)`

**Examples:**
- `Read` - Allow all file reads
- `Bash(npm run:*)` - Allow npm run commands
- `Bash(git status)` - Allow specific command
- `Read(./.env)` - Deny reading .env files (use in deny rules)

#### Allow Rules (auto-approve)
Tools that execute without prompting:
```
Read
Glob
Grep
Bash(npm run:*)
Bash(git status)
Bash(git diff:*)
```

#### Deny Rules (block)
Tools that are blocked entirely (take priority over allow rules):
```
Read(./.env)
Read(./.env.*)
Bash(rm -rf:*)
Bash(curl:*)
```

#### Quick Presets

| Preset | Description |
|--------|-------------|
| Safe Development | Common dev tools, blocks dangerous commands |
| Git Only | Read access + git commands |
| Read Only | File reading only, no writes or commands |
| Clear All | Remove all rules |

#### Skip All Permissions (Legacy)

The "Skip ALL permission prompts" toggle uses `--dangerously-skip-permissions` which bypasses all checks. This is not recommended for production use.

#### Per-Project Overrides

Each project can have its own permission overrides that extend the global rules. Access via the project's settings menu.

### Agent Prompt Template

Customize how instructions are given to agents in autonomous mode. Available variables:

- `${var:project-name}` - Project name
- `${var:phase-title}` - Current phase from ROADMAP.md
- `${var:milestone-title}` - Current milestone title
- `${var:milestone-item}` - Specific task to work on

## Data Storage

All data is stored locally in your home directory:

```
~/.claudito/
├── projects/
│   └── index.json          # Project registry
├── settings.json           # Global settings
└── pids.json              # Active process tracking

{project-root}/.claudito/
├── status.json            # Project status
└── conversations/
    └── {id}.json          # Conversation history
```

## API Reference

### Health Check

```
GET /api/health
```

### Projects

```
GET    /api/projects              # List all projects
POST   /api/projects              # Create project
GET    /api/projects/:id          # Get project details
DELETE /api/projects/:id          # Delete project
```

### Agent Control

```
POST   /api/projects/:id/agent/start       # Start agent
POST   /api/projects/:id/agent/stop        # Stop agent
POST   /api/projects/:id/agent/send        # Send message
GET    /api/projects/:id/agent/status      # Get status
GET    /api/projects/:id/agent/context     # Get context usage
```

### Roadmap

```
GET    /api/projects/:id/roadmap           # Get roadmap
POST   /api/projects/:id/roadmap/generate  # Generate roadmap
PUT    /api/projects/:id/roadmap           # Modify roadmap
DELETE /api/projects/:id/roadmap/task      # Delete a task
DELETE /api/projects/:id/roadmap/milestone # Delete a milestone
DELETE /api/projects/:id/roadmap/phase     # Delete a phase
```

### Git Operations

```
GET    /api/projects/:id/git/status        # Get repository status
GET    /api/projects/:id/git/branches      # List branches
POST   /api/projects/:id/git/checkout      # Switch branch
POST   /api/projects/:id/git/branch        # Create branch
POST   /api/projects/:id/git/stage         # Stage file(s)
POST   /api/projects/:id/git/stage-all     # Stage all changes
POST   /api/projects/:id/git/unstage       # Unstage file(s)
POST   /api/projects/:id/git/unstage-all   # Unstage all changes
POST   /api/projects/:id/git/discard       # Discard changes
POST   /api/projects/:id/git/commit        # Commit staged changes
POST   /api/projects/:id/git/push          # Push to remote
POST   /api/projects/:id/git/pull          # Pull from remote
GET    /api/projects/:id/git/diff          # Get file diff
GET    /api/projects/:id/git/tags          # List tags
POST   /api/projects/:id/git/tags          # Create tag
POST   /api/projects/:id/git/tags/push     # Push tag to remote
```

### File System

```
GET    /api/fs/drives                      # List available drives
GET    /api/fs/browse                      # Browse directory (dirs only)
GET    /api/fs/browse-with-files           # Browse with files
GET    /api/fs/read                        # Read file content
PUT    /api/fs/write                       # Write file content
DELETE /api/fs/delete                      # Delete file or folder
```

### Shell

```
POST   /api/projects/:id/shell/start       # Start shell session
GET    /api/projects/:id/shell/status      # Get shell status
POST   /api/projects/:id/shell/input       # Send input to shell
POST   /api/projects/:id/shell/resize      # Resize terminal
POST   /api/projects/:id/shell/stop        # Stop shell session
```

### Authentication

```
POST   /api/auth/login                     # Login with credentials
POST   /api/auth/logout                    # Logout current session
GET    /api/auth/check                     # Check session validity
```

### Settings

```
GET    /api/settings              # Get settings
PUT    /api/settings              # Update settings
```

### WebSocket

Connect to `ws://localhost:3000` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000');

// Subscribe to project updates
ws.send(JSON.stringify({ type: 'subscribe', projectId: 'your-project-id' }));

// Message types received:
// - agent_message: Real-time agent output
// - agent_status: Status changes (running/stopped/error)
// - agent_waiting: Agent waiting for input (with version for sync)
// - queue_change: Queue updates
// - roadmap_message: Roadmap generation output
// - session_recovery: Session couldn't be resumed, new conversation created
// - shell_output: Shell terminal output
// - shell_exit: Shell session exited
// - shell_error: Shell error occurred
```

## Development

### Setup

```bash
git clone https://github.com/comfortablynumb/claudito.git
cd claudito
npm install
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to dist/ |
| `npm start` | Run production build |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm run format` | Format code with Prettier |

### Project Structure

```
claudito/
├── src/
│   ├── index.ts          # Library entry point
│   ├── cli.ts            # CLI entry point
│   ├── config/           # Configuration loading
│   ├── server/           # Express server
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── repositories/     # Data persistence
│   ├── agents/           # Claude agent management
│   ├── websocket/        # WebSocket server
│   └── utils/            # Utilities
├── public/               # Static frontend assets
├── test/                 # Test files
└── doc/                  # Documentation
```

## Testing the Package Locally

Before publishing, you can test the package locally to verify everything works correctly.

### Method 1: npm pack (Recommended)

Create a tarball and install it:

```bash
# Build the project
npm run build

# Create the package tarball
npm pack

# This creates claudito-0.1.0.tgz (version may vary)

# Install globally from the tarball
npm install -g ./claudito-0.1.0.tgz

# Test the CLI
claudito --help
claudito --version
claudito  # Starts the server

# Uninstall when done
npm uninstall -g claudito
```

### Method 2: npm link

Create a symlink for development:

```bash
# Build first
npm run build

# Create global symlink
npm link

# Now 'claudito' command is available globally
claudito --help
claudito

# Unlink when done
npm unlink -g claudito
```

### Method 3: Dry Run

Preview what would be published without creating a file:

```bash
# See what files would be included
npm pack --dry-run

# Check package size and contents
npm publish --dry-run
```

### Method 4: Local npx

Test as if running with npx:

```bash
# Build the project
npm run build

# Run the CLI directly
node dist/cli.js --help
node dist/cli.js

# Or use npm script
npm run cli -- --help
npm run cli -- --port 8080
```

### Verifying the Package Contents

Check that the package includes everything needed:

```bash
# List all files that will be published
npm pack --dry-run 2>&1 | grep "npm notice"

# Expected contents:
# - dist/          (compiled JavaScript)
# - public/        (frontend assets)
# - README.md
# - LICENSE
# - package.json
```

### Testing in a Clean Environment

For thorough testing, install in an isolated directory:

```bash
# Create test directory
mkdir /tmp/claudito-test
cd /tmp/claudito-test

# Install from tarball
npm init -y
npm install /path/to/claudito-0.1.0.tgz

# Run via npx
npx claudito --help

# Clean up
cd ..
rm -rf /tmp/claudito-test
```

## Security Recommendations

### Network Binding

By default, Claudito binds to `localhost` which only accepts connections from the local machine. When exposing Claudito to other devices, consider these recommendations:

| Scenario | Recommended HOST | Notes |
|----------|------------------|-------|
| **Local development** | `127.0.0.1` or `localhost` | Only accessible from your machine |
| **LAN access** | Your private IP (e.g., `192.168.1.x`) | Accessible from your local network |
| **All interfaces** | `0.0.0.0` | Accessible from anywhere - use with caution |

```bash
# Local only (most secure)
claudito --host 127.0.0.1

# Specific network interface (LAN access)
claudito --host 192.168.1.100

# All interfaces (least secure - requires authentication)
claudito --host 0.0.0.0
```

### Best Practices

1. **Use authentication**: Claudito requires login by default. Set custom credentials via environment variables for production use:
   ```bash
   CLAUDITO_USERNAME=myuser CLAUDITO_PASSWORD=mystrongpassword claudito
   ```

2. **Avoid exposing to the internet**: Claudito is designed for local/LAN use. If you must expose it, use a reverse proxy with HTTPS.

3. **Firewall rules**: When using LAN access, configure your firewall to only allow trusted IP addresses.

4. **Review permission rules**: Configure Claude Code permission rules to restrict what agents can do.

## Troubleshooting

### "claude: command not found"

The Claude Code CLI is not installed or not in your PATH:

```bash
npm install -g @anthropic-ai/claude-code
```

### Port already in use

Another process is using port 3000:

```bash
# Use a different port
claudito --port 3001

# Or find and kill the process using port 3000
# Linux/macOS:
lsof -i :3000
kill -9 <PID>

# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Agent not responding

Check the Debug panel (gear icon > Debug) to view:
- Process status and PID
- Recent logs
- Last executed command

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Made with Claude Code
