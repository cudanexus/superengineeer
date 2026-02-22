/**
 * MCP Settings Module
 * Handles MCP (Model Context Protocol) server configuration UI
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.McpSettingsModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var state = null;
  var escapeHtml = null;
  var showToast = null;
  var openModal = null;
  var closeModal = null;
  var closeAllModals = null;

  function init(deps) {
    state = deps.state;
    escapeHtml = deps.escapeHtml;
    showToast = deps.showToast;
    openModal = deps.openModal;
    closeModal = deps.closeModal;
    closeAllModals = deps.closeAllModals;

    setupHandlers();
  }

  function renderMcpServers() {
    var servers = state.settings?.mcp?.servers || [];
    var $container = $('#mcp-servers-list');

    if (servers.length === 0) {
      $container.html('<div class="text-gray-500 text-sm text-center py-4">No MCP servers configured. Click "Add Server" to create one.</div>');
      return;
    }

    var html = '';
    servers.forEach(function(server) {
      var statusClass = server.enabled ? 'bg-green-600' : 'bg-gray-600';
      var typeLabel = server.type === 'stdio' ? 'Local' : 'Remote';

      html += '<div class="mcp-server-item flex items-center justify-between p-3 glass-panel rounded" data-id="' + escapeHtml(server.id) + '">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-2 h-2 rounded-full ' + statusClass + '"></div>' +
          '<div>' +
            '<div class="flex items-center gap-2">' +
              '<span class="font-medium text-sm">' + escapeHtml(server.name) + '</span>' +
              '<span class="text-xs bg-gray-600 px-2 py-0.5 rounded">' + typeLabel + '</span>' +
            '</div>' +
            (server.description ? '<div class="text-xs text-gray-400">' + escapeHtml(server.description) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" class="btn-edit-mcp-server p-1.5 text-gray-400 hover:text-white" title="Edit">' +
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
          '</button>' +
          '<button type="button" class="btn-delete-mcp-server p-1.5 text-gray-400 hover:text-red-400" title="Delete">' +
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    });

    $container.html(html);
  }

  function openServerEditor(server) {
    var isNew = !server;

    $('#mcp-server-editor-title').text(isNew ? 'New MCP Server' : 'Edit MCP Server');
    $('#input-mcp-server-id').val(isNew ? generateId() : server.id);
    $('#input-mcp-server-name').val(isNew ? '' : server.name);
    $('#input-mcp-server-description').val(isNew ? '' : (server.description || ''));
    $('#input-mcp-server-type').val(isNew ? 'stdio' : server.type);
    $('#input-mcp-server-enabled').prop('checked', isNew ? true : server.enabled);
    $('#input-mcp-server-autoapprove').prop('checked', isNew ? true : (server.autoApproveTools !== false));

    // Type-specific fields
    if (server) {
      if (server.type === 'stdio') {
        $('#input-mcp-server-command').val(server.command || '');
        $('#input-mcp-server-args').val((server.args || []).join('\n'));
      } else {
        $('#input-mcp-server-url').val(server.url || '');
      }

      // Environment variables
      var envText = '';
      if (server.env) {
        for (var key in server.env) {
          envText += key + '=' + server.env[key] + '\n';
        }
      }
      $('#input-mcp-server-env').val(envText.trim());
    } else {
      // Clear fields for new server
      $('#input-mcp-server-command').val('');
      $('#input-mcp-server-args').val('');
      $('#input-mcp-server-url').val('');
      $('#input-mcp-server-env').val('');
    }

    updateServerTypeFields();
    openModal('modal-mcp-server-editor');
    $('#input-mcp-server-name').focus();
  }

  function updateServerTypeFields() {
    var type = $('#input-mcp-server-type').val();

    if (type === 'stdio') {
      $('#mcp-stdio-fields').removeClass('hidden');
      $('#mcp-http-fields').addClass('hidden');
      $('#input-mcp-server-command').prop('required', true);
      $('#input-mcp-server-url').prop('required', false);
    } else {
      $('#mcp-stdio-fields').addClass('hidden');
      $('#mcp-http-fields').removeClass('hidden');
      $('#input-mcp-server-command').prop('required', false);
      $('#input-mcp-server-url').prop('required', true);
    }
  }

  function saveServer() {
    var id = $('#input-mcp-server-id').val();
    var name = $('#input-mcp-server-name').val().trim();
    var description = $('#input-mcp-server-description').val().trim();
    var type = $('#input-mcp-server-type').val();
    var enabled = $('#input-mcp-server-enabled').is(':checked');
    var autoApproveTools = $('#input-mcp-server-autoapprove').is(':checked');

    if (!name) {
      showToast('Server name is required', 'error');
      return;
    }

    var server = {
      id: id,
      name: name,
      type: type,
      enabled: enabled,
      autoApproveTools: autoApproveTools
    };

    if (description) {
      server.description = description;
    }

    // Type-specific fields
    if (type === 'stdio') {
      var command = $('#input-mcp-server-command').val().trim();
      if (!command) {
        showToast('Command is required for stdio servers', 'error');
        return;
      }
      server.command = command;

      var argsText = $('#input-mcp-server-args').val().trim();
      if (argsText) {
        server.args = argsText.split('\n').map(function(arg) { return arg.trim(); }).filter(Boolean);
      }
    } else {
      var url = $('#input-mcp-server-url').val().trim();
      if (!url) {
        showToast('URL is required for http servers', 'error');
        return;
      }
      server.url = url;
    }

    // Environment variables
    var envText = $('#input-mcp-server-env').val().trim();
    if (envText) {
      var env = {};
      envText.split('\n').forEach(function(line) {
        var trimmed = line.trim();
        if (trimmed && trimmed.includes('=')) {
          var parts = trimmed.split('=');
          var key = parts[0].trim();
          var value = parts.slice(1).join('=').trim();
          if (key) {
            env[key] = value;
          }
        }
      });
      if (Object.keys(env).length > 0) {
        server.env = env;
      }
    }

    // Update servers list
    var servers = state.settings?.mcp?.servers || [];
    var existingIndex = servers.findIndex(function(s) { return s.id === id; });

    if (existingIndex >= 0) {
      servers[existingIndex] = server;
    } else {
      servers.push(server);
    }

    // Update state (parent form will save)
    if (!state.settings.mcp) {
      state.settings.mcp = { enabled: true, servers: [] };
    }
    state.settings.mcp.servers = servers;

    closeModal('modal-mcp-server-editor');
    renderMcpServers();
    showToast('MCP server saved - Remember to save settings!', 'warning');

    // Emit change event
    $(document).trigger('mcp-servers-changed');
  }

  function deleteServer(serverId) {
    var servers = state.settings?.mcp?.servers || [];
    var server = servers.find(function(s) { return s.id === serverId; });

    if (!server || !confirm('Delete MCP server "' + server.name + '"?')) {
      return;
    }

    state.settings.mcp.servers = servers.filter(function(s) { return s.id !== serverId; });
    renderMcpServers();
    showToast('MCP server deleted - Remember to save settings!', 'warning');

    // Emit change event
    $(document).trigger('mcp-servers-changed');
  }

  function generateId() {
    return 'mcp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  function setupHandlers() {
    // Add server button
    $(document).on('click', '#btn-add-mcp-server', function() {
      openServerEditor(null);
    });

    // Edit server button
    $(document).on('click', '.btn-edit-mcp-server', function(e) {
      e.stopPropagation();
      var serverId = $(this).closest('.mcp-server-item').data('id');
      var servers = state.settings?.mcp?.servers || [];
      var server = servers.find(function(s) { return s.id === serverId; });

      if (server) {
        openServerEditor(server);
      }
    });

    // Delete server button
    $(document).on('click', '.btn-delete-mcp-server', function(e) {
      e.stopPropagation();
      var serverId = $(this).closest('.mcp-server-item').data('id');
      deleteServer(serverId);
    });

    // Server type change
    $('#input-mcp-server-type').on('change', function() {
      updateServerTypeFields();
    });

    // Server editor form submit
    $('#form-mcp-server-editor').on('submit', function(e) {
      e.preventDefault();
      saveServer();
    });
  }

  function loadSettings() {
    renderMcpServers();
  }

  return {
    init: init,
    renderMcpServers: renderMcpServers,
    loadSettings: loadSettings
  };
}));