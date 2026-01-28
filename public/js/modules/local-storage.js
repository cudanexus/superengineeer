/**
 * LocalStorage module for Claudito
 * Handles browser persistence with error handling
 */

(function(root, factory) {
  'use strict';

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.LocalStorage = factory();
  }
})(typeof window !== 'undefined' ? window : global, function() {
  'use strict';

  var LocalStorage = {};

  /**
   * Storage keys used by the application
   */
  LocalStorage.KEYS = {
    FONT_SIZE: 'claudito-font-size',
    ACTIVE_TAB: 'claudito-active-tab',
    SELECTED_PROJECT: 'claudito-selected-project',
    SCROLL_LOCK: 'claudito-scroll-lock',
    MILESTONE_EXPANDED: 'claudito-milestone-expanded'
  };

  /**
   * Save a value to localStorage
   * @param {string} key - Storage key
   * @param {*} value - Value to store (will be JSON serialized)
   * @returns {boolean} True if save succeeded
   */
  LocalStorage.save = function(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
      return false;
    }
  };

  /**
   * Load a value from localStorage
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} Parsed value or defaultValue
   */
  LocalStorage.load = function(key, defaultValue) {
    try {
      var stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch (e) {
      console.warn('Failed to load from localStorage:', e);
      return defaultValue;
    }
  };

  /**
   * Remove a key from localStorage
   * @param {string} key - Storage key to remove
   * @returns {boolean} True if remove succeeded
   */
  LocalStorage.remove = function(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('Failed to remove from localStorage:', e);
      return false;
    }
  };

  /**
   * Clear all claudito keys from localStorage
   * @returns {boolean} True if clear succeeded
   */
  LocalStorage.clear = function() {
    try {
      Object.keys(LocalStorage.KEYS).forEach(function(keyName) {
        localStorage.removeItem(LocalStorage.KEYS[keyName]);
      });
      return true;
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
      return false;
    }
  };

  /**
   * Check if localStorage is available
   * @returns {boolean} True if localStorage is available
   */
  LocalStorage.isAvailable = function() {
    try {
      var testKey = '__claudito_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  };

  return LocalStorage;
});
