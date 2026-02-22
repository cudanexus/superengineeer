/**
 * Git Module
 * Handles all Git-related functionality: status, branches, staging, commits, diffs
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GitModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies injected via init()
  var state, api, escapeHtml, showToast, showPrompt, showConfirm;
  var getErrorMessage, highlightCode, getLanguageFromPath;
  var findProjectById, switchTab, FileBrowser, computeWordDiff;

  // Module state
  var gitOperationInProgress = false;
  var lastGitStatus = null;

  /**
   * Initialize the module with dependencies
   */
  function init(deps) {
    state = deps.state;
    api = deps.api;
    escapeHtml = deps.escapeHtml;
    showToast = deps.showToast;
    showPrompt = deps.showPrompt;
    showConfirm = deps.showConfirm;
    getErrorMessage = deps.getErrorMessage;
    highlightCode = deps.highlightCode;
    getLanguageFromPath = deps.getLanguageFromPath;
    findProjectById = deps.findProjectById;
    switchTab = deps.switchTab;
    FileBrowser = deps.FileBrowser;
    computeWordDiff = deps.computeWordDiff;
  }

  function loadGitStatus() {
    if (!state.selectedProjectId) return;

    api.getGitStatus(state.selectedProjectId)
      .done(function(status) {
        renderGitStatus(status);
      })
      .fail(function() {
        showToast('Failed to load git status', 'error');
      });

    api.getGitBranches(state.selectedProjectId)
      .done(function(branches) {
        renderGitBranches(branches);
      });

    loadGitTags();
  }

  function loadGitTags() {
    if (!state.selectedProjectId) return;

    api.getGitTags(state.selectedProjectId)
      .done(function(result) {
        renderGitTags(result.tags || []);
      })
      .fail(function() {
        renderGitTags([]);
      });
  }

  function renderGitTags(tags) {
    var $container = $('#git-tags-list');

    if (!tags || tags.length === 0) {
      $container.html('<div class="text-gray-500 text-center py-2">No tags</div>');
      return;
    }

    var html = '';

    tags.forEach(function(tag) {
      html += '<div class="flex items-center justify-between py-1 px-1 hover:glass-panel rounded">' +
        '<span class="text-gray-300 truncate" title="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</span>' +
        '<div class="flex items-center gap-1 flex-shrink-0">' +
        '<button class="git-push-tag-btn text-xs text-blue-400 hover:text-blue-300 px-1" data-tag="' + escapeHtml(tag) + '" title="Push tag">&#8593;</button>' +
        '<button class="git-delete-tag-btn text-xs text-red-400 hover:text-red-300 px-1" data-tag="' + escapeHtml(tag) + '" title="Delete local tag">&#10005;</button>' +
        '</div>' +
        '</div>';
    });

    $container.html(html);
  }

  function renderGitStatus(status) {
    lastGitStatus = status;

    if (!status.isRepo) {
      $('#git-not-repo').removeClass('hidden').addClass('flex');
      $('#git-content').addClass('hidden');
      return;
    }

    $('#git-not-repo').addClass('hidden').removeClass('flex');
    $('#git-content').removeClass('hidden');

    $('#git-staged-count').text('(' + status.staged.length + ')');
    $('#git-unstaged-count').text('(' + (status.unstaged.length + status.untracked.length) + ')');

    var stagedTree = buildGitFileTree(status.staged);
    renderGitFileTree('#git-staged-tree', stagedTree, 'staged');

    var unstaged = status.unstaged.concat(status.untracked);
    var unstagedTree = buildGitFileTree(unstaged);
    renderGitFileTree('#git-unstaged-tree', unstagedTree, 'unstaged');
  }

  function buildGitFileTree(files) {
    var root = { children: {} };

    files.forEach(function(file) {
      var normalizedPath = file.path.replace(/\\/g, '/');
      var parts = normalizedPath.split('/');
      var current = root;

      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        var isFile = (i === parts.length - 1);

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            isDirectory: !isFile,
            children: isFile ? null : {},
            status: isFile ? file.status : null
          };
        }

        current = current.children[part];
      }
    });

    return root;
  }

  function renderGitFileTree(selector, tree, type) {
    var $container = $(selector);
    $container.empty();

    var children = Object.values(tree.children);

    if (children.length === 0) {
      $container.html('<div class="text-gray-500 text-center py-2">No files</div>');
      return;
    }

    children.sort(function(a, b) {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    children.forEach(function(entry) {
      $container.append(renderGitTreeItem(entry, 0, type));
    });
  }

  function renderGitTreeItem(entry, depth, type) {
    var indent = depth * 16;
    var isExpanded = state.git.expandedDirs[type + ':' + entry.path];
    var isSelected = state.git.selectedFile === entry.path;

    if (entry.isDirectory) {
      var chevronClass = isExpanded ? 'tree-chevron expanded' : 'tree-chevron';
      var dirActionBtn = type === 'staged'
        ? '<button class="git-action-btn git-unstage-dir-btn" data-path="' + escapeHtml(entry.path) + '" title="Unstage folder">−</button>'
        : '<button class="git-action-btn git-stage-dir-btn" data-path="' + escapeHtml(entry.path) + '" title="Stage folder">+</button>';

      var html = '<div class="git-tree-item directory' + (isSelected ? ' selected' : '') + '" ' +
                 'data-path="' + escapeHtml(entry.path) + '" data-type="' + type + '" ' +
                 'style="padding-left: ' + indent + 'px;">' +
        '<svg class="' + chevronClass + '" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>' +
        '</svg>' +
        '<svg class="tree-icon text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>' +
        '</svg>' +
        '<span class="tree-name flex-1">' + escapeHtml(entry.name) + '</span>' +
        dirActionBtn +
      '</div>';

      if (isExpanded && entry.children) {
        var childEntries = Object.values(entry.children);
        childEntries.sort(function(a, b) {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

        html += '<div class="tree-children">';
        childEntries.forEach(function(child) {
          html += renderGitTreeItem(child, depth + 1, type);
        });
        html += '</div>';
      }

      return html;
    } else {
      var statusIcon = getGitStatusIcon(entry.status);
      var actionBtn = type === 'staged'
        ? '<button class="git-action-btn git-unstage-btn" data-path="' + escapeHtml(entry.path) + '" title="Unstage">−</button>'
        : '<button class="git-action-btn git-stage-btn" data-path="' + escapeHtml(entry.path) + '" title="Stage">+</button>';

      return '<div class="git-tree-item file' + (isSelected ? ' selected' : '') + '" ' +
             'data-path="' + escapeHtml(entry.path) + '" data-type="' + type + '" ' +
             'data-status="' + (entry.status || '') + '" ' +
             'style="padding-left: ' + (indent + 20) + 'px;">' +
        statusIcon +
        '<span class="tree-name flex-1 truncate">' + escapeHtml(entry.name) + '</span>' +
        actionBtn +
      '</div>';
    }
  }

  function toggleGitDirectory(dirPath, type) {
    var key = type + ':' + dirPath;

    if (state.git.expandedDirs[key]) {
      delete state.git.expandedDirs[key];
      var $item = $('.git-tree-item.directory[data-path="' + CSS.escape(dirPath) + '"][data-type="' + type + '"]');
      $item.find('.tree-chevron').first().removeClass('expanded');
      $item.next('.tree-children').remove();
    } else {
      state.git.expandedDirs[key] = true;
      loadGitStatus();
    }
  }

  function getGitStatusIcon(status) {
    var colors = {
      added: 'text-green-400',
      modified: 'text-yellow-400',
      deleted: 'text-red-400',
      renamed: 'text-blue-400',
      copied: 'text-blue-400',
      untracked: 'text-gray-400'
    };
    var icons = {
      added: 'A',
      modified: 'M',
      deleted: 'D',
      renamed: 'R',
      copied: 'C',
      untracked: '?'
    };
    var color = colors[status] || 'text-gray-400';
    var icon = icons[status] || '?';
    return '<span class="git-status-icon ' + color + '">' + icon + '</span>';
  }

  function renderGitBranches(branches) {
    var $select = $('#git-branch-select');
    $select.empty();

    if (!branches.current && branches.local.length === 0) {
      $select.append('<option value="">No branches</option>');
      return;
    }

    branches.local.forEach(function(branch) {
      var selected = branch === branches.current ? ' selected' : '';
      $select.append('<option value="' + escapeHtml(branch) + '"' + selected + '>' + escapeHtml(branch) + '</option>');
    });

    if (branches.remote.length > 0) {
      $select.append('<option disabled>─────────────</option>');
      branches.remote.forEach(function(branch) {
        $select.append('<option value="' + escapeHtml(branch) + '">' + escapeHtml(branch) + '</option>');
      });
    }

    renderGitBranchesList(branches);
  }

  function renderGitBranchesList(branches) {
    var $list = $('#git-branches-list');

    if (!branches || (!branches.current && branches.local.length === 0)) {
      $list.html('<div class="text-gray-500 text-center py-1">No branches</div>');
      return;
    }

    var html = '';

    branches.local.forEach(function(branch) {
      var isCurrent = branch === branches.current;
      var baseClasses = 'px-2 py-1 rounded cursor-pointer hover:bg-gray-600 flex items-center gap-2 git-branch-item';
      var extraClasses = isCurrent ? ' bg-gray-600 text-green-400' : ' text-gray-300';

      html += '<div class="' + baseClasses + extraClasses + '" data-branch="' + escapeHtml(branch) + '">';

      if (isCurrent) {
        html += '<span class="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"></span>';
      } else {
        html += '<span class="w-1.5 flex-shrink-0"></span>';
      }

      html += '<span class="truncate" title="' + escapeHtml(branch) + '">' + escapeHtml(branch) + '</span>';
      html += '</div>';
    });

    if (branches.remote.length > 0) {
      html += '<div class="mt-1 pt-1 border-t !border-[var(--theme-border)]">';
      html += '<div class="text-gray-500 text-[10px] uppercase px-2 py-0.5">Remote</div>';

      branches.remote.forEach(function(branch) {
        html += '<div class="px-2 py-1 rounded cursor-pointer hover:bg-gray-600 flex items-center gap-2 text-gray-400 git-branch-item" data-branch="' + escapeHtml(branch) + '">';
        html += '<span class="w-1.5 flex-shrink-0"></span>';
        html += '<span class="truncate text-[11px]" title="' + escapeHtml(branch) + '">' + escapeHtml(branch) + '</span>';
        html += '</div>';
      });

      html += '</div>';
    }

    $list.html(html);
  }

  function setGitOperationState(loading) {
    gitOperationInProgress = loading;
    var $gitContent = $('#git-content');

    if (loading) {
      $gitContent.addClass('git-loading');
      $gitContent.find('button, select').prop('disabled', true);
      $gitContent.find('.git-action-btn, .git-branch-item, .git-push-tag-btn').addClass('pointer-events-none opacity-50');
    } else {
      $gitContent.removeClass('git-loading');
      $gitContent.find('button, select').prop('disabled', false);
      $gitContent.find('.git-action-btn, .git-branch-item, .git-push-tag-btn').removeClass('pointer-events-none opacity-50');
    }
  }

  function isOperationInProgress() {
    return gitOperationInProgress;
  }

  function parseUnifiedDiff(diffText) {
    if (!diffText || diffText.trim() === '') {
      return [];
    }

    var lines = diffText.split('\n');
    var aligned = [];
    var pendingRemoves = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (line.startsWith('diff --git') ||
          line.startsWith('index ') ||
          line.startsWith('--- ') ||
          line.startsWith('+++ ') ||
          line.startsWith('@@') ||
          line.startsWith('\\ No newline')) {
        continue;
      }

      if (line.startsWith('-')) {
        pendingRemoves.push(line.substring(1));
      } else if (line.startsWith('+')) {
        if (pendingRemoves.length > 0) {
          var oldContent = pendingRemoves.shift();
          var newContent = line.substring(1);
          var wordDiff = computeWordDiff(oldContent, newContent);

          aligned.push({
            left: oldContent,
            right: newContent,
            type: 'change',
            leftChunks: wordDiff.leftChunks,
            rightChunks: wordDiff.rightChunks
          });
        } else {
          aligned.push({ left: '', right: line.substring(1), type: 'add' });
        }
      } else if (line.startsWith(' ')) {
        while (pendingRemoves.length > 0) {
          aligned.push({ left: pendingRemoves.shift(), right: '', type: 'remove' });
        }
        aligned.push({ left: line.substring(1), right: line.substring(1), type: 'unchanged' });
      } else if (line === '') {
        while (pendingRemoves.length > 0) {
          aligned.push({ left: pendingRemoves.shift(), right: '', type: 'remove' });
        }
      }
    }

    while (pendingRemoves.length > 0) {
      aligned.push({ left: pendingRemoves.shift(), right: '', type: 'remove' });
    }

    return aligned;
  }

  function loadGitFileDiff(filePath, staged) {
    var $preview = $('#git-diff-preview');
    $preview.html('<div class="text-gray-500 text-center py-4">Loading diff...</div>');

    if (!state.selectedProjectId) return;

    api.getGitFileDiff(state.selectedProjectId, filePath, staged)
      .done(function(result) {
        if (!result.diff) {
          $preview.html('<div class="text-gray-500 text-center py-4">No changes</div>');
          return;
        }

        var alignedDiff = parseUnifiedDiff(result.diff);

        if (alignedDiff.length === 0) {
          $preview.html('<div class="text-gray-500 text-center py-4">No changes</div>');
          return;
        }

        var html = renderGitDiffSideBySide(alignedDiff, filePath);
        $preview.html(html);
      })
      .fail(function(xhr) {
        var msg = getErrorMessage(xhr);
        $preview.html('<div class="text-red-400 text-center py-4">Failed to load diff: ' + escapeHtml(msg) + '</div>');
      });
  }

  function renderWordChunks(chunks, highlightType) {
    if (!chunks || chunks.length === 0) return '';

    return chunks.map(function(chunk) {
      var text = escapeHtml(chunk.text);

      if (chunk.type === 'removed' && highlightType === 'old') {
        return '<span class="diff-char-removed">' + text + '</span>';
      } else if (chunk.type === 'added' && highlightType === 'new') {
        return '<span class="diff-char-added">' + text + '</span>';
      }

      return text;
    }).join('');
  }

  function renderGitDiffSideBySide(alignedDiff, filePath) {
    if (alignedDiff.length === 0) {
      return '<div class="text-gray-500 text-center py-4">No changes</div>';
    }

    var language = getLanguageFromPath(filePath);
    var html = '<div class="git-diff side-by-side">';

    html += '<div class="diff-side old">';
    html += '<div class="diff-side-header">Original</div>';
    html += '<div class="diff-side-content">';

    for (var i = 0; i < alignedDiff.length; i++) {
      var row = alignedDiff[i];
      var leftClass = 'diff-line';

      if (row.type === 'unchanged') {
        leftClass += ' diff-unchanged';
      } else if (row.type === 'remove') {
        leftClass += ' diff-remove';
      } else if (row.type === 'change') {
        leftClass += ' diff-change';
      } else if (row.type === 'add') {
        leftClass += ' diff-empty';
      }

      var leftContent;

      if (row.type === 'change' && row.leftChunks && row.leftChunks.length > 0) {
        leftContent = renderWordChunks(row.leftChunks, 'old');
      } else {
        leftContent = row.left ? highlightCode(row.left, language) : '&nbsp;';
      }

      html += '<div class="' + leftClass + '">';
      html += '<span class="diff-content">' + leftContent + '</span>';
      html += '</div>';
    }

    html += '</div></div>';

    html += '<div class="diff-side new">';
    html += '<div class="diff-side-header">Modified</div>';
    html += '<div class="diff-side-content">';

    for (var j = 0; j < alignedDiff.length; j++) {
      var row2 = alignedDiff[j];
      var rightClass = 'diff-line';

      if (row2.type === 'unchanged') {
        rightClass += ' diff-unchanged';
      } else if (row2.type === 'add') {
        rightClass += ' diff-add';
      } else if (row2.type === 'change') {
        rightClass += ' diff-change';
      } else if (row2.type === 'remove') {
        rightClass += ' diff-empty';
      }

      var rightContent;

      if (row2.type === 'change' && row2.rightChunks && row2.rightChunks.length > 0) {
        rightContent = renderWordChunks(row2.rightChunks, 'new');
      } else {
        rightContent = row2.right ? highlightCode(row2.right, language) : '&nbsp;';
      }

      html += '<div class="' + rightClass + '">';
      html += '<span class="diff-content">' + rightContent + '</span>';
      html += '</div>';
    }

    html += '</div></div>';
    html += '</div>';

    return html;
  }

  function showMobileGitDiff() {
    if (!isMobileView()) return;
    $('#git-diff-area').addClass('mobile-visible');
  }

  function hideMobileGitDiff() {
    $('#git-diff-area').removeClass('mobile-visible');
  }

  function isMobileView() {
    return window.innerWidth < 768;
  }

  function setupGitHandlers() {
    $('#btn-git-refresh').on('click', function() {
      if (gitOperationInProgress) return;
      loadGitStatus();
    });

    $('#git-branch-select').on('change', function() {
      if (gitOperationInProgress) return;
      var branch = $(this).val();

      if (branch && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitCheckout(state.selectedProjectId, branch)
          .done(function() {
            showToast('Switched to branch: ' + branch, 'success');
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to checkout branch: ' + getErrorMessage(xhr), 'error');
            loadGitStatus();
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    $(document).on('click', '.git-branch-item', function() {
      if (gitOperationInProgress) return;
      var branch = $(this).data('branch');

      if (branch && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitCheckout(state.selectedProjectId, branch)
          .done(function() {
            showToast('Switched to branch: ' + branch, 'success');
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to checkout branch: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    $('#btn-git-new-branch').on('click', function() {
      if (gitOperationInProgress) return;
      showPrompt('New Branch', 'Branch name:', { placeholder: 'feature/my-branch', submitText: 'Create' })
        .then(function(name) {
          if (name && state.selectedProjectId) {
            setGitOperationState(true);
            api.gitCreateBranch(state.selectedProjectId, name, true)
              .done(function() {
                showToast('Created and switched to branch: ' + name, 'success');
                loadGitStatus();
              })
              .fail(function(xhr) {
                showToast('Failed to create branch: ' + getErrorMessage(xhr), 'error');
              })
              .always(function() {
                setGitOperationState(false);
              });
          }
        });
    });

    $('#btn-git-stage-all').on('click', function() {
      if (gitOperationInProgress || !state.selectedProjectId) return;

      setGitOperationState(true);
      api.gitStageAll(state.selectedProjectId)
        .done(function() {
          loadGitStatus();
        })
        .fail(function(xhr) {
          showToast('Failed to stage files: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
        });
    });

    $('#btn-git-unstage-all').on('click', function() {
      if (gitOperationInProgress || !state.selectedProjectId) return;

      setGitOperationState(true);
      api.gitUnstageAll(state.selectedProjectId)
        .done(function() {
          loadGitStatus();
        })
        .fail(function(xhr) {
          showToast('Failed to unstage files: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
        });
    });

    $(document).on('click', '.git-stage-btn', function(e) {
      e.stopPropagation();
      if (gitOperationInProgress) return;
      var path = $(this).data('path');

      if (path && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitStage(state.selectedProjectId, [path])
          .done(function() {
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to stage file: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    $(document).on('click', '.git-unstage-btn', function(e) {
      e.stopPropagation();
      if (gitOperationInProgress) return;
      var path = $(this).data('path');

      if (path && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitUnstage(state.selectedProjectId, [path])
          .done(function() {
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to unstage file: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    $(document).on('click', '.git-stage-dir-btn', function(e) {
      e.stopPropagation();
      if (gitOperationInProgress) return;
      var dirPath = $(this).data('path');

      if (dirPath && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitStage(state.selectedProjectId, [dirPath])
          .done(function() {
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to stage folder: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    $(document).on('click', '.git-unstage-dir-btn', function(e) {
      e.stopPropagation();
      if (gitOperationInProgress) return;
      var dirPath = $(this).data('path');

      if (dirPath && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitUnstage(state.selectedProjectId, [dirPath])
          .done(function() {
            loadGitStatus();
          })
          .fail(function(xhr) {
            showToast('Failed to unstage folder: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    $(document).on('click', '.git-tree-item', function(e) {
      if ($(e.target).closest('.git-action-btn').length) return;

      var $item = $(this);
      var path = $item.data('path');
      var type = $item.data('type');
      var isDirectory = $item.hasClass('directory');

      if (isDirectory) {
        toggleGitDirectory(path, type);
      } else {
        state.git.selectedFile = path;
        $('.git-tree-item').removeClass('selected');
        $item.addClass('selected');

        if (path && state.selectedProjectId) {
          loadGitFileDiff(path, type === 'staged');
          showMobileGitDiff();
        }
      }
    });

    $(document).on('contextmenu', '.git-tree-item.file', function(e) {
      e.preventDefault();

      var $item = $(this);
      var path = $item.data('path');
      var type = $item.data('type');
      var status = $item.data('status');

      state.gitContextTarget = { path: path, type: type, status: status, isDirectory: false };

      if (type === 'staged') {
        $('#git-ctx-stage, #git-ctx-discard').addClass('hidden');
        $('#git-ctx-unstage').removeClass('hidden');
      } else {
        $('#git-ctx-stage, #git-ctx-discard').removeClass('hidden');
        $('#git-ctx-unstage').addClass('hidden');
      }

      $('#git-ctx-view-diff, #git-ctx-open-file').removeClass('hidden');

      $('#git-context-menu').css({
        top: e.pageY + 'px',
        left: e.pageX + 'px'
      }).removeClass('hidden');

      $(document).one('click', function() {
        $('#git-context-menu').addClass('hidden');
      });
    });

    $(document).on('contextmenu', '.git-tree-item.directory', function(e) {
      e.preventDefault();

      var $item = $(this);
      var path = $item.data('path');
      var type = $item.data('type');

      state.gitContextTarget = { path: path, type: type, status: null, isDirectory: true };

      if (type === 'staged') {
        $('#git-ctx-stage, #git-ctx-discard').addClass('hidden');
        $('#git-ctx-unstage').removeClass('hidden');
      } else {
        $('#git-ctx-stage').removeClass('hidden');
        $('#git-ctx-unstage, #git-ctx-discard').addClass('hidden');
      }

      $('#git-ctx-view-diff, #git-ctx-open-file').addClass('hidden');

      $('#git-context-menu').css({
        top: e.pageY + 'px',
        left: e.pageX + 'px'
      }).removeClass('hidden');

      $(document).one('click', function() {
        $('#git-context-menu').addClass('hidden');
      });
    });

    $('#git-ctx-stage').on('click', function(e) {
      e.stopPropagation();
      $('#git-context-menu').addClass('hidden');
      if (gitOperationInProgress) return;

      if (state.gitContextTarget && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitStage(state.selectedProjectId, [state.gitContextTarget.path])
          .done(loadGitStatus)
          .fail(function(xhr) {
            showToast('Failed to stage: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    $('#git-ctx-unstage').on('click', function(e) {
      e.stopPropagation();
      $('#git-context-menu').addClass('hidden');
      if (gitOperationInProgress) return;

      if (state.gitContextTarget && state.selectedProjectId) {
        setGitOperationState(true);
        api.gitUnstage(state.selectedProjectId, [state.gitContextTarget.path])
          .done(loadGitStatus)
          .fail(function(xhr) {
            showToast('Failed to unstage: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
          });
      }
    });

    $('#git-ctx-discard').on('click', function(e) {
      e.stopPropagation();
      $('#git-context-menu').addClass('hidden');
      if (gitOperationInProgress) return;

      if (state.gitContextTarget && state.selectedProjectId) {
        var targetPath = state.gitContextTarget.path;
        showConfirm('Discard Changes', 'Discard changes to ' + targetPath + '?\n\nThis cannot be undone.', { danger: true, confirmText: 'Discard' })
          .then(function(confirmed) {
            if (confirmed) {
              setGitOperationState(true);
              api.gitDiscard(state.selectedProjectId, [targetPath])
                .done(function() {
                  showToast('Changes discarded', 'success');
                  loadGitStatus();
                })
                .fail(function(xhr) {
                  showToast('Failed to discard: ' + getErrorMessage(xhr), 'error');
                })
                .always(function() {
                  setGitOperationState(false);
                });
            }
          });
      }
    });

    $('#git-ctx-view-diff').on('click', function(e) {
      e.stopPropagation();
      $('#git-context-menu').addClass('hidden');

      if (state.gitContextTarget) {
        loadGitFileDiff(state.gitContextTarget.path, state.gitContextTarget.type === 'staged');
      }
    });

    $('#git-ctx-open-file').on('click', function(e) {
      e.stopPropagation();
      $('#git-context-menu').addClass('hidden');

      if (state.gitContextTarget && state.selectedProjectId) {
        var project = findProjectById(state.selectedProjectId);

        if (project) {
          var fullPath = project.path + '/' + state.gitContextTarget.path;
          switchTab('project-files');
          var normalizedPath = fullPath.replace(/\//g, '\\');
          var fileName = state.gitContextTarget.path.split('/').pop();
          FileBrowser.openFile(normalizedPath, fileName);
        }
      }
    });

    $('#btn-generate-commit-msg').on('click', function(e) {
      e.preventDefault();
      generateCommitMessage();
    });

    $('#btn-git-commit').on('click', function() {
      if (gitOperationInProgress) return;
      var message = $('#git-commit-message').val().trim();

      if (!message) {
        showToast('Please enter a commit message', 'error');
        return;
      }

      if (!state.selectedProjectId) return;

      setGitOperationState(true);
      $(this).text('Committing...');

      api.gitCommit(state.selectedProjectId, message)
        .done(function(result) {
          showToast('Committed: ' + result.hash, 'success');
          $('#git-commit-message').val('');
          loadGitStatus();
        })
        .fail(function(xhr) {
          showToast('Failed to commit: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
          $('#btn-git-commit').text('Commit');
        });
    });

    $('#btn-git-push').on('click', function() {
      if (gitOperationInProgress || !state.selectedProjectId) return;

      setGitOperationState(true);
      $(this).text('Pushing...');

      api.gitPush(state.selectedProjectId)
        .done(function() {
          showToast('Pushed successfully', 'success');
        })
        .fail(function(xhr) {
          showToast('Failed to push: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
          $('#btn-git-push').text('Push');
        });
    });

    $('#btn-git-pull').on('click', function() {
      if (gitOperationInProgress || !state.selectedProjectId) return;

      setGitOperationState(true);
      $(this).text('Pulling...');

      api.gitPull(state.selectedProjectId)
        .done(function() {
          showToast('Pulled successfully', 'success');
          loadGitStatus();
        })
        .fail(function(xhr) {
          showToast('Failed to pull: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
          $('#btn-git-pull').text('Pull');
        });
    });

    $('#git-mobile-back-btn').on('click', function() {
      hideMobileGitDiff();
    });

    $('#btn-git-new-tag').on('click', function() {
      if (gitOperationInProgress) return;
      $('#input-tag-name').val('');
      $('#input-tag-message').val('');
      $('#modal-create-tag').removeClass('hidden');
    });

    $('#form-create-tag').on('submit', function(e) {
      e.preventDefault();
      if (gitOperationInProgress) return;
      var name = $('#input-tag-name').val().trim();
      var message = $('#input-tag-message').val().trim();

      if (!name || !state.selectedProjectId) return;

      setGitOperationState(true);
      api.gitCreateTag(state.selectedProjectId, name, message || undefined)
        .done(function() {
          showToast('Tag created: ' + name, 'success');
          $('#modal-create-tag').addClass('hidden');
          loadGitTags();
        })
        .fail(function(xhr) {
          showToast('Failed to create tag: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
        });
    });

    $(document).on('click', '.git-push-tag-btn', function(e) {
      e.stopPropagation();
      if (gitOperationInProgress) return;
      var tagName = $(this).data('tag');

      if (tagName && state.selectedProjectId) {
        var $btn = $(this);
        setGitOperationState(true);
        $btn.text('...');

        api.gitPushTag(state.selectedProjectId, tagName)
          .done(function() {
            showToast('Tag pushed: ' + tagName, 'success');
          })
          .fail(function(xhr) {
            showToast('Failed to push tag: ' + getErrorMessage(xhr), 'error');
          })
          .always(function() {
            setGitOperationState(false);
            $btn.html('&#8593;');
          });
      }
    });

    $(document).on('click', '.git-delete-tag-btn', function(e) {
      e.stopPropagation();
      if (gitOperationInProgress) return;
      var tagName = $(this).data('tag');

      if (!tagName || !state.selectedProjectId) return;
      if (!confirm('Delete local tag "' + tagName + '"?')) return;

      setGitOperationState(true);

      api.gitDeleteTag(state.selectedProjectId, tagName)
        .done(function() {
          showToast('Tag deleted: ' + tagName, 'success');
          loadGitTags();
        })
        .fail(function(xhr) {
          showToast('Failed to delete tag: ' + getErrorMessage(xhr), 'error');
        })
        .always(function() {
          setGitOperationState(false);
        });
    });
  }

  function generateCommitMessage() {
    if (!state.selectedProjectId) {
      showToast('No project selected', 'warning');
      return;
    }

    if (!lastGitStatus || !lastGitStatus.staged || lastGitStatus.staged.length === 0) {
      showToast('No staged files to commit', 'warning');
      return;
    }

    var $link = $('#btn-generate-commit-msg');
    $link.html('<svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Generating...');

    showCommitLoadingMask();

    api.generateCommitMessage(state.selectedProjectId)
      .done(function(result) {
        if (result.message) {
          $('#git-commit-message').val(result.message);
          showToast('Commit message generated', 'success');
        } else {
          showToast('No commit message generated', 'warning');
        }
      })
      .fail(function(xhr) {
        showToast('Failed to generate commit message: ' + getErrorMessage(xhr), 'error');
      })
      .always(function() {
        hideCommitLoadingMask();
        resetGenerateButton();
      });
  }

  function resetGenerateButton() {
    $('#btn-generate-commit-msg').html(
      '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>' +
      '</svg> Generate'
    );
  }

  function showCommitLoadingMask() {
    var $section = $('#git-actions-section');
    var $mask = $section.find('.commit-loading-mask');

    if ($mask.length === 0) {
      $mask = $('<div class="commit-loading-mask absolute inset-0 bg-gray-900/80 z-50 flex items-center justify-center">' +
        '<div class="text-center">' +
          '<svg class="w-8 h-8 animate-spin mx-auto mb-2 !text-[var(--theme-accent-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>' +
          '</svg>' +
          '<p class="text-sm text-gray-300">Generating commit message...</p>' +
        '</div>' +
      '</div>');
      $section.css('position', 'relative');
      $section.append($mask);
    }

    $mask.removeClass('hidden');
  }

  function hideCommitLoadingMask() {
    $('#git-actions-section .commit-loading-mask').addClass('hidden');
  }

  return {
    init: init,
    loadGitStatus: loadGitStatus,
    setupGitHandlers: setupGitHandlers,
    showMobileGitDiff: showMobileGitDiff,
    hideMobileGitDiff: hideMobileGitDiff,
    isOperationInProgress: isOperationInProgress
  };
}));
