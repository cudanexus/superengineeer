# JSDoc Standards Guide

This guide outlines JSDoc standards and best practices for the Claudito frontend codebase.

## Table of Contents

- [Basic Syntax](#basic-syntax)
- [Function Documentation](#function-documentation)
- [Type Annotations](#type-annotations)
- [Module Documentation](#module-documentation)
- [Custom Types](#custom-types)
- [Best Practices](#best-practices)
- [Common Patterns](#common-patterns)

## Basic Syntax

### Function Documentation

```javascript
/**
 * Brief description of what the function does.
 * Additional details can go on subsequent lines.
 *
 * @function functionName
 * @memberof module:ModuleName
 * @param {string} param1 - Description of first parameter
 * @param {number} [param2=10] - Optional parameter with default
 * @param {Object} options - Configuration object
 * @param {boolean} options.flag - Nested property description
 * @returns {Promise<string>} Description of return value
 * @throws {Error} When validation fails
 * @example
 * const result = await functionName('test', 20, { flag: true });
 * console.log(result); // 'success'
 */
function functionName(param1, param2, options) {
  // Implementation
}
```

### Variable Documentation

```javascript
/**
 * @type {string}
 * @description API base URL for all requests
 */
const baseUrl = '';

/**
 * @type {Claudito.ApplicationState}
 * @description Current application state
 */
let state = createDefaultState();
```

## Type Annotations

### Primitive Types

```javascript
/**
 * @param {string} name - User name
 * @param {number} age - User age
 * @param {boolean} active - Whether user is active
 * @param {null} data - Explicitly null value
 * @param {undefined} optional - Explicitly undefined
 * @param {*} anything - Any type (avoid if possible)
 */
```

### Object Types

```javascript
/**
 * @param {Object} config - Configuration object
 * @param {string} config.host - Server host
 * @param {number} config.port - Server port
 * @param {boolean} [config.secure=false] - Use HTTPS
 */

/**
 * @param {{name: string, age: number}} user - Inline object type
 */
```

### Array Types

```javascript
/**
 * @param {string[]} names - Array of strings
 * @param {Array<number>} scores - Array of numbers (alternate syntax)
 * @param {Claudito.API.Project[]} projects - Array of custom types
 */
```

### Function Types

```javascript
/**
 * @callback EventHandler
 * @param {Event} event - The event object
 * @returns {void}
 */

/**
 * @param {EventHandler} handler - Event handler function
 * @param {(value: string) => boolean} validator - Inline function type
 */
```

### Union Types

```javascript
/**
 * @param {string|number} id - Can be string or number
 * @param {'success'|'error'|'warning'} type - String literals
 * @param {HTMLElement|null} element - Element or null
 */
```

### Promise Types

```javascript
/**
 * @returns {Promise<string>} Resolves with result string
 * @returns {Promise<void>} Resolves when complete
 * @returns {Promise<Claudito.API.Project[]>} Resolves with projects
 */
```

### jQuery Types

```javascript
/**
 * @returns {JQueryXHR<Claudito.API.Project>} jQuery promise
 * @param {JQuery} $element - jQuery wrapped element
 * @param {JQueryAjaxSettings} settings - Ajax settings
 */
```

## Module Documentation

### Module Header

```javascript
/**
 * @module ApiClient
 * @description HTTP API wrapper for all backend endpoints
 * @requires jquery
 * @requires ./utils
 * @example
 * import ApiClient from './api-client';
 * const projects = await ApiClient.getProjects();
 */
```

### Namespace Documentation

```javascript
/**
 * @namespace Claudito.API
 * @description API response type definitions
 */
```

## Custom Types

### Type Definitions

```javascript
/**
 * @typedef {Object} UserProfile
 * @property {string} id - User ID
 * @property {string} name - Display name
 * @property {string} email - Email address
 * @property {boolean} [verified=false] - Email verified status
 */

/**
 * @param {UserProfile} profile - User profile object
 */
```

### Importing Types

```javascript
/**
 * @param {import('./types').StateManager} stateManager
 * @param {import('websocket-module').WebSocketMessage} message
 */
```

### Using Claudito Types

```javascript
/**
 * @param {Claudito.ApplicationState} state - App state
 * @param {Claudito.API.Project} project - Project data
 * @param {Claudito.API.AgentStatus} status - Agent status
 */
```

## Best Practices

### 1. Be Specific

```javascript
// GOOD - Specific types
/** @param {Claudito.API.Project[]} projects */
/** @returns {Promise<string>} */

// BAD - Generic types
/** @param {Array} projects */
/** @returns {Promise} */
```

### 2. Document Edge Cases

```javascript
/**
 * Parse configuration file
 * @param {string} path - Path to config file
 * @returns {Object} Parsed configuration
 * @returns {null} If file doesn't exist
 * @throws {SyntaxError} If JSON is invalid
 */
```

### 3. Use Optional Parameters

```javascript
/**
 * @param {string} required - Always required
 * @param {number} [optional] - May be omitted
 * @param {boolean} [flag=true] - Optional with default
 */
```

### 4. Document Complex Returns

```javascript
/**
 * @returns {{
 *   success: boolean,
 *   data?: any,
 *   error?: string
 * }} Operation result
 */
```

### 5. Add Examples

```javascript
/**
 * Format file size for display
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 * @example
 * formatFileSize(1024); // "1.0 KB"
 * formatFileSize(1048576); // "1.0 MB"
 */
```

## Common Patterns

### Event Handlers

```javascript
/**
 * Handle button click
 * @param {MouseEvent} event - Click event
 * @returns {void}
 */
function handleClick(event) {
  event.preventDefault();
}
```

### Async Functions

```javascript
/**
 * Load project data
 * @async
 * @param {string} projectId - Project ID
 * @returns {Promise<Claudito.API.Project>} Project data
 * @throws {Error} If project not found
 */
async function loadProject(projectId) {
  // Implementation
}
```

### Module Initialization

```javascript
/**
 * Initialize module with dependencies
 * @param {Object} deps - Dependencies
 * @param {Claudito.ApplicationState} deps.state - App state
 * @param {typeof import('./api-client')} deps.api - API client
 * @param {Function} deps.escapeHtml - HTML escape function
 * @returns {void}
 */
function init(deps) {
  // Store dependencies
}
```

### jQuery Plugin Pattern

```javascript
/**
 * Initialize tabs on element
 * @param {JQuery} $element - Target element
 * @param {Object} [options] - Tab options
 * @param {boolean} [options.animation=true] - Enable animations
 * @returns {JQuery} For chaining
 */
function initTabs($element, options) {
  // Implementation
  return $element;
}
```

### Error Handling

```javascript
/**
 * Validate project name
 * @param {string} name - Project name
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateProjectName(name) {
  if (!name) {
    return { valid: false, error: 'Name is required' };
  }
  return { valid: true };
}
```

## IDE Integration

### VSCode Settings

Add to `.vscode/settings.json`:

```json
{
  "javascript.suggest.completeJSDocs": true,
  "javascript.validate.enable": true,
  "typescript.validate.enable": true,
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### Type Checking in VSCode

Add to the top of JavaScript files:

```javascript
// @ts-check
```

Or configure in `jsconfig.json`:

```json
{
  "compilerOptions": {
    "checkJs": true
  }
}
```

## Migration Tips

### Converting Existing Code

Before:
```javascript
function getProject(id) {
  return $.get('/api/projects/' + id);
}
```

After:
```javascript
/**
 * Get project by ID
 * @function getProject
 * @memberof module:ApiClient
 * @param {string} id - Project UUID
 * @returns {JQueryXHR<Claudito.API.Project>} Project data
 * @throws {Error} If project not found (404)
 * @example
 * const project = await ApiClient.getProject('123-456');
 * console.log(project.name);
 */
function getProject(id) {
  return $.get('/api/projects/' + id);
}
```

### Adding Types Gradually

1. Start with exported functions
2. Add parameter types
3. Add return types
4. Document edge cases
5. Add examples

## Validation

Run JSDoc validation:

```bash
# Check JSDoc syntax
jsdoc -c jsdoc.json --explain

# Generate documentation
jsdoc -c jsdoc.json -d docs/

# Type check with TypeScript
npm run typecheck:frontend
```

## Resources

- [JSDoc Documentation](https://jsdoc.app/)
- [TypeScript JSDoc Reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
- [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html#jsdoc)