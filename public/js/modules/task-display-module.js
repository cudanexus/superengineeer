/**
 * Task Display Module
 * Handles task/todo list rendering, badge updates, and optimization suggestions
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TaskDisplayModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies (injected via init)
  var state;
  var api;
  var escapeHtml;
  var truncateString;
  var formatTodoStatus;
  var openModal;
  var showToast;

  /**
   * Initialize the module with dependencies
   * @param {Object} deps - Dependencies object
   */
  function init(deps) {
    state = deps.state;
    api = deps.api;
    escapeHtml = deps.escapeHtml;
    truncateString = deps.truncateString;
    formatTodoStatus = deps.formatTodoStatus;
    openModal = deps.openModal;
    showToast = deps.showToast;
  }

  /**
   * Get SVG icon for task status
   * @param {string} status - Task status (completed, in_progress, pending)
   * @returns {string} SVG HTML string
   */
  function getStatusIcon(status) {
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

  /**
   * Get small SVG icon for task status (used in previews)
   * @param {string} status - Task status
   * @returns {string} SVG HTML string
   */
  function getStatusIconSmall(status) {
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

  /**
   * Get CSS class for task status border
   * @param {string} status - Task status
   * @returns {string} CSS class string
   */
  function getStatusClass(status) {
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

  /**
   * Get CSS class for status badge
   * @param {string} status - Task status
   * @returns {string} CSS class string
   */
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

  /**
   * Get CSS class for task text
   * @param {string} status - Task status
   * @returns {string} CSS class string
   */
  function getTextClass(status) {
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

  /**
   * Render inline task list
   * @param {Array} todos - Array of todo items
   * @returns {string} HTML string
   */
  function renderList(todos) {
    if (!todos || todos.length === 0) {
      return '<div class="text-gray-500 text-xs italic">No tasks</div>';
    }

    var html = '<div class="todo-list space-y-1 mt-2">';

    for (var i = 0; i < todos.length; i++) {
      var todo = todos[i];
      var statusIcon = getStatusIcon(todo.status);
      var statusClass = getStatusClass(todo.status);

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

  /**
   * Render compact task preview for tool modals
   * @param {Array} todos - Array of todo items
   * @returns {string} HTML string
   */
  function renderListPreview(todos) {
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
      var icon = getStatusIconSmall(todo.status);
      html += '<div class="flex items-center gap-1.5 text-xs">' +
        icon +
        '<span class="' + getTextClass(todo.status) + ' truncate">' + escapeHtml(truncateString(todo.content, 50)) + '</span>' +
      '</div>';
    }

    if (todos.length > maxPreview) {
      html += '<div class="text-gray-500 text-xs">+' + (todos.length - maxPreview) + ' more...</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Update currentTodos from TodoWrite input
   * @param {Object|string} input - TodoWrite input (object or JSON string)
   */
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
      updateButtonBadge();
      updateModalContent();
    }
  }

  /**
   * Update tasks button badge count
   */
  function updateButtonBadge() {
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

  /**
   * Update tasks modal content if it's open
   */
  function updateModalContent() {
    var $content = $('#tasks-modal-content');

    if (!$('#modal-tasks').hasClass('hidden')) {
      $content.html(renderModalContent());
    }
  }

  /**
   * Render full tasks modal content
   * @param {Array} [todosOverride] - Optional todos array to use instead of state.currentTodos
   * @returns {string} HTML string
   */
  function renderModalContent(todosOverride) {
    var todos = todosOverride || state.currentTodos;

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
      var statusIcon = getStatusIcon(todo.status);
      var statusClass = getStatusClass(todo.status);
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

  /**
   * Open the tasks modal
   */
  function openTasksModal() {
    $('#tasks-modal-content').html(renderModalContent());
    openModal('modal-tasks');
  }

  /**
   * Open the optimizations modal
   */
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

  /**
   * Render optimizations content
   * @param {Object} data - Optimizations data from API
   * @returns {string} HTML string
   */
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

    // Settings info - only show if settings data is available
    if (data.settings && data.settings.claudeMdMaxSizeKB) {
      html += '<div class="mt-4 pt-3 border-t border-gray-700">';
      html += '<p class="text-xs text-gray-500">CLAUDE.md max size threshold: ' + data.settings.claudeMdMaxSizeKB + ' KB</p>';
      html += '<p class="text-xs text-gray-500 mt-1">Change this in Settings to adjust the warning threshold.</p>';
      html += '</div>';
    }

    return html;
  }

  /**
   * Update optimizations badge
   * @param {number} count - Number of optimizations
   */
  function updateOptimizationsBadge(count) {
    var $badge = $('#optimizations-badge');

    if (count > 0) {
      $badge.text('!').removeClass('hidden');
    } else {
      $badge.addClass('hidden');
    }
  }

  /**
   * Load and display optimizations badge for a project
   * @param {string} projectId - Project ID
   */
  function loadOptimizationsBadge(projectId) {
    if (!projectId) {
      updateOptimizationsBadge(0);
      return;
    }

    api.getOptimizations(projectId)
      .done(function(data) {
        // Count non-passed checks as optimizations
        var checks = data.checks || data.optimizations || [];
        var count = 0;
        checks.forEach(function(check) {
          if (check.status !== 'passed') {
            count++;
          }
        });
        updateOptimizationsBadge(count);
      })
      .fail(function() {
        updateOptimizationsBadge(0);
      });
  }

  /**
   * Setup event handlers
   */
  function setupHandlers() {
    // Tasks button click
    $('#btn-tasks').on('click', function() {
      openTasksModal();
    });

    // Optimizations button click
    $('#btn-optimizations').on('click', function() {
      openOptimizationsModal();
    });
  }

  // Public API
  return {
    init: init,
    getStatusIcon: getStatusIcon,
    getStatusIconSmall: getStatusIconSmall,
    getStatusClass: getStatusClass,
    getStatusBadgeClass: getStatusBadgeClass,
    getTextClass: getTextClass,
    renderList: renderList,
    renderListPreview: renderListPreview,
    updateCurrentTodos: updateCurrentTodos,
    updateButtonBadge: updateButtonBadge,
    updateModalContent: updateModalContent,
    renderModalContent: renderModalContent,
    openTasksModal: openTasksModal,
    openOptimizationsModal: openOptimizationsModal,
    renderOptimizationsContent: renderOptimizationsContent,
    updateOptimizationsBadge: updateOptimizationsBadge,
    loadOptimizationsBadge: loadOptimizationsBadge,
    setupHandlers: setupHandlers
  };
}));
