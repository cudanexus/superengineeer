/**
 * GitHub Pull Requests Module
 * Handles PR creation, review comments display, and "Fix PR Feedback" action
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GitHubPRModule = factory();
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

  var cachedRepoId = {};

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
    setupHandlers();
  }

  function setupHandlers() {
    $('#btn-create-pr').on('click', function() {
      closeModal('modal-pr-list');
      openCreatePRModal();
    });

    $('#btn-view-prs').on('click', function() {
      openPRList();
    });

    $('#btn-pr-generate-description').on('click', function() {
      generatePRDescription();
    });

    $('#btn-pr-submit').on('click', function() {
      submitPR();
    });

    $(document).on('click', '.pr-view-btn', function(e) {
      e.stopPropagation();
      var prNumber = $(this).data('pr-number');
      viewPRDetail(prNumber);
    });

    $(document).on('click', '.pr-item', function() {
      var prNumber = $(this).data('pr-number');
      viewPRDetail(prNumber);
    });

    $('#btn-pr-fix-feedback').on('click', function() {
      fixPRFeedback();
    });

    $('#btn-pr-open-github').on('click', function() {
      var prUrl = $(this).data('pr-url');

      if (prUrl) {
        window.open(prUrl, '_blank');
      }
    });

    $('#btn-pr-merge').on('click', function() {
      var prNumber = $(this).data('pr-number');
      mergePR(prNumber);
    });
  }

  function getProjectRepoId(callback) {
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
          showToast('Not a GitHub repository', 'error');
          return;
        }

        cachedRepoId[projectId] = data.repo;
        callback(data.repo);
      })
      .fail(function() {
        showToast('Failed to detect GitHub repository', 'error');
      });
  }

  function openCreatePRModal() {
    $('#pr-create-title').val('');
    $('#pr-create-body').val('');
    $('#pr-create-base').val('');
    $('#pr-create-draft').prop('checked', false);
    openModal('modal-create-pr');
  }

  function generatePRDescription() {
    if (!state.currentProject) return;

    var $btn = $('#btn-pr-generate-description');
    $btn.addClass('btn-loading');

    api.generatePRDescription(state.currentProject.id)
      .done(function(data) {
        $('#pr-create-title').val(data.title || '');
        $('#pr-create-body').val(data.body || '');
      })
      .fail(function() {
        showToast('Failed to generate PR description', 'error');
      })
      .always(function() {
        $btn.removeClass('btn-loading');
      });
  }

  function submitPR() {
    var title = $('#pr-create-title').val();
    var body = $('#pr-create-body').val();
    var base = $('#pr-create-base').val();
    var draft = $('#pr-create-draft').is(':checked');

    if (!title) {
      showToast('Title is required', 'error');
      return;
    }

    var projectId = state.selectedProjectId;

    if (!projectId) return;

    getProjectRepoId(function(repo) {
      var $btn = $('#btn-pr-submit');
      $btn.addClass('btn-loading');

      api.getGitBranches(projectId)
        .then(function(branches) {
          return api.createGitHubPR({
            repo: repo,
            title: title,
            body: body || '',
            base: base || undefined,
            head: branches.current,
            projectId: projectId,
            draft: draft,
          });
        })
        .done(function(pr) {
          showToast('PR #' + pr.number + ' created', 'success');
          closeModal('modal-create-pr');
        })
        .fail(function(xhr) {
          var msg = xhr.responseJSON
            ? xhr.responseJSON.error
            : 'Failed to create PR';
          showToast(msg, 'error');
        })
        .always(function() {
          $btn.removeClass('btn-loading');
        });
    });
  }

  function openPRList() {
    getProjectRepoId(function(repo) {
      $('#pr-list-content').html(
        '<div class="text-center text-gray-500 text-sm py-8">Loading...</div>'
      );
      openModal('modal-pr-list');
      loadPRList(repo);
    });
  }

  function loadPRList(repo) {
    api.getGitHubPulls({ repo: repo, state: 'open', limit: 30 })
      .done(function(prs) {
        renderPRList(prs);
      })
      .fail(function() {
        $('#pr-list-content').html(
          '<div class="text-center text-red-400 text-sm py-8">Failed to load PRs</div>'
        );
      });
  }

  function renderPRList(prs) {
    var $list = $('#pr-list-content');

    if (!prs || prs.length === 0) {
      $list.html(
        '<div class="text-center text-gray-500 text-sm py-8">No open pull requests</div>'
      );
      return;
    }

    var html = prs.map(function(pr) {
      var badges = '';

      if (pr.isDraft) {
        badges += '<span class="text-xs bg-yellow-900 text-yellow-300 px-1.5 py-0.5 rounded">Draft</span>';
      }

      if (pr.reviewDecision === 'APPROVED') {
        badges += '<span class="text-xs bg-green-900 text-green-300 px-1.5 py-0.5 rounded">Approved</span>';
      } else if (pr.reviewDecision === 'CHANGES_REQUESTED') {
        badges += '<span class="text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded">Changes Requested</span>';
      }

      return '<div class="pr-item p-2.5 rounded hover:glass-panel/50 border border-transparent hover:!border-[var(--theme-border)] transition-colors" data-pr-number="' + pr.number + '">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-1.5">' +
              '<span class="text-green-400">' +
                '<svg class="w-3.5 h-3.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/>' +
                '</svg>' +
              '</span>' +
              '<span class="font-medium text-sm text-white truncate">' + escapeHtml(pr.title) + '</span>' +
              '<span class="text-gray-500 text-xs shrink-0">#' + pr.number + '</span>' +
            '</div>' +
            '<div class="text-xs text-gray-500 mt-1">' +
              escapeHtml(pr.headBranch) + ' &rarr; ' + escapeHtml(pr.baseBranch) +
              ' &middot; by ' + escapeHtml(pr.author) +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-1.5 shrink-0">' +
            badges +
            '<button class="pr-view-btn bg-gray-600 hover:bg-gray-500 text-white px-2 py-0.5 rounded text-xs transition-colors" data-pr-number="' + pr.number + '">View</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    $list.html(html);
  }

  function viewPRDetail(prNumber) {
    getProjectRepoId(function(repo) {
      api.getGitHubPRDetail(prNumber, repo)
        .done(function(detail) {
          renderPRDetail(detail);
          openModal('modal-pr-detail');
        })
        .fail(function() {
          showToast('Failed to load PR details', 'error');
        });
    });
  }

  function renderPRDetail(detail) {
    var pr = detail.pr;
    var reviews = detail.reviews || [];
    var comments = detail.comments || [];

    var titlePrefix = pr.isDraft ? '[DRAFT] ' : '';
    $('#pr-detail-title').text(titlePrefix + '#' + pr.number + ' ' + pr.title);
    $('#btn-pr-fix-feedback').data('pr-number', pr.number);

    var bodyHtml = pr.body
      ? '<div class="text-sm text-gray-300 whitespace-pre-wrap break-words">' + escapeHtml(pr.body) + '</div>'
      : '<div class="text-sm text-gray-500 italic">No description</div>';

    var draftBadge = pr.isDraft
      ? '<span class="text-xs bg-yellow-900 text-yellow-300 px-1.5 py-0.5 rounded">Draft</span> '
      : '';

    var metaHtml = '<div class="text-xs text-gray-500 mb-3">' +
      draftBadge +
      escapeHtml(pr.headBranch) + ' &rarr; ' + escapeHtml(pr.baseBranch) +
      ' &middot; by ' + escapeHtml(pr.author) +
      ' &middot; ' + new Date(pr.createdAt).toLocaleDateString() +
    '</div>';

    var reviewsHtml = renderReviewsSection(reviews);
    var commentsHtml = renderCommentsSection(comments);

    $('#pr-detail-body').html(metaHtml + bodyHtml + reviewsHtml + commentsHtml);

    // Open in GitHub button - always visible
    $('#btn-pr-open-github').data('pr-url', pr.url).removeClass('hidden');

    // Merge button - only for open PRs
    var $mergeBtn = $('#btn-pr-merge');
    $mergeBtn.data('pr-number', pr.number).data('is-draft', !!pr.isDraft);

    if (pr.state === 'OPEN') {
      var mergeLabel = pr.isDraft ? 'Mark Ready & Merge' : 'Merge';
      $mergeBtn.text(mergeLabel).removeClass('hidden');
    } else {
      $mergeBtn.addClass('hidden');
    }

    // Fix PR Feedback button
    var hasFeedback = reviews.some(function(r) {
      return r.state === 'CHANGES_REQUESTED';
    }) || comments.length > 0;

    if (hasFeedback) {
      $('#btn-pr-fix-feedback').removeClass('hidden');
    } else {
      $('#btn-pr-fix-feedback').addClass('hidden');
    }
  }

  function renderReviewsSection(reviews) {
    if (!reviews || reviews.length === 0) return '';

    var html = '<div class="mt-4 border-t border-gray-700 pt-3">' +
      '<div class="text-xs font-medium text-gray-400 mb-2">Reviews (' + reviews.length + ')</div>';

    reviews.forEach(function(review) {
      var stateColor = review.state === 'APPROVED' ? 'text-green-400'
        : review.state === 'CHANGES_REQUESTED' ? 'text-red-400'
        : 'text-gray-400';

      html += '<div class="mb-3 pl-3 border-l-2 border-gray-700">' +
        '<div class="text-xs">' +
          '<span class="' + stateColor + '">' + escapeHtml(review.state) + '</span>' +
          ' &middot; ' + escapeHtml(review.author) +
          ' &middot; ' + new Date(review.submittedAt).toLocaleDateString() +
        '</div>' +
        (review.body
          ? '<div class="text-sm text-gray-300 mt-1 whitespace-pre-wrap break-words">' + escapeHtml(review.body) + '</div>'
          : '') +
      '</div>';
    });

    return html + '</div>';
  }

  function renderCommentsSection(comments) {
    if (!comments || comments.length === 0) return '';

    var html = '<div class="mt-4 border-t border-gray-700 pt-3">' +
      '<div class="text-xs font-medium text-gray-400 mb-2">Review Comments (' + comments.length + ')</div>';

    comments.forEach(function(comment) {
      var fileInfo = comment.path
        ? '<code class="text-xs !text-[var(--theme-accent-secondary)]">' + escapeHtml(comment.path) +
          (comment.line ? ':' + comment.line : '') + '</code> &middot; '
        : '';

      html += '<div class="mb-3 pl-3 border-l-2 border-gray-700">' +
        '<div class="text-xs text-gray-500">' +
          fileInfo + escapeHtml(comment.author) +
          ' &middot; ' + new Date(comment.createdAt).toLocaleDateString() +
        '</div>' +
        '<div class="text-sm text-gray-300 mt-1 whitespace-pre-wrap break-words">' + escapeHtml(comment.body) + '</div>' +
      '</div>';
    });

    return html + '</div>';
  }

  function fixPRFeedback() {
    var prNumber = $('#btn-pr-fix-feedback').data('pr-number');

    if (!prNumber) return;

    getProjectRepoId(function(repo) {
      var $btn = $('#btn-pr-fix-feedback');
      $btn.addClass('btn-loading');

      api.getGitHubPRDetail(prNumber, repo)
        .done(function(detail) {
          var prompt = buildFixFeedbackPrompt(detail);
          $btn.removeClass('btn-loading');

          closeModal('modal-pr-detail');
          closeModal('modal-pr-list');

          var projectId = state.currentProject.id;
          var project = findProjectById(projectId);

          if (project && project.status === 'running') {
            doSendMessage(prompt);
          } else {
            startInteractiveAgentWithMessage(prompt);
          }
        })
        .fail(function() {
          $btn.removeClass('btn-loading');
          showToast('Failed to load PR details', 'error');
        });
    });
  }

  function buildFixFeedbackPrompt(detail) {
    var pr = detail.pr;
    var reviews = detail.reviews || [];
    var comments = detail.comments || [];

    var lines = [
      'I need to address feedback on Pull Request #' + pr.number + ': ' + pr.title,
      'URL: ' + pr.url + '\n',
    ];

    var changesRequested = reviews.filter(function(r) {
      return r.state === 'CHANGES_REQUESTED' && r.body;
    });

    if (changesRequested.length > 0) {
      lines.push('**Review Feedback:**');

      changesRequested.forEach(function(r) {
        lines.push('- @' + r.author + ': ' + r.body);
      });

      lines.push('');
    }

    if (comments.length > 0) {
      lines.push('**Review Comments:**');

      comments.forEach(function(c) {
        var loc = c.path ? c.path + (c.line ? ':' + c.line : '') : 'general';
        lines.push('- `' + loc + '` (@' + c.author + '): ' + c.body);
      });

      lines.push('');
    }

    lines.push('Please fix all the review feedback above.');
    lines.push('After making changes, summarize what was fixed.');

    return lines.join('\n');
  }

  function setMergeBlocking(blocking, label) {
    var $overlay = $('#pr-detail-loading');

    if (blocking) {
      $('#pr-detail-loading-text').text(label || 'Merging...');
      $overlay.removeClass('hidden').addClass('flex');
    } else {
      $overlay.addClass('hidden').removeClass('flex');
    }
  }

  function mergePR(prNumber) {
    if (!prNumber) return;

    var isDraft = !!$('#btn-pr-merge').data('is-draft');
    var confirmMsg = isDraft
      ? 'This PR is a draft. It will be marked as ready and then merged. The branch will also be deleted. Continue?'
      : 'Merge PR #' + prNumber + '? This will also delete the branch.';

    if (!confirm(confirmMsg)) return;

    var loadingLabel = isDraft ? 'Marking ready & merging...' : 'Merging...';

    getProjectRepoId(function(repo) {
      setMergeBlocking(true, loadingLabel);

      api.mergeGitHubPR(prNumber, repo, { isDraft: isDraft })
        .done(function() {
          showToast('PR #' + prNumber + ' merged successfully', 'success');
          setMergeBlocking(false);
          closeModal('modal-pr-detail');
        })
        .fail(function(xhr) {
          var msg = xhr && xhr.responseJSON
            ? xhr.responseJSON.error
            : 'Failed to merge PR';
          showToast(msg, 'error');
          setMergeBlocking(false);
        });
    });
  }

  return {
    init: init,
    openCreatePRModal: openCreatePRModal,
    openPRList: openPRList,
  };
}));
