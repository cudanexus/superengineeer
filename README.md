# Claudito

A Claude Code autonomous agent manager that allows running and monitoring multiple Claude agents across different projects.

## Features

### Agent Modes
- **Interactive Mode** (default): Chat with Claude in real-time. Agent auto-starts when you send your first message.
- **Autonomous Mode**: Runs through ROADMAP.md milestones automatically with manual start.

### Core Features
- **Multi-Project Management**: Add, manage, and delete projects with Claude Code agents
- **Concurrent Execution**: Run multiple agents simultaneously with configurable limits
- **Queue System**: Automatic queuing when at max capacity, agents start when slots free up
- **Live Conversation Streaming**: Real-time WebSocket updates for agent output
- **Roadmap Integration**: Parse and display ROADMAP.md progress, generate via Claude

### UI Features
- **Tabbed Interface**: Switch between Agent Output and Project Files views
- **File Browser & Editor**: Browse, view, and edit project files with live syntax highlighting (30+ languages)
- **Configurable Keybindings**: Choose between Ctrl+Enter or Enter to send messages
- **Tool Visualization**: See Claude's tool usage with icons, arguments, and code diffs
- **Context Usage Monitor**: View token usage, cache statistics, and context window utilization
- **Claude Files Editor**: View and edit CLAUDE.md files (global and project-specific)
- **Font Size Controls**: Adjust text size for the entire project view (conversation, tools, modals) with +/- buttons
- **Real-time Stats**: Live updates for duration, message count, tool calls, and total tokens used
- **Roadmap Task Selection**: Select milestones or tasks to run, auto-generates prompts and sends to agent

### Additional Features
- **Resource Monitoring**: View running and queued agent counts in real-time
- **Global Settings**: Configure max concurrent agents and Claude permissions from UI
- **Comprehensive Logging**: Configurable log levels (debug, info, warn, error)
- **Error Handling**: User-friendly error messages with structured error responses
- **All assets served locally** (no CDN dependencies)

## Requirements

- Node.js 18+
- npm or yarn

## Installation

```bash
npm install
```

## Usage

### Development

```bash
npm run dev
```

Server starts at `http://localhost:3000` by default.

### Production

```bash
npm run build
npm start
```

## Data Storage

All application data is stored in `~/.claudito/`:

| File | Description |
|------|-------------|
| `projects.json` | List of projects and their metadata |
| `settings.json` | Global application settings |
| `conversations/*.json` | Conversation history for each project |

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `localhost` | Server host |
| `NODE_ENV` | `development` | Environment (development/production/test) |
| `LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
| `MAX_CONCURRENT_AGENTS` | `3` | Maximum concurrent agents (queued when exceeded) |

## API Endpoints

### Health Check

```
GET /api/health
```

Returns server health status.

### Agent Resource Status

```
GET /api/agents/status
```

Returns current agent resource status:
```json
{
  "runningCount": 2,
  "maxConcurrent": 3,
  "queuedCount": 1,
  "queuedProjects": [{ "projectId": "abc123", "queuedAt": "2024-01-01T00:00:00Z" }]
}
```

### Projects

```
GET /api/projects              # List all projects
POST /api/projects             # Create project
GET /api/projects/:id          # Get project details
DELETE /api/projects/:id       # Delete project
```

### Agent Control

```
POST /api/projects/:id/agent/start   # Start agent (queues if at capacity)
POST /api/projects/:id/agent/stop    # Stop agent
GET /api/projects/:id/agent/status   # Get agent status
GET /api/projects/:id/agent/context  # Get context usage (tokens, cache stats)
DELETE /api/projects/:id/agent/queue # Remove from queue
```

### Roadmap

```
GET /api/projects/:id/roadmap           # Get roadmap content and parsed data
POST /api/projects/:id/roadmap/generate # Generate roadmap via Claude
```

### Settings

```
GET /api/settings   # Get global settings
PUT /api/settings   # Update global settings
```

Settings payload:
```json
{
  "maxConcurrentAgents": 3,
  "claudePermissions": {
    "dangerouslySkipPermissions": true
  },
  "agentPromptTemplate": "Template with ${var:project-name}, ${var:phase-title}, ${var:milestone-title}, ${var:milestone-item}",
  "sendWithCtrlEnter": true
}
```

| Setting | Description |
|---------|-------------|
| `maxConcurrentAgents` | Maximum agents that can run simultaneously (1-10) |
| `claudePermissions.dangerouslySkipPermissions` | Skip permission prompts for Claude actions |
| `agentPromptTemplate` | Template for autonomous agent instructions |
| `sendWithCtrlEnter` | `true` = Ctrl+Enter sends, Enter adds newline. `false` = Enter sends, Shift+Enter adds newline |

The `agentPromptTemplate` defines how instructions are given to agents. Available variables:
- `${var:project-name}` - The project name
- `${var:phase-title}` - Current phase title from ROADMAP.md
- `${var:milestone-title}` - Current milestone title
- `${var:milestone-item}` - The specific task to work on

## Project Structure

```
src/
  index.ts          # Entry point
  config/           # Configuration loading
  server/           # Express server setup
  routes/           # API route handlers
  services/         # Business logic
  repositories/     # Data persistence
  agents/           # Claude agent management
  websocket/        # WebSocket handling
  utils/            # Utility functions
public/             # Static assets
test/               # Unit and integration tests
doc/                # Documentation
```

## Development

### Running Tests

```bash
npm test
npm run test:coverage
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Formatting

```bash
npm run format
```

## License

MIT
