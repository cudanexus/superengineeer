/**
 * State Module Type Definitions
 * @module state-module
 */

declare module 'state-module' {
  /**
   * State change listener callback
   */
  type StateChangeListener = (newValue: any, oldValue: any, path: string) => void;

  /**
   * State manager interface
   */
  interface StateManager {
    /**
     * Get value by path
     * @param path - Dot-notation path (e.g., 'search.query'). If omitted, returns entire state
     * @returns The value at the path or undefined if not found
     */
    get(path?: string): any;

    /**
     * Set value by path
     * @param path - Dot-notation path
     * @param value - Value to set
     */
    set(path: string, value: any): void;

    /**
     * Update multiple values at once
     * @param updates - Object with path: value pairs
     */
    update(updates: Record<string, any>): void;

    /**
     * Reset state to defaults
     */
    reset(): void;

    /**
     * Subscribe to state changes
     * @param path - Path to watch (use '*' for all changes)
     * @param listener - Callback function
     */
    onChange(path: string, listener: StateChangeListener): void;

    /**
     * Unsubscribe from state changes
     * @param path - Path the listener was registered for
     * @param listener - Callback to remove
     */
    offChange(path: string, listener: StateChangeListener): void;

    /**
     * Get raw state object (deprecated)
     * @deprecated Use get() method instead
     * @returns The entire state object
     */
    getState(): Superengineer-v5.ApplicationState;
  }

  /**
   * Create the default application state
   * @returns Default state object with all initial values
   */
  export function createDefaultState(): Superengineer-v5.ApplicationState;

  /**
   * Create a state manager with change tracking
   * @param initialState - Optional initial state, defaults to createDefaultState()
   * @returns State manager interface
   */
  export function createStateManager(initialState?: Superengineer-v5.ApplicationState): StateManager;
}