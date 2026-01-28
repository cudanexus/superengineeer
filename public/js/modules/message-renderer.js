/**
 * Message Renderer Module
 * Handles rendering of different message types in the conversation view
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MessageRenderer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies injected via init()
  var escapeHtml;
  var ToolRenderer;
  var marked;

  /**
   * Initialize the module with dependencies
   */
  function init(deps) {
    escapeHtml = deps.escapeHtml;
    ToolRenderer = deps.ToolRenderer;
    marked = deps.marked;
  }

  /**
   * Render markdown content to HTML
   */
  function renderMarkdown(content) {
    if (typeof marked === 'undefined' || !marked) {
      return '<pre class="whitespace-pre-wrap">' + escapeHtml(content) + '</pre>';
    }

    try {
      marked.setOptions({
        breaks: true,
        gfm: true
      });
      return marked.parse(content);
    } catch (e) {
      return '<pre class="whitespace-pre-wrap">' + escapeHtml(content) + '</pre>';
    }
  }

  /**
   * Get user icon SVG
   */
  function getUserIcon() {
    return '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
      'd="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>' +
      '</svg>';
  }

  /**
   * Get Claude icon SVG
   */
  function getClaudeIcon() {
    return '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>' +
      '</svg>';
  }

  /**
   * Get question icon SVG
   */
  function getQuestionIcon() {
    return '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
      'd="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
      '</svg>';
  }

  /**
   * Get permission icon SVG
   */
  function getPermissionIcon() {
    return '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
      'd="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>' +
      '</svg>';
  }

  /**
   * Get compaction icon SVG
   */
  function getCompactionIcon() {
    return '<svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
      'd="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>' +
      '</svg>';
  }

  /**
   * Render a user message
   */
  function renderUserMessage(msg) {
    var html = '<div class="conversation-message user" data-msg-type="user">' +
      '<div class="message-header">' +
      getUserIcon() +
      '<span class="message-sender">You</span>' +
      '</div>';

    if (msg.images && msg.images.length > 0) {
      html += '<div class="flex flex-wrap gap-2 mb-2">';

      msg.images.forEach(function(img) {
        html += '<img src="' + img.dataUrl + '" alt="Attached image" ' +
          'class="conversation-image" onclick="window.showImageModal(this.src)">';
      });

      html += '</div>';
    }

    if (msg.content) {
      var renderedContent = renderMarkdown(msg.content);
      html += '<div class="message-content markdown-content">' + renderedContent + '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Render an assistant/stdout message
   */
  function renderAssistantMessage(msg, typeClass) {
    var renderedContent = renderMarkdown(msg.content);

    return '<div class="conversation-message ' + typeClass + ' markdown-content" data-msg-type="assistant">' +
      '<div class="message-header claude-header">' +
      getClaudeIcon() +
      '<span class="message-sender">Claude</span>' +
      '</div>' +
      '<div class="message-content">' + renderedContent + '</div>' +
      '</div>';
  }

  /**
   * Render a question message
   */
  function renderQuestionMessage(msg) {
    var info = msg.questionInfo || {};
    var question = info.question || msg.content;
    var options = info.options || [];
    var header = info.header || 'Question';

    var html = '<div class="conversation-message question" data-msg-type="system">' +
      '<div class="question-header">' +
      getQuestionIcon() +
      '<span class="question-label">' + escapeHtml(header) + '</span>' +
      '</div>' +
      '<div class="question-text">' + escapeHtml(question) + '</div>';

    if (options.length > 0) {
      html += '<div class="question-options">';

      options.forEach(function(opt, index) {
        html += '<button class="question-option" data-option-index="' + index +
          '" data-option-label="' + escapeHtml(opt.label) + '">' +
          '<span class="option-label">' + escapeHtml(opt.label) + '</span>';

        if (opt.description) {
          html += '<span class="option-description">' + escapeHtml(opt.description) + '</span>';
        }

        html += '</button>';
      });

      html += '<button class="question-option question-option-other" data-option-index="-1">' +
        '<span class="option-label">Other...</span>' +
        '<span class="option-description">Type a custom response</span>' +
        '</button>';

      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Render a permission request message
   */
  function renderPermissionMessage(msg) {
    var info = msg.permissionInfo || {};
    var tool = info.tool || 'Unknown';
    var action = info.action || msg.content;
    var details = info.details || {};

    var html = '<div class="conversation-message permission" data-msg-type="system">' +
      '<div class="permission-header">' +
      getPermissionIcon() +
      '<span class="permission-label">Permission Request</span>' +
      '<span class="permission-tool">' + escapeHtml(tool) + '</span>' +
      '</div>' +
      '<div class="permission-action">' + escapeHtml(action) + '</div>';

    if (details.file_path) {
      html += '<div class="permission-detail"><span class="detail-label">File:</span> ' +
        '<code>' + escapeHtml(details.file_path) + '</code></div>';
    }

    if (details.command) {
      html += '<div class="permission-detail"><span class="detail-label">Command:</span> ' +
        '<pre>' + escapeHtml(details.command) + '</pre></div>';
    }

    html += '<div class="permission-actions">' +
      '<button class="permission-btn approve" data-response="yes">Approve</button>' +
      '<button class="permission-btn deny" data-response="no">Deny</button>' +
      '<button class="permission-btn always" data-response="always">Always Allow</button>' +
      '</div>';

    html += '</div>';
    return html;
  }

  /**
   * Render a plan mode message
   */
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

    var html = '<div class="conversation-message plan-mode ' + bgClass +
      ' border-l-2 p-3 rounded" data-msg-type="system">' +
      '<div class="flex items-center gap-2 mb-2">' +
      '<svg class="w-5 h-5 ' + iconClass + '" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="' + iconPath + '"/>' +
      '</svg>' +
      '<span class="font-medium text-white">' + label + '</span>' +
      '</div>' +
      '<div class="text-gray-300 text-sm">' + escapeHtml(msg.content) + '</div>';

    if (!isEnter) {
      html += '<div class="plan-content-container mt-3 mb-3"></div>';

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

  /**
   * Render a compaction message
   */
  function renderCompactionMessage(msg) {
    var html = '<div class="conversation-message compaction bg-amber-900/30 border-l-2 border-amber-500 p-3 rounded" data-msg-type="system">' +
      '<div class="flex items-center gap-2 mb-2">' +
      getCompactionIcon() +
      '<span class="font-medium text-amber-300">Context Compacted</span>' +
      '</div>' +
      '<div class="text-gray-300 text-sm">' +
      'The conversation history was summarized to reduce token usage. Previous context has been condensed.' +
      '</div>';

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

  /**
   * Render a system/fallback message
   */
  function renderSystemMessage(msg, typeClass) {
    return '<div class="conversation-message ' + typeClass + '" data-msg-type="system">' +
      '<pre class="whitespace-pre-wrap">' + escapeHtml(msg.content) + '</pre>' +
      '</div>';
  }

  /**
   * Main render function - dispatches to appropriate renderer
   */
  function renderMessage(msg) {
    var typeClass = msg.type || 'system';

    if (msg.type === 'tool_use') {
      return ToolRenderer.renderToolMessage(msg);
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
      return renderUserMessage(msg);
    }

    if (msg.type === 'stdout' || msg.type === 'assistant') {
      return renderAssistantMessage(msg, typeClass);
    }

    return renderSystemMessage(msg, typeClass);
  }

  // Public API
  return {
    init: init,
    renderMessage: renderMessage,
    renderMarkdown: renderMarkdown,
    renderQuestionMessage: renderQuestionMessage,
    renderPermissionMessage: renderPermissionMessage,
    renderPlanModeMessage: renderPlanModeMessage,
    renderCompactionMessage: renderCompactionMessage,
    renderUserMessage: renderUserMessage,
    renderAssistantMessage: renderAssistantMessage,
    renderSystemMessage: renderSystemMessage,
    // Expose icon helpers for testing
    getUserIcon: getUserIcon,
    getClaudeIcon: getClaudeIcon,
    getQuestionIcon: getQuestionIcon,
    getPermissionIcon: getPermissionIcon,
    getCompactionIcon: getCompactionIcon
  };
}));
