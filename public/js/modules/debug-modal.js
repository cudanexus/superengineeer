/**
 * Debug Modal Module
 * Handles all debug modal functionality: process info, logs, Claude I/O, commands
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DebugModal = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies injected via init()
  var state, api, escapeHtml, showToast, openModal;
  var formatDateTime, formatLogTime, formatBytes;

  /**
   * Initialize the module with dependencies
   */
  function init(deps) {
    state = deps.state;
    api = deps.api;
    escapeHtml = deps.escapeHtml;
    showToast = deps.showToast;
    openModal = deps.openModal;
    formatDateTime = deps.formatDateTime;
    formatLogTime = deps.formatLogTime;
    formatBytes = deps.formatBytes;
  }

  function open() {
    state.debugPanelOpen = true;
    openModal('modal-debug');

    // Sync filter checkbox states
    Object.keys(state.debugLogFilters).forEach(function(key) {
      $('#log-filter-' + key).prop('checked', state.debugLogFilters[key]);
    });

    refresh();
    startAutoRefresh();
  }

  function close() {
    state.debugPanelOpen = false;
    state.debugExpandedLogs = {}; // Clear expanded state on close
    stopAutoRefresh();
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    state.debugRefreshInterval = setInterval(refresh, 2000);
  }

  function stopAutoRefresh() {
    if (state.debugRefreshInterval) {
      clearInterval(state.debugRefreshInterval);
      state.debugRefreshInterval = null;
    }
  }

  function refresh() {
    if (!state.selectedProjectId || !state.debugPanelOpen) return;

    api.getDebugInfo(state.selectedProjectId, 100)
      .done(function(data) {
        render(data);
      })
      .fail(function() {
        $('#debug-process-content').html('<div class="text-red-400">Failed to load debug info</div>');
      });
  }

  function render(data) {
    renderClaudeIOTab(data);
    renderProcessTab(data);
    renderCommandsTab(data);
    renderLogsTab(data);
    renderAllProcessesTab(data);
  }

  function renderClaudeIOTab(data) {
    var html = '';

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

        if (log.context.contentPreview) {
          html += '<div class="mt-1 text-gray-400 text-xs truncate">' + escapeHtml(log.context.contentPreview.substring(0, 150)) + '</div>';
        }

        html += '</div>';

        html += '<div class="debug-log-detail' + (isExpanded ? '' : ' hidden') + ' border-t border-gray-700 p-3 bg-gray-900/50">';
        html += '<div class="space-y-2">';

        if (log.context) {
          Object.keys(log.context).forEach(function(key) {
            if (key === 'direction') return;
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

  function renderProcessTab(data) {
    var html = '';

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

    html += renderLoopStateSection(data);
    html += renderMemorySection(data);

    $('#debug-process-content').html(html);
    updateBrowserMemory();
  }

  function renderLoopStateSection(data) {
    var html = '<div class="bg-gray-800 rounded-lg p-4 mt-4">';
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
    return html;
  }

  function renderMemorySection(data) {
    var html = '<div class="bg-gray-800 rounded-lg p-4 mt-4">';
    html += '<h4 class="text-gray-300 font-semibold mb-3 flex items-center gap-2">';
    html += '<svg class="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">';
    html += '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>';
    html += '</svg>Memory Usage</h4>';

    html += '<div class="space-y-3">';

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

    html += '<div class="bg-gray-900 rounded p-3">';
    html += '<div class="text-gray-400 text-xs font-semibold mb-2">Browser</div>';
    html += '<div id="debug-browser-memory"></div>';
    html += '</div>';

    html += '</div>';
    html += '</div>';

    return html;
  }

  function updateBrowserMemory() {
    var container = $('#debug-browser-memory');

    if (!container.length) return;

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

  function renderCommandsTab(data) {
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

  function renderLogsTab(data) {
    var html = '';

    var filteredLogs = (data.recentLogs || []).filter(function(log) {
      var isFrontend = log.context && log.context.type === 'frontend';

      if (isFrontend && !state.debugLogFilters.frontend) {
        return false;
      }

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

  function renderAllProcessesTab(data) {
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

  function getLevelClass(level) {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  }

  function setupHandlers() {
    $('#btn-toggle-debug').on('click', function() {
      open();
    });

    $('#btn-debug-refresh').on('click', function() {
      refresh();
    });

    $(document).on('click', '.debug-tab', function() {
      var $tab = $(this);
      var tabName = $tab.data('tab');

      $('.debug-tab').removeClass('active border-purple-500 text-white').addClass('border-transparent text-gray-400');
      $tab.addClass('active border-purple-500 text-white').removeClass('border-transparent text-gray-400');

      $('.debug-tab-content').addClass('hidden');
      $('#debug-tab-' + tabName).removeClass('hidden');
    });

    $(document).on('click', '.debug-log-item', function() {
      var $item = $(this);
      var $detail = $item.find('.debug-log-detail');
      var $chevron = $item.find('.debug-log-chevron');
      var logId = $item.data('log-id');

      if ($detail.length === 0) return;

      if (logId) {
        state.debugExpandedLogs[logId] = !state.debugExpandedLogs[logId];
      }

      $detail.toggleClass('hidden');
      $chevron.toggleClass('rotate-180');
    });

    $(document).on('change', '.log-filter-checkbox', function() {
      var filterId = $(this).attr('id');
      var filterName = filterId.replace('log-filter-', '');
      state.debugLogFilters[filterName] = $(this).is(':checked');

      if ($('#debug-tab-logs').is(':visible')) {
        refresh();
      }
    });
  }

  // Global function for copy button
  window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('Copied to clipboard', 'success');
    }).catch(function() {
      showToast('Failed to copy', 'error');
    });
  };

  return {
    init: init,
    open: open,
    close: close,
    refresh: refresh,
    setupHandlers: setupHandlers,
    stopAutoRefresh: stopAutoRefresh
  };
}));
