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
