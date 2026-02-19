/**
 * Validators Module
 * Pure validation functions for file names, folder names, etc.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Validators = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Windows invalid characters regex
  var INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

  // Windows reserved names regex
  var RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

  /**
   * Create a validation result object
   * @param {boolean} valid - Whether validation passed
   * @param {string|null} error - Error message if invalid
   * @returns {{valid: boolean, error: string|null}}
   */
  function validationResult(valid, error) {
    return { valid: valid, error: error || null };
  }

  /**
   * Validate a file name
   * @param {string} name - File name to validate
   * @returns {{valid: boolean, error: string|null}}
   */
  function validateFileName(name) {
    if (!name || name.trim() === '') {
      return validationResult(false, 'File name cannot be empty');
    }

    var trimmed = name.trim();

    if (INVALID_CHARS.test(trimmed)) {
      return validationResult(false, 'File name contains invalid characters');
    }

    if (RESERVED_NAMES.test(trimmed)) {
      return validationResult(false, 'File name is reserved by the system');
    }

    if (trimmed === '.') {
      return validationResult(false, 'File name cannot be just a dot');
    }

    // Note: trimmed.endsWith(' ') can never be true since we trim first
    if (trimmed.endsWith('.')) {
      return validationResult(false, 'File name cannot end with a dot');
    }

    return validationResult(true, null);
  }

  /**
   * Validate a folder name
   * @param {string} name - Folder name to validate
   * @returns {{valid: boolean, error: string|null}}
   */
  function validateFolderName(name) {
    if (!name || name.trim() === '') {
      return validationResult(false, 'Folder name cannot be empty');
    }

    var trimmed = name.trim();

    if (INVALID_CHARS.test(trimmed)) {
      return validationResult(false, 'Folder name contains invalid characters');
    }

    if (RESERVED_NAMES.test(trimmed)) {
      return validationResult(false, 'Folder name is reserved by the system');
    }

    if (trimmed === '.' || trimmed === '..') {
      return validationResult(false, 'Folder name cannot be just dots');
    }

    // Note: trimmed.endsWith(' ') can never be true since we trim first

    return validationResult(true, null);
  }

  return {
    validateFileName: validateFileName,
    validateFolderName: validateFolderName
  };
}));
