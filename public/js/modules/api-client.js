/**
 * ApiClient module for Claudito
 * HTTP API wrapper for all backend endpoints
 */

(function(root, factory) {
  'use strict';

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ApiClient = factory();
  }
})(typeof window !== 'undefined' ? window : global, function() {
  'use strict';

  var ApiClient = {};

  // Base URL for API calls (can be overridden for testing)
  var baseUrl = '';

  /**
   * Set the base URL for all API calls
   * @param {string} url - Base URL (e.g., 'http://localhost:3000')
   */
  ApiClient.setBaseUrl = function(url) {
    baseUrl = url || '';
  };

  /**
   * Get the current base URL
   * @returns {string} Current base URL
   */
  ApiClient.getBaseUrl = function() {
    return baseUrl;
  };

  // ============================================================
  // Health & System
  // ============================================================

  ApiClient.getHealth = function() {
    return $.get(baseUrl + '/api/health');
  };

  ApiClient.getDevStatus = function() {
    return $.get(baseUrl + '/api/dev');
  };

  ApiClient.shutdownServer = function() {
    return $.post(baseUrl + '/api/dev/shutdown');
  };

  ApiClient.getAgentResourceStatus = function() {
    return $.get(baseUrl + '/api/agents/status');
  };

  // ============================================================
  // Projects
  // ============================================================

  ApiClient.getProjects = function() {
    return $.get(baseUrl + '/api/projects');
  };

  ApiClient.addProject = function(data) {
    return $.post(baseUrl + '/api/projects', data);
  };

  ApiClient.deleteProject = function(id) {
    return $.ajax({ url: baseUrl + '/api/projects/' + id, method: 'DELETE' });
  };

  ApiClient.getDebugInfo = function(id) {
    return $.get(baseUrl + '/api/projects/' + id + '/debug');
  };

  // ============================================================
  // Roadmap
  // ============================================================

  ApiClient.getProjectRoadmap = function(id) {
    return $.get(baseUrl + '/api/projects/' + id + '/roadmap');
  };

  ApiClient.generateRoadmap = function(id, prompt) {
    return $.post(baseUrl + '/api/projects/' + id + '/roadmap/generate', { prompt: prompt });
  };

  ApiClient.modifyRoadmap = function(id, prompt) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + id + '/roadmap',
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({ prompt: prompt })
    });
  };

  ApiClient.sendRoadmapResponse = function(id, response) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + id + '/roadmap/respond',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ response: response })
    });
  };

  ApiClient.deleteRoadmapTask = function(id, phaseId, milestoneId, taskIndex) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + id + '/roadmap/task',
      method: 'DELETE',
      contentType: 'application/json',
      data: JSON.stringify({ phaseId: phaseId, milestoneId: milestoneId, taskIndex: taskIndex })
    });
  };

  ApiClient.deleteRoadmapMilestone = function(id, phaseId, milestoneId) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + id + '/roadmap/milestone',
      method: 'DELETE',
      contentType: 'application/json',
      data: JSON.stringify({ phaseId: phaseId, milestoneId: milestoneId })
    });
  };

  ApiClient.deleteRoadmapPhase = function(id, phaseId) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + id + '/roadmap/phase',
      method: 'DELETE',
      contentType: 'application/json',
      data: JSON.stringify({ phaseId: phaseId })
    });
  };

  // ============================================================
  // Agent
  // ============================================================

  ApiClient.startAgent = function(id) {
    return $.post(baseUrl + '/api/projects/' + id + '/agent/start');
  };

  ApiClient.stopAgent = function(id) {
    return $.post(baseUrl + '/api/projects/' + id + '/agent/stop');
  };

  ApiClient.getAgentStatus = function(id) {
    return $.get(baseUrl + '/api/projects/' + id + '/agent/status');
  };

  ApiClient.getLoopStatus = function(id) {
    return $.get(baseUrl + '/api/projects/' + id + '/agent/loop');
  };

  ApiClient.getContextUsage = function(id) {
    return $.get(baseUrl + '/api/projects/' + id + '/agent/context');
  };

  ApiClient.startInteractiveAgent = function(id, message, images, sessionId, permissionMode) {
    var payload = { message: message || '' };

    if (images && images.length > 0) {
      payload.images = images.map(function(img) {
        return {
          type: img.mimeType,
          data: img.dataUrl.split(',')[1] // Remove data:image/xxx;base64, prefix
        };
      });
    }

    if (sessionId) {
      payload.sessionId = sessionId;
    }

    if (permissionMode) {
      payload.permissionMode = permissionMode;
    }

    return $.ajax({
      url: baseUrl + '/api/projects/' + id + '/agent/interactive',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    });
  };

  ApiClient.sendAgentMessage = function(id, message, images) {
    var payload = { message: message };

    if (images && images.length > 0) {
      payload.images = images.map(function(img) {
        return {
          type: img.mimeType,
          data: img.dataUrl.split(',')[1] // Remove data:image/xxx;base64, prefix
        };
      });
    }

    return $.ajax({
      url: baseUrl + '/api/projects/' + id + '/agent/send',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    });
  };

  // ============================================================
  // Queue
  // ============================================================

  ApiClient.getQueuedMessages = function(id) {
    return $.get(baseUrl + '/api/projects/' + id + '/agent/queue');
  };

  ApiClient.removeFromQueue = function(id) {
    return $.ajax({ url: baseUrl + '/api/projects/' + id + '/agent/queue', method: 'DELETE' });
  };

  ApiClient.removeQueuedMessage = function(id, index) {
    return $.ajax({ url: baseUrl + '/api/projects/' + id + '/agent/queue/' + index, method: 'DELETE' });
  };

  // ============================================================
  // Conversations
  // ============================================================

  ApiClient.getConversations = function(id) {
    return $.get(baseUrl + '/api/projects/' + id + '/conversations');
  };

  ApiClient.getConversation = function(projectId, conversationId) {
    return $.get(baseUrl + '/api/projects/' + projectId + '/conversation', { conversationId: conversationId });
  };

  ApiClient.searchConversationHistory = function(projectId, query) {
    return $.get(baseUrl + '/api/projects/' + projectId + '/conversations/search', { q: query });
  };

  ApiClient.renameConversation = function(projectId, conversationId, label) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/conversations/' + conversationId,
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({ label: label })
    });
  };

  ApiClient.setCurrentConversation = function(projectId, conversationId) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/conversation/current',
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({ conversationId: conversationId })
    });
  };

  // ============================================================
  // Claude Files
  // ============================================================

  ApiClient.getClaudeFiles = function(projectId) {
    return $.get(baseUrl + '/api/projects/' + projectId + '/claude-files');
  };

  ApiClient.saveClaudeFile = function(projectId, filePath, content) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/claude-files',
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({ filePath: filePath, content: content })
    });
  };

  ApiClient.getOptimizations = function(projectId) {
    return $.get(baseUrl + '/api/projects/' + projectId + '/optimizations');
  };

  // ============================================================
  // Settings
  // ============================================================

  ApiClient.getSettings = function() {
    return $.get(baseUrl + '/api/settings');
  };

  ApiClient.updateSettings = function(settings) {
    return $.ajax({
      url: baseUrl + '/api/settings',
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify(settings)
    });
  };

  // ============================================================
  // Filesystem
  // ============================================================

  ApiClient.getDrives = function() {
    return $.get(baseUrl + '/api/fs/drives');
  };

  ApiClient.browseFolder = function(path) {
    return $.get(baseUrl + '/api/fs/browse', { path: path });
  };

  ApiClient.browseWithFiles = function(path) {
    return $.get(baseUrl + '/api/fs/browse-with-files', { path: path });
  };

  ApiClient.readFile = function(path) {
    return $.get(baseUrl + '/api/fs/read', { path: path });
  };

  ApiClient.writeFile = function(path, content) {
    return $.ajax({
      url: baseUrl + '/api/fs/write',
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({ path: path, content: content })
    });
  };

  ApiClient.createFolder = function(path) {
    return $.ajax({
      url: baseUrl + '/api/fs/mkdir',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ path: path })
    });
  };

  ApiClient.deleteFileOrFolder = function(targetPath, isDirectory) {
    return $.ajax({
      url: baseUrl + '/api/fs/delete',
      method: 'DELETE',
      contentType: 'application/json',
      data: JSON.stringify({ path: targetPath, isDirectory: isDirectory })
    });
  };

  // ============================================================
  // Git
  // ============================================================

  ApiClient.getGitStatus = function(projectId) {
    return $.get(baseUrl + '/api/projects/' + projectId + '/git/status');
  };

  ApiClient.getGitBranches = function(projectId) {
    return $.get(baseUrl + '/api/projects/' + projectId + '/git/branches');
  };

  ApiClient.getGitDiff = function(projectId, staged) {
    return $.get(baseUrl + '/api/projects/' + projectId + '/git/diff', { staged: staged ? 'true' : 'false' });
  };

  ApiClient.getGitFileDiff = function(projectId, filePath, staged) {
    return $.get(baseUrl + '/api/projects/' + projectId + '/git/file-diff', {
      path: filePath,
      staged: staged ? 'true' : 'false'
    });
  };

  ApiClient.getGitTags = function(projectId) {
    return $.get(baseUrl + '/api/projects/' + projectId + '/git/tags');
  };

  ApiClient.gitStage = function(projectId, paths) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/git/stage',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ paths: paths })
    });
  };

  ApiClient.gitStageAll = function(projectId) {
    return $.post(baseUrl + '/api/projects/' + projectId + '/git/stage-all');
  };

  ApiClient.gitUnstage = function(projectId, paths) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/git/unstage',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ paths: paths })
    });
  };

  ApiClient.gitUnstageAll = function(projectId) {
    return $.post(baseUrl + '/api/projects/' + projectId + '/git/unstage-all');
  };

  ApiClient.gitCommit = function(projectId, message) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/git/commit',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ message: message })
    });
  };

  ApiClient.gitCreateBranch = function(projectId, name, checkout) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/git/branch',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ name: name, checkout: checkout })
    });
  };

  ApiClient.gitCheckout = function(projectId, branch) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/git/checkout',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ branch: branch })
    });
  };

  ApiClient.gitPush = function(projectId, remote, branch, setUpstream) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/git/push',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ remote: remote, branch: branch, setUpstream: setUpstream })
    });
  };

  ApiClient.gitPull = function(projectId, remote, branch) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/git/pull',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ remote: remote, branch: branch })
    });
  };

  ApiClient.gitDiscard = function(projectId, paths) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/git/discard',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ paths: paths })
    });
  };

  ApiClient.gitCreateTag = function(projectId, name, message) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/git/tags',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ name: name, message: message })
    });
  };

  ApiClient.gitPushTag = function(projectId, name, remote) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/git/tags/' + encodeURIComponent(name) + '/push',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ remote: remote })
    });
  };

  // ============================================================
  // Shell
  // ============================================================

  ApiClient.startShell = function(projectId) {
    return $.post(baseUrl + '/api/projects/' + projectId + '/shell/start');
  };

  ApiClient.getShellStatus = function(projectId) {
    return $.get(baseUrl + '/api/projects/' + projectId + '/shell/status');
  };

  ApiClient.sendShellInput = function(projectId, input) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/shell/input',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ input: input })
    });
  };

  ApiClient.resizeShell = function(projectId, cols, rows) {
    return $.ajax({
      url: baseUrl + '/api/projects/' + projectId + '/shell/resize',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ cols: cols, rows: rows })
    });
  };

  ApiClient.stopShell = function(projectId) {
    return $.post(baseUrl + '/api/projects/' + projectId + '/shell/stop');
  };

  // ============================================================
  // Error Logging
  // ============================================================

  /**
   * Log a frontend error to the backend
   * @param {string} message - Error message
   * @param {string} source - Source file
   * @param {number} line - Line number
   * @param {number} column - Column number
   * @param {Error} errorObj - Error object
   * @param {string} projectId - Current project ID
   */
  ApiClient.logFrontendError = function(message, source, line, column, errorObj, projectId) {
    var errorData = {
      message: message,
      source: source,
      line: line,
      column: column,
      stack: errorObj && errorObj.stack ? errorObj.stack : null,
      projectId: projectId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null
    };

    // Send to backend silently (don't show errors if this fails)
    return $.ajax({
      url: baseUrl + '/api/log/error',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(errorData)
    });
  };

  // ============================================================
  // Authentication
  // ============================================================

  /**
   * Initialize global 401 handler to redirect to login on unauthorized
   * Should be called once when the app starts
   */
  ApiClient.init = function() {
    if (typeof $ !== 'undefined' && typeof document !== 'undefined') {
      $(document).ajaxError(function(_event, jqXHR) {
        if (jqXHR.status === 401) {
          window.location.href = '/login';
        }
      });
    }
  };

  /**
   * Check authentication status
   * @returns {Promise} Resolves with {authenticated: boolean}
   */
  ApiClient.getAuthStatus = function() {
    return $.get(baseUrl + '/api/auth/status');
  };

  /**
   * Logout and redirect to login page
   * @returns {Promise} Resolves on successful logout
   */
  ApiClient.logout = function() {
    return $.post(baseUrl + '/api/auth/logout').done(function() {
      window.location.href = '/login';
    });
  };

  return ApiClient;
});
