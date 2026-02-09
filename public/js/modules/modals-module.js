/**
 * Modals Module
 * Handles Claude files modal, context usage modal, and optimizations modal
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ModalsModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies injected via init()
  var state = null;
  var api = null;
  var escapeHtml = null;
  var showToast = null;
  var showErrorToast = null;
  var openModal = null;
  var closeModal = null;
  var switchTab = null;
  var Formatters = null;
  var FileBrowser = null;
  var marked = null;
  var hljs = null;
  var findProjectById = null;

  function init(deps) {
    state = deps.state;
    api = deps.api;
    escapeHtml = deps.escapeHtml;
    showToast = deps.showToast;
    showErrorToast = deps.showErrorToast;
    openModal = deps.openModal;
    closeModal = deps.closeModal;
    switchTab = deps.switchTab;
    Formatters = deps.Formatters;
    FileBrowser = deps.FileBrowser;
    marked = deps.marked;
    hljs = deps.hljs;
    findProjectById = deps.findProjectById;
  }

  // ===== Context Usage Modal =====

  function openContextUsageModal() {
    var $content = $('#context-usage-content');
    $content.html('<div class="text-gray-500 text-center py-4">Loading...</div>');
    openModal('modal-context-usage');

    if (!state.selectedProjectId) {
      $content.html(renderNoProjectMessage());
      return;
    }

    api.getContextUsage(state.selectedProjectId)
      .done(function(data) {
        $content.html(renderContextUsage(data.contextUsage));
      })
      .fail(function() {
        $content.html(renderContextUsageError());
      });
  }

  function renderNoProjectMessage() {
    return '<div class="text-center py-4">' +
      '<svg class="w-8 h-8 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>' +
      '</svg>' +
      '<p class="text-gray-500 text-sm">No project selected</p>' +
    '</div>';
  }

  function renderContextUsageError() {
    return '<div class="text-center py-4">' +
      '<svg class="w-8 h-8 mx-auto mb-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
      '</svg>' +
      '<p class="text-red-400 text-sm">Failed to load context usage</p>' +
    '</div>';
  }

  function renderContextUsage(usage) {
    if (!usage) {
      return '<div class="text-center py-4">' +
        '<svg class="w-8 h-8 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>' +
        '</svg>' +
        '<p class="text-gray-500 text-sm">No context usage data available</p>' +
        '<p class="text-gray-600 text-xs mt-1">Start an agent to see context usage</p>' +
      '</div>';
    }

    var percentColor = getPercentColor(usage.percentUsed);
    var percentBarWidth = Math.min(usage.percentUsed, 100);
    var formatNumber = Formatters.formatNumberCompact;

    return '<div class="space-y-4">' +
      // Progress bar
      '<div class="space-y-2">' +
        '<div class="flex justify-between text-sm">' +
          '<span class="text-gray-400">Context Window</span>' +
          '<span class="' + percentColor + ' font-medium">' + usage.percentUsed + '%</span>' +
        '</div>' +
        '<div class="w-full bg-gray-700 rounded-full h-3">' +
          '<div class="' + getPercentBarColor(usage.percentUsed) + ' h-3 rounded-full transition-all duration-300" style="width: ' + percentBarWidth + '%"></div>' +
        '</div>' +
        '<div class="flex justify-between text-xs text-gray-500">' +
          '<span>' + formatNumber(usage.totalTokens) + ' tokens used</span>' +
          '<span>' + formatNumber(usage.maxContextTokens) + ' max</span>' +
        '</div>' +
      '</div>' +

      // Token breakdown
      '<div class="border-t border-gray-700 pt-4">' +
        '<h4 class="text-sm font-medium text-gray-300 mb-3">Token Breakdown</h4>' +
        '<div class="grid grid-cols-2 gap-3">' +
          renderTokenStat('Input', usage.inputTokens, 'text-blue-400') +
          renderTokenStat('Output', usage.outputTokens, 'text-green-400') +
          renderTokenStat('Cache Created', usage.cacheCreationInputTokens, 'text-yellow-400') +
          renderTokenStat('Cache Read', usage.cacheReadInputTokens, 'text-purple-400') +
        '</div>' +
      '</div>' +

      // Total
      '<div class="border-t border-gray-700 pt-4">' +
        '<div class="flex justify-between items-center">' +
          '<span class="text-gray-400">Total Tokens</span>' +
          '<span class="text-lg font-semibold text-white">' + formatNumber(usage.totalTokens) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderTokenStat(label, value, colorClass) {
    var formatNumber = Formatters.formatNumberCompact;
    return '<div class="bg-gray-700/50 rounded-lg p-3">' +
      '<div class="text-xs text-gray-500 mb-1">' + label + '</div>' +
      '<div class="' + colorClass + ' font-medium">' + formatNumber(value) + '</div>' +
    '</div>';
  }

  function getPercentColor(percent) {
    if (percent < 50) return 'text-green-400';
    if (percent < 75) return 'text-yellow-400';
    if (percent < 90) return 'text-orange-400';
    return 'text-red-400';
  }

  function getPercentBarColor(percent) {
    if (percent < 50) return 'bg-green-500';
    if (percent < 75) return 'bg-yellow-500';
    if (percent < 90) return 'bg-orange-500';
    return 'bg-red-500';
  }

  // ===== Claude Files Modal =====

  function openClaudeFilesModal() {
    var $list = $('#claude-files-list');
    $list.html('<div class="p-2 text-xs text-gray-500">Loading...</div>');
    $('#claude-file-editor').val('').prop('disabled', true);
    $('#claude-file-name').text('Select a file');
    $('#claude-file-size').text('');
    $('#btn-save-claude-file').addClass('hidden');
    state.claudeFilesState.currentFile = null;

    openModal('modal-claude-files');

    if (!state.selectedProjectId) {
      $list.html('<div class="p-2 text-xs text-gray-500">No project selected</div>');
      return;
    }

    api.getClaudeFiles(state.selectedProjectId)
      .done(function(data) {
        state.claudeFilesState.files = data.files || [];
        renderClaudeFilesList();

        // Auto-select first file if available
        if (data.files && data.files.length > 0) {
          selectClaudeFile(data.files[0].path);
        }
      })
      .fail(function() {
        $list.html('<div class="p-2 text-xs text-red-400">Failed to load files</div>');
      });
  }

  function renderClaudeFilesList() {
    var $list = $('#claude-files-list');
    var files = state.claudeFilesState.files;
    var formatFileSize = Formatters.formatFileSize;

    if (files.length === 0) {
      $list.html('<div class="p-2 text-xs text-gray-500">No CLAUDE.md files found</div>');
      return;
    }

    var html = '';

    files.forEach(function(file) {
      var isSelected = state.claudeFilesState.currentFile &&
                       state.claudeFilesState.currentFile.path === file.path;
      var selectedClass = isSelected ? 'bg-purple-600/30 border-l-2 border-purple-500' : 'hover:bg-gray-700';
      var icon = file.isGlobal
        ? '<svg class="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
        : '<svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>';

      html += '<div class="claude-file-item p-2 cursor-pointer ' + selectedClass + '" data-path="' + escapeHtml(file.path) + '">' +
        '<div class="flex items-center gap-2">' +
          icon +
          '<span class="text-xs text-gray-300 truncate">' + escapeHtml(file.name) + '</span>' +
        '</div>' +
        '<div class="text-xs text-gray-500 mt-0.5 pl-5">' + formatFileSize(file.size) + '</div>' +
      '</div>';
    });

    $list.html(html);
  }

  function selectClaudeFile(filePath) {
    var file = state.claudeFilesState.files.find(function(f) { return f.path === filePath; });

    if (!file) return;

    var formatFileSize = Formatters.formatFileSize;

    state.claudeFilesState.currentFile = {
      path: file.path,
      name: file.name,
      content: file.content,
      originalContent: file.content,
      size: file.size,
      isGlobal: file.isGlobal
    };

    $('#claude-file-name').text(file.name);
    $('#claude-file-size').text(formatFileSize(file.size));
    $('#claude-file-editor').val(file.content).prop('disabled', false);
    $('#btn-save-claude-file').addClass('hidden');
    $('#btn-optimize-claude-file').removeClass('hidden');
    updateClaudeFilePreview();

    renderClaudeFilesList();

    // Show editor in mobile view
    FileBrowser.showMobileClaudeFileEditor();
  }

  function toggleClaudeFilePreview() {
    var $previewPane = $('#claude-preview-pane');
    var $editorPane = $('#claude-editor-pane');
    var $btn = $('#btn-toggle-claude-preview');
    var $btnText = $('#claude-preview-btn-text');
    var $icon = $('#claude-preview-icon');
    var isPreviewMode = !$previewPane.hasClass('hidden');

    if (isPreviewMode) {
      // Switch to edit view
      $previewPane.addClass('hidden');
      $editorPane.removeClass('hidden');
      $btn.removeClass('bg-purple-600').addClass('bg-gray-700');
      $btnText.text('Preview');
      // Eye icon for preview
      $icon.html('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>');
    } else {
      // Switch to preview view
      $previewPane.removeClass('hidden');
      $editorPane.addClass('hidden');
      $btn.addClass('bg-purple-600').removeClass('bg-gray-700');
      $btnText.text('Edit');
      // Pencil icon for edit
      $icon.html('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>');
      updateClaudeFilePreview();
    }
  }

  function updateClaudeFilePreview() {
    var $preview = $('#claude-file-preview');
    var $previewPane = $('#claude-preview-pane');

    if ($previewPane.hasClass('hidden')) return;

    var content = $('#claude-file-editor').val();

    if (!content) {
      $preview.html('<p class="text-gray-500">No content to preview</p>');
      return;
    }

    // Render markdown with syntax highlighting
    try {
      if (!marked || !marked.parse) {
        $preview.html('<pre class="whitespace-pre-wrap text-gray-300">' + escapeHtml(content) + '</pre>');
        return;
      }

      var html = marked.parse(content);
      $preview.html(html);

      // Apply syntax highlighting to code blocks
      if (hljs) {
        $preview.find('pre code').each(function() {
          hljs.highlightElement(this);
        });
      }
    } catch (e) {
      $preview.html('<p class="text-red-400">Error rendering preview</p>');
    }
  }

  function saveClaudeFile() {
    var currentFile = state.claudeFilesState.currentFile;

    if (!currentFile || !state.selectedProjectId) return;

    var newContent = $('#claude-file-editor').val();
    var $btn = $('#btn-save-claude-file');

    $btn.text('Saving...').prop('disabled', true);

    api.saveClaudeFile(state.selectedProjectId, currentFile.path, newContent)
      .done(function() {
        currentFile.content = newContent;
        currentFile.originalContent = newContent;
        $btn.addClass('hidden').text('Save Changes').prop('disabled', false);
        showToast('File saved', 'success');

        // Update size in files list
        var file = state.claudeFilesState.files.find(function(f) {
          return f.path === currentFile.path;
        });

        if (file) {
          file.content = newContent;
          file.size = new Blob([newContent]).size;
        }

        renderClaudeFilesList();
      })
      .fail(function(xhr) {
        $btn.text('Save Changes').prop('disabled', false);
        showErrorToast(xhr, 'Failed to save file');
      });
  }

  function optimizeClaudeFile() {
    var currentFile = state.claudeFilesState.currentFile;

    if (!currentFile || !state.selectedProjectId) return;

    var content = $('#claude-file-editor').val();
    if (!content.trim()) {
      showToast('Nothing to optimize', 'warning');
      return;
    }

    var $btn = $('#btn-optimize-claude-file');
    $btn.html('<svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Optimizing...').prop('disabled', true);

    // Define optimization goals
    var optimizationGoals = [
      'Remove duplicated rules or instructions',
      'Consolidate similar rules into more concise versions',
      'Remove rules that contradict Claude\'s core values or capabilities',
      'Organize rules by category for better readability',
      'Add/modify rules that optimize Claude\'s effectiveness',
      'Remove vague or unclear instructions'
    ];

    // Use dedicated optimization agent
    api.optimizeClaudeFile(state.selectedProjectId, currentFile.path, content, optimizationGoals)
      .done(function(response) {
        if (response.oneOffId && typeof OneOffTabsModule !== 'undefined') {
          OneOffTabsModule.createTab(state.selectedProjectId, response.oneOffId, 'Optimize CLAUDE.md');

          if (closeModal) {
            closeModal('modal-claude-files');
          } else {
            $('#modal-claude-files').addClass('hidden');
          }

          if (switchTab) {
            switchTab('agent-output');
          }
        }

        resetOptimizeButton();
      })
      .fail(function(xhr) {
        var errorMsg = 'Failed to start optimization';

        if (xhr.responseJSON && xhr.responseJSON.error) {
          errorMsg = xhr.responseJSON.error;

          if (errorMsg.includes('already in progress')) {
            showToast('Optimization already in progress', 'warning');
            resetOptimizeButton();
            return;
          }
        }

        showErrorToast(xhr, errorMsg);
        resetOptimizeButton();
      });
  }

  function resetOptimizeButton() {
    $('#btn-optimize-claude-file')
      .html('<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Optimize')
      .prop('disabled', false);
  }

  function setupHandlers() {
    // Claude file selection
    $(document).on('click', '.claude-file-item', function() {
      var path = $(this).data('path');
      selectClaudeFile(path);
    });

    // Claude file editor change - show save button
    $('#claude-file-editor').on('input', function() {
      var currentFile = state.claudeFilesState.currentFile;

      if (!currentFile) return;

      var $btn = $('#btn-save-claude-file');
      var newContent = $(this).val();

      if (newContent !== currentFile.originalContent) {
        $btn.removeClass('hidden');
      } else {
        $btn.addClass('hidden');
      }

      updateClaudeFilePreview();
    });

    // Save Claude file
    $('#btn-save-claude-file').on('click', function() {
      saveClaudeFile();
    });

    // Optimize Claude file
    $('#btn-optimize-claude-file').on('click', function() {
      optimizeClaudeFile();
    });

    // Toggle preview
    $('#btn-toggle-claude-preview').on('click', function() {
      toggleClaudeFilePreview();
    });
  }

  return {
    init: init,
    openContextUsageModal: openContextUsageModal,
    openClaudeFilesModal: openClaudeFilesModal,
    selectClaudeFile: selectClaudeFile,
    saveClaudeFile: saveClaudeFile,
    optimizeClaudeFile: optimizeClaudeFile,
    toggleClaudeFilePreview: toggleClaudeFilePreview,
    updateClaudeFilePreview: updateClaudeFilePreview,
    renderClaudeFilesList: renderClaudeFilesList,
    setupHandlers: setupHandlers,
    resetOptimizeButton: resetOptimizeButton
  };
}));
