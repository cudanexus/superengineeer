/**
 * DiffEngine module for Superengineer-v5
 * Provides diff computation algorithms: LCS, line diff, word diff, unified diff parsing
 */

(function(root, factory) {
  'use strict';

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DiffEngine = factory();
  }
})(typeof window !== 'undefined' ? window : global, function() {
  'use strict';

  var DiffEngine = {};

  // ============================================================
  // Constants
  // ============================================================

  DiffEngine.DIFF_PREVIEW_LINES = 15;
  DiffEngine.CONTEXT_LINES = 2;

  // ============================================================
  // Language Detection
  // ============================================================

  /**
   * Map file extensions to highlight.js language names
   */
  DiffEngine.extensionToLanguage = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'ps1': 'powershell',
    'sql': 'sql',
    'html': 'xml',
    'htm': 'xml',
    'xml': 'xml',
    'svg': 'xml',
    'css': 'css',
    'scss': 'scss',
    'sass': 'scss',
    'less': 'less',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'ini',
    'ini': 'ini',
    'md': 'markdown',
    'markdown': 'markdown',
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'vue': 'xml',
    'svelte': 'xml'
  };

  /**
   * Get highlight.js language name from file path
   * @param {string} filePath - Path to the file
   * @returns {string|null} Language name or null
   */
  DiffEngine.getLanguageFromPath = function(filePath) {
    if (!filePath) return null;

    var fileName = filePath.split(/[/\\]/).pop().toLowerCase();

    // Handle special filenames
    if (fileName === 'dockerfile') return 'dockerfile';
    if (fileName === 'makefile') return 'makefile';
    if (fileName.startsWith('.')) fileName = fileName.substring(1);

    var ext = fileName.split('.').pop();
    return DiffEngine.extensionToLanguage[ext] || null;
  };

  // ============================================================
  // Core Diff Algorithms
  // ============================================================

  /**
   * Compute the Longest Common Subsequence of two arrays
   * @param {Array} arr1 - First array
   * @param {Array} arr2 - Second array
   * @returns {Array} LCS elements in order
   */
  DiffEngine.computeLCS = function(arr1, arr2) {
    var m = arr1.length;
    var n = arr2.length;
    var dp = [];

    // Build DP table
    for (var i = 0; i <= m; i++) {
      dp[i] = [];

      for (var j = 0; j <= n; j++) {
        dp[i][j] = 0;
      }
    }

    for (var i = 1; i <= m; i++) {
      for (var j = 1; j <= n; j++) {
        if (arr1[i - 1] === arr2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find LCS
    var lcs = [];
    var i = m;
    var j = n;

    while (i > 0 && j > 0) {
      if (arr1[i - 1] === arr2[j - 1]) {
        lcs.unshift(arr1[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  };

  /**
   * Check if two strings are similar enough to be considered a modification
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {boolean} True if strings are similar
   */
  DiffEngine.isSimilar = function(str1, str2) {
    if (!str1 || !str2) return false;

    var len1 = str1.length;
    var len2 = str2.length;

    // If lengths differ by more than 50%, not similar
    if (Math.abs(len1 - len2) > Math.max(len1, len2) * 0.5) return false;

    // Simple similarity: share at least 40% of characters in same positions
    var matches = 0;
    var minLen = Math.min(len1, len2);

    for (var i = 0; i < minLen; i++) {
      if (str1[i] === str2[i]) matches++;
    }

    return matches / Math.max(len1, len2) > 0.4;
  };

  /**
   * Compute line-by-line diff between two strings
   * @param {string} oldStr - Original string
   * @param {string} newStr - New string
   * @returns {Array<{type: string, content: string, oldContent?: string}>} Diff result
   */
  DiffEngine.computeDiff = function(oldStr, newStr) {
    var oldLines = oldStr.split('\n');
    var newLines = newStr.split('\n');
    var result = [];

    var lcs = DiffEngine.computeLCS(oldLines, newLines);
    var oldIdx = 0;
    var newIdx = 0;
    var lcsIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      if (lcsIdx < lcs.length && oldIdx < oldLines.length && oldLines[oldIdx] === lcs[lcsIdx]) {
        if (newIdx < newLines.length && newLines[newIdx] === lcs[lcsIdx]) {
          // Unchanged line
          result.push({ type: 'unchanged', content: oldLines[oldIdx] });
          oldIdx++;
          newIdx++;
          lcsIdx++;
        } else {
          // Line added in new
          result.push({ type: 'add', content: newLines[newIdx] });
          newIdx++;
        }
      } else if (lcsIdx < lcs.length && newIdx < newLines.length && newLines[newIdx] === lcs[lcsIdx]) {
        // Line removed from old
        result.push({ type: 'remove', content: oldLines[oldIdx] });
        oldIdx++;
      } else if (oldIdx < oldLines.length && newIdx < newLines.length) {
        // Both lines differ - check if it's a modification
        if (DiffEngine.isSimilar(oldLines[oldIdx], newLines[newIdx])) {
          result.push({ type: 'change', content: newLines[newIdx], oldContent: oldLines[oldIdx] });
        } else {
          result.push({ type: 'remove', content: oldLines[oldIdx] });
          result.push({ type: 'add', content: newLines[newIdx] });
        }
        oldIdx++;
        newIdx++;
      } else if (oldIdx < oldLines.length) {
        result.push({ type: 'remove', content: oldLines[oldIdx] });
        oldIdx++;
      } else if (newIdx < newLines.length) {
        result.push({ type: 'add', content: newLines[newIdx] });
        newIdx++;
      } else {
        break;
      }
    }

    return result;
  };

  /**
   * Compute word-level diff for inline change highlighting
   * @param {string} oldStr - Original string
   * @param {string} newStr - New string
   * @returns {{leftChunks: Array, rightChunks: Array}} Word diff with chunks
   */
  DiffEngine.computeWordDiff = function(oldStr, newStr) {
    // Tokenize by words and whitespace, preserving everything
    var oldTokens = oldStr.match(/\S+|\s+/g) || [];
    var newTokens = newStr.match(/\S+|\s+/g) || [];

    // Compute LCS of tokens
    var m = oldTokens.length;
    var n = newTokens.length;
    var dp = [];

    for (var i = 0; i <= m; i++) {
      dp[i] = [];

      for (var j = 0; j <= n; j++) {
        if (i === 0 || j === 0) {
          dp[i][j] = 0;
        } else if (oldTokens[i - 1] === newTokens[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find LCS and build operations
    var ops = [];
    var oi = m;
    var ni = n;

    while (oi > 0 || ni > 0) {
      if (oi > 0 && ni > 0 && oldTokens[oi - 1] === newTokens[ni - 1]) {
        ops.push({ type: 'same', oldIdx: oi - 1, newIdx: ni - 1 });
        oi--;
        ni--;
      } else if (ni > 0 && (oi === 0 || dp[oi][ni - 1] >= dp[oi - 1][ni])) {
        ops.push({ type: 'add', newIdx: ni - 1 });
        ni--;
      } else {
        ops.push({ type: 'remove', oldIdx: oi - 1 });
        oi--;
      }
    }

    // Reverse to get correct order
    ops.reverse();

    // Build chunks from operations
    var leftChunks = [];
    var rightChunks = [];

    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];

      if (op.type === 'same') {
        leftChunks.push({ text: oldTokens[op.oldIdx], type: 'unchanged' });
        rightChunks.push({ text: newTokens[op.newIdx], type: 'unchanged' });
      } else if (op.type === 'remove') {
        leftChunks.push({ text: oldTokens[op.oldIdx], type: 'removed' });
      } else if (op.type === 'add') {
        rightChunks.push({ text: newTokens[op.newIdx], type: 'added' });
      }
    }

    return { leftChunks: leftChunks, rightChunks: rightChunks };
  };

  /**
   * Compute aligned diff for side-by-side display
   * @param {string} oldStr - Original string
   * @param {string} newStr - New string
   * @returns {Array<{left: string, right: string, type: string, leftChunks?: Array, rightChunks?: Array}>}
   */
  DiffEngine.computeAlignedDiff = function(oldStr, newStr) {
    var diff = DiffEngine.computeDiff(oldStr, newStr);
    var aligned = [];

    for (var i = 0; i < diff.length; i++) {
      var line = diff[i];

      if (line.type === 'unchanged') {
        aligned.push({ left: line.content, right: line.content, type: 'unchanged' });
      } else if (line.type === 'remove') {
        // Check if next line is add (potential change pair)
        if (i + 1 < diff.length && diff[i + 1].type === 'add') {
          var wordDiff = DiffEngine.computeWordDiff(line.content, diff[i + 1].content);
          aligned.push({
            left: line.content,
            right: diff[i + 1].content,
            type: 'change',
            leftChunks: wordDiff.leftChunks,
            rightChunks: wordDiff.rightChunks
          });
          i++; // Skip the add line
        } else {
          aligned.push({ left: line.content, right: '', type: 'remove' });
        }
      } else if (line.type === 'add') {
        aligned.push({ left: '', right: line.content, type: 'add' });
      } else if (line.type === 'change') {
        var wordDiff2 = DiffEngine.computeWordDiff(line.oldContent || '', line.content);
        aligned.push({
          left: line.oldContent || '',
          right: line.content,
          type: 'change',
          leftChunks: wordDiff2.leftChunks,
          rightChunks: wordDiff2.rightChunks
        });
      }
    }

    return aligned;
  };

  // ============================================================
  // Unified Diff Parsing
  // ============================================================

  /**
   * Parse unified diff format into aligned diff structure
   * @param {string} diffText - Unified diff text
   * @returns {Array<{left: string, right: string, type: string}>} Aligned diff lines
   */
  DiffEngine.parseUnifiedDiff = function(diffText) {
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
  // Diff Preview Selection
  // ============================================================

  /**
   * Select lines to show in diff preview, prioritizing changed lines with context
   * @param {Array} alignedDiff - Full aligned diff
   * @param {number} maxLines - Maximum lines to show
   * @returns {Array<{startIndex: number, lines: Array}>} Groups of lines to display
   */
  DiffEngine.selectDiffPreviewLines = function(alignedDiff, maxLines) {
    var CONTEXT_LINES = DiffEngine.CONTEXT_LINES;
    var groups = [];
    var currentGroup = null;
    var linesUsed = 0;

    for (var i = 0; i < alignedDiff.length && linesUsed < maxLines; i++) {
      var row = alignedDiff[i];
      var isChange = row.type !== 'unchanged';

      if (isChange) {
        // Start a new group or extend the current one
        if (!currentGroup) {
          // Add context lines before this change
          var contextStart = Math.max(0, i - CONTEXT_LINES);
          currentGroup = {
            startIndex: contextStart,
            lines: []
          };

          for (var j = contextStart; j < i && linesUsed < maxLines; j++) {
            currentGroup.lines.push({ index: j, row: alignedDiff[j] });
            linesUsed++;
          }
        }

        // Add the changed line
        if (linesUsed < maxLines) {
          currentGroup.lines.push({ index: i, row: row });
          linesUsed++;
        }
      } else if (currentGroup) {
        // We're in a group, add context after changes
        var lastChangeIndex = -1;

        for (var k = currentGroup.lines.length - 1; k >= 0; k--) {
          if (currentGroup.lines[k].row.type !== 'unchanged') {
            lastChangeIndex = currentGroup.lines[k].index;
            break;
          }
        }

        if (i - lastChangeIndex <= CONTEXT_LINES) {
          // Still within context range
          if (linesUsed < maxLines) {
            currentGroup.lines.push({ index: i, row: row });
            linesUsed++;
          }
        } else {
          // End of context, close the group
          groups.push(currentGroup);
          currentGroup = null;
        }
      }
    }

    // Close any remaining group
    if (currentGroup) {
      groups.push(currentGroup);
    }

    // If no changes found, show first few lines
    if (groups.length === 0 && alignedDiff.length > 0) {
      var linesToAdd = Math.min(alignedDiff.length, maxLines);
      var defaultGroup = { startIndex: 0, lines: [] };

      for (var m = 0; m < linesToAdd; m++) {
        defaultGroup.lines.push({ index: m, row: alignedDiff[m] });
      }

      groups.push(defaultGroup);
    }

    return groups;
  };

  return DiffEngine;
});
