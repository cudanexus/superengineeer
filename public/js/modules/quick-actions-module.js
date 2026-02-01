/**
 * Quick Actions Module
 * Handles quick action dropdown and auto-send functionality for templates
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuickActionsModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies injected via init()
  var state = null;
  var escapeHtml = null;
  var showToast = null;
  var sendMessage = null;
  var PromptTemplatesModule = null;

  function init(deps) {
    state = deps.state;
    escapeHtml = deps.escapeHtml;
    showToast = deps.showToast;
    sendMessage = deps.sendMessage;
    PromptTemplatesModule = deps.PromptTemplatesModule;
  }

  function getQuickActionTemplates() {
    return (state.settings.promptTemplates || [])
      .filter(function(template) { return template.isQuickAction === true; });
  }

  function toggleQuickActions() {
    if (state.quickActionsOpen) {
      closeQuickActions();
    } else {
      openQuickActions();
    }
  }

  function openQuickActions() {
    state.quickActionsOpen = true;

    // Position dropdown near the button
    var $btn = $('#btn-quick-actions');
    var offset = $btn.offset();
    var $dropdown = $('#quick-actions-dropdown');

    $dropdown.css({
      top: offset.top + $btn.outerHeight() + 4,
      left: offset.left
    });

    $dropdown.removeClass('hidden');
    renderQuickActionsList();
  }

  function closeQuickActions() {
    state.quickActionsOpen = false;
    $('#quick-actions-dropdown').addClass('hidden');
  }

  function renderQuickActionsList() {
    var $list = $('#quick-actions-list');
    var quickActions = getQuickActionTemplates();

    if (quickActions.length === 0) {
      $list.html('<div class="p-3 text-xs text-gray-500 text-center">No quick actions available</div>');
      return;
    }

    var html = '';
    quickActions.forEach(function(template) {
      html += '<div class="quick-action-item" data-template-id="' + escapeHtml(template.id) + '">';
      html += '<div class="font-medium text-sm">' + escapeHtml(template.name) + '</div>';
      if (template.description) {
        html += '<div class="text-xs text-gray-400 mt-0.5">' + escapeHtml(template.description) + '</div>';
      }
      html += '</div>';
    });

    $list.html(html);
  }

  function handleQuickActionClick(templateId) {
    var template = (state.settings.promptTemplates || [])
      .find(function(t) { return t.id === templateId; });

    if (!template) {
      showToast('Template not found', 'error');
      return;
    }

    closeQuickActions();

    // Parse template for variables
    var variables = PromptTemplatesModule.parseTemplateVariables(template.content);

    if (variables.length === 0) {
      // No variables - insert and send immediately
      insertAndSend(template.content);
    } else {
      // Has variables - open fill modal with auto-send flag
      PromptTemplatesModule.openFillModal(template, variables, true);
    }
  }

  function insertAndSend(text) {
    // Insert text into message input
    var $input = $('#input-message');
    $input.val(text);

    // Check if agent is running
    if (!state.agentRunning && !state.selectedProjectId) {
      showToast('Please select a project first', 'error');
      return;
    }

    // Send the message
    setTimeout(function() {
      sendMessage();
    }, 100);
  }

  // Handle click outside dropdown
  function handleClickOutside(e) {
    if (state.quickActionsOpen &&
        !$(e.target).closest('#quick-actions-dropdown').length &&
        !$(e.target).closest('#btn-quick-actions').length) {
      closeQuickActions();
    }
  }

  // Public API
  return {
    init: init,
    toggleQuickActions: toggleQuickActions,
    closeQuickActions: closeQuickActions,
    insertAndSend: insertAndSend,
    handleQuickActionClick: handleQuickActionClick
  };
}));