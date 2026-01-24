# Claudito - Project Roadmap

A Claude Code autonomous agent manager that allows running and monitoring multiple Claude agents across different projects.

---

## Phase 1: COMPLETE

## Phase 2: Interactive Claude Mode (CLI Experience) - COMPLETE

Make interactive Claude usage the default project experience, matching the Claude Code CLI.

### Milestone 2.1: Interactive Input Interface
- [x] Add textarea input at bottom of project view for sending messages to Claude
- [x] Support configurable keybindings (Ctrl+Enter or Enter to send)
- [x] Add send button with loading state while Claude is processing
- [x] Auto-start agent when sending first message in interactive mode
- [x] Disable Start/Stop button for interactive mode (auto-managed)

### Milestone 2.2: Real-Time Output Streaming
- [x] Stream Claude output in real-time via WebSocket (same as CLI experience)
- [x] Auto-scroll to bottom as new output arrives (with manual scroll override)
- [x] Preserve output formatting (code blocks, lists, etc.)

### Milestone 2.3: Tool Usage Display
- [x] Parse and display tool invocations (Read, Write, Edit, Bash, Glob, Grep, etc.)
- [x] Show tool name with icon/badge for each tool call
- [x] Display tool arguments in structured, collapsible format
- [x] Syntax highlight file paths and code in arguments
- [x] Show tool execution status (running, completed, failed)

### Milestone 2.4: Code Diff Visualization
- [x] Parse Edit tool calls to extract old_string and new_string
- [x] Render inline diff view with additions (green) and deletions (red)
- [x] Show file path and context for each edit

### Milestone 2.5: Interactive Question Handling
- [x] Detect when Claude asks a question (AskUserQuestion tool)
- [x] Display question options as clickable buttons
- [x] Support text input for "Other" option responses
- [x] Send user response back to Claude agent
- [x] Show clear visual indicator when Claude is awaiting user input

### Milestone 2.6: Permission Request Handling
- [x] Detect permission requests from Claude (file edits, bash commands, etc.)
- [x] Display permission request with details of the action
- [x] Add Approve/Deny buttons for each request
- [x] Support "Always allow" option for specific tool types
- [x] Show pending permissions clearly in UI

### Milestone 2.7: Session Management
- [x] Make interactive mode the default project view
- [x] Persist conversation history across page refreshes
- [x] Add "New Conversation" button to start fresh session
- [x] Display conversation list in sidebar for history navigation
- [x] Show active/inactive session status

### Milestone 2.8: Project Files Tab
- [x] Add tabbed interface (Agent Output / Project Files)
- [x] Implement file browser tree with directory expansion
- [x] Support multiple open files with tabs
- [x] File editor with save functionality (Ctrl+S)
- [x] Detect editable text file types
- [x] Unsaved changes indicator

---
