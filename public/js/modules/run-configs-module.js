/**
 * Run Configurations Module
 * Manages run configuration list, editor modal, xterm.js output, and WebSocket events
 */
(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RunConfigsModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies (injected via init)
  var state = null;
  var api = null;
  var showToast = null;
  var showErrorToast = null;
  var escapeHtml = null;

  // Module state
  var configs = [];
  var terminals = {};
  var fitAddons = {};
  var activeConfigId = null;
  var resizeObserver = null;

  // =========================================================================
  // Initialization
  // =========================================================================

  function init(deps) {
    state = deps.state;
    api = deps.api;
    showToast = deps.showToast;
    showErrorToast = deps.showErrorToast;
    escapeHtml = deps.escapeHtml || function(s) { return s; };
  }

  function setupHandlers() {
    // Config list actions (delegated)
    $(document).on('click', '#btn-add-run-config', handleAddClick);
    $(document).on('click', '#btn-import-run-config', handleImportClick);
    $(document).on('click', '.rc-start-btn', handleStartClick);
    $(document).on('click', '.rc-stop-btn', handleStopClick);
    $(document).on('click', '.rc-edit-btn', handleEditClick);
    $(document).on('click', '.rc-delete-btn', handleDeleteClick);
    $(document).on('click', '.rc-output-btn', handleOutputClick);

    // Editor modal
    $(document).on('click', '#btn-save-run-config', handleSaveConfig);
    $(document).on('click', '#btn-cancel-run-config', closeEditorModal);
    $(document).on('click', '#modal-run-config-editor .modal-close', closeEditorModal);

    // Import modal
    $(document).on('click', '#btn-confirm-import-rc', handleConfirmImport);
    $(document).on('click', '#btn-cancel-import-rc', closeImportModal);
    $(document).on('click', '#modal-run-config-import .modal-close', closeImportModal);
    $(document).on('change', '.rc-import-check', updateImportButton);

    // Env vars dynamic rows
    $(document).on('click', '#btn-add-env-var', addEnvVarRow);
    $(document).on('click', '.rc-remove-env', function() {
      $(this).closest('.rc-env-row').remove();
    });

    // Output tabs
    $(document).on('click', '.rc-output-tab', handleOutputTabClick);

    // Clear output
    $(document).on('click', '#btn-clear-rc-output', handleClearOutput);

    // Setup resize observer for terminal fitting
    setupResizeObserver();
  }

  // =========================================================================
  // Tab Lifecycle
  // =========================================================================

  function onTabActivated() {
    if (state.selectedProjectId) {
      loadConfigs(state.selectedProjectId);
    }
  }

  function onProjectChanged() {
    disposeAllTerminals();
    configs = [];
    activeConfigId = null;
    renderConfigList();
    renderOutputTabs();

    if (state.activeTab === 'run-configs' && state.selectedProjectId) {
      loadConfigs(state.selectedProjectId);
    }
  }

  // =========================================================================
  // Data Loading
  // =========================================================================

  function loadConfigs(projectId) {
    api.getRunConfigs(projectId)
      .done(function(data) {
        configs = data;
        renderConfigList();
        loadAllStatuses(projectId);
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to load run configurations');
      });
  }

  function loadAllStatuses(projectId) {
    configs.forEach(function(config) {
      api.getRunConfigStatus(projectId, config.id)
        .done(function(status) {
          updateConfigStatus(config.id, status);
        });
    });
  }

  // =========================================================================
  // Rendering
  // =========================================================================

  function renderConfigList() {
    var $list = $('#rc-config-list');

    if (!$list.length) return;

    if (configs.length === 0) {
      $list.html(
        '<div class="text-gray-500 text-sm text-center py-8">' +
          'No run configurations yet. Click "Add" to create one.' +
        '</div>'
      );
      return;
    }

    var html = '';

    configs.forEach(function(config) {
      html += renderConfigCard(config);
    });

    $list.html(html);
  }

  function renderConfigCard(config) {
    var statusClass = 'bg-gray-600';
    var statusText = 'stopped';
    var $card = $('#rc-card-' + config.id);
    var currentState = $card.length ? $card.data('state') : 'stopped';

    if (currentState === 'running') {
      statusClass = 'bg-green-600';
      statusText = 'running';
    } else if (currentState === 'errored') {
      statusClass = 'bg-red-600';
      statusText = 'errored';
    } else if (currentState === 'starting') {
      statusClass = 'bg-yellow-600';
      statusText = 'starting';
    }

    var cmdPreview = escapeHtml(config.command);

    if (config.args && config.args.length > 0) {
      cmdPreview += ' ' + escapeHtml(config.args.join(' '));
    }

    return '<div id="rc-card-' + config.id + '" class="rc-card bg-gray-700/50 rounded p-3 flex items-center justify-between" data-config-id="' + config.id + '" data-state="' + currentState + '">' +
      '<div class="flex-1 min-w-0">' +
        '<div class="flex items-center gap-2">' +
          '<span class="font-medium text-sm text-white truncate">' + escapeHtml(config.name) + '</span>' +
          '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ' + statusClass + ' text-white">' + statusText + '</span>' +
        '</div>' +
        '<div class="text-xs text-gray-400 mt-1 truncate font-mono">' + cmdPreview + '</div>' +
      '</div>' +
      '<div class="flex items-center gap-1 ml-2 flex-shrink-0">' +
        (currentState === 'running'
          ? '<button class="rc-stop-btn p-1 text-red-400 hover:text-red-300" data-id="' + config.id + '" title="Stop">' +
              '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" stroke-width="2"/></svg>' +
            '</button>'
          : '<button class="rc-start-btn p-1 text-green-400 hover:text-green-300" data-id="' + config.id + '" title="Start">' +
              '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>' +
            '</button>') +
        '<button class="rc-output-btn p-1 text-gray-400 hover:text-gray-200" data-id="' + config.id + '" title="View Output">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>' +
        '</button>' +
        '<button class="rc-edit-btn p-1 text-gray-400 hover:text-gray-200" data-id="' + config.id + '" title="Edit">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
        '</button>' +
        '<button class="rc-delete-btn p-1 text-gray-400 hover:text-red-400" data-id="' + config.id + '" title="Delete">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>';
  }

  function renderOutputTabs() {
    var $bar = $('#rc-output-tabs');
    var $container = $('#rc-terminal-container');

    if (!$bar.length) return;

    if (configs.length === 0) {
      $bar.html('');
      $container.html('<div class="text-gray-500 text-sm text-center py-8">No configurations to show output for.</div>');
      return;
    }

    var html = '';

    configs.forEach(function(config) {
      var isActive = config.id === activeConfigId;
      html += '<button class="rc-output-tab px-3 py-1.5 text-xs rounded-t ' +
        (isActive ? 'bg-gray-900 text-white border-b-2 border-purple-500' : 'bg-gray-700 text-gray-400 hover:text-gray-200') +
        '" data-id="' + config.id + '">' + escapeHtml(config.name) + '</button>';
    });

    $bar.html(html);
    showTerminalForConfig(activeConfigId);
  }

  // =========================================================================
  // Terminal Management
  // =========================================================================

  function getOrCreateTerminal(configId) {
    if (terminals[configId]) {
      return terminals[configId];
    }

    var containerId = 'rc-term-' + configId;
    var $container = $('#rc-terminal-container');
    var $termDiv = $('<div id="' + containerId + '" class="rc-term-instance h-full" style="display:none;"></div>');
    $container.append($termDiv);

    var terminal = new window.Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#111827',
        foreground: '#e5e7eb',
        cursor: '#a78bfa',
        selectionBackground: '#4c1d95',
        black: '#1f2937',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e5e7eb',
        brightBlack: '#6b7280',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fde047',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f9fafb',
      },
      scrollback: 10000,
    });

    var fitAddon = null;

    if (window.FitAddon) {
      fitAddon = new window.FitAddon.FitAddon();
      terminal.loadAddon(fitAddon);
      fitAddons[configId] = fitAddon;
    }

    terminal.open($termDiv[0]);

    if (fitAddon) {
      try { fitAddon.fit(); } catch (_e) { /* ignore */ }
    }

    terminals[configId] = terminal;
    return terminal;
  }

  function showTerminalForConfig(configId) {
    // Hide all terminal instances
    $('.rc-term-instance').hide();

    if (!configId) return;

    getOrCreateTerminal(configId);
    var $termDiv = $('#rc-term-' + configId);
    $termDiv.show();

    if (fitAddons[configId]) {
      try { fitAddons[configId].fit(); } catch (_e) { /* ignore */ }
    }
  }

  function disposeAllTerminals() {
    Object.keys(terminals).forEach(function(id) {
      try { terminals[id].dispose(); } catch (_e) { /* ignore */ }
    });
    terminals = {};
    fitAddons = {};
    $('.rc-term-instance').remove();
  }

  function setupResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;

    resizeObserver = new ResizeObserver(function() {
      if (activeConfigId && fitAddons[activeConfigId]) {
        try { fitAddons[activeConfigId].fit(); } catch (_e) { /* ignore */ }
      }
    });

    // Observe once the container exists
    setTimeout(function() {
      var container = document.getElementById('rc-terminal-container');

      if (container) {
        resizeObserver.observe(container);
      }
    }, 500);
  }

  // =========================================================================
  // Status Updates
  // =========================================================================

  function updateConfigStatus(configId, status) {
    var $card = $('#rc-card-' + configId);

    if (!$card.length) return;

    $card.data('state', status.state);

    // Re-render card
    var config = configs.find(function(c) { return c.id === configId; });

    if (config) {
      $card.replaceWith(renderConfigCard(config));
      // Re-set the state data attribute after replacement
      $('#rc-card-' + configId).data('state', status.state);
    }
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================

  function handleAddClick() {
    openEditorModal(null);
  }

  function handleStartClick() {
    var configId = $(this).data('id');

    if (!state.selectedProjectId) return;

    api.startRunConfig(state.selectedProjectId, configId)
      .done(function(status) {
        updateConfigStatus(configId, status);
        activeConfigId = configId;
        renderOutputTabs();
        showToast('Run config started', 'success');
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to start');
      });
  }

  function handleStopClick() {
    var configId = $(this).data('id');

    if (!state.selectedProjectId) return;

    api.stopRunConfig(state.selectedProjectId, configId)
      .done(function() {
        updateConfigStatus(configId, { state: 'stopped' });
        showToast('Run config stopped', 'success');
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to stop');
      });
  }

  function handleEditClick() {
    var configId = $(this).data('id');
    var config = configs.find(function(c) { return c.id === configId; });

    if (config) {
      openEditorModal(config);
    }
  }

  function handleDeleteClick() {
    var configId = $(this).data('id');
    var config = configs.find(function(c) { return c.id === configId; });

    if (!config || !state.selectedProjectId) return;

    if (!confirm('Delete run configuration "' + config.name + '"?')) return;

    api.deleteRunConfig(state.selectedProjectId, configId)
      .done(function() {
        configs = configs.filter(function(c) { return c.id !== configId; });
        renderConfigList();
        renderOutputTabs();
        showToast('Deleted', 'success');
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to delete');
      });
  }

  function handleOutputClick() {
    var configId = $(this).data('id');
    activeConfigId = configId;
    renderOutputTabs();
  }

  function handleOutputTabClick() {
    var configId = $(this).data('id');
    activeConfigId = configId;
    renderOutputTabs();
  }

  function handleClearOutput() {
    if (!activeConfigId || !terminals[activeConfigId]) return;
    terminals[activeConfigId].clear();
  }

  // =========================================================================
  // Editor Modal
  // =========================================================================

  function openEditorModal(config) {
    var isEdit = !!config;
    $('#rc-editor-title').text(isEdit ? 'Edit Run Configuration' : 'New Run Configuration');
    $('#rc-editor-config-id').val(config ? config.id : '');
    $('#input-rc-name').val(config ? config.name : '');
    $('#input-rc-command').val(config ? config.command : '');
    $('#input-rc-args').val(config ? (config.args || []).join(' ') : '');
    $('#input-rc-cwd').val(config ? config.cwd : '.');
    $('#input-rc-shell').val(config ? (config.shell || '') : '');
    $('#input-rc-auto-restart').prop('checked', config ? config.autoRestart : false);
    $('#input-rc-restart-delay').val(config ? config.autoRestartDelay : 1000);
    $('#input-rc-restart-max').val(config ? config.autoRestartMaxRetries : 5);

    // Pre-launch dropdown
    renderPreLaunchDropdown(config);

    // Env vars
    var $envContainer = $('#rc-env-vars');
    $envContainer.empty();

    if (config && config.env) {
      Object.keys(config.env).forEach(function(key) {
        addEnvVarRow(null, key, config.env[key]);
      });
    }

    $('#modal-run-config-editor').removeClass('hidden');
  }

  function closeEditorModal() {
    $('#modal-run-config-editor').addClass('hidden');
  }

  function renderPreLaunchDropdown(currentConfig) {
    var $select = $('#input-rc-prelaunch');
    $select.empty();
    $select.append('<option value="">None</option>');

    configs.forEach(function(c) {
      if (currentConfig && c.id === currentConfig.id) return;
      var selected = currentConfig && currentConfig.preLaunchConfigId === c.id ? ' selected' : '';
      $select.append('<option value="' + c.id + '"' + selected + '>' + escapeHtml(c.name) + '</option>');
    });
  }

  function addEnvVarRow(_event, key, value) {
    var $container = $('#rc-env-vars');
    var html = '<div class="rc-env-row flex items-center gap-2 mb-1">' +
      '<input type="text" class="rc-env-key bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm w-1/3" placeholder="KEY" value="' + (key || '') + '">' +
      '<input type="text" class="rc-env-val bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm flex-1" placeholder="value" value="' + (value || '') + '">' +
      '<button class="rc-remove-env text-red-400 hover:text-red-300 text-sm px-1">&times;</button>' +
    '</div>';
    $container.append(html);
  }

  function handleSaveConfig() {
    var configId = $('#rc-editor-config-id').val();
    var isEdit = !!configId;

    var argsStr = $('#input-rc-args').val().trim();
    var args = argsStr ? argsStr.split(/\s+/) : [];

    // Collect env vars
    var env = {};
    $('#rc-env-vars .rc-env-row').each(function() {
      var k = $(this).find('.rc-env-key').val().trim();
      var v = $(this).find('.rc-env-val').val();

      if (k) {
        env[k] = v || '';
      }
    });

    var preLaunch = $('#input-rc-prelaunch').val() || null;
    var shell = $('#input-rc-shell').val().trim() || null;

    var data = {
      name: $('#input-rc-name').val().trim(),
      command: $('#input-rc-command').val().trim(),
      args: args,
      cwd: $('#input-rc-cwd').val().trim() || '.',
      env: env,
      shell: shell,
      autoRestart: $('#input-rc-auto-restart').is(':checked'),
      autoRestartDelay: parseInt($('#input-rc-restart-delay').val(), 10) || 1000,
      autoRestartMaxRetries: parseInt($('#input-rc-restart-max').val(), 10) || 5,
      preLaunchConfigId: preLaunch,
    };

    if (!data.name || !data.command) {
      showToast('Name and command are required', 'error');
      return;
    }

    if (!state.selectedProjectId) return;

    var promise = isEdit
      ? api.updateRunConfig(state.selectedProjectId, configId, data)
      : api.createRunConfig(state.selectedProjectId, data);

    promise
      .done(function() {
        closeEditorModal();
        loadConfigs(state.selectedProjectId);
        showToast(isEdit ? 'Updated' : 'Created', 'success');
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to save');
      });
  }

  // =========================================================================
  // WebSocket Handlers
  // =========================================================================

  function handleOutput(data) {
    if (!data || !data.configId) return;

    var terminal = getOrCreateTerminal(data.configId);
    terminal.write(data.data);

    // Auto-switch to this config's output
    if (!activeConfigId) {
      activeConfigId = data.configId;
      renderOutputTabs();
    }
  }

  function handleStatusChange(data) {
    if (!data || !data.configId || !data.status) return;
    updateConfigStatus(data.configId, data.status);
  }

  // =========================================================================
  // Import
  // =========================================================================

  function handleImportClick() {
    if (!state.selectedProjectId) return;

    var $modal = $('#modal-run-config-import');
    var $body = $('#rc-import-body');

    $body.html('<div class="text-gray-500 text-sm text-center py-4">Scanning project files...</div>');
    $('#btn-confirm-import-rc').addClass('hidden');
    $modal.removeClass('hidden');

    api.getImportableRunConfigs(state.selectedProjectId)
      .done(function(result) {
        renderImportResults(result);
      })
      .fail(function(xhr) {
        $body.html(
          '<div class="text-red-400 text-sm text-center py-4">Failed to scan project files.</div>'
        );
        showErrorToast(xhr, 'Failed to scan for importable configs');
      });
  }

  function renderImportResults(result) {
    var $body = $('#rc-import-body');
    var importable = result.importable || [];

    if (importable.length === 0) {
      $body.html(
        '<div class="text-gray-500 text-sm text-center py-4">' +
          'No importable configurations found.<br>' +
          '<span class="text-xs">Supported: package.json, Cargo.toml, go.mod, Makefile, pyproject.toml</span>' +
        '</div>'
      );
      return;
    }

    var existingNames = configs.map(function(c) { return c.name.toLowerCase(); });
    var html = '';

    importable.forEach(function(group) {
      html += '<div class="mb-3">';
      html += '<div class="text-xs text-purple-400 font-medium mb-1">' +
        escapeHtml(group.source) +
        ' <span class="text-gray-500">(' + escapeHtml(group.sourceFile) + ')</span>' +
      '</div>';

      group.configs.forEach(function(cfg, idx) {
        var isDuplicate = existingNames.indexOf(cfg.name.toLowerCase()) !== -1;
        var checkId = 'rc-import-' + group.source.replace(/\./g, '-') + '-' + idx;
        var argsStr = cfg.args ? cfg.args.join(' ') : '';

        html += '<label class="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-gray-700 cursor-pointer">';
        html += '<input type="checkbox" class="rc-import-check mt-0.5 rounded bg-gray-700 border-gray-600 text-purple-500"' +
          ' data-source="' + escapeHtml(group.source) + '"' +
          ' data-index="' + idx + '"' +
          ' id="' + checkId + '"' +
          (isDuplicate ? ' disabled' : '') + '>';
        html += '<div class="flex-1 min-w-0">';
        html += '<div class="text-sm text-gray-200' +
          (isDuplicate ? ' line-through opacity-50' : '') + '">' +
          escapeHtml(cfg.name) + '</div>';
        html += '<div class="text-xs text-gray-500 truncate">' +
          escapeHtml(cfg.command + (argsStr ? ' ' + argsStr : '')) + '</div>';

        if (isDuplicate) {
          html += '<div class="text-xs text-yellow-500">Already exists</div>';
        }

        html += '</div></label>';
      });

      html += '</div>';
    });

    $body.html(html);

    // Store import data for later
    $body.data('importable', importable);
  }

  function updateImportButton() {
    var checkedCount = $('.rc-import-check:checked').length;
    var $btn = $('#btn-confirm-import-rc');

    if (checkedCount > 0) {
      $btn.removeClass('hidden').text('Import ' + checkedCount + ' Selected');
    } else {
      $btn.addClass('hidden');
    }
  }

  function handleConfirmImport() {
    if (!state.selectedProjectId) return;

    var importable = $('#rc-import-body').data('importable') || [];
    var toImport = [];

    $('.rc-import-check:checked').each(function() {
      var source = $(this).data('source');
      var idx = $(this).data('index');
      var group = importable.find(function(g) { return g.source === source; });

      if (group && group.configs[idx]) {
        toImport.push(group.configs[idx]);
      }
    });

    if (toImport.length === 0) return;

    var completed = 0;
    var failed = 0;

    $('#btn-confirm-import-rc').prop('disabled', true).text('Importing...');

    toImport.forEach(function(cfg) {
      api.createRunConfig(state.selectedProjectId, cfg)
        .done(function() { completed++; })
        .fail(function() { failed++; })
        .always(function() {
          if (completed + failed >= toImport.length) {
            finishImport(completed, failed);
          }
        });
    });
  }

  function finishImport(completed, failed) {
    closeImportModal();

    if (completed > 0) {
      showToast('Imported ' + completed + ' configuration(s)', 'success');
    }

    if (failed > 0) {
      showToast(failed + ' import(s) failed', 'error');
    }

    if (state.selectedProjectId) {
      loadConfigs(state.selectedProjectId);
    }
  }

  function closeImportModal() {
    $('#modal-run-config-import').addClass('hidden');
    $('#btn-confirm-import-rc').prop('disabled', false).addClass('hidden');
  }

  // =========================================================================
  // Public API
  // =========================================================================

  return {
    init: init,
    setupHandlers: setupHandlers,
    onTabActivated: onTabActivated,
    onProjectChanged: onProjectChanged,
    handleOutput: handleOutput,
    handleStatusChange: handleStatusChange,
  };
}));
