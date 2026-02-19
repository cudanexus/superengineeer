# Frontend Type System

This directory contains TypeScript type definitions for the Superengineer frontend JavaScript codebase.

## Overview

The type system provides:
- Full TypeScript support for all API methods
- Type safety for application state management
- WebSocket message type definitions
- IDE autocompletion and IntelliSense
- Type checking without requiring TypeScript migration

## Structure

```
types/
├── index.d.ts           # Global types and ApplicationState
├── api-responses.d.ts   # API response interfaces
├── api-client.d.ts      # API client method signatures
├── state-module.d.ts    # State management types
├── websocket-module.d.ts # WebSocket types
└── README.md           # This file
```

## Type Files

### `index.d.ts`
- Defines the global `Superengineer` namespace
- Contains the `ApplicationState` interface with all state properties
- Defines common dependency injection patterns

### `api-responses.d.ts`
- Contains all API response type definitions
- Organized by feature area (Projects, Agent, Git, etc.)
- 70+ interface definitions

### Module Type Definitions
- `api-client.d.ts` - HTTP API client types
- `state-module.d.ts` - State management types
- `websocket-module.d.ts` - WebSocket communication types

## Usage

### In JavaScript Files

Add JSDoc type annotations to get type checking:

```javascript
/**
 * @param {string} projectId
 * @returns {Promise<Superengineer.API.Project>}
 */
async function loadProject(projectId) {
  return await ApiClient.getProject(projectId);
}
```

### Type Checking

Run type checking from the project root:

```bash
npm run typecheck:frontend
```

This will check all JavaScript files against the type definitions without compiling.

**Note**: Due to jQuery's promise implementation differing from native Promises, you may see type errors when using `@returns {Promise<T>}`. Use `@returns {JQueryXHR<T>}` for jQuery AJAX methods or adjust the return type documentation accordingly.

### IDE Support

Most modern IDEs (VSCode, WebStorm) will automatically use these type definitions to provide:
- Autocompletion
- Parameter hints
- Type information on hover
- Error highlighting

## Adding New Types

1. **API Response Types**: Add to `api-responses.d.ts` in the appropriate section
2. **State Properties**: Add to the `ApplicationState` interface in `index.d.ts`
3. **Module Functions**: Add to the respective module `.d.ts` file

## Conventions

1. **Naming**: Use PascalCase for interfaces, camelCase for properties
2. **Organization**: Group related types together
3. **Documentation**: Add JSDoc comments for complex types
4. **Optional Properties**: Mark with `?` when the property may be undefined
5. **Arrays**: Use `Array<T>` syntax for clarity

## Benefits

1. **Type Safety**: Catch type mismatches during development
2. **Documentation**: Types serve as living documentation
3. **Refactoring**: Safely rename and restructure code
4. **Developer Experience**: Better IDE support and autocompletion
5. **No Runtime Impact**: Types are development-only

## Gradual Adoption

The type system is designed for gradual adoption:
- Existing JavaScript code continues to work
- Add types incrementally as needed
- No compilation step required
- Types are optional but recommended