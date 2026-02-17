/**
 * @module InventifyModule
 * @description Frontend module for the Inventify project generator feature
 */

(function(root, factory) {
  'use strict';

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.InventifyModule = factory();
  }
})(typeof window !== 'undefined' ? window : global, function() {
  'use strict';

  var InventifyModule = {};
  var state = {
    phase: 'idle', // idle | brainstorming | selecting | naming | building
    activeOneOffId: null,
    placeholderProjectId: null,
    pendingStatusEvent: null,
    receivedFirstMessage: false,
    selectedIdeaIndex: null,
    lastTypes: null,
    lastThemes: null,
  };
  var deps = {};

  InventifyModule.init = function(options) {
    deps = options || {};
    bindEvents();
  };

  function bindEvents() {
    $(document).on('click', '#btn-inventify', openModal);
    $(document).on('click', '#btn-inventify-generate', startGeneration);
    $(document).on('click', '#btn-inventify-cancel', handleCancelClick);
    $(document).on('click', '#btn-inventify-close', handleCancelClick);
    $(document).on('click', '#modal-inventify .modal-backdrop', handleBackdropClick);
    $(document).on('click', '#btn-inventify-folder-browse', openFolderBrowser);
    $(document).on('click', '.inventify-idea-card', handleIdeaCardClick);
    $(document).on('change', 'input[name="inventify-idea"]', updateSelectButton);
    $(document).on('click', '#btn-inventify-select', handleSelectClick);
    $(document).on('click', '.inventify-name-card', handleNameCardClick);
    $(document).on('change', 'input[name="inventify-name"]', updateBuildButton);
    $(document).on('click', '#btn-inventify-build', handleBuildClick);
    $(document).on('click', '#btn-inventify-back', handleBack);
    $(document).on('click', '#btn-inventify-regenerate', regenerateIdeas);
  }

  function openModal() {
    var $modal = $('#modal-inventify');

    if ($modal.length === 0) return;

    loadSettings(function() {
      $modal.removeClass('hidden');
      resetForm();
    });
  }

  function handleCancelClick() {
    if (isModalLocked()) {
      cancelGeneration();
    } else {
      closeModal();
    }
  }

  function handleBackdropClick() {
    if (isModalLocked()) return;

    closeModal();
  }

  function closeModal() {
    if (state.activeOneOffId) {
      cancelAgentSilently();
    }

    $('#modal-inventify').addClass('hidden');
    resetForm();
  }

  function cancelGeneration() {
    cancelAgentSilently();
    unlockModal();
    showStatus('Generation cancelled.', 'error');
    resetToIdle();
  }

  function cancelAgentSilently() {
    var api = getApi();

    if (api) {
      api.cancelInventify();
    }

    state.activeOneOffId = null;
    unsubscribePlaceholder();
  }

  function isModalLocked() {
    return state.phase === 'brainstorming' ||
      state.phase === 'naming';
  }

  function flushPendingStatus(oneOffId) {
    if (!state.pendingStatusEvent) return;
    if (state.pendingStatusEvent.oneOffId !== oneOffId) return;

    var pending = state.pendingStatusEvent;
    state.pendingStatusEvent = null;
    InventifyModule.handleOneOffStatus(pending.oneOffId, pending.status);
  }

  function lockModal() {
    $('#btn-inventify-generate').prop('disabled', true);
    $('#btn-inventify-cancel').text('Cancel Generation');
    $('#btn-inventify-back').prop('disabled', true);
    $('#btn-inventify-folder-browse').prop('disabled', true);
    $('#btn-inventify-close').addClass('hidden');
    $('#inventify-output').removeClass('hidden');
    $('#inventify-output-content').text('Waiting for agent\'s response...');
    state.receivedFirstMessage = false;
  }

  function unlockModal() {
    $('#btn-inventify-cancel').text('Cancel');
    $('#btn-inventify-back').prop('disabled', false);
    $('#btn-inventify-folder-browse').prop('disabled', false);
    $('#btn-inventify-close').removeClass('hidden');
    $('#inventify-output').addClass('hidden');
    $('#inventify-output-content').empty();
  }

  function resetForm() {
    unsubscribePlaceholder();
    state.phase = 'idle';
    state.activeOneOffId = null;
    state.placeholderProjectId = null;
    state.pendingStatusEvent = null;
    state.receivedFirstMessage = false;
    state.selectedIdeaIndex = null;
    state.lastTypes = null;
    state.lastThemes = null;
    $('#inventify-types input[type="checkbox"]').prop('checked', false);
    $('#inventify-themes input[type="checkbox"]').prop('checked', false);
    $('#inventify-custom-types').val('');
    $('#inventify-custom-themes').val('');
    $('#inventify-status').addClass('hidden').empty();
    $('#inventify-ideas').addClass('hidden').empty();
    $('#inventify-names').addClass('hidden').empty();
    $('#inventify-form-sections').removeClass('hidden');
    $('#btn-inventify-generate').removeClass('hidden').prop('disabled', false).text('Generate!');
    $('#btn-inventify-select').addClass('hidden').prop('disabled', true);
    $('#btn-inventify-build').addClass('hidden').prop('disabled', true);
    $('#btn-inventify-back').addClass('hidden');
    $('#btn-inventify-regenerate').addClass('hidden');
    unlockModal();
  }

  function loadSettings(callback) {
    var api = getApi();

    if (!api) {
      callback();
      return;
    }

    api.getSettings().done(function(settings) {
      var folder = settings.inventifyFolder || '';
      $('#inventify-folder-path').text(folder || 'Not set');

      if (!folder) {
        $('#inventify-folder-warning').removeClass('hidden');
        $('#btn-inventify-generate').prop('disabled', true);
      } else {
        $('#inventify-folder-warning').addClass('hidden');
        $('#btn-inventify-generate').prop('disabled', false);
      }

      callback();
    }).fail(function() {
      callback();
    });
  }

  function openFolderBrowser() {
    var folderBrowser = deps.FolderBrowserModule;

    if (!folderBrowser || !deps.state) return;

    deps.state.folderBrowserCallback = function(selectedPath) {
      if (!selectedPath) return;

      var api = getApi();

      if (!api) return;

      api.updateSettings({ inventifyFolder: selectedPath }).done(function() {
        $('#inventify-folder-path').text(selectedPath);
        $('#inventify-folder-warning').addClass('hidden');
        $('#btn-inventify-generate').prop('disabled', false);
      });
    };
    folderBrowser.open();
  }

  function getCheckedValues(selector) {
    var values = [];

    $(selector + ' input[type="checkbox"]:checked').each(function() {
      values.push($(this).val());
    });

    return values;
  }

  function getCustomValues(selector) {
    var raw = $(selector).val();

    if (!raw || typeof raw !== 'string') return [];

    return raw.split(',')
      .map(function(v) { return v.trim(); })
      .filter(function(v) { return v.length > 0; });
  }

  function subscribePlaceholder() {
    if (state.placeholderProjectId && deps.subscribeToProject) {
      deps.subscribeToProject(state.placeholderProjectId);
    }
  }

  function unsubscribePlaceholder() {
    if (state.placeholderProjectId && deps.unsubscribeFromProject) {
      deps.unsubscribeFromProject(state.placeholderProjectId);
    }
  }

  function getApi() {
    return deps.api || (typeof ApiClient !== 'undefined' ? ApiClient : null);
  }

  function startGeneration() {
    if (state.phase !== 'idle') return;

    var projectTypes = getCheckedValues('#inventify-types')
      .concat(getCustomValues('#inventify-custom-types'));
    var themes = getCheckedValues('#inventify-themes')
      .concat(getCustomValues('#inventify-custom-themes'));

    if (projectTypes.length === 0) {
      showStatus('Please select or enter at least one project type.', 'error');
      return;
    }

    if (themes.length === 0) {
      showStatus('Please select or enter at least one theme.', 'error');
      return;
    }

    var api = getApi();

    if (!api) return;

    state.phase = 'brainstorming';
    state.lastTypes = projectTypes;
    state.lastThemes = themes;
    $('#btn-inventify-generate').text('Brainstorming...');
    $('#btn-inventify-regenerate').addClass('hidden');
    showStatus('Agent is brainstorming 5 project ideas...', 'info');
    lockModal();

    api.startInventify({
      projectTypes: projectTypes,
      themes: themes,
    }).done(function(result) {
      state.activeOneOffId = result.oneOffId;
      state.placeholderProjectId = result.placeholderProjectId;
      subscribePlaceholder();
      flushPendingStatus(result.oneOffId);
    }).fail(function(xhr) {
      state.phase = 'idle';
      unlockModal();
      $('#btn-inventify-generate').prop('disabled', false).text('Generate!');

      var errorMsg = 'Failed to start Inventify';

      if (xhr.responseJSON && xhr.responseJSON.error) {
        errorMsg = xhr.responseJSON.error;
      }

      showStatus(errorMsg, 'error');
    });
  }

  function regenerateIdeas() {
    if (!state.lastTypes || !state.lastThemes) return;

    var api = getApi();

    if (!api) return;

    state.phase = 'brainstorming';
    state.selectedIdeaIndex = null;
    $('#inventify-ideas').addClass('hidden').empty();
    $('#btn-inventify-select').addClass('hidden');
    $('#btn-inventify-regenerate').addClass('hidden');
    $('#btn-inventify-back').addClass('hidden');
    showStatus('Agent is brainstorming 5 project ideas...', 'info');
    lockModal();

    api.startInventify({
      projectTypes: state.lastTypes,
      themes: state.lastThemes,
    }).done(function(result) {
      state.activeOneOffId = result.oneOffId;
      state.placeholderProjectId = result.placeholderProjectId;
      subscribePlaceholder();
      flushPendingStatus(result.oneOffId);
    }).fail(function(xhr) {
      state.phase = 'idle';
      unlockModal();
      resetToIdle();

      var errorMsg = 'Failed to regenerate ideas';

      if (xhr.responseJSON && xhr.responseJSON.error) {
        errorMsg = xhr.responseJSON.error;
      }

      showStatus(errorMsg, 'error');
    });
  }

  function fetchAndRenderIdeas() {
    var api = getApi();

    if (!api) return;

    api.getInventifyIdeas().done(function(data) {
      if (data.ideas && data.ideas.length > 0) {
        renderIdeaCards(data.ideas);
      } else {
        showStatus('No ideas were generated. Try again.', 'error');
        resetToIdle();
      }
    }).fail(function() {
      showStatus('Failed to fetch ideas. Try again.', 'error');
      resetToIdle();
    });
  }

  function renderIdeaCards(ideas) {
    state.phase = 'selecting';
    var $ideas = $('#inventify-ideas');
    $ideas.empty().removeClass('hidden');

    $('#inventify-form-sections').addClass('hidden');
    $('#btn-inventify-generate').addClass('hidden');
    $('#btn-inventify-select').removeClass('hidden').prop('disabled', true);
    $('#btn-inventify-back').removeClass('hidden');
    $('#btn-inventify-regenerate').removeClass('hidden');
    showStatus('Pick an idea to build:', 'info');

    ideas.forEach(function(idea, index) {
      var card = buildIdeaCard(idea, index);
      $ideas.append(card);
    });
  }

  function buildIdeaCard(idea, index) {
    return '<label class="inventify-idea-card cursor-pointer p-3 rounded border border-gray-600 hover:border-purple-500 hover:bg-gray-700/50 transition-all block" data-index="' + index + '">' +
      '<div class="flex items-start gap-2">' +
        '<input type="radio" name="inventify-idea" value="' + index + '" class="mt-1 accent-purple-500">' +
        '<div class="flex-1 min-w-0">' +
          '<div class="font-medium text-sm text-white">' + escapeHtml(idea.name) + '</div>' +
          '<div class="text-xs text-yellow-400 mt-0.5">' + escapeHtml(idea.tagline) + '</div>' +
          '<div class="text-xs text-gray-400 mt-1">' + escapeHtml(idea.description) + '</div>' +
        '</div>' +
      '</div>' +
    '</label>';
  }

  function handleIdeaCardClick() {
    if (state.phase !== 'selecting') return;

    $(this).find('input[type="radio"]').prop('checked', true).trigger('change');
  }

  function updateSelectButton() {
    var hasSelection = $('input[name="inventify-idea"]:checked').length > 0;
    $('#btn-inventify-select').prop('disabled', !hasSelection);
  }

  function handleSelectClick() {
    if (state.phase !== 'selecting') return;

    var $checked = $('input[name="inventify-idea"]:checked');

    if ($checked.length === 0) return;

    var index = parseInt($checked.val(), 10);

    startNameSuggestion(index);
  }

  function startNameSuggestion(index) {
    var api = getApi();

    if (!api || isNaN(index)) return;

    state.phase = 'naming';
    state.selectedIdeaIndex = index;
    $('#inventify-ideas').addClass('hidden');
    $('#btn-inventify-select').addClass('hidden');
    $('#btn-inventify-back').addClass('hidden');
    $('#btn-inventify-regenerate').addClass('hidden');
    showStatus('Agent is suggesting project names...', 'info');
    lockModal();

    api.suggestInventifyNames(index).done(function(result) {
      state.activeOneOffId = result.oneOffId;
      flushPendingStatus(result.oneOffId);
    }).fail(function(xhr) {
      var errorMsg = 'Failed to suggest names';

      if (xhr.responseJSON && xhr.responseJSON.error) {
        errorMsg = xhr.responseJSON.error;
      }

      unlockModal();
      showStatus(errorMsg, 'error');
      resetToIdle();
    });
  }

  function fetchAndRenderNames() {
    var api = getApi();

    if (!api) return;

    api.getInventifyNameSuggestions().done(function(data) {
      if (data.names && data.names.length > 0) {
        renderNameCards(data.names);
      } else {
        showStatus('No name suggestions generated. Try again.', 'error');
        resetToIdle();
      }
    }).fail(function() {
      showStatus('Failed to fetch name suggestions. Try again.', 'error');
      resetToIdle();
    });
  }

  function renderNameCards(names) {
    var $names = $('#inventify-names');
    $names.empty().removeClass('hidden');

    $('#btn-inventify-build').removeClass('hidden').prop('disabled', true);
    $('#btn-inventify-back').removeClass('hidden');
    showStatus('Choose a project name:', 'info');

    names.forEach(function(name) {
      var card = buildNameCard(name);
      $names.append(card);
    });
  }

  function buildNameCard(name) {
    return '<label class="inventify-name-card cursor-pointer p-2 rounded border border-gray-600 hover:border-yellow-500 hover:bg-gray-700/50 transition-all block">' +
      '<div class="flex items-center gap-2">' +
        '<input type="radio" name="inventify-name" value="' + escapeHtml(name) + '" class="accent-yellow-500">' +
        '<span class="text-sm text-white font-mono">' + escapeHtml(name) + '</span>' +
      '</div>' +
    '</label>';
  }

  function handleNameCardClick() {
    if (state.phase !== 'naming') return;

    $(this).find('input[type="radio"]').prop('checked', true).trigger('change');
  }

  function updateBuildButton() {
    var hasSelection = $('input[name="inventify-name"]:checked').length > 0;
    $('#btn-inventify-build').prop('disabled', !hasSelection);
  }

  function handleBuildClick() {
    if (state.phase !== 'naming') return;

    var $checked = $('input[name="inventify-name"]:checked');

    if ($checked.length === 0 || state.selectedIdeaIndex === null) return;

    var projectName = $checked.val();

    startBuilding(state.selectedIdeaIndex, projectName);
  }

  function startBuilding(index, projectName) {
    var api = getApi();

    if (!api || isNaN(index)) return;

    state.phase = 'building';
    $('#btn-inventify-build').prop('disabled', true).text('Starting...');

    api.selectInventifyIdea(index, projectName).done(function(result) {
      var targetProjectId = result.newProjectId || result.placeholderProjectId;
      state.buildingProjectId = targetProjectId;

      $('#modal-inventify').addClass('hidden');

      if (deps.loadProjects) {
        deps.loadProjects();
      }

      setTimeout(function() {
        if (deps.selectProject) {
          deps.selectProject(targetProjectId);
        }

        setTimeout(function() {
          if (deps.startInteractiveAgentWithMessage && result.prompt) {
            deps.startInteractiveAgentWithMessage(result.prompt);
          }

          state.phase = 'idle';
          state.activeOneOffId = null;
          unsubscribePlaceholder();
        }, 300);
      }, 300);
    }).fail(function(xhr) {
      state.phase = 'naming';
      $('#btn-inventify-build').prop('disabled', false).text('Start building');

      var errorMsg = 'Failed to start building';

      if (xhr.responseJSON && xhr.responseJSON.error) {
        errorMsg = xhr.responseJSON.error;
      }

      showStatus(errorMsg, 'error');
    });
  }

  function handleBack() {
    resetForm();
  }

  function resetToIdle() {
    state.phase = 'idle';
    state.activeOneOffId = null;
    state.selectedIdeaIndex = null;
    $('#inventify-form-sections').removeClass('hidden');
    $('#inventify-ideas').addClass('hidden').empty();
    $('#inventify-names').addClass('hidden').empty();
    $('#btn-inventify-generate').removeClass('hidden').prop('disabled', false).text('Generate!');
    $('#btn-inventify-select').addClass('hidden');
    $('#btn-inventify-build').addClass('hidden');
    $('#btn-inventify-back').addClass('hidden');
    $('#btn-inventify-regenerate').addClass('hidden');
  }

  function showStatus(message, type) {
    var $status = $('#inventify-status');
    $status.removeClass('hidden');

    var colorClass = 'text-gray-400';

    if (type === 'error') {
      colorClass = 'text-red-400';
    } else if (type === 'success') {
      colorClass = 'text-green-400';
    }

    $status.html('<span class="' + colorClass + '">' + escapeHtml(message) + '</span>');
  }

  function escapeHtml(text) {
    if (deps.escapeHtml) return deps.escapeHtml(text);

    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  InventifyModule.handleOneOffMessage = function(oneOffId, data) {
    if (!isModalLocked()) return;
    if (state.activeOneOffId && oneOffId !== state.activeOneOffId) return;
    if (data.type !== 'stdout' && data.type !== 'result') return;

    var $content = $('#inventify-output-content');

    if ($content.length === 0) return;

    var text = data.type === 'result' && data.resultInfo
      ? data.resultInfo.result
      : data.content;

    if (!text) return;

    if (!state.receivedFirstMessage) {
      $content.empty();
      state.receivedFirstMessage = true;
    }

    $content.append(document.createTextNode(text));
    $content.scrollTop($content[0].scrollHeight);
  };

  InventifyModule.handleOneOffStatus = function(oneOffId, status) {
    if (!state.activeOneOffId && isModalLocked()) {
      state.pendingStatusEvent = { oneOffId: oneOffId, status: status };
      return;
    }

    if (oneOffId !== state.activeOneOffId) return;

    if (state.phase === 'brainstorming' && status === 'stopped') {
      state.activeOneOffId = null;
      unlockModal();
      fetchAndRenderIdeas();
      return;
    }

    if (state.phase === 'naming' && status === 'stopped') {
      state.activeOneOffId = null;
      unlockModal();
      fetchAndRenderNames();
      return;
    }

    if (status === 'error') {
      state.activeOneOffId = null;
      state.phase = 'idle';
      unsubscribePlaceholder();
      unlockModal();
      showStatus('Inventify agent encountered an error.', 'error');
      resetToIdle();
    }
  };

  InventifyModule.isGenerating = function() {
    return state.phase !== 'idle' && state.phase !== 'selecting';
  };

  return InventifyModule;
});
