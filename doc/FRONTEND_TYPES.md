# Frontend Type System Guide

## Overview

Claudito's frontend uses a TypeScript type system for JavaScript code, providing type safety without requiring a full TypeScript migration. This approach offers IDE support, type checking, and better documentation while maintaining compatibility with existing JavaScript code.

## Type System Structure

```
public/js/
├── types/                    # TypeScript type definitions
│   ├── index.d.ts           # Global types and ApplicationState
│   ├── api-responses.d.ts   # API response interfaces (70+ types)
│   ├── api-client.d.ts      # API client method signatures
│   ├── state-module.d.ts    # State management types
│   ├── websocket-module.d.ts # WebSocket types
│   └── jquery.d.ts          # jQuery type definitions
├── tsconfig.json            # TypeScript configuration
└── modules/                 # JavaScript modules with JSDoc
```

## Key Benefits

1. **Type Safety**: Catch errors during development
2. **IDE Support**: Full autocompletion and IntelliSense
3. **Documentation**: Types serve as living documentation
4. **Gradual Adoption**: No breaking changes to existing code
5. **No Runtime Impact**: Types are development-only

## Using Types in JavaScript

### Basic Type Annotations

```javascript
/**
 * @param {string} projectId - The project UUID
 * @returns {Promise<Claudito.API.Project>} The project details
 */
async function loadProject(projectId) {
  return await ApiClient.getProject(projectId);
}
```

### Working with Complex Types

```javascript
/**
 * Process agent status update
 * @param {Claudito.API.AgentStatus} status - Current agent status
 */
function handleAgentStatus(status) {
  if (status.running) {
    console.log(`Agent PID: ${status.pid}`);
    console.log(`Mode: ${status.mode}`); // 'interactive' | 'roadmap' | 'ralphLoop'
  }
}
```

### State Management Types

```javascript
/**
 * Update application state
 * @param {Partial<Claudito.ApplicationState>} updates
 */
function updateState(updates) {
  // TypeScript knows all valid properties
  if (updates.selectedProjectId) {
    // Handle project change
  }
}
```

## Common Type Patterns

### API Response Handling

```javascript
// Type annotations provide full IDE support
ApiClient.getProjects()
  .done(function(/** @type {Claudito.API.Project[]} */ projects) {
    projects.forEach(p => {
      // IDE knows p has: id, name, path, createdAt, updatedAt
    });
  })
  .fail(function(/** @type {JQueryXHR} */ xhr) {
    console.error('Failed:', xhr.statusText);
  });
```

### WebSocket Messages

```javascript
/**
 * @param {import('websocket-module').WebSocketMessage} message
 */
function handleWebSocketMessage(message) {
  switch (message.type) {
    case 'agent_message':
      // Handle agent output
      break;
    case 'agent_status':
      // Handle status change
      break;
  }
}
```

### Module Dependencies

```javascript
/**
 * Initialize module with dependencies
 * @param {Object} deps
 * @param {Claudito.ApplicationState} deps.state
 * @param {typeof import('./api-client')} deps.api
 * @param {Function} deps.escapeHtml
 */
function init(deps) {
  // Full type checking for all dependencies
}
```

## Type Checking

### Run Type Checking

```bash
# Check all frontend JavaScript files
npm run typecheck:frontend

# Type check during development
npm run typecheck
```

### Configuration

The `tsconfig.json` is configured for gradual adoption:

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strict": false,
    "noImplicitAny": false
  }
}
```

## Available Types

### Core Types

- `Claudito.ApplicationState` - Complete application state
- `Claudito.ModuleDependencies` - Common dependency injection interface

### API Response Types (70+)

- Project: `Project`, `ProjectStatus`
- Agent: `AgentStatus`, `ContextUsage`
- Roadmap: `Roadmap`, `Phase`, `Milestone`, `Task`
- Git: `GitStatus`, `FileChange`
- Ralph Loop: `RalphLoopState`
- Settings: `Settings`, `PromptTemplate`
- Conversations: `Conversation`, `Message`, `ToolUse`

### Module Types

- `StateManager` - State management interface
- `WebSocketManager` - WebSocket client interface
- `WebSocketMessage` - Message structure

## Best Practices

### 1. Always Read Files First

```javascript
// GOOD - Read file to understand structure
const projects = await ApiClient.getProjects();

// Type system knows structure from api-responses.d.ts
projects[0].id; // string
projects[0].name; // string
```

### 2. Use Specific Types

```javascript
// GOOD - Specific type
/** @param {Claudito.API.AgentStatus} status */

// BAD - Generic type
/** @param {Object} status */
```

### 3. Import Module Types

```javascript
// Import types from modules
/** @param {import('state-module').StateManager} stateManager */
/** @param {import('websocket-module').WebSocketManager} wsManager */
```

### 4. Document Return Types

```javascript
/**
 * Get current project
 * @returns {Claudito.API.Project | null} Current project or null
 */
function getCurrentProject() {
  const id = state.selectedProjectId;
  return id ? findProjectById(id) : null;
}
```

## Gradual Migration Path

1. **Phase 1**: Add JSDoc to exported functions (COMPLETE)
2. **Phase 2**: Create type definitions (COMPLETE)
3. **Phase 3**: Enable type checking (COMPLETE)
4. **Phase 4**: Fix type errors gradually
5. **Phase 5**: Consider TypeScript for new modules only

## Troubleshooting

### Common Issues

1. **jQuery Promise vs Native Promise**
   - jQuery returns `JQueryXHR`, not native `Promise`
   - Use `.done()/.fail()` instead of `.then()/.catch()`

2. **Missing Properties**
   - Check type definitions for exact property names
   - Use optional chaining for nullable properties

3. **Module Pattern Issues**
   - Ensure UMD pattern is correctly typed
   - Check global declarations in jquery.d.ts

### Type Checking Errors

```bash
# Too many errors? Focus on specific files:
npx tsc --noEmit --checkJs public/js/modules/api-client.js

# Check only type definitions:
npx tsc --noEmit public/js/types/*.d.ts
```

## Future Enhancements

1. **Runtime Validation**: Add Zod schemas for API responses
2. **Type Generation**: Generate types from backend OpenAPI
3. **Strict Mode**: Gradually enable stricter checks
4. **Module Types**: Add .d.ts for remaining modules
5. **Test Coverage**: Type checking in unit tests