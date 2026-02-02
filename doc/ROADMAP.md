# Claudito Roadmap

## Phase 1: Ralph Loop Implementation (Completed)

Implement the Ralph Loop pattern based on Geoffrey Huntley's Ralph Wiggum technique - an iterative development pattern that solves context accumulation by starting each iteration with fresh context and using cross-model review.

### Milestone 1.1: Ralph Loop Core Architecture

- [x] Design RalphLoop service interface with worker/reviewer model separation
- [x] Create iteration state persistence layer (summary files, feedback files)
- [x] Implement fresh context initialization for each iteration
- [x] Add iteration tracking with configurable max turns
- [x] Create RalphLoopConfig interface (maxTurns, workerModel, reviewerModel, taskDescription)

### Milestone 1.2: Worker Agent Implementation

- [x] Create WorkerAgent class that reads previous iteration summaries
- [x] Implement task execution with summary generation after each iteration
- [x] Add structured output format for iteration results
- [x] Create file persistence for worker summaries (`.claudito/ralph/{taskId}/worker-summary.json`)
- [x] Implement worker completion detection (success/failure/needs-review)

### Milestone 1.3: Reviewer Agent Implementation

- [x] Create ReviewerAgent class that reads worker output and previous feedback
- [x] Implement code review logic with structured feedback format
- [x] Add review criteria configuration (correctness, completeness, code quality)
- [x] Create file persistence for reviewer feedback (`.claudito/ralph/{taskId}/reviewer-feedback.json`)
- [x] Implement review decision output (approve/reject with specific feedback)

### Milestone 1.4: Ralph Loop Orchestration

- [x] Implement RalphLoopManager to coordinate worker/reviewer cycles
- [x] Add loop termination conditions (max turns, approval, critical failure)
- [x] Create WebSocket events for loop progress (iteration_start, worker_complete, review_complete)
- [x] Implement graceful loop interruption and resume capability
- [x] Add loop history and metrics tracking

### Milestone 1.5: Ralph Loop API & WebSocket

- [x] Add REST API endpoints for Ralph Loop operations (start, stop, pause, resume, list, get, delete)
- [x] Add WebSocket message types for real-time updates (status, iteration, output, complete)
- [x] Integrate RalphLoopService with WebSocketServer
- [x] Add Ralph Loop API client methods in frontend
- [x] Add backend route tests
- [x] Add WebSocket integration tests

### Milestone 1.6: Ralph Loop Frontend UI

- [x] Create ralph-loop-module.js frontend module
- [x] Add Ralph Loop tab to project view
- [x] Implement task configuration form (description, max turns, model selection)
- [x] Add Start/Pause/Resume/Stop controls
- [x] Display real-time iteration progress
- [x] Show worker and reviewer output streams
- [x] Create Ralph Loop history view with delete functionality
- [x] Add comprehensive frontend tests

## Phase 2: Model Selection (Completed)

Allow users to choose which Claude model to use for agents, with proper session management.

### Milestone 2.1: Model Configuration Backend

- [x] Add model selection to SettingsRepository (default model preference)
- [x] Add per-project model override in ProjectRepository
- [x] Create model validation (supported models list from Claude API)
- [x] Update ClaudeAgent to accept model parameter via `--model` flag
- [x] Implement agent restart when model changes mid-session

### Milestone 2.2: Model Selection UI

- [x] Add model dropdown in global settings
- [x] Add model override option in project settings (header selector)
- [x] Display current model in agent status area (tooltip shows effective model)
- [x] Add model indicator in project header
- [x] Show toast notification when model changes

## Phase 3: Critical Security & Architecture Fixes (In Progress)

Address critical security vulnerabilities and architectural improvements identified through comprehensive code quality analysis.

### Milestone 3.1: Security Vulnerability Fixes (Completed)

- [x] Fix path traversal vulnerability in src/routes/projects.ts
- [x] Fix shell command injection in src/agents/claude-agent.ts and Ralph Loop agents
- [x] Create comprehensive input validation middleware
- [x] Create project validation middleware for common patterns

### Milestone 3.2: Split Large Files

Break down files exceeding 1000 lines to improve maintainability and adhere to CLAUDE.md guidelines.

- [ ] Split src/agents/agent-manager.ts (1307 lines) into 5 focused modules:
  - [ ] agent-manager.ts - Core lifecycle only (<300 lines)
  - [ ] agent-queue.ts - Queue management
  - [ ] session-manager.ts - Session handling
  - [ ] autonomous-loop-orchestrator.ts - Loop logic
  - [ ] process-tracker.ts - PID tracking
- [ ] Split src/agents/claude-agent.ts (1714 lines) - Extract stream handling
- [ ] Split src/routes/projects.ts (1958 lines) into 6 sub-routers:
  - [ ] projects/index.ts - Router aggregator
  - [ ] projects/core.ts - Core operations
  - [ ] projects/roadmap.ts - Roadmap operations
  - [ ] projects/agent.ts - Agent operations
  - [ ] projects/conversation.ts - Conversation operations
  - [ ] projects/ralph-loop.ts - Ralph Loop operations
  - [ ] projects/shell.ts - Shell operations

### Milestone 3.3: Apply Validation Middleware

Integrate the new validation middleware throughout the application.

- [ ] Apply request validators to all POST/PUT endpoints
- [ ] Apply project validator middleware to reduce duplication
- [ ] Apply numeric parameter validation where needed
- [ ] Add rate limiting middleware for expensive operations

## Phase 4: Code Quality Improvements

Refactor code to meet quality standards and improve maintainability.

### Milestone 4.1: Refactor Large Functions

Break down functions exceeding 50 lines as per CLAUDE.md guidelines.

- [ ] Refactor handleStreamEvent in claude-agent.ts (168 lines)
  - [ ] Create handler map pattern
  - [ ] Extract each event type to its own method
- [ ] Refactor start() method in claude-agent.ts (116 lines)
  - [ ] Extract validation logic
  - [ ] Extract initialization logic
  - [ ] Extract process spawning logic
- [ ] Refactor Ralph Loop service methods exceeding 50 lines

### Milestone 4.2: Improve Error Handling

Replace silent error suppression with proper logging and error handling.

- [ ] Create ErrorLogger utility class
- [ ] Replace all silent catch blocks with logged operations
- [ ] Add proper error context to all error logs
- [ ] Implement retry logic for transient failures

### Milestone 4.3: Performance Optimizations

Optimize data structures and operations for better performance.

- [ ] Optimize agent queue lookup from O(n) to O(1) using Set
- [ ] Implement filesystem cache for frequently read files
- [ ] Add request timeouts to prevent hanging operations
- [ ] Optimize string concatenation in output collection

## Phase 5: Frontend Improvements

Enhance frontend code quality, fix memory leaks, and add proper testing.

### Milestone 5.1: Fix Memory Leaks

Address memory leaks in frontend JavaScript code.

- [ ] Track and cleanup event handlers in file-browser.js
- [ ] Fix WebSocket reconnection memory accumulation
- [ ] Implement proper cleanup for dynamic DOM elements
- [ ] Add cleanup for deeply nested file trees

### Milestone 5.2: Add Frontend Type Safety

Improve frontend code maintainability with type definitions.

- [ ] Create TypeScript definitions for all modules
- [ ] Add JSDoc comments to all public functions
- [ ] Document module dependencies and interfaces
- [ ] Create type definitions for API responses

### Milestone 5.3: Frontend Testing

Establish comprehensive frontend testing infrastructure.

- [ ] Set up Jest for frontend testing
- [ ] Create unit tests for all modules (target 60% coverage)
- [ ] Add integration tests for API client
- [ ] Add E2E tests for critical user workflows

## Phase 6: Documentation & Testing

Complete documentation and establish comprehensive testing coverage.

### Milestone 6.1: Documentation

Create and update documentation to reflect current state.

- [ ] Create ARCHITECTURE.md with system diagrams
- [ ] Create SECURITY.md with security considerations
- [ ] Update README.md with current features
- [ ] Add JSDoc comments to complex functions
- [ ] Create API documentation
- [ ] Document testing procedures

### Milestone 6.2: Backend Testing

Enhance backend test coverage to 80%+.

- [ ] Add missing unit tests for untested services
- [ ] Create integration tests for WebSocket communication
- [ ] Add tests for error handling paths
- [ ] Create performance benchmarks for critical paths

### Milestone 6.3: Monitoring & Metrics

Implement monitoring for production stability.

- [ ] Add performance metrics collection
- [ ] Implement error rate monitoring
- [ ] Create health check endpoints
- [ ] Add resource usage tracking
- [ ] Implement alerting for critical failures
