/**
 * Escape Utilities Module
 * Pure functions for escaping strings for various contexts
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EscapeUtils = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} HTML-escaped text
   */
  function escapeHtml(text) {
    if (typeof document !== 'undefined') {
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Fallback for Node.js environment
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Escape special characters for use in a regular expression
   * @param {string} string - String to escape
   * @returns {string} Regex-escaped string
   */
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return {
    escapeHtml: escapeHtml,
    escapeRegExp: escapeRegExp
  };
}));
