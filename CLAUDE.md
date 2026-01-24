# Claudito - Project Context

Claude Code autonomous agent manager - TypeScript HTTP server with jQuery + Tailwind.css UI.

## Project Structure

```
src/
  index.ts          # Entry point (config + server instantiation only)
  config/           # Configuration loading
  server/           # Express server + WebSocket integration
  routes/           # API route handlers
  services/         # Business logic (ProjectService, RoadmapParser, InstructionGenerator)
  repositories/     # Data persistence (Project, Conversation, Settings)
  agents/           # Claude agent management (ClaudeAgent, AgentManager)
  websocket/        # WebSocket server for real-time updates
  utils/            # Logger, error handling, retry utilities
public/
  vendor/           # Third-party assets (jQuery, Tailwind - NO CDN)
  js/               # Frontend JavaScript with WebSocket client
  css/              # Custom styles
test/
  unit/             # Unit tests
doc/
  ROADMAP.md        # Project milestones
```

## Data Storage Structure

Global data in `$HOME/.claudito/`:
```
projects/
  index.json                      # [{ id, name, path }] - project registry
settings.json                     # Global settings + agentPromptTemplate
```

Project-specific data in `{project-root}/.claudito/`:
```
status.json                       # ProjectStatus object
conversations/
  {conversationId}.json           # Conversation with messages
```

## Key Interfaces

- `ConfigLoader` - Configuration loading abstraction
- `HttpServer` - Server lifecycle abstraction
- `FilesystemService` - Filesystem browsing abstraction
- `ProjectRepository` - Project data persistence (status.json per project)
- `ConversationRepository` - Conversation history (per project/item)
- `SettingsRepository` - Global settings (includes agentPromptTemplate)
- `ProjectService` - Project creation with folder validation
- `RoadmapParser` - Parse ROADMAP.md into structured data
- `RoadmapGenerator` - Generate ROADMAP.md via Claude
- `InstructionGenerator` - Generate agent instructions from template
- `ClaudeAgent` - Claude Code CLI process management
- `AgentManager` - Multi-agent lifecycle + autonomous loop
- `ProjectWebSocketServer` - Real-time updates via WebSocket
- `Logger` - Configurable logging with project context + circular buffer

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/agents/status` - Get agent resource status
- `GET /api/settings` - Get global settings
- `PUT /api/settings` - Update global settings
- `GET /api/fs/drives` - List available drives
- `GET /api/fs/browse?path=` - List directory contents (directories only)
- `GET /api/fs/browse-with-files?path=` - List directory with files (includes isEditable flag)
- `GET /api/fs/read?path=` - Read file content
- `PUT /api/fs/write` - Write file content (body: {path, content})
- `DELETE /api/fs/delete` - Delete file or folder (body: {path, isDirectory})
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project details
- `DELETE /api/projects/:id` - Delete project
- `GET /api/projects/:id/roadmap` - Get roadmap (content + parsed)
- `POST /api/projects/:id/roadmap/generate` - Generate roadmap via Claude (streams output via WebSocket)
- `PUT /api/projects/:id/roadmap` - Modify existing roadmap via Claude prompt (streams output via WebSocket)
- `POST /api/projects/:id/roadmap/respond` - Send response to Claude when it asks a question
- `DELETE /api/projects/:id/roadmap/task` - Delete a task (body: {phaseId, milestoneId, taskIndex})
- `DELETE /api/projects/:id/roadmap/milestone` - Delete a milestone (body: {phaseId, milestoneId})
- `DELETE /api/projects/:id/roadmap/phase` - Delete a phase (body: {phaseId})
- `PUT /api/projects/:id/roadmap/next-item` - Set next item to work on
- `POST /api/projects/:id/agent/start` - Start autonomous loop
- `POST /api/projects/:id/agent/interactive` - Start interactive agent session
- `POST /api/projects/:id/agent/send` - Send message to interactive agent
- `POST /api/projects/:id/agent/stop` - Stop agent
- `GET /api/projects/:id/agent/status` - Get agent status (includes mode)
- `GET /api/projects/:id/agent/context` - Get agent context usage (tokens, percentages)
- `GET /api/projects/:id/agent/loop` - Get loop status
- `GET /api/projects/:id/agent/queue` - Get queued messages
- `DELETE /api/projects/:id/agent/queue` - Remove from queue
- `GET /api/projects/:id/conversation` - Get conversation history
- `GET /api/projects/:id/conversations` - List all conversations (supports `?limit=N`)
- `PUT /api/projects/:id/conversations/:conversationId` - Rename conversation (body: {label})
- `GET /api/projects/:id/debug` - Get debug info
- `GET /api/projects/:id/claude-files` - Get CLAUDE.md files (global and project)
- `PUT /api/projects/:id/claude-files` - Save CLAUDE.md file (body: {filePath, content})

## WebSocket Messages

- `subscribe` / `unsubscribe` - Subscribe to project updates
- `agent_message` - Real-time agent output
- `agent_status` - Agent status changes
- `queue_change` - Queue status updates
- `roadmap_message` - Real-time roadmap generation output

## Autonomous Loop

Agent manager runs autonomous loop that:
1. Validates ROADMAP.md exists (required)
2. Uses nextItem from status.json OR finds first incomplete
3. Creates new conversation for each item
4. Generates instructions from agentPromptTemplate
5. Starts agent with instructions
6. Parses JSON response `{ status: "COMPLETE"|"FAILED", reason }`
7. On COMPLETE: continues to next item
8. On FAILED: pauses loop, emits itemFailed event

## Configuration (Environment Variables)

- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: localhost)
- `NODE_ENV` - Environment (development/production/test)
- `LOG_LEVEL` - Log level (debug/info/warn/error)
- `MAX_CONCURRENT_AGENTS` - Max concurrent agents (default: 3)

## Commands

- `npm run dev` - Development with hot reload
- `npm run build` - Build TypeScript
- `npm start` - Run production build
- `npm test` - Run tests

## Agent Modes

- **Interactive Mode** (default): Chat with Claude, send messages, see tool usage in real-time. Agent auto-starts when first message is sent.
- **Autonomous Mode**: Runs through roadmap milestones automatically. Requires manual start.

## Server Features

- **Graceful Shutdown**: SIGINT/SIGTERM stops all running agents before server shutdown
- **PID Tracking**: Agent PIDs persisted to `$HOME/.claudito/pids.json`, orphans verified and killed on startup
- **Conversation Statistics**: Duration, message count, tool call count, total tokens displayed in UI (real-time updates)
- **Context Usage Persistence**: Token usage saved to conversation metadata for historical tracking

## UI Features

- **Two Main Tabs**:
  - Agent Output: Conversation with Claude, tool usage, messages
  - Project Files: File browser with editor for project files

- **Interactive Mode**:
  - Auto-starts agent on first message send
  - Configurable keybindings (Ctrl+Enter or Enter to send)
  - No Start button needed - just type and send

- **File Editor**:
  - Browse project files in tree view
  - Open multiple files in tabs
  - Edit text files with save functionality (Ctrl+S)
  - Delete files and folders
  - Unsaved changes indicator

- **Claude Files Modal**:
  - Edit CLAUDE.md files (global and project)
  - Markdown preview with syntax highlighting

- **Conversation History**:
  - View past conversations
  - Rename conversations with custom labels
  - Configurable history limit (default: 25)

- **Roadmap Management**:
  - Select milestones or individual tasks with checkboxes
  - "Run Selected" button auto-generates prompts
  - Delete individual tasks, entire milestones, or phases
  - Works with both running and stopped agents

- **Debug Modal**:
  - View current agent process info (PID, working directory, start time)
  - Monitor autonomous loop state
  - See last executed command with copy button
  - Browse recent logs with color-coded levels
  - View all tracked processes across projects

## Settings

- `maxConcurrentAgents` - Maximum concurrent agents (1-10)
- `claudePermissions.dangerouslySkipPermissions` - Skip permission prompts
- `agentPromptTemplate` - Template for autonomous agent instructions
- `sendWithCtrlEnter` - Input keybinding preference (true=Ctrl+Enter sends, false=Enter sends)
- `historyLimit` - Maximum conversations in history dropdown (5-100, default: 25)
