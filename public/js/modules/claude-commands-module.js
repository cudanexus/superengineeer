/**
 * Claude Commands Module
 * Handles Claude CLI command selection and execution
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ClaudeCommandsModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies injected via init()
  var escapeHtml = null;
  var openModal = null;
  var closeAllModals = null;
  var sendCommand = null;

  // Available commands
  var commands = [
    { id: 'compact', name: '/compact', description: 'Compact context to save tokens', requiresArgs: false }
  ];

  // Currently selected command (for args modal)
  var currentCommand = null;

  function init(deps) {
    escapeHtml = deps.escapeHtml;
    openModal = deps.openModal;
    closeAllModals = deps.closeAllModals;
    sendCommand = deps.sendCommand;
    setupHandlers();
  }

  /**
   * Open the command selector modal
   */
  function openCommandSelector() {
    var html = '<div class="py-1">';

    commands.forEach(function(cmd) {
      html += '<div class="command-selector-item px-3 py-2 hover:glass-panel cursor-pointer" data-id="' + escapeHtml(cmd.id) + '">' +
        '<div class="flex items-center justify-between">' +
        '<span class="text-sm !text-[var(--theme-accent-primary)] font-mono">' + escapeHtml(cmd.name) + '</span>' +
        (cmd.requiresArgs ? '<span class="text-xs text-gray-500 glass-panel px-1.5 py-0.5 rounded">args</span>' : '') +
        '</div>' +
        '<div class="text-xs text-gray-400 mt-0.5">' + escapeHtml(cmd.description) + '</div>' +
        '</div>';
    });

    html += '</div>';

    $('#command-selector-list').html(html);
    openModal('modal-claude-commands');
  }

  /**
   * Handle command selection
   */
  function selectCommand(commandId) {
    var command = commands.find(function(c) { return c.id === commandId; });

    if (!command) return;

    closeAllModals();

    if (command.requiresArgs) {
      showArgsModal(command);
    } else {
      sendCommand(command.name);
    }
  }

  /**
   * Show args modal for commands that require arguments
   */
  function showArgsModal(command) {
    currentCommand = command;
    $('#command-args-title').text(command.name);
    $('#command-args-label').text(command.argLabel || 'Argument');
    $('#input-command-arg').attr('placeholder', command.argPlaceholder || '').val('');
    openModal('modal-command-args');
    $('#input-command-arg').focus();
  }

  /**
   * Submit command with arguments
   */
  function submitCommandWithArgs() {
    if (!currentCommand) return;

    var argValue = $('#input-command-arg').val().trim();

    if (!argValue) {
      return;
    }

    var fullCommand = currentCommand.name + ' ' + argValue;
    closeAllModals();
    sendCommand(fullCommand);
    currentCommand = null;
  }

  /**
   * Setup event handlers
   */
  function setupHandlers() {
    // Command button click
    $(document).on('click', '#btn-open-commands', function(e) {
      e.stopPropagation();
      openCommandSelector();
    });

    // Command selection
    $(document).on('click', '.command-selector-item', function() {
      var commandId = $(this).data('id');
      selectCommand(commandId);
    });

    // Args form submit
    $(document).on('submit', '#form-command-args', function(e) {
      e.preventDefault();
      submitCommandWithArgs();
    });
  }

  return {
    init: init,
    openCommandSelector: openCommandSelector
  };
}));
