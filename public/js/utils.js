/**
 * Utility functions for the Superengineer frontend
 * These are pure functions that can be unit tested without DOM dependencies
 */

(function(global) {
  'use strict';

  var Utils = {};

  // ============================================================
  // String Utilities
  // ============================================================

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML string
   */
  Utils.escapeHtml = function(text) {
    if (text === null || text === undefined) return '';

    var str = String(text);

    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  /**
   * Escape special regex characters in a string
   * @param {string} string - String to escape
   * @returns {string} Escaped string safe for use in RegExp
   */
  Utils.escapeRegExp = function(string) {
    if (!string) return '';

    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  /**
   * Capitalize the first character of a string
   * @param {string} str - String to capitalize
   * @returns {string} String with first character uppercase
   */
  Utils.capitalizeFirst = function(str) {
    if (!str) return '';

    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // ============================================================
  // Formatting Utilities
  // ============================================================

  /**
   * Format bytes into human-readable file size
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted file size (e.g., "1.5 KB")
   */
  Utils.formatFileSize = function(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes || bytes < 0) return '0 B';

    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));

    // Clamp to available units
    i = Math.min(i, units.length - 1);

    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  };

  /**
   * Format large numbers with K/M suffixes
   * @param {number} num - Number to format
   * @returns {string} Formatted number (e.g., "1.5K", "2.3M")
   */
  Utils.formatNumber = function(num) {
    if (num === undefined || num === null) return '0';
    if (typeof num !== 'number') return '0';

    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }

    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }

    return num.toLocaleString();
  };

  /**
   * Get text color class based on percentage
   * @param {number} percent - Percentage value (0-100+)
   * @returns {string} Tailwind CSS text color class
   */
  Utils.getPercentColor = function(percent) {
    if (percent < 50) return 'text-green-400';
    if (percent < 75) return 'text-yellow-400';
    if (percent < 90) return 'text-orange-400';

    return 'text-red-400';
  };

  /**
   * Get background color class based on percentage
   * @param {number} percent - Percentage value (0-100+)
   * @returns {string} Tailwind CSS background color class
   */
  Utils.getPercentBarColor = function(percent) {
    if (percent < 50) return 'bg-green-500';
    if (percent < 75) return 'bg-yellow-500';
    if (percent < 90) return 'bg-orange-500';

    return 'bg-red-500';
  };

  // ============================================================
  // Validation Utilities
  // ============================================================

  /**
   * Validate a file name for common restrictions
   * @param {string} name - File name to validate
   * @returns {{valid: boolean, error: string|null}} Validation result
   */
  Utils.validateFileName = function(name) {
    if (!name || name.trim() === '') {
      return { valid: false, error: 'File name cannot be empty' };
    }

    var trimmed = name.trim();

    // Check for file name being just a dot (before checking trailing dot)
    if (trimmed === '.') {
      return { valid: false, error: 'File name cannot be just a dot' };
    }

    // Check for trailing space or dot on original input (before trimming)
    if (name.endsWith(' ') || name.endsWith('.')) {
      return { valid: false, error: 'File name cannot end with a space or dot' };
    }

    // Check for invalid characters (Windows restrictions cover most cases)
    var invalidChars = /[<>:"/\\|?*\x00-\x1f]/;

    if (invalidChars.test(trimmed)) {
      return { valid: false, error: 'File name contains invalid characters' };
    }

    // Check for reserved names (Windows)
    var reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

    if (reserved.test(trimmed)) {
      return { valid: false, error: 'File name is reserved by the system' };
    }

    return { valid: true, error: null };
  };

  /**
   * Validate a folder name for common restrictions
   * @param {string} name - Folder name to validate
   * @returns {{valid: boolean, error: string|null}} Validation result
   */
  Utils.validateFolderName = function(name) {
    if (!name || name.trim() === '') {
      return { valid: false, error: 'Folder name cannot be empty' };
    }

    // Check for trailing space on original input (before trimming)
    if (name.endsWith(' ')) {
      return { valid: false, error: 'Folder name cannot end with a space' };
    }

    var trimmed = name.trim();

    // Check for invalid characters (Windows restrictions cover most cases)
    var invalidChars = /[<>:"/\\|?*\x00-\x1f]/;

    if (invalidChars.test(trimmed)) {
      return { valid: false, error: 'Folder name contains invalid characters' };
    }

    // Check for reserved names (Windows)
    var reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

    if (reserved.test(trimmed)) {
      return { valid: false, error: 'Folder name is reserved by the system' };
    }

    // Check for folder name being just dots
    if (trimmed === '.' || trimmed === '..') {
      return { valid: false, error: 'Folder name cannot be just dots' };
    }

    return { valid: true, error: null };
  };

  // ============================================================
  // Diff Parsing Utilities
  // ============================================================

  /**
   * Parse unified diff format into aligned diff structure
   * @param {string} diffText - Unified diff text
   * @returns {Array<{left: string, right: string, type: string}>} Aligned diff lines
   */
  Utils.parseUnifiedDiff = function(diffText) {
    if (!diffText || diffText.trim() === '') {
      return [];
    }

    var lines = diffText.split('\n');
    var aligned = [];
    var pendingRemoves = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Skip diff headers (---, +++, @@)
      if (line.startsWith('diff --git') ||
          line.startsWith('index ') ||
          line.startsWith('--- ') ||
          line.startsWith('+++ ') ||
          line.startsWith('@@') ||
          line.startsWith('\\ No newline')) {
        continue;
      }

      if (line.startsWith('-')) {
        // Removed line - queue it for potential pairing
        pendingRemoves.push(line.substring(1));
      } else if (line.startsWith('+')) {
        // Added line
        if (pendingRemoves.length > 0) {
          // Pair with a pending remove as a "change"
          var oldContent = pendingRemoves.shift();
          var newContent = line.substring(1);

          aligned.push({
            left: oldContent,
            right: newContent,
            type: 'change'
          });
        } else {
          aligned.push({ left: '', right: line.substring(1), type: 'add' });
        }
      } else if (line.startsWith(' ')) {
        // Flush any pending removes first
        while (pendingRemoves.length > 0) {
          aligned.push({ left: pendingRemoves.shift(), right: '', type: 'remove' });
        }

        // Context line (unchanged)
        aligned.push({ left: line.substring(1), right: line.substring(1), type: 'unchanged' });
      } else if (line === '') {
        // Empty line in diff output - flush pending removes
        while (pendingRemoves.length > 0) {
          aligned.push({ left: pendingRemoves.shift(), right: '', type: 'remove' });
        }
      }
    }

    // Flush any remaining pending removes
    while (pendingRemoves.length > 0) {
      aligned.push({ left: pendingRemoves.shift(), right: '', type: 'remove' });
    }

    return aligned;
  };

  // ============================================================
  // Project Sorting
  // ============================================================

  /**
   * Sort projects with running/queued first, then alphabetically
   * @param {Array} projects - Array of project objects
   * @returns {Array} Sorted copy of projects array
   */
  Utils.sortProjects = function(projects) {
    if (!Array.isArray(projects)) return [];

    return projects.slice().sort(function(a, b) {
      var aRunning = a.status === 'running' || a.status === 'queued';
      var bRunning = b.status === 'running' || b.status === 'queued';

      if (aRunning && !bRunning) return -1;
      if (!aRunning && bRunning) return 1;

      var aName = (a.name || '').toLowerCase();
      var bName = (b.name || '').toLowerCase();

      return aName.localeCompare(bName);
    });
  };

  // Export to global scope
  if (typeof module !== 'undefined' && module.exports) {
    // CommonJS (Node.js/Jest)
    module.exports = Utils;
  } else {
    // Browser global
    global.Utils = Utils;
  }

})(typeof window !== 'undefined' ? window : global);
