/**
 * MCP Project Module
 * Handles per-project MCP server configuration
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.McpProjectModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var state = null;
  var api = null;
  var escapeHtml = null;
  var showToast = null;
  var openModal = null;
  var closeAllModals = null;
  var appendMessage = null;

  var currentProjectId = null;
  var currentProjectName = null;
  var projectOverrides = null;
  var globalServers = [];
  var isSaving = false;

  function init(deps) {
    state = deps.state;
    api = deps.api;
    escapeHtml = deps.escapeHtml;
    showToast = deps.showToast;
    openModal = deps.openModal;
    closeAllModals = deps.closeAllModals;
    appendMessage = deps.appendMessage;

    setupHandlers();
  }

  function openProjectMcpModal(projectId, projectName) {
    currentProjectId = projectId;
    currentProjectName = projectName;

    $('#project-mcp-name').text(projectName);
    $('#btn-save-project-mcp').prop('disabled', false);

    // Load global MCP servers
    if (state.settings && state.settings.mcp) {
      globalServers = state.settings.mcp.servers || [];
    } else {
      globalServers = [];
    }

    // Check if MCP is globally disabled
    var mcpEnabled = state.settings?.mcp?.enabled !== false;
    if (!mcpEnabled) {
      $('#project-mcp-disabled-warning').removeClass('hidden');
      $('#project-mcp-servers-list').addClass('opacity-50');
    } else {
      $('#project-mcp-disabled-warning').addClass('hidden');
      $('#project-mcp-servers-list').removeClass('opacity-50');
    }

    // Load project MCP overrides
    loadProjectMcpOverrides();
  }

  function loadProjectMcpOverrides() {
    api.getProjectMcpOverrides(currentProjectId)
      .done(function(overrides) {
        projectOverrides = overrides;
        renderMcpServers();
        openModal('modal-project-mcp-servers');
      })
      .fail(function(xhr) {
        showToast('Failed to load MCP settings: ' + (xhr.responseJSON?.error || 'Unknown error'), 'error');
      });
  }

  function renderMcpServers() {
    var $container = $('#project-mcp-servers-list');

    if (globalServers.length === 0) {
      $container.html('<div class="text-gray-400 text-sm text-center py-8">No MCP servers configured. Add servers in Settings → Advanced.</div>');
      return;
    }

    var html = '';
    var hasOverrides = projectOverrides && projectOverrides.enabled;

    globalServers.forEach(function(server) {
      var isEnabled = hasOverrides
        ? (projectOverrides.serverOverrides[server.id]?.enabled === true)
        : false;
      var typeLabel = server.type === 'stdio' ? 'Local' : 'Remote';
      var description = server.type === 'stdio'
        ? (server.command || '')
        : (server.url || '');

      html += '<div class="flex items-center justify-between p-3 bg-gray-700 rounded" data-server-id="' + escapeHtml(server.id) + '">' +
        '<div class="flex items-center gap-3 flex-1">' +
          '<div class="w-2 h-2 rounded-full ' + (server.enabled ? 'bg-green-600' : 'bg-gray-600') + '"></div>' +
          '<div class="flex-1">' +
            '<div class="flex items-center gap-2">' +
              '<span class="font-medium text-sm">' + escapeHtml(server.name) + '</span>' +
              '<span class="text-xs bg-gray-600 px-2 py-0.5 rounded">' + typeLabel + '</span>' +
              (!server.enabled ? '<span class="text-xs bg-red-600/20 text-red-400 px-2 py-0.5 rounded">Disabled globally</span>' : '') +
            '</div>' +
            (server.description ? '<div class="text-xs text-gray-400">' + escapeHtml(server.description) + '</div>' : '') +
            (description ? '<div class="text-xs text-gray-500 font-mono truncate">' + escapeHtml(description) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="flex items-center">' +
          '<label class="relative inline-flex items-center cursor-pointer">' +
            '<input type="checkbox" class="sr-only peer project-mcp-toggle" data-server-id="' + escapeHtml(server.id) + '"' +
              (isEnabled ? ' checked' : '') +
              (!server.enabled ? ' disabled' : '') + '>' +
            '<div class="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>' +
          '</label>' +
        '</div>' +
      '</div>';
    });

    $container.html(html);
  }

  function saveProjectMcpOverrides() {
    if (isSaving) return;

    isSaving = true;
    $('#btn-save-project-mcp').prop('disabled', true).text('Saving...');

    // Collect enabled servers
    var serverOverrides = {};
    $('.project-mcp-toggle').each(function() {
      var $toggle = $(this);
      var serverId = $toggle.data('server-id');
      serverOverrides[serverId] = {
        enabled: $toggle.is(':checked')
      };
    });

    // Always set enabled: true when saving explicit overrides
    var overrides = {
      enabled: true,  // This means "use project overrides" not "any server enabled"
      serverOverrides: serverOverrides
    };

    api.updateProjectMcpOverrides(currentProjectId, overrides)
      .done(function(response) {
        closeAllModals();
        showToast('MCP settings saved', 'success');

        if (response.agentRestarted) {
          // Add system message about restart
          appendMessage(currentProjectId, {
            type: 'system',
            content: 'Agent restarted to apply MCP configuration changes',
            timestamp: new Date().toISOString()
          });
        }
      })
      .fail(function(xhr) {
        showToast('Failed to save MCP settings: ' + (xhr.responseJSON?.error || 'Unknown error'), 'error');
      })
      .always(function() {
        isSaving = false;
        $('#btn-save-project-mcp').prop('disabled', false).text('Save');
      });
  }

  function clearProjectOverrides() {
    if (!currentProjectId) return;

    if (!confirm('Reset to global MCP server settings? This will remove all project-specific configurations.')) {
      return;
    }

    // Disable buttons while clearing
    $('#btn-save-project-mcp').prop('disabled', true);

    // Send request to clear overrides
    api.updateProjectMcpOverrides(currentProjectId, {
      enabled: false,
      serverOverrides: {}
    })
    .done(function() {
      showToast('Reset to global MCP defaults', 'success');
      projectOverrides = null;
      renderMcpServers();
    })
    .fail(function(xhr) {
      showToast('Failed to reset MCP settings: ' + (xhr.responseJSON?.error || 'Unknown error'), 'error');
    })
    .always(function() {
      $('#btn-save-project-mcp').prop('disabled', false);
    });
  }

  function setupHandlers() {
    // Save button handler
    $('#btn-save-project-mcp').on('click', function() {
      saveProjectMcpOverrides();
    });

    // Toggle change handler
    $(document).on('change', '.project-mcp-toggle', function() {
      // Enable save button when changes are made
      $('#btn-save-project-mcp').prop('disabled', false);
    });
  }

  return {
    init: init,
    openProjectMcpModal: openProjectMcpModal,
    clearProjectOverrides: clearProjectOverrides
  };
}));