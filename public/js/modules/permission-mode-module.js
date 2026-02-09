/**
 * Permission Mode Module
 * Handles permission mode switching, pending mode states, and agent restarts
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PermissionModeModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies (injected via init)
  var state;
  var api;
  var showToast;
  var showErrorToast;
  var findProjectById;
  var updateProjectStatusById;
  var startAgentStatusPolling;
  var appendMessage;
  var renderProjectList;

  /**
   * Initialize the module with dependencies
   * @param {Object} deps - Dependencies object
   */
  function init(deps) {
    state = deps.state;
    api = deps.api;
    showToast = deps.showToast;
    showErrorToast = deps.showErrorToast;
    findProjectById = deps.findProjectById;
    updateProjectStatusById = deps.updateProjectStatusById;
    startAgentStatusPolling = deps.startAgentStatusPolling;
    appendMessage = deps.appendMessage;
    renderProjectList = deps.renderProjectList;
  }

  /**
   * Get display label for permission mode
   * @param {string} mode - Permission mode
   * @returns {string} Display label
   */
  function getModeLabel(mode) {
    switch (mode) {
      case 'plan': return 'Plan';
      case 'acceptEdits': return 'Accept Edits';
      default: return 'Default';
    }
  }

  /**
   * Update permission mode button active states
   */
  function updateButtons() {
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

    updateSkipPermissionsWarning();
  }

  /**
   * Update the skip permissions warning icon on the Accept Edits button
   */
  function updateSkipPermissionsWarning() {
    var skipEnabled = state.settings &&
      state.settings.claudePermissions &&
      state.settings.claudePermissions.dangerouslySkipPermissions;

    var $icon = $('#skip-perms-icon');
    var $btn = $('#btn-perm-accept');

    if (skipEnabled) {
      $icon.removeClass('hidden');
      $btn.attr('title', 'Accept Edits - Skipping ALL permission prompts (dangerous)');
    } else {
      $icon.addClass('hidden');
      $btn.attr('title', 'Accept Edits - Auto-approve file edits');
    }
  }

  /**
   * Update pending mode indicator visibility and text
   */
  function updatePendingIndicator() {
    var $indicator = $('#pending-mode-label');

    if (state.pendingPermissionMode) {
      $indicator.text('(switching to ' + getModeLabel(state.pendingPermissionMode) + ')').removeClass('hidden');
    } else {
      $indicator.addClass('hidden');
    }
  }

  /**
   * Set UI state during mode switching
   * @param {boolean} isSwitching - Whether mode is being switched
   */
  function setSwitchingState(isSwitching) {
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

  /**
   * Restart agent with new permission mode
   */
  function restartAgent() {
    var projectId = state.selectedProjectId;

    if (!projectId) return;

    var sessionId = state.currentSessionId;
    var targetMode = state.permissionMode;

    // Disable UI during mode switch
    setSwitchingState(true);

    showToast('Stopping agent to switch to ' + getModeLabel(targetMode) + ' mode...', 'info');

    // Stop the current agent
    api.stopAgent(projectId)
      .done(function() {
        updateProjectStatusById(projectId, 'stopped');

        // Wait 1 second before restarting to avoid "session already in use" errors
        setTimeout(function() {
          // Check if mode was changed back while we were waiting
          if (state.permissionMode !== targetMode) {
            showToast('Mode change cancelled - mode was changed again', 'info');
            setSwitchingState(false);
            return;
          }

          showToast('Starting agent with ' + getModeLabel(targetMode) + ' mode...', 'info');

          // Start the agent again with the same session ID and new permission mode
          api.startInteractiveAgent(projectId, '', [], sessionId, targetMode)
            .done(function(response) {
              state.currentAgentMode = 'interactive';
              updateProjectStatusById(projectId, 'running');
              startAgentStatusPolling(projectId);
              setSwitchingState(false);

              // Update session ID if returned (may be different if backend retried with fresh session)
              if (response && response.sessionId) {
                state.currentSessionId = response.sessionId;
              }

              appendMessage(projectId, {
                type: 'system',
                content: 'Agent restarted with ' + getModeLabel(targetMode) + ' mode',
                timestamp: new Date().toISOString()
              });
            })
            .fail(function(xhr) {
              setSwitchingState(false);
              showErrorToast(xhr, 'Failed to restart agent');
            });
        }, 1000);
      })
      .fail(function(xhr) {
        setSwitchingState(false);
        showErrorToast(xhr, 'Failed to stop agent');
      });
  }

  /**
   * Set permission mode with validation and agent restart if needed
   * @param {string} mode - New permission mode
   */
  function setMode(mode) {
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
      updatePendingIndicator();
      updateButtons();
      showToast('Pending mode change cancelled', 'info');
      return;
    }

    // If agent is running and busy (not waiting), queue the change
    if (isRunning && state.currentSessionId && !isWaiting) {
      state.pendingPermissionMode = mode;
      updatePendingIndicator();
      updateButtons();
      showToast('Mode change to ' + getModeLabel(mode) + ' will apply when Claude finishes current operation', 'info');
      return;
    }

    // Apply the mode change
    state.permissionMode = mode;
    state.pendingPermissionMode = null;
    updatePendingIndicator();
    updateButtons();

    // If agent is running and waiting, restart with new mode
    if (isRunning && state.currentSessionId && isWaiting) {
      restartAgent();
    } else {
      // Show feedback that mode will be used on next agent start
      showToast('Permission mode set to ' + getModeLabel(mode) + ' (will apply on next agent start)', 'info');
    }
  }

  /**
   * Apply pending permission mode if there is one and conditions are met
   */
  function applyPendingIfNeeded() {
    if (!state.pendingPermissionMode) return;

    var project = findProjectById(state.selectedProjectId);

    if (!project || project.status !== 'running' || !state.currentSessionId) {
      state.pendingPermissionMode = null;
      updatePendingIndicator();
      updateButtons();
      return;
    }

    // Apply the pending mode change
    var pendingMode = state.pendingPermissionMode;
    state.permissionMode = pendingMode;
    state.pendingPermissionMode = null;
    updatePendingIndicator();
    updateButtons();
    restartAgent();
  }

  /**
   * Approve plan and switch to Accept Edits mode
   */
  function approvePlanAndSwitch() {
    // Simply send "yes" as a message - the backend will handle the rest
    api.sendAgentMessage(state.selectedProjectId, 'yes')
      .done(function() {
        // Update mode to reflect the expected state after approval
        state.permissionMode = 'acceptEdits';
        state.pendingPermissionMode = null;
        updatePendingIndicator();
        updateButtons();
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to send plan approval');
      });
  }

  /**
   * Setup event handlers for permission mode buttons
   */
  function setupHandlers() {
    $('#btn-perm-accept').on('click', function() {
      setMode('acceptEdits');
    });

    $('#btn-perm-plan').on('click', function() {
      setMode('plan');
    });
  }

  // Public API
  return {
    init: init,
    getModeLabel: getModeLabel,
    updateButtons: updateButtons,
    updatePendingIndicator: updatePendingIndicator,
    setSwitchingState: setSwitchingState,
    restartAgent: restartAgent,
    setMode: setMode,
    applyPendingIfNeeded: applyPendingIfNeeded,
    approvePlanAndSwitch: approvePlanAndSwitch,
    updateSkipPermissionsWarning: updateSkipPermissionsWarning,
    setupHandlers: setupHandlers
  };
}));
