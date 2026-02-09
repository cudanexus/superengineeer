# Claudito - Project Context

Claude Code intelligent agent manager - TypeScript HTTP server with jQuery + Tailwind.css UI. Features Ralph Loop iterative development pattern and roadmap-based automation.

## Project Structure

```
src/
  index.ts          # Entry point (config + server instantiation only)
  config/           # Configuration loading
  server/           # Express server + WebSocket integration
  routes/           # API route handlers
  services/         # Business logic (ProjectService, RoadmapParser, InstructionGenerator, ClaudeOptimizationService)
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
  MERMAID_EXAMPLES.md # Mermaid.js diagram examples and reference
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

- **Infrastructure**: `ConfigLoader`, `HttpServer`, `ProjectWebSocketServer`, `EventManager` (in-memory event bus), `Logger` (with circular buffer)
- **Data**: `ProjectRepository` (status.json per project), `ConversationRepository` (per project/item), `SettingsRepository` (global settings + agentPromptTemplate)
- **Services**: `ProjectService`, `FilesystemService`, `GitService` (simple-git), `RoadmapParser`, `RoadmapGenerator`, `InstructionGenerator`, `ClaudeOptimizationService` (edits files directly via Edit tool)
- **Agents**: `ClaudeAgent` (CLI process management), `AgentManager` (multi-agent lifecycle: interactive + one-off)

## API Endpoints

All project routes prefixed with `/api/projects/:id`. Standard REST verbs (GET/POST/PUT/DELETE).

**Global**: `GET /api/health`, `GET /api/agents/status`, `GET|PUT /api/settings`, `GET /api/settings/models`

**Filesystem** (`/api/fs`): `drives`, `browse?path=`, `browse-with-files?path=`, `read?path=`, `PUT write`, `DELETE delete`

**Projects**: CRUD on `/api/projects` + `/:id`

**Roadmap** (`/:id/roadmap`): GET (content+parsed), `POST generate`, PUT (modify), `POST respond`, `PUT next-item`, DELETE `task|milestone|phase`

**Agent** (`/:id/agent`): `POST interactive` (start session), `POST send`, `POST stop`, GET `status|context|loop|queue`, DELETE `queue(/:index)`

**One-Off Agents** (`/:id/agent/oneoff/:oneOffId`): `POST send|stop`, GET `status|context`

**Conversations** (`/:id`): GET `conversation|conversations(?limit=N)`, `PUT conversations/:conversationId` (rename)

**Config** (`/:id`): GET/PUT `claude-files|permissions|model`, GET `optimizations|debug`

**Ralph Loop** (`/:id/ralph-loop`): GET (list), `POST start`, `/:taskId` GET|DELETE, `/:taskId/stop|pause|resume`

## WebSocket Messages

**Core**: `subscribe`/`unsubscribe`, `agent_message`, `agent_status`, `agent_waiting` (includes version), `queue_change`, `roadmap_message`, `session_recovery`

**Ralph Loop**: `ralph_loop_status` (idle/worker_running/reviewer_running/completed/failed/paused), `ralph_loop_iteration`, `ralph_loop_output`, `ralph_loop_complete`, `ralph_loop_worker_complete`, `ralph_loop_reviewer_complete`, `ralph_loop_error`

**One-Off Agents**: `oneoff_message`, `oneoff_status`, `oneoff_waiting` (includes oneOffId, isWaiting, version)

## Ralph Loop

Implements Geoffrey Huntley's "Ralph Wiggum technique" - an iterative worker/reviewer pattern:
1. **Worker Phase**: Executes task with fresh context each iteration
2. **Reviewer Phase**: Reviews worker output and provides structured feedback
3. **Decision**: Approve (complete), reject (iterate), or fail (stop)
4. **Configurable**: Max iterations, worker/reviewer models, custom prompts
5. **Real-time**: Live output streaming and progress tracking

## Commands & Configuration

- `npm run dev` - Development with hot reload
- `npm run build` - Build TypeScript
- `npm start` - Run production build
- `npm test` - Run tests

**Environment Variables**: `PORT` (3000), `HOST` (0.0.0.0), `NODE_ENV`, `LOG_LEVEL`, `MAX_CONCURRENT_AGENTS` (3), `DEV_MODE`/`CLAUDITO_DEV_MODE` (enables experimental features like Git tab)

## Permissions & Modes

**Runtime modes** (changeable via UI, restarts agent with same session):
- **Accept Edits** (default): Auto-approve file edits
- **Plan**: Review plan before execution. `ExitPlanMode` shows Approve ("yes") / Request Changes (user input) / Reject ("no")

**Global** (`claudePermissions`): `dangerouslySkipPermissions`, `defaultMode` ('acceptEdits'|'plan'), `allowRules`/`denyRules` arrays (format: `Tool` or `Tool(specifier)`, e.g. "Read", "Bash(npm run:*)")

**Per-project** (`permissionOverrides` in status.json): `enabled`, `allowRules`, `denyRules`, `defaultMode`

## Session Management

Sessions use UUID v4 IDs: `--session-id {uuid}` (new) or `--resume {uuid}` (existing). Permission mode changes queue until idle, then restart with 1s delay. Unrecognized sessions auto-create fresh conversation with new UUID.

## Features

**Server**: Graceful shutdown (SIGINT/SIGTERM), PID tracking (`$HOME/.claudito/pids.json`, orphans killed on startup), conversation statistics (duration, messages, tool calls, tokens), context usage persistence

**UI Tabs**: Agent Output (conversation + tool usage) and Project Files (tree view, multi-tab editor, Ctrl+S save, delete files/folders)
- **One-Off Agent Sub-Tabs**: Full rendering per tab, per-tab input/toolbar (Tasks, Search, Permission Mode, Model, Font Size), direct file editing
- **Claude Files Modal**: Edit CLAUDE.md files (global/project), markdown preview, optimize via one-off agent
- **Roadmap Management**: Checkbox selection, "Run Selected" auto-generates prompts, delete tasks/milestones/phases
- **Ralph Loop Tab**: Start/Pause/Resume/Stop controls, live output streaming, history view
- **Other**: Conversation history (view/rename, configurable limit), debug modal, mobile-responsive layout

## Settings

`maxConcurrentAgents` (1-10), `agentPromptTemplate`, `appendSystemPrompt` (restarts all agents on change), `sendWithCtrlEnter`, `historyLimit` (5-100, default: 25), `promptTemplates`, `defaultModel` (default: claude-opus-4-6)

**Prompt Templates**: Reusable prompts (Settings > Templates). Syntax: `${type:name}` or `${type:name:options}`. Types: `text`, `textarea`, `select:opt1,opt2`, `checkbox`

## Mermaid.js Support

Mermaid diagrams in ` ```mermaid ` code blocks render automatically in messages and plan content (dark theme). Use `/mermaid` skill via the bundled plugin (`claudito-plugin` directory, load with `claude --plugin-dir ./claudito-plugin`). See `doc/MERMAID_EXAMPLES.md` for syntax reference.
