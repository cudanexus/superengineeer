# Superengineer Roadmap

## Progress Summary

- **Phase 1: GitHub Integration** 🔄 In Progress (1.5 remaining)
- **Phase 2: Run Configurations** 🔄 Not Started
- **Phase 3: Docker Sandboxed Execution** 🔄 Not Started
- **Phase 4: Advanced Agent Orchestration** 🔄 Not Started
- **Phase 5: Collaboration & Sharing** 🔄 Not Started
- **Phase 6: Observability & Analytics** 🔄 Not Started

---

## Phase 1: GitHub Integration (via GitHub CLI)

Integrate with GitHub using the `gh` CLI tool to browse repositories, clone projects, and work on issues directly from the Superengineer UI. Requires `gh` to be installed and authenticated on the host machine.

### Milestone 1.1: GitHub CLI Detection & Service Layer

- [x] Create `GitHubCLIService` interface wrapping `gh` CLI commands via `child_process`
- [x] Implement `gh` availability detection (`gh --version`) with clear error messaging when missing
- [x] Detect authentication status via `gh auth status` and surface login instructions in Settings UI
- [x] Add `GET /api/integrations/github/status` endpoint returning CLI version and auth state
- [x] Add GitHub connection status indicator in Settings UI (installed, authenticated, username/org)

### Milestone 1.2: Repository Browser & Project Import

- [x] Add `GET /api/integrations/github/repos` endpoint using `gh repo list` with owner/type/language filters
- [x] Create repository browser modal with org/user filtering, search (`gh search repos`), and sorting
- [x] Implement `POST /api/integrations/github/clone` using `gh repo clone` and register as Superengineer project
- [x] Support selecting target directory and branch during clone (`gh repo clone -- --branch`)
- [x] Show clone progress via WebSocket events (`github_clone_progress`) by streaming `gh` stdout

### Milestone 1.3: GitHub Issues Integration

- [x] Add `GET /api/integrations/github/issues` endpoint using `gh issue list` with JSON output (`--json`)
- [x] Create issues panel in project view with label/milestone/assignee filters via `gh issue list --label --milestone --assignee`
- [x] Implement "Start Working" action: fetch issue detail via `gh issue view --json` and generate agent prompt from body and comments
- [x] Implement "Add to Roadmap" action: convert issue into roadmap task with `gh` issue URL link back
- [x] Sync issue status via `gh issue close` on task completion and `gh issue comment` for progress updates

### Milestone 1.4: Pull Request Workflow

- [x] Add `POST /api/integrations/github/pr` using `gh pr create` from current branch with title and body
- [x] Auto-generate PR title and description from conversation history and diff
- [x] Fetch PR review comments via `gh pr view --json reviews,comments` and show in agent output tab
- [x] Add "Fix PR Feedback" action: parse review comments from `gh pr diff` and feed as agent prompt

### Milestone 1.5: GitHub Issue Creation

- [ ] Define `IssueCreateOptions` interface with fields: `repo`, `title`, `body`, `labels` (string array), `assignees` (string array), `milestone` (string)
- [ ] Add `createIssue(options: IssueCreateOptions)` method to `GitHubCLIService` interface and implement it using `gh issue create --repo --title --body [--label --assignee --milestone]`
- [ ] Add `POST /api/integrations/github/issues` endpoint that validates required fields (`title`, `body`) and calls `createIssue`, returning the created issue URL and number
- [ ] Create "New Issue" button in the GitHub Issues panel that opens a creation modal with title input, body textarea (markdown), label multi-select, assignee multi-select, and milestone dropdown
- [ ] Populate label, assignee, and milestone dropdowns by fetching available options via `gh label list`, `gh api repos/:owner/:repo/collaborators`, and `gh api repos/:owner/:repo/milestones`
- [ ] Add unit tests for the `createIssue` service method, the POST route handler, and arg-building logic

## Phase 2: Run Configurations

Allow users to define, manage, and execute named run configurations per project — similar to JetBrains IDE run/debug configurations. Each configuration defines a shell command (with optional arguments, environment variables, and working directory) that can be launched, stopped, and monitored from the UI.

### Milestone 2.1: Run Configuration Data Model & Persistence

- [ ] Define `RunConfiguration` interface with fields: `id`, `name`, `command`, `args`, `cwd` (relative to project root), `env` (key-value pairs), `shell` (optional override), `autoRestart` (boolean), `preLaunchConfigId` (optional, references another config to run first)
- [ ] Add `runConfigurations` array to the project `status.json` schema with CRUD operations in `ProjectRepository`
- [ ] Create `RunConfigurationService` interface with methods: `create`, `update`, `delete`, `getAll`, `getById`
- [ ] Implement `DefaultRunConfigurationService` with validation (unique names, command required, valid cwd path)
- [ ] Add unit tests for the service covering CRUD, validation errors, and pre-launch dependency cycles

### Milestone 2.2: Run Configuration API Endpoints

- [ ] Add `GET /api/projects/:id/run-configs` returning all configurations for a project
- [ ] Add `POST /api/projects/:id/run-configs` to create a new configuration (validate required fields)
- [ ] Add `PUT /api/projects/:id/run-configs/:configId` to update an existing configuration
- [ ] Add `DELETE /api/projects/:id/run-configs/:configId` to remove a configuration (prevent deletion if referenced as pre-launch by another config)
- [ ] Add unit tests for all route handlers with mocked service layer

### Milestone 2.3: Process Execution & Lifecycle

- [ ] Create `RunProcessManager` interface for spawning and tracking running processes per project
- [ ] Implement process spawning via `child_process.spawn` with configured `command`, `args`, `cwd`, `env`, and `shell` options
- [ ] Handle pre-launch chains: before starting a config, start its `preLaunchConfigId` config first and wait for it to be running
- [ ] Add `POST /api/projects/:id/run-configs/:configId/start` and `POST .../stop` endpoints
- [ ] Add `GET /api/projects/:id/run-configs/:configId/status` returning process state (`stopped`, `starting`, `running`, `errored`), PID, uptime, and exit code
- [ ] Implement graceful stop (SIGTERM, then SIGKILL after timeout) and auto-restart on crash when `autoRestart` is enabled

### Milestone 2.4: Real-Time Output Streaming & UI

- [ ] Stream process stdout/stderr to the frontend via WebSocket events (`run_config_output`, `run_config_status`)
- [ ] Create a "Run Configurations" panel in the project view with a list of all configs showing name, status badge, and start/stop buttons
- [ ] Add a run configuration editor modal with form fields for name, command, args, cwd, env variables (dynamic key-value rows), shell, auto-restart toggle, and pre-launch config dropdown
- [ ] Implement a terminal-style output viewer per running config (scrollable, ANSI color support, clear button)
- [ ] Add a toolbar quick-launch dropdown listing all configs for the current project with one-click start
- [ ] Support running multiple configs simultaneously with independent output streams and status tracking

## Phase 3: Docker Sandboxed Execution

Run Claude Code agents inside Docker containers with the project directory mounted, eliminating risk of unintended host modifications.

### Milestone 3.1: Docker Runtime Configuration

- [ ] Create `DockerService` interface for container lifecycle management
- [ ] Add Docker settings in UI: enable/disable, base image, resource limits (CPU, memory)
- [ ] Implement Docker availability detection with fallback to host execution
- [ ] Create `Dockerfile.superengineer-v5-agent` with Claude Code CLI, Node.js, and common dev tools
- [ ] Add `GET /api/settings/docker` and `PUT /api/settings/docker` endpoints

### Milestone 3.2: Container Lifecycle Management

- [ ] Implement container creation with project directory bind-mount (read-write)
- [ ] Pass environment variables, Git config, and SSH keys into container securely
- [ ] Implement container start/stop/restart aligned with agent lifecycle
- [ ] Add container health checks and automatic restart on crash
- [ ] Track container resource usage and expose via `GET /api/agents/containers`

### Milestone 3.3: Sandboxed Agent Execution

- [ ] Modify `ClaudeAgent` to optionally spawn inside Docker container via `docker exec`
- [ ] Stream agent stdout/stderr from container through existing WebSocket pipeline
- [ ] Implement file sync strategy for `.superengineer-v5/` metadata (conversations, status)
- [ ] Add per-project Docker override (some projects sandboxed, others on host)
- [ ] Create network isolation options (no network, host network, custom bridge)

### Milestone 3.4: Docker Image Management

- [ ] Add UI for managing custom agent images (list, build, remove)
- [ ] Support per-project Dockerfile for project-specific toolchains
- [ ] Implement image layer caching for fast container startup
- [ ] Add pre-built image variants (Node.js, Python, Rust, Go, Java)

## Phase 4: Advanced Agent Orchestration

Enhance agent capabilities with multi-agent collaboration, scheduled execution, and intelligent context management.

### Milestone 4.1: Multi-Agent Collaboration

- [ ] Implement agent-to-agent message passing for collaborative workflows
- [ ] Create `PipelineService` for sequential multi-agent task chains
- [ ] Add pipeline builder UI with drag-and-drop agent step ordering
- [ ] Implement shared context store for agents working on the same project

### Milestone 4.2: Scheduled & Triggered Execution

- [ ] Create `SchedulerService` with cron-based task scheduling
- [ ] Add webhook triggers for external event-driven execution
- [ ] Implement file-watcher triggers (run agent on file changes)
- [ ] Add schedule management UI with enable/disable and execution history
- [ ] Support Git hook integration (pre-commit, post-push agent tasks)

### Milestone 4.3: Context Budget Management

- [ ] Implement context usage prediction before sending messages
- [ ] Add automatic conversation summarization when context approaches limit
- [ ] Create context budget allocation across concurrent agents
- [ ] Show real-time context budget visualization per agent in UI
