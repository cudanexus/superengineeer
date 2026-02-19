/**
 * File Cache Module
 * Handles caching of file contents for tool argument previews
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FileCache = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Configuration
  var CACHE_LIMIT = 10;
  var CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Dependencies (injected via init)
  var api;

  // Internal cache storage
  var cache = {};

  /**
   * Initialize the module with dependencies
   * @param {Object} deps - Dependencies object
   */
  function init(deps) {
    api = deps.api;
  }

  /**
   * Normalize file path for consistent cache keys
   * @param {string} filePath - File path to normalize
   * @returns {string} Normalized path
   */
  function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/');
  }

  /**
   * Cache a file's content by reading it from the backend
   * @param {string} filePath - Path to file to cache
   */
  function cacheFile(filePath) {
    var normalizedPath = normalizePath(filePath);

    // Enforce cache limit - remove oldest entries if needed
    var cacheKeys = Object.keys(cache);

    if (cacheKeys.length >= CACHE_LIMIT) {
      // Sort by timestamp and remove oldest
      var oldest = cacheKeys.sort(function(a, b) {
        return cache[a].timestamp - cache[b].timestamp;
      })[0];
      delete cache[oldest];
    }

    // Read file content from backend and cache it
    api.readFile(filePath)
      .done(function(data) {
        cache[normalizedPath] = {
          timestamp: Date.now(),
          content: data.content
        };
      })
      .fail(function() {
        // Still mark as read even if we couldn't get content
        cache[normalizedPath] = {
          timestamp: Date.now(),
          content: null
        };
      });
  }

  /**
   * Get cached file content
   * @param {string} filePath - Path to file
   * @returns {string|null} File content or null if not cached/expired
   */
  function getContent(filePath) {
    var normalizedPath = normalizePath(filePath);
    var cached = cache[normalizedPath];

    if (!cached) return null;

    // Check if cache is expired
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      delete cache[normalizedPath];
      return null;
    }

    return cached.content;
  }

  /**
   * Check if a file has been read (cached)
   * @param {string} filePath - Path to file
   * @returns {boolean} True if file is in cache and not expired
   */
  function wasRead(filePath) {
    var normalizedPath = normalizePath(filePath);
    var cached = cache[normalizedPath];

    if (!cached) return false;

    // Check if cache is expired
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      delete cache[normalizedPath];
      return false;
    }

    return true;
  }

  /**
   * Clear all cached files
   */
  function clear() {
    cache = {};
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  function getStats() {
    return {
      size: Object.keys(cache).length,
      limit: CACHE_LIMIT,
      ttl: CACHE_TTL
    };
  }

  // Public API
  return {
    init: init,
    cacheFile: cacheFile,
    getContent: getContent,
    wasRead: wasRead,
    clear: clear,
    getStats: getStats,
    // Expose for testing
    _normalizePath: normalizePath
  };
}));
