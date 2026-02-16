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
    phase: 'idle', // idle | brainstorming | selecting | building
    activeOneOffId: null,
    placeholderProjectId: null,
  };
  var deps = {};

  InventifyModule.init = function(options) {
    deps = options || {};
    bindEvents();
  };

  function bindEvents() {
    $(document).on('click', '#btn-inventify', openModal);
    $(document).on('click', '#btn-inventify-generate', startGeneration);
    $(document).on('click', '#btn-inventify-cancel', closeModal);
    $(document).on('click', '#modal-inventify .modal-backdrop', closeModal);
    $(document).on('click', '#btn-inventify-folder-browse', openFolderBrowser);
    $(document).on('click', '.inventify-idea-card', handleIdeaClick);
    $(document).on('click', '#btn-inventify-back', handleBack);
  }

  function openModal() {
    var $modal = $('#modal-inventify');

    if ($modal.length === 0) return;

    loadSettings(function() {
      $modal.removeClass('hidden');
      resetForm();
    });
  }

  function closeModal() {
    $('#modal-inventify').addClass('hidden');
  }

  function resetForm() {
    state.phase = 'idle';
    state.activeOneOffId = null;
    state.placeholderProjectId = null;
    $('#inventify-types input[type="checkbox"]').prop('checked', false);
    $('#inventify-themes input[type="checkbox"]').prop('checked', false);
    $('#inventify-custom-types').val('');
    $('#inventify-custom-themes').val('');
    $('#inventify-status').addClass('hidden').empty();
    $('#inventify-ideas').addClass('hidden').empty();
    $('#inventify-form-sections').removeClass('hidden');
    $('#btn-inventify-generate').prop('disabled', false).text('Generate!');
    $('#btn-inventify-back').addClass('hidden');
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
    $('#btn-inventify-generate').prop('disabled', true).text('Brainstorming...');
    showStatus('Agent is brainstorming 5 project ideas...', 'info');

    api.startInventify({
      projectTypes: projectTypes,
      themes: themes,
    }).done(function(result) {
      state.activeOneOffId = result.oneOffId;
      state.placeholderProjectId = result.placeholderProjectId;
    }).fail(function(xhr) {
      state.phase = 'idle';
      $('#btn-inventify-generate').prop('disabled', false).text('Generate!');

      var errorMsg = 'Failed to start Inventify';

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
    $('#btn-inventify-back').removeClass('hidden');
    showStatus('Pick an idea to build:', 'info');

    ideas.forEach(function(idea, index) {
      var card = '<div class="inventify-idea-card cursor-pointer p-3 rounded border border-gray-600 hover:border-purple-500 hover:bg-gray-700/50 transition-all" data-index="' + index + '">' +
        '<div class="flex items-start gap-2">' +
          '<span class="text-purple-400 font-mono text-xs mt-0.5">' + (index + 1) + '</span>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="font-medium text-sm text-white">' + escapeHtml(idea.name) + '</div>' +
            '<div class="text-xs text-yellow-400 mt-0.5">' + escapeHtml(idea.tagline) + '</div>' +
            '<div class="text-xs text-gray-400 mt-1">' + escapeHtml(idea.description) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
      $ideas.append(card);
    });
  }

  function handleIdeaClick() {
    if (state.phase !== 'selecting') return;

    var index = parseInt($(this).data('index'), 10);
    var api = getApi();

    if (!api || isNaN(index)) return;

    state.phase = 'building';
    $('#inventify-ideas').addClass('hidden');
    $('#btn-inventify-back').addClass('hidden');
    showStatus('Building selected project idea...', 'info');

    api.selectInventifyIdea(index).done(function(result) {
      state.activeOneOffId = result.oneOffId;
    }).fail(function(xhr) {
      var errorMsg = 'Failed to start building';

      if (xhr.responseJSON && xhr.responseJSON.error) {
        errorMsg = xhr.responseJSON.error;
      }

      showStatus(errorMsg, 'error');
      resetToIdle();
    });
  }

  function handleBack() {
    resetForm();
  }

  function resetToIdle() {
    state.phase = 'idle';
    state.activeOneOffId = null;
    $('#inventify-form-sections').removeClass('hidden');
    $('#inventify-ideas').addClass('hidden').empty();
    $('#btn-inventify-generate').removeClass('hidden').prop('disabled', false).text('Generate!');
    $('#btn-inventify-back').addClass('hidden');
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

  InventifyModule.handleOneOffStatus = function(oneOffId, status) {
    if (oneOffId !== state.activeOneOffId) return;

    if (state.phase === 'brainstorming' && status === 'stopped') {
      state.activeOneOffId = null;
      fetchAndRenderIdeas();
      return;
    }

    if (state.phase === 'building' && status === 'stopped') {
      state.activeOneOffId = null;
      state.phase = 'idle';
      $('#btn-inventify-generate').removeClass('hidden').prop('disabled', false).text('Generate!');
      showStatus('Project generated! Check the One-Off Agents tab for details.', 'success');
      return;
    }

    if (status === 'error') {
      state.activeOneOffId = null;
      showStatus('Inventify agent encountered an error.', 'error');
      resetToIdle();
    }
  };

  InventifyModule.isGenerating = function() {
    return state.phase !== 'idle' && state.phase !== 'selecting';
  };

  return InventifyModule;
});
