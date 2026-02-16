/**
 * GitHub Issues Module
 * Handles displaying GitHub issues, "Start Working", and "Add to Roadmap" actions
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GitHubIssuesModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var state = null;
  var api = null;
  var escapeHtml = null;
  var showToast = null;
  var openModal = null;
  var closeModal = null;
  var doSendMessage = null;
  var startInteractiveAgentWithMessage = null;
  var findProjectById = null;
  var updateProjectStatusById = null;
  var startAgentStatusPolling = null;
  var appendMessage = null;

  var cachedRepoId = {};
  var activeIssueWorkByProject = {};

  function init(deps) {
    state = deps.state;
    api = deps.api;
    escapeHtml = deps.escapeHtml;
    showToast = deps.showToast;
    openModal = deps.openModal;
    closeModal = deps.closeModal;
    doSendMessage = deps.doSendMessage;
    startInteractiveAgentWithMessage = deps.startInteractiveAgentWithMessage;
    findProjectById = deps.findProjectById;
    updateProjectStatusById = deps.updateProjectStatusById;
    startAgentStatusPolling = deps.startAgentStatusPolling;
    appendMessage = deps.appendMessage;
    setupHandlers();
  }

  function getActiveWorkForProject(projectId) {
    return activeIssueWorkByProject[projectId] || null;
  }

  function setActiveWorkForProject(projectId, work) {
    if (work) {
      activeIssueWorkByProject[projectId] = work;
    } else {
      delete activeIssueWorkByProject[projectId];
    }
  }

  function setupHandlers() {
    $('#btn-view-issues').on('click', function() {
      openIssuesPanel();
    });

    $('#btn-issues-refresh').on('click', function() {
      loadIssues();
    });

    $('#issues-filter-state').on('change', function() {
      loadIssues();
    });

    $('#issues-filter-label').on('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadIssues();
      }
    });

    $(document).on('click', '.issue-item', function() {
      var issueNumber = $(this).data('issue-number');
      selectIssue(issueNumber);
    });

    $(document).on('click', '.issue-start-working', function(e) {
      e.stopPropagation();
      var $btn = $(this);
      var issueNumber = $btn.closest('.issue-item').data('issue-number');
      startWorkingOnIssue(issueNumber, $btn);
    });

    $(document).on('click', '.issue-add-roadmap', function(e) {
      e.stopPropagation();
      var issueNumber = $(this).closest('.issue-item').data('issue-number');
      showAddToRoadmapDialog(issueNumber);
    });

    $('#btn-issue-detail-start').on('click', function() {
      var $btn = $(this);
      var issueNumber = $btn.data('issue-number');
      startWorkingOnIssue(issueNumber, $btn);
    });

    $('#btn-issue-detail-roadmap').on('click', function() {
      var issueNumber = $(this).data('issue-number');
      showAddToRoadmapDialog(issueNumber);
    });

    $('#btn-issue-detail-close-issue').on('click', function() {
      var issueNumber = $(this).data('issue-number');
      closeIssue(issueNumber);
    });

    $('#btn-add-to-roadmap-confirm').on('click', function() {
      confirmAddToRoadmap();
    });

    $('#btn-issue-detail-finish').on('click', function() {
      finishIssueWork($(this));
    });

    $('#btn-finish-issue-toolbar').on('click', function() {
      finishIssueWork($(this));
    });

    $('#btn-new-issue').on('click', function() {
      openCreateIssueModal();
    });

    $('#btn-create-issue-submit').on('click', function() {
      submitNewIssue();
    });
  }

  function getRepoId(callback) {
    if (!state.currentProject) {
      showToast('No project selected', 'error');
      return;
    }

    var projectId = state.currentProject.id;

    if (cachedRepoId[projectId]) {
      callback(cachedRepoId[projectId]);
      return;
    }

    api.getGitHubRepoId(projectId)
      .done(function(data) {
        if (!data.repo) {
          showToast('This project is not linked to a GitHub repository', 'error');
          return;
        }
        cachedRepoId[projectId] = data.repo;
        callback(data.repo);
      })
      .fail(function() {
        showToast('Failed to detect GitHub repository', 'error');
      });
  }

  function openIssuesPanel() {
    getRepoId(function(repo) {
      $('#issues-repo-name').text(repo);
      openModal('modal-github-issues');
      loadIssues();
    });
  }

  function loadIssues() {
    var projectId = state.currentProject.id;

    if (!projectId || !cachedRepoId[projectId]) return;

    var repo = cachedRepoId[projectId];
    var filterState = $('#issues-filter-state').val() || 'open';
    var label = $('#issues-filter-label').val();
    var assignee = $('#issues-filter-assignee').val();

    var params = { repo: repo, state: filterState, limit: 50 };

    if (label) params.label = label;
    if (assignee) params.assignee = assignee;

    $('#issues-list').html(
      '<div class="text-center text-gray-500 text-sm py-8">Loading issues...</div>'
    );

    api.getGitHubIssues(params)
      .done(function(issues) {
        renderIssuesList(issues);
      })
      .fail(function() {
        $('#issues-list').html(
          '<div class="text-center text-red-400 text-sm py-8">Failed to load issues</div>'
        );
      });
  }

  function renderIssuesList(issues) {
    var $list = $('#issues-list');
    $list.empty();

    if (!issues || issues.length === 0) {
      $list.html('<div class="text-center text-gray-500 text-sm py-8">No issues found</div>');
      return;
    }

    issues.forEach(function(issue) {
      $list.append(renderIssueItem(issue));
    });
  }

  function renderIssueItem(issue) {
    var labelsHtml = '';

    if (issue.labels && issue.labels.length > 0) {
      labelsHtml = issue.labels.map(function(label) {
        return '<span class="inline-block bg-gray-600 text-gray-200 text-xs px-1.5 py-0.5 rounded">' +
          escapeHtml(label) + '</span>';
      }).join(' ');
    }

    var stateColor = issue.state === 'OPEN' ? 'text-green-400' : 'text-purple-400';
    var stateIcon = issue.state === 'OPEN'
      ? '<svg class="w-3.5 h-3.5 inline-block mr-1" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
      : '<svg class="w-3.5 h-3.5 inline-block mr-1" fill="currentColor" viewBox="0 0 16 16"><path d="M11.28 6.78a.75.75 0 00-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l3.5-3.5z"/><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

    return '<div class="issue-item border border-transparent hover:border-gray-600 p-2.5 rounded cursor-pointer hover:bg-gray-700/50 transition-colors" data-issue-number="' + issue.number + '">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="' + stateColor + '">' + stateIcon + '</span>' +
            '<span class="font-medium text-sm text-white truncate">' + escapeHtml(issue.title) + '</span>' +
            '<span class="text-gray-500 text-xs shrink-0">#' + issue.number + '</span>' +
          '</div>' +
          (labelsHtml ? '<div class="flex gap-1 mt-1 flex-wrap">' + labelsHtml + '</div>' : '') +
          '<div class="text-xs text-gray-500 mt-1">' +
            'by ' + escapeHtml(issue.author) +
            (issue.commentsCount > 0 ? ' &middot; ' + issue.commentsCount + ' comment' + (issue.commentsCount !== 1 ? 's' : '') : '') +
          '</div>' +
        '</div>' +
        '<div class="flex gap-1 shrink-0">' +
          '<button class="issue-start-working bg-purple-600 hover:bg-purple-500 text-white text-xs px-2 py-1 rounded transition-colors" title="Start working on this issue">Work</button>' +
          '<button class="issue-add-roadmap bg-gray-600 hover:bg-gray-500 text-white text-xs px-2 py-1 rounded transition-colors" title="Add to roadmap">+Roadmap</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function selectIssue(issueNumber) {
    var projectId = state.currentProject.id;

    if (!projectId || !cachedRepoId[projectId]) return;

    var repo = cachedRepoId[projectId];

    api.getGitHubIssueDetail(issueNumber, repo)
      .done(function(detail) {
        renderIssueDetail(detail);
        openModal('modal-github-issue-detail');
      })
      .fail(function() {
        showToast('Failed to load issue details', 'error');
      });
  }

  function renderIssueDetailButtons(issue) {
    $('#issue-detail-title').text('#' + issue.number + ' ' + issue.title);
    $('#btn-issue-detail-start').data('issue-number', issue.number);
    $('#btn-issue-detail-roadmap').data('issue-number', issue.number);
    $('#btn-issue-detail-close-issue').data('issue-number', issue.number);

    if (issue.state !== 'OPEN') {
      $('#btn-issue-detail-close-issue').addClass('hidden');
    } else {
      $('#btn-issue-detail-close-issue').removeClass('hidden');
    }

    var currentWork = getActiveWorkForProject(state.currentProject.id);

    if (currentWork && currentWork.issueNumber === issue.number) {
      $('#btn-issue-detail-finish').removeClass('hidden');
      $('#btn-issue-detail-start').addClass('hidden');
    } else {
      $('#btn-issue-detail-finish').addClass('hidden');
      $('#btn-issue-detail-start').removeClass('hidden');
    }
  }

  function renderIssueComments(comments) {
    if (!comments || comments.length === 0) return '';

    var html = '<div class="mt-4 border-t border-gray-700 pt-3">' +
      '<div class="text-xs font-medium text-gray-400 mb-2">Comments (' + comments.length + ')</div>';

    comments.forEach(function(comment) {
      html += '<div class="mb-3 pl-3 border-l-2 border-gray-700">' +
        '<div class="text-xs text-gray-500">' + escapeHtml(comment.author) +
          ' &middot; ' + new Date(comment.createdAt).toLocaleDateString() + '</div>' +
        '<div class="text-sm text-gray-300 mt-1 whitespace-pre-wrap break-words">' + escapeHtml(comment.body) + '</div>' +
      '</div>';
    });

    return html + '</div>';
  }

  function renderIssueDetail(detail) {
    var issue = detail.issue;
    renderIssueDetailButtons(issue);

    var bodyHtml = issue.body
      ? '<div class="text-sm text-gray-300 whitespace-pre-wrap break-words">' + escapeHtml(issue.body) + '</div>'
      : '<div class="text-sm text-gray-500 italic">No description</div>';

    var labelsHtml = '';

    if (issue.labels.length > 0) {
      labelsHtml = '<div class="flex gap-1 flex-wrap mb-3">' +
        issue.labels.map(function(l) {
          return '<span class="bg-gray-600 text-gray-200 text-xs px-1.5 py-0.5 rounded">' + escapeHtml(l) + '</span>';
        }).join('') +
      '</div>';
    }

    var metaHtml = '<div class="text-xs text-gray-500 mb-3">' +
      'by ' + escapeHtml(issue.author) +
      ' &middot; ' + new Date(issue.createdAt).toLocaleDateString() +
      (issue.assignees.length > 0 ? ' &middot; Assigned: ' + issue.assignees.map(escapeHtml).join(', ') : '') +
      (issue.milestone ? ' &middot; Milestone: ' + escapeHtml(issue.milestone) : '') +
    '</div>';

    $('#issue-detail-body').html(labelsHtml + metaHtml + bodyHtml + renderIssueComments(detail.comments));
  }

  function detectBranchType(labels) {
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i].toLowerCase();

      if (label === 'bug') return 'fix';
      if (label === 'documentation' || label === 'docs') return 'docs';
    }

    return 'feat';
  }

  function extractInitials(fullName) {
    if (!fullName) return 'dev';

    return fullName.trim().split(/\s+/)
      .map(function(w) { return w[0]; })
      .join('')
      .toLowerCase()
      .substring(0, 3);
  }

  function generateBranchSlug(issueNumber, title, labels, initials) {
    var type = detectBranchType(labels);
    var slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 40);

    return type + '/' + initials + '/' + issueNumber + '-' + slug;
  }

  function detectDefaultBranch(branches) {
    if (branches.local.indexOf('main') >= 0) return 'main';
    if (branches.local.indexOf('master') >= 0) return 'master';
    return 'main';
  }

  function buildEnhancedIssuePrompt(issue, branchName, pr) {
    var lines = [
      'I need to work on the following GitHub issue:\n',
      '**Issue #' + issue.number + ': ' + issue.title + '**',
      'URL: ' + issue.url + '\n',
    ];

    if (issue.body) {
      lines.push('**Description:**');
      lines.push(issue.body + '\n');
    }

    if (issue.labels.length > 0) {
      lines.push('**Labels:** ' + issue.labels.join(', '));
    }

    lines.push('\n**Branch:** `' + branchName + '`');
    lines.push('**Draft PR:** #' + pr.number + ' (' + pr.url + ')');
    lines.push('\nPlease analyze this issue and implement the necessary changes.');
    lines.push('The branch and draft PR are already set up.');
    lines.push('When done, let me know so I can finalize and push the changes.');

    return lines.join('\n');
  }

  function startWorkingOnIssue(issueNumber, $btn) {
    var projectId = state.currentProject.id;

    if (!projectId || !cachedRepoId[projectId]) return;

    var existingWork = getActiveWorkForProject(projectId);

    if (existingWork) {
      showToast('Already working on issue #' + existingWork.issueNumber + '. Finish it first.', 'error');
      return;
    }

    if ($btn) $btn.addClass('btn-loading');
    setIssuesModalBlocking(true, 'Checking working tree...');

    var opts = {
      projectId: projectId,
      repo: cachedRepoId[projectId],
      issueNumber: issueNumber,
      $btn: $btn,
    };

    checkCleanWorkingTree(opts);
  }

  function checkCleanWorkingTree(opts) {
    api.getGitStatus(opts.projectId)
      .done(function(status) {
        var dirtyCount = status.staged.length + status.unstaged.length + status.untracked.length;

        if (dirtyCount > 0) {
          if (opts.$btn) opts.$btn.removeClass('btn-loading');
          setIssuesModalBlocking(false);
          showDirtyWarning(status);
          return;
        }

        updateBlockingMessage('Fetching issue details...');
        fetchIssueAndSetupBranch(opts);
      })
      .fail(function() {
        if (opts.$btn) opts.$btn.removeClass('btn-loading');
        setIssuesModalBlocking(false);
        showToast('Failed to check git status', 'error');
      });
  }

  function showDirtyWarning(status) {
    var details = [];

    if (status.staged.length > 0) {
      details.push(status.staged.length + ' staged file(s)');
    }

    if (status.unstaged.length > 0) {
      details.push(status.unstaged.length + ' modified file(s)');
    }

    if (status.untracked.length > 0) {
      details.push(status.untracked.length + ' untracked file(s)');
    }

    $('#dirty-warning-details').text(details.join(', '));
    openModal('modal-issue-dirty-warning');
  }

  function fetchIssueAndSetupBranch(opts) {
    var detailPromise = api.getGitHubIssueDetail(opts.issueNumber, opts.repo);
    var branchesPromise = api.getGitBranches(opts.projectId);
    var userNamePromise = api.getGitUserName(opts.projectId);

    $.when(detailPromise, branchesPromise, userNamePromise)
      .done(function(detailResult, branchesResult, userNameResult) {
        var detail = detailResult[0];
        var branches = branchesResult[0];
        var userName = userNameResult[0].name;
        var defaultBranch = detectDefaultBranch(branches);
        var initials = extractInitials(userName);
        var branchName = generateBranchSlug(
          opts.issueNumber, detail.issue.title, detail.issue.labels, initials
        );

        setupBranchAndPR({
          projectId: opts.projectId,
          repo: opts.repo,
          issueNumber: opts.issueNumber,
          $btn: opts.$btn,
          detail: detail,
          defaultBranch: defaultBranch,
          branchName: branchName,
          branches: branches,
        });
      })
      .fail(function() {
        if (opts.$btn) opts.$btn.removeClass('btn-loading');
        setIssuesModalBlocking(false);
        showToast('Failed to load issue details or branches', 'error');
      });
  }

  function branchExistsLocally(branches, name) {
    return branches.local.indexOf(name) >= 0;
  }

  function branchExistsOnRemote(branches, name) {
    return branches.remote.some(function(r) {
      return r === 'origin/' + name || r === 'remotes/origin/' + name;
    });
  }

  function checkoutOrCreateBranch(opts) {
    var branches = opts.branches;

    if (branchExistsLocally(branches, opts.branchName)) {
      updateBlockingMessage('Switching to existing branch...');
      return api.gitCheckout(opts.projectId, opts.branchName);
    }

    if (branchExistsOnRemote(branches, opts.branchName)) {
      updateBlockingMessage('Tracking remote branch...');
      return api.gitCheckout(opts.projectId, opts.branchName);
    }

    updateBlockingMessage('Creating branch ' + opts.branchName + '...');
    return api.gitCreateBranch(opts.projectId, opts.branchName, true);
  }

  function createOrFindPR(opts) {
    updateBlockingMessage('Checking for existing PR...');

    return api.getGitHubPulls({ repo: opts.repo, state: 'open' })
      .then(function(pulls) {
        var existing = pulls.find(function(pr) {
          return pr.headBranch === opts.branchName;
        });

        if (existing) {
          return existing;
        }

        updateBlockingMessage('Creating draft PR...');
        return api.createGitHubPR({
          repo: opts.repo,
          title: opts.detail.issue.title,
          body: 'Resolves #' + opts.issueNumber + '\n\n_Work in progress..._',
          base: opts.defaultBranch,
          head: opts.branchName,
          projectId: opts.projectId,
          draft: true,
        });
      });
  }

  function setupBranchAndPR(opts) {
    updateBlockingMessage('Checking out ' + opts.defaultBranch + '...');
    api.gitCheckout(opts.projectId, opts.defaultBranch)
      .then(function() {
        updateBlockingMessage('Pulling latest with rebase...');
        return api.gitPull(opts.projectId, 'origin', opts.defaultBranch, true);
      })
      .then(function() {
        return checkoutOrCreateBranch(opts);
      })
      .then(function() {
        updateBlockingMessage('Pushing branch...');
        return api.gitPush(opts.projectId, 'origin', opts.branchName, true);
      })
      .then(function() {
        return createOrFindPR(opts);
      })
      .then(function(pr) {
        storeActiveWork(opts, pr);
        sendIssuePromptToAgent(opts, pr);
      })
      .fail(function(xhr) {
        if (opts.$btn) opts.$btn.removeClass('btn-loading');
        setIssuesModalBlocking(false);
        var msg = xhr && xhr.responseJSON ? xhr.responseJSON.error : 'Failed to set up branch/PR';
        showToast(msg, 'error');
      });
  }

  function storeActiveWork(opts, pr) {
    var work = {
      projectId: opts.projectId,
      issueNumber: opts.issueNumber,
      branchName: opts.branchName,
      prNumber: pr.number,
      prUrl: pr.url,
      repo: opts.repo,
      defaultBranch: opts.defaultBranch,
      issueTitle: opts.detail.issue.title,
    };
    setActiveWorkForProject(opts.projectId, work);
    showActiveIssueIndicator();
    updateGitHubBadge(opts.projectId);
  }

  function sendIssuePromptToAgent(opts, pr) {
    var prompt = buildEnhancedIssuePrompt(opts.detail.issue, opts.branchName, pr);

    if (opts.$btn) opts.$btn.removeClass('btn-loading');
    setIssuesModalBlocking(false);

    closeModal('modal-github-issue-detail');
    closeModal('modal-github-issues');

    var project = findProjectById(opts.projectId);

    if (project && project.status === 'running') {
      doSendMessage(prompt);
    } else {
      startInteractiveAgentWithMessage(prompt);
    }
  }

  function showActiveIssueIndicator(projectId) {
    var pid = projectId || (state.currentProject ? state.currentProject.id : null);
    var work = pid ? getActiveWorkForProject(pid) : null;

    if (!work) {
      hideActiveIssueIndicator();
      return;
    }

    $('#active-issue-number').text(work.issueNumber);
    $('#active-issue-indicator').removeClass('hidden');
  }

  function hideActiveIssueIndicator() {
    $('#active-issue-indicator').addClass('hidden');
  }

  function setIssuesModalBlocking(isBlocking, message) {
    var selectors = '#modal-github-issues .modal-content > div, #modal-github-issue-detail .modal-content > div';
    var $containers = $(selectors);

    if (isBlocking) {
      $containers.each(function() {
        var $el = $(this);
        if ($el.css('position') === 'static') {
          $el.css('position', 'relative');
        }

        var $overlay = $el.find('.issue-blocking-overlay');

        if ($overlay.length === 0) {
          $overlay = $('<div class="issue-blocking-overlay content-loading-overlay">' +
            '<div class="text-center">' +
              '<div class="loading-spinner mx-auto mb-2"></div>' +
              '<div class="issue-blocking-message text-xs text-gray-400"></div>' +
            '</div>' +
          '</div>');
          $el.append($overlay);
        }

        $overlay.find('.issue-blocking-message').text(message || '');
        $overlay.removeClass('hidden');
      });
    } else {
      $containers.find('.issue-blocking-overlay').addClass('hidden');
    }
  }

  function updateBlockingMessage(message) {
    $('.issue-blocking-message').text(message || '');
  }

  function finishIssueWork($btn) {
    var projectId = state.currentProject ? state.currentProject.id : null;

    if (!projectId) {
      showToast('No project selected', 'error');
      return;
    }

    var work = getActiveWorkForProject(projectId);

    if (!work) {
      showToast('No active issue work to finish', 'error');
      return;
    }

    if ($btn) $btn.addClass('btn-loading');

    stageCommitAndPush(projectId, work)
      .then(function() {
        return commentOnFinish(work);
      })
      .then(function() {
        return commentOnPRFinish(work);
      })
      .then(function() {
        setActiveWorkForProject(projectId, null);
        hideActiveIssueIndicator();
        updateGitHubBadge(projectId);
        if ($btn) $btn.removeClass('btn-loading');
        showToast('Changes pushed. PR #' + work.prNumber + ' is ready for review.', 'success');
      })
      .fail(function(xhr) {
        if ($btn) $btn.removeClass('btn-loading');
        var msg = xhr && xhr.responseJSON ? xhr.responseJSON.error : 'Failed to finish issue work';
        showToast(msg, 'error');
      });
  }

  function stageCommitAndPush(projectId, work) {
    var commitMsg = 'feat: resolve #' + work.issueNumber + ' - ' + work.issueTitle;

    return api.gitStageAll(projectId)
      .then(function() {
        return api.gitCommit(projectId, commitMsg);
      })
      .then(function() {
        return api.gitPush(projectId, 'origin', work.branchName, true);
      });
  }

  function commentOnFinish(work) {
    var body = 'Changes pushed to branch `' + work.branchName + '` (PR #' + work.prNumber + ').';
    return api.commentOnGitHubIssue(work.issueNumber, work.repo, body);
  }

  function commentOnPRFinish(work) {
    if (!work.prNumber || !work.repo) return $.Deferred().resolve().promise();

    var body = 'Changes pushed to branch `' + work.branchName + '`. Ready for review.';
    return api.commentOnGitHubPR(work.prNumber, work.repo, body);
  }

  function updateGitHubBadge(projectId) {
    var pid = projectId || (state.currentProject ? state.currentProject.id : null);
    var work = pid ? getActiveWorkForProject(pid) : null;
    var $btn = $('#btn-github-menu');

    if (work) {
      if ($btn.find('.github-badge').length === 0) {
        $btn.append('<span class="github-badge absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full"></span>');
      }
    } else {
      $btn.find('.github-badge').remove();
    }
  }

  function onProjectChanged(projectId) {
    showActiveIssueIndicator(projectId);
    updateGitHubBadge(projectId);
  }

  function showAddToRoadmapDialog(issueNumber) {
    var projectId = state.currentProject.id;

    if (!projectId || !cachedRepoId[projectId]) return;

    var repo = cachedRepoId[projectId];

    api.getGitHubIssueDetail(issueNumber, repo)
      .done(function(detail) {
        var issue = detail.issue;
        var taskTitle = issue.title + ' ([#' + issue.number + '](' + issue.url + '))';

        $('#add-to-roadmap-task-title').val(taskTitle);
        $('#add-to-roadmap-issue-number').val(issue.number);

        loadRoadmapMilestones();
        openModal('modal-add-to-roadmap');
      })
      .fail(function() {
        showToast('Failed to load issue details', 'error');
      });
  }

  function loadRoadmapMilestones() {
    var projectId = state.currentProject.id;

    if (!projectId) return;

    api.getProjectRoadmap(projectId)
      .done(function(data) {
        if (!data || !data.parsed) {
          $('#add-to-roadmap-milestone').html('<option value="">No roadmap found</option>');
          return;
        }

        var options = '';

        data.parsed.phases.forEach(function(phase) {
          phase.milestones.forEach(function(milestone) {
            options += '<option value="' + escapeHtml(phase.id) + '|' + escapeHtml(milestone.id) + '">' +
              escapeHtml(phase.title) + ' > ' + escapeHtml(milestone.title) +
            '</option>';
          });
        });

        if (!options) {
          options = '<option value="">No milestones found</option>';
        }

        $('#add-to-roadmap-milestone').html(options);
      })
      .fail(function() {
        $('#add-to-roadmap-milestone').html('<option value="">Failed to load roadmap</option>');
      });
  }

  function confirmAddToRoadmap() {
    var projectId = state.currentProject.id;

    if (!projectId) return;

    var milestoneValue = $('#add-to-roadmap-milestone').val();
    var taskTitle = $('#add-to-roadmap-task-title').val();

    if (!milestoneValue || !taskTitle) {
      showToast('Please select a milestone and enter a task title', 'error');
      return;
    }

    var parts = milestoneValue.split('|');
    var phaseId = parts[0];
    var milestoneId = parts[1];

    api.addRoadmapTask(projectId, {
      phaseId: phaseId,
      milestoneId: milestoneId,
      taskTitle: taskTitle,
    })
    .done(function() {
      showToast('Task added to roadmap', 'success');
      closeModal('modal-add-to-roadmap');
    })
    .fail(function(xhr) {
      var msg = xhr.responseJSON ? xhr.responseJSON.error : 'Failed to add task';
      showToast(msg, 'error');
    });
  }

  function closeIssue(issueNumber) {
    var projectId = state.currentProject.id;

    if (!projectId || !cachedRepoId[projectId]) return;

    var repo = cachedRepoId[projectId];

    if (!confirm('Close issue #' + issueNumber + '?')) return;

    api.closeGitHubIssue(issueNumber, repo)
      .done(function() {
        showToast('Issue #' + issueNumber + ' closed', 'success');
        closeModal('modal-github-issue-detail');
        loadIssues();
      })
      .fail(function() {
        showToast('Failed to close issue', 'error');
      });
  }

  function openCreateIssueModal() {
    // Reset form
    $('#create-issue-title').val('');
    $('#create-issue-body').val('');
    $('#create-issue-labels').html('<span class="text-gray-500">Loading...</span>');
    $('#create-issue-assignees').html('<span class="text-gray-500">Loading...</span>');
    $('#create-issue-milestone').html('<option value="">None</option>');

    openModal('modal-create-issue');

    // Load metadata in parallel
    var projectId = state.currentProject ? state.currentProject.id : null;

    if (!projectId || !cachedRepoId[projectId]) return;

    var repo = cachedRepoId[projectId];
    loadCheckboxMetadata(api.getGitHubLabels(repo), '#create-issue-labels', 'name', 'name');
    loadCheckboxMetadata(api.getGitHubCollaborators(repo), '#create-issue-assignees', 'login', 'login');
    loadMilestoneOptions(repo);
  }

  function loadCheckboxMetadata(promise, selector, valueKey, displayKey) {
    promise
      .done(function(items) { renderCheckboxList(selector, items, valueKey, displayKey); })
      .fail(function() { $(selector).html('<span class="text-red-400">Failed to load</span>'); });
  }

  function loadMilestoneOptions(repo) {
    api.getGitHubMilestones(repo)
      .done(function(milestones) {
        var html = '<option value="">None</option>';

        for (var i = 0; i < milestones.length; i++) {
          var m = milestones[i];
          html += '<option value="' + escapeHtml(m.title) + '">' + escapeHtml(m.title) + '</option>';
        }

        $('#create-issue-milestone').html(html);
      });
  }

  function renderCheckboxList(selector, items, valueKey, displayKey) {
    if (!items || items.length === 0) {
      $(selector).html('<span class="text-gray-500 italic">None available</span>');
      return;
    }

    var html = '';

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var val = item[valueKey] || '';
      var label = item[displayKey] || val;
      html += '<label class="flex items-center gap-1.5 py-0.5 cursor-pointer hover:text-gray-200">' +
        '<input type="checkbox" value="' + escapeHtml(val) + '" class="rounded border-gray-500">' +
        '<span>' + escapeHtml(label) + '</span>' +
        '</label>';
    }

    $(selector).html(html);
  }

  function getCheckedValues(containerSelector) {
    var values = [];
    $(containerSelector).find('input[type="checkbox"]:checked').each(function() {
      values.push($(this).val());
    });
    return values;
  }

  function submitNewIssue() {
    var title = $('#create-issue-title').val().trim();

    if (!title) {
      showToast('Title is required', 'error');
      $('#create-issue-title').focus();
      return;
    }

    var projectId = state.currentProject ? state.currentProject.id : null;

    if (!projectId || !cachedRepoId[projectId]) return;

    var repo = cachedRepoId[projectId];
    var data = {
      repo: repo,
      title: title,
      body: $('#create-issue-body').val().trim(),
      labels: getCheckedValues('#create-issue-labels'),
      assignees: getCheckedValues('#create-issue-assignees'),
      milestone: $('#create-issue-milestone').val() || undefined,
    };

    var $btn = $('#btn-create-issue-submit');
    $btn.prop('disabled', true).text('Creating...');

    api.createGitHubIssue(data)
      .done(function(issue) {
        showToast('Issue #' + issue.number + ' created', 'success');
        closeModal('modal-create-issue');
        loadIssues();
      })
      .fail(function() {
        showToast('Failed to create issue', 'error');
      })
      .always(function() {
        $btn.prop('disabled', false).text('Create Issue');
      });
  }

  function commentOnIssue(issueNumber, body) {
    var projectId = state.currentProject.id;

    if (!projectId || !cachedRepoId[projectId]) return;

    var repo = cachedRepoId[projectId];

    api.commentOnGitHubIssue(issueNumber, repo, body)
      .done(function() {
        showToast('Comment added to issue #' + issueNumber, 'success');
      })
      .fail(function() {
        showToast('Failed to add comment', 'error');
      });
  }

  return {
    init: init,
    openIssuesPanel: openIssuesPanel,
    loadIssues: loadIssues,
    commentOnIssue: commentOnIssue,
    finishIssueWork: finishIssueWork,
    getActiveIssueWork: function(projectId) {
      var pid = projectId || (state && state.currentProject ? state.currentProject.id : null);
      return pid ? getActiveWorkForProject(pid) : null;
    },
    onProjectChanged: onProjectChanged,
    generateBranchSlug: generateBranchSlug,
    detectDefaultBranch: detectDefaultBranch,
  };
}));
