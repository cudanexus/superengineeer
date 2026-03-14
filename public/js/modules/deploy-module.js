/**
 * SuperEngineer Deploy Module
 * Starts SuperEngineer deployments and streams live logs into a modal.
 */
(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DeployModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var state = null;
  var api = null;
  var showToast = null;
  var showErrorToast = null;
  var openModal = null;
  var showConfirm = null;
  var sendDeployFixMessage = null;

  var currentDeploymentId = null;
  var currentProjectId = null;
  var active = false;
  var hasExistingApp = false;
  var currentAppName = null;
  var currentAppUrl = null;
  var lastKnownStatus = 'idle';
  var lastStatusMessage = '';
  var activeLogTab = 'deploy';
  var appLogsLoaded = false;
  var externalDeployment = null;
  var externalProjectName = '';
  var parentBridgeAttached = false;

  function init(deps) {
    state = deps.state;
    api = deps.api;
    showToast = deps.showToast;
    showErrorToast = deps.showErrorToast;
    openModal = deps.openModal;
    showConfirm = deps.showConfirm;
    sendDeployFixMessage = deps.sendDeployFixMessage;
    if (!parentBridgeAttached && typeof window !== 'undefined') {
      window.addEventListener('message', handleParentMessage);
      parentBridgeAttached = true;
    }
  }

  function setupHandlers() {
    $(document).on('click', '#btn-deploy-project', function() {
      openActionsModal();
    });

    $(document).on('click', '#btn-trigger-fly-deploy', function() {
      triggerDeployFromActions();
    });

    $(document).on('click', '#btn-close-fly-deploy-actions', function() {
      closeActionsModal();
    });

    $(document).on('click', '#modal-fly-deploy-actions .modal-backdrop', function() {
      closeActionsModal();
    });

    $(document).on('click', '#btn-open-deployed-app', function() {
      closeActionsModal();
    });

    $(document).on('click', '#btn-close-fly-deploy', function() {
      $('#modal-fly-deploy').addClass('hidden');
    });

    $(document).on('click', '#btn-close-fly-deploy-footer', function() {
      $('#modal-fly-deploy').addClass('hidden');
    });

    $(document).on('click', '#btn-retry-fly-deploy', function() {
      fixWithAi();
    });

    $(document).on('click', '#tab-fly-deploy-output', function() {
      switchLogTab('deploy');
    });

    $(document).on('click', '#tab-fly-app-logs', function() {
      switchLogTab('app');
    });

    $(document).on('click', '#modal-fly-deploy .modal-backdrop', function() {
      $('#modal-fly-deploy').addClass('hidden');
    });
  }

  function onProjectChanged(projectId) {
    currentProjectId = projectId || null;
    currentDeploymentId = null;
    hasExistingApp = false;
    currentAppName = null;
    currentAppUrl = null;
    externalDeployment = null;
    externalProjectName = '';
    lastKnownStatus = 'idle';
    lastStatusMessage = '';
    activeLogTab = 'deploy';
    appLogsLoaded = false;
    resetOutput();
    requestExternalDeploymentState();
    syncStatus();
  }

  function openActionsModal() {
    updateActionsModal();
    openModal('modal-fly-deploy-actions');
  }

  function closeActionsModal() {
    $('#modal-fly-deploy-actions').addClass('hidden');
  }

  function syncStatus() {
    updateButtonState(false);

    if (!state.selectedProjectId) {
      updateToolbarStatus(false);
      updateStatusBadge('No project selected', 'text-gray-400');
      return;
    }

    api.getFlyDeployStatus(state.selectedProjectId)
      .done(function(data) {
        currentDeploymentId = data && data.deploymentId ? data.deploymentId : null;
        active = !!(data && data.isActive);
        lastKnownStatus = data && data.status ? data.status : 'idle';
        lastStatusMessage = data && data.message ? data.message : '';
        hasExistingApp = !!(data && data.hasExistingApp);
        currentAppName = data && data.appName ? data.appName : null;
        currentAppUrl = data && data.appUrl ? data.appUrl : null;
        applyExternalDeploymentFallback();
        updateButtonState(active);
        updateToolbarStatus(active);
        updateAppLink();
        updateActionsModal();
        updateStatusBadge(data && data.message ? data.message : 'Ready to deploy', getStatusClass(data && data.status));
      })
      .fail(function() {
        active = false;
        currentDeploymentId = null;
        hasExistingApp = false;
        currentAppName = null;
        currentAppUrl = null;
        applyExternalDeploymentFallback();
        lastKnownStatus = 'failed';
        lastStatusMessage = 'Deploy status unavailable';
        updateButtonState(false);
        updateToolbarStatus(false);
        updateAppLink();
        updateActionsModal();
        updateStatusBadge('Deploy status unavailable', 'text-red-400');
      });
  }

  function triggerDeployFromActions() {
    closeActionsModal();

    if (active) {
      openDeployModal();
      return;
    }

    if (hasExistingApp) {
      showConfirm(
        'Update Deployed App',
        'Are you sure you want to update the app? This will overwrite the deployed version with the new one.',
        {
          confirmText: 'Update Deploy',
          confirmClass: 'bg-purple-600 hover:bg-purple-700'
        }
      ).then(function(confirmed) {
        if (confirmed) {
          startDeploy();
        }
      });
      return;
    }

    startDeploy();
  }

  function startDeploy() {
    if (!state.selectedProjectId) {
      showToast('No project selected', 'error');
      return;
    }

    if (active) {
      openDeployModal();
      return;
    }

    currentProjectId = state.selectedProjectId;
    currentDeploymentId = null;
    active = true;
    lastKnownStatus = 'deploying';
    lastStatusMessage = 'Starting deployment...';
    appLogsLoaded = false;
    resetOutput();
    appendOutput('[deploy] starting SuperEngineer deployment...\n');
    updateStatusBadge('Starting deployment...', 'text-yellow-400');
    updateButtonState(true);
    updateToolbarStatus(true);
    openDeployModal();

    api.startFlyDeploy(state.selectedProjectId, getExistingDeploymentPayload())
      .done(function(data) {
        currentDeploymentId = data.deploymentId || null;
        lastKnownStatus = data.status || 'deploying';
        lastStatusMessage = data.message || lastStatusMessage;
        hasExistingApp = !!data.hasExistingApp;
        currentAppName = data.appName || null;
        currentAppUrl = data.appUrl || null;
        postDeploymentStateToParent({
          appName: currentAppName,
          appUrl: currentAppUrl,
          lastDeploymentStatus: hasExistingApp ? 'deployed' : 'created',
          lastDeployedAt: null
        });
        updateAppLink();
        updateActionsModal();
        updateToolbarStatus(active);
        appendOutput('[deploy] app name: ' + data.appName + '\n');
        if (data.appUrl) {
          appendOutput('[deploy] app url: ' + data.appUrl + '\n');
        }
        appendOutput('[deploy] ' + (data.message || 'deployment started') + '\n');
        updateStatusBadge(data.message || 'Deployment started', getStatusClass(data.status));
      })
      .fail(function(xhr) {
        active = false;
        lastKnownStatus = 'failed';
        lastStatusMessage = getXhrErrorMessage(xhr);
        updateButtonState(false);
        updateToolbarStatus(false);
        updateActionsModal();
        showErrorToast(xhr, 'Failed to start SuperEngineer deployment');
        appendOutput('[deploy] failed to start deployment\n');
      });
  }

  function handleDeployOutput(data) {
    if (!belongsToCurrentDeployment(data)) {
      return;
    }

    if (!$('#modal-fly-deploy').hasClass('hidden')) {
      appendOutput(data.data || '');
    }
  }

  function handleDeployStatus(data) {
    if (!belongsToCurrentDeployment(data)) {
      return;
    }

    currentDeploymentId = data.deploymentId || currentDeploymentId;
    active = !!data.isActive;
    lastKnownStatus = data.status || lastKnownStatus;
    lastStatusMessage = data.message || lastStatusMessage;
    hasExistingApp = true;
    currentAppName = data.appName || currentAppName;
    currentAppUrl = data.appUrl || currentAppUrl;
    updateButtonState(active);
    updateToolbarStatus(active);
    updateAppLink();
    updateActionsModal();
    updateStatusBadge(data.message || 'Deployment update received', getStatusClass(data.status));

    if (data.appName) {
      $('#fly-deploy-app-name').text(data.appName);
    }

    if (Array.isArray(data.missingFiles) && data.missingFiles.length > 0) {
      appendOutput('[deploy] missing files: ' + data.missingFiles.join(', ') + '\n');
    }

    if (data.status === 'completed') {
      appLogsLoaded = false;
      postDeploymentStateToParent({
        appName: currentAppName,
        appUrl: currentAppUrl,
        lastDeploymentStatus: 'deployed',
        lastDeployedAt: data.completedAt || new Date().toISOString()
      });
      appendOutput('[deploy] deployment completed successfully\n');
      showToast('SuperEngineer deploy completed for ' + data.appName, 'success');
    } else if (data.status === 'failed') {
      appLogsLoaded = false;
      postDeploymentStateToParent({
        appName: currentAppName,
        appUrl: currentAppUrl,
        lastDeploymentStatus: 'failed',
        lastDeployedAt: data.completedAt || new Date().toISOString()
      });
      appendOutput('[deploy] deployment failed: ' + (data.message || 'unknown error') + '\n');
      showToast('SuperEngineer deploy failed', 'error');
    }
  }

  function belongsToCurrentDeployment(data) {
    if (!state.selectedProjectId || state.selectedProjectId !== currentProjectId) {
      return false;
    }

    if (!data || !data.deploymentId) {
      return true;
    }

    return !currentDeploymentId || data.deploymentId === currentDeploymentId;
  }

  function openDeployModal() {
    switchLogTab(activeLogTab || 'deploy');
    openModal('modal-fly-deploy');
  }

  function fixWithAi() {
    $('#btn-retry-fly-deploy').addClass('hidden');

    if (!sendDeployFixMessage) {
      showToast('AI fix action is not available', 'error');
      return;
    }

    showToast('Sending deployment logs to AI...', 'info');
    sendDeployFixMessage(buildDeployFixPrompt());
    $('#modal-fly-deploy').addClass('hidden');
  }

  function buildDeployFixPrompt() {
    var deployLogs = getLogText('#fly-deploy-output');
    var lines = [
      'Fix the SuperEngineer deployment for this project.',
      'Review the deployment config, Docker setup, build/start commands, and deployment behavior.',
      'Use the deployment logs below as debugging context.'
    ];

    if (currentAppName) {
      lines.push('Existing SuperEngineer app name: ' + currentAppName + '.');
    }

    if (lastStatusMessage) {
      lines.push('Latest deployment status: ' + lastStatusMessage + '.');
    }

    if (deployLogs) {
      lines.push('Deployment logs:\n```text\n' + deployLogs + '\n```');
    }

    lines.push('Keep deployment files in the project root, preserve the existing app name, fix the deployment issue, and make the next deploy succeed.');

    return lines.join(' ');
  }

  function getLogText(selector) {
    var $element = $(selector);

    if (!$element.length) {
      return '';
    }

    return String($element.text() || '').trim().slice(-12000);
  }

  function resetOutput() {
    $('#fly-deploy-output').text('');
    $('#fly-app-logs-output').text('');
    $('#fly-deploy-app-name').text(currentAppName || 'Pending');
    updateAppLink();
  }

  function switchLogTab(tabName) {
    activeLogTab = tabName === 'app' ? 'app' : 'deploy';

    $('#tab-fly-deploy-output')
      .toggleClass('toolbar-action-button-primary', activeLogTab === 'deploy');
    $('#tab-fly-app-logs')
      .toggleClass('toolbar-action-button-primary', activeLogTab === 'app');

    $('#fly-deploy-output').toggleClass('hidden', activeLogTab !== 'deploy');
    $('#fly-app-logs-output').toggleClass('hidden', activeLogTab !== 'app');

    if (activeLogTab === 'app') {
      loadAppLogs();
    }
  }

  function loadAppLogs(forceReload) {
    if (!state.selectedProjectId) {
      return;
    }

    if (!forceReload && appLogsLoaded) {
      return;
    }

    $('#fly-app-logs-output').text('Loading app logs...');

    api.getFlyAppLogs(state.selectedProjectId, {
      appName: currentAppName || (externalDeployment && externalDeployment.appName) || '',
      appUrl: currentAppUrl || (externalDeployment && externalDeployment.appUrl) || ''
    })
      .done(function(data) {
        appLogsLoaded = true;
        if (data.appName) {
          currentAppName = data.appName;
        }
        if (data.appUrl) {
          currentAppUrl = data.appUrl;
          updateAppLink();
          updateActionsModal();
        }
        $('#fly-app-logs-output').text(data.logs || 'No app logs available.');
      })
      .fail(function(xhr) {
        appLogsLoaded = false;
        $('#fly-app-logs-output').text('Failed to load app logs: ' + getXhrErrorMessage(xhr));
      });
  }

  function handleParentMessage(event) {
    var data = event.data || {};

    if (!data || data.type !== 'superweb_fly_deployment_state') {
      return;
    }

    if (!state || !state.selectedProjectId || data.projectId !== state.selectedProjectId) {
      return;
    }

    externalDeployment = normalizeDeployment(data.flyDeployment);
    externalProjectName = typeof data.projectName === 'string' ? data.projectName.trim() : '';
    applyExternalDeploymentFallback();
    updateButtonState(active);
    updateAppLink();
    updateActionsModal();
  }

  function normalizeDeployment(value) {
    if (!value || typeof value !== 'object' || !value.appName) {
      return null;
    }

    return {
      appName: String(value.appName || ''),
      appUrl: String(value.appUrl || ''),
      lastDeploymentStatus: String(value.lastDeploymentStatus || 'deployed'),
      lastDeployedAt: value.lastDeployedAt ? String(value.lastDeployedAt) : null
    };
  }

  function applyExternalDeploymentFallback() {
    if (!externalDeployment) {
      return;
    }

    if (!currentAppName) {
      currentAppName = externalDeployment.appName;
    }

    if (!currentAppUrl) {
      currentAppUrl = externalDeployment.appUrl;
    }

    hasExistingApp = !!(currentAppName || externalDeployment.appName);
  }

  function requestExternalDeploymentState() {
    if (!window.parent || window.parent === window || !state || !state.selectedProjectId) {
      return;
    }

    window.parent.postMessage({
      type: 'superengineer_fly_deployment_sync_request',
      source: 'superengineer',
      projectId: state.selectedProjectId
    }, '*');
  }

  function postDeploymentStateToParent(deployment) {
    externalDeployment = normalizeDeployment(deployment);

    if (!window.parent || window.parent === window || !state || !state.selectedProjectId || !externalDeployment) {
      return;
    }

    window.parent.postMessage({
      type: 'superengineer_fly_deployment_update',
      source: 'superengineer',
      projectId: state.selectedProjectId,
      flyDeployment: externalDeployment
    }, '*');
  }

  function getExistingDeploymentPayload() {
    var deployment = normalizeDeployment({
      appName: currentAppName || (externalDeployment && externalDeployment.appName),
      appUrl: currentAppUrl || (externalDeployment && externalDeployment.appUrl),
      lastDeploymentStatus: (externalDeployment && externalDeployment.lastDeploymentStatus) || 'deployed',
      lastDeployedAt: externalDeployment && externalDeployment.lastDeployedAt
    });

    var payload = {};

    if (deployment) {
      payload.existingDeployment = deployment;
    }

    if (externalProjectName) {
      payload.projectNameOverride = externalProjectName;
    }

    return payload;
  }

  function getXhrErrorMessage(xhr) {
    if (xhr && xhr.responseJSON && xhr.responseJSON.error) {
      return xhr.responseJSON.error;
    }

    return 'Unknown error';
  }

  function appendOutput(text) {
    var $output = $('#fly-deploy-output');

    if (!$output.length) {
      return;
    }

    $output.text($output.text() + String(text || ''));
    $output.scrollTop($output[0].scrollHeight);
  }

  function updateButtonState(isActive) {
    var $button = $('#btn-deploy-project');

    if (!$button.length) {
      return;
    }

    $button.prop('disabled', false);
    $button.toggleClass('opacity-60', false);
    $button.toggleClass('cursor-not-allowed', false);
    $button.html(isActive
      ? '<span class="inline-flex items-center justify-center gap-2"><svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle><path class="opacity-90" fill="currentColor" d="M22 12a10 10 0 00-10-10v3a7 7 0 017 7h3z"></path></svg><span>App is deploying</span></span>'
      : 'Deploy');
  }

  function updateToolbarStatus(isActive) {
    var $status = $('#deploy-toolbar-status');

    if (!$status.length) {
      return;
    }

    $status.addClass('hidden').removeClass('inline-flex');
  }

  function updateAppLink() {
    var $modalLink = $('#fly-deploy-app-link');
    var $modalEmpty = $('#fly-deploy-app-link-empty');
    var appUrl = currentAppUrl || '';

    $('#fly-deploy-app-name').text(currentAppName || 'Pending');

    if (appUrl) {
      $modalLink.removeClass('hidden').attr('href', appUrl).text(appUrl);
      $modalEmpty.addClass('hidden');
    } else {
      $modalLink.addClass('hidden').attr('href', '#').text('');
      $modalEmpty.removeClass('hidden');
    }
  }

  function updateActionsModal() {
    var appUrl = currentAppUrl || '';
    var appName = currentAppName || 'Not deployed yet';
    var actionLabel;
    var statusText;
    var $openApp = $('#btn-open-deployed-app');
    var $appLink = $('#fly-deploy-actions-app-link');
    var $emptyLink = $('#fly-deploy-actions-app-link-empty');
    var $actionButton = $('#btn-trigger-fly-deploy');

    if (active) {
      actionLabel = 'View Deploy';
      statusText = 'Deployment is running';
    } else if (hasExistingApp) {
      actionLabel = 'Update Deploy';
      statusText = 'Updates the current deployed app';
    } else {
      actionLabel = 'Deploy';
      statusText = 'Creates a new SuperEngineer app';
    }

    $('#fly-deploy-actions-app-name').text(appName);
    $('#fly-deploy-actions-status').text(statusText);
    $actionButton
      .removeClass('toolbar-action-button-primary bg-gray-700 hover:bg-gray-600')
      .addClass(active ? 'bg-gray-700 hover:bg-gray-600' : 'toolbar-action-button-primary')
      .html(active
        ? '<span class="inline-flex items-center justify-center gap-2"><svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle><path class="opacity-90" fill="currentColor" d="M22 12a10 10 0 00-10-10v3a7 7 0 017 7h3z"></path></svg><span>' + actionLabel + '</span></span>'
        : actionLabel);

    if (appUrl) {
      $openApp.removeClass('hidden').attr('href', appUrl);
      $appLink.removeClass('hidden').attr('href', appUrl).text(appUrl);
      $emptyLink.addClass('hidden');
    } else {
      $openApp.addClass('hidden').attr('href', '#');
      $appLink.addClass('hidden').attr('href', '#').text('');
      $emptyLink.removeClass('hidden');
    }
  }

  function updateStatusBadge(message, className) {
    var $badge = $('#fly-deploy-status');

    if (!$badge.length) {
      return;
    }

    $badge
      .removeClass('text-gray-400 text-yellow-400 text-green-400 text-red-400 text-blue-400')
      .addClass(className || 'text-gray-400')
      .text(message || 'Ready to deploy');

    updateRetryButton();
  }

  function getStatusClass(status) {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'validating':
      case 'creating_app':
      case 'deploying':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  }

  function updateRetryButton() {
    var $button = $('#btn-retry-fly-deploy');

    if (!$button.length) {
      return;
    }

    if (lastKnownStatus === 'failed') {
      $button
        .removeClass('hidden')
        .text('Fix with AI');
    } else {
      $button.addClass('hidden').text('Fix with AI');
    }
  }

  return {
    init: init,
    setupHandlers: setupHandlers,
    onProjectChanged: onProjectChanged,
    handleDeployOutput: handleDeployOutput,
    handleDeployStatus: handleDeployStatus,
    syncStatus: syncStatus,
    startDeploy: startDeploy
  };
}));
