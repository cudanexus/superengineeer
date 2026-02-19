/**
 * Modals Module
 * Handles AI files modal and optimizations modal
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

  // ===== AI Files Modal =====

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
          var el = this;
          var classes = el.className.split(/\s+/);

          for (var i = 0; i < classes.length; i++) {
            var match = classes[i].match(/^(?:language-|lang-)(.+)/);

            if (match && !hljs.getLanguage(match[1])) {
              el.classList.remove(classes[i]);
            }
          }

          hljs.highlightElement(el);
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
    // AI file selection
    $(document).on('click', '.claude-file-item', function() {
      var path = $(this).data('path');
      selectClaudeFile(path);
    });

    // AI file editor change - show save button
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

    // Save AI file
    $('#btn-save-claude-file').on('click', function() {
      saveClaudeFile();
    });

    // Optimize AI file
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
