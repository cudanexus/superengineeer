# Claudito Roadmap

## Phase 1: Frontend Refactoring

Extract testable modules from the monolithic app.js (9,738 lines) to improve maintainability and test coverage.

### Milestone 1.1: Pure Utilities (Completed)

- [x] Create public/js/modules/ directory
- [x] Extract local-storage.js module (~50 lines, 40 tests)
- [x] Extract diff-engine.js module (~570 lines, 72 tests)
- [x] Extract api-client.js module (~335 lines, 68 tests)
- [x] Update app.js to use new modules
- [x] Update index.html script loading order

### Milestone 1.2: State Layer

- [ ] Extract state-manager.js module (~200 lines, ~30 tests)
- [ ] Implement centralized state with pub/sub pattern
- [ ] Migrate state reads in app.js to StateManager.get()
- [ ] Migrate state writes in app.js to StateManager.set()
- [ ] Verify app still works after migration

### Milestone 1.3: Business Logic Modules

- [ ] Extract search-engine.js module (~320 lines, ~25 tests)
- [ ] Extract message-renderer.js module (~530 lines, ~45 tests)
- [ ] Extract websocket-client.js module (~380 lines, ~25 tests)
- [ ] Update app.js to use new modules
- [ ] Verify app still works after migration

### Milestone 1.4: Feature Modules

- [ ] Extract roadmap-renderer.js module (~260 lines, ~20 tests)
- [ ] Extract file-browser.js module (~550 lines, ~25 tests)
- [ ] Extract git-module.js module (~800 lines, ~30 tests)
- [ ] Update app.js to use new modules
- [ ] Final verification and cleanup

## Phase 2: Autonomous Loop UI

Complete the autonomous mode with full UI controls.

### Milestone 2.1: Autonomous Loop Controls

- [ ] Add Start Autonomous Loop button in project view
- [ ] Add Pause/Resume controls for running loop
- [ ] Display current milestone being processed
- [ ] Show loop progress indicator (items completed / total)
- [ ] Add Stop Autonomous Loop button

### Milestone 2.2: Autonomous Loop Feedback

- [ ] Display failure reasons when loop pauses
- [ ] Add Retry Failed Item button
- [ ] Show milestone completion notifications
- [ ] Add loop history/log view
- [ ] Display estimated context usage per item

### Milestone 2.3: Autonomous Loop Reliability

- [ ] Implement graceful handling of agent crashes during loop
- [ ] Add timeout handling for stuck agents
- [ ] Create recovery mechanism for interrupted loops
- [ ] Implement rate limiting between items
- [ ] Add option to skip failed items and continue

## Phase 3: Default Permission Mode Support

Add support for Claude's interactive permission prompts.

### Milestone 3.1: Permission Prompt Protocol

- [ ] Research Claude Code CLI permission prompt format
- [ ] Design UI for displaying permission requests
- [ ] Implement permission prompt detection in agent output parser
- [ ] Create permission request event emission

### Milestone 3.2: Permission Prompt UI

- [ ] Display permission prompts in agent output area
- [ ] Add Allow/Deny buttons for permission requests
- [ ] Add "Always Allow" option for specific tools
- [ ] Add "Always Deny" option for specific tools
- [ ] Show pending permission indicator in sidebar

### Milestone 3.3: Permission Memory

- [ ] Store permission decisions in session
- [ ] Option to save decisions to project permission rules
- [ ] Display history of permission decisions
- [ ] Add bulk permission management

## Phase 4: Conversation Management

Enhanced conversation features.

### Milestone 4.1: Export/Import Conversations

- [ ] Export conversation to Markdown format
- [ ] Export conversation to JSON format
- [ ] Import conversation from JSON
- [ ] Export all project conversations as archive

### Milestone 4.2: Conversation Branching

- [ ] Fork conversation at any message
- [ ] Display branch indicator in conversation list
- [ ] Switch between conversation branches
- [ ] Compare branches side-by-side
- [ ] Merge learnings from branches

## Phase 5: Theme Support

Add visual customization options.

### Milestone 5.1: Light Mode

- [ ] Create light mode color palette
- [ ] Add theme toggle in settings
- [ ] Persist theme preference
- [ ] Update all UI components for light mode
- [ ] Ensure syntax highlighting works in both modes

### Milestone 5.2: Custom Themes

- [ ] Define theme schema (colors, fonts, spacing)
- [ ] Add theme customization UI
- [ ] Import/export custom themes
- [ ] Add preset themes (high contrast, sepia, etc.)

## Phase 6: Agent Templates & Presets

Quick-start configurations for common tasks.

### Milestone 6.1: Agent Templates

- [ ] Create template schema (name, description, prompt, settings)
- [ ] Add built-in templates (debugging, refactoring, testing, code review)
- [ ] Template selection UI when starting agent
- [ ] Custom template creation
- [ ] Template import/export

### Milestone 6.2: Agent Presets

- [ ] Save current settings as preset (permission mode, system prompt, rules)
- [ ] Quick-switch between presets
- [ ] Per-project default preset
- [ ] Preset management UI

## Phase 7: Search & Navigation

Improved output navigation and search.

### Milestone 7.1: Search in Output

- [x] Add search input in agent output header
- [x] Highlight search matches in output
- [x] Navigate between matches (next/previous)
- [x] Filter output by message type (user, assistant, tool, system)
- [x] Search across conversation history

### Milestone 7.2: Keyboard Shortcuts

- [ ] Define keyboard shortcut schema
- [ ] Implement global hotkeys (Ctrl+K search, Escape cancel, etc.)
- [ ] Add shortcut for stop agent
- [ ] Add shortcut for toggle sidebar
- [ ] Add shortcut for switch tabs
- [ ] Keyboard shortcut customization UI
- [ ] Display keyboard shortcut hints in UI

## Phase 8: Multi-Project Features

Enhanced multi-project management.

### Milestone 8.1: Multi-Project Dashboard

- [ ] Create dashboard view showing all projects
- [ ] Display agent status for each project
- [ ] Show recent activity per project
- [ ] Quick actions from dashboard (start/stop agent)
- [ ] Project grouping/folders

### Milestone 8.2: Cross-Project Search

- [ ] Search conversations across all projects
- [ ] Search in project files across all projects
- [ ] Display unified search results
- [ ] Jump to result in context

## Phase 9: Notifications & Webhooks

External integrations and alerts.

### Milestone 9.1: Desktop Notifications Enhancement

- [ ] Notification when autonomous loop completes
- [ ] Notification when agent encounters error
- [ ] Notification sound options
- [ ] Notification grouping for multiple events
- [ ] Do Not Disturb mode

### Milestone 9.2: Webhook Integration

- [ ] Define webhook event types (agent_complete, agent_error, milestone_done)
- [ ] Webhook configuration UI
- [ ] Test webhook button
- [ ] Webhook history/logs
- [ ] Retry failed webhooks

### Milestone 9.3: Chat Integrations

- [ ] Slack notification integration
- [ ] Discord notification integration
- [ ] Custom webhook templates for chat services

## Phase 10: Plugin System

Extensibility framework.

### Milestone 10.1: Plugin Architecture

- [ ] Define plugin API (hooks, events, UI extensions)
- [ ] Create plugin loader
- [ ] Plugin manifest schema
- [ ] Plugin isolation/sandboxing

### Milestone 10.2: Built-in Plugin Types

- [ ] Custom output formatters
- [ ] Custom tool visualizations
- [ ] Custom file type handlers
- [ ] Custom syntax highlighters

### Milestone 10.3: Plugin Management

- [ ] Plugin installation from file
- [ ] Plugin enable/disable
- [ ] Plugin configuration UI
- [ ] Plugin marketplace (future)
