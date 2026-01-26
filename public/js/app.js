// Claudito Frontend Application

(function($) {
  'use strict';

  // Application state
  const state = {
    projects: [],
    selectedProjectId: null,
    conversations: {},
    folderBrowser: {
      currentPath: null
    },
    websocket: null,
    resourceStatus: {
      runningCount: 0,
      maxConcurrent: 3,
      queuedCount: 0,
      queuedProjects: []
    },
    pendingDeleteId: null,
    pendingDeleteTask: null,
    pendingDeleteMilestone: null,
    pendingDeletePhase: null,
    debugPanelOpen: false,
    debugRefreshInterval: null,
    agentStatusInterval: null, // Polling interval for agent status
    roadmapGenerating: false,
    agentOutputScrollLock: false,
    fontSize: 14, // Font size for Claude output (10-24px)
    agentStarting: false, // Prevents concurrent agent starts
    messageSending: false, // Prevents concurrent message sends
    agentMode: 'interactive', // 'interactive' or 'autonomous'
    permissionMode: 'plan', // 'acceptEdits' or 'plan'
    pendingPermissionMode: null, // Mode to apply when agent finishes current operation
    currentAgentMode: null, // mode of currently running agent
    currentConversationId: null,
    currentConversationStats: null, // { messageCount, toolCallCount, userMessageCount, durationMs, startedAt }
    currentConversationMetadata: null, // { contextUsage: { totalTokens, inputTokens, outputTokens, ... } }
    conversationHistoryOpen: false,
    readFileCache: {}, // Cache of recently read files: path -> content
    queuedMessageCount: 0, // Number of messages waiting to be sent to agent
    sendWithCtrlEnter: true, // Configurable: true = Ctrl+Enter to send, false = Enter to send
    historyLimit: 25, // Maximum conversations shown in history
    pendingRenameConversationId: null, // For rename modal
    pendingDeleteFile: null, // { path, isDirectory, name } for file deletion confirmation
    pendingCreateFile: null, // { parentPath } for file creation modal
    pendingCreateFolder: null, // { parentPath } for folder creation modal
    currentTodos: [], // Current task list from last TodoWrite
    activeTab: 'agent-output', // 'agent-output' or 'project-files'
    contextMenuTarget: null, // { path, isDir, name } for context menu actions
    pendingImages: [], // Array of { id, dataUrl, mimeType, size } for images to send with message
    currentSessionId: null, // Claude session ID for session resumption
    currentPlanFile: null, // Path to current plan file from ExitPlanMode
    // WebSocket reconnection state
    wsReconnect: {
      attempts: 0,
      maxAttempts: 50,
      baseDelay: 1000,
      maxDelay: 30000,
      timeout: null
    },
    // File browser state
    fileBrowser: {
      expandedDirs: {},
      selectedFile: null,
      rootEntries: []
    },
    // Open files state
    openFiles: [], // [{path, name, content, modified, originalContent}]
    activeFilePath: null,
    // Claude Files state
    claudeFilesState: {
      files: [],
      currentFile: null // { path, name, content, originalContent, size, isGlobal }
    },
    devMode: false,
    // Search state
    search: {
      isOpen: false,
      query: '',
      matches: [],      // Array of highlight span elements
      currentIndex: -1,
      filters: {
        user: true,
        assistant: true,
        tool: true,
        system: true
      },
      searchHistory: false,
      historyResults: []  // Results from history search API
    },
    isModeSwitching: false, // UI blocked during permission mode switch
    debugExpandedLogs: {}, // Track expanded log items by ID: { logId: true }
    debugLogFilters: { // Log level filters for debug modal
      error: true,
      warn: true,
      info: true,
      debug: true,
      frontend: true
    },
    waitingVersion: 0, // Version number for waiting status updates
    // Git state
    git: {
      expandedDirs: {}, // Track expanded directories in git tree
      selectedFile: null // Currently selected file for diff
    },
    gitContextTarget: null, // { path, type, status } for git context menu
    activePromptType: null, // 'question' | 'permission' | 'plan_mode' | null - blocks input while prompt is active
    isGitOperating: false // Blocks git UI during operations
  };

  // Local storage keys for browser-specific settings
  var LOCAL_STORAGE_KEYS = {
    FONT_SIZE: 'claudito-font-size',
    ACTIVE_TAB: 'claudito-active-tab',
    SELECTED_PROJECT: 'claudito-selected-project',
    SCROLL_LOCK: 'claudito-scroll-lock'
  };

  // Local storage utility functions
  function saveToLocalStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }

  function loadFromLocalStorage(key, defaultValue) {
    try {
      var stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch (e) {
      console.warn('Failed to load from localStorage:', e);
      return defaultValue;
    }
  }

  // API functions
  const api = {
    getHealth: function() {
      return $.get('/api/health');
    },
    getProjects: function() {
      return $.get('/api/projects');
    },
    addProject: function(data) {
      return $.post('/api/projects', data);
    },
    deleteProject: function(id) {
      return $.ajax({ url: '/api/projects/' + id, method: 'DELETE' });
    },
    getProjectRoadmap: function(id) {
      return $.get('/api/projects/' + id + '/roadmap');
    },
    startAgent: function(id) {
      return $.post('/api/projects/' + id + '/agent/start');
    },
    stopAgent: function(id) {
      return $.post('/api/projects/' + id + '/agent/stop');
    },
    generateRoadmap: function(id, prompt) {
      return $.post('/api/projects/' + id + '/roadmap/generate', { prompt: prompt });
    },
    modifyRoadmap: function(id, prompt) {
      return $.ajax({
        url: '/api/projects/' + id + '/roadmap',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ prompt: prompt })
      });
    },
    sendRoadmapResponse: function(id, response) {
      return $.ajax({
        url: '/api/projects/' + id + '/roadmap/respond',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ response: response })
      });
    },
    getDrives: function() {
      return $.get('/api/fs/drives');
    },
    browseFolder: function(path) {
      return $.get('/api/fs/browse', { path: path });
    },
    readFile: function(path) {
      return $.get('/api/fs/read', { path: path });
    },
    getAgentResourceStatus: function() {
      return $.get('/api/agents/status');
    },
    removeFromQueue: function(id) {
      return $.ajax({ url: '/api/projects/' + id + '/agent/queue', method: 'DELETE' });
    },
    getQueuedMessages: function(id) {
      return $.get('/api/projects/' + id + '/agent/queue');
    },
    removeQueuedMessage: function(id, index) {
      return $.ajax({ url: '/api/projects/' + id + '/agent/queue/' + index, method: 'DELETE' });
    },
    getSettings: function() {
      return $.get('/api/settings');
    },
    updateSettings: function(settings) {
      return $.ajax({
        url: '/api/settings',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(settings)
      });
    },
    getDebugInfo: function(id) {
      return $.get('/api/projects/' + id + '/debug');
    },
    getLoopStatus: function(id) {
      return $.get('/api/projects/' + id + '/agent/loop');
    },
    deleteRoadmapTask: function(id, phaseId, milestoneId, taskIndex) {
      return $.ajax({
        url: '/api/projects/' + id + '/roadmap/task',
        method: 'DELETE',
        contentType: 'application/json',
        data: JSON.stringify({ phaseId: phaseId, milestoneId: milestoneId, taskIndex: taskIndex })
      });
    },
    deleteRoadmapMilestone: function(id, phaseId, milestoneId) {
      return $.ajax({
        url: '/api/projects/' + id + '/roadmap/milestone',
        method: 'DELETE',
        contentType: 'application/json',
        data: JSON.stringify({ phaseId: phaseId, milestoneId: milestoneId })
      });
    },
    deleteRoadmapPhase: function(id, phaseId) {
      return $.ajax({
        url: '/api/projects/' + id + '/roadmap/phase',
        method: 'DELETE',
        contentType: 'application/json',
        data: JSON.stringify({ phaseId: phaseId })
      });
    },
    startInteractiveAgent: function(id, message, images, sessionId, permissionMode) {
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
        url: '/api/projects/' + id + '/agent/interactive',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload)
      });
    },
    sendAgentMessage: function(id, message, images) {
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
        url: '/api/projects/' + id + '/agent/send',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload)
      });
    },
    getAgentStatus: function(id) {
      return $.get('/api/projects/' + id + '/agent/status');
    },
    getConversations: function(id) {
      return $.get('/api/projects/' + id + '/conversations');
    },
    getConversation: function(projectId, conversationId) {
      return $.get('/api/projects/' + projectId + '/conversation', { conversationId: conversationId });
    },
    searchConversationHistory: function(projectId, query) {
      return $.get('/api/projects/' + projectId + '/conversations/search', { q: query });
    },
    getContextUsage: function(id) {
      return $.get('/api/projects/' + id + '/agent/context');
    },
    browseWithFiles: function(path) {
      return $.get('/api/fs/browse-with-files', { path: path });
    },
    writeFile: function(path, content) {
      return $.ajax({
        url: '/api/fs/write',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ path: path, content: content })
      });
    },
    createFolder: function(path) {
      return $.ajax({
        url: '/api/fs/mkdir',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ path: path })
      });
    },
    getClaudeFiles: function(projectId) {
      return $.get('/api/projects/' + projectId + '/claude-files');
    },
    getOptimizations: function(projectId) {
      return $.get('/api/projects/' + projectId + '/optimizations');
    },
    saveClaudeFile: function(projectId, filePath, content) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/claude-files',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ filePath: filePath, content: content })
      });
    },
    renameConversation: function(projectId, conversationId, label) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/conversations/' + conversationId,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ label: label })
      });
    },
    setCurrentConversation: function(projectId, conversationId) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/conversation/current',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ conversationId: conversationId })
      });
    },
    deleteFileOrFolder: function(targetPath, isDirectory) {
      return $.ajax({
        url: '/api/fs/delete',
        method: 'DELETE',
        contentType: 'application/json',
        data: JSON.stringify({ path: targetPath, isDirectory: isDirectory })
      });
    },
    getDevStatus: function() {
      return $.get('/api/dev');
    },
    shutdownServer: function() {
      return $.post('/api/dev/shutdown');
    },

    // Git API
    getGitStatus: function(projectId) {
      return $.get('/api/projects/' + projectId + '/git/status');
    },
    getGitBranches: function(projectId) {
      return $.get('/api/projects/' + projectId + '/git/branches');
    },
    getGitDiff: function(projectId, staged) {
      return $.get('/api/projects/' + projectId + '/git/diff', { staged: staged ? 'true' : 'false' });
    },
    gitStage: function(projectId, paths) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/git/stage',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ paths: paths })
      });
    },
    gitStageAll: function(projectId) {
      return $.post('/api/projects/' + projectId + '/git/stage-all');
    },
    gitUnstage: function(projectId, paths) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/git/unstage',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ paths: paths })
      });
    },
    gitUnstageAll: function(projectId) {
      return $.post('/api/projects/' + projectId + '/git/unstage-all');
    },
    gitCommit: function(projectId, message) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/git/commit',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: message })
      });
    },
    gitCreateBranch: function(projectId, name, checkout) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/git/branch',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ name: name, checkout: checkout })
      });
    },
    gitCheckout: function(projectId, branch) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/git/checkout',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ branch: branch })
      });
    },
    gitPush: function(projectId, remote, branch, setUpstream) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/git/push',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ remote: remote, branch: branch, setUpstream: setUpstream })
      });
    },
    gitPull: function(projectId, remote, branch) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/git/pull',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ remote: remote, branch: branch })
      });
    },
    getGitFileDiff: function(projectId, filePath, staged) {
      return $.get('/api/projects/' + projectId + '/git/file-diff', {
        path: filePath,
        staged: staged ? 'true' : 'false'
      });
    },
    gitDiscard: function(projectId, paths) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/git/discard',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ paths: paths })
      });
    },
    getGitTags: function(projectId) {
      return $.get('/api/projects/' + projectId + '/git/tags');
    },
    gitCreateTag: function(projectId, name, message) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/git/tags',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ name: name, message: message })
      });
    },
    gitPushTag: function(projectId, name, remote) {
      return $.ajax({
        url: '/api/projects/' + projectId + '/git/tags/' + encodeURIComponent(name) + '/push',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ remote: remote })
      });
    }
  };

  // Frontend error logging to backend
  function logFrontendError(message, source, line, column, errorObj) {
    var errorData = {
      message: message,
      source: source,
      line: line,
      column: column,
      stack: errorObj && errorObj.stack ? errorObj.stack : null,
      projectId: state.selectedProjectId,
      userAgent: navigator.userAgent
    };

    // Send to backend silently (don't show errors if this fails)
    $.ajax({
      url: '/api/log/error',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(errorData)
    });
  }

  // Set up global error handlers
  window.onerror = function(message, source, line, column, error) {
    logFrontendError(message, source, line, column, error);
    // Return false to allow default error handling
    return false;
  };

  window.onunhandledrejection = function(event) {
    var reason = event.reason;
    var message = reason instanceof Error ? reason.message : String(reason);
    var stack = reason instanceof Error ? reason.stack : null;
    logFrontendError('Unhandled Promise Rejection: ' + message, null, null, null, { stack: stack });
  };

  // Error code to user-friendly message mapping
  var ERROR_MESSAGES = {
    'NOT_FOUND': 'The requested resource was not found',
    'VALIDATION_ERROR': 'Please check your input and try again',
    'CONFLICT': 'This action conflicts with the current state',
    'INTERNAL_ERROR': 'An unexpected error occurred. Please try again later',
    'NETWORK_ERROR': 'Unable to connect to the server. Please check your connection',
    'TIMEOUT': 'The request timed out. Please try again'
  };

  function getErrorMessage(xhr) {
    if (xhr.status === 0) {
      return ERROR_MESSAGES.NETWORK_ERROR;
    }

    if (xhr.responseJSON) {
      var response = xhr.responseJSON;

      if (response.error) {
        return response.error;
      }

      if (response.code && ERROR_MESSAGES[response.code]) {
        return ERROR_MESSAGES[response.code];
      }
    }

    switch (xhr.status) {
      case 400: return 'Invalid request. Please check your input';
      case 404: return 'The requested resource was not found';
      case 409: return 'This action conflicts with the current state';
      case 500: return 'Server error. Please try again later';
      case 503: return 'Service temporarily unavailable';
      default: return 'An error occurred. Please try again';
    }
  }

  // Toast notifications
  function showToast(message, type) {
    type = type || 'info';
    var $toast = $('<div class="toast ' + type + '">' + escapeHtml(message) + '</div>');
    $('#toast-container').append($toast);

    setTimeout(function() {
      $toast.fadeOut(200, function() { $(this).remove(); });
    }, 3000);
  }

  function showErrorToast(xhr, defaultMessage) {
    var message = getErrorMessage(xhr) || defaultMessage || 'An error occurred';
    showToast(message, 'error');
  }

  function showSlashCommandWarning(command) {
    var warningMessage = {
      type: 'system',
      content: 'The ' + command + ' command is not available through the API. Some commands are supported directly via buttons in the interface (e.g., Context Usage, Clear).',
      timestamp: new Date().toISOString()
    };

    if (state.selectedProjectId) {
      appendMessage(state.selectedProjectId, warningMessage);
      scrollConversationToBottom();
    }
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================
  // Custom Modal Dialogs (replacing alert/confirm/prompt)
  // ============================================================

  // Show a confirmation modal and return a promise
  function showConfirm(title, message, options) {
    options = options || {};
    var confirmText = options.confirmText || 'Confirm';
    var confirmClass = options.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700';

    return new Promise(function(resolve) {
      $('#confirm-modal-title').text(title);
      $('#confirm-modal-message').text(message);
      $('#confirm-modal-ok').text(confirmText).removeClass('bg-red-600 hover:bg-red-700 bg-purple-600 hover:bg-purple-700').addClass(confirmClass);

      var cleanup = function() {
        $('#confirm-modal-ok').off('click.confirm');
        $('#confirm-modal-cancel').off('click.confirm');
        $('#modal-confirm .modal-close').off('click.confirm');
        $('#modal-confirm .modal-backdrop').off('click.confirm');
        $('#modal-confirm').addClass('hidden');
      };

      $('#confirm-modal-ok').on('click.confirm', function() {
        cleanup();
        resolve(true);
      });

      $('#confirm-modal-cancel, #modal-confirm .modal-close, #modal-confirm .modal-backdrop').on('click.confirm', function() {
        cleanup();
        resolve(false);
      });

      $('#modal-confirm').removeClass('hidden');
    });
  }

  // Show a prompt modal and return a promise with the input value (or null if cancelled)
  function showPrompt(title, label, options) {
    options = options || {};
    var placeholder = options.placeholder || '';
    var defaultValue = options.defaultValue || '';
    var submitText = options.submitText || 'OK';

    return new Promise(function(resolve) {
      $('#prompt-modal-title').text(title);
      $('#prompt-modal-label').text(label);
      $('#prompt-modal-input').val(defaultValue).attr('placeholder', placeholder);
      $('#prompt-modal-ok').text(submitText);

      var cleanup = function() {
        $('#form-prompt').off('submit.prompt');
        $('#modal-prompt .modal-close').off('click.prompt');
        $('#modal-prompt .modal-backdrop').off('click.prompt');
        $('#modal-prompt').addClass('hidden');
      };

      $('#form-prompt').on('submit.prompt', function(e) {
        e.preventDefault();
        var value = $('#prompt-modal-input').val().trim();
        cleanup();
        resolve(value || null);
      });

      $('#modal-prompt .modal-close, #modal-prompt .modal-backdrop').on('click.prompt', function() {
        cleanup();
        resolve(null);
      });

      $('#modal-prompt').removeClass('hidden');
      $('#prompt-modal-input').focus();
    });
  }

  // ============================================================
  // Search functionality
  // ============================================================

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function openSearch() {
    state.search.isOpen = true;
    $('#search-controls').removeClass('hidden');
    $('#search-input').focus().select();
  }

  function closeSearch() {
    state.search.isOpen = false;
    $('#search-controls').addClass('hidden');
    $('#search-advanced-filters').addClass('hidden');
    $('#btn-search-advanced').removeClass('bg-purple-600').addClass('bg-gray-700');
    $('#search-input').val('');
    clearSearchHighlights();
    clearHistorySearchResults();
    resetMessageTypeFilters();
    state.search.query = '';
    state.search.matches = [];
    state.search.currentIndex = -1;
    state.search.historyResults = [];
    updateSearchCounter();
  }

  function performSearch(query) {
    // Clear previous highlights
    clearSearchHighlights();
    clearHistorySearchResults();

    state.search.query = query;
    state.search.matches = [];
    state.search.currentIndex = -1;
    state.search.historyResults = [];

    if (!query || query.length < 1) {
      updateSearchCounter();
      return;
    }

    var $conversation = $('#conversation');
    var searchRegex = new RegExp(escapeRegExp(query), 'gi');

    // Find all text nodes within visible conversation messages
    $conversation.find('.conversation-message').each(function() {
      // Skip filtered/hidden messages
      if ($(this).hasClass('filter-hidden')) {
        return;
      }

      // Check message type filter
      var msgType = $(this).attr('data-msg-type');

      if (msgType && !state.search.filters[msgType]) {
        return;
      }

      findAndHighlightMatches(this, searchRegex);
    });

    updateSearchCounter();

    // Jump to first match if any
    if (state.search.matches.length > 0) {
      state.search.currentIndex = 0;
      highlightCurrentMatch();
    }

    // Search history if enabled
    if (state.search.searchHistory && state.selectedProjectId && query.length >= 2) {
      searchConversationHistory(query);
    }
  }

  function findAndHighlightMatches(element, regex) {
    var walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip empty text nodes and script/style content
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          var parent = node.parentElement;

          if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    var textNodes = [];
    var node;

    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    // Process text nodes in reverse order to maintain valid offsets
    textNodes.reverse().forEach(function(textNode) {
      var text = textNode.textContent;
      var match;
      var lastIndex = 0;
      var fragments = [];

      regex.lastIndex = 0; // Reset regex

      while ((match = regex.exec(text)) !== null) {
        // Text before match
        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
        }

        // Create highlight span for match
        var highlightSpan = document.createElement('span');
        highlightSpan.className = 'search-highlight';
        highlightSpan.textContent = match[0];
        fragments.push(highlightSpan);

        // Track this match
        state.search.matches.push(highlightSpan);

        lastIndex = regex.lastIndex;
      }

      // Remaining text after last match
      if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.substring(lastIndex)));
      }

      // Replace text node with fragments if we found matches
      if (fragments.length > 0 && lastIndex > 0) {
        var parent = textNode.parentNode;
        fragments.forEach(function(fragment) {
          parent.insertBefore(fragment, textNode);
        });
        parent.removeChild(textNode);
      }
    });

    // Reverse matches array to maintain document order (since we processed in reverse)
    state.search.matches.reverse();
  }

  function clearSearchHighlights() {
    // Remove all search highlight spans and restore original text
    $('.search-highlight').each(function() {
      var $span = $(this);
      var textNode = document.createTextNode($span.text());
      $span.replaceWith(textNode);
    });

    // Normalize text nodes (merge adjacent text nodes)
    $('#conversation').find('.conversation-message').each(function() {
      this.normalize();
    });

    state.search.matches = [];
  }

  function updateSearchCounter() {
    var total = state.search.matches.length;
    var current = state.search.currentIndex + 1;

    if (total === 0) {
      $('#search-counter').text('');
      $('#btn-search-prev, #btn-search-next').prop('disabled', true);
    } else {
      $('#search-counter').text(current + ' of ' + total);
      $('#btn-search-prev, #btn-search-next').prop('disabled', false);
    }
  }

  function highlightCurrentMatch() {
    // Remove current class from all highlights
    $('.search-highlight').removeClass('current');

    if (state.search.currentIndex >= 0 && state.search.currentIndex < state.search.matches.length) {
      var match = state.search.matches[state.search.currentIndex];
      $(match).addClass('current');

      // Scroll match into view
      scrollToSearchMatch(match);
    }

    updateSearchCounter();
  }

  function scrollToSearchMatch(element) {
    var $container = $('#conversation-container');
    var $element = $(element);

    var containerTop = $container.scrollTop();
    var containerHeight = $container.height();
    var elementTop = $element.offset().top - $container.offset().top + containerTop;
    var elementHeight = $element.outerHeight();

    // Calculate target scroll position (center the element if possible)
    var targetScroll = elementTop - (containerHeight / 2) + (elementHeight / 2);

    // Ensure we don't scroll past boundaries
    var maxScroll = $container[0].scrollHeight - containerHeight;
    targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));

    // Temporarily disable auto-scroll lock detection
    state.agentOutputScrollLock = true;

    $container.animate({ scrollTop: targetScroll }, 150, function() {
      // Re-enable scroll lock detection after animation
      setTimeout(function() {
        state.agentOutputScrollLock = false;
      }, 100);
    });
  }

  function goToNextMatch() {
    if (state.search.matches.length === 0) return;

    state.search.currentIndex = (state.search.currentIndex + 1) % state.search.matches.length;
    highlightCurrentMatch();
  }

  function goToPrevMatch() {
    if (state.search.matches.length === 0) return;

    state.search.currentIndex = state.search.currentIndex - 1;

    if (state.search.currentIndex < 0) {
      state.search.currentIndex = state.search.matches.length - 1;
    }

    highlightCurrentMatch();
  }

  function applyMessageTypeFilters() {
    var $conversation = $('#conversation');

    $conversation.find('.conversation-message').each(function() {
      var msgType = $(this).attr('data-msg-type');

      if (!msgType) {
        // Messages without type are always shown
        $(this).removeClass('filter-hidden');
        return;
      }

      var isVisible = state.search.filters[msgType];
      $(this).toggleClass('filter-hidden', !isVisible);
    });
  }

  function resetMessageTypeFilters() {
    state.search.filters = {
      user: true,
      assistant: true,
      tool: true,
      system: true
    };
    state.search.searchHistory = false;

    $('#filter-user, #filter-assistant, #filter-tool, #filter-system').prop('checked', true);
    $('#filter-history').prop('checked', false);
    $('#conversation').find('.conversation-message').removeClass('filter-hidden');
  }

  function clearHistorySearchResults() {
    $('#conversation').find('.history-search-result').remove();
    state.search.historyResults = [];
  }

  function searchConversationHistory(query) {
    if (!state.selectedProjectId) return;

    api.searchConversationHistory(state.selectedProjectId, query)
      .done(function(results) {
        state.search.historyResults = results;
        renderHistorySearchResults(results, query);
      })
      .fail(function(xhr) {
        console.error('History search failed:', xhr);
      });
  }

  function renderHistorySearchResults(results, query) {
    if (!results || results.length === 0) return;

    var $conversation = $('#conversation');
    var searchRegex = new RegExp('(' + escapeRegExp(query) + ')', 'gi');

    // Add history results section at the top
    var html = '<div class="history-search-results mb-4">' +
      '<div class="text-xs text-purple-400 mb-2 font-semibold">Found in conversation history (' + results.length + ' matches)</div>';

    results.forEach(function(result) {
      var highlightedContent = escapeHtml(result.content).replace(searchRegex, '<span class="search-highlight">$1</span>');
      var label = result.label || formatDate(result.createdAt);
      var convId = result.conversationId;

      html += '<div class="history-search-result" data-conversation-id="' + escapeHtml(convId) + '">' +
        '<div class="history-result-header" onclick="window.loadHistoryConversation(\'' + escapeHtml(convId) + '\')">' +
          '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
          '</svg>' +
          '<span>' + escapeHtml(label) + '</span>' +
          '<span class="text-gray-500">(' + escapeHtml(result.messageType) + ')</span>' +
        '</div>' +
        '<div class="history-result-content">' + highlightedContent + '</div>' +
      '</div>';
    });

    html += '</div>';

    $conversation.prepend(html);
  }

  // Global function to load a history conversation from search results
  window.loadHistoryConversation = function(conversationId) {
    if (!state.selectedProjectId) return;

    // Find and select this conversation in the history dropdown
    var $select = $('#select-conversation-history');
    var $option = $select.find('option[value="' + conversationId + '"]');

    if ($option.length > 0) {
      $select.val(conversationId).trigger('change');
    } else {
      // Conversation not in current dropdown, load it directly
      loadConversation(state.selectedProjectId, conversationId);
    }

    // Close search
    closeSearch();
  };

  // Read file cache management
  var READ_FILE_CACHE_LIMIT = 10;
  var READ_FILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  function cacheReadFile(filePath) {
    // Normalize path for consistent cache keys
    var normalizedPath = filePath.replace(/\\/g, '/');

    // Enforce cache limit - remove oldest entries if needed
    var cacheKeys = Object.keys(state.readFileCache);

    if (cacheKeys.length >= READ_FILE_CACHE_LIMIT) {
      // Sort by timestamp and remove oldest
      var oldest = cacheKeys.sort(function(a, b) {
        return state.readFileCache[a].timestamp - state.readFileCache[b].timestamp;
      })[0];
      delete state.readFileCache[oldest];
    }

    // Read file content from backend and cache it
    api.readFile(filePath)
      .done(function(data) {
        state.readFileCache[normalizedPath] = {
          timestamp: Date.now(),
          content: data.content
        };
      })
      .fail(function() {
        // Still mark as read even if we couldn't get content
        state.readFileCache[normalizedPath] = {
          timestamp: Date.now(),
          content: null
        };
      });
  }

  function getCachedFileContent(filePath) {
    var normalizedPath = filePath.replace(/\\/g, '/');
    var cached = state.readFileCache[normalizedPath];

    if (!cached) return null;

    // Check if cache is expired
    if (Date.now() - cached.timestamp > READ_FILE_CACHE_TTL) {
      delete state.readFileCache[normalizedPath];
      return null;
    }

    return cached.content;
  }

  function wasFileRead(filePath) {
    var normalizedPath = filePath.replace(/\\/g, '/');
    var cached = state.readFileCache[normalizedPath];

    if (!cached) return false;

    // Check if cache is expired
    if (Date.now() - cached.timestamp > READ_FILE_CACHE_TTL) {
      delete state.readFileCache[normalizedPath];
      return false;
    }

    return true;
  }

  function clearReadFileCache() {
    state.readFileCache = {};
  }

  // Modal functions
  function openModal(modalId) {
    $('#' + modalId).removeClass('hidden');
  }

  function closeModal(modalId) {
    var $modal = $('#' + modalId);
    $modal.addClass('hidden');

    // Trigger close event for modals that need cleanup
    if (modalId === 'modal-debug') {
      closeDebugModal();
    }
  }

  function closeAllModals() {
    $('.modal').addClass('hidden');

    // Reset Claude files modal mobile view
    hideMobileClaudeFileEditor();

    // Clean up debug modal if it was open
    if (state.debugPanelOpen) {
      closeDebugModal();
    }
  }

  function openToolDetailModal(toolData) {
    var $modal = $('#modal-tool-detail');
    var $content = $('#tool-detail-content');
    var $name = $('#tool-detail-name');
    var $icon = $('#tool-detail-icon');
    var $status = $('#tool-detail-status');

    // Set header
    $name.text(toolData.name);
    $icon.html(getToolIcon(toolData.name));
    $status.removeClass('running completed failed').addClass(toolData.status);

    // Render full tool details
    var html = renderToolArgs(toolData.name, toolData.input);
    $content.html(html);

    openModal('modal-tool-detail');
  }

  function openContextUsageModal() {
    var $content = $('#context-usage-content');
    $content.html('<div class="text-gray-500 text-center py-4">Loading...</div>');
    openModal('modal-context-usage');

    if (!state.selectedProjectId) {
      $content.html(renderNoProjectMessage());
      return;
    }

    api.getContextUsage(state.selectedProjectId)
      .done(function(data) {
        $content.html(renderContextUsage(data.contextUsage));
      })
      .fail(function() {
        $content.html(renderContextUsageError());
      });
  }

  function openClaudeFilesModal() {
    var $list = $('#claude-files-list');
    $list.html('<div class="p-2 text-xs text-gray-500">Loading...</div>');
    $('#claude-file-editor').val('').prop('disabled', true);
    $('#claude-file-name').text('Select a file');
    $('#claude-file-size').text('');
    $('#btn-save-claude-file').addClass('hidden');
    state.claudeFilesState.currentFile = null;

    openModal('modal-claude-files');

    if (!state.selectedProjectId) {
      $list.html('<div class="p-2 text-xs text-gray-500">No project selected</div>');
      return;
    }

    api.getClaudeFiles(state.selectedProjectId)
      .done(function(data) {
        state.claudeFilesState.files = data.files || [];
        renderClaudeFilesList();

        // Auto-select first file if available
        if (data.files && data.files.length > 0) {
          selectClaudeFile(data.files[0].path);
        }
      })
      .fail(function() {
        $list.html('<div class="p-2 text-xs text-red-400">Failed to load files</div>');
      });
  }

  function renderClaudeFilesList() {
    var $list = $('#claude-files-list');
    var files = state.claudeFilesState.files;

    if (files.length === 0) {
      $list.html('<div class="p-2 text-xs text-gray-500">No CLAUDE.md files found</div>');
      return;
    }

    var html = '';

    files.forEach(function(file) {
      var isSelected = state.claudeFilesState.currentFile &&
                       state.claudeFilesState.currentFile.path === file.path;
      var selectedClass = isSelected ? 'bg-purple-600/30 border-l-2 border-purple-500' : 'hover:bg-gray-700';
      var icon = file.isGlobal
        ? '<svg class="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
        : '<svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>';

      html += '<div class="claude-file-item p-2 cursor-pointer ' + selectedClass + '" data-path="' + escapeHtml(file.path) + '">' +
        '<div class="flex items-center gap-2">' +
          icon +
          '<span class="text-xs text-gray-300 truncate">' + escapeHtml(file.name) + '</span>' +
        '</div>' +
        '<div class="text-xs text-gray-500 mt-0.5 pl-5">' + formatFileSize(file.size) + '</div>' +
      '</div>';
    });

    $list.html(html);
  }

  function selectClaudeFile(filePath) {
    var file = state.claudeFilesState.files.find(function(f) { return f.path === filePath; });

    if (!file) return;

    state.claudeFilesState.currentFile = {
      path: file.path,
      name: file.name,
      content: file.content,
      originalContent: file.content,
      size: file.size,
      isGlobal: file.isGlobal
    };

    $('#claude-file-name').text(file.name);
    $('#claude-file-size').text(formatFileSize(file.size));
    $('#claude-file-editor').val(file.content).prop('disabled', false);
    $('#btn-save-claude-file').addClass('hidden');
    updateClaudeFilePreview();

    renderClaudeFilesList();

    // Show editor in mobile view
    showMobileClaudeFileEditor();
  }

  function toggleClaudeFilePreview() {
    var $previewPane = $('#claude-preview-pane');
    var $editorPane = $('#claude-editor-pane');
    var $btn = $('#btn-toggle-claude-preview');
    var $btnText = $('#claude-preview-btn-text');
    var $icon = $('#claude-preview-icon');
    var isPreviewMode = !$previewPane.hasClass('hidden');

    if (isPreviewMode) {
      // Switch to edit view
      $previewPane.addClass('hidden');
      $editorPane.removeClass('hidden');
      $btn.removeClass('bg-purple-600').addClass('bg-gray-700');
      $btnText.text('Preview');
      // Eye icon for preview
      $icon.html('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>');
    } else {
      // Switch to preview view
      $previewPane.removeClass('hidden');
      $editorPane.addClass('hidden');
      $btn.addClass('bg-purple-600').removeClass('bg-gray-700');
      $btnText.text('Edit');
      // Pencil icon for edit
      $icon.html('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>');
      updateClaudeFilePreview();
    }
  }

  function updateClaudeFilePreview() {
    var $preview = $('#claude-file-preview');
    var $previewPane = $('#claude-preview-pane');

    if ($previewPane.hasClass('hidden')) return;

    var content = $('#claude-file-editor').val();

    if (!content) {
      $preview.html('<p class="text-gray-500">No content to preview</p>');
      return;
    }

    // Render markdown with syntax highlighting
    try {
      var html = marked.parse(content);
      $preview.html(html);
      // Apply syntax highlighting to code blocks
      $preview.find('pre code').each(function() {
        hljs.highlightElement(this);
      });
    } catch (e) {
      $preview.html('<p class="text-red-400">Error rendering preview</p>');
    }
  }

  function saveClaudeFile() {
    var currentFile = state.claudeFilesState.currentFile;

    if (!currentFile || !state.selectedProjectId) return;

    var newContent = $('#claude-file-editor').val();
    var $btn = $('#btn-save-claude-file');

    $btn.text('Saving...').prop('disabled', true);

    api.saveClaudeFile(state.selectedProjectId, currentFile.path, newContent)
      .done(function() {
        currentFile.content = newContent;
        currentFile.originalContent = newContent;
        $btn.addClass('hidden').text('Save Changes').prop('disabled', false);
        showToast('File saved', 'success');

        // Update size in files list
        var file = state.claudeFilesState.files.find(function(f) {
          return f.path === currentFile.path;
        });

        if (file) {
          file.content = newContent;
          file.size = new Blob([newContent]).size;
        }

        renderClaudeFilesList();
      })
      .fail(function(xhr) {
        $btn.text('Save Changes').prop('disabled', false);
        showErrorToast(xhr, 'Failed to save file');
      });
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }

  // Alias for formatFileSize
  var formatBytes = formatFileSize;

  function renderNoProjectMessage() {
    return '<div class="text-center py-4">' +
      '<svg class="w-8 h-8 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>' +
      '</svg>' +
      '<p class="text-gray-500 text-sm">No project selected</p>' +
    '</div>';
  }

  function renderContextUsageError() {
    return '<div class="text-center py-4">' +
      '<svg class="w-8 h-8 mx-auto mb-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
      '</svg>' +
      '<p class="text-red-400 text-sm">Failed to load context usage</p>' +
    '</div>';
  }

  function renderContextUsage(usage) {
    if (!usage) {
      return '<div class="text-center py-4">' +
        '<svg class="w-8 h-8 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>' +
        '</svg>' +
        '<p class="text-gray-500 text-sm">No context usage data available</p>' +
        '<p class="text-gray-600 text-xs mt-1">Start an agent to see context usage</p>' +
      '</div>';
    }

    var percentColor = getPercentColor(usage.percentUsed);
    var percentBarWidth = Math.min(usage.percentUsed, 100);

    return '<div class="space-y-4">' +
      // Progress bar
      '<div class="space-y-2">' +
        '<div class="flex justify-between text-sm">' +
          '<span class="text-gray-400">Context Window</span>' +
          '<span class="' + percentColor + ' font-medium">' + usage.percentUsed + '%</span>' +
        '</div>' +
        '<div class="w-full bg-gray-700 rounded-full h-3">' +
          '<div class="' + getPercentBarColor(usage.percentUsed) + ' h-3 rounded-full transition-all duration-300" style="width: ' + percentBarWidth + '%"></div>' +
        '</div>' +
        '<div class="flex justify-between text-xs text-gray-500">' +
          '<span>' + formatNumber(usage.totalTokens) + ' tokens used</span>' +
          '<span>' + formatNumber(usage.maxContextTokens) + ' max</span>' +
        '</div>' +
      '</div>' +

      // Token breakdown
      '<div class="border-t border-gray-700 pt-4">' +
        '<h4 class="text-sm font-medium text-gray-300 mb-3">Token Breakdown</h4>' +
        '<div class="grid grid-cols-2 gap-3">' +
          renderTokenStat('Input', usage.inputTokens, 'text-blue-400') +
          renderTokenStat('Output', usage.outputTokens, 'text-green-400') +
          renderTokenStat('Cache Created', usage.cacheCreationInputTokens, 'text-yellow-400') +
          renderTokenStat('Cache Read', usage.cacheReadInputTokens, 'text-purple-400') +
        '</div>' +
      '</div>' +

      // Total
      '<div class="border-t border-gray-700 pt-4">' +
        '<div class="flex justify-between items-center">' +
          '<span class="text-gray-400">Total Tokens</span>' +
          '<span class="text-lg font-semibold text-white">' + formatNumber(usage.totalTokens) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderTokenStat(label, value, colorClass) {
    return '<div class="bg-gray-700/50 rounded-lg p-3">' +
      '<div class="text-xs text-gray-500 mb-1">' + label + '</div>' +
      '<div class="' + colorClass + ' font-medium">' + formatNumber(value) + '</div>' +
    '</div>';
  }

  function getPercentColor(percent) {
    if (percent < 50) return 'text-green-400';
    if (percent < 75) return 'text-yellow-400';
    if (percent < 90) return 'text-orange-400';
    return 'text-red-400';
  }

  function getPercentBarColor(percent) {
    if (percent < 50) return 'bg-green-500';
    if (percent < 75) return 'bg-yellow-500';
    if (percent < 90) return 'bg-orange-500';
    return 'bg-red-500';
  }

  function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  }

  // Project card rendering
  function renderProjectCard(project) {
    var statusClass = project.status || 'stopped';
    var statusText = capitalizeFirst(statusClass);
    var quickActions = renderQuickActions(project);
    var isWaiting = project.isWaitingForInput || false;
    var waitingClass = isWaiting ? ' waiting-for-input' : '';
    var waitingIndicator = isWaiting ? '<span class="waiting-indicator" title="Waiting for your input"></span>' : '';

    return '<div class="project-card' + waitingClass + '" data-id="' + project.id + '">' +
      '<div class="flex justify-between items-start">' +
        '<div class="project-card-name flex-1 truncate">' + escapeHtml(project.name) + '</div>' +
        quickActions +
      '</div>' +
      '<div class="project-card-path">' + escapeHtml(project.path) + '</div>' +
      '<div class="project-card-status">' +
        '<span class="status-badge ' + statusClass + '">' + statusText + '</span>' +
        waitingIndicator +
        (statusClass === 'running' && !isWaiting ? '<span class="running-indicator"></span>' : '') +
      '</div>' +
    '</div>';
  }

  function renderQuickActions(project) {
    var status = project.status || 'stopped';
    var deleteBtn = '<button class="quick-action delete" data-action="delete" data-id="' + project.id + '" title="Delete">' +
      '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>';

    // Show cancel button for queued status
    if (status === 'queued') {
      return '<div class="flex gap-1">' +
        '<button class="quick-action cancel" data-action="cancel" data-id="' + project.id + '" title="Cancel">' +
        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>' +
        '</div>';
    }

    // Only delete button in sidebar (no start/stop buttons)
    return '<div class="flex gap-1">' + deleteBtn + '</div>';
  }

  function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Project list rendering
  function sortProjects(projects) {
    return projects.slice().sort(function(a, b) {
      var aRunning = a.status === 'running' || a.status === 'queued';
      var bRunning = b.status === 'running' || b.status === 'queued';

      if (aRunning && !bRunning) return -1;
      if (!aRunning && bRunning) return 1;

      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }

  function renderProjectList() {
    var $list = $('#project-list');
    $list.empty();

    if (state.projects.length === 0) {
      $list.html('<div class="text-gray-500 text-sm text-center p-4">No projects yet</div>');

      // Also update overview if visible
      if (!state.selectedProjectId) {
        renderProjectOverview();
      }

      return;
    }

    var sortedProjects = sortProjects(state.projects);
    sortedProjects.forEach(function(project) {
      $list.append(renderProjectCard(project));
    });

    updateSelectedProject();
    updateRunningCount();

    // Also update overview if visible (no project selected)
    if (!state.selectedProjectId) {
      renderProjectOverview();
    }
  }

  function updateSelectedProject() {
    $('.project-card').removeClass('selected');

    if (state.selectedProjectId) {
      $('.project-card[data-id="' + state.selectedProjectId + '"]').addClass('selected');
    }
  }

  function updateRunningCount() {
    var count = state.projects.filter(function(p) { return p.status === 'running'; }).length;
    var queuedCount = state.projects.filter(function(p) { return p.status === 'queued'; }).length;

    $('#running-count').text(count);
    $('#max-concurrent').text(state.resourceStatus.maxConcurrent);
    $('#queued-count').text(queuedCount);

    if (queuedCount > 0) {
      $('#queue-info').removeClass('hidden');
    } else {
      $('#queue-info').addClass('hidden');
    }
  }

  function updateResourceStatus(resourceStatus) {
    state.resourceStatus = resourceStatus;
    $('#max-concurrent').text(resourceStatus.maxConcurrent);
    $('#running-count').text(resourceStatus.runningCount);
    $('#queued-count').text(resourceStatus.queuedCount);

    if (resourceStatus.queuedCount > 0) {
      $('#queue-info').removeClass('hidden');
    } else {
      $('#queue-info').addClass('hidden');
    }
  }

  // Project detail rendering
  function renderProjectDetail(project) {
    if (!project) {
      $('#project-detail').addClass('hidden');
      $('#empty-state').removeClass('hidden');
      renderProjectOverview();
      return;
    }

    $('#empty-state').addClass('hidden');
    $('#project-detail').removeClass('hidden');

    $('#project-name').text(project.name);

    updateProjectStatus(project);
    renderConversation(project.id);
  }

  function renderProjectOverview() {
    var $overview = $('#project-overview');

    if (state.projects.length === 0) {
      $overview.html(
        '<div class="flex flex-col items-center justify-center h-full text-center">' +
          '<svg class="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>' +
          '</svg>' +
          '<h2 class="text-xl font-semibold text-gray-400 mb-2">No Projects Yet</h2>' +
          '<p class="text-sm text-gray-500 mb-4">Create your first project to get started</p>' +
          '<button id="btn-add-project-overview" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm">' +
            'Add Project' +
          '</button>' +
        '</div>'
      );

      $('#btn-add-project-overview').on('click', function() {
        $('#modal-add-project').removeClass('hidden');
      });
      return;
    }

    var html = '<div class="mb-6">' +
      '<h2 class="text-xl font-semibold text-white mb-1">Projects</h2>' +
      '<p class="text-sm text-gray-400">Select a project to start working</p>' +
    '</div>';

    html += '<div class="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">';

    var sortedProjects = sortProjects(state.projects);
    sortedProjects.forEach(function(project) {
      html += renderProjectOverviewCard(project);
    });

    html += '</div>';

    $overview.html(html);

    // Attach click handlers for overview cards
    $overview.find('.project-overview-card').on('click', function(e) {
      if ($(e.target).closest('.overview-action').length) return;
      var projectId = $(this).data('id');
      selectProject(projectId);
    });

    $overview.find('.overview-action[data-action="delete"]').on('click', function(e) {
      e.stopPropagation();
      var projectId = $(this).data('id');
      state.pendingDeleteId = projectId;
      var project = findProjectById(projectId);
      $('#delete-project-name').text(project ? project.name : 'Unknown');
      $('#modal-delete-project').removeClass('hidden');
    });

    $overview.find('.overview-action[data-action="start"]').on('click', function(e) {
      e.stopPropagation();
      var projectId = $(this).data('id');
      selectProject(projectId);
    });
  }

  function renderProjectOverviewCard(project) {
    var statusClass = project.status || 'stopped';
    var statusText = capitalizeFirst(statusClass);
    var isWaiting = project.isWaitingForInput || false;
    var waitingClass = isWaiting ? ' waiting-for-input' : '';

    var contextInfo = '';

    if (project.contextUsage) {
      var percent = project.contextUsage.percentUsed || 0;
      contextInfo = '<div class="mt-2 text-xs text-gray-500">' +
        '<span class="inline-flex items-center gap-1">' +
          '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>' +
          '</svg>' +
          'Context: ' + percent.toFixed(0) + '%' +
        '</span>' +
      '</div>';
    }

    var waitingIndicator = isWaiting ?
      '<span class="ml-2 text-yellow-400 text-xs">(waiting for input)</span>' : '';

    var runningIndicator = (statusClass === 'running' && !isWaiting) ?
      '<span class="running-indicator ml-2"></span>' : '';

    var actionButton = '';

    if (statusClass === 'stopped') {
      actionButton = '<button class="overview-action text-gray-400 hover:text-green-400 p-1" data-action="start" data-id="' + project.id + '" title="Open Project">' +
        '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
        '</svg>' +
      '</button>';
    }

    var deleteButton = '<button class="overview-action text-gray-400 hover:text-red-400 p-1" data-action="delete" data-id="' + project.id + '" title="Delete Project">' +
      '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' +
      '</svg>' +
    '</button>';

    return '<div class="project-overview-card bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-750 transition-colors border border-gray-700 hover:border-gray-600' + waitingClass + '" data-id="' + project.id + '">' +
      '<div class="flex justify-between items-start mb-2">' +
        '<h3 class="font-semibold text-white truncate flex-1">' + escapeHtml(project.name) + '</h3>' +
        '<div class="flex items-center gap-1 ml-2">' +
          actionButton +
          deleteButton +
        '</div>' +
      '</div>' +
      '<div class="text-xs text-gray-400 truncate mb-3" title="' + escapeHtml(project.path) + '">' +
        '<svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>' +
        '</svg>' +
        escapeHtml(project.path) +
      '</div>' +
      '<div class="flex items-center">' +
        '<span class="status-badge ' + statusClass + '">' + statusText + '</span>' +
        waitingIndicator +
        runningIndicator +
      '</div>' +
      contextInfo +
    '</div>';
  }

  function updateProjectStatus(project) {
    var statusClass = project.status || 'stopped';
    var $badge = $('#project-status');

    $badge.removeClass('stopped running error queued')
          .addClass(statusClass)
          .text(capitalizeFirst(statusClass));

    if (statusClass === 'running') {
      $('#mode-selector').addClass('disabled');
    } else if (statusClass === 'queued') {
      $('#mode-selector').addClass('disabled');
    } else {
      $('#mode-selector').removeClass('disabled');
      state.currentAgentMode = null;
    }

    updateStartStopButtons();
    updateInputArea();
  }

  // Conversation rendering
  function renderConversation(projectId) {
    var $conv = $('#conversation');
    var messages = state.conversations[projectId] || [];

    $conv.empty();

    // Filter messages based on debug mode and type
    var filteredMessages = messages.filter(function(msg) {
      // Skip debug messages unless debug panel is open
      if (isDebugMessage(msg) && !state.debugPanelOpen) {
        return false;
      }

      // Skip tool_result messages - they update tool status, not displayed separately
      if (msg.type === 'tool_result') {
        return false;
      }

      return true;
    });

    if (filteredMessages.length === 0) {
      $conv.html('<div class="text-gray-500 text-center">No conversation yet</div>');
      return;
    }

    filteredMessages.forEach(function(msg) {
      $conv.append(renderMessage(msg));
    });

    scrollConversationToBottom();
  }

  function renderMessage(msg) {
    var typeClass = msg.type || 'system';

    if (msg.type === 'tool_use') {
      return renderToolMessage(msg);
    }

    if (msg.type === 'question') {
      return renderQuestionMessage(msg);
    }

    if (msg.type === 'permission') {
      return renderPermissionMessage(msg);
    }

    if (msg.type === 'plan_mode') {
      return renderPlanModeMessage(msg);
    }

    if (msg.type === 'compaction') {
      return renderCompactionMessage(msg);
    }

    if (msg.type === 'user') {
      var userHtml = '<div class="conversation-message user" data-msg-type="user">' +
        '<div class="message-header">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>' +
          '</svg>' +
          '<span class="message-sender">You</span>' +
        '</div>';

      // Add images if present
      if (msg.images && msg.images.length > 0) {
        userHtml += '<div class="flex flex-wrap gap-2 mb-2">';
        msg.images.forEach(function(img) {
          userHtml += '<img src="' + img.dataUrl + '" alt="Attached image" class="conversation-image" onclick="window.showImageModal(this.src)">';
        });
        userHtml += '</div>';
      }

      // Add text content if present (render with markdown)
      if (msg.content) {
        var userRenderedContent = renderMarkdown(msg.content);
        userHtml += '<div class="message-content markdown-content">' + userRenderedContent + '</div>';
      }

      userHtml += '</div>';
      return userHtml;
    }

    // Render stdout/assistant messages with markdown and Claude icon
    if (msg.type === 'stdout' || msg.type === 'assistant') {
      var renderedContent = renderMarkdown(msg.content);
      return '<div class="conversation-message ' + typeClass + ' markdown-content" data-msg-type="assistant">' +
        '<div class="message-header claude-header">' +
          '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">' +
            '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>' +
          '</svg>' +
          '<span class="message-sender">Claude</span>' +
        '</div>' +
        '<div class="message-content">' + renderedContent + '</div>' +
      '</div>';
    }

    return '<div class="conversation-message ' + typeClass + '" data-msg-type="system">' +
      '<pre class="whitespace-pre-wrap">' + escapeHtml(msg.content) + '</pre>' +
    '</div>';
  }

  function renderMarkdown(content) {
    if (typeof marked === 'undefined') {
      return '<pre class="whitespace-pre-wrap">' + escapeHtml(content) + '</pre>';
    }

    try {
      // Configure marked for safe rendering
      marked.setOptions({
        breaks: true,
        gfm: true
      });
      return marked.parse(content);
    } catch (e) {
      return '<pre class="whitespace-pre-wrap">' + escapeHtml(content) + '</pre>';
    }
  }

  function renderQuestionMessage(msg) {
    var info = msg.questionInfo || {};
    var question = info.question || msg.content;
    var options = info.options || [];
    var header = info.header || 'Question';

    var html = '<div class="conversation-message question" data-msg-type="system">' +
      '<div class="question-header">' +
        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
        '</svg>' +
        '<span class="question-label">' + escapeHtml(header) + '</span>' +
      '</div>' +
      '<div class="question-text">' + escapeHtml(question) + '</div>';

    if (options.length > 0) {
      html += '<div class="question-options">';

      options.forEach(function(opt, index) {
        html += '<button class="question-option" data-option-index="' + index + '" data-option-label="' + escapeHtml(opt.label) + '">' +
          '<span class="option-label">' + escapeHtml(opt.label) + '</span>';

        if (opt.description) {
          html += '<span class="option-description">' + escapeHtml(opt.description) + '</span>';
        }

        html += '</button>';
      });

      // Add "Other" option for custom input
      html += '<button class="question-option question-option-other" data-option-index="-1">' +
        '<span class="option-label">Other...</span>' +
        '<span class="option-description">Type a custom response</span>' +
      '</button>';

      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderPermissionMessage(msg) {
    var info = msg.permissionInfo || {};
    var tool = info.tool || 'Unknown';
    var action = info.action || msg.content;
    var details = info.details || {};

    var html = '<div class="conversation-message permission" data-msg-type="system">' +
      '<div class="permission-header">' +
        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>' +
        '</svg>' +
        '<span class="permission-label">Permission Request</span>' +
        '<span class="permission-tool">' + escapeHtml(tool) + '</span>' +
      '</div>' +
      '<div class="permission-action">' + escapeHtml(action) + '</div>';

    // Show details if available
    if (details.file_path) {
      html += '<div class="permission-detail"><span class="detail-label">File:</span> <code>' + escapeHtml(details.file_path) + '</code></div>';
    }

    if (details.command) {
      html += '<div class="permission-detail"><span class="detail-label">Command:</span> <pre>' + escapeHtml(details.command) + '</pre></div>';
    }

    html += '<div class="permission-actions">' +
      '<button class="permission-btn approve" data-response="yes">Approve</button>' +
      '<button class="permission-btn deny" data-response="no">Deny</button>' +
      '<button class="permission-btn always" data-response="always">Always Allow</button>' +
    '</div>';

    html += '</div>';
    return html;
  }

  function renderPlanModeMessage(msg) {
    var info = msg.planModeInfo || {};
    var action = info.action || 'enter';
    var isEnter = action === 'enter';

    var iconPath = isEnter
      ? 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01'
      : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';

    var label = isEnter ? 'Plan Mode' : 'Plan Ready';
    var bgClass = isEnter ? 'bg-blue-900/40 border-blue-500' : 'bg-green-900/40 border-green-500';
    var iconClass = isEnter ? 'text-blue-400' : 'text-green-400';

    // Plan file path is now tracked from Write tool calls in appendMessage()

    var html = '<div class="conversation-message plan-mode ' + bgClass + ' border-l-2 p-3 rounded" data-msg-type="system">' +
      '<div class="flex items-center gap-2 mb-2">' +
        '<svg class="w-5 h-5 ' + iconClass + '" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="' + iconPath + '"/>' +
        '</svg>' +
        '<span class="font-medium text-white">' + label + '</span>' +
      '</div>' +
      '<div class="text-gray-300 text-sm">' + escapeHtml(msg.content) + '</div>';

    // Show plan content and action buttons for exit plan mode
    if (!isEnter) {
      // Container for plan content (will be loaded asynchronously)
      html += '<div class="plan-content-container mt-3 mb-3"></div>';

      // Action buttons: Yes, I want to change something, No
      html += '<div class="plan-mode-actions flex gap-2 mt-3">' +
        '<button class="plan-approve-btn bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">' +
          'Yes' +
        '</button>' +
        '<button class="plan-request-changes-btn bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">' +
          'I want to change something' +
        '</button>' +
        '<button class="plan-reject-btn bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">' +
          'No' +
        '</button>' +
      '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderCompactionMessage(msg) {
    var html = '<div class="conversation-message compaction bg-amber-900/30 border-l-2 border-amber-500 p-3 rounded" data-msg-type="system">' +
      '<div class="flex items-center gap-2 mb-2">' +
        '<svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>' +
        '</svg>' +
        '<span class="font-medium text-amber-300">Context Compacted</span>' +
      '</div>' +
      '<div class="text-gray-300 text-sm">' +
        'The conversation history was summarized to reduce token usage. Previous context has been condensed.' +
      '</div>';

    // Show the summary if provided
    if (msg.content && msg.content !== 'Context was compacted to reduce token usage.') {
      html += '<details class="mt-2">' +
        '<summary class="text-amber-400 text-xs cursor-pointer hover:text-amber-300">View Summary</summary>' +
        '<div class="mt-2 text-gray-400 text-xs bg-gray-800/50 p-2 rounded max-h-40 overflow-y-auto">' +
          '<pre class="whitespace-pre-wrap">' + escapeHtml(msg.content) + '</pre>' +
        '</div>' +
      '</details>';
    }

    html += '</div>';
    return html;
  }

  // Store tool data by ID for modal access (avoids JSON in HTML attributes)
  var toolDataStore = {};

  function renderToolMessage(msg) {
    var toolInfo = msg.toolInfo || {};
    var toolName = toolInfo.name || 'Tool';
    var toolInput = toolInfo.input || {};
    var toolId = toolInfo.id || ('tool-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    var status = toolInfo.status || 'running';
    var iconHtml = getToolIcon(toolName);

    // Store tool data in JavaScript object for modal access
    toolDataStore[toolId] = {
      name: toolName,
      input: toolInput,
      status: status
    };

    var html = '<div class="conversation-message tool-use" data-tool-id="' + escapeHtml(toolId) + '" data-msg-type="tool">' +
      '<div class="tool-header">' +
        iconHtml +
        '<span class="tool-name">' + escapeHtml(toolName) + '</span>' +
        '<span class="tool-status ' + status + '"></span>' +
        '<span class="ml-auto text-xs text-gray-500">Click for details</span>' +
      '</div>';

    // Show tool arguments preview (limited diff lines)
    html += renderToolArgsPreview(toolName, toolInput);

    html += '</div>';
    return html;
  }

  // Update tool status when result arrives
  function updateToolStatus(toolId, status, resultContent) {
    var $tool = $('[data-tool-id="' + toolId + '"]');

    if ($tool.length === 0) return;

    // Update status indicator
    $tool.find('.tool-status').removeClass('running completed failed').addClass(status);

    // Update stored data
    if (toolDataStore[toolId]) {
      toolDataStore[toolId].status = status;

      if (resultContent) {
        toolDataStore[toolId].resultContent = resultContent;
      }
    }

    // If there's result content (especially for errors), show it
    if (resultContent && status === 'failed') {
      var $resultEl = $tool.find('.tool-result-content');

      if ($resultEl.length === 0) {
        // Create result content element
        var truncatedContent = resultContent.length > 200
          ? resultContent.substring(0, 200) + '...'
          : resultContent;
        $tool.append(
          '<div class="tool-result-content mt-2 p-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-300">' +
            '<pre class="whitespace-pre-wrap break-words">' + escapeHtml(truncatedContent) + '</pre>' +
          '</div>'
        );
      }
    }
  }

  function getToolIcon(toolName) {
    var icons = {
      'Read': '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
      'Write': '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>',
      'Edit': '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>',
      'Bash': '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
      'Glob': '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>',
      'Grep': '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>',
      'Task': '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>'
    };
    return icons[toolName] || '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>';
  }

  function renderToolArgs(toolName, input) {
    if (!input || Object.keys(input).length === 0) {
      return '';
    }

    var html = '<div class="tool-args">';

    switch (toolName) {
      case 'Read':
        if (input.file_path) {
          html += '<div class="tool-arg"><span class="arg-label">Path:</span> <code class="arg-value file-path">' + escapeHtml(input.file_path) + '</code></div>';
        }
        break;

      case 'Write':
        if (input.file_path) {
          html += '<div class="tool-arg"><span class="arg-label">Path:</span> <code class="arg-value file-path">' + escapeHtml(input.file_path) + '</code></div>';
        }

        if (input.content) {
          // Check if we have cached content from a previous Read
          var cachedContent = input.file_path ? getCachedFileContent(input.file_path) : null;

          if (cachedContent !== null) {
            // Show diff between previous content and new content
            html += '<div class="tool-arg"><span class="text-blue-400 text-xs italic">Diff against previously read file</span></div>';
            html += renderDiff(cachedContent, input.content, input.file_path);
          } else {
            // Show content being written as all additions (no previous content)
            html += renderDiff('', input.content, input.file_path);
          }
        }
        break;

      case 'Edit':
        if (input.file_path) {
          html += '<div class="tool-arg"><span class="arg-label">Path:</span> <code class="arg-value file-path">' + escapeHtml(input.file_path) + '</code></div>';
        }

        if (input.old_string && input.new_string) {
          html += renderDiff(input.old_string, input.new_string, input.file_path);
        }
        break;

      case 'Bash':
        if (input.command) {
          html += '<div class="tool-arg"><pre class="arg-value bash-command">' + escapeHtml(input.command) + '</pre></div>';
        }
        break;

      case 'Glob':
        if (input.pattern) {
          html += '<div class="tool-arg"><span class="arg-label">Pattern:</span> <code class="arg-value">' + escapeHtml(input.pattern) + '</code></div>';
        }
        break;

      case 'Grep':
        if (input.pattern) {
          html += '<div class="tool-arg"><span class="arg-label">Pattern:</span> <code class="arg-value">' + escapeHtml(input.pattern) + '</code></div>';
        }

        if (input.path) {
          html += '<div class="tool-arg"><span class="arg-label">Path:</span> <code class="arg-value file-path">' + escapeHtml(input.path) + '</code></div>';
        }
        break;

      case 'TodoWrite':
        // Handle both direct object and string input
        var todoItems = input.todos;

        if (typeof input === 'string') {
          try {
            var parsedInput = JSON.parse(input);
            todoItems = parsedInput.todos;
          } catch (e) {
            // If parsing fails, show nothing
          }
        }

        html += renderTodoList(todoItems || []);
        break;

      default:
        // Show all inputs for unknown tools
        for (var key in input) {
          if (input.hasOwnProperty(key)) {
            var value = typeof input[key] === 'string' ? input[key] : JSON.stringify(input[key]);
            html += '<div class="tool-arg"><span class="arg-label">' + escapeHtml(key) + ':</span> <span class="arg-value">' + escapeHtml(truncateString(value, 100)) + '</span></div>';
          }
        }
    }

    html += '</div>';
    return html;
  }

  function renderTodoList(todos) {
    if (!todos || todos.length === 0) {
      return '<div class="text-gray-500 text-xs italic">No tasks</div>';
    }

    var html = '<div class="todo-list space-y-1 mt-2">';

    for (var i = 0; i < todos.length; i++) {
      var todo = todos[i];
      var statusIcon = getTodoStatusIcon(todo.status);
      var statusClass = getTodoStatusClass(todo.status);

      html += '<div class="todo-item flex items-start gap-2 p-2 rounded bg-gray-800/50 ' + statusClass + '">' +
        '<span class="todo-icon flex-shrink-0 mt-0.5">' + statusIcon + '</span>' +
        '<div class="todo-content flex-1 min-w-0">' +
          '<div class="todo-text text-sm">' + escapeHtml(todo.content) + '</div>' +
        '</div>' +
        '<span class="todo-status-badge text-xs px-1.5 py-0.5 rounded ' + getStatusBadgeClass(todo.status) + '">' +
          escapeHtml(formatTodoStatus(todo.status)) +
        '</span>' +
      '</div>';
    }

    html += '</div>';
    return html;
  }

  function getTodoStatusIcon(status) {
    switch (status) {
      case 'completed':
        return '<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>' +
        '</svg>';
      case 'in_progress':
        return '<svg class="w-4 h-4 text-yellow-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>' +
        '</svg>';
      case 'pending':
      default:
        return '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<circle cx="12" cy="12" r="10" stroke-width="2"/>' +
        '</svg>';
    }
  }

  function getTodoStatusClass(status) {
    switch (status) {
      case 'completed':
        return 'border-l-2 border-green-500/50';
      case 'in_progress':
        return 'border-l-2 border-yellow-500/50';
      case 'pending':
      default:
        return 'border-l-2 border-gray-600/50';
    }
  }

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'completed':
        return 'bg-green-900/50 text-green-400';
      case 'in_progress':
        return 'bg-yellow-900/50 text-yellow-400';
      case 'pending':
      default:
        return 'bg-gray-700 text-gray-400';
    }
  }

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

  function updateCurrentTodos(input) {
    var todoItems = input.todos;

    if (typeof input === 'string') {
      try {
        var parsedInput = JSON.parse(input);
        todoItems = parsedInput.todos;
      } catch (e) {
        return;
      }
    }

    if (Array.isArray(todoItems)) {
      state.currentTodos = todoItems;
      updateTasksButtonBadge();
      updateTasksModalContent();
    }
  }

  function updateTasksButtonBadge() {
    var $badge = $('#tasks-badge');
    var todos = state.currentTodos;

    if (!todos || todos.length === 0) {
      $badge.addClass('hidden');
      return;
    }

    var inProgress = todos.filter(function(t) { return t.status === 'in_progress'; }).length;
    var pending = todos.filter(function(t) { return t.status === 'pending'; }).length;
    var active = inProgress + pending;

    if (active > 0) {
      $badge.text(active).removeClass('hidden');
    } else {
      $badge.addClass('hidden');
    }
  }

  function updateTasksModalContent() {
    var $content = $('#tasks-modal-content');

    if (!$('#modal-tasks').hasClass('hidden')) {
      $content.html(renderTasksModalContent());
    }
  }

  function renderTasksModalContent() {
    var todos = state.currentTodos;

    if (!todos || todos.length === 0) {
      return '<div class="text-center py-8">' +
        '<svg class="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>' +
        '</svg>' +
        '<p class="text-gray-400">No active tasks</p>' +
        '<p class="text-gray-600 text-sm mt-1">Tasks will appear here when Claude starts working</p>' +
      '</div>';
    }

    // Calculate stats
    var completed = todos.filter(function(t) { return t.status === 'completed'; }).length;
    var inProgress = todos.filter(function(t) { return t.status === 'in_progress'; }).length;
    var pending = todos.filter(function(t) { return t.status === 'pending'; }).length;
    var total = todos.length;
    var percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    var html = '';

    // Progress bar
    html += '<div class="mb-4">' +
      '<div class="flex justify-between text-xs text-gray-400 mb-1">' +
        '<span>' + completed + ' of ' + total + ' completed</span>' +
        '<span>' + percent + '%</span>' +
      '</div>' +
      '<div class="w-full bg-gray-700 rounded-full h-2">' +
        '<div class="bg-green-500 h-2 rounded-full transition-all duration-300" style="width: ' + percent + '%"></div>' +
      '</div>' +
      '<div class="flex gap-4 mt-2 text-xs">' +
        '<span class="text-green-400">' + completed + ' done</span>' +
        '<span class="text-yellow-400">' + inProgress + ' in progress</span>' +
        '<span class="text-gray-400">' + pending + ' pending</span>' +
      '</div>' +
    '</div>';

    // Task list
    html += '<div class="space-y-2 max-h-80 overflow-y-auto">';

    for (var i = 0; i < todos.length; i++) {
      var todo = todos[i];
      var statusIcon = getTodoStatusIcon(todo.status);
      var statusClass = getTodoStatusClass(todo.status);
      var activeText = todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : '';

      html += '<div class="todo-item flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 ' + statusClass + '">' +
        '<span class="todo-icon flex-shrink-0 mt-0.5">' + statusIcon + '</span>' +
        '<div class="todo-content flex-1 min-w-0">' +
          '<div class="todo-text text-sm text-gray-200">' + escapeHtml(todo.content) + '</div>' +
          (activeText ? '<div class="text-xs text-yellow-400 mt-1 italic">' + escapeHtml(activeText) + '</div>' : '') +
        '</div>' +
        '<span class="todo-status-badge text-xs px-2 py-0.5 rounded font-medium ' + getStatusBadgeClass(todo.status) + '">' +
          escapeHtml(formatTodoStatus(todo.status)) +
        '</span>' +
      '</div>';
    }

    html += '</div>';

    return html;
  }

  function openTasksModal() {
    $('#tasks-modal-content').html(renderTasksModalContent());
    openModal('modal-tasks');
  }

  function openOptimizationsModal() {
    if (!state.selectedProjectId) {
      showToast('Please select a project first', 'error');
      return;
    }

    $('#optimizations-modal-content').html('<div class="text-gray-500 text-center py-4">Loading optimizations...</div>');
    openModal('modal-optimizations');

    api.getOptimizations(state.selectedProjectId)
      .done(function(data) {
        $('#optimizations-modal-content').html(renderOptimizationsContent(data));
      })
      .fail(function() {
        $('#optimizations-modal-content').html('<div class="text-red-400 text-center py-4">Failed to load optimizations</div>');
      });
  }

  function renderOptimizationsContent(data) {
    var checks = data.checks || [];
    var html = '<div class="space-y-3">';

    checks.forEach(function(check) {
      var borderClass, bgClass, iconHtml, statusClass;

      if (check.status === 'passed') {
        borderClass = 'border-green-500';
        bgClass = 'bg-green-900/20';
        statusClass = 'text-green-400';
        iconHtml = '<svg class="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
          '</svg>';
      } else if (check.status === 'warning') {
        borderClass = 'border-yellow-500';
        bgClass = 'bg-yellow-900/20';
        statusClass = 'text-yellow-400';
        iconHtml = '<svg class="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>' +
          '</svg>';
      } else {
        borderClass = 'border-blue-500';
        bgClass = 'bg-blue-900/20';
        statusClass = 'text-blue-400';
        iconHtml = '<svg class="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
          '</svg>';
      }

      html += '<div class="border-l-2 ' + borderClass + ' ' + bgClass + ' p-3 rounded">';
      html += '<div class="flex items-start gap-3">';
      html += iconHtml;
      html += '<div class="flex-1 min-w-0">';

      // Title and status on same row
      html += '<div class="flex items-center justify-between gap-2">';
      html += '<p class="text-white font-medium text-sm">' + escapeHtml(check.title) + '</p>';
      html += '<span class="text-xs ' + statusClass + ' whitespace-nowrap">' + escapeHtml(check.statusMessage) + '</span>';
      html += '</div>';

      // Description
      html += '<p class="text-gray-400 text-xs mt-1">' + escapeHtml(check.description) + '</p>';

      // Action button (only if action exists)
      if (check.action && check.actionLabel) {
        html += '<div class="mt-2">';

        if (check.action === 'create') {
          html += '<button class="optimization-action bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs transition-colors" data-action="create" data-path="' + escapeHtml(check.filePath) + '">';
        } else if (check.action === 'edit') {
          html += '<button class="optimization-action bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs transition-colors" data-action="edit" data-path="' + escapeHtml(check.filePath) + '">';
        } else if (check.action === 'claude-files') {
          html += '<button class="optimization-action bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded text-xs transition-colors" data-action="claude-files">';
        }

        html += escapeHtml(check.actionLabel);
        html += '</button>';
        html += '</div>';
      }

      html += '</div>';
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';

    // Settings info
    html += '<div class="mt-4 pt-3 border-t border-gray-700">';
    html += '<p class="text-xs text-gray-500">CLAUDE.md max size threshold: ' + data.settings.claudeMdMaxSizeKB + ' KB</p>';
    html += '<p class="text-xs text-gray-500 mt-1">Change this in Settings to adjust the warning threshold.</p>';
    html += '</div>';

    return html;
  }

  function updateOptimizationsBadge(count) {
    var $badge = $('#optimizations-badge');

    if (count > 0) {
      $badge.text('!').removeClass('hidden');
    } else {
      $badge.addClass('hidden');
    }
  }

  function loadOptimizationsBadge(projectId) {
    if (!projectId) {
      updateOptimizationsBadge(0);
      return;
    }

    api.getOptimizations(projectId)
      .done(function(data) {
        var count = (data.optimizations || []).length;
        updateOptimizationsBadge(count);
      })
      .fail(function() {
        updateOptimizationsBadge(0);
      });
  }

  // Preview version - shows limited diff lines for inline display
  function renderToolArgsPreview(toolName, input) {
    if (!input || Object.keys(input).length === 0) {
      return '';
    }

    var html = '<div class="tool-args">';

    switch (toolName) {
      case 'Read':
        if (input.file_path) {
          html += '<div class="tool-arg"><span class="arg-label">Path:</span> <code class="arg-value file-path">' + escapeHtml(input.file_path) + '</code></div>';
        }
        break;

      case 'Write':
        if (input.file_path) {
          html += '<div class="tool-arg"><span class="arg-label">Path:</span> <code class="arg-value file-path">' + escapeHtml(input.file_path) + '</code></div>';
        }

        if (input.content) {
          var cachedContent = input.file_path ? getCachedFileContent(input.file_path) : null;

          if (cachedContent !== null) {
            html += '<div class="tool-arg"><span class="text-blue-400 text-xs italic">Diff against previously read file</span></div>';
            html += renderDiffPreview(cachedContent, input.content, input.file_path);
          } else {
            html += renderDiffPreview('', input.content, input.file_path);
          }
        }
        break;

      case 'Edit':
        if (input.file_path) {
          html += '<div class="tool-arg"><span class="arg-label">Path:</span> <code class="arg-value file-path">' + escapeHtml(input.file_path) + '</code></div>';
        }

        if (input.old_string && input.new_string) {
          html += renderDiffPreview(input.old_string, input.new_string, input.file_path);
        }
        break;

      case 'Bash':
        if (input.command) {
          var cmd = input.command;

          if (cmd.length > 200) {
            cmd = cmd.substring(0, 200) + '...';
          }

          html += '<div class="tool-arg"><pre class="arg-value bash-command">' + escapeHtml(cmd) + '</pre></div>';
        }
        break;

      case 'Glob':
        if (input.pattern) {
          html += '<div class="tool-arg"><span class="arg-label">Pattern:</span> <code class="arg-value">' + escapeHtml(input.pattern) + '</code></div>';
        }
        break;

      case 'Grep':
        if (input.pattern) {
          html += '<div class="tool-arg"><span class="arg-label">Pattern:</span> <code class="arg-value">' + escapeHtml(input.pattern) + '</code></div>';
        }

        if (input.path) {
          html += '<div class="tool-arg"><span class="arg-label">Path:</span> <code class="arg-value file-path">' + escapeHtml(input.path) + '</code></div>';
        }
        break;

      case 'TodoWrite':
        // Handle both direct object and string input
        var todos = input.todos;

        if (typeof input === 'string') {
          try {
            var parsed = JSON.parse(input);
            todos = parsed.todos;
          } catch (e) {
            // If parsing fails, show nothing
          }
        }

        html += renderTodoListPreview(todos || []);
        break;

      default:
        for (var key in input) {
          if (input.hasOwnProperty(key)) {
            var value = typeof input[key] === 'string' ? input[key] : JSON.stringify(input[key]);
            html += '<div class="tool-arg"><span class="arg-label">' + escapeHtml(key) + ':</span> <span class="arg-value">' + escapeHtml(truncateString(value, 100)) + '</span></div>';
          }
        }
    }

    html += '</div>';
    return html;
  }

  function renderTodoListPreview(todos) {
    if (!todos || todos.length === 0) {
      return '<div class="text-gray-500 text-xs italic">No tasks</div>';
    }

    // Count by status
    var completed = 0;
    var inProgress = 0;
    var pending = 0;

    for (var i = 0; i < todos.length; i++) {
      switch (todos[i].status) {
        case 'completed': completed++; break;
        case 'in_progress': inProgress++; break;
        default: pending++;
      }
    }

    // Summary line
    var html = '<div class="todo-preview flex items-center gap-3 text-xs">';
    html += '<span class="text-gray-400">' + todos.length + ' task' + (todos.length !== 1 ? 's' : '') + ':</span>';

    if (completed > 0) {
      html += '<span class="text-green-400">' + completed + ' done</span>';
    }

    if (inProgress > 0) {
      html += '<span class="text-yellow-400">' + inProgress + ' active</span>';
    }

    if (pending > 0) {
      html += '<span class="text-gray-500">' + pending + ' pending</span>';
    }

    html += '</div>';

    // Show first few tasks
    var maxPreview = 3;
    html += '<div class="todo-items-preview mt-1 space-y-0.5">';

    for (var j = 0; j < Math.min(todos.length, maxPreview); j++) {
      var todo = todos[j];
      var icon = getTodoStatusIconSmall(todo.status);
      html += '<div class="flex items-center gap-1.5 text-xs">' +
        icon +
        '<span class="' + getTodoTextClass(todo.status) + ' truncate">' + escapeHtml(truncateString(todo.content, 50)) + '</span>' +
      '</div>';
    }

    if (todos.length > maxPreview) {
      html += '<div class="text-gray-500 text-xs">+' + (todos.length - maxPreview) + ' more...</div>';
    }

    html += '</div>';
    return html;
  }

  function getTodoStatusIconSmall(status) {
    switch (status) {
      case 'completed':
        return '<svg class="w-3 h-3 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>' +
        '</svg>';
      case 'in_progress':
        return '<svg class="w-3 h-3 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>' +
        '</svg>';
      case 'pending':
      default:
        return '<svg class="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<circle cx="12" cy="12" r="10" stroke-width="2"/>' +
        '</svg>';
    }
  }

  function getTodoTextClass(status) {
    switch (status) {
      case 'completed':
        return 'text-green-400 line-through opacity-70';
      case 'in_progress':
        return 'text-yellow-400';
      case 'pending':
      default:
        return 'text-gray-400';
    }
  }

  var DIFF_PREVIEW_LINES = 15;

  // Map file extensions to highlight.js language names
  var extensionToLanguage = {
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

  function getLanguageFromPath(filePath) {
    if (!filePath) return null;

    var fileName = filePath.split(/[/\\]/).pop().toLowerCase();

    // Handle special filenames
    if (fileName === 'dockerfile') return 'dockerfile';
    if (fileName === 'makefile') return 'makefile';
    if (fileName.startsWith('.')) fileName = fileName.substring(1);

    var ext = fileName.split('.').pop();
    return extensionToLanguage[ext] || null;
  }

  function highlightCode(code, language) {
    if (!language || typeof hljs === 'undefined') {
      return escapeHtml(code);
    }

    try {
      var result = hljs.highlight(code, { language: language, ignoreIllegals: true });
      return result.value;
    } catch (e) {
      // Fallback to escaped HTML if highlighting fails
      return escapeHtml(code);
    }
  }

  // Full diff for modal - side by side
  function renderDiff(oldStr, newStr, filePath) {
    var alignedDiff = computeAlignedDiff(oldStr, newStr);
    return renderDiffSideBySide(alignedDiff, alignedDiff.length, filePath);
  }

  // Preview diff - side by side with limit, focused on actual changes
  function renderDiffPreview(oldStr, newStr, filePath) {
    var alignedDiff = computeAlignedDiff(oldStr, newStr);

    // Find lines with actual changes and include context around them
    var linesToShow = selectDiffPreviewLines(alignedDiff, DIFF_PREVIEW_LINES);
    var totalChanges = alignedDiff.filter(function(row) {
      return row.type !== 'unchanged';
    }).length;

    var html = renderDiffPreviewWithGaps(linesToShow, filePath);

    var hiddenCount = alignedDiff.length - linesToShow.reduce(function(acc, group) {
      return acc + group.lines.length;
    }, 0);

    if (hiddenCount > 0) {
      html += '<div class="diff-more-indicator">... ' + hiddenCount + ' more lines (' + totalChanges + ' total changes, click to view full diff)</div>';
    }

    return html;
  }

  // Select lines to show in diff preview, prioritizing changed lines with context
  function selectDiffPreviewLines(alignedDiff, maxLines) {
    var CONTEXT_LINES = 2; // Lines of context around changes
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
  }

  // Render diff preview with gap indicators between non-contiguous sections
  function renderDiffPreviewWithGaps(groups, filePath) {
    var language = getLanguageFromPath(filePath);
    var html = '<div class="tool-diff side-by-side">';

    // Old side (original)
    html += '<div class="diff-side old">';
    html += '<div class="diff-side-header">Original</div>';
    html += '<div class="diff-side-content">';

    var lastIndex = -1;

    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];

      // Add gap indicator if there's a gap
      if (lastIndex >= 0 && group.startIndex > lastIndex + 1) {
        var gapSize = group.startIndex - lastIndex - 1;
        html += '<div class="diff-line diff-gap"><span class="diff-content text-gray-500 text-xs">... ' + gapSize + ' unchanged lines ...</span></div>';
      }

      for (var i = 0; i < group.lines.length; i++) {
        var item = group.lines[i];
        var row = item.row;
        var leftClass = 'diff-line';

        if (row.type === 'unchanged') leftClass += ' diff-unchanged';
        else if (row.type === 'remove') leftClass += ' diff-remove';
        else if (row.type === 'change') leftClass += ' diff-change';
        else if (row.type === 'add') leftClass += ' diff-empty';

        var leftContent = row.left ? highlightCode(row.left, language) : '';
        html += '<div class="' + leftClass + '">';
        html += '<span class="diff-content">' + leftContent + '</span>';
        html += '</div>';

        lastIndex = item.index;
      }
    }

    html += '</div></div>';

    // New side (modified)
    html += '<div class="diff-side new">';
    html += '<div class="diff-side-header">New</div>';
    html += '<div class="diff-side-content">';

    lastIndex = -1;

    for (var g2 = 0; g2 < groups.length; g2++) {
      var group2 = groups[g2];

      // Add gap indicator if there's a gap
      if (lastIndex >= 0 && group2.startIndex > lastIndex + 1) {
        var gapSize2 = group2.startIndex - lastIndex - 1;
        html += '<div class="diff-line diff-gap"><span class="diff-content text-gray-500 text-xs">... ' + gapSize2 + ' unchanged lines ...</span></div>';
      }

      for (var j = 0; j < group2.lines.length; j++) {
        var item2 = group2.lines[j];
        var row2 = item2.row;
        var rightClass = 'diff-line';

        if (row2.type === 'unchanged') rightClass += ' diff-unchanged';
        else if (row2.type === 'add') rightClass += ' diff-add';
        else if (row2.type === 'change') rightClass += ' diff-change';
        else if (row2.type === 'remove') rightClass += ' diff-empty';

        var rightContent = row2.right ? highlightCode(row2.right, language) : '';
        html += '<div class="' + rightClass + '">';
        html += '<span class="diff-content">' + rightContent + '</span>';
        html += '</div>';

        lastIndex = item2.index;
      }
    }

    html += '</div></div>';
    html += '</div>';

    return html;
  }

  // Compute aligned diff for side-by-side display
  function computeAlignedDiff(oldStr, newStr) {
    var diff = computeDiff(oldStr, newStr);
    var aligned = [];

    for (var i = 0; i < diff.length; i++) {
      var line = diff[i];

      if (line.type === 'unchanged') {
        aligned.push({ left: line.content, right: line.content, type: 'unchanged' });
      } else if (line.type === 'remove') {
        // Check if next line is add (potential change pair)
        if (i + 1 < diff.length && diff[i + 1].type === 'add') {
          var wordDiff = computeWordDiff(line.content, diff[i + 1].content);
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
        var wordDiff2 = computeWordDiff(line.oldContent || '', line.content);
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
  }

  // Render word chunks with inline highlighting
  function renderWordChunks(chunks, highlightType) {
    if (!chunks || chunks.length === 0) return '';

    return chunks.map(function(chunk) {
      var text = escapeHtml(chunk.text);

      if (chunk.type === 'removed' && highlightType === 'old') {
        return '<span class="diff-char-removed">' + text + '</span>';
      } else if (chunk.type === 'added' && highlightType === 'new') {
        return '<span class="diff-char-added">' + text + '</span>';
      }

      return text;
    }).join('');
  }

  function renderDiffSideBySide(alignedDiff, maxLines, filePath) {
    var linesToShow = Math.min(alignedDiff.length, maxLines);
    var language = getLanguageFromPath(filePath);

    var html = '<div class="tool-diff side-by-side">';

    // Old side (original)
    html += '<div class="diff-side old">';
    html += '<div class="diff-side-header">Original</div>';
    html += '<div class="diff-side-content">';

    for (var i = 0; i < linesToShow; i++) {
      var row = alignedDiff[i];
      var leftClass = 'diff-line';

      if (row.type === 'unchanged') leftClass += ' diff-unchanged';
      else if (row.type === 'remove') leftClass += ' diff-remove';
      else if (row.type === 'change') leftClass += ' diff-change';
      else if (row.type === 'add') leftClass += ' diff-empty';

      var leftContent;

      if (row.type === 'change' && row.leftChunks) {
        leftContent = renderWordChunks(row.leftChunks, 'old');
      } else {
        leftContent = row.left ? highlightCode(row.left, language) : '';
      }

      html += '<div class="' + leftClass + '">';
      html += '<span class="diff-content">' + leftContent + '</span>';
      html += '</div>';
    }

    html += '</div></div>';

    // New side (modified)
    html += '<div class="diff-side new">';
    html += '<div class="diff-side-header">New</div>';
    html += '<div class="diff-side-content">';

    for (var j = 0; j < linesToShow; j++) {
      var row2 = alignedDiff[j];
      var rightClass = 'diff-line';

      if (row2.type === 'unchanged') rightClass += ' diff-unchanged';
      else if (row2.type === 'add') rightClass += ' diff-add';
      else if (row2.type === 'change') rightClass += ' diff-change';
      else if (row2.type === 'remove') rightClass += ' diff-empty';

      var rightContent;

      if (row2.type === 'change' && row2.rightChunks) {
        rightContent = renderWordChunks(row2.rightChunks, 'new');
      } else {
        rightContent = row2.right ? highlightCode(row2.right, language) : '';
      }

      html += '<div class="' + rightClass + '">';
      html += '<span class="diff-content">' + rightContent + '</span>';
      html += '</div>';
    }

    html += '</div></div>';
    html += '</div>';

    return html;
  }

  function computeDiff(oldStr, newStr) {
    var oldLines = oldStr.split('\n');
    var newLines = newStr.split('\n');
    var result = [];

    // Simple LCS-based diff
    var lcs = computeLCS(oldLines, newLines);
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
        if (isSimilar(oldLines[oldIdx], newLines[newIdx])) {
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
  }

  function computeLCS(arr1, arr2) {
    var m = arr1.length;
    var n = arr2.length;
    var dp = [];

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
    var i = m, j = n;
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
  }

  function isSimilar(str1, str2) {
    // Check if strings are similar (for detecting modifications vs add/remove)
    if (!str1 || !str2) return false;
    var len1 = str1.length;
    var len2 = str2.length;
    if (Math.abs(len1 - len2) > Math.max(len1, len2) * 0.5) return false;

    // Simple similarity: share at least 40% of characters in same positions
    var matches = 0;
    var minLen = Math.min(len1, len2);
    for (var i = 0; i < minLen; i++) {
      if (str1[i] === str2[i]) matches++;
    }
    return matches / Math.max(len1, len2) > 0.4;
  }

  // Compute word-level diff for inline change highlighting
  function computeWordDiff(oldStr, newStr) {
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

    // Backtrack to find LCS and build chunks
    var leftChunks = [];
    var rightChunks = [];
    var oi = m;
    var ni = n;

    // Collect operations in reverse order
    var ops = [];

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
  }

  function truncateString(str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
  }

  function scrollConversationToBottom() {
    if (state.agentOutputScrollLock) return;

    var $container = $('#conversation-container');
    $container.scrollTop($container[0].scrollHeight);
  }

  // Check if a message is a debug/system message that should only show in debug mode
  function isDebugMessage(message) {
    // Only messages explicitly marked as debug should be hidden
    return message.isDebug === true;
  }

  function appendMessage(projectId, message) {
    if (!state.conversations[projectId]) {
      state.conversations[projectId] = [];
    }
    state.conversations[projectId].push(message);

    // Update real-time stats
    updateStatsFromMessage(message);

    // Cache Read tool file paths for diff comparison with Write
    if (message.type === 'tool_use' && message.toolInfo) {
      var toolInfo = message.toolInfo;

      if (toolInfo.name === 'Read' && toolInfo.input && toolInfo.input.file_path) {
        cacheReadFile(toolInfo.input.file_path);
      }

      // Track TodoWrite tool calls to update task state
      if (toolInfo.name === 'TodoWrite' && toolInfo.input) {
        updateCurrentTodos(toolInfo.input);
      }

      // Track Write and Edit tool calls to plan files (for ExitPlanMode)
      if ((toolInfo.name === 'Write' || toolInfo.name === 'Edit') &&
          toolInfo.input && toolInfo.input.file_path) {
        var filePath = toolInfo.input.file_path;

        if (filePath.includes('plans') && filePath.endsWith('.md')) {
          state.currentPlanFile = filePath;

          // Reload plan content if approval prompt is visible
          var $planContainer = $('.plan-content-container');

          if ($planContainer.length > 0) {
            loadPlanContent($planContainer);
          }
        }
      }
    }

    if (state.selectedProjectId === projectId) {
      // Skip debug messages unless debug panel is open
      if (isDebugMessage(message) && !state.debugPanelOpen) {
        return;
      }

      // Remove waiting indicator when response arrives (not for user messages)
      if (message.type !== 'user') {
        removeWaitingIndicator();
      }

      // Handle tool_result messages - update specific tool status
      if (message.type === 'tool_result' && message.toolInfo) {
        updateToolStatus(
          message.toolInfo.id,
          message.toolInfo.status || 'completed',
          message.toolInfo.resultContent
        );
        return; // Don't render tool_result as a separate message
      }

      // Mark previous running tools as completed when non-tool content arrives
      if (message.type !== 'tool_use' && message.type !== 'user' && message.type !== 'tool_result') {
        markRunningToolsComplete();
      }

      var $conv = $('#conversation');

      // Clear "No conversation yet" placeholder if present
      if ($conv.find('.text-gray-500.text-center').length > 0) {
        $conv.empty();
      }

      var $rendered = $(renderMessage(message));
      $conv.append($rendered);

      // Load plan content for exit plan mode messages
      if (message.type === 'plan_mode' && message.planModeInfo && message.planModeInfo.action === 'exit') {
        loadPlanContent($rendered.find('.plan-content-container'));
      }

      // Block input when interactive prompts appear
      if (message.type === 'question' || message.type === 'permission') {
        setPromptBlockingState(message.type);
      }

      if (message.type === 'plan_mode' && message.planModeInfo && message.planModeInfo.action === 'exit') {
        setPromptBlockingState('plan_mode');
      }

      scrollConversationToBottom();
    }
  }

  function loadPlanContent($container) {
    if (!state.currentPlanFile) {
      $container.html('<div class="text-gray-500 text-sm italic">Plan file path not found</div>');
      return;
    }

    $container.html('<div class="text-gray-400 text-sm"><span class="loading-dots">Loading plan</span></div>');

    api.readFile(state.currentPlanFile)
      .done(function(data) {
        var content = data.content || '';

        if (!content.trim()) {
          $container.html('<div class="text-gray-500 text-sm italic">Plan file is empty</div>');
          return;
        }

        // Render markdown content
        var renderedHtml = renderMarkdownContent(content);
        $container.html(
          '<div class="plan-content bg-gray-800/50 rounded p-3 border border-gray-700 max-h-96 overflow-y-auto">' +
            '<div class="prose prose-invert prose-sm max-w-none">' + renderedHtml + '</div>' +
          '</div>'
        );
      })
      .fail(function() {
        $container.html('<div class="text-red-400 text-sm">Failed to load plan file</div>');
      });
  }

  function renderMarkdownContent(content) {
    // Use marked library for proper markdown rendering
    try {
      marked.setOptions({
        breaks: true,
        gfm: true
      });

      return marked.parse(content);
    } catch (e) {
      // Fallback to escaped pre-formatted text
      return '<pre class="whitespace-pre-wrap text-gray-300">' + escapeHtml(content) + '</pre>';
    }
  }

  function updateStatsFromMessage(message) {
    // Initialize stats if needed
    if (!state.currentConversationStats) {
      state.currentConversationStats = {
        messageCount: 0,
        toolCallCount: 0,
        userMessageCount: 0,
        durationMs: 0,
        startedAt: message.timestamp || new Date().toISOString()
      };
    }

    var stats = state.currentConversationStats;

    // Increment message count
    stats.messageCount++;

    // Increment tool call count
    if (message.type === 'tool_use') {
      stats.toolCallCount++;
    }

    // Increment user message count
    if (message.type === 'user') {
      stats.userMessageCount++;
    }

    // Update duration based on latest message timestamp
    if (message.timestamp && stats.startedAt) {
      var startTime = new Date(stats.startedAt).getTime();
      var endTime = new Date(message.timestamp).getTime();
      stats.durationMs = Math.max(0, endTime - startTime);
    }

    // Update context usage from agent message if available
    if (message.contextUsage) {
      if (!state.currentConversationMetadata) {
        state.currentConversationMetadata = {};
      }
      state.currentConversationMetadata.contextUsage = message.contextUsage;
    }

    // Update the display
    updateConversationStats();
  }

  function markRunningToolsComplete() {
    $('.tool-status.running').removeClass('running').addClass('completed');
  }

  // Roadmap rendering
  function renderRoadmap(data) {
    var $container = $('#roadmap-content');

    if (!data || !data.parsed) {
      $container.html('<div class="text-gray-500 text-center">No roadmap found</div>');
      return;
    }

    var parsed = data.parsed;
    var html = renderOverallProgress(parsed.overallProgress);
    html += renderPhases(parsed.phases, parsed.currentPhase, parsed.currentMilestone);

    $container.html(html);
  }

  function renderOverallProgress(progress) {
    return '<div class="mb-4 p-3 bg-gray-800 rounded">' +
      '<div class="flex justify-between text-sm mb-1">' +
        '<span class="text-gray-300">Overall Progress</span>' +
        '<span class="text-gray-400">' + progress + '%</span>' +
      '</div>' +
      '<div class="w-full bg-gray-700 rounded-full h-2">' +
        '<div class="bg-green-500 h-2 rounded-full" style="width: ' + progress + '%"></div>' +
      '</div>' +
    '</div>';
  }

  function renderPhases(phases, currentPhase, currentMilestone) {
    var html = '';

    phases.forEach(function(phase) {
      var isCurrent = phase.id === currentPhase;
      var phaseClass = isCurrent ? 'border-blue-500' : 'border-gray-700';

      html += '<div class="mb-3 border-l-2 ' + phaseClass + ' pl-3">' +
        '<div class="flex items-center justify-between group mb-2">' +
          '<span class="text-sm font-medium text-gray-200">' + escapeHtml(phase.title) + '</span>' +
          '<button class="btn-delete-phase opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-0.5 transition-opacity" ' +
            'data-phase-id="' + escapeHtml(phase.id) + '" ' +
            'data-phase-title="' + escapeHtml(phase.title) + '" ' +
            'title="Delete phase">' +
            '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
              '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' +
            '</svg>' +
          '</button>' +
        '</div>';

      phase.milestones.forEach(function(milestone) {
        html += renderMilestone(phase.id, milestone, milestone.id === currentMilestone);
      });

      html += '</div>';
    });

    return html;
  }

  function renderMilestone(phaseId, milestone, isCurrent) {
    var progress = milestone.totalCount > 0
      ? Math.round((milestone.completedCount / milestone.totalCount) * 100)
      : 0;
    var bgClass = isCurrent ? 'bg-blue-900/30' : 'bg-gray-800/50';
    var barColor = progress === 100 ? 'bg-green-500' : 'bg-blue-500';
    var milestoneKey = phaseId + '-' + milestone.id;
    var isExpanded = getMilestoneExpanded(milestoneKey);
    var chevronClass = isExpanded ? 'rotate-90' : '';
    var isMilestoneComplete = milestone.totalCount > 0 && milestone.completedCount === milestone.totalCount;
    var milestoneDisabled = isMilestoneComplete ? 'disabled title="All tasks completed"' : '';

    var html = '<div class="mb-2 p-2 ' + bgClass + ' rounded text-xs milestone-container group/milestone">' +
      '<div class="milestone-header flex items-center gap-2 cursor-pointer select-none" data-milestone-key="' + escapeHtml(milestoneKey) + '">' +
        '<input type="checkbox" class="roadmap-select-milestone w-3 h-3 accent-purple-500 cursor-pointer" ' +
          'data-phase-id="' + escapeHtml(phaseId) + '" ' +
          'data-milestone-id="' + escapeHtml(milestone.id) + '" ' +
          'data-milestone-title="' + escapeHtml(milestone.title) + '" ' +
          milestoneDisabled + ' ' +
          'onclick="event.stopPropagation();" />' +
        '<svg class="w-3 h-3 text-gray-400 transition-transform duration-200 milestone-chevron ' + chevronClass + '" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>' +
        '</svg>' +
        '<span class="flex-1 text-gray-300">' + escapeHtml(milestone.title) + '</span>' +
        '<span class="text-gray-500">' + milestone.completedCount + '/' + milestone.totalCount + '</span>' +
        '<button class="btn-delete-milestone opacity-0 group-hover/milestone:opacity-100 text-red-400 hover:text-red-300 p-0.5 transition-opacity" ' +
          'data-phase-id="' + escapeHtml(phaseId) + '" ' +
          'data-milestone-id="' + escapeHtml(milestone.id) + '" ' +
          'data-milestone-title="' + escapeHtml(milestone.title) + '" ' +
          'onclick="event.stopPropagation();" ' +
          'title="Delete milestone">' +
          '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' +
          '</svg>' +
        '</button>' +
      '</div>' +
      '<div class="w-full bg-gray-700 rounded-full h-1 mt-1">' +
        '<div class="' + barColor + ' h-1 rounded-full transition-all duration-300" style="width: ' + progress + '%"></div>' +
      '</div>';

    // Render individual tasks with delete buttons and selection checkboxes (expandable)
    if (milestone.tasks && milestone.tasks.length > 0) {
      var displayStyle = isExpanded ? '' : 'display: none;';
      html += '<div class="milestone-tasks space-y-1 mt-2 overflow-hidden transition-all duration-200" style="' + displayStyle + '">';

      milestone.tasks.forEach(function(task, index) {
        var completedClass = task.completed ? 'text-gray-500 line-through' : 'text-gray-300';
        var checkboxIcon = task.completed
          ? '<svg class="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
          : '<svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/></svg>';

        html += '<div class="flex items-center gap-2 group">' +
          '<input type="checkbox" class="roadmap-select-task w-3 h-3 accent-purple-500 cursor-pointer" ' +
            'data-phase-id="' + escapeHtml(phaseId) + '" ' +
            'data-milestone-id="' + escapeHtml(milestone.id) + '" ' +
            'data-task-index="' + index + '" ' +
            'data-task-title="' + escapeHtml(task.title) + '" ' +
            (task.completed ? 'disabled title="Already completed"' : '') + ' />' +
          '<span class="flex-shrink-0">' + checkboxIcon + '</span>' +
          '<span class="flex-1 ' + completedClass + '">' + escapeHtml(task.title) + '</span>' +
          '<button class="btn-delete-task opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-0.5 transition-opacity" ' +
            'data-phase-id="' + escapeHtml(phaseId) + '" ' +
            'data-milestone-id="' + escapeHtml(milestone.id) + '" ' +
            'data-task-index="' + index + '" ' +
            'data-task-title="' + escapeHtml(task.title) + '" ' +
            'title="Delete task">' +
            '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
              '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' +
            '</svg>' +
          '</button>' +
        '</div>';
      });

      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function getMilestoneExpanded(key) {
    var stored = localStorage.getItem('claudito-milestone-expanded');
    var expanded = stored ? JSON.parse(stored) : {};
    return expanded[key] === true;
  }

  function setMilestoneExpanded(key, isExpanded) {
    var stored = localStorage.getItem('claudito-milestone-expanded');
    var expanded = stored ? JSON.parse(stored) : {};
    expanded[key] = isExpanded;
    localStorage.setItem('claudito-milestone-expanded', JSON.stringify(expanded));
  }

  function toggleMilestoneExpanded(key) {
    var isExpanded = getMilestoneExpanded(key);
    setMilestoneExpanded(key, !isExpanded);
    return !isExpanded;
  }

  // Roadmap selection functions
  function getSelectedRoadmapItems() {
    var items = [];

    // Collect selected milestones
    $('.roadmap-select-milestone:checked').each(function() {
      var $checkbox = $(this);
      items.push({
        type: 'milestone',
        phaseId: $checkbox.data('phase-id'),
        milestoneId: $checkbox.data('milestone-id'),
        title: $checkbox.data('milestone-title')
      });
    });

    // Collect selected tasks (only those not under a selected milestone)
    var selectedMilestoneIds = items
      .filter(function(item) { return item.type === 'milestone'; })
      .map(function(item) { return item.milestoneId; });

    $('.roadmap-select-task:checked:not(:disabled)').each(function() {
      var $checkbox = $(this);
      var milestoneId = $checkbox.data('milestone-id');

      // Skip if the milestone is already selected (to avoid duplicates)
      if (selectedMilestoneIds.indexOf(milestoneId) === -1) {
        items.push({
          type: 'task',
          phaseId: $checkbox.data('phase-id'),
          milestoneId: milestoneId,
          taskIndex: $checkbox.data('task-index'),
          title: $checkbox.data('task-title')
        });
      }
    });

    return items;
  }

  function updateRoadmapSelectionUI() {
    var items = getSelectedRoadmapItems();
    var $section = $('#roadmap-run-selected');
    var $count = $('#roadmap-selected-count');

    if (items.length > 0) {
      $section.removeClass('hidden');
      $count.text(items.length);
    } else {
      $section.addClass('hidden');
    }
  }

  function clearRoadmapSelection() {
    $('.roadmap-select-milestone, .roadmap-select-task').prop('checked', false);
    updateRoadmapSelectionUI();
  }

  function runSelectedRoadmapTasks() {
    var items = getSelectedRoadmapItems();

    if (items.length === 0) {
      showToast('No items selected', 'error');
      return;
    }

    // Generate the prompt
    var prompt = generateRoadmapTaskPrompt(items);

    // Close the roadmap modal
    closeModal('modal-roadmap');

    // Clear selection for next time
    clearRoadmapSelection();

    // Start interactive agent if not running, or send message if running
    var project = findProjectById(state.selectedProjectId);

    if (project && project.status === 'running') {
      // Agent is already running, send the message directly
      doSendMessage(prompt);
    } else {
      // Agent not running, start interactive agent with the prompt
      startInteractiveAgentWithMessage(prompt);
    }
  }

  function generateRoadmapTaskPrompt(items) {
    var lines = ['Please work on the following roadmap items:\n'];

    items.forEach(function(item, index) {
      if (item.type === 'milestone') {
        lines.push((index + 1) + '. **Milestone**: ' + item.title);
        lines.push('   Complete all pending tasks in this milestone.\n');
      } else {
        lines.push((index + 1) + '. **Task**: ' + item.title + '\n');
      }
    });

    lines.push('\nFor each item, please:');
    lines.push('1. Implement the required changes');
    lines.push('2. Test your changes');
    lines.push('3. Update the ROADMAP.md to mark completed items with [x]');

    return lines.join('\n');
  }

  // Debug modal
  function openDebugModal() {
    state.debugPanelOpen = true;
    openModal('modal-debug');

    // Sync filter checkbox states
    Object.keys(state.debugLogFilters).forEach(function(key) {
      $('#log-filter-' + key).prop('checked', state.debugLogFilters[key]);
    });

    refreshDebugInfo();
    startDebugAutoRefresh();
  }

  function closeDebugModal() {
    state.debugPanelOpen = false;
    state.debugExpandedLogs = {}; // Clear expanded state on close
    stopDebugAutoRefresh();
  }

  function startDebugAutoRefresh() {
    stopDebugAutoRefresh();
    state.debugRefreshInterval = setInterval(refreshDebugInfo, 2000);
  }

  function stopDebugAutoRefresh() {
    if (state.debugRefreshInterval) {
      clearInterval(state.debugRefreshInterval);
      state.debugRefreshInterval = null;
    }
  }

  function refreshDebugInfo() {
    if (!state.selectedProjectId || !state.debugPanelOpen) return;

    api.getDebugInfo(state.selectedProjectId, 100)
      .done(function(data) {
        renderDebugModal(data);
      })
      .fail(function() {
        $('#debug-process-content').html('<div class="text-red-400">Failed to load debug info</div>');
      });
  }

  function renderDebugModal(data) {
    renderDebugClaudeIOTab(data);
    renderDebugProcessTab(data);
    renderDebugCommandsTab(data);
    renderDebugLogsTab(data);
    renderDebugAllProcessesTab(data);
  }

  function renderDebugClaudeIOTab(data) {
    var html = '';

    // Filter logs to show only Claude I/O (direction: input/output)
    var ioLogs = (data.recentLogs || []).filter(function(log) {
      return log.context && log.context.direction;
    });

    html += '<div class="flex items-center justify-between mb-3">';
    html += '<span class="text-gray-400 text-sm">Showing ' + ioLogs.length + ' Claude I/O events</span>';
    html += '<div class="flex items-center gap-2">';
    html += '<span class="flex items-center gap-1 text-xs"><span class="w-2 h-2 bg-blue-500 rounded-full"></span> Input</span>';
    html += '<span class="flex items-center gap-1 text-xs"><span class="w-2 h-2 bg-green-500 rounded-full"></span> Output</span>';
    html += '</div>';
    html += '</div>';

    if (ioLogs.length > 0) {
      html += '<div class="space-y-2">';

      ioLogs.forEach(function(log, index) {
        var isInput = log.context.direction === 'input';
        var borderColor = isInput ? 'border-l-blue-500' : 'border-l-green-500';
        var bgColor = isInput ? 'bg-blue-900/20' : 'bg-green-900/20';
        var directionLabel = isInput ? 'STDIN >>>' : 'STDOUT <<<';
        var directionColor = isInput ? 'text-blue-400' : 'text-green-400';
        var logId = 'io-' + log.timestamp + '-' + index;
        var isExpanded = state.debugExpandedLogs[logId] || false;

        html += '<div class="debug-log-item ' + bgColor + ' rounded border-l-2 ' + borderColor + ' cursor-pointer hover:bg-opacity-40 transition-colors" data-log-index="' + index + '" data-log-type="io" data-log-id="' + logId + '">';
        html += '<div class="p-2">';

        // Header row
        html += '<div class="flex items-center gap-2">';
        html += '<span class="text-gray-500 text-xs">' + formatLogTime(log.timestamp) + '</span>';
        html += '<span class="' + directionColor + ' text-xs font-semibold">' + directionLabel + '</span>';

        if (log.context.eventType) {
          html += '<span class="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded text-xs">' + log.context.eventType + '</span>';
        }

        if (log.context.toolName) {
          html += '<span class="bg-purple-700 text-purple-200 px-1.5 py-0.5 rounded text-xs">' + escapeHtml(log.context.toolName) + '</span>';
        }

        html += '<span class="text-gray-400 flex-1 truncate">' + escapeHtml(log.message) + '</span>';
        html += '<svg class="w-4 h-4 text-gray-500 flex-shrink-0 debug-log-chevron' + (isExpanded ? ' rotate-180' : '') + '" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';
        html += '</div>';

        // Preview (collapsed by default)
        if (log.context.contentPreview) {
          html += '<div class="mt-1 text-gray-400 text-xs truncate">' + escapeHtml(log.context.contentPreview.substring(0, 150)) + '</div>';
        }

        html += '</div>';

        // Expandable detail
        html += '<div class="debug-log-detail' + (isExpanded ? '' : ' hidden') + ' border-t border-gray-700 p-3 bg-gray-900/50">';
        html += '<div class="space-y-2">';

        // Full context
        if (log.context) {
          Object.keys(log.context).forEach(function(key) {
            if (key === 'direction') return; // Skip direction, already shown
            var value = log.context[key];
            var valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
            html += '<div>';
            html += '<span class="text-gray-500 text-xs">' + escapeHtml(key) + ':</span>';

            if (valueStr.length > 100 || valueStr.includes('\n')) {
              html += '<pre class="mt-1 bg-gray-800 rounded p-2 text-xs text-gray-300 whitespace-pre-wrap break-all max-h-64 overflow-auto">' + escapeHtml(valueStr) + '</pre>';
            } else {
              html += '<span class="ml-2 text-gray-300 text-xs">' + escapeHtml(valueStr) + '</span>';
            }

            html += '</div>';
          });
        }

        html += '</div>';
        html += '</div>';
        html += '</div>';
      });

      html += '</div>';
    } else {
      html += '<div class="text-gray-500 text-center py-8">No Claude I/O events yet. Start an agent to see input/output.</div>';
    }

    $('#debug-claude-io-content').html(html);
  }

  function renderDebugProcessTab(data) {
    var html = '';

    // Current Agent Process
    html += '<div class="bg-gray-800 rounded-lg p-4">';
    html += '<h4 class="text-gray-300 font-semibold mb-3 flex items-center gap-2">';
    html += '<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">';
    html += '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/>';
    html += '</svg>Current Agent Process</h4>';

    if (data.processInfo) {
      html += '<div class="grid grid-cols-2 gap-4">';
      html += '<div class="bg-gray-900 rounded p-3">';
      html += '<div class="text-gray-500 text-xs mb-1">Process ID</div>';
      html += '<div class="text-green-400 font-mono text-lg">' + data.processInfo.pid + '</div>';
      html += '</div>';
      html += '<div class="bg-gray-900 rounded p-3">';
      html += '<div class="text-gray-500 text-xs mb-1">Started At</div>';
      html += '<div class="text-gray-300">' + formatDateTime(data.processInfo.startedAt) + '</div>';
      html += '</div>';
      html += '</div>';
      html += '<div class="bg-gray-900 rounded p-3 mt-3">';
      html += '<div class="text-gray-500 text-xs mb-1">Working Directory</div>';
      html += '<div class="text-gray-300 font-mono text-sm break-all">' + escapeHtml(data.processInfo.cwd) + '</div>';
      html += '</div>';
    } else {
      html += '<div class="text-gray-500 text-center py-4">No agent process running</div>';
    }

    html += '</div>';

    // Loop State
    html += '<div class="bg-gray-800 rounded-lg p-4 mt-4">';
    html += '<h4 class="text-gray-300 font-semibold mb-3 flex items-center gap-2">';
    html += '<svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">';
    html += '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>';
    html += '</svg>Autonomous Loop State</h4>';

    if (data.loopState && data.loopState.isLooping) {
      html += '<div class="bg-gray-900 rounded p-3">';
      html += '<div class="flex items-center gap-2 mb-3">';
      html += '<span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>';
      html += '<span class="text-green-400 font-medium">Loop Running</span>';
      html += '</div>';

      if (data.loopState.currentMilestone) {
        var milestone = data.loopState.currentMilestone;
        html += '<div class="space-y-2">';
        html += '<div><span class="text-gray-500">Phase:</span> <span class="text-gray-300">' + escapeHtml(milestone.phaseTitle) + '</span></div>';
        html += '<div><span class="text-gray-500">Milestone:</span> <span class="text-gray-300">' + escapeHtml(milestone.milestoneTitle) + '</span></div>';
        html += '<div><span class="text-gray-500">Pending Tasks:</span> <span class="text-yellow-400">' + milestone.pendingTasks.length + '</span></div>';

        if (milestone.pendingTasks.length > 0) {
          html += '<div class="mt-2 pl-4 border-l-2 border-gray-700">';

          milestone.pendingTasks.forEach(function(task) {
            html += '<div class="text-gray-400 text-sm py-0.5">' + escapeHtml(task) + '</div>';
          });

          html += '</div>';
        }
      }

      if (data.loopState.currentConversationId) {
        html += '<div class="mt-3 pt-3 border-t border-gray-700">';
        html += '<span class="text-gray-500 text-xs">Conversation ID:</span>';
        html += '<div class="text-gray-400 font-mono text-xs break-all">' + escapeHtml(data.loopState.currentConversationId) + '</div>';
        html += '</div>';
      }

      html += '</div>';
    } else {
      html += '<div class="text-gray-500 text-center py-4">Autonomous loop not running</div>';
    }

    html += '</div>';

    // Memory Usage
    html += '<div class="bg-gray-800 rounded-lg p-4 mt-4">';
    html += '<h4 class="text-gray-300 font-semibold mb-3 flex items-center gap-2">';
    html += '<svg class="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">';
    html += '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>';
    html += '</svg>Memory Usage</h4>';

    html += '<div class="space-y-3">';

    // Server Memory
    html += '<div class="bg-gray-900 rounded p-3">';
    html += '<div class="text-gray-400 text-xs font-semibold mb-2">Server (Node.js)</div>';

    if (data.memoryUsage) {
      html += '<div class="grid grid-cols-2 gap-3">';
      html += '<div>';
      html += '<div class="text-gray-500 text-xs">Heap Used</div>';
      html += '<div class="text-yellow-400 font-mono">' + formatBytes(data.memoryUsage.heapUsed) + '</div>';
      html += '</div>';
      html += '<div>';
      html += '<div class="text-gray-500 text-xs">Heap Total</div>';
      html += '<div class="text-gray-300 font-mono">' + formatBytes(data.memoryUsage.heapTotal) + '</div>';
      html += '</div>';
      html += '<div>';
      html += '<div class="text-gray-500 text-xs">RSS</div>';
      html += '<div class="text-gray-300 font-mono">' + formatBytes(data.memoryUsage.rss) + '</div>';
      html += '</div>';
      html += '<div>';
      html += '<div class="text-gray-500 text-xs">External</div>';
      html += '<div class="text-gray-300 font-mono">' + formatBytes(data.memoryUsage.external) + '</div>';
      html += '</div>';
      html += '</div>';

      // Heap usage bar
      var heapPercent = Math.round((data.memoryUsage.heapUsed / data.memoryUsage.heapTotal) * 100);
      var barColor = heapPercent > 90 ? 'bg-red-500' : (heapPercent > 70 ? 'bg-yellow-500' : 'bg-green-500');
      html += '<div class="mt-3">';
      html += '<div class="flex justify-between text-xs text-gray-500 mb-1">';
      html += '<span>Heap Usage</span>';
      html += '<span>' + heapPercent + '%</span>';
      html += '</div>';
      html += '<div class="w-full bg-gray-700 rounded-full h-2">';
      html += '<div class="' + barColor + ' h-2 rounded-full transition-all" style="width: ' + heapPercent + '%"></div>';
      html += '</div>';
      html += '</div>';
    } else {
      html += '<div class="text-gray-500">Memory info unavailable</div>';
    }

    html += '</div>';

    // Browser Memory (if available)
    html += '<div class="bg-gray-900 rounded p-3">';
    html += '<div class="text-gray-400 text-xs font-semibold mb-2">Browser</div>';
    html += '<div id="debug-browser-memory"></div>';
    html += '</div>';

    html += '</div>';
    html += '</div>';

    $('#debug-process-content').html(html);

    // Update browser memory after DOM is ready
    updateBrowserMemory();
  }

  function updateBrowserMemory() {
    var container = $('#debug-browser-memory');

    if (!container.length) return;

    // Check for performance.memory (Chrome/Edge only)
    if (window.performance && window.performance.memory) {
      var mem = window.performance.memory;
      var usedPercent = Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100);
      var barColor = usedPercent > 90 ? 'bg-red-500' : (usedPercent > 70 ? 'bg-yellow-500' : 'bg-green-500');

      var html = '<div class="grid grid-cols-2 gap-3">';
      html += '<div>';
      html += '<div class="text-gray-500 text-xs">JS Heap Used</div>';
      html += '<div class="text-yellow-400 font-mono">' + formatBytes(mem.usedJSHeapSize) + '</div>';
      html += '</div>';
      html += '<div>';
      html += '<div class="text-gray-500 text-xs">JS Heap Total</div>';
      html += '<div class="text-gray-300 font-mono">' + formatBytes(mem.totalJSHeapSize) + '</div>';
      html += '</div>';
      html += '<div class="col-span-2">';
      html += '<div class="text-gray-500 text-xs">Heap Limit</div>';
      html += '<div class="text-gray-300 font-mono">' + formatBytes(mem.jsHeapSizeLimit) + '</div>';
      html += '</div>';
      html += '</div>';

      html += '<div class="mt-3">';
      html += '<div class="flex justify-between text-xs text-gray-500 mb-1">';
      html += '<span>Heap Usage</span>';
      html += '<span>' + usedPercent + '%</span>';
      html += '</div>';
      html += '<div class="w-full bg-gray-700 rounded-full h-2">';
      html += '<div class="' + barColor + ' h-2 rounded-full transition-all" style="width: ' + usedPercent + '%"></div>';
      html += '</div>';
      html += '</div>';

      container.html(html);
    } else {
      container.html('<div class="text-gray-500 text-sm">Memory API not available in this browser</div>');
    }
  }

  function renderDebugCommandsTab(data) {
    var html = '';

    html += '<div class="bg-gray-800 rounded-lg p-4">';
    html += '<h4 class="text-gray-300 font-semibold mb-3 flex items-center gap-2">';
    html += '<svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">';
    html += '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>';
    html += '</svg>Last Executed Command</h4>';

    if (data.lastCommand) {
      html += '<div class="relative">';
      html += '<pre class="bg-gray-900 rounded p-4 text-sm text-gray-300 whitespace-pre-wrap break-all font-mono overflow-x-auto">' + escapeHtml(data.lastCommand) + '</pre>';
      html += '<button onclick="copyToClipboard(\'' + escapeHtml(data.lastCommand.replace(/'/g, "\\'").replace(/\n/g, '\\n')) + '\')" class="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded text-xs transition-colors">Copy</button>';
      html += '</div>';
    } else {
      html += '<div class="text-gray-500 text-center py-4">No command executed yet</div>';
    }

    html += '</div>';

    $('#debug-commands-content').html(html);
  }

  function renderDebugLogsTab(data) {
    var html = '';

    // Apply filters
    var filteredLogs = (data.recentLogs || []).filter(function(log) {
      var isFrontend = log.context && log.context.type === 'frontend';

      // Check frontend filter
      if (isFrontend && !state.debugLogFilters.frontend) {
        return false;
      }

      // Check level filters
      if (!state.debugLogFilters[log.level]) {
        return false;
      }

      return true;
    });

    var totalLogs = data.recentLogs ? data.recentLogs.length : 0;
    html += '<div class="flex items-center justify-between mb-3">';
    html += '<span class="text-gray-400 text-sm">Showing ' + filteredLogs.length + ' of ' + totalLogs + ' log entries (click to expand)</span>';
    html += '</div>';

    if (filteredLogs.length > 0) {
      html += '<div class="space-y-1">';

      filteredLogs.forEach(function(log, index) {
        var levelClass = getLevelClass(log.level);
        var levelBgClass = getLevelBgClass(log.level);
        var isFrontend = log.context && log.context.type === 'frontend';

        if (isFrontend) {
          levelBgClass = 'border-l-2 border-purple-500';
        }

        var hasContext = log.context && Object.keys(log.context).length > 0;
        var logId = 'all-' + log.timestamp + '-' + index;
        var isExpanded = state.debugExpandedLogs[logId] || false;

        html += '<div class="debug-log-item bg-gray-800 rounded ' + levelBgClass + ' cursor-pointer hover:bg-gray-750 transition-colors" data-log-index="' + index + '" data-log-type="all" data-log-id="' + logId + '">';
        html += '<div class="p-2">';

        // Header row (always visible)
        html += '<div class="flex items-center gap-2">';
        html += '<span class="text-gray-500 text-xs whitespace-nowrap">' + formatLogTime(log.timestamp) + '</span>';
        html += '<span class="' + levelClass + ' text-xs font-semibold w-12">' + log.level.toUpperCase() + '</span>';

        if (log.name) {
          html += '<span class="text-gray-600 text-xs">[' + escapeHtml(log.name) + ']</span>';
        }

        html += '<span class="text-gray-300 flex-1 truncate">' + escapeHtml(log.message) + '</span>';

        if (hasContext) {
          html += '<svg class="w-4 h-4 text-gray-500 flex-shrink-0 debug-log-chevron' + (isExpanded ? ' rotate-180' : '') + '" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';
        }

        html += '</div>';
        html += '</div>';

        // Expandable detail
        if (hasContext) {
          html += '<div class="debug-log-detail' + (isExpanded ? '' : ' hidden') + ' border-t border-gray-700 p-3 bg-gray-900/50">';
          html += '<div class="space-y-2">';

          Object.keys(log.context).forEach(function(key) {
            var value = log.context[key];
            var valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

            html += '<div>';
            html += '<span class="text-gray-500 text-xs">' + escapeHtml(key) + ':</span>';

            if (valueStr.length > 100 || valueStr.includes('\n')) {
              html += '<pre class="mt-1 bg-gray-800 rounded p-2 text-xs text-gray-300 whitespace-pre-wrap break-all max-h-64 overflow-auto">' + escapeHtml(valueStr) + '</pre>';
            } else {
              html += '<span class="ml-2 text-gray-300 text-xs">' + escapeHtml(valueStr) + '</span>';
            }

            html += '</div>';
          });

          html += '</div>';
          html += '</div>';
        }

        html += '</div>';
      });

      html += '</div>';
    } else {
      if (totalLogs > 0) {
        html += '<div class="text-gray-500 text-center py-8">No logs match current filters</div>';
      } else {
        html += '<div class="text-gray-500 text-center py-8">No logs yet</div>';
      }
    }

    $('#debug-logs-content').html(html);
  }

  function renderDebugAllProcessesTab(data) {
    var html = '';

    html += '<div class="bg-gray-800 rounded-lg p-4">';
    html += '<h4 class="text-gray-300 font-semibold mb-3 flex items-center gap-2">';
    html += '<svg class="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">';
    html += '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>';
    html += '</svg>All Tracked Processes (' + (data.trackedProcesses ? data.trackedProcesses.length : 0) + ')</h4>';

    if (data.trackedProcesses && data.trackedProcesses.length > 0) {
      html += '<div class="space-y-2">';

      data.trackedProcesses.forEach(function(proc) {
        var isCurrentProject = proc.projectId === state.selectedProjectId;
        var borderColor = isCurrentProject ? 'border-purple-500' : 'border-gray-700';
        var badge = isCurrentProject ? '<span class="text-xs bg-purple-500 text-white px-2 py-0.5 rounded">Current</span>' : '';

        html += '<div class="bg-gray-900 rounded p-3 border-l-2 ' + borderColor + '">';
        html += '<div class="flex items-center justify-between mb-2">';
        html += '<div class="flex items-center gap-2">';
        html += '<span class="text-green-400 font-mono">PID: ' + proc.pid + '</span>';
        html += badge;
        html += '</div>';
        html += '<span class="text-gray-500 text-xs">' + formatDateTime(proc.startedAt) + '</span>';
        html += '</div>';
        html += '<div class="text-gray-400 text-sm">Project: <span class="text-gray-300">' + escapeHtml(proc.projectId) + '</span></div>';
        html += '</div>';
      });

      html += '</div>';
    } else {
      html += '<div class="text-gray-500 text-center py-4">No tracked processes</div>';
    }

    html += '</div>';

    $('#debug-all-processes-content').html(html);
  }

  function getLevelBgClass(level) {
    switch (level) {
      case 'error': return 'bg-red-900/20';
      case 'warn': return 'bg-yellow-900/20';
      default: return '';
    }
  }

  function formatDateTime(isoString) {
    try {
      var date = new Date(isoString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (e) {
      return isoString;
    }
  }

  function getLevelClass(level) {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  }

  function formatTime(isoString) {
    try {
      return new Date(isoString).toLocaleTimeString();
    } catch (e) {
      return isoString;
    }
  }

  function formatLogTime(isoString) {
    try {
      var date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  // Global function for copy button
  window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('Copied to clipboard', 'success');
    }).catch(function() {
      showToast('Failed to copy', 'error');
    });
  };

  // Folder browser
  function openFolderBrowser() {
    state.folderBrowser.currentPath = null;
    openModal('modal-folder-browser');
    loadDrives();
  }

  function loadDrives() {
    $('#folder-browser').html('<div class="p-3 text-gray-400 text-xs">Loading drives...</div>');
    $('#folder-breadcrumb').empty();

    api.getDrives()
      .done(function(drives) {
        renderDrives(drives);
      })
      .fail(function() {
        $('#folder-browser').html('<div class="p-3 text-red-400 text-xs">Failed to load drives</div>');
      });
  }

  function renderDrives(drives) {
    var $browser = $('#folder-browser');
    $browser.empty();

    drives.forEach(function(drive) {
      $browser.append(renderFolderItem(drive.name, drive.path, true));
    });

    renderBreadcrumb(null);
  }

  function loadFolder(folderPath) {
    state.folderBrowser.currentPath = folderPath;
    $('#folder-browser').html('<div class="p-3 text-gray-400 text-xs">Loading...</div>');

    api.browseFolder(folderPath)
      .done(function(entries) {
        renderFolderEntries(entries, folderPath);
      })
      .fail(function() {
        $('#folder-browser').html('<div class="p-3 text-red-400 text-xs">Failed to load folder</div>');
      });
  }

  function renderFolderEntries(entries, currentPath) {
    var $browser = $('#folder-browser');
    $browser.empty();

    if (entries.length === 0) {
      $browser.html('<div class="p-3 text-gray-500 text-xs">No subfolders</div>');
    } else {
      entries.forEach(function(entry) {
        $browser.append(renderFolderItem(entry.name, entry.path, entry.isDirectory));
      });
    }

    renderBreadcrumb(currentPath);
  }

  function renderFolderItem(name, itemPath, isDirectory) {
    var icon = isDirectory ? getFolderIcon() : getFileIcon();

    return '<div class="folder-item" data-path="' + escapeHtml(itemPath) + '">' +
      '<span class="folder-icon">' + icon + '</span>' +
      '<span class="folder-name">' + escapeHtml(name) + '</span>' +
    '</div>';
  }

  function getFolderIcon() {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="text-yellow-500">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
      'd="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>';
  }

  function getFileIcon() {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="text-gray-400">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
      'd="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>';
  }

  function renderBreadcrumb(currentPath) {
    var $breadcrumb = $('#folder-breadcrumb');
    $breadcrumb.empty();

    $breadcrumb.append('<span class="folder-breadcrumb-item" data-path="">Drives</span>');

    if (currentPath) {
      var parts = splitPath(currentPath);
      var accumulated = '';

      parts.forEach(function(part, index) {
        accumulated += (index === 0) ? part : '\\' + part;
        $breadcrumb.append('<span class="folder-breadcrumb-separator">/</span>');
        $breadcrumb.append('<span class="folder-breadcrumb-item" data-path="' + escapeHtml(accumulated) + '">' + escapeHtml(part) + '</span>');
      });
    }

    updateSelectedPathDisplay();
  }

  function splitPath(pathStr) {
    return pathStr.split(/[\\\/]/).filter(function(p) { return p.length > 0; });
  }

  function updateSelectedPathDisplay() {
    var currentPath = state.folderBrowser.currentPath;

    if (currentPath) {
      $('#selected-path').html('<span class="text-gray-300">Current folder:</span> <span class="text-purple-400">' + escapeHtml(currentPath) + '</span>');
    } else {
      $('#selected-path').html('<span class="text-gray-500">Navigate to a folder to select it</span>');
    }
  }

  function extractFolderName(folderPath) {
    var parts = splitPath(folderPath);
    return parts.length > 0 ? parts[parts.length - 1] : '';
  }

  function confirmFolderSelection() {
    var selected = state.folderBrowser.currentPath;

    if (selected) {
      $('#input-project-path').val(selected);
      var folderName = extractFolderName(selected);

      if (folderName && !$('#input-project-name').val()) {
        $('#input-project-name').val(folderName);
      }
      closeModal('modal-folder-browser');
    } else {
      showToast('Please navigate to a folder first', 'error');
    }
  }

  // Event handlers
  function setupEventHandlers() {
    setupModalHandlers();
    setupProjectHandlers();
    setupAgentHandlers();
    setupFormHandlers();
    setupFolderBrowserHandlers();
  }

  function setupModalHandlers() {
    // WebSocket reconnect on failed status
    $('#ws-connection-status').on('click', function() {
      if ($(this).hasClass('ws-failed')) {
        manualReconnect();
      }
    });

    // Mobile menu toggle
    $('#btn-mobile-menu').on('click', function() {
      $('#sidebar').addClass('open');
      $('#mobile-menu-overlay').addClass('active');
    });

    $('#mobile-menu-overlay').on('click', function() {
      $('#sidebar').removeClass('open');
      $('#mobile-menu-overlay').removeClass('active');
    });

    // Close mobile menu when a project is selected
    $(document).on('click', '.project-card', function() {
      if ($(window).width() <= 768) {
        $('#sidebar').removeClass('open');
        $('#mobile-menu-overlay').removeClass('active');
      }
    });

    $('#btn-add-project').on('click', function() {
      openModal('modal-add-project');
    });

    $('#btn-settings').on('click', function() {
      loadAndShowSettings();
    });

    // Settings tab switching
    $(document).on('click', '.settings-tab', function() {
      var tabName = $(this).data('tab');

      // Update tab buttons
      $('.settings-tab').removeClass('active border-purple-500 text-white').addClass('border-transparent text-gray-400');
      $(this).addClass('active border-purple-500 text-white').removeClass('border-transparent text-gray-400');

      // Show/hide tab content
      $('.settings-tab-content').addClass('hidden');
      $('#settings-tab-' + tabName).removeClass('hidden');
    });

    // Permission skip checkbox toggles other permission fields
    $('#input-skip-permissions').on('change', function() {
      updatePermissionFieldsState();
    });

    // Permission presets
    $(document).on('click', '.permission-preset', function() {
      var presetName = $(this).data('preset');
      applyPermissionPreset(presetName);
    });

    $('#btn-view-roadmap').on('click', function() {
      loadAndShowRoadmap();
    });

    $('#btn-toggle-debug').on('click', function() {
      openDebugModal();
    });

    $('#btn-toggle-dev').on('click', function() {
      openModal('modal-dev');
    });

    $('#btn-dev-shutdown').on('click', function() {
      showConfirm('Shutdown Server', 'Are you sure you want to shutdown the server?', { danger: true, confirmText: 'Shutdown' })
        .then(function(confirmed) {
          if (confirmed) {
            api.shutdownServer()
              .done(function() {
                showToast('Server is shutting down...', 'info');
                closeModal('modal-dev');
              })
              .fail(function(xhr) {
                showToast(getErrorMessage(xhr), 'error');
              });
          }
        });
    });

    $('#btn-debug-refresh').on('click', function() {
      refreshDebugInfo();
    });

    // Debug modal tab handlers
    $(document).on('click', '.debug-tab', function() {
      var $tab = $(this);
      var tabName = $tab.data('tab');

      // Update tab active states
      $('.debug-tab').removeClass('active border-purple-500 text-white').addClass('border-transparent text-gray-400');
      $tab.addClass('active border-purple-500 text-white').removeClass('border-transparent text-gray-400');

      // Show/hide tab content
      $('.debug-tab-content').addClass('hidden');
      $('#debug-tab-' + tabName).removeClass('hidden');
    });

    // Debug log item click to expand/collapse
    $(document).on('click', '.debug-log-item', function(e) {
      var $item = $(this);
      var $detail = $item.find('.debug-log-detail');
      var $chevron = $item.find('.debug-log-chevron');
      var logId = $item.data('log-id');

      if ($detail.length === 0) return; // No detail to expand

      // Track expansion state by log ID
      if (logId) {
        state.debugExpandedLogs[logId] = !state.debugExpandedLogs[logId];
      }

      $detail.toggleClass('hidden');
      $chevron.toggleClass('rotate-180');
    });

    // Debug log filter checkboxes
    $(document).on('change', '.log-filter-checkbox', function() {
      var filterId = $(this).attr('id');
      var filterName = filterId.replace('log-filter-', '');
      state.debugLogFilters[filterName] = $(this).is(':checked');

      // Re-render logs tab if it's currently active
      if ($('#debug-tab-logs').is(':visible')) {
        refreshDebugInfo();
      }
    });

    $('#btn-create-roadmap').on('click', function() {
      closeModal('modal-roadmap');
      openModal('modal-create-roadmap');
    });

    $('#btn-close-roadmap-progress').on('click', function() {
      closeModal('modal-roadmap-progress');
      loadAndShowRoadmap();
    });

    $('.modal-close').on('click', function() {
      closeAllModals();
    });

    $('.modal-backdrop').on('click', function() {
      closeAllModals();
    });

    // Tool message click handler - open detail modal
    $(document).on('click', '.conversation-message.tool-use', function() {
      var toolId = $(this).attr('data-tool-id');
      var toolData = toolDataStore[toolId];

      if (toolData) {
        openToolDetailModal(toolData);
      }
    });

    // Milestone expand/collapse toggle
    $(document).on('click', '.milestone-header', function(e) {
      var $header = $(this);
      var key = $header.data('milestone-key');
      var isExpanded = toggleMilestoneExpanded(key);
      var $container = $header.closest('.milestone-container');
      var $tasks = $container.find('.milestone-tasks');
      var $chevron = $header.find('.milestone-chevron');

      if (isExpanded) {
        $tasks.slideDown(200);
        $chevron.addClass('rotate-90');
      } else {
        $tasks.slideUp(200);
        $chevron.removeClass('rotate-90');
      }
    });

    // Delete task button in roadmap
    $(document).on('click', '.btn-delete-task', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var $btn = $(this);
      state.pendingDeleteTask = {
        phaseId: $btn.data('phase-id'),
        milestoneId: $btn.data('milestone-id'),
        taskIndex: $btn.data('task-index'),
        taskTitle: $btn.data('task-title')
      };
      $('#delete-task-title').text(state.pendingDeleteTask.taskTitle);
      openModal('modal-confirm-delete-task');
    });

    $('#btn-confirm-delete-task').on('click', function() {
      confirmDeleteTask();
    });

    // Delete milestone button in roadmap
    $(document).on('click', '.btn-delete-milestone', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var $btn = $(this);
      state.pendingDeleteMilestone = {
        phaseId: $btn.data('phase-id'),
        milestoneId: $btn.data('milestone-id'),
        milestoneTitle: $btn.data('milestone-title')
      };
      $('#delete-milestone-title').text(state.pendingDeleteMilestone.milestoneTitle);
      openModal('modal-confirm-delete-milestone');
    });

    $('#btn-confirm-delete-milestone').on('click', function() {
      confirmDeleteMilestone();
    });

    // Delete phase button in roadmap
    $(document).on('click', '.btn-delete-phase', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var $btn = $(this);
      state.pendingDeletePhase = {
        phaseId: $btn.data('phase-id'),
        phaseTitle: $btn.data('phase-title')
      };
      $('#delete-phase-title').text(state.pendingDeletePhase.phaseTitle);
      openModal('modal-confirm-delete-phase');
    });

    $('#btn-confirm-delete-phase').on('click', function() {
      confirmDeletePhase();
    });

    // Roadmap selection handlers
    $(document).on('change', '.roadmap-select-milestone', function() {
      var $checkbox = $(this);
      var milestoneId = $checkbox.data('milestone-id');
      var isChecked = $checkbox.is(':checked');

      // Select/deselect all tasks under this milestone
      $('.roadmap-select-task[data-milestone-id="' + milestoneId + '"]:not(:disabled)').prop('checked', isChecked);
      updateRoadmapSelectionUI();
    });

    $(document).on('change', '.roadmap-select-task', function() {
      updateRoadmapSelectionUI();
    });

    $('#btn-clear-roadmap-selection').on('click', function() {
      clearRoadmapSelection();
    });

    $('#btn-run-selected-tasks').on('click', function() {
      runSelectedRoadmapTasks();
    });

    // Font size controls for agent output
    $('#btn-font-decrease').on('click', function() {
      if (state.fontSize > 10) {
        state.fontSize -= 2;
        updateFontSize();
      }
    });

    $('#btn-font-increase').on('click', function() {
      if (state.fontSize < 24) {
        state.fontSize += 2;
        updateFontSize();
      }
    });

    // Scroll lock toggle for agent output
    $('#btn-toggle-scroll-lock').on('click', function() {
      state.agentOutputScrollLock = !state.agentOutputScrollLock;
      saveToLocalStorage(LOCAL_STORAGE_KEYS.SCROLL_LOCK, state.agentOutputScrollLock);
      updateScrollLockButton();
    });

    // Detect manual scroll in agent output
    $('#conversation-container').on('scroll', function() {
      var $container = $(this);
      var isNearBottom = $container[0].scrollHeight - $container.scrollTop() - $container.outerHeight() < 50;

      if (!isNearBottom && !state.agentOutputScrollLock) {
        // User scrolled up - pause auto-scroll
        state.agentOutputScrollLock = true;
        updateScrollLockButton();
      } else if (isNearBottom && state.agentOutputScrollLock) {
        // User scrolled back to bottom - re-enable auto-scroll
        state.agentOutputScrollLock = false;
        updateScrollLockButton();
      }
    });

    $(document).on('keydown', function(e) {
      if (e.key === 'Escape') {
        if (state.search.isOpen) {
          closeSearch();
        } else {
          closeAllModals();
        }
      }
    });

    // Search keyboard shortcut - Ctrl+F to open search
    $(document).on('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Only activate when agent output tab is visible and not in an input/textarea
        if ($('#tab-content-agent-output').is(':visible') &&
            !$(e.target).is('input, textarea')) {
          e.preventDefault();
          openSearch();
        }
      }
    });

    // Search input event handlers
    $('#search-input').on('input', function() {
      var query = $(this).val();
      performSearch(query);
    });

    $('#search-input').on('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();

        if (e.shiftKey) {
          goToPrevMatch();
        } else {
          goToNextMatch();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      }
    });

    // Search navigation buttons
    $('#btn-search-next').on('click', goToNextMatch);
    $('#btn-search-prev').on('click', goToPrevMatch);
    $('#btn-search-close').on('click', closeSearch);

    // Advanced search toggle
    $('#btn-search-advanced').on('click', function() {
      $('#search-advanced-filters').toggleClass('hidden');
      $(this).toggleClass('bg-purple-600 bg-gray-700');
    });

    // Filter checkbox change handlers
    $('#filter-user, #filter-assistant, #filter-tool, #filter-system').on('change', function() {
      var filterId = $(this).attr('id').replace('filter-', '');
      state.search.filters[filterId] = $(this).is(':checked');
      applyMessageTypeFilters();

      if (state.search.query) {
        performSearch(state.search.query);
      }
    });

    // Search history checkbox
    $('#filter-history').on('change', function() {
      state.search.searchHistory = $(this).is(':checked');

      if (state.search.query) {
        performSearch(state.search.query);
      }
    });
  }

  function loadAndShowSettings() {
    api.getSettings()
      .done(function(settings) {
        var perms = settings.claudePermissions || {};

        $('#input-max-concurrent').val(settings.maxConcurrentAgents);
        $('#input-skip-permissions').prop('checked', perms.dangerouslySkipPermissions);
        $('#input-permission-mode').val(perms.defaultMode || 'acceptEdits');
        $('#input-allow-rules').val((perms.allowRules || []).join('\n'));
        $('#input-deny-rules').val((perms.denyRules || []).join('\n'));
        $('#input-agent-prompt').val(settings.agentPromptTemplate || '');
        $('#input-append-system-prompt').val(settings.appendSystemPrompt || '');
        $('#input-send-ctrl-enter').prop('checked', settings.sendWithCtrlEnter !== false);
        $('#input-history-limit').val(settings.historyLimit || 25);
        $('#input-claude-md-max-size').val(settings.claudeMdMaxSizeKB || 50);
        $('#input-desktop-notifications').prop('checked', settings.enableDesktopNotifications || false);
        updatePermissionFieldsState();
        openModal('modal-settings');
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to load settings');
      });
  }

  function updatePermissionFieldsState() {
    var skipAll = $('#input-skip-permissions').is(':checked');
    var $fields = $('#input-permission-mode, #input-allow-rules, #input-deny-rules');
    var $presets = $('.permission-preset');

    if (skipAll) {
      $fields.prop('disabled', true).addClass('opacity-50');
      $presets.prop('disabled', true).addClass('opacity-50');
    } else {
      $fields.prop('disabled', false).removeClass('opacity-50');
      $presets.prop('disabled', false).removeClass('opacity-50');
    }
  }

  function parseRulesFromTextarea(value) {
    return value.split('\n')
      .map(function(line) { return line.trim(); })
      .filter(function(line) { return line.length > 0; });
  }

  var permissionPresets = {
    'safe-dev': {
      allowRules: [
        'Read',
        'Glob',
        'Grep',
        'Bash(npm run:*)',
        'Bash(npm test:*)',
        'Bash(npm install)',
        'Bash(node:*)',
        'Bash(go run:*)',
        'Bash(go build:*)',
        'Bash(go test:*)',
        'Bash(go mod:*)',
        'Bash(cargo run:*)',
        'Bash(cargo build:*)',
        'Bash(cargo test:*)',
        'Bash(cargo check:*)',
        'Bash(git status)',
        'Bash(git diff:*)',
        'Bash(git log:*)',
        'Bash(git branch:*)'
      ],
      denyRules: [
        'Read(./.env)',
        'Read(./.env.*)',
        'Bash(rm -rf:*)',
        'Bash(git push:*)',
        'Bash(git push)'
      ]
    },
    'git-only': {
      allowRules: [
        'Read',
        'Glob',
        'Grep',
        'Bash(git:*)'
      ],
      denyRules: [
        'Read(./.env)',
        'Read(./.env.*)',
        'Bash(git push:*)',
        'Bash(git push)'
      ]
    },
    'read-only': {
      allowRules: [
        'Read',
        'Glob',
        'Grep'
      ],
      denyRules: [
        'Read(./.env)',
        'Read(./.env.*)',
        'Write',
        'Edit',
        'Bash'
      ]
    },
    'clear-all': {
      allowRules: [],
      denyRules: []
    }
  };

  function applyPermissionPreset(presetName) {
    var preset = permissionPresets[presetName];

    if (!preset) return;

    $('#input-allow-rules').val(preset.allowRules.join('\n'));
    $('#input-deny-rules').val(preset.denyRules.join('\n'));
    showToast('Preset "' + presetName.replace('-', ' ') + '" applied', 'info');
  }

  function handleSaveSettings($form) {
    var newSendWithCtrlEnter = $('#input-send-ctrl-enter').is(':checked');
    var historyLimit = parseInt($('#input-history-limit').val(), 10) || 25;
    var claudeMdMaxSizeKB = parseInt($('#input-claude-md-max-size').val(), 10) || 50;
    var enableDesktopNotifications = $('#input-desktop-notifications').is(':checked');
    var appendSystemPrompt = $('#input-append-system-prompt').val() || '';
    var settings = {
      maxConcurrentAgents: parseInt($('#input-max-concurrent').val(), 10),
      claudePermissions: {
        dangerouslySkipPermissions: $('#input-skip-permissions').is(':checked'),
        defaultMode: $('#input-permission-mode').val() || 'acceptEdits',
        allowRules: parseRulesFromTextarea($('#input-allow-rules').val()),
        denyRules: parseRulesFromTextarea($('#input-deny-rules').val())
      },
      agentPromptTemplate: $('#input-agent-prompt').val(),
      appendSystemPrompt: appendSystemPrompt,
      sendWithCtrlEnter: newSendWithCtrlEnter,
      historyLimit: historyLimit,
      claudeMdMaxSizeKB: claudeMdMaxSizeKB,
      enableDesktopNotifications: enableDesktopNotifications
    };

    // Request notification permission if enabling notifications
    if (enableDesktopNotifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    api.updateSettings(settings)
      .done(function(updated) {
        state.resourceStatus.maxConcurrent = updated.maxConcurrentAgents;
        state.sendWithCtrlEnter = updated.sendWithCtrlEnter !== false;
        state.historyLimit = updated.historyLimit || 25;
        state.settings = updated;
        updateRunningCount();
        updateInputHint();
        closeAllModals();
        showToast('Settings saved', 'success');
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to save settings');
      });
  }

  function updateInputHint() {
    var isMobile = isMobileView();

    if (state.sendWithCtrlEnter) {
      if (isMobile) {
        $('#input-hint-text').text('Tap Send to send');
        $('#input-message').attr('placeholder', 'Type a message to Claude...');
      } else {
        $('#input-hint-text').text('Ctrl+Enter to send, Enter for new line');
        $('#input-message').attr('placeholder', 'Type a message to Claude... (Ctrl+Enter to send)');
      }
    } else {
      if (isMobile) {
        $('#input-hint-text').text('Tap Send to send');
        $('#input-message').attr('placeholder', 'Type a message to Claude...');
      } else {
        $('#input-hint-text').text('Enter to send, Shift+Enter for new line');
        $('#input-message').attr('placeholder', 'Type a message to Claude... (Enter to send, Shift+Enter for new line)');
      }
    }

    // Update image hint with attach link
    var attachLink = '<a href="#" id="btn-attach-image" class="text-purple-400 hover:text-purple-300">attach</a>';

    if (isMobile) {
      $('#input-hint-image').html('• Long-press to paste or ' + attachLink);
    } else {
      $('#input-hint-image').html('• Paste images with Ctrl+V or ' + attachLink);
    }
  }

  function setupProjectHandlers() {
    $('#project-list').on('click', '.project-card', function(e) {
      if ($(e.target).closest('.quick-action').length) {
        return; // Don't select when clicking quick action
      }
      var projectId = $(this).data('id');
      selectProject(projectId);
    });

    $('#project-list').on('click', '.quick-action', function(e) {
      e.stopPropagation();
      var $btn = $(this);
      var action = $btn.data('action');
      var projectId = $btn.data('id');
      handleQuickAction(action, projectId);
    });
  }

  function setQuickActionLoading(projectId, isLoading) {
    var $card = $('.project-card[data-id="' + projectId + '"]');
    var $buttons = $card.find('.quick-action');

    if (isLoading) {
      $buttons.addClass('loading').prop('disabled', true);
    } else {
      $buttons.removeClass('loading').prop('disabled', false);
    }
  }

  function showContentLoading(message) {
    $('#loading-message').text(message || 'Processing...');
    $('#content-loading').removeClass('hidden');
  }

  function hideContentLoading() {
    $('#content-loading').addClass('hidden');
  }

  function handleQuickAction(action, projectId) {
    if (action === 'delete') {
      showDeleteConfirmation(projectId);
      return;
    }

    if (action === 'start' && state.agentStarting) return;

    setQuickActionLoading(projectId, true);

    if (state.selectedProjectId === projectId && (action === 'start' || action === 'stop')) {
      showContentLoading(action === 'start' ? 'Starting agent...' : 'Stopping agent...');
    }

    switch (action) {
      case 'start':
        state.agentStarting = true;
        api.startAgent(projectId)
          .done(function() {
            showToast('Agent starting...', 'info');
          })
          .fail(function(xhr) {
            showErrorToast(xhr, 'Failed to start agent');
          })
          .always(function() {
            state.agentStarting = false;
            setQuickActionLoading(projectId, false);
            // Only hide loading if still viewing the same project
            if (state.selectedProjectId === projectId) {
              hideContentLoading();
            }
          });
        break;
      case 'stop':
        api.stopAgent(projectId)
          .done(function() {
            showToast('Agent stopping...', 'info');
          })
          .fail(function(xhr) {
            showErrorToast(xhr, 'Failed to stop agent');
          })
          .always(function() {
            setQuickActionLoading(projectId, false);
            // Only hide loading if still viewing the same project
            if (state.selectedProjectId === projectId) {
              hideContentLoading();
            }
          });
        break;
      case 'cancel':
        api.removeFromQueue(projectId)
          .done(function() {
            updateProjectStatusById(projectId, 'stopped');
            showToast('Removed from queue', 'success');
          })
          .fail(function(xhr) {
            showErrorToast(xhr, 'Failed to remove from queue');
          })
          .always(function() {
            setQuickActionLoading(projectId, false);
            // Only hide loading if still viewing the same project
            if (state.selectedProjectId === projectId) {
              hideContentLoading();
            }
          });
        break;
    }
  }

  function showDeleteConfirmation(projectId) {
    var project = findProjectById(projectId);

    if (!project) return;

    state.pendingDeleteId = projectId;
    $('#delete-project-name').text(project.name);
    openModal('modal-confirm-delete');
  }

  function confirmDeleteProject() {
    var projectId = state.pendingDeleteId;

    if (!projectId) return;

    api.deleteProject(projectId)
      .done(function() {
        state.projects = state.projects.filter(function(p) { return p.id !== projectId; });

        if (state.selectedProjectId === projectId) {
          state.selectedProjectId = null;
          saveToLocalStorage(LOCAL_STORAGE_KEYS.SELECTED_PROJECT, null);
          renderProjectDetail(null);
        }

        renderProjectList();
        closeAllModals();
        showToast('Project deleted', 'success');
        state.pendingDeleteId = null;
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to delete project');
      });
  }

  function confirmDeleteTask() {
    var task = state.pendingDeleteTask;

    if (!task || !state.selectedProjectId) return;

    api.deleteRoadmapTask(state.selectedProjectId, task.phaseId, task.milestoneId, task.taskIndex)
      .done(function(data) {
        closeModal('modal-confirm-delete-task');
        renderRoadmap(data);
        showToast('Task deleted', 'success');
        state.pendingDeleteTask = null;
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to delete task');
      });
  }

  function confirmDeleteMilestone() {
    var milestone = state.pendingDeleteMilestone;

    if (!milestone || !state.selectedProjectId) return;

    api.deleteRoadmapMilestone(state.selectedProjectId, milestone.phaseId, milestone.milestoneId)
      .done(function(data) {
        closeModal('modal-confirm-delete-milestone');
        renderRoadmap(data);
        showToast('Milestone deleted', 'success');
        state.pendingDeleteMilestone = null;
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to delete milestone');
      });
  }

  function confirmDeletePhase() {
    var phase = state.pendingDeletePhase;

    if (!phase || !state.selectedProjectId) return;

    api.deleteRoadmapPhase(state.selectedProjectId, phase.phaseId)
      .done(function(data) {
        closeModal('modal-confirm-delete-phase');
        renderRoadmap(data);
        showToast('Phase deleted', 'success');
        state.pendingDeletePhase = null;
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to delete phase');
      });
  }

  function updateScrollLockButton() {
    var $btn = $('#btn-toggle-scroll-lock');

    if (state.agentOutputScrollLock) {
      $btn.addClass('bg-yellow-600').removeClass('bg-gray-700');
      $btn.attr('title', 'Auto-scroll paused. Click to resume.');
    } else {
      $btn.removeClass('bg-yellow-600').addClass('bg-gray-700');
      $btn.attr('title', 'Auto-scroll enabled. Click to pause.');
    }
  }

  function updateFontSize() {
    var size = state.fontSize + 'px';

    // Set CSS variable on document root for global scaling
    document.documentElement.style.setProperty('--claudito-font-size', size);

    $('#font-size-display').text(size);

    // Persist to localStorage
    saveToLocalStorage(LOCAL_STORAGE_KEYS.FONT_SIZE, state.fontSize);
  }

  function loadFontSize() {
    var savedSize = loadFromLocalStorage(LOCAL_STORAGE_KEYS.FONT_SIZE, 14);
    state.fontSize = savedSize;

    if (state.fontSize < 10) state.fontSize = 10;
    if (state.fontSize > 24) state.fontSize = 24;

    updateFontSize();
  }

  function loadScrollLockPreference() {
    var savedScrollLock = loadFromLocalStorage(LOCAL_STORAGE_KEYS.SCROLL_LOCK, false);
    state.agentOutputScrollLock = savedScrollLock;
    updateScrollLockButton();
  }

  function setupAgentHandlers() {
    $('#btn-start-agent').on('click', function() {
      startSelectedAgent();
    });

    $('#btn-stop-agent').on('click', function() {
      stopSelectedAgent();
    });

    // Mode toggle handlers
    $('#btn-mode-interactive').on('click', function() {
      setAgentMode('interactive');
    });

    $('#btn-mode-autonomous').on('click', function() {
      showToast('Autonomous mode is currently in development', 'info');
    });

    // Permission mode toggle handlers
    $('#btn-perm-accept').on('click', function() {
      setPermissionMode('acceptEdits');
    });

    $('#btn-perm-plan').on('click', function() {
      setPermissionMode('plan');
    });

    // Cancel button handler
    $('#btn-cancel-agent').on('click', function() {
      cancelAgentOperation();
    });

    // Message form handler
    $('#form-send-message').on('submit', function(e) {
      e.preventDefault();
      sendMessage();
    });

    // New conversation button - show confirmation dialog
    $('#btn-new-conversation').on('click', function() {
      showNewConversationConfirmation();
    });

    // Confirm new conversation
    $('#btn-confirm-new-conversation').on('click', function() {
      closeModal('modal-confirm-new-conversation');
      startNewConversation();
    });

    // History button
    $('#btn-show-history').on('click', function(e) {
      e.stopPropagation();
      toggleConversationHistory();
    });

    // Close history button
    $('#btn-close-history').on('click', function() {
      closeConversationHistory();
    });

    // Context usage button
    $('#btn-context-usage').on('click', function() {
      openContextUsageModal();
    });

    // Claude Files button
    $('#btn-claude-files').on('click', function() {
      openClaudeFilesModal();
    });

    // Tasks button
    $('#btn-tasks').on('click', function() {
      openTasksModal();
    });

    // Optimizations button
    $('#btn-optimizations').on('click', function() {
      openOptimizationsModal();
    });

    // Optimization action buttons (dynamically created, so use delegation)
    $(document).on('click', '.optimization-action', function() {
      var action = $(this).data('action');
      var filePath = $(this).data('path');

      closeModal('modal-optimizations');

      if (action === 'create') {
        // Determine template based on file name
        var fileName = filePath.split(/[\\\/]/).pop();
        var template = '';

        if (fileName === 'CLAUDE.md') {
          template = '# Project Context\n\nAdd project-specific instructions for Claude here.\n';
        } else if (fileName === 'ROADMAP.md') {
          template = '# Project Roadmap\n\n## Phase 1: Initial Setup\n\n### Milestone 1.1: Project Foundation\n\n- [ ] First task\n- [ ] Second task\n';
        } else {
          template = '';
        }

        api.writeFile(filePath, template)
          .done(function() {
            showToast(fileName + ' created', 'success');

            // Refresh file browser if project files tab is active
            if (state.activeTab === 'project-files') {
              var project = findProjectById(state.selectedProjectId);

              if (project) {
                loadFileTree(project.path);
              }
            }

            // Open the file in editor
            openFile(filePath, fileName);
          })
          .fail(function(xhr) {
            // Check if parent directory doesn't exist
            if (xhr.status === 500 || xhr.status === 404) {
              // Try to create parent directory first
              var parentPath = filePath.substring(0, filePath.lastIndexOf(/[\\\/]/.test(filePath) ? (filePath.indexOf('\\') !== -1 ? '\\' : '/') : '/'));

              if (parentPath && parentPath !== filePath) {
                api.createFolder(parentPath)
                  .done(function() {
                    // Retry file creation
                    api.writeFile(filePath, template)
                      .done(function() {
                        showToast(fileName + ' created', 'success');

                        if (state.activeTab === 'project-files') {
                          var project = findProjectById(state.selectedProjectId);

                          if (project) {
                            loadFileTree(project.path);
                          }
                        }

                        openFile(filePath, fileName);
                      })
                      .fail(function() {
                        showToast('Failed to create ' + fileName, 'error');
                      });
                  })
                  .fail(function() {
                    showToast('Failed to create ' + fileName, 'error');
                  });
              } else {
                showToast('Failed to create ' + fileName, 'error');
              }
            } else {
              showToast('Failed to create ' + fileName, 'error');
            }
          });
      } else if (action === 'edit') {
        // Open file in editor
        var fileName = filePath.split(/[\\\/]/).pop();
        openFile(filePath, fileName);
      } else if (action === 'claude-files') {
        // Open Claude Files modal
        openClaudeFilesModal();
      }
    });

    // Queued messages indicator (dynamically created, so use delegation)
    $(document).on('click', '#queued-messages-indicator', function() {
      openQueuedMessagesModal();
    });

    // Remove queued message button (dynamically created, so use delegation)
    $(document).on('click', '.btn-remove-queued-message', function(e) {
      e.stopPropagation();
      var $item = $(this).closest('[data-queue-index]');
      var index = parseInt($item.data('queue-index'), 10);

      if (!isNaN(index)) {
        removeQueuedMessage(index);
      }
    });

    // Save Claude file button
    $('#btn-save-claude-file').on('click', function() {
      saveClaudeFile();
    });

    // Claude file editor change detection
    $('#claude-file-editor').on('input', function() {
      var currentFile = state.claudeFilesState && state.claudeFilesState.currentFile;

      if (currentFile) {
        var hasChanges = $(this).val() !== currentFile.originalContent;
        $('#btn-save-claude-file').toggleClass('hidden', !hasChanges);
        updateClaudeFilePreview();
      }
    });

    // Claude file preview toggle
    $('#btn-toggle-claude-preview').on('click', function() {
      toggleClaudeFilePreview();
    });

    // Claude file list click handler
    $(document).on('click', '.claude-file-item', function() {
      var filePath = $(this).data('path');
      selectClaudeFile(filePath);
    });

    // Click on conversation history item (but not on rename button)
    $(document).on('click', '.conversation-history-item', function(e) {
      if ($(e.target).closest('.btn-rename-conversation').length) {
        return; // Don't load if clicking rename button
      }

      var conversationId = $(this).data('conversation-id');
      loadConversation(conversationId);
      closeConversationHistory();
    });

    // Rename conversation button click
    $(document).on('click', '.btn-rename-conversation', function(e) {
      e.stopPropagation();
      var conversationId = $(this).data('conversation-id');
      var currentLabel = $(this).data('current-label');
      showRenameConversationModal(conversationId, currentLabel);
    });

    // Confirm rename conversation
    $('#btn-confirm-rename').on('click', function() {
      confirmRenameConversation();
    });

    // Enter key in rename input
    $('#input-conversation-label').on('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmRenameConversation();
      }
    });

    // Close history dropdown when clicking outside
    $(document).on('click', function(e) {
      if (state.conversationHistoryOpen &&
          !$(e.target).closest('#conversation-history-dropdown').length &&
          !$(e.target).closest('#btn-show-history').length) {
        closeConversationHistory();
      }
    });

    // Message input - configurable send key
    $('#input-message').on('keydown', function(e) {
      if (e.key === 'Enter') {
        if (state.sendWithCtrlEnter) {
          // Ctrl+Enter to send mode
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            sendMessage();
          }
          // Plain Enter adds newline (default behavior)
        } else {
          // Enter to send mode (Shift+Enter for newline)
          if (!e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        }
      }
    });

    // Image paste handler
    $('#input-message').on('paste', handleImagePaste);

    // Image upload link handler (using event delegation since link is dynamically created)
    $(document).on('click', '#btn-attach-image', function(e) {
      e.preventDefault();
      $('#image-upload-input').click();
    });

    // Image file input change handler
    $('#image-upload-input').on('change', function(e) {
      var files = e.target.files;

      for (var i = 0; i < files.length; i++) {
        if (files[i].type.indexOf('image') !== -1) {
          processImageFile(files[i]);
        }
      }

      // Reset input so same file can be selected again
      $(this).val('');
    });

    // Remove image button handler
    $(document).on('click', '.image-preview-remove', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var imageId = $(this).data('image-id');
      removeImage(imageId);
    });

    // Permission button click handler
    $(document).on('click', '.permission-btn', function() {
      var $btn = $(this);
      var response = $btn.data('response');

      // Send response to agent
      sendPermissionResponse(response);

      // Clear prompt blocking
      setPromptBlockingState(null);

      // Disable all buttons in this permission request
      $btn.closest('.permission-actions').find('.permission-btn').prop('disabled', true);
      $btn.addClass('selected');
    });

    // Question option click handler
    $(document).on('click', '.question-option', function() {
      var $btn = $(this);
      var optionIndex = $btn.data('option-index');
      var optionLabel = $btn.data('option-label');

      if (optionIndex === -1) {
        // "Other" option - clear blocking and focus the input
        setPromptBlockingState(null);
        $('#agent-input').focus();
        return;
      }

      // Send the selected option as response
      sendQuestionResponse(optionLabel);

      // Clear prompt blocking
      setPromptBlockingState(null);

      // Disable all options in this question
      $btn.closest('.question-options').find('.question-option').prop('disabled', true);
      $btn.addClass('selected');
    });

    // Plan mode approve button handler
    $(document).on('click', '.plan-approve-btn', function() {
      var $btn = $(this);
      var $actions = $btn.closest('.plan-mode-actions');
      $actions.find('button').prop('disabled', true).addClass('opacity-50 cursor-not-allowed');

      // Clear prompt blocking
      setPromptBlockingState(null);

      // Switch to Accept Edits mode and restart agent with implementation message
      approvePlanAndSwitchToAcceptEdits();
    });

    // Plan mode reject button handler
    $(document).on('click', '.plan-reject-btn', function() {
      var $btn = $(this);
      var $actions = $btn.closest('.plan-mode-actions');
      $actions.find('button').prop('disabled', true).addClass('opacity-50 cursor-not-allowed');

      // Clear prompt blocking
      setPromptBlockingState(null);

      sendPlanModeResponse('no');
    });

    // Plan mode request changes button handler
    $(document).on('click', '.plan-request-changes-btn', function() {
      var $btn = $(this);
      var $actions = $btn.closest('.plan-mode-actions');
      // Disable all buttons in this plan mode action set
      $actions.find('button').prop('disabled', true).addClass('opacity-50 cursor-not-allowed');

      // Clear prompt blocking so user can type feedback
      setPromptBlockingState(null);

      // Focus the input field so user can type their feedback
      var $input = $('#agent-input');
      $input.focus();
      showToast('Describe what you\'d like to change in the plan', 'info');
    });
  }

  function sendPlanModeResponse(response) {
    if (!state.selectedProjectId) return;

    api.sendAgentMessage(state.selectedProjectId, response)
      .fail(function(xhr) {
        console.error('Failed to send plan mode response:', xhr);
        showToast('Failed to send response', 'error');
      });
  }

  function showNewConversationConfirmation() {
    if (!state.selectedProjectId) return;

    // If no messages in current conversation, just start new without confirmation
    var currentMessages = state.conversations[state.selectedProjectId] || [];

    if (currentMessages.length === 0) {
      startNewConversation();
      return;
    }

    openModal('modal-confirm-new-conversation');
  }

  function startNewConversation() {
    if (!state.selectedProjectId) return;

    var projectId = state.selectedProjectId;
    var project = findProjectById(projectId);
    var wasRunning = project && project.status === 'running';

    // Clear search when starting new conversation
    if (state.search.isOpen) {
      closeSearch();
    }

    // Clear read file cache when starting new conversation
    clearReadFileCache();

    // Clear tasks when starting new conversation
    state.currentTodos = [];
    updateTasksButtonBadge();

    // Clear session ID to force new session
    state.currentSessionId = null;

    // Clear any prompt blocking
    setPromptBlockingState(null);

    function clearAndRestart() {
      // Clear current conversation on server
      $.ajax({
        url: '/api/projects/' + projectId + '/conversation/clear',
        method: 'POST'
      }).always(function() {
        // Clear local state regardless of server response
        state.currentConversationId = null;
        state.currentConversationStats = null;
        state.currentConversationMetadata = null;
        state.conversations[projectId] = [];
        renderConversation(projectId);
        updateConversationStats();
        showToast('Context cleared', 'info');
      });
    }

    // If agent is running, stop it first then clear
    if (wasRunning) {
      showContentLoading('Clearing context...');
      api.stopAgent(projectId)
        .always(function() {
          updateProjectStatusById(projectId, 'stopped');
          stopAgentStatusPolling();
          clearAndRestart();
          hideContentLoading();
        });
    } else {
      clearAndRestart();
    }
  }

  function showRenameConversationModal(conversationId, currentLabel) {
    state.pendingRenameConversationId = conversationId;
    $('#input-conversation-label').val(currentLabel || '');
    openModal('modal-rename-conversation');
    // Focus input after modal opens
    setTimeout(function() {
      $('#input-conversation-label').focus().select();
    }, 100);
  }

  function confirmRenameConversation() {
    if (!state.selectedProjectId || !state.pendingRenameConversationId) return;

    var newLabel = $('#input-conversation-label').val().trim();

    if (!newLabel) {
      showToast('Please enter a name', 'error');
      return;
    }

    api.renameConversation(state.selectedProjectId, state.pendingRenameConversationId, newLabel)
      .done(function() {
        closeModal('modal-rename-conversation');
        loadConversationHistoryList();
        showToast('Conversation renamed', 'success');
        state.pendingRenameConversationId = null;
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to rename conversation');
      });
  }

  function toggleConversationHistory() {
    if (state.conversationHistoryOpen) {
      closeConversationHistory();
    } else {
      openConversationHistory();
    }
  }

  function openConversationHistory() {
    if (!state.selectedProjectId) return;

    state.conversationHistoryOpen = true;

    // Position dropdown near the button
    var $btn = $('#btn-show-history');
    var offset = $btn.offset();
    var $dropdown = $('#conversation-history-dropdown');

    $dropdown.css({
      top: offset.top + $btn.outerHeight() + 4,
      left: offset.left
    });

    $dropdown.removeClass('hidden');
    loadConversationHistoryList();
  }

  function closeConversationHistory() {
    state.conversationHistoryOpen = false;
    $('#conversation-history-dropdown').addClass('hidden');
  }

  function loadConversationHistoryList() {
    if (!state.selectedProjectId) return;

    var $list = $('#conversation-history-list');
    $list.html('<div class="p-2 text-xs text-gray-500">Loading...</div>');

    $.get('/api/projects/' + state.selectedProjectId + '/conversations', { limit: state.historyLimit })
      .done(function(data) {
        renderConversationHistory(data.conversations || []);
      })
      .fail(function() {
        $list.html('<div class="p-2 text-xs text-red-400">Failed to load history</div>');
      });
  }

  function renderConversationHistory(conversations) {
    var $list = $('#conversation-history-list');
    $list.empty();

    if (conversations.length === 0) {
      $list.html('<div class="p-2 text-xs text-gray-500">No conversations yet</div>');
      return;
    }

    conversations.forEach(function(conv) {
      var isActive = conv.id === state.currentConversationId;
      var activeClass = isActive ? ' active' : '';
      var date = formatConversationDate(conv.createdAt);
      // Use custom label, or itemRef taskTitle, or default
      var itemRef = conv.itemRef || conv.milestoneItem;
      var label = conv.label || (itemRef ? itemRef.taskTitle : 'Interactive Session');
      var messageCount = conv.messages ? conv.messages.length : 0;

      $list.append(
        '<div class="conversation-history-item' + activeClass + '" data-conversation-id="' + conv.id + '">' +
          '<div class="conv-row flex items-center justify-between">' +
            '<div class="conv-label flex-1 min-w-0">' + escapeHtml(truncateString(label, 35)) + '</div>' +
            '<button class="btn-rename-conversation p-1 text-gray-500 hover:text-white rounded transition-colors flex-shrink-0" data-conversation-id="' + conv.id + '" data-current-label="' + escapeHtml(label) + '" title="Rename">' +
              '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          '<div class="conv-meta">' +
            '<span class="conv-date">' + date + '</span>' +
            '<span class="conv-messages">' + messageCount + ' msgs</span>' +
          '</div>' +
        '</div>'
      );
    });
  }

  function formatConversationDate(isoString) {
    try {
      var date = new Date(isoString);
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

  function loadConversation(conversationId) {
    if (!state.selectedProjectId) return;

    // Clear search when switching conversations
    if (state.search.isOpen) {
      closeSearch();
    }

    // Clear any prompt blocking when switching conversations
    setPromptBlockingState(null);

    state.currentConversationId = conversationId;

    // Set this as the current conversation on the backend so new messages go there
    api.setCurrentConversation(state.selectedProjectId, conversationId)
      .done(function(result) {
        // Fetch the conversation messages
        api.getConversation(state.selectedProjectId, conversationId)
          .done(function(data) {
            state.conversations[state.selectedProjectId] = data.messages || [];
            state.currentConversationStats = data.stats || null;
            state.currentConversationMetadata = data.metadata || null;
            renderConversation(state.selectedProjectId);
            updateConversationStats();

            // Show toast if this conversation has a Claude session that can be resumed
            if (result.sessionId) {
              showToast('Conversation loaded. Session will resume when you send a message.', 'info');
            }
          })
          .fail(function(xhr) {
            showErrorToast(xhr, 'Failed to load conversation');
          });
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to switch conversation');
      });
  }

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

  function formatTokenCount(tokens) {
    if (tokens >= 1000000) {
      return (tokens / 1000000).toFixed(1) + 'M';
    }

    if (tokens >= 1000) {
      return (tokens / 1000).toFixed(1) + 'k';
    }

    return tokens.toString();
  }

  function updateConversationStats() {
    var $stats = $('#conversation-stats');
    var stats = state.currentConversationStats;
    var metadata = state.currentConversationMetadata;

    if (!stats || stats.messageCount === 0) {
      $stats.html('<span class="text-gray-600">New session</span>');
      return;
    }

    var parts = [];

    // Duration
    if (stats.durationMs && stats.durationMs > 0) {
      parts.push('<span title="Duration">' + formatDuration(stats.durationMs) + '</span>');
    }

    // Message count
    parts.push('<span title="Messages">' + stats.messageCount + ' msgs</span>');

    // Tool calls
    if (stats.toolCallCount > 0) {
      parts.push('<span title="Tool calls">' + stats.toolCallCount + ' tools</span>');
    }

    // Total tokens from metadata
    if (metadata && metadata.contextUsage && metadata.contextUsage.totalTokens > 0) {
      var tokens = metadata.contextUsage.totalTokens;
      var formatted = formatTokenCount(tokens);
      parts.push('<span title="Total tokens used">' + formatted + ' tokens</span>');
    }

    $stats.html(parts.join('<span class="text-gray-600 mx-1">|</span>'));
  }

  function sendPermissionResponse(response) {
    if (!response || !state.selectedProjectId) return;

    var project = findProjectById(state.selectedProjectId);

    if (!project || project.status !== 'running') return;

    api.sendAgentMessage(state.selectedProjectId, response)
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to send permission response');
      });
  }

  function sendQuestionResponse(response) {
    if (!response || !state.selectedProjectId) return;

    var project = findProjectById(state.selectedProjectId);

    if (!project || project.status !== 'running') return;

    // Add user response to conversation
    appendMessage(state.selectedProjectId, {
      type: 'user',
      content: response,
      timestamp: new Date().toISOString()
    });

    api.sendAgentMessage(state.selectedProjectId, response)
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to send response');
      });
  }

  function setAgentMode(mode) {
    state.agentMode = mode;
    updateModeButtons();
    updateStartStopButtons();
    updateInputArea();
  }

  function updateModeButtons() {
    if (state.agentMode === 'interactive') {
      $('#btn-mode-interactive').addClass('mode-active');
      $('#btn-mode-autonomous').removeClass('mode-active');
    } else {
      $('#btn-mode-interactive').removeClass('mode-active');
      $('#btn-mode-autonomous').addClass('mode-active');
    }
  }

  function setPermissionMode(mode) {
    var project = findProjectById(state.selectedProjectId);
    var isRunning = project && project.status === 'running';
    var isWaiting = project && project.isWaitingForInput;

    // Determine the effective current mode (pending mode takes precedence if set)
    var effectiveCurrentMode = state.pendingPermissionMode || state.permissionMode;

    // If clicking the mode that's already set or pending, do nothing
    if (effectiveCurrentMode === mode) {
      return;
    }

    // If there's a pending change and user clicks the original mode, cancel the pending change
    if (state.pendingPermissionMode && mode === state.permissionMode) {
      state.pendingPermissionMode = null;
      updatePendingModeIndicator();
      updatePermissionModeButtons();
      showToast('Pending mode change cancelled', 'info');
      return;
    }

    // Track the previous mode for detecting plan -> acceptEdits transitions
    var previousMode = state.permissionMode;

    // If agent is running and busy (not waiting), queue the change
    if (isRunning && state.currentSessionId && !isWaiting) {
      state.pendingPermissionMode = mode;
      updatePendingModeIndicator();
      updatePermissionModeButtons();
      showToast('Mode change to ' + getPermissionModeLabel(mode) + ' will apply when Claude finishes current operation', 'info');
      return;
    }

    // Apply the mode change
    state.permissionMode = mode;
    state.pendingPermissionMode = null;
    updatePendingModeIndicator();
    updatePermissionModeButtons();

    // If agent is running and waiting, restart with new mode
    if (isRunning && state.currentSessionId && isWaiting) {
      restartAgentWithNewPermissionMode();
    } else {
      // Show feedback that mode will be used on next agent start
      showToast('Permission mode set to ' + getPermissionModeLabel(mode) + ' (will apply on next agent start)', 'info');
    }
  }

  function updatePendingModeIndicator() {
    var $indicator = $('#pending-mode-label');

    if (state.pendingPermissionMode) {
      $indicator.text('(switching to ' + getPermissionModeLabel(state.pendingPermissionMode) + ')').removeClass('hidden');
    } else {
      $indicator.addClass('hidden');
    }
  }

  function applyPendingPermissionModeIfNeeded() {
    if (!state.pendingPermissionMode) return;

    var project = findProjectById(state.selectedProjectId);

    if (!project || project.status !== 'running' || !state.currentSessionId) {
      state.pendingPermissionMode = null;
      updatePendingModeIndicator();
      updatePermissionModeButtons();
      return;
    }

    // Apply the pending mode change
    var pendingMode = state.pendingPermissionMode;
    state.permissionMode = pendingMode;
    state.pendingPermissionMode = null;
    updatePendingModeIndicator();
    updatePermissionModeButtons();
    restartAgentWithNewPermissionMode();
  }

  function restartAgentWithNewPermissionMode() {
    var projectId = state.selectedProjectId;

    if (!projectId) return;

    var sessionId = state.currentSessionId;
    var targetMode = state.permissionMode;

    // Disable UI during mode switch
    setModeSwitchingState(true);

    showToast('Stopping agent to switch to ' + getPermissionModeLabel(targetMode) + ' mode...', 'info');

    // Stop the current agent
    api.stopAgent(projectId)
      .done(function() {
        updateProjectStatusById(projectId, 'stopped');

        // Wait 1 second before restarting to avoid "session already in use" errors
        setTimeout(function() {
          // Check if mode was changed back while we were waiting
          if (state.permissionMode !== targetMode) {
            showToast('Mode change cancelled - mode was changed again', 'info');
            setModeSwitchingState(false);
            return;
          }

          showToast('Starting agent with ' + getPermissionModeLabel(targetMode) + ' mode...', 'info');

          // Start the agent again with the same session ID and new permission mode
          api.startInteractiveAgent(projectId, '', [], sessionId, targetMode)
            .done(function(response) {
              state.currentAgentMode = 'interactive';
              updateProjectStatusById(projectId, 'running');
              startAgentStatusPolling(projectId);
              setModeSwitchingState(false);

              // Update session ID if returned (may be different if backend retried with fresh session)
              if (response && response.sessionId) {
                state.currentSessionId = response.sessionId;
              }

              appendMessage(projectId, {
                type: 'system',
                content: 'Agent restarted with ' + getPermissionModeLabel(targetMode) + ' mode',
                timestamp: new Date().toISOString()
              });
            })
            .fail(function(xhr) {
              setModeSwitchingState(false);
              showErrorToast(xhr, 'Failed to restart agent');
            });
        }, 1000);
      })
      .fail(function(xhr) {
        setModeSwitchingState(false);
        showErrorToast(xhr, 'Failed to stop agent');
      });
  }

  function approvePlanAndSwitchToAcceptEdits() {
    var projectId = state.selectedProjectId;

    if (!projectId) return;

    var sessionId = state.currentSessionId;

    // Update state to Accept Edits mode
    state.permissionMode = 'acceptEdits';
    state.pendingPermissionMode = null;
    updatePendingModeIndicator();
    updatePermissionModeButtons();

    // Disable UI during mode switch
    setModeSwitchingState(true);

    showToast('Plan approved. Switching to Accept Edits mode...', 'info');

    // Stop the current agent
    api.stopAgent(projectId)
      .done(function() {
        updateProjectStatusById(projectId, 'stopped');

        // Wait 1 second before restarting to avoid "session already in use" errors
        setTimeout(function() {
          showToast('Starting implementation...', 'info');

          var initialMessage = 'You can now start implementing the plan.';

          // Start the agent in Accept Edits mode with the implementation message
          api.startInteractiveAgent(projectId, initialMessage, [], sessionId, 'acceptEdits')
            .done(function(response) {
              state.currentAgentMode = 'interactive';
              updateProjectStatusById(projectId, 'running');
              startAgentStatusPolling(projectId);
              setModeSwitchingState(false);

              // Clear waiting state since we're sending a message
              // Clear waiting state since we're sending a message
              // Increment version to ignore stale updates from server
              var project = findProjectById(projectId);

              if (project) {
                project.isWaitingForInput = false;
                state.waitingVersion++;
                renderProjectList();
              }

              if (response && response.sessionId) {
                state.currentSessionId = response.sessionId;
              }

              appendMessage(projectId, {
                type: 'system',
                content: 'Plan approved. Agent restarted with Accept Edits mode',
                timestamp: new Date().toISOString()
              });

              appendMessage(projectId, {
                type: 'user',
                content: initialMessage,
                timestamp: new Date().toISOString()
              });
            })
            .fail(function(xhr) {
              setModeSwitchingState(false);
              showErrorToast(xhr, 'Failed to restart agent');
            });
        }, 1000);
      })
      .fail(function(xhr) {
        setModeSwitchingState(false);
        showErrorToast(xhr, 'Failed to stop agent');
      });
  }

  function setModeSwitchingState(isSwitching) {
    state.isModeSwitching = isSwitching;

    // Disable/enable permission mode buttons
    $('#btn-perm-accept, #btn-perm-plan').prop('disabled', isSwitching);

    // Disable/enable input and send button
    $('#input-message').prop('disabled', isSwitching);
    $('#btn-send-message').prop('disabled', isSwitching);
    $('#btn-cancel-agent').prop('disabled', isSwitching);

    // Add visual feedback
    if (isSwitching) {
      $('#permission-mode-selector').addClass('opacity-50 pointer-events-none');
      $('#form-send-message').addClass('opacity-50');
    } else {
      $('#permission-mode-selector').removeClass('opacity-50 pointer-events-none');
      $('#form-send-message').removeClass('opacity-50');
    }
  }

  function setPromptBlockingState(promptType) {
    state.activePromptType = promptType;
    var isBlocked = promptType !== null;

    // Disable input and send button when prompt is active
    $('#agent-input').prop('disabled', isBlocked);
    $('#send-agent-input').prop('disabled', isBlocked);

    if (isBlocked) {
      $('#agent-input').attr('placeholder', 'Please respond to the prompt above...');
      $('#form-send-agent').addClass('opacity-50');
    } else {
      $('#agent-input').attr('placeholder', 'Type your message...');
      $('#form-send-agent').removeClass('opacity-50');
    }
  }

  function setGitOperationState(isOperating) {
    state.isGitOperating = isOperating;

    // Disable all git action buttons
    $('#btn-git-refresh, #btn-git-commit, #btn-git-push, #btn-git-pull, ' +
      '#btn-git-stage-all, #btn-git-unstage-all, ' +
      '#btn-git-new-branch, #btn-git-new-tag, #btn-create-tag')
      .prop('disabled', isOperating);

    // Disable form elements
    $('#git-commit-message, #git-branch-select').prop('disabled', isOperating);

    // Disable dynamically created buttons via pointer-events
    $('.git-stage-btn, .git-unstage-btn, .git-stage-dir-btn, .git-unstage-dir-btn, ' +
      '.git-push-tag-btn, .git-branch-item')
      .css('pointer-events', isOperating ? 'none' : '');

    // Disable context menu buttons
    $('#git-ctx-stage, #git-ctx-unstage, #git-ctx-discard').prop('disabled', isOperating);

    // Visual feedback
    if (isOperating) {
      $('#git-sidebar').addClass('git-operating');
    } else {
      $('#git-sidebar').removeClass('git-operating');
    }
  }

  function getPermissionModeLabel(mode) {
    switch (mode) {
      case 'plan': return 'Plan';
      case 'acceptEdits': return 'Accept Edits';
      default: return 'Default';
    }
  }

  function updatePermissionModeButtons() {
    $('.perm-btn').removeClass('perm-active');

    // Show the pending mode as active if there is one, otherwise show the current mode
    var displayMode = state.pendingPermissionMode || state.permissionMode;

    switch (displayMode) {
      case 'plan':
        $('#btn-perm-plan').addClass('perm-active');
        break;
      case 'acceptEdits':
      default:
        $('#btn-perm-accept').addClass('perm-active');
        break;
    }
  }

  function updateStartStopButtons() {
    var project = findProjectById(state.selectedProjectId);
    var isRunning = project && project.status === 'running';
    var isInteractive = state.agentMode === 'interactive';

    if (isInteractive) {
      // Interactive mode: hide start button, only show stop when running
      $('#btn-start-agent').addClass('hidden');

      if (isRunning) {
        $('#btn-stop-agent').removeClass('hidden');
      } else {
        $('#btn-stop-agent').addClass('hidden');
      }
    } else {
      // Autonomous mode: show start/stop based on status
      if (isRunning) {
        $('#btn-start-agent').addClass('hidden');
        $('#btn-stop-agent').removeClass('hidden');
      } else {
        $('#btn-start-agent').removeClass('hidden');
        $('#btn-stop-agent').addClass('hidden');
      }
    }
  }

  function updateInputArea() {
    var project = findProjectById(state.selectedProjectId);
    var isRunning = project && project.status === 'running';
    var isInteractive = state.currentAgentMode === 'interactive';
    var isInteractiveMode = state.agentMode === 'interactive';

    // Interactive mode: always enable input (will auto-start agent if needed)
    if (isInteractiveMode) {
      $('#input-message').prop('disabled', false);
      $('#btn-send-message').prop('disabled', false);
      updateInputHint();
    } else if (isRunning && !isInteractive) {
      // Autonomous mode running
      $('#input-message').prop('disabled', true);
      $('#btn-send-message').prop('disabled', true);
      $('#input-hint-text').text('Agent is running in autonomous mode');
    } else {
      // Autonomous mode not running
      $('#input-message').prop('disabled', true);
      $('#btn-send-message').prop('disabled', true);
      $('#input-hint-text').text('Click Start to run the autonomous agent loop');
    }
  }

  // Claude Code slash commands that don't work through the API
  var UNSUPPORTED_SLASH_COMMANDS = [
    '/context-usage', '/context', '/compact', '/clear', '/config', '/cost',
    '/doctor', '/help', '/init', '/login', '/logout', '/memory', '/model',
    '/permissions', '/pr-comments', '/review', '/status', '/terminal-setup',
    '/vim', '/bug', '/listen', '/user:*', '/project:*', '/add-dir', '/mcp',
    '/plan', '/release-notes', '/allowed-tools', '/install-github-app', '/ide'
  ];

  function isUnsupportedSlashCommand(message) {
    if (!message.startsWith('/')) return false;

    var cmd = message.split(/\s/)[0].toLowerCase();

    return UNSUPPORTED_SLASH_COMMANDS.some(function(pattern) {
      if (pattern.endsWith(':*')) {
        return cmd.startsWith(pattern.slice(0, -1));
      }

      return cmd === pattern;
    });
  }

  function sendMessage() {
    var $input = $('#input-message');
    var message = $input.val().trim();
    var hasImages = state.pendingImages.length > 0;

    if (!message && !hasImages) return;

    // Check for unsupported Claude Code slash commands
    if (isUnsupportedSlashCommand(message)) {
      showSlashCommandWarning(message.split(/\s/)[0]);
      return;
    }

    // All messages (including slash commands) are sent to Claude agent
    if (state.messageSending || state.agentStarting) return;

    if (!state.selectedProjectId) return;

    var project = findProjectById(state.selectedProjectId);

    if (!project) return;

    // If agent is not running in interactive mode, start it first
    if (project.status !== 'running' && state.agentMode === 'interactive') {
      startInteractiveAgentWithMessage(message);
      return;
    }

    if (project.status !== 'running') return;

    doSendMessage(message);
  }

  function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function doSendMessage(message) {
    if (state.messageSending) return;

    var $input = $('#input-message');
    var images = state.pendingImages.slice(); // Copy the array
    var project = findProjectById(state.selectedProjectId);

    state.messageSending = true;

    // Mark as no longer waiting for input since we're sending a message
    // Increment version to ignore stale updates from server
    if (project) {
      project.isWaitingForInput = false;
      state.waitingVersion++;
      renderProjectList();
    }

    // Disable input while sending
    $input.prop('disabled', true);
    $('#btn-send-message').prop('disabled', true);

    // Build user message with images
    var userMessage = {
      type: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };

    if (images.length > 0) {
      userMessage.images = images.map(function(img) {
        return { dataUrl: img.dataUrl, mimeType: img.mimeType };
      });
    }

    // Add user message to conversation
    appendMessage(state.selectedProjectId, userMessage);

    // Show waiting indicator
    showWaitingIndicator();
    updateCancelButton();

    api.sendAgentMessage(state.selectedProjectId, message, images)
      .done(function() {
        $input.val('').trigger('input');
        clearPendingImages();
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to send message');
        removeWaitingIndicator();
      })
      .always(function() {
        state.messageSending = false;
        $input.prop('disabled', false);
        $('#btn-send-message').prop('disabled', false);
        $input.focus();
      });
  }

  function startInteractiveAgentWithMessage(message) {
    if (state.agentStarting) return;

    var $input = $('#input-message');
    var projectId = state.selectedProjectId;
    var images = state.pendingImages.slice(); // Copy the array
    var project = findProjectById(projectId);

    // Use conversation ID as session ID to resume Claude session
    // (conversation IDs are now UUIDs that match Claude session IDs)
    var sessionId = state.currentConversationId || null;

    state.agentStarting = true;

    // Mark as no longer waiting for input since we're starting with a message
    // Increment version to ignore stale updates from server
    if (project) {
      project.isWaitingForInput = false;
      state.waitingVersion++;
      renderProjectList();
    }

    // Disable input while starting
    $input.prop('disabled', true);
    $('#btn-send-message').prop('disabled', true);
    showContentLoading(sessionId ? 'Resuming session...' : 'Starting agent...');

    api.startInteractiveAgent(projectId, message, images, sessionId, state.permissionMode)
      .done(function(response) {
        state.currentAgentMode = 'interactive';
        updateProjectStatusById(projectId, 'running');
        startAgentStatusPolling(projectId);

        // Update session and conversation IDs from response
        if (response && response.sessionId) {
          state.currentSessionId = response.sessionId;
        }
        if (response && response.conversationId) {
          state.currentConversationId = response.conversationId;
        }

        // Build user message with images
        var userMessage = {
          type: 'user',
          content: message,
          timestamp: new Date().toISOString()
        };

        if (images.length > 0) {
          userMessage.images = images.map(function(img) {
            return { dataUrl: img.dataUrl, mimeType: img.mimeType };
          });
        }

        // Add user message to conversation
        appendMessage(projectId, userMessage);

        // Clear input and images, show waiting
        $input.val('').trigger('input');
        clearPendingImages();
        showWaitingIndicator();
        updateInputArea();
        updateCancelButton();
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to start agent');
      })
      .always(function() {
        state.agentStarting = false;
        // Only hide loading and re-enable inputs if still viewing the same project
        if (state.selectedProjectId === projectId) {
          hideContentLoading();
          $input.prop('disabled', false);
          $('#btn-send-message').prop('disabled', false);
          $input.focus();
        }
      });
  }

  // Image handling functions
  function handleImagePaste(e) {
    var clipboardData = e.originalEvent.clipboardData || e.clipboardData;

    if (!clipboardData || !clipboardData.items) return;

    for (var i = 0; i < clipboardData.items.length; i++) {
      var item = clipboardData.items[i];

      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        var file = item.getAsFile();

        if (file) {
          processImageFile(file);
        }
      }
    }
  }

  function processImageFile(file) {
    // Limit file size to 5MB
    var maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      showToast('Image too large (max 5MB)', 'error');
      return;
    }

    var reader = new FileReader();

    reader.onload = function(e) {
      var dataUrl = e.target.result;
      var imageId = 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      state.pendingImages.push({
        id: imageId,
        dataUrl: dataUrl,
        mimeType: file.type,
        size: file.size
      });

      renderImagePreviews();
    };

    reader.onerror = function() {
      showToast('Failed to read image', 'error');
    };

    reader.readAsDataURL(file);
  }

  function renderImagePreviews() {
    var $container = $('#image-preview-container');
    var $previews = $('#image-previews');

    if (state.pendingImages.length === 0) {
      $container.addClass('hidden');
      $previews.empty();
      return;
    }

    $container.removeClass('hidden');
    $previews.empty();

    state.pendingImages.forEach(function(img) {
      var sizeKB = Math.round(img.size / 1024);
      var sizeText = sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : sizeKB + ' KB';

      var html = '<div class="image-preview-item" data-image-id="' + img.id + '">' +
        '<img src="' + img.dataUrl + '" alt="Preview">' +
        '<button type="button" class="image-preview-remove" data-image-id="' + img.id + '">' +
          '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>' +
          '</svg>' +
        '</button>' +
        '<div class="image-preview-size">' + sizeText + '</div>' +
      '</div>';
      $previews.append(html);
    });
  }

  function removeImage(imageId) {
    state.pendingImages = state.pendingImages.filter(function(img) {
      return img.id !== imageId;
    });
    renderImagePreviews();
  }

  function clearPendingImages() {
    state.pendingImages = [];
    renderImagePreviews();
  }

  function showWaitingIndicator() {
    removeWaitingIndicator(); // Remove any existing one first
    var html = '<div id="waiting-indicator" class="flex items-center gap-2 text-gray-400 text-sm py-2">' +
      '<div class="loading-spinner small"></div>' +
      '<span>Waiting for Claude response...</span>' +
    '</div>';
    $('#conversation').append(html);
    scrollConversationToBottom();
  }

  function removeWaitingIndicator() {
    $('#waiting-indicator').remove();
  }

  // Image modal for full-size viewing
  window.showImageModal = function(src) {
    var $modal = $('#image-modal');

    if ($modal.length === 0) {
      // Create modal if it doesn't exist
      $('body').append(
        '<div id="image-modal" class="hidden">' +
          '<img src="" alt="Full size image">' +
        '</div>'
      );
      $modal = $('#image-modal');

      // Close on click
      $modal.on('click', function() {
        $modal.addClass('hidden');
      });

      // Close on escape
      $(document).on('keydown', function(e) {
        if (e.key === 'Escape' && !$modal.hasClass('hidden')) {
          $modal.addClass('hidden');
        }
      });
    }

    $modal.find('img').attr('src', src);
    $modal.removeClass('hidden');
  };

  function setupTextareaKeyHandlers() {
    // Prevent Enter from submitting forms in textareas
    // Allow Ctrl+Enter (or Cmd+Enter on Mac) to submit
    $(document).on('keydown', 'textarea', function(e) {
      if (e.key === 'Enter') {
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+Enter or Cmd+Enter: submit the form
          e.preventDefault();
          var $form = $(this).closest('form');

          if ($form.length) {
            $form.submit();
          }
        }
        // Plain Enter: allow default behavior (newline)
        // Do nothing - let the textarea handle it naturally
      }
    });
  }

  function setupCharacterCountHandlers() {
    var $textarea = $('#input-edit-roadmap');
    var $charCount = $('#edit-roadmap-char-count');

    function updateCharCount() {
      var length = $textarea.val().length;
      var text = length === 1 ? '1 character' : length + ' characters';
      $charCount.text(text);
    }

    $textarea.on('input', updateCharCount);

    // Reset character count when form is reset
    $('#form-edit-roadmap').on('reset', function() {
      setTimeout(function() {
        updateCharCount();
      }, 0);
    });
  }

  function setupAutoResizeTextareas() {
    function autoResize(textarea) {
      var $textarea = $(textarea);
      var maxHeight = parseInt($textarea.css('max-height'), 10) || 300;

      // Reset height to auto to calculate scroll height
      textarea.style.height = 'auto';

      // Calculate new height
      var newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = newHeight + 'px';

      // Add expanded class if content exceeds max height
      if (textarea.scrollHeight > maxHeight) {
        $textarea.addClass('expanded');
      } else {
        $textarea.removeClass('expanded');
      }
    }

    // Apply auto-resize to all textareas with the class
    $(document).on('input', '.textarea-auto-resize', function() {
      autoResize(this);
    });

    // Reset height when form is reset
    $(document).on('reset', 'form', function() {
      var $form = $(this);

      setTimeout(function() {
        $form.find('.textarea-auto-resize').each(function() {
          this.style.height = 'auto';
          $(this).removeClass('expanded');
        });
      }, 0);
    });

    // Initialize existing auto-resize textareas
    $('.textarea-auto-resize').each(function() {
      autoResize(this);
    });
  }

  function setupFormHandlers() {
    $('#form-add-project').on('submit', function(e) {
      e.preventDefault();
      handleAddProject($(this));
    });

    $('#form-create-roadmap').on('submit', function(e) {
      e.preventDefault();
      handleCreateRoadmap($(this));
    });

    $('#form-edit-roadmap').on('submit', function(e) {
      e.preventDefault();
      handleEditRoadmap($(this));
    });

    $('#form-roadmap-response').on('submit', function(e) {
      e.preventDefault();
      handleRoadmapResponse($(this));
    });

    $('#form-settings').on('submit', function(e) {
      e.preventDefault();
      handleSaveSettings($(this));
    });

    setupTextareaKeyHandlers();
    setupCharacterCountHandlers();
    setupAutoResizeTextareas();

    $('#btn-browse-folder').on('click', function() {
      openFolderBrowser();
    });

    $('#btn-select-folder').on('click', function() {
      confirmFolderSelection();
    });

    $('#btn-confirm-delete').on('click', function() {
      confirmDeleteProject();
    });
  }

  function setupFolderBrowserHandlers() {
    $('#folder-browser').on('click', '.folder-item', function() {
      var itemPath = $(this).data('path');
      loadFolder(itemPath);
    });

    $('#folder-breadcrumb').on('click', '.folder-breadcrumb-item', function() {
      var itemPath = $(this).data('path');

      if (itemPath === '') {
        loadDrives();
      } else {
        loadFolder(itemPath);
      }
    });
  }

  // Action handlers
  function selectProject(projectId) {
    var previousId = state.selectedProjectId;

    if (previousId && previousId !== projectId) {
      unsubscribeFromProject(previousId);
      stopAgentStatusPolling(); // Stop polling for previous project
      clearReadFileCache(); // Clear read file cache when switching projects
      // Clear tasks when switching projects
      state.currentTodos = [];
      updateTasksButtonBadge();
    }

    state.selectedProjectId = projectId;
    state.currentAgentMode = null; // Reset on project change
    state.pendingPermissionMode = null; // Clear pending mode on project change
    setPromptBlockingState(null); // Clear any prompt blocking on project change
    var project = findProjectById(projectId);

    // Save selected project to localStorage
    saveToLocalStorage(LOCAL_STORAGE_KEYS.SELECTED_PROJECT, projectId);

    subscribeToProject(projectId);
    loadConversationHistory(projectId);
    updateSelectedProject();
    renderProjectDetail(project);
    loadAgentStatus(projectId);
    loadOptimizationsBadge(projectId);

    // Restore saved tab preference
    var savedTab = loadFromLocalStorage(LOCAL_STORAGE_KEYS.ACTIVE_TAB, 'agent-output');

    if (savedTab && savedTab !== state.activeTab) {
      switchTab(savedTab);
    }

    // Refresh debug panel if open
    if (state.debugPanelOpen) {
      refreshDebugInfo();
    }
  }

  function loadAgentStatus(projectId) {
    // Note: WebSocket now sends status immediately on subscribe,
    // but we keep this API call as a fallback for initial load
    api.getAgentStatus(projectId)
      .done(function(data) {
        var project = findProjectById(projectId);

        // Capture session ID if present
        if (data.sessionId) {
          state.currentSessionId = data.sessionId;
        }

        // Sync permission mode from server
        if (data.permissionMode) {
          state.permissionMode = data.permissionMode;
          updatePermissionModeButtons();
        }

        // Update isWaitingForInput on the project (only if server version is newer)
        if (project && typeof data.isWaitingForInput === 'boolean') {
          var serverVersion = data.waitingVersion || 0;

          if (serverVersion > state.waitingVersion) {
            state.waitingVersion = serverVersion;
            project.isWaitingForInput = data.isWaitingForInput;
            updateWaitingIndicator(data.isWaitingForInput);
          }
        }

        if (data.status === 'running' && data.mode) {
          state.currentAgentMode = data.mode;
          state.queuedMessageCount = data.queuedMessageCount || 0;
          showAgentRunningIndicator(true);
          updateQueuedMessagesDisplay();
          startAgentStatusPolling(projectId); // Start polling as fallback
        } else {
          showAgentRunningIndicator(false);
          state.queuedMessageCount = 0;
          updateQueuedMessagesDisplay();
          stopAgentStatusPolling();
        }

        updateInputArea();
        updateCancelButton();
        updatePendingModeIndicator();
        $('#mode-selector').toggleClass('disabled', data.status === 'running');
      })
      .fail(function() {
        updateInputArea();
        showAgentRunningIndicator(false);
        state.queuedMessageCount = 0;
        updateQueuedMessagesDisplay();
        stopAgentStatusPolling();
        updateCancelButton();
        updatePendingModeIndicator();
      });

    // Also get current conversation from project
    $.get('/api/projects/' + projectId)
      .done(function(project) {
        state.currentConversationId = project.currentConversationId || null;
        // Stats will be updated when loadConversationHistory completes
      });
  }

  function showAgentRunningIndicator(running) {
    if (running) {
      $('#agent-output-spinner').removeClass('hidden');
      $('#agent-status-label').removeClass('hidden');
    } else {
      $('#agent-output-spinner').addClass('hidden');
      $('#agent-status-label').addClass('hidden');
    }
  }

  function loadConversationHistory(projectId) {
    $.get('/api/projects/' + projectId + '/conversation')
      .done(function(data) {
        state.conversations[projectId] = data.messages || [];
        state.currentConversationStats = data.stats || null;
        state.currentConversationMetadata = data.metadata || null;

        if (state.selectedProjectId === projectId) {
          renderConversation(projectId);
          updateConversationStats();
        }
      });
  }

  function findProjectById(id) {
    return state.projects.find(function(p) { return p.id === id; });
  }

  function handleAddProject($form) {
    var formData = {
      name: $form.find('[name="name"]').val(),
      path: $form.find('[name="path"]').val(),
      createNew: $form.find('[name="createNew"]').is(':checked')
    };

    api.addProject(formData)
      .done(function(project) {
        state.projects.push(project);
        renderProjectList();
        closeAllModals();
        $form[0].reset();
        showToast('Project added successfully', 'success');
        selectProject(project.id);
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to add project');
      });
  }

  function loadAndShowRoadmap() {
    if (!state.selectedProjectId) return;

    api.getProjectRoadmap(state.selectedProjectId)
      .done(function(data) {
        renderRoadmap(data);
        openModal('modal-roadmap');
      })
      .fail(function() {
        renderRoadmap(null);
        openModal('modal-roadmap');
      });
  }

  function handleCreateRoadmap($form) {
    var prompt = $form.find('[name="prompt"]').val();

    if (!prompt || !state.selectedProjectId) {
      showToast('Please enter a project description', 'error');
      return;
    }

    closeAllModals();
    showRoadmapProgress();
    $form[0].reset();

    api.generateRoadmap(state.selectedProjectId, prompt)
      .done(function(result) {
        if (result.success) {
          showToast('Roadmap generated successfully', 'success');
        }
      })
      .fail(function(xhr) {
        state.roadmapGenerating = false;
        $('#roadmap-progress-spinner').addClass('hidden');
        showErrorToast(xhr, 'Failed to generate roadmap');
      });
  }

  function handleEditRoadmap($form) {
    var prompt = $form.find('[name="editPrompt"]').val();

    if (!prompt || !state.selectedProjectId) {
      showToast('Please describe the changes you want', 'error');
      return;
    }

    closeAllModals();
    showRoadmapProgress();
    $form[0].reset();

    api.modifyRoadmap(state.selectedProjectId, prompt)
      .done(function(result) {
        state.roadmapGenerating = false;
        $('#roadmap-progress-spinner').addClass('hidden');
        $('#roadmap-question-input').addClass('hidden');
        $('#roadmap-progress-footer').removeClass('hidden');
        showToast('Roadmap modified successfully', 'success');
      })
      .fail(function(xhr) {
        state.roadmapGenerating = false;
        $('#roadmap-progress-spinner').addClass('hidden');
        $('#roadmap-question-input').addClass('hidden');
        showErrorToast(xhr, 'Failed to modify roadmap');
      });
  }

  function handleRoadmapResponse($form) {
    var response = $form.find('[name="response"]').val();

    if (!response || !state.selectedProjectId) {
      return;
    }

    $form[0].reset();
    $('#roadmap-question-input').addClass('hidden');

    api.sendRoadmapResponse(state.selectedProjectId, response)
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to send response');
        $('#roadmap-question-input').removeClass('hidden');
      });
  }

  function startSelectedAgent() {
    if (!state.selectedProjectId) return;

    if (state.agentStarting) return;

    var projectId = state.selectedProjectId;
    var mode = state.agentMode;

    state.agentStarting = true;
    setQuickActionLoading(projectId, true);
    showContentLoading('Starting agent...');
    $('#btn-start-agent').prop('disabled', true);
    $('#mode-selector').addClass('disabled');

    var startPromise;

    if (mode === 'interactive') {
      startPromise = api.startInteractiveAgent(projectId, null, null, null, state.permissionMode);
    } else {
      startPromise = api.startAgent(projectId);
    }

    startPromise
      .done(function() {
        state.currentAgentMode = mode;
        updateProjectStatusById(projectId, 'running');
        startAgentStatusPolling(projectId);
        appendMessage(projectId, {
          type: 'system',
          content: mode === 'interactive' ?
            'Interactive session started. Type a message to begin.' :
            'Autonomous agent started...'
        });
        showToast('Agent started in ' + mode + ' mode', 'success');
        updateInputArea();
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to start agent');
        $('#mode-selector').removeClass('disabled');
      })
      .always(function() {
        state.agentStarting = false;
        setQuickActionLoading(projectId, false);
        // Only hide loading and re-enable button if still viewing the same project
        if (state.selectedProjectId === projectId) {
          hideContentLoading();
          $('#btn-start-agent').prop('disabled', false);
        }
      });
  }

  function stopSelectedAgent() {
    if (!state.selectedProjectId) return;

    var projectId = state.selectedProjectId;
    setQuickActionLoading(projectId, true);
    showContentLoading('Stopping agent...');
    $('#btn-stop-agent').prop('disabled', true);

    api.stopAgent(projectId)
      .done(function() {
        updateProjectStatusById(projectId, 'stopped');
        stopAgentStatusPolling();
        appendMessage(projectId, {
          type: 'system',
          content: 'Agent stopped.'
        });
        showToast('Agent stopped', 'success');
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to stop agent');
      })
      .always(function() {
        setQuickActionLoading(projectId, false);
        // Only hide loading and re-enable button if still viewing the same project
        if (state.selectedProjectId === projectId) {
          hideContentLoading();
          $('#btn-stop-agent').prop('disabled', false);
        }
      });
  }

  function cancelAgentOperation() {
    var projectId = state.selectedProjectId;

    if (!projectId) return;

    var project = findProjectById(projectId);

    if (!project || project.status !== 'running') return;

    // Cancel pending permission mode change if any
    state.pendingPermissionMode = null;
    updatePendingModeIndicator();

    $('#btn-cancel-agent').prop('disabled', true);

    api.stopAgent(projectId)
      .done(function() {
        updateProjectStatusById(projectId, 'stopped');
        stopAgentStatusPolling();
        appendMessage(projectId, {
          type: 'system',
          content: 'Operation cancelled by user.'
        });
        showToast('Operation cancelled', 'info');
        updateCancelButton();
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to cancel operation');
      })
      .always(function() {
        $('#btn-cancel-agent').prop('disabled', false);
      });
  }

  function updateCancelButton() {
    var project = findProjectById(state.selectedProjectId);
    var isRunning = project && project.status === 'running';
    var isWaiting = project && project.isWaitingForInput;

    // Show cancel button when agent is running but NOT waiting for input (i.e., actively processing)
    if (isRunning && !isWaiting) {
      $('#btn-cancel-agent').removeClass('hidden');
    } else {
      $('#btn-cancel-agent').addClass('hidden');
    }
  }

  // Agent status polling - reduced to 10 seconds as fallback (WebSocket is primary)
  function startAgentStatusPolling(projectId) {
    stopAgentStatusPolling();
    state.agentStatusInterval = setInterval(function() {
      checkAgentStatus(projectId);
    }, 10000);
  }

  function stopAgentStatusPolling() {
    if (state.agentStatusInterval) {
      clearInterval(state.agentStatusInterval);
      state.agentStatusInterval = null;
    }
  }

  function checkAgentStatus(projectId) {
    api.getAgentStatus(projectId)
      .done(function(response) {
        var project = findProjectById(projectId);
        var actualStatus = response.status || 'stopped';

        // Capture session ID if present
        if (response.sessionId) {
          state.currentSessionId = response.sessionId;
        }

        // Update isWaitingForInput from polling response (only if server version is newer)
        if (project && typeof response.isWaitingForInput === 'boolean') {
          var serverVersion = response.waitingVersion || 0;

          if (serverVersion > state.waitingVersion) {
            state.waitingVersion = serverVersion;
            var wasWaiting = project.isWaitingForInput;
            project.isWaitingForInput = response.isWaitingForInput;

            // If waiting state changed, update UI and apply pending mode changes
            if (wasWaiting !== response.isWaitingForInput) {
              // Always re-render project list to update sidebar indicator
              renderProjectList();

              if (state.selectedProjectId === projectId) {
                updateWaitingIndicator(response.isWaitingForInput);
                updateCancelButton();

                if (response.isWaitingForInput) {
                  applyPendingPermissionModeIfNeeded();
                }
              }
            }
          }
        }

        // Update queued message count
        var oldQueuedCount = state.queuedMessageCount;
        state.queuedMessageCount = response.queuedMessageCount || 0;

        if (state.queuedMessageCount !== oldQueuedCount) {
          updateQueuedMessagesDisplay();
        }

        // If agent stopped but UI shows running, update UI
        if (actualStatus !== 'running' && project && project.status === 'running') {
          updateProjectStatusById(projectId, actualStatus);
          stopAgentStatusPolling();
          state.currentAgentMode = null;
          state.queuedMessageCount = 0;
          updateQueuedMessagesDisplay();
          updateInputArea();
        }
      })
      .fail(function() {
        // On error, assume agent stopped
        stopAgentStatusPolling();
      });
  }

  function updateQueuedMessagesDisplay() {
    var $indicator = $('#queued-messages-indicator');
    var count = state.queuedMessageCount;
    var messageText = count === 1 ? 'message' : 'messages';

    if (count > 0) {
      if ($indicator.length === 0) {
        // Create indicator if it doesn't exist
        var html = '<button id="queued-messages-indicator" class="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-900/30 hover:bg-yellow-900/50 px-2 py-0.5 rounded cursor-pointer transition-colors" title="Click to view queued messages">' +
          '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
          '</svg>' +
          '<span class="queued-text">' + count + ' queued ' + messageText + '</span>' +
        '</button>';
        $('#agent-status-label').after(html);
      } else {
        $indicator.find('.queued-text').text(count + ' queued ' + messageText);
      }
    } else {
      $indicator.remove();
    }
  }

  function openQueuedMessagesModal() {
    if (!state.selectedProjectId) {
      return;
    }

    api.getQueuedMessages(state.selectedProjectId)
      .done(function(data) {
        var messages = data.messages || [];
        var $content = $('#queued-messages-modal-content');

        if (messages.length === 0) {
          $content.html('<div class="text-gray-500 text-center py-4">No queued messages</div>');
        } else {
          var html = '<div class="space-y-3">';

          for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];
            html += '<div class="bg-gray-900 rounded p-3" data-queue-index="' + i + '">' +
              '<div class="flex items-center justify-between mb-2">' +
                '<div class="flex items-center gap-2">' +
                  '<span class="text-xs font-medium text-yellow-400">#' + (i + 1) + '</span>' +
                  '<span class="text-xs text-gray-500">Waiting to be sent</span>' +
                '</div>' +
                '<button class="btn-remove-queued-message text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition-colors" title="Remove from queue">' +
                  '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' +
                  '</svg>' +
                '</button>' +
              '</div>' +
              '<div class="text-sm text-gray-200 whitespace-pre-wrap break-words">' + escapeHtml(msg) + '</div>' +
            '</div>';
          }

          html += '</div>';
          $content.html(html);
        }

        openModal('modal-queued-messages');
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to load queued messages');
      });
  }

  function removeQueuedMessage(index) {
    if (!state.selectedProjectId) {
      return;
    }

    api.removeQueuedMessage(state.selectedProjectId, index)
      .done(function() {
        showToast('Message removed from queue', 'success');
        state.queuedMessageCount = Math.max(0, state.queuedMessageCount - 1);
        updateQueuedMessagesDisplay();

        // Refresh the modal content
        openQueuedMessagesModal();
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to remove message from queue');
      });
  }

  function updateProjectStatusById(projectId, status) {
    var project = findProjectById(projectId);

    if (project) {
      project.status = status;
      renderProjectList();

      if (state.selectedProjectId === projectId) {
        updateProjectStatus(project);
      }
    }
  }

  // Load initial data
  function loadProjects() {
    api.getProjects()
      .done(function(projects) {
        state.projects = projects || [];
        renderProjectList();

        // Restore saved project selection
        var savedProjectId = loadFromLocalStorage(LOCAL_STORAGE_KEYS.SELECTED_PROJECT, null);

        if (savedProjectId && findProjectById(savedProjectId)) {
          selectProject(savedProjectId);
        }
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to load projects');
      });
  }

  // WebSocket connection with exponential backoff
  function connectWebSocket() {
    // Clear any pending reconnect timeout
    if (state.wsReconnect.timeout) {
      clearTimeout(state.wsReconnect.timeout);
      state.wsReconnect.timeout = null;
    }

    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl = protocol + '//' + window.location.host;

    try {
      state.websocket = new WebSocket(wsUrl);
    } catch (err) {
      console.error('WebSocket creation failed:', err);
      scheduleReconnect();
      return;
    }

    state.websocket.onopen = function() {
      console.log('WebSocket connected');
      state.wsReconnect.attempts = 0;
      updateConnectionStatus('connected');

      // Re-subscribe to current project if any
      if (state.selectedProjectId) {
        subscribeToProject(state.selectedProjectId);
      }
    };

    state.websocket.onmessage = function(event) {
      handleWebSocketMessage(JSON.parse(event.data));
    };

    state.websocket.onclose = function(event) {
      console.log('WebSocket disconnected (code: ' + event.code + ')');
      updateConnectionStatus('disconnected');
      scheduleReconnect();
    };

    state.websocket.onerror = function(error) {
      console.error('WebSocket error:', error);
      updateConnectionStatus('error');
    };
  }

  function scheduleReconnect() {
    if (state.wsReconnect.attempts >= state.wsReconnect.maxAttempts) {
      console.error('Max WebSocket reconnection attempts reached');
      updateConnectionStatus('failed');
      return;
    }

    state.wsReconnect.attempts++;
    var delay = calculateBackoffDelay();
    console.log('WebSocket reconnecting in ' + delay + 'ms (attempt ' + state.wsReconnect.attempts + ')');
    updateConnectionStatus('reconnecting', delay);

    state.wsReconnect.timeout = setTimeout(connectWebSocket, delay);
  }

  function calculateBackoffDelay() {
    // Exponential backoff with jitter
    var exponentialDelay = state.wsReconnect.baseDelay * Math.pow(2, state.wsReconnect.attempts - 1);
    var cappedDelay = Math.min(exponentialDelay, state.wsReconnect.maxDelay);
    // Add random jitter (0-25% of delay)
    var jitter = Math.random() * 0.25 * cappedDelay;
    return Math.floor(cappedDelay + jitter);
  }

  function updateConnectionStatus(status, nextRetryMs) {
    var $indicator = $('#ws-connection-status');
    if ($indicator.length === 0) return;

    $indicator.removeClass('ws-connected ws-disconnected ws-reconnecting ws-error ws-failed');
    $indicator.removeClass('cursor-pointer').addClass('cursor-default');

    switch (status) {
      case 'connected':
        $indicator.addClass('ws-connected').attr('title', 'Connected').html(
          '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="5"/></svg>'
        );
        break;
      case 'disconnected':
      case 'reconnecting':
        var retryText = nextRetryMs ? ' (retry in ' + Math.ceil(nextRetryMs / 1000) + 's)' : '';
        $indicator.addClass('ws-reconnecting').attr('title', 'Reconnecting' + retryText).html(
          '<svg class="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="5"/></svg>'
        );
        break;
      case 'error':
        $indicator.addClass('ws-error').attr('title', 'Connection error').html(
          '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="5"/></svg>'
        );
        break;
      case 'failed':
        $indicator.addClass('ws-failed cursor-pointer').removeClass('cursor-default')
          .attr('title', 'Connection failed - click to retry').html(
          '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/></svg>'
        );
        break;
    }
  }

  function manualReconnect() {
    state.wsReconnect.attempts = 0;
    connectWebSocket();
  }

  function handleWebSocketMessage(message) {
    switch (message.type) {
      case 'agent_message':
        handleAgentMessage(message.projectId, message.data);
        break;
      case 'agent_status':
        handleAgentStatus(message.projectId, message.data);
        break;
      case 'queue_change':
        handleQueueChange(message.data);
        break;
      case 'roadmap_message':
        handleRoadmapMessage(message.projectId, message.data);
        break;
      case 'agent_waiting':
        handleAgentWaiting(message.projectId, message.data);
        break;
      case 'session_recovery':
        handleSessionRecovery(message.projectId, message.data);
        break;
    }
  }

  function handleAgentWaiting(projectId, data) {
    var project = findProjectById(projectId);

    // data is now { isWaiting, version }
    var isWaiting = data.isWaiting;
    var serverVersion = data.version || 0;

    // Skip update if server version is not newer than our local version
    if (serverVersion <= state.waitingVersion) {
      return;
    }

    state.waitingVersion = serverVersion;

    if (project) {
      project.isWaitingForInput = isWaiting;
      renderProjectList();

      if (state.selectedProjectId === projectId) {
        updateWaitingIndicator(isWaiting);
        updateCancelButton();

        // If agent became idle and there's a pending mode change, apply it
        if (isWaiting) {
          applyPendingPermissionModeIfNeeded();
        }
      }

      // Send desktop notification if enabled and waiting
      if (isWaiting && state.settings && state.settings.enableDesktopNotifications) {
        sendWaitingNotification(project);
      }
    }
  }

  function updateWaitingIndicator(isWaiting) {
    var $statusBadge = $('#project-status');
    var $waitingBadge = $('#waiting-badge');

    if (isWaiting) {
      // Add waiting badge if it doesn't exist
      if ($waitingBadge.length === 0) {
        $statusBadge.after('<span id="waiting-badge" class="waiting-badge ml-2 flex items-center gap-1"><span class="waiting-indicator-small"></span>Waiting for user input</span>');
      }
    } else {
      $waitingBadge.remove();
    }
  }

  function sendWaitingNotification(project) {
    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'granted') {
      new Notification('Claudito - Input Required', {
        body: project.name + ' is waiting for your input',
        icon: '/favicon.ico',
        tag: 'waiting-' + project.id
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(function(permission) {
        if (permission === 'granted') {
          new Notification('Claudito - Input Required', {
            body: project.name + ' is waiting for your input',
            icon: '/favicon.ico',
            tag: 'waiting-' + project.id
          });
        }
      });
    }
  }

  function handleQueueChange(resourceStatus) {
    updateResourceStatus(resourceStatus);
  }

  function handleAgentMessage(projectId, message) {
    appendMessage(projectId, message);
  }

  function handleAgentStatus(projectId, data) {
    // Data can be a full status object or a string (for backward compatibility)
    var status = typeof data === 'object' ? data.status : data;
    var fullStatus = typeof data === 'object' ? data : null;

    updateProjectStatusById(projectId, status);
    updateAgentOutputHeader(projectId, status);

    // Update running indicator for selected project
    if (projectId === state.selectedProjectId) {
      showAgentRunningIndicator(status === 'running');
      updateStartStopButtons();
      updateCancelButton();

      // Sync permission mode from server if provided
      if (fullStatus && fullStatus.permissionMode) {
        state.permissionMode = fullStatus.permissionMode;
        updatePermissionModeButtons();
      }

      // Sync agent mode if provided
      if (fullStatus && fullStatus.mode) {
        state.currentAgentMode = fullStatus.mode;
      }

      // Sync session ID if provided
      if (fullStatus && fullStatus.sessionId) {
        state.currentSessionId = fullStatus.sessionId;
      }

      // Sync waiting state if provided (only when agent is running)
      if (fullStatus && status === 'running') {
        updateWaitingIndicator(fullStatus.isWaitingForInput);

        var project = findProjectById(projectId);

        if (project) {
          project.isWaitingForInput = fullStatus.isWaitingForInput;
          project.waitingVersion = fullStatus.waitingVersion;
        }
      }
    }

    // Reset mode selector and waiting state when agent stops
    if (status !== 'running' && projectId === state.selectedProjectId) {
      state.currentAgentMode = null;
      $('#mode-selector').removeClass('disabled');
      updateInputArea();
      updateWaitingIndicator(false);

      // Clear pending permission mode change when agent stops
      state.pendingPermissionMode = null;
      updatePendingModeIndicator();
    }

    // Clear waiting state in project when agent stops
    if (status !== 'running') {
      var project = findProjectById(projectId);

      if (project && project.isWaitingForInput) {
        project.isWaitingForInput = false;
        renderProjectList();
      }
    }
  }

  function handleSessionRecovery(projectId, data) {
    if (projectId !== state.selectedProjectId) {
      return;
    }

    // Update the current conversation ID to the new one
    state.currentConversationId = data.newConversationId;
    state.currentSessionId = data.newConversationId;

    // Clear the output screen
    $('#agent-output').empty();

    // Show a system message explaining what happened
    appendMessage(projectId, {
      type: 'system',
      content: data.reason,
      timestamp: new Date().toISOString()
    });

    // Show a toast notification
    showToast(data.reason, 'warning');

    // Reset conversation stats for the new conversation
    state.currentConversationStats = {
      messageCount: 0,
      toolCallCount: 0,
      userMessageCount: 0,
      durationMs: 0,
      startedAt: new Date().toISOString()
    };
    state.currentConversationMetadata = null;
    updateConversationStats();

    // Reload conversation history dropdown
    loadConversationHistory(projectId);
  }

  function updateAgentOutputHeader(projectId, status) {
    // No longer needed - removed duplicate "Agent Output (live)" header
    // The agent status is already shown in the toolbar
  }

  function handleRoadmapMessage(projectId, message) {
    if (projectId !== state.selectedProjectId || !state.roadmapGenerating) {
      return;
    }

    appendRoadmapOutput(message);

    // Handle question - show response input
    if (message.type === 'question') {
      $('#roadmap-question-input').removeClass('hidden');
      $('#input-roadmap-response').focus();
    }

    if (message.type === 'system' && message.content.includes('complete')) {
      state.roadmapGenerating = false;
      $('#roadmap-progress-spinner').addClass('hidden');
      $('#roadmap-question-input').addClass('hidden');
      $('#roadmap-progress-footer').removeClass('hidden');
    }

    if (message.type === 'system' && message.content.includes('failed')) {
      state.roadmapGenerating = false;
      $('#roadmap-progress-spinner').addClass('hidden');
      $('#roadmap-question-input').addClass('hidden');
      showToast('Roadmap generation failed', 'error');
    }
  }

  function appendRoadmapOutput(message) {
    var $output = $('#roadmap-progress-output');
    var typeClass = message.type === 'stderr' ? 'text-red-400' :
                    message.type === 'system' ? 'text-blue-400' :
                    message.type === 'question' ? 'text-yellow-400 font-semibold' : 'text-gray-300';
    $output.append('<div class="' + typeClass + '">' + escapeHtml(message.content) + '</div>');
    $output.parent().scrollTop($output.parent()[0].scrollHeight);
  }

  function showRoadmapProgress() {
    state.roadmapGenerating = true;
    $('#roadmap-progress-output').empty();
    $('#roadmap-progress-spinner').removeClass('hidden');
    $('#roadmap-progress-footer').addClass('hidden');
    $('#roadmap-question-input').addClass('hidden');
    $('#input-roadmap-response').val('');
    openModal('modal-roadmap-progress');
  }

  function subscribeToProject(projectId) {
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
      state.websocket.send(JSON.stringify({
        type: 'subscribe',
        projectId: projectId
      }));
    }
  }

  function unsubscribeFromProject(projectId) {
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
      state.websocket.send(JSON.stringify({
        type: 'unsubscribe',
        projectId: projectId
      }));
    }
  }

  // Tab switching functions
  function switchTab(tabName) {
    state.activeTab = tabName;

    // Save to localStorage
    saveToLocalStorage(LOCAL_STORAGE_KEYS.ACTIVE_TAB, tabName);

    // Update tab button states
    $('.tab-button').removeClass('active').addClass('text-gray-400 border-transparent').removeClass('text-white border-purple-500');
    $('#tab-' + tabName).addClass('active text-white border-purple-500').removeClass('text-gray-400 border-transparent');

    // Show/hide tab content
    $('.tab-content').addClass('hidden');
    $('#tab-content-' + tabName).removeClass('hidden');

    // Show/hide input area based on tab
    if (tabName === 'project-files' || tabName === 'git') {
      $('#interactive-input-area').addClass('hidden');
    } else {
      $('#interactive-input-area').removeClass('hidden');
    }

    // If switching to project files, load the file tree
    if (tabName === 'project-files' && state.selectedProjectId) {
      var project = findProjectById(state.selectedProjectId);

      if (project && project.path) {
        loadFileTree(project.path);
      }
    }

    // If switching to git tab, load git status
    if (tabName === 'git' && state.selectedProjectId) {
      loadGitStatus();
    }
  }

  function setupTabHandlers() {
    $('#tab-agent-output').on('click', function() {
      switchTab('agent-output');
    });

    $('#tab-project-files').on('click', function() {
      // Reset mobile file editor view when switching to files tab
      hideMobileFileEditor();
      switchTab('project-files');
    });

    $('#tab-git').on('click', function() {
      switchTab('git');
    });
  }

  // File browser functions
  function loadFileTree(rootPath) {
    var $tree = $('#file-browser-tree');
    $tree.html('<div class="text-gray-500 text-center py-4">Loading...</div>');

    api.browseWithFiles(rootPath)
      .done(function(entries) {
        state.fileBrowser.rootEntries = entries;
        renderFileTree(rootPath, entries);
      })
      .fail(function() {
        $tree.html('<div class="text-red-400 text-center py-4">Failed to load files</div>');
      });
  }

  function renderFileTree(basePath, entries) {
    var $tree = $('#file-browser-tree');
    $tree.empty();

    if (entries.length === 0) {
      $tree.html('<div class="text-gray-500 text-center py-4">No files in this directory</div>');
      return;
    }

    entries.forEach(function(entry) {
      $tree.append(renderFileTreeItem(entry, 0));
    });
  }

  function renderFileTreeItem(entry, depth) {
    var indent = depth * 16;
    var isExpanded = state.fileBrowser.expandedDirs[entry.path];
    var isSelected = state.fileBrowser.selectedFile === entry.path;
    var deleteBtn = '<button class="btn-delete-file" data-path="' + escapeHtml(entry.path) + '" data-is-dir="' + (entry.isDirectory ? 'true' : 'false') + '" data-name="' + escapeHtml(entry.name) + '" title="Delete">' +
      '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' +
      '</svg>' +
    '</button>';

    if (entry.isDirectory) {
      var chevronClass = isExpanded ? 'tree-chevron expanded' : 'tree-chevron';
      var html = '<div class="file-tree-item directory' + (isSelected ? ' selected' : '') + '" data-path="' + escapeHtml(entry.path) + '" data-is-dir="true" style="padding-left: ' + indent + 'px;">' +
        '<svg class="' + chevronClass + '" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>' +
        '</svg>' +
        '<svg class="tree-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>' +
        '</svg>' +
        '<span class="tree-name">' + escapeHtml(entry.name) + '</span>' +
        deleteBtn +
      '</div>';

      if (isExpanded && entry.children) {
        html += '<div class="tree-children">';
        entry.children.forEach(function(child) {
          html += renderFileTreeItem(child, depth + 1);
        });
        html += '</div>';
      }

      return html;
    } else {
      var editableClass = entry.isEditable ? ' editable' : '';
      return '<div class="file-tree-item file' + editableClass + (isSelected ? ' selected' : '') + '" data-path="' + escapeHtml(entry.path) + '" data-is-dir="false" data-editable="' + (entry.isEditable ? 'true' : 'false') + '" style="padding-left: ' + (indent + 20) + 'px;">' +
        '<svg class="tree-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>' +
        '</svg>' +
        '<span class="tree-name">' + escapeHtml(entry.name) + '</span>' +
        deleteBtn +
      '</div>';
    }
  }

  function toggleDirectory(dirPath) {
    if (state.fileBrowser.expandedDirs[dirPath]) {
      // Collapse
      delete state.fileBrowser.expandedDirs[dirPath];
      var $item = $('.file-tree-item[data-path="' + CSS.escape(dirPath) + '"]');
      $item.find('.tree-chevron').first().removeClass('expanded');
      $item.next('.tree-children').remove();
    } else {
      // Expand - load children
      state.fileBrowser.expandedDirs[dirPath] = true;
      var $item = $('.file-tree-item[data-path="' + CSS.escape(dirPath) + '"]');
      $item.find('.tree-chevron').first().addClass('expanded');

      // Load children
      api.browseWithFiles(dirPath)
        .done(function(children) {
          var childrenHtml = '<div class="tree-children">';
          children.forEach(function(child) {
            var depth = (parseInt($item.css('padding-left')) / 16) + 1;
            childrenHtml += renderFileTreeItem(child, depth);
          });
          childrenHtml += '</div>';
          $item.after(childrenHtml);
        });
    }
  }

  function openFile(filePath, fileName) {
    // Check if file is already open
    var existingFile = state.openFiles.find(function(f) { return f.path === filePath; });

    if (existingFile) {
      setActiveFile(filePath);
      return;
    }

    // Load file content
    api.readFile(filePath)
      .done(function(data) {
        state.openFiles.push({
          path: filePath,
          name: fileName,
          content: data.content,
          originalContent: data.content,
          modified: false
        });
        renderOpenFileTabs();
        setActiveFile(filePath);
      })
      .fail(function() {
        showToast('Failed to open file', 'error');
      });
  }

  function setActiveFile(filePath) {
    state.activeFilePath = filePath;
    state.fileBrowser.selectedFile = filePath;

    // Update tree selection
    $('.file-tree-item').removeClass('selected');
    $('.file-tree-item[data-path="' + CSS.escape(filePath) + '"]').addClass('selected');

    // Update tab selection
    renderOpenFileTabs();

    // Show file content
    var file = state.openFiles.find(function(f) { return f.path === filePath; });

    if (file) {
      $('#file-editor-empty').addClass('hidden');
      $('#file-editor-wrapper').removeClass('hidden');
      $('#file-editor-path').text(filePath);
      $('#file-editor-textarea').val(file.content);
      updateFileModifiedState(file);
      updateEditorSyntaxHighlighting(filePath, file.content);

      // Show editor in mobile view
      showMobileFileEditor();
    }
  }

  function updateEditorSyntaxHighlighting(filePath, content) {
    var language = getLanguageFromPath(filePath);
    var $container = $('#code-editor-container');
    var $highlight = $('#code-editor-highlight');

    if (language && typeof hljs !== 'undefined') {
      $container.addClass('highlighting');
      var highlighted = highlightCode(content, language);
      // Add trailing newline to ensure proper alignment with textarea
      $highlight.html(highlighted + '\n');
      syncEditorScroll();
    } else {
      $container.removeClass('highlighting');
      $highlight.empty();
    }
  }

  function syncEditorScroll() {
    var $textarea = $('#file-editor-textarea');
    var $backdrop = $('#code-editor-backdrop');
    $backdrop.scrollTop($textarea.scrollTop());
    $backdrop.scrollLeft($textarea.scrollLeft());
  }

  function updateFileModifiedState(file) {
    if (file.modified) {
      $('#file-editor-modified').removeClass('hidden');
      $('#btn-save-file').removeClass('hidden');
    } else {
      $('#file-editor-modified').addClass('hidden');
      $('#btn-save-file').addClass('hidden');
    }
    renderOpenFileTabs();
  }

  function renderOpenFileTabs() {
    var $tabs = $('#open-file-tabs');
    $tabs.empty();

    state.openFiles.forEach(function(file) {
      var activeClass = file.path === state.activeFilePath ? ' active' : '';
      var modifiedIndicator = file.modified ? '<span class="tab-modified"></span>' : '';

      var html = '<div class="file-tab' + activeClass + '" data-path="' + escapeHtml(file.path) + '">' +
        modifiedIndicator +
        '<span class="tab-name">' + escapeHtml(file.name) + '</span>' +
        '<button class="tab-close" data-path="' + escapeHtml(file.path) + '" title="Close">' +
          '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>' +
          '</svg>' +
        '</button>' +
      '</div>';

      $tabs.append(html);
    });
  }

  function closeFile(filePath) {
    var fileIndex = state.openFiles.findIndex(function(f) { return f.path === filePath; });

    if (fileIndex === -1) return;

    var file = state.openFiles[fileIndex];

    function doClose() {
      // Remove from open files
      state.openFiles.splice(fileIndex, 1);

      // If this was the active file, switch to another or show empty state
      if (state.activeFilePath === filePath) {
        if (state.openFiles.length > 0) {
          var newIndex = Math.min(fileIndex, state.openFiles.length - 1);
          setActiveFile(state.openFiles[newIndex].path);
        } else {
          state.activeFilePath = null;
          state.fileBrowser.selectedFile = null;
          $('#file-editor-empty').removeClass('hidden');
          $('#file-editor-wrapper').addClass('hidden');
          $('.file-tree-item').removeClass('selected');
        }
      }

      renderOpenFileTabs();
    }

    // Warn if modified
    if (file.modified) {
      showConfirm('Unsaved Changes', 'This file has unsaved changes. Close anyway?', { danger: true, confirmText: 'Close' })
        .then(function(confirmed) {
          if (confirmed) {
            doClose();
          }
        });
    } else {
      doClose();
    }
  }

  function showDeleteFileConfirmation(filePath, isDirectory, fileName) {
    state.pendingDeleteFile = {
      path: filePath,
      isDirectory: isDirectory,
      name: fileName
    };

    $('#delete-file-type').text(isDirectory ? 'folder' : 'file');
    $('#delete-file-name').text(fileName);
    $('#delete-folder-warning').toggleClass('hidden', !isDirectory);

    openModal('modal-confirm-delete-file');
  }

  function confirmDeleteFile() {
    if (!state.pendingDeleteFile) return;

    var pending = state.pendingDeleteFile;

    api.deleteFileOrFolder(pending.path, pending.isDirectory)
      .done(function() {
        closeModal('modal-confirm-delete-file');

        // If this file was open, close it
        if (!pending.isDirectory) {
          closeFileWithoutConfirm(pending.path);
        } else {
          // If it's a directory, close any files that were inside it
          state.openFiles.forEach(function(f) {
            if (f.path.startsWith(pending.path)) {
              closeFileWithoutConfirm(f.path);
            }
          });
        }

        // Remove from tree and refresh parent
        var $item = $('.file-tree-item[data-path="' + CSS.escape(pending.path) + '"]');
        var $parent = $item.parent();

        if (pending.isDirectory) {
          $item.next('.tree-children').remove();
        }

        $item.remove();

        // Clean up expanded dirs state
        delete state.fileBrowser.expandedDirs[pending.path];

        showToast((pending.isDirectory ? 'Folder' : 'File') + ' deleted', 'success');
        state.pendingDeleteFile = null;
      })
      .fail(function() {
        showToast('Failed to delete ' + (pending.isDirectory ? 'folder' : 'file'), 'error');
      });
  }

  function validateFileName(name) {
    if (!name || name.trim() === '') {
      return { valid: false, error: 'File name cannot be empty' };
    }

    var trimmed = name.trim();

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

    // Check for leading/trailing dots or spaces
    if (trimmed === '.') {
      return { valid: false, error: 'File name cannot be just a dot' };
    }

    if (trimmed.endsWith(' ') || trimmed.endsWith('.')) {
      return { valid: false, error: 'File name cannot end with a space or dot' };
    }

    return { valid: true, error: null };
  }

  function showCreateFileModal(parentPath) {
    state.pendingCreateFile = { parentPath: parentPath };

    $('#create-file-name').val('');
    $('#create-file-error').addClass('hidden').text('');
    $('#create-file-parent-path').text(parentPath);

    openModal('modal-create-file');

    // Focus the input after modal opens
    setTimeout(function() {
      $('#create-file-name').focus();
    }, 100);
  }

  function confirmCreateFile() {
    if (!state.pendingCreateFile) return;

    var fileName = $('#create-file-name').val();
    var validation = validateFileName(fileName);

    if (!validation.valid) {
      $('#create-file-error').removeClass('hidden').text(validation.error);
      return;
    }

    var parentPath = state.pendingCreateFile.parentPath;
    var separator = parentPath.indexOf('\\') !== -1 ? '\\' : '/';
    var filePath = parentPath + (parentPath.endsWith(separator) ? '' : separator) + fileName.trim();

    api.writeFile(filePath, '')
      .done(function() {
        closeModal('modal-create-file');
        state.pendingCreateFile = null;

        // Refresh the parent directory to show the new file
        refreshDirectoryContents(parentPath);

        // Open the newly created file
        openFile(filePath, fileName.trim());

        showToast('File created', 'success');
      })
      .fail(function() {
        $('#create-file-error').removeClass('hidden').text('Failed to create file');
      });
  }

  function validateFolderName(name) {
    if (!name || name.trim() === '') {
      return { valid: false, error: 'Folder name cannot be empty' };
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

    // Check for leading/trailing dots or spaces
    if (trimmed === '.' || trimmed === '..') {
      return { valid: false, error: 'Folder name cannot be just dots' };
    }

    if (trimmed.endsWith(' ')) {
      return { valid: false, error: 'Folder name cannot end with a space' };
    }

    return { valid: true, error: null };
  }

  function showCreateFolderModal(parentPath) {
    state.pendingCreateFolder = { parentPath: parentPath };

    $('#create-folder-name').val('');
    $('#create-folder-error').addClass('hidden').text('');
    $('#create-folder-parent-path').text(parentPath);

    openModal('modal-create-folder');

    // Focus the input after modal opens
    setTimeout(function() {
      $('#create-folder-name').focus();
    }, 100);
  }

  function confirmCreateFolder() {
    if (!state.pendingCreateFolder) return;

    var folderName = $('#create-folder-name').val();
    var validation = validateFolderName(folderName);

    if (!validation.valid) {
      $('#create-folder-error').removeClass('hidden').text(validation.error);
      return;
    }

    var parentPath = state.pendingCreateFolder.parentPath;
    var separator = parentPath.indexOf('\\') !== -1 ? '\\' : '/';
    var folderPath = parentPath + (parentPath.endsWith(separator) ? '' : separator) + folderName.trim();

    api.createFolder(folderPath)
      .done(function() {
        closeModal('modal-create-folder');
        state.pendingCreateFolder = null;

        // Refresh the parent directory to show the new folder
        refreshDirectoryContents(parentPath);

        showToast('Folder created', 'success');
      })
      .fail(function(xhr) {
        var error = 'Failed to create folder';

        if (xhr.responseJSON && xhr.responseJSON.error) {
          error = xhr.responseJSON.error;
        }

        $('#create-folder-error').removeClass('hidden').text(error);
      });
  }

  function refreshDirectoryContents(dirPath) {
    var $item = $('.file-tree-item[data-path="' + CSS.escape(dirPath) + '"]');

    if ($item.length === 0) {
      // It's the root directory, reload entire tree
      var project = findProjectById(state.selectedProjectId);
      if (project && project.path) {
        loadFileTree(project.path);
      }
      return;
    }

    var $children = $item.next('.tree-children');

    // If directory is not expanded, expand it first
    if (!state.fileBrowser.expandedDirs[dirPath]) {
      toggleDirectory(dirPath);
      return;
    }

    // Refresh the directory contents
    api.browseWithFiles(dirPath)
      .done(function(children) {
        if ($children.length) {
          $children.remove();
        }

        var depth = Math.floor(parseInt($item.css('padding-left')) / 16) + 1;
        var childrenHtml = '<div class="tree-children">';
        children.forEach(function(child) {
          childrenHtml += renderFileTreeItem(child, depth);
        });
        childrenHtml += '</div>';
        $item.after(childrenHtml);
      });
  }

  function closeFileWithoutConfirm(filePath) {
    var fileIndex = state.openFiles.findIndex(function(f) { return f.path === filePath; });

    if (fileIndex === -1) return;

    state.openFiles.splice(fileIndex, 1);

    if (state.activeFilePath === filePath) {
      if (state.openFiles.length > 0) {
        var newIndex = Math.min(fileIndex, state.openFiles.length - 1);
        setActiveFile(state.openFiles[newIndex].path);
      } else {
        state.activeFilePath = null;
        state.fileBrowser.selectedFile = null;
        $('#file-editor-empty').removeClass('hidden');
        $('#file-editor-wrapper').addClass('hidden');
        $('.file-tree-item').removeClass('selected');
      }
    }

    renderOpenFileTabs();
  }

  function saveCurrentFile() {
    if (!state.activeFilePath) return;

    var file = state.openFiles.find(function(f) { return f.path === state.activeFilePath; });

    if (!file) return;

    var content = $('#file-editor-textarea').val();

    api.writeFile(file.path, content)
      .done(function() {
        file.content = content;
        file.originalContent = content;
        file.modified = false;
        updateFileModifiedState(file);
        showToast('File saved', 'success');
      })
      .fail(function() {
        showToast('Failed to save file', 'error');
      });
  }

  function setupFileBrowserHandlers() {
    // Click on file tree item (but not on delete button)
    $(document).on('click', '.file-tree-item', function(e) {
      if ($(e.target).closest('.btn-delete-file').length) {
        return; // Handled by delete button handler
      }

      var $item = $(this);
      var path = $item.data('path');
      var isDir = $item.data('is-dir');
      var isEditable = $item.data('editable') === true || $item.data('editable') === 'true';

      if (isDir) {
        toggleDirectory(path);
      } else if (isEditable) {
        var name = $item.find('.tree-name').text();
        openFile(path, name);
      } else {
        showToast('This file type cannot be edited', 'info');
      }
    });

    // Click on delete file/folder button
    $(document).on('click', '.btn-delete-file', function(e) {
      e.stopPropagation();
      var path = $(this).data('path');
      var isDir = $(this).data('is-dir') === true || $(this).data('is-dir') === 'true';
      var name = $(this).data('name');
      showDeleteFileConfirmation(path, isDir, name);
    });

    // Right-click context menu on file tree items
    $(document).on('contextmenu', '.file-tree-item', function(e) {
      e.preventDefault();
      var $item = $(this);
      var path = $item.data('path');
      var isDir = $item.data('is-dir') === true || $item.data('is-dir') === 'true';
      var name = $item.find('.tree-name').text();

      // Store context for delete action
      state.contextMenuTarget = { path: path, isDir: isDir, name: name };

      // Show/hide New File and New Folder options based on whether it's a directory
      if (isDir) {
        $('#context-menu-new-file').removeClass('hidden');
        $('#context-menu-new-folder').removeClass('hidden');
      } else {
        $('#context-menu-new-file').addClass('hidden');
        $('#context-menu-new-folder').addClass('hidden');
      }

      // Position and show context menu
      var $menu = $('#file-context-menu');
      $menu.css({
        top: e.pageY + 'px',
        left: e.pageX + 'px'
      }).removeClass('hidden');

      // Close menu when clicking elsewhere
      $(document).one('click', function() {
        $menu.addClass('hidden');
      });
    });

    // Context menu delete action
    $('#context-menu-delete').on('click', function(e) {
      e.stopPropagation();
      $('#file-context-menu').addClass('hidden');

      if (state.contextMenuTarget) {
        showDeleteFileConfirmation(
          state.contextMenuTarget.path,
          state.contextMenuTarget.isDir,
          state.contextMenuTarget.name
        );
      }
    });

    // Confirm delete file/folder
    $('#btn-confirm-delete-file').on('click', function() {
      confirmDeleteFile();
    });

    // New file button in toolbar
    $('#btn-new-file').on('click', function() {
      var project = findProjectById(state.selectedProjectId);
      if (project && project.path) {
        showCreateFileModal(project.path);
      }
    });

    // Context menu - New File option
    $('#context-menu-new-file').on('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      $('#file-context-menu').addClass('hidden');

      if (state.contextMenuTarget && state.contextMenuTarget.isDir) {
        showCreateFileModal(state.contextMenuTarget.path);
      }
    });

    // Confirm create file button
    $('#btn-confirm-create-file').on('click', function() {
      confirmCreateFile();
    });

    // Enter key in create file input
    $('#create-file-name').on('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmCreateFile();
      }
    });

    // New folder button in toolbar
    $('#btn-new-folder').on('click', function() {
      var project = findProjectById(state.selectedProjectId);

      if (project && project.path) {
        showCreateFolderModal(project.path);
      }
    });

    // Context menu - New Folder option
    $('#context-menu-new-folder').on('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      $('#file-context-menu').addClass('hidden');

      if (state.contextMenuTarget && state.contextMenuTarget.isDir) {
        showCreateFolderModal(state.contextMenuTarget.path);
      }
    });

    // Confirm create folder button
    $('#btn-confirm-create-folder').on('click', function() {
      confirmCreateFolder();
    });

    // Enter key in create folder input
    $('#create-folder-name').on('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmCreateFolder();
      }
    });

    // Click on file tab
    $(document).on('click', '.file-tab', function(e) {
      if ($(e.target).closest('.tab-close').length) return;
      var path = $(this).data('path');
      setActiveFile(path);
    });

    // Click on tab close button
    $(document).on('click', '.tab-close', function(e) {
      e.stopPropagation();
      var path = $(this).data('path');
      closeFile(path);
    });

    // Middle-click on file tab to close it
    $(document).on('mousedown', '.file-tab', function(e) {
      if (e.button === 1) {
        e.preventDefault();
        var path = $(this).data('path');
        closeFile(path);
      }
    });

    // File editor content change
    $('#file-editor-textarea').on('input', function() {
      if (!state.activeFilePath) return;

      var file = state.openFiles.find(function(f) { return f.path === state.activeFilePath; });

      if (!file) return;

      var currentContent = $(this).val();
      file.content = currentContent;
      file.modified = currentContent !== file.originalContent;
      updateFileModifiedState(file);
      updateEditorSyntaxHighlighting(state.activeFilePath, currentContent);
    });

    // Sync scroll between textarea and highlighted backdrop
    $('#file-editor-textarea').on('scroll', function() {
      syncEditorScroll();
    });

    // Save file button
    $('#btn-save-file').on('click', function() {
      saveCurrentFile();
    });

    // Ctrl+S to save
    $('#file-editor-textarea').on('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentFile();
      }
    });

    // Refresh files button
    $('#btn-refresh-files').on('click', function() {
      var project = findProjectById(state.selectedProjectId);

      if (project && project.path) {
        state.fileBrowser.expandedDirs = {};
        loadFileTree(project.path);
      }
    });

    // Mobile file editor back button
    $('#btn-file-editor-back').on('click', function() {
      hideMobileFileEditor();
    });

    // Mobile Claude files back button
    $('#btn-claude-files-back').on('click', function() {
      hideMobileClaudeFileEditor();
    });
  }

  function isMobileView() {
    return window.innerWidth <= 768;
  }

  function showMobileFileEditor() {
    if (!isMobileView()) return;

    $('#file-browser-sidebar').addClass('mobile-hidden');
    $('#file-editor-area').addClass('mobile-visible');
    $('#file-editor-mobile-header').removeClass('hidden');
  }

  function hideMobileFileEditor() {
    $('#file-browser-sidebar').removeClass('mobile-hidden');
    $('#file-editor-area').removeClass('mobile-visible');
    $('#file-editor-mobile-header').addClass('hidden');
  }

  function showMobileClaudeFileEditor() {
    if (!isMobileView()) return;

    $('#claude-files-list').addClass('mobile-hidden');
    $('#claude-file-editor-area').addClass('mobile-visible');
    $('#btn-claude-files-back').removeClass('hidden');
  }

  function hideMobileClaudeFileEditor() {
    $('#claude-files-list').removeClass('mobile-hidden');
    $('#claude-file-editor-area').removeClass('mobile-visible');
    $('#btn-claude-files-back').addClass('hidden');
  }

  function showMobileGitDiff() {
    if (!isMobileView()) return;
    $('#git-diff-area').addClass('mobile-visible');
  }

  function hideMobileGitDiff() {
    $('#git-diff-area').removeClass('mobile-visible');
  }

  // ============================================================
  // Git functions
  // ============================================================

  function loadGitStatus() {
    if (!state.selectedProjectId) return;

    api.getGitStatus(state.selectedProjectId)
      .done(function(status) {
        renderGitStatus(status);
      })
      .fail(function() {
        showToast('Failed to load git status', 'error');
      });

    api.getGitBranches(state.selectedProjectId)
      .done(function(branches) {
        renderGitBranches(branches);
      });

    loadGitTags();
  }

  function loadGitTags() {
    if (!state.selectedProjectId) return;

    api.getGitTags(state.selectedProjectId)
      .done(function(result) {
        renderGitTags(result.tags || []);
      })
      .fail(function() {
        // Silently fail - tags are not critical
        renderGitTags([]);
      });
  }

  function renderGitTags(tags) {
    var $container = $('#git-tags-list');

    if (!tags || tags.length === 0) {
      $container.html('<div class="text-gray-500 text-center py-2">No tags</div>');
      return;
    }

    var html = '';

    tags.forEach(function(tag) {
      html += '<div class="flex items-center justify-between py-1 px-1 hover:bg-gray-700 rounded">' +
        '<span class="text-gray-300 truncate" title="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</span>' +
        '<button class="git-push-tag-btn text-xs text-blue-400 hover:text-blue-300 px-1" data-tag="' + escapeHtml(tag) + '" title="Push tag">&#8593;</button>' +
        '</div>';
    });

    $container.html(html);
  }

  function renderGitStatus(status) {
    // Show/hide based on whether it's a git repo
    if (!status.isRepo) {
      $('#git-not-repo').removeClass('hidden').addClass('flex');
      $('#git-content').addClass('hidden');
      return;
    }

    $('#git-not-repo').addClass('hidden').removeClass('flex');
    $('#git-content').removeClass('hidden');

    // Update counts
    $('#git-staged-count').text('(' + status.staged.length + ')');
    $('#git-unstaged-count').text('(' + (status.unstaged.length + status.untracked.length) + ')');

    // Build and render staged files tree
    var stagedTree = buildGitFileTree(status.staged);
    renderGitFileTree('#git-staged-tree', stagedTree, 'staged');

    // Build and render unstaged + untracked files tree
    var unstaged = status.unstaged.concat(status.untracked);
    var unstagedTree = buildGitFileTree(unstaged);
    renderGitFileTree('#git-unstaged-tree', unstagedTree, 'unstaged');
  }

  // Convert flat file list to tree structure
  function buildGitFileTree(files) {
    var root = { children: {} };

    files.forEach(function(file) {
      // Normalize path separators
      var normalizedPath = file.path.replace(/\\/g, '/');
      var parts = normalizedPath.split('/');
      var current = root;

      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        var isFile = (i === parts.length - 1);

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            isDirectory: !isFile,
            children: isFile ? null : {},
            status: isFile ? file.status : null
          };
        }

        current = current.children[part];
      }
    });

    return root;
  }

  // Render git file tree
  function renderGitFileTree(selector, tree, type) {
    var $container = $(selector);
    $container.empty();

    var children = Object.values(tree.children);

    if (children.length === 0) {
      $container.html('<div class="text-gray-500 text-center py-2">No files</div>');
      return;
    }

    // Sort: directories first, then alphabetically
    children.sort(function(a, b) {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    children.forEach(function(entry) {
      $container.append(renderGitTreeItem(entry, 0, type));
    });
  }

  // Render a single git tree item (recursive)
  function renderGitTreeItem(entry, depth, type) {
    var indent = depth * 16;
    var isExpanded = state.git.expandedDirs[type + ':' + entry.path];
    var isSelected = state.git.selectedFile === entry.path;

    if (entry.isDirectory) {
      var chevronClass = isExpanded ? 'tree-chevron expanded' : 'tree-chevron';
      var dirActionBtn = type === 'staged'
        ? '<button class="git-action-btn git-unstage-dir-btn" data-path="' + escapeHtml(entry.path) + '" title="Unstage folder">−</button>'
        : '<button class="git-action-btn git-stage-dir-btn" data-path="' + escapeHtml(entry.path) + '" title="Stage folder">+</button>';
      var html = '<div class="git-tree-item directory' + (isSelected ? ' selected' : '') + '" ' +
                 'data-path="' + escapeHtml(entry.path) + '" data-type="' + type + '" ' +
                 'style="padding-left: ' + indent + 'px;">' +
        '<svg class="' + chevronClass + '" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>' +
        '</svg>' +
        '<svg class="tree-icon text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>' +
        '</svg>' +
        '<span class="tree-name flex-1">' + escapeHtml(entry.name) + '</span>' +
        dirActionBtn +
      '</div>';

      if (isExpanded && entry.children) {
        var childEntries = Object.values(entry.children);
        childEntries.sort(function(a, b) {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

        html += '<div class="tree-children">';
        childEntries.forEach(function(child) {
          html += renderGitTreeItem(child, depth + 1, type);
        });
        html += '</div>';
      }

      return html;
    } else {
      // File with status icon and action button
      var statusIcon = getGitStatusIcon(entry.status);
      var actionBtn = type === 'staged'
        ? '<button class="git-action-btn git-unstage-btn" data-path="' + escapeHtml(entry.path) + '" title="Unstage">−</button>'
        : '<button class="git-action-btn git-stage-btn" data-path="' + escapeHtml(entry.path) + '" title="Stage">+</button>';

      return '<div class="git-tree-item file' + (isSelected ? ' selected' : '') + '" ' +
             'data-path="' + escapeHtml(entry.path) + '" data-type="' + type + '" ' +
             'data-status="' + (entry.status || '') + '" ' +
             'style="padding-left: ' + (indent + 20) + 'px;">' +
        statusIcon +
        '<span class="tree-name flex-1 truncate">' + escapeHtml(entry.name) + '</span>' +
        actionBtn +
      '</div>';
    }
  }

  // Toggle git directory expand/collapse
  function toggleGitDirectory(dirPath, type) {
    var key = type + ':' + dirPath;

    if (state.git.expandedDirs[key]) {
      // Collapse
      delete state.git.expandedDirs[key];
      var $item = $('.git-tree-item.directory[data-path="' + CSS.escape(dirPath) + '"][data-type="' + type + '"]');
      $item.find('.tree-chevron').first().removeClass('expanded');
      $item.next('.tree-children').remove();
    } else {
      // Expand
      state.git.expandedDirs[key] = true;

      // We need to reload the tree to show children
      loadGitStatus();
    }
  }

  function getGitStatusIcon(status) {
    var colors = {
      added: 'text-green-400',
      modified: 'text-yellow-400',
      deleted: 'text-red-400',
      renamed: 'text-blue-400',
      copied: 'text-blue-400',
      untracked: 'text-gray-400'
    };
    var icons = {
      added: 'A',
      modified: 'M',
      deleted: 'D',
      renamed: 'R',
      copied: 'C',
      untracked: '?'
    };
    var color = colors[status] || 'text-gray-400';
    var icon = icons[status] || '?';
    return '<span class="git-status-icon ' + color + '">' + icon + '</span>';
  }

  function renderGitBranches(branches) {
    var $select = $('#git-branch-select');
    $select.empty();

    if (!branches.current && branches.local.length === 0) {
      $select.append('<option value="">No branches</option>');
      return;
    }

    // Add local branches
    branches.local.forEach(function(branch) {
      var selected = branch === branches.current ? ' selected' : '';
      $select.append('<option value="' + escapeHtml(branch) + '"' + selected + '>' + escapeHtml(branch) + '</option>');
    });

    // Add remote branches (with separator)
    if (branches.remote.length > 0) {
      $select.append('<option disabled>─────────────</option>');
      branches.remote.forEach(function(branch) {
        $select.append('<option value="' + escapeHtml(branch) + '">' + escapeHtml(branch) + '</option>');
      });
    }

    // Also render branches list
    renderGitBranchesList(branches);
  }

  function renderGitBranchesList(branches) {
    var $list = $('#git-branches-list');

    if (!branches || (!branches.current && branches.local.length === 0)) {
      $list.html('<div class="text-gray-500 text-center py-1">No branches</div>');
      return;
    }

    var html = '';

    // Render local branches
    branches.local.forEach(function(branch) {
      var isCurrent = branch === branches.current;
      var baseClasses = 'px-2 py-1 rounded cursor-pointer hover:bg-gray-600 flex items-center gap-2 git-branch-item';
      var extraClasses = isCurrent ? ' bg-gray-600 text-green-400' : ' text-gray-300';

      html += '<div class="' + baseClasses + extraClasses + '" data-branch="' + escapeHtml(branch) + '">';

      if (isCurrent) {
        html += '<span class="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"></span>';
      } else {
        html += '<span class="w-1.5 flex-shrink-0"></span>';
      }

      html += '<span class="truncate" title="' + escapeHtml(branch) + '">' + escapeHtml(branch) + '</span>';
      html += '</div>';
    });

    // Add remote branches if any (collapsed by default)
    if (branches.remote.length > 0) {
      html += '<div class="mt-1 pt-1 border-t border-gray-600">';
      html += '<div class="text-gray-500 text-[10px] uppercase px-2 py-0.5">Remote</div>';

      branches.remote.forEach(function(branch) {
        html += '<div class="px-2 py-1 rounded cursor-pointer hover:bg-gray-600 flex items-center gap-2 text-gray-400 git-branch-item" data-branch="' + escapeHtml(branch) + '">';
        html += '<span class="w-1.5 flex-shrink-0"></span>';
        html += '<span class="truncate text-[11px]" title="' + escapeHtml(branch) + '">' + escapeHtml(branch) + '</span>';
        html += '</div>';
      });

      html += '</div>';
    }

    $list.html(html);
  }

  function setupGitHandlers() {
    // Refresh button
    $('#btn-git-refresh').on('click', function() {
      loadGitStatus();
    });

    // Branch select change
    $('#git-branch-select').on('change', function() {
      var branch = $(this).val();

      if (branch && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitCheckout(state.selectedProjectId, branch)
          .done(function() {
            showToast('Switched to branch: ' + branch, 'success');
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to checkout branch: ' + getErrorMessage(xhr), 'error');
            loadGitStatus(); // Reload to reset selection
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    // Branch list item click
    $(document).on('click', '.git-branch-item', function() {
      var branch = $(this).data('branch');

      if (branch && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitCheckout(state.selectedProjectId, branch)
          .done(function() {
            showToast('Switched to branch: ' + branch, 'success');
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to checkout branch: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    // New branch button
    $('#btn-git-new-branch').on('click', function() {
      showPrompt('New Branch', 'Branch name:', { placeholder: 'feature/my-branch', submitText: 'Create' })
        .then(function(name) {
          if (name && state.selectedProjectId) {
            setGitOperationState(true);
            api.gitCreateBranch(state.selectedProjectId, name, true)
              .done(function() {
                showToast('Created and switched to branch: ' + name, 'success');
                loadGitStatus();
              })
              .fail(function(xhr) {
                showToast('Failed to create branch: ' + getErrorMessage(xhr), 'error');
              })
              .always(function() {
                setGitOperationState(false);
              });
          }
        });
    });

    // Stage all button
    $('#btn-git-stage-all').on('click', function() {
      if (!state.selectedProjectId) return;

      setGitOperationState(true);
      api.gitStageAll(state.selectedProjectId)
        .done(function() {
          loadGitStatus();
        })
        .fail(function(xhr) {
          showToast('Failed to stage files: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
        });
    });

    // Unstage all button
    $('#btn-git-unstage-all').on('click', function() {
      if (!state.selectedProjectId) return;

      setGitOperationState(true);
      api.gitUnstageAll(state.selectedProjectId)
        .done(function() {
          loadGitStatus();
        })
        .fail(function(xhr) {
          showToast('Failed to unstage files: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
        });
    });

    // Stage individual file (event delegation)
    $(document).on('click', '.git-stage-btn', function(e) {
      e.stopPropagation();
      var path = $(this).data('path');

      if (path && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitStage(state.selectedProjectId, [path])
          .done(function() {
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to stage file: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    // Unstage individual file (event delegation)
    $(document).on('click', '.git-unstage-btn', function(e) {
      e.stopPropagation();
      var path = $(this).data('path');

      if (path && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitUnstage(state.selectedProjectId, [path])
          .done(function() {
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to unstage file: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    // Stage directory (event delegation)
    $(document).on('click', '.git-stage-dir-btn', function(e) {
      e.stopPropagation();
      var dirPath = $(this).data('path');

      if (dirPath && state.selectedProjectId) {
        setGitOperationState(true);
        // Git add works with directories directly
        api.gitStage(state.selectedProjectId, [dirPath])
          .done(function() {
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to stage folder: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    // Unstage directory (event delegation)
    $(document).on('click', '.git-unstage-dir-btn', function(e) {
      e.stopPropagation();
      var dirPath = $(this).data('path');

      if (dirPath && state.selectedProjectId) {
        setGitOperationState(true);
        // Git reset works with directories directly
        api.gitUnstage(state.selectedProjectId, [dirPath])
          .done(function() {
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to unstage folder: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    // Click on git tree item (file or directory)
    $(document).on('click', '.git-tree-item', function(e) {
      // Ignore if clicking action buttons
      if ($(e.target).closest('.git-action-btn').length) return;

      var $item = $(this);
      var path = $item.data('path');
      var type = $item.data('type');
      var isDirectory = $item.hasClass('directory');

      if (isDirectory) {
        // Toggle directory
        toggleGitDirectory(path, type);
      } else {
        // Select file and show diff
        state.git.selectedFile = path;

        // Update selection visual
        $('.git-tree-item').removeClass('selected');
        $item.addClass('selected');

        // Load and show diff
        if (path && state.selectedProjectId) {
          loadGitFileDiff(path, type === 'staged');
          showMobileGitDiff();
        }
      }
    });

    // Right-click context menu for git files
    $(document).on('contextmenu', '.git-tree-item.file', function(e) {
      e.preventDefault();

      var $item = $(this);
      var path = $item.data('path');
      var type = $item.data('type');
      var status = $item.data('status');

      state.gitContextTarget = { path: path, type: type, status: status, isDirectory: false };

      // Show/hide appropriate options
      if (type === 'staged') {
        $('#git-ctx-stage, #git-ctx-discard').addClass('hidden');
        $('#git-ctx-unstage').removeClass('hidden');
      } else {
        $('#git-ctx-stage, #git-ctx-discard').removeClass('hidden');
        $('#git-ctx-unstage').addClass('hidden');
      }

      // Show file-specific options
      $('#git-ctx-view-diff, #git-ctx-open-file').removeClass('hidden');

      // Position and show menu
      $('#git-context-menu').css({
        top: e.pageY + 'px',
        left: e.pageX + 'px'
      }).removeClass('hidden');

      // Close menu when clicking elsewhere
      $(document).one('click', function() {
        $('#git-context-menu').addClass('hidden');
      });
    });

    // Right-click context menu for git directories
    $(document).on('contextmenu', '.git-tree-item.directory', function(e) {
      e.preventDefault();

      var $item = $(this);
      var path = $item.data('path');
      var type = $item.data('type');

      state.gitContextTarget = { path: path, type: type, status: null, isDirectory: true };

      // Show/hide appropriate options - no discard for directories
      if (type === 'staged') {
        $('#git-ctx-stage, #git-ctx-discard').addClass('hidden');
        $('#git-ctx-unstage').removeClass('hidden');
      } else {
        $('#git-ctx-stage').removeClass('hidden');
        $('#git-ctx-unstage, #git-ctx-discard').addClass('hidden');
      }

      // Hide file-specific options for directories
      $('#git-ctx-view-diff, #git-ctx-open-file').addClass('hidden');

      // Position and show menu
      $('#git-context-menu').css({
        top: e.pageY + 'px',
        left: e.pageX + 'px'
      }).removeClass('hidden');

      // Close menu when clicking elsewhere
      $(document).one('click', function() {
        $('#git-context-menu').addClass('hidden');
      });
    });

    // Git context menu actions
    $('#git-ctx-stage').on('click', function(e) {
      e.stopPropagation();
      $('#git-context-menu').addClass('hidden');

      if (state.gitContextTarget && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitStage(state.selectedProjectId, [state.gitContextTarget.path])
          .done(loadGitStatus)
          .fail(function(xhr) {
            showToast('Failed to stage: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    $('#git-ctx-unstage').on('click', function(e) {
      e.stopPropagation();
      $('#git-context-menu').addClass('hidden');

      if (state.gitContextTarget && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitUnstage(state.selectedProjectId, [state.gitContextTarget.path])
          .done(loadGitStatus)
          .fail(function(xhr) {
            showToast('Failed to unstage: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    $('#git-ctx-discard').on('click', function(e) {
      e.stopPropagation();
      $('#git-context-menu').addClass('hidden');

      if (state.gitContextTarget && state.selectedProjectId) {
        var targetPath = state.gitContextTarget.path;
        showConfirm('Discard Changes', 'Discard changes to ' + targetPath + '?\n\nThis cannot be undone.', { danger: true, confirmText: 'Discard' })
          .then(function(confirmed) {
            if (confirmed) {
              setGitOperationState(true);
              api.gitDiscard(state.selectedProjectId, [targetPath])
                .done(function() {
                  showToast('Changes discarded', 'success');
                  loadGitStatus();
                })
                .fail(function(xhr) {
                  showToast('Failed to discard: ' + getErrorMessage(xhr), 'error');
                })
                .always(function() {
                  setGitOperationState(false);
                });
            }
          });
      }
    });

    $('#git-ctx-view-diff').on('click', function(e) {
      e.stopPropagation();
      $('#git-context-menu').addClass('hidden');

      if (state.gitContextTarget) {
        loadGitFileDiff(state.gitContextTarget.path, state.gitContextTarget.type === 'staged');
      }
    });

    $('#git-ctx-open-file').on('click', function(e) {
      e.stopPropagation();
      $('#git-context-menu').addClass('hidden');

      if (state.gitContextTarget && state.selectedProjectId) {
        // Switch to Project Files tab and open the file
        var project = findProjectById(state.selectedProjectId);

        if (project) {
          var fullPath = project.path + '/' + state.gitContextTarget.path;
          switchTab('project-files');
          openFile(fullPath.replace(/\//g, '\\'));
        }
      }
    });

    // Commit button
    $('#btn-git-commit').on('click', function() {
      var message = $('#git-commit-message').val().trim();

      if (!message) {
        showToast('Please enter a commit message', 'error');
        return;
      }

      if (!state.selectedProjectId) return;

      setGitOperationState(true);
      $(this).text('Committing...');

      api.gitCommit(state.selectedProjectId, message)
        .done(function(result) {
          showToast('Committed: ' + result.hash, 'success');
          $('#git-commit-message').val('');
          loadGitStatus();
        })
        .fail(function(xhr) {
          showToast('Failed to commit: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
          $('#btn-git-commit').text('Commit');
        });
    });

    // Push button
    $('#btn-git-push').on('click', function() {
      if (!state.selectedProjectId) return;

      setGitOperationState(true);
      $(this).text('Pushing...');

      api.gitPush(state.selectedProjectId)
        .done(function() {
          showToast('Pushed successfully', 'success');
        })
        .fail(function(xhr) {
          showToast('Failed to push: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
          $('#btn-git-push').text('Push');
        });
    });

    // Pull button
    $('#btn-git-pull').on('click', function() {
      if (!state.selectedProjectId) return;

      setGitOperationState(true);
      $(this).text('Pulling...');

      api.gitPull(state.selectedProjectId)
        .done(function() {
          showToast('Pulled successfully', 'success');
          loadGitStatus();
        })
        .fail(function(xhr) {
          showToast('Failed to pull: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
          $('#btn-git-pull').text('Pull');
        });
    });

    // Mobile back button
    $('#git-mobile-back-btn').on('click', function() {
      hideMobileGitDiff();
    });

    // New tag button
    $('#btn-git-new-tag').on('click', function() {
      $('#input-tag-name').val('');
      $('#input-tag-message').val('');
      $('#modal-create-tag').removeClass('hidden');
    });

    // Create tag form submit
    $('#form-create-tag').on('submit', function(e) {
      e.preventDefault();
      var name = $('#input-tag-name').val().trim();
      var message = $('#input-tag-message').val().trim();

      if (!name || !state.selectedProjectId) return;

      setGitOperationState(true);
      api.gitCreateTag(state.selectedProjectId, name, message || undefined)
        .done(function() {
          showToast('Tag created: ' + name, 'success');
          $('#modal-create-tag').addClass('hidden');
          loadGitTags();
        })
        .fail(function(xhr) {
          showToast('Failed to create tag: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
        });
    });

    // Push tag (event delegation)
    $(document).on('click', '.git-push-tag-btn', function(e) {
      e.stopPropagation();
      var tagName = $(this).data('tag');

      if (tagName && state.selectedProjectId) {
        var $btn = $(this);
        setGitOperationState(true);
        $btn.text('...');

        api.gitPushTag(state.selectedProjectId, tagName)
          .done(function() {
            showToast('Tag pushed: ' + tagName, 'success');
          })
          .fail(function(xhr) {
            showToast('Failed to push tag: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
            $btn.html('&#8593;');
          });
      }
    });
  }

  // Load and render diff for a specific file using side-by-side format
  // Parse unified diff format into aligned diff format
  function parseUnifiedDiff(diffText) {
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
          var wordDiff = computeWordDiff(oldContent, newContent);

          aligned.push({
            left: oldContent,
            right: newContent,
            type: 'change',
            leftChunks: wordDiff.leftChunks,
            rightChunks: wordDiff.rightChunks
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
        // Empty line in diff output - could be end of section
        // Flush pending removes
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
  }

  function loadGitFileDiff(filePath, staged) {
    var $preview = $('#git-diff-preview');
    $preview.html('<div class="text-gray-500 text-center py-4">Loading diff...</div>');

    if (!state.selectedProjectId) return;

    api.getGitFileDiff(state.selectedProjectId, filePath, staged)
      .done(function(result) {
        if (!result.diff) {
          $preview.html('<div class="text-gray-500 text-center py-4">No changes</div>');
          return;
        }

        // Parse unified diff format
        var alignedDiff = parseUnifiedDiff(result.diff);

        if (alignedDiff.length === 0) {
          $preview.html('<div class="text-gray-500 text-center py-4">No changes</div>');
          return;
        }

        // Render using side-by-side format
        var html = renderGitDiffSideBySide(alignedDiff, filePath);
        $preview.html(html);
      })
      .fail(function(xhr) {
        var msg = getErrorMessage(xhr);
        $preview.html('<div class="text-red-400 text-center py-4">Failed to load diff: ' + escapeHtml(msg) + '</div>');
      });
  }

  // Render git diff in side-by-side format (similar to tool diff)
  function renderGitDiffSideBySide(alignedDiff, filePath) {
    if (alignedDiff.length === 0) {
      return '<div class="text-gray-500 text-center py-4">No changes</div>';
    }

    var language = getLanguageFromPath(filePath);
    var html = '<div class="git-diff side-by-side">';

    // Original side
    html += '<div class="diff-side old">';
    html += '<div class="diff-side-header">Original</div>';
    html += '<div class="diff-side-content">';

    for (var i = 0; i < alignedDiff.length; i++) {
      var row = alignedDiff[i];
      var leftClass = 'diff-line';

      if (row.type === 'unchanged') {
        leftClass += ' diff-unchanged';
      } else if (row.type === 'remove') {
        leftClass += ' diff-remove';
      } else if (row.type === 'change') {
        leftClass += ' diff-change';
      } else if (row.type === 'add') {
        leftClass += ' diff-empty';
      }

      var leftContent;

      if (row.type === 'change' && row.leftChunks && row.leftChunks.length > 0) {
        // Use word-level diff highlighting for changed lines
        leftContent = renderWordChunks(row.leftChunks, 'old');
      } else {
        leftContent = row.left ? highlightCode(row.left, language) : '&nbsp;';
      }

      html += '<div class="' + leftClass + '">';
      html += '<span class="diff-content">' + leftContent + '</span>';
      html += '</div>';
    }

    html += '</div></div>';

    // New side
    html += '<div class="diff-side new">';
    html += '<div class="diff-side-header">Modified</div>';
    html += '<div class="diff-side-content">';

    for (var j = 0; j < alignedDiff.length; j++) {
      var row2 = alignedDiff[j];
      var rightClass = 'diff-line';

      if (row2.type === 'unchanged') {
        rightClass += ' diff-unchanged';
      } else if (row2.type === 'add') {
        rightClass += ' diff-add';
      } else if (row2.type === 'change') {
        rightClass += ' diff-change';
      } else if (row2.type === 'remove') {
        rightClass += ' diff-empty';
      }

      var rightContent;

      if (row2.type === 'change' && row2.rightChunks && row2.rightChunks.length > 0) {
        // Use word-level diff highlighting for changed lines
        rightContent = renderWordChunks(row2.rightChunks, 'new');
      } else {
        rightContent = row2.right ? highlightCode(row2.right, language) : '&nbsp;';
      }

      html += '<div class="' + rightClass + '">';
      html += '<span class="diff-content">' + rightContent + '</span>';
      html += '</div>';
    }

    html += '</div></div>';
    html += '</div>';

    return html;
  }

  // Load settings on init to get sendWithCtrlEnter preference and notification settings
  function loadInitialSettings() {
    api.getSettings()
      .done(function(settings) {
        state.settings = settings;
        state.sendWithCtrlEnter = settings.sendWithCtrlEnter !== false;
        updateInputHint();
      });
  }

  // Initialize application
  function init() {
    setupEventHandlers();
    setupTabHandlers();
    setupFileBrowserHandlers();
    setupGitHandlers();
    loadProjects();
    loadResourceStatus();
    loadInitialSettings();
    loadFontSize();
    loadScrollLockPreference();
    loadDevModeStatus();
    loadAppVersion();
    connectWebSocket();
    setupResizeHandler();
  }

  // Handle window resize for mobile/desktop hint updates
  function setupResizeHandler() {
    var resizeTimeout;

    $(window).on('resize', function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function() {
        updateInputHint();
      }, 250);
    });
  }

  function loadDevModeStatus() {
    api.getDevStatus()
      .done(function(data) {
        state.devMode = data.devMode;

        if (state.devMode) {
          $('#btn-toggle-dev').removeClass('hidden');
        }
      });
  }

  function loadResourceStatus() {
    api.getAgentResourceStatus()
      .done(function(data) {
        updateResourceStatus(data);
      });
  }

  function loadAppVersion() {
    api.getHealth()
      .done(function(data) {
        if (data.version) {
          $('#app-version').text('v' + data.version);
        }
      });
  }

  // Start the app when document is ready
  $(document).ready(init);

})(jQuery);
