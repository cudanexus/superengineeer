/**
 * Formatters Module
 * Pure formatting functions for numbers, dates, sizes, etc.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Formatters = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  /**
   * Format bytes to human-readable file size
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size (e.g., "1.5 KB")
   */
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }

  /**
   * Format large numbers with K/M suffix
   * @param {number} num - Number to format
   * @returns {string} Formatted number (e.g., "1.5K", "2.3M")
   */
  function formatNumberCompact(num) {
    if (num === undefined || num === null) return '0';

    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }

    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }

    return num.toLocaleString();
  }

  /**
   * Format number with thousand separators
   * @param {number} num - Number to format
   * @returns {string} Formatted number (e.g., "1,234,567")
   */
  function formatNumberWithCommas(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Format ISO date string to local date and time
   * @param {string} isoString - ISO date string
   * @returns {string} Formatted date and time
   */
  function formatDateTime(isoString) {
    try {
      var date = new Date(isoString);

      if (isNaN(date.getTime())) {
        return isoString;
      }

      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (e) {
      return isoString;
    }
  }

  /**
   * Format ISO date string to local time only
   * @param {string} isoString - ISO date string
   * @returns {string} Formatted time
   */
  function formatTime(isoString) {
    try {
      var date = new Date(isoString);

      if (isNaN(date.getTime())) {
        return isoString;
      }

      return date.toLocaleTimeString();
    } catch (e) {
      return isoString;
    }
  }

  /**
   * Format ISO date string to HH:MM:SS format
   * @param {string} isoString - ISO date string
   * @returns {string} Formatted time (HH:MM:SS)
   */
  function formatLogTime(isoString) {
    try {
      var date = new Date(isoString);

      if (isNaN(date.getTime())) {
        return '';
      }

      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      return '';
    }
  }

  /**
   * Format ISO date string to relative time (e.g., "5m ago", "2h ago")
   * @param {string} isoString - ISO date string
   * @returns {string} Relative time string
   */
  function formatConversationDate(isoString) {
    try {
      var date = new Date(isoString);

      if (isNaN(date.getTime())) {
        return '';
      }

      var now = new Date();
      var diffMs = now - date;
      var diffMins = Math.floor(diffMs / 60000);
      var diffHours = Math.floor(diffMs / 3600000);
      var diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return diffMins + 'm ago';
      if (diffHours < 24) return diffHours + 'h ago';
      if (diffDays < 7) return diffDays + 'd ago';

      return date.toLocaleDateString();
    } catch (e) {
      return '';
    }
  }

  /**
   * Format duration in milliseconds to human-readable string
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration (e.g., "1h 30m", "45s")
   */
  function formatDuration(ms) {
    if (!ms || ms < 0) return '';

    var seconds = Math.floor(ms / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return hours + 'h ' + (minutes % 60) + 'm';
    }

    if (minutes > 0) {
      return minutes + 'm ' + (seconds % 60) + 's';
    }

    return seconds + 's';
  }

  /**
   * Format token count with K/M suffix (lowercase k)
   * @param {number} tokens - Token count
   * @returns {string} Formatted token count
   */
  function formatTokenCount(tokens) {
    if (tokens >= 1000000) {
      return (tokens / 1000000).toFixed(1) + 'M';
    }

    if (tokens >= 1000) {
      return (tokens / 1000).toFixed(1) + 'k';
    }

    return tokens.toString();
  }

  /**
   * Format todo status to display text
   * @param {string} status - Status value (completed, in_progress, pending)
   * @returns {string} Display text
   */
  function formatTodoStatus(status) {
    switch (status) {
      case 'completed':
        return 'Done';
      case 'in_progress':
        return 'Working';
      case 'pending':
        return 'Pending';
      default:
        return status;
    }
  }

  return {
    formatFileSize: formatFileSize,
    formatBytes: formatFileSize,
    formatNumberCompact: formatNumberCompact,
    formatNumberWithCommas: formatNumberWithCommas,
    formatDateTime: formatDateTime,
    formatTime: formatTime,
    formatLogTime: formatLogTime,
    formatConversationDate: formatConversationDate,
    formatDuration: formatDuration,
    formatTokenCount: formatTokenCount,
    formatTodoStatus: formatTodoStatus
  };
}));
