# Claudito Roadmap

## Progress Summary

- **Phase 1: GitHub Integration** ✅ Complete
- **Phase 2: GitLab & Jira Integration** 🔄 Not Started
- **Phase 3: Docker Sandboxed Execution** 🔄 Not Started
- **Phase 4: Advanced Agent Orchestration** 🔄 Not Started
- **Phase 5: Collaboration & Sharing** 🔄 Not Started
- **Phase 6: Observability & Analytics** 🔄 Not Started

---

## Phase 1: GitHub Integration (via GitHub CLI)

Integrate with GitHub using the `gh` CLI tool to browse repositories, clone projects, and work on issues directly from the Claudito UI. Requires `gh` to be installed and authenticated on the host machine.

### Milestone 1.1: GitHub CLI Detection & Service Layer

- [x] Create `GitHubCLIService` interface wrapping `gh` CLI commands via `child_process`
- [x] Implement `gh` availability detection (`gh --version`) with clear error messaging when missing
- [x] Detect authentication status via `gh auth status` and surface login instructions in Settings UI
- [x] Add `GET /api/integrations/github/status` endpoint returning CLI version and auth state
- [x] Add GitHub connection status indicator in Settings UI (installed, authenticated, username/org)

### Milestone 1.2: Repository Browser & Project Import

- [x] Add `GET /api/integrations/github/repos` endpoint using `gh repo list` with owner/type/language filters
- [x] Create repository browser modal with org/user filtering, search (`gh search repos`), and sorting
- [x] Implement `POST /api/integrations/github/clone` using `gh repo clone` and register as Claudito project
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

## Phase 2: GitLab & Jira Integration

Extend the integration framework to support GitLab and Jira, enabling multi-platform issue tracking and project management.

### Milestone 2.1: Integration Provider Framework

- [ ] Create `IntegrationProvider` interface (authenticate, listRepos, listIssues, createPR)
- [ ] Refactor GitHub service to implement `IntegrationProvider`
- [ ] Build provider registry with per-project provider selection
- [ ] Create shared integration settings UI (add/remove/configure providers)

### Milestone 2.2: GitLab Integration

- [ ] Implement `GitLabService` with personal access token and OAuth authentication
- [ ] Add GitLab repository browser with group/subgroup navigation
- [ ] Implement GitLab issue listing with label and milestone filters
- [ ] Add merge request creation with auto-generated description
- [ ] Support GitLab CI pipeline status display in project view

### Milestone 2.3: Jira Integration

- [ ] Implement `JiraService` with API token authentication (Cloud and Server)
- [ ] Add Jira board/backlog browser with project and sprint filters
- [ ] Implement "Start Working" action from Jira ticket (summary, description, acceptance criteria)
- [ ] Add "Add to Roadmap" action: import Jira ticket as roadmap task with bidirectional link
- [ ] Update Jira ticket status and add work log comments on task completion

### Milestone 2.4: Unified Issue Dashboard

- [ ] Create cross-provider issue dashboard aggregating GitHub, GitLab, and Jira
- [ ] Add priority-based sorting and custom saved filters
- [ ] Implement bulk "Add to Roadmap" for multiple selected issues
- [ ] Show linked integration source (icon + link) on roadmap tasks

## Phase 3: Docker Sandboxed Execution

Run Claude Code agents inside Docker containers with the project directory mounted, eliminating risk of unintended host modifications.

### Milestone 3.1: Docker Runtime Configuration

- [ ] Create `DockerService` interface for container lifecycle management
- [ ] Add Docker settings in UI: enable/disable, base image, resource limits (CPU, memory)
- [ ] Implement Docker availability detection with fallback to host execution
- [ ] Create `Dockerfile.claudito-agent` with Claude Code CLI, Node.js, and common dev tools
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
- [ ] Implement file sync strategy for `.claudito/` metadata (conversations, status)
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

## Phase 5: Collaboration & Sharing

Enable team workflows with shared projects, session sharing, and export/import capabilities.

### Milestone 5.1: Session Export & Import

- [ ] Create `ExportService` for serializing conversations to portable JSON/Markdown
- [ ] Implement conversation export with tool call results and file diffs included
- [ ] Add import functionality to resume exported sessions in new environments
- [ ] Support selective export (date range, specific conversations)

### Milestone 5.2: Project Templates

- [ ] Create template system for bootstrapping new projects with pre-configured settings
- [ ] Add built-in templates (Node.js API, React app, Python CLI, Rust library)
- [ ] Implement custom template creation from existing project configuration
- [ ] Add template browser UI with preview and one-click project creation

### Milestone 5.3: Notification System

- [ ] Create `NotificationService` interface with pluggable providers
- [ ] Implement desktop notifications for agent completion and errors
- [ ] Add optional Slack/Discord webhook notifications for long-running tasks
- [ ] Create notification preferences UI (per-event granularity)

### Milestone 5.4: Multi-User Support

- [ ] Implement JWT-based authentication with user accounts
- [ ] Add role-based access control (admin, developer, viewer)
- [ ] Create project sharing with per-user permission levels
- [ ] Add audit log for tracking user actions across shared projects

## Phase 6: Observability & Analytics

Provide deep insights into agent performance, cost tracking, and system health.

### Milestone 6.1: Cost & Token Analytics

- [ ] Create `AnalyticsService` for aggregating token usage across agents and projects
- [ ] Implement per-project and per-conversation cost estimation (model-aware pricing)
- [ ] Add analytics dashboard with charts (daily usage, cost trends, model breakdown)
- [ ] Create budget alerts with configurable thresholds and notifications

### Milestone 6.2: Agent Performance Metrics

- [ ] Track task completion rates, average duration, and iteration counts
- [ ] Measure tool call success/failure rates per agent session
- [ ] Create performance comparison view across models (speed, quality, cost)
- [ ] Add Ralph Loop efficiency metrics (iterations to approval, rejection reasons)

### Milestone 6.3: System Health Monitoring

- [ ] Implement structured health checks for all services (Docker, Git, filesystem)
- [ ] Add process memory and CPU tracking with historical graphs
- [ ] Create system status dashboard with dependency health indicators
- [ ] Implement log aggregation with searchable log viewer and level filtering
- [ ] Add alerting for resource exhaustion (disk space, memory, container limits)
