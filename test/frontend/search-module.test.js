/**
 * @jest-environment jsdom
 */

const SearchModule = require('../../public/js/modules/search-module');

describe('SearchModule', () => {
  let mockState;
  let mockApi;
  let mockEscapeHtml;
  let mockEscapeRegExp;
  let mockFormatDateTime;
  let mockLoadConversation;

  // Helper to create a mock jQuery-like object
  function createMockJQuery() {
    const mockElement = {
      html: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      val: jest.fn().mockReturnThis(),
      addClass: jest.fn().mockReturnThis(),
      removeClass: jest.fn().mockReturnThis(),
      toggleClass: jest.fn().mockReturnThis(),
      hasClass: jest.fn().mockReturnValue(false),
      prop: jest.fn().mockReturnThis(),
      attr: jest.fn(),
      each: jest.fn(),
      find: jest.fn().mockReturnThis(),
      focus: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      prepend: jest.fn().mockReturnThis(),
      remove: jest.fn().mockReturnThis(),
      replaceWith: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      animate: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnValue({ top: 0 }),
      height: jest.fn().mockReturnValue(100),
      outerHeight: jest.fn().mockReturnValue(20),
      scrollTop: jest.fn().mockReturnValue(0),
      is: jest.fn().mockReturnValue(false)
    };

    return jest.fn().mockReturnValue(mockElement);
  }

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Setup jQuery mock
    global.$ = createMockJQuery();

    // Setup mocks
    mockState = {
      search: {
        isOpen: false,
        query: '',
        matches: [],
        currentIndex: -1,
        historyResults: [],
        filters: {
          user: true,
          assistant: true,
          tool: true,
          system: true
        },
        searchHistory: false
      },
      selectedProjectId: 'test-project-id',
      activeTab: 'agent-output',
      agentOutputScrollLock: false
    };

    mockApi = {
      searchConversationHistory: jest.fn().mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockReturnThis()
      })
    };

    mockEscapeHtml = jest.fn((str) => str);
    mockEscapeRegExp = jest.fn((str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    mockFormatDateTime = jest.fn((date) => '2024-01-15 10:30');
    mockLoadConversation = jest.fn();

    // Initialize module
    SearchModule.init({
      state: mockState,
      api: mockApi,
      escapeHtml: mockEscapeHtml,
      escapeRegExp: mockEscapeRegExp,
      formatDateTime: mockFormatDateTime,
      loadConversation: mockLoadConversation
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('open', () => {
    it('should set search state to open', () => {
      SearchModule.open();

      expect(mockState.search.isOpen).toBe(true);
    });

    it('should show search controls by removing hidden class', () => {
      const mockElement = global.$();
      SearchModule.open();

      expect(global.$).toHaveBeenCalledWith('#search-controls');
      expect(mockElement.removeClass).toHaveBeenCalledWith('hidden');
    });

    it('should focus and select search input', () => {
      const mockElement = global.$();
      SearchModule.open();

      expect(global.$).toHaveBeenCalledWith('#search-input');
      expect(mockElement.focus).toHaveBeenCalled();
      expect(mockElement.select).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should set search state to closed', () => {
      mockState.search.isOpen = true;
      SearchModule.close();

      expect(mockState.search.isOpen).toBe(false);
    });

    it('should hide search controls', () => {
      const mockElement = global.$();
      SearchModule.close();

      expect(global.$).toHaveBeenCalledWith('#search-controls');
      expect(mockElement.addClass).toHaveBeenCalledWith('hidden');
    });

    it('should clear search input', () => {
      const mockElement = global.$();
      SearchModule.close();

      expect(global.$).toHaveBeenCalledWith('#search-input');
      expect(mockElement.val).toHaveBeenCalledWith('');
    });

    it('should reset search state', () => {
      mockState.search.query = 'test';
      mockState.search.matches = [1, 2, 3];
      mockState.search.currentIndex = 1;
      mockState.search.historyResults = ['result1'];

      SearchModule.close();

      expect(mockState.search.query).toBe('');
      expect(mockState.search.matches).toEqual([]);
      expect(mockState.search.currentIndex).toBe(-1);
      expect(mockState.search.historyResults).toEqual([]);
    });

    it('should hide advanced filters', () => {
      const mockElement = global.$();
      SearchModule.close();

      expect(global.$).toHaveBeenCalledWith('#search-advanced-filters');
      expect(mockElement.addClass).toHaveBeenCalledWith('hidden');
    });
  });

  describe('performSearch', () => {
    // Helper to create a comprehensive jQuery mock for performSearch
    function setupPerformSearchMock() {
      const mockMessages = { each: jest.fn() };
      const mockHighlights = { each: jest.fn() };

      global.$ = jest.fn((selector) => {
        if (selector === '#conversation') {
          return {
            find: jest.fn((sel) => {
              if (sel === '.conversation-message') return mockMessages;
              if (sel === '.history-search-result') return { remove: jest.fn() };
              return { each: jest.fn() };
            }),
            prepend: jest.fn()
          };
        }

        if (selector === '.search-highlight') {
          return mockHighlights;
        }

        return {
          text: jest.fn().mockReturnThis(),
          prop: jest.fn().mockReturnThis(),
          each: jest.fn(),
          find: jest.fn().mockReturnValue({ each: jest.fn() }),
          remove: jest.fn()
        };
      });

      return { mockMessages, mockHighlights };
    }

    it('should not search if query is empty', () => {
      SearchModule.performSearch('');

      expect(mockState.search.query).toBe('');
      expect(mockState.search.matches).toEqual([]);
    });

    it('should set query state', () => {
      setupPerformSearchMock();

      SearchModule.performSearch('test');

      expect(mockState.search.query).toBe('test');
    });

    it('should call escapeRegExp with query', () => {
      setupPerformSearchMock();

      SearchModule.performSearch('test.query');

      expect(mockEscapeRegExp).toHaveBeenCalledWith('test.query');
    });

    it('should search conversation history when enabled', () => {
      mockState.search.searchHistory = true;
      setupPerformSearchMock();

      SearchModule.performSearch('test query');

      expect(mockApi.searchConversationHistory).toHaveBeenCalledWith(
        'test-project-id',
        'test query'
      );
    });

    it('should not search history if query is too short', () => {
      mockState.search.searchHistory = true;
      setupPerformSearchMock();

      SearchModule.performSearch('a'); // Too short

      expect(mockApi.searchConversationHistory).not.toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    // Setup mock for navigation tests that need scroll functionality
    function setupNavigationMock() {
      const mockContainer = {
        scrollTop: jest.fn().mockReturnValue(0),
        height: jest.fn().mockReturnValue(100),
        animate: jest.fn(),
        offset: jest.fn().mockReturnValue({ top: 0 }),
        0: { scrollHeight: 500 } // Mock the DOM element
      };

      const mockElement = {
        offset: jest.fn().mockReturnValue({ top: 50 }),
        outerHeight: jest.fn().mockReturnValue(20),
        addClass: jest.fn().mockReturnThis(),
        removeClass: jest.fn().mockReturnThis()
      };

      global.$ = jest.fn((selector) => {
        if (selector === '#conversation-container') {
          return mockContainer;
        }

        if (selector === '.search-highlight') {
          return { removeClass: jest.fn() };
        }

        if (selector === '#search-counter') {
          return { text: jest.fn() };
        }

        if (selector === '#btn-search-prev, #btn-search-next') {
          return { prop: jest.fn() };
        }

        // When wrapping a match element (DOM node or string selector)
        return mockElement;
      });

      return { mockContainer, mockElement };
    }

    beforeEach(() => {
      // Create mock DOM elements for matches
      const mockMatch1 = document.createElement('span');
      const mockMatch2 = document.createElement('span');
      const mockMatch3 = document.createElement('span');
      mockState.search.matches = [mockMatch1, mockMatch2, mockMatch3];
      mockState.search.currentIndex = 0;
      setupNavigationMock();
    });

    it('should go to next match', () => {
      SearchModule.goToNextMatch();

      expect(mockState.search.currentIndex).toBe(1);
    });

    it('should wrap around to first match', () => {
      mockState.search.currentIndex = 2;

      SearchModule.goToNextMatch();

      expect(mockState.search.currentIndex).toBe(0);
    });

    it('should go to previous match', () => {
      mockState.search.currentIndex = 1;

      SearchModule.goToPrevMatch();

      expect(mockState.search.currentIndex).toBe(0);
    });

    it('should wrap around to last match', () => {
      mockState.search.currentIndex = 0;

      SearchModule.goToPrevMatch();

      expect(mockState.search.currentIndex).toBe(2);
    });

    it('should not navigate when no matches', () => {
      mockState.search.matches = [];
      mockState.search.currentIndex = -1;

      SearchModule.goToNextMatch();
      expect(mockState.search.currentIndex).toBe(-1);

      SearchModule.goToPrevMatch();
      expect(mockState.search.currentIndex).toBe(-1);
    });
  });

  describe('clearHighlights', () => {
    it('should clear matches array', () => {
      mockState.search.matches = ['match1', 'match2'];

      const mockHighlights = {
        each: jest.fn(),
        text: jest.fn().mockReturnValue('text')
      };

      const mockConversation = {
        find: jest.fn().mockReturnValue({
          each: jest.fn()
        })
      };

      global.$ = jest.fn((selector) => {
        if (selector === '.search-highlight') {
          return mockHighlights;
        }

        if (selector === '#conversation') {
          return mockConversation;
        }

        return { each: jest.fn() };
      });

      SearchModule.clearHighlights();

      expect(mockState.search.matches).toEqual([]);
    });
  });

  describe('applyMessageTypeFilters', () => {
    it('should iterate over conversation messages', () => {
      const mockMessages = {
        each: jest.fn()
      };

      global.$ = jest.fn((selector) => {
        if (selector === '#conversation') {
          return {
            find: jest.fn().mockReturnValue(mockMessages)
          };
        }

        return { each: jest.fn() };
      });

      SearchModule.applyMessageTypeFilters();

      expect(global.$).toHaveBeenCalledWith('#conversation');
      expect(mockMessages.each).toHaveBeenCalled();
    });
  });

  describe('resetMessageTypeFilters', () => {
    it('should reset all filters to true', () => {
      mockState.search.filters = {
        user: false,
        assistant: false,
        tool: false,
        system: false
      };
      mockState.search.searchHistory = true;

      SearchModule.resetMessageTypeFilters();

      expect(mockState.search.filters.user).toBe(true);
      expect(mockState.search.filters.assistant).toBe(true);
      expect(mockState.search.filters.tool).toBe(true);
      expect(mockState.search.filters.system).toBe(true);
      expect(mockState.search.searchHistory).toBe(false);
    });

    it('should check all filter checkboxes', () => {
      const mockProp = jest.fn().mockReturnThis();

      global.$ = jest.fn().mockReturnValue({
        prop: mockProp,
        removeClass: jest.fn().mockReturnThis(),
        find: jest.fn().mockReturnValue({
          removeClass: jest.fn().mockReturnThis()
        })
      });

      SearchModule.resetMessageTypeFilters();

      expect(global.$).toHaveBeenCalledWith('#filter-user, #filter-assistant, #filter-tool, #filter-system');
      expect(mockProp).toHaveBeenCalledWith('checked', true);
    });
  });

  describe('clearHistoryResults', () => {
    it('should remove history search result elements', () => {
      const mockRemove = jest.fn().mockReturnThis();

      global.$ = jest.fn((selector) => {
        if (selector === '#conversation') {
          return {
            find: jest.fn().mockReturnValue({
              remove: mockRemove
            })
          };
        }

        return { remove: mockRemove };
      });

      SearchModule.clearHistoryResults();

      expect(mockRemove).toHaveBeenCalled();
      expect(mockState.search.historyResults).toEqual([]);
    });
  });
});
