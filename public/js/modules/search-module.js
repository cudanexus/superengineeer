/**
 * Search Module
 * Handles conversation search, highlighting, and history search
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SearchModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies injected via init()
  var state = null;
  var api = null;
  var escapeHtml = null;
  var escapeRegExp = null;
  var formatDateTime = null;
  var loadConversation = null;

  function init(deps) {
    state = deps.state;
    api = deps.api;
    escapeHtml = deps.escapeHtml;
    escapeRegExp = deps.escapeRegExp;
    formatDateTime = deps.formatDateTime;
    loadConversation = deps.loadConversation;
  }

  function openSearch() {
    state.search.isOpen = true;
    $('#search-controls').removeClass('hidden');
    $('#search-input').focus().select();
  }

  function closeSearch() {
    state.search.isOpen = false;
    $('#search-controls').addClass('hidden');
    $('#search-advanced-filters').addClass('hidden');
    $('#btn-search-advanced').removeClass('bg-purple-600').addClass('bg-gray-700');
    $('#search-input').val('');
    clearSearchHighlights();
    clearHistorySearchResults();
    resetMessageTypeFilters();
    state.search.query = '';
    state.search.matches = [];
    state.search.currentIndex = -1;
    state.search.historyResults = [];
    updateSearchCounter();
  }

  function performSearch(query) {
    // Clear previous highlights
    clearSearchHighlights();
    clearHistorySearchResults();

    state.search.query = query;
    state.search.matches = [];
    state.search.currentIndex = -1;
    state.search.historyResults = [];

    if (!query || query.length < 1) {
      updateSearchCounter();
      return;
    }

    var $conversation = $('#conversation');
    var searchRegex = new RegExp(escapeRegExp(query), 'gi');

    // Find all text nodes within visible conversation messages
    $conversation.find('.conversation-message').each(function() {
      // Skip filtered/hidden messages
      if ($(this).hasClass('filter-hidden')) {
        return;
      }

      // Check message type filter
      var msgType = $(this).attr('data-msg-type');

      if (msgType && !state.search.filters[msgType]) {
        return;
      }

      findAndHighlightMatches(this, searchRegex);
    });

    updateSearchCounter();

    // Jump to first match if any
    if (state.search.matches.length > 0) {
      state.search.currentIndex = 0;
      highlightCurrentMatch();
    }

    // Search history if enabled
    if (state.search.searchHistory && state.selectedProjectId && query.length >= 2) {
      searchConversationHistory(query);
    }
  }

  function findAndHighlightMatches(element, regex) {
    var walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip empty text nodes and script/style content
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          var parent = node.parentElement;

          if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    var textNodes = [];
    var node;

    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    // Process text nodes in reverse order to maintain valid offsets
    textNodes.reverse().forEach(function(textNode) {
      var text = textNode.textContent;
      var match;
      var lastIndex = 0;
      var fragments = [];

      regex.lastIndex = 0; // Reset regex

      while ((match = regex.exec(text)) !== null) {
        // Text before match
        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
        }

        // Create highlight span for match
        var highlightSpan = document.createElement('span');
        highlightSpan.className = 'search-highlight';
        highlightSpan.textContent = match[0];
        fragments.push(highlightSpan);

        // Track this match
        state.search.matches.push(highlightSpan);

        lastIndex = regex.lastIndex;
      }

      // Remaining text after last match
      if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.substring(lastIndex)));
      }

      // Replace text node with fragments if we found matches
      if (fragments.length > 0 && lastIndex > 0) {
        var parent = textNode.parentNode;
        fragments.forEach(function(fragment) {
          parent.insertBefore(fragment, textNode);
        });
        parent.removeChild(textNode);
      }
    });

    // Reverse matches array to maintain document order (since we processed in reverse)
    state.search.matches.reverse();
  }

  function clearSearchHighlights() {
    // Remove all search highlight spans and restore original text
    $('.search-highlight').each(function() {
      var $span = $(this);
      var textNode = document.createTextNode($span.text());
      $span.replaceWith(textNode);
    });

    // Normalize text nodes (merge adjacent text nodes)
    $('#conversation').find('.conversation-message').each(function() {
      this.normalize();
    });

    state.search.matches = [];
  }

  function updateSearchCounter() {
    var total = state.search.matches.length;
    var current = state.search.currentIndex + 1;

    if (total === 0) {
      $('#search-counter').text('');
      $('#btn-search-prev, #btn-search-next').prop('disabled', true);
    } else {
      $('#search-counter').text(current + ' of ' + total);
      $('#btn-search-prev, #btn-search-next').prop('disabled', false);
    }
  }

  function highlightCurrentMatch() {
    // Remove current class from all highlights
    $('.search-highlight').removeClass('current');

    if (state.search.currentIndex >= 0 && state.search.currentIndex < state.search.matches.length) {
      var match = state.search.matches[state.search.currentIndex];
      $(match).addClass('current');

      // Scroll match into view
      scrollToSearchMatch(match);
    }

    updateSearchCounter();
  }

  function scrollToSearchMatch(element) {
    var $container = $('#conversation-container');
    var $element = $(element);

    var containerTop = $container.scrollTop();
    var containerHeight = $container.height();
    var elementTop = $element.offset().top - $container.offset().top + containerTop;
    var elementHeight = $element.outerHeight();

    // Calculate target scroll position (center the element if possible)
    var targetScroll = elementTop - (containerHeight / 2) + (elementHeight / 2);

    // Ensure we don't scroll past boundaries
    var maxScroll = $container[0].scrollHeight - containerHeight;
    targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));

    // Temporarily disable auto-scroll lock detection
    state.agentOutputScrollLock = true;

    $container.animate({ scrollTop: targetScroll }, 150, function() {
      // Re-enable scroll lock detection after animation
      setTimeout(function() {
        state.agentOutputScrollLock = false;
      }, 100);
    });
  }

  function goToNextMatch() {
    if (state.search.matches.length === 0) return;

    state.search.currentIndex = (state.search.currentIndex + 1) % state.search.matches.length;
    highlightCurrentMatch();
  }

  function goToPrevMatch() {
    if (state.search.matches.length === 0) return;

    state.search.currentIndex = state.search.currentIndex - 1;

    if (state.search.currentIndex < 0) {
      state.search.currentIndex = state.search.matches.length - 1;
    }

    highlightCurrentMatch();
  }

  function applyMessageTypeFilters() {
    var $conversation = $('#conversation');

    $conversation.find('.conversation-message').each(function() {
      var msgType = $(this).attr('data-msg-type');

      if (!msgType) {
        // Messages without type are always shown
        $(this).removeClass('filter-hidden');
        return;
      }

      var isVisible = state.search.filters[msgType];
      $(this).toggleClass('filter-hidden', !isVisible);
    });
  }

  function resetMessageTypeFilters() {
    state.search.filters = {
      user: true,
      assistant: true,
      tool: true,
      system: true
    };
    state.search.searchHistory = false;

    $('#filter-user, #filter-assistant, #filter-tool, #filter-system').prop('checked', true);
    $('#filter-history').prop('checked', false);
    $('#conversation').find('.conversation-message').removeClass('filter-hidden');
  }

  function clearHistorySearchResults() {
    $('#conversation').find('.history-search-result').remove();
    state.search.historyResults = [];
  }

  function searchConversationHistory(query) {
    if (!state.selectedProjectId) return;

    api.searchConversationHistory(state.selectedProjectId, query)
      .done(function(results) {
        state.search.historyResults = results;
        renderHistorySearchResults(results, query);
      })
      .fail(function(xhr) {
        console.error('History search failed:', xhr);
      });
  }

  function renderHistorySearchResults(results, query) {
    if (!results || results.length === 0) return;

    var $conversation = $('#conversation');
    var searchRegex = new RegExp('(' + escapeRegExp(query) + ')', 'gi');

    // Add history results section at the top
    var html = '<div class="history-search-results mb-4">' +
      '<div class="text-xs text-purple-400 mb-2 font-semibold">Found in conversation history (' + results.length + ' matches)</div>';

    results.forEach(function(result) {
      var highlightedContent = escapeHtml(result.content).replace(searchRegex, '<span class="search-highlight">$1</span>');
      var label = result.label || formatDateTime(result.createdAt);
      var convId = result.conversationId;

      html += '<div class="history-search-result" data-conversation-id="' + escapeHtml(convId) + '">' +
        '<div class="history-result-header" onclick="window.loadHistoryConversation(\'' + escapeHtml(convId) + '\')">' +
          '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
          '</svg>' +
          '<span>' + escapeHtml(label) + '</span>' +
          '<span class="text-gray-500">(' + escapeHtml(result.messageType) + ')</span>' +
        '</div>' +
        '<div class="history-result-content">' + highlightedContent + '</div>' +
      '</div>';
    });

    html += '</div>';

    $conversation.prepend(html);
  }

  function setupGlobalHistoryHandler() {
    // Global function to load a history conversation from search results
    window.loadHistoryConversation = function(conversationId) {
      if (!state.selectedProjectId) return;

      // Find and select this conversation in the history dropdown
      var $select = $('#select-conversation-history');
      var $option = $select.find('option[value="' + conversationId + '"]');

      if ($option.length > 0) {
        $select.val(conversationId).trigger('change');
      } else {
        // Conversation not in current dropdown, load it directly
        loadConversation(state.selectedProjectId, conversationId);
      }

      // Close search
      closeSearch();
    };
  }

  function setupHandlers() {
    // Search input handler
    var searchDebounce = null;
    $('#search-input').on('input', function() {
      var query = $(this).val();
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(function() {
        performSearch(query);
      }, 150);
    });

    // Search close button
    $('#btn-search-close').on('click', function() {
      closeSearch();
    });

    // Search navigation buttons
    $('#btn-search-prev').on('click', function() {
      goToPrevMatch();
    });

    $('#btn-search-next').on('click', function() {
      goToNextMatch();
    });

    // Advanced filters toggle
    $('#btn-search-advanced').on('click', function() {
      var $btn = $(this);
      var $filters = $('#search-advanced-filters');

      if ($filters.hasClass('hidden')) {
        $filters.removeClass('hidden');
        $btn.removeClass('bg-gray-700').addClass('bg-purple-600');
      } else {
        $filters.addClass('hidden');
        $btn.addClass('bg-gray-700').removeClass('bg-purple-600');
      }
    });

    // Message type filter checkboxes
    $('#filter-user, #filter-assistant, #filter-tool, #filter-system').on('change', function() {
      var filterType = $(this).attr('id').replace('filter-', '');
      state.search.filters[filterType] = $(this).is(':checked');
      applyMessageTypeFilters();

      // Re-run search with current query
      if (state.search.query) {
        performSearch(state.search.query);
      }
    });

    // History search checkbox
    $('#filter-history').on('change', function() {
      state.search.searchHistory = $(this).is(':checked');

      // Re-run search with current query
      if (state.search.query) {
        performSearch(state.search.query);
      }
    });

    // Keyboard shortcut for search (Ctrl/Cmd + F)
    $(document).on('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Only intercept if agent output tab is active
        if (state.activeTab === 'agent-output') {
          e.preventDefault();

          if (state.search.isOpen) {
            closeSearch();
          } else {
            openSearch();
          }
        }
      }

      // Escape to close search
      if (e.key === 'Escape' && state.search.isOpen) {
        closeSearch();
      }

      // Enter to go to next match when search is focused
      if (e.key === 'Enter' && state.search.isOpen && $(document.activeElement).is('#search-input')) {
        e.preventDefault();

        if (e.shiftKey) {
          goToPrevMatch();
        } else {
          goToNextMatch();
        }
      }
    });

    // Setup global history handler
    setupGlobalHistoryHandler();
  }

  return {
    init: init,
    open: openSearch,
    close: closeSearch,
    performSearch: performSearch,
    goToNextMatch: goToNextMatch,
    goToPrevMatch: goToPrevMatch,
    applyMessageTypeFilters: applyMessageTypeFilters,
    resetMessageTypeFilters: resetMessageTypeFilters,
    clearHighlights: clearSearchHighlights,
    clearHistoryResults: clearHistorySearchResults,
    setupHandlers: setupHandlers
  };
}));
