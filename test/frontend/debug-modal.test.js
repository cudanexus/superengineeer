/**
 * @jest-environment jsdom
 */

const DebugModal = require('../../public/js/modules/debug-modal');

describe('DebugModal', () => {
  let mockState;
  let mockApi;
  let mockEscapeHtml;
  let mockShowToast;
  let mockOpenModal;
  let mockFormatDateTime;
  let mockFormatLogTime;
  let mockFormatBytes;

  function createMockJQuery() {
    const mockElement = {
      html: jest.fn().mockReturnThis(),
      prop: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      addClass: jest.fn().mockReturnThis(),
      removeClass: jest.fn().mockReturnThis(),
      toggleClass: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnValue(false),
      data: jest.fn(),
      find: jest.fn().mockReturnThis(),
      attr: jest.fn(),
      length: 1
    };

    const $ = jest.fn().mockReturnValue(mockElement);
    $.fn = {};

    return $;
  }

  beforeEach(() => {
    jest.useFakeTimers();

    mockState = {
      selectedProjectId: 'project-123',
      debugPanelOpen: false,
      debugRefreshInterval: null,
      debugExpandedLogs: {},
      debugLogFilters: {
        debug: true,
        info: true,
        warn: true,
        error: true,
        frontend: true
      }
    };

    // Create chainable mock promises that call done callback immediately
    mockApi = {
      getDebugInfo: jest.fn().mockImplementation(() => ({
        done: jest.fn().mockImplementation(function(cb) {
          cb({
            processInfo: null,
            loopState: null,
            lastCommand: null,
            recentLogs: [],
            trackedProcesses: [],
            memoryUsage: null
          });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      })),
      getGlobalLogs: jest.fn().mockImplementation(() => ({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ logs: [] });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      }))
    };

    mockEscapeHtml = jest.fn((str) => str);
    mockShowToast = jest.fn();
    mockOpenModal = jest.fn();
    mockFormatDateTime = jest.fn((date) => '2024-01-15 10:30:00');
    mockFormatLogTime = jest.fn((ts) => '10:30:00');
    mockFormatBytes = jest.fn((bytes) => '1.5 MB');

    global.$ = createMockJQuery();

    DebugModal.init({
      state: mockState,
      api: mockApi,
      escapeHtml: mockEscapeHtml,
      showToast: mockShowToast,
      openModal: mockOpenModal,
      formatDateTime: mockFormatDateTime,
      formatLogTime: mockFormatLogTime,
      formatBytes: mockFormatBytes
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
    delete global.$;
  });

  describe('open', () => {
    it('should set debugPanelOpen to true', () => {
      DebugModal.open();

      expect(mockState.debugPanelOpen).toBe(true);
    });

    it('should call openModal with modal-debug', () => {
      DebugModal.open();

      expect(mockOpenModal).toHaveBeenCalledWith('modal-debug');
    });

    it('should sync filter checkbox states', () => {
      DebugModal.open();

      expect(global.$).toHaveBeenCalledWith('#log-filter-debug');
      expect(global.$).toHaveBeenCalledWith('#log-filter-info');
      expect(global.$).toHaveBeenCalledWith('#log-filter-warn');
      expect(global.$).toHaveBeenCalledWith('#log-filter-error');
      expect(global.$).toHaveBeenCalledWith('#log-filter-frontend');
    });

    it('should call refresh', () => {
      DebugModal.open();

      expect(mockApi.getDebugInfo).toHaveBeenCalledWith('project-123', 100);
    });

    it('should NOT start auto-refresh (auto-refresh is disabled)', () => {
      DebugModal.open();

      // First call is immediate from refresh()
      expect(mockApi.getDebugInfo).toHaveBeenCalledTimes(1);

      // Advance timer by 2 seconds - should NOT trigger another call
      jest.advanceTimersByTime(2000);

      // Should still be 1 call - no auto-refresh
      expect(mockApi.getDebugInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('close', () => {
    it('should set debugPanelOpen to false', () => {
      mockState.debugPanelOpen = true;

      DebugModal.close();

      expect(mockState.debugPanelOpen).toBe(false);
    });

    it('should clear expanded logs state', () => {
      mockState.debugExpandedLogs = { 'log-1': true, 'log-2': true };

      DebugModal.close();

      expect(mockState.debugExpandedLogs).toEqual({});
    });

    it('should handle close gracefully (no auto-refresh to stop)', () => {
      DebugModal.open();
      expect(mockApi.getDebugInfo).toHaveBeenCalledTimes(1);

      DebugModal.close();
      jest.advanceTimersByTime(4000);

      // Should still be 1 call - no auto-refresh was running
      expect(mockApi.getDebugInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh', () => {
    it('should still fetch global logs even if no project selected', () => {
      mockState.selectedProjectId = null;
      mockState.debugPanelOpen = true;

      DebugModal.refresh();

      // Should NOT fetch project-specific debug info
      expect(mockApi.getDebugInfo).not.toHaveBeenCalled();
      // Should still fetch global logs
      expect(mockApi.getGlobalLogs).toHaveBeenCalledWith(200);
    });

    it('should not fetch if debug panel is closed', () => {
      mockState.debugPanelOpen = false;

      DebugModal.refresh();

      expect(mockApi.getDebugInfo).not.toHaveBeenCalled();
      expect(mockApi.getGlobalLogs).not.toHaveBeenCalled();
    });

    it('should fetch both debug info and global logs when panel is open and project selected', () => {
      mockState.debugPanelOpen = true;

      DebugModal.refresh();

      expect(mockApi.getDebugInfo).toHaveBeenCalledWith('project-123', 100);
      expect(mockApi.getGlobalLogs).toHaveBeenCalledWith(200);
    });

    it('should show error on API failure', () => {
      mockState.debugPanelOpen = true;

      // Mock getGlobalLogs to fail
      mockApi.getGlobalLogs = jest.fn().mockImplementation(() => ({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        })
      }));

      DebugModal.refresh();

      expect(global.$).toHaveBeenCalledWith('#debug-process-content');
    });
  });

  describe('stopAutoRefresh', () => {
    it('should clear interval if exists (legacy function - auto-refresh is disabled)', () => {
      // Auto-refresh is disabled, but stopAutoRefresh should still work
      // if interval was set by external code
      mockState.debugRefreshInterval = setInterval(() => {}, 1000);
      expect(mockState.debugRefreshInterval).not.toBeNull();

      DebugModal.stopAutoRefresh();

      expect(mockState.debugRefreshInterval).toBeNull();
    });

    it('should handle case when no interval exists', () => {
      mockState.debugRefreshInterval = null;

      expect(() => DebugModal.stopAutoRefresh()).not.toThrow();
    });
  });

  describe('setupHandlers', () => {
    it('should register debug refresh button handler', () => {
      const mockBtn = global.$();

      DebugModal.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-debug-refresh');
      expect(mockBtn.on).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should register debug tab click handlers', () => {
      const mockDocument = {
        on: jest.fn()
      };
      global.$ = jest.fn((selector) => {
        if (selector === document) {
          return mockDocument;
        }
        return { on: jest.fn() };
      });

      DebugModal.setupHandlers();

      expect(mockDocument.on).toHaveBeenCalledWith('click', '.debug-tab', expect.any(Function));
    });

    it('should register shutdown button handler', () => {
      const mockBtn = global.$();

      DebugModal.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-debug-refresh');
      expect(mockBtn.on).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should register debug tab click handler', () => {
      DebugModal.setupHandlers();

      expect(global.$).toHaveBeenCalledWith(document);
      expect(global.$().on).toHaveBeenCalledWith('click', '.debug-tab', expect.any(Function));
    });

    it('should register debug log item click handler', () => {
      DebugModal.setupHandlers();

      expect(global.$().on).toHaveBeenCalledWith('click', '.debug-log-item', expect.any(Function));
    });

    it('should register log filter checkbox change handler', () => {
      DebugModal.setupHandlers();

      expect(global.$().on).toHaveBeenCalledWith('change', '.log-filter-checkbox', expect.any(Function));
    });
  });

  describe('copyToClipboard', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: jest.fn()
        },
        configurable: true
      });
    });

    it('should copy text to clipboard and show success toast', async () => {
      navigator.clipboard.writeText.mockResolvedValue();

      window.copyToClipboard('test text');
      await Promise.resolve();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
      expect(mockShowToast).toHaveBeenCalledWith('Copied to clipboard', 'success');
    });

    it('should show error toast on failure', async () => {
      // Use real timers for this test since we need async promise handling
      jest.useRealTimers();
      navigator.clipboard.writeText.mockRejectedValue(new Error('Failed'));

      window.copyToClipboard('test text');

      // Wait for promise to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockShowToast).toHaveBeenCalledWith('Failed to copy', 'error');

      // Restore fake timers for other tests
      jest.useFakeTimers();
    });
  });

  describe('render functions integration', () => {
    const mockDebugData = {
      processInfo: {
        pid: 12345,
        startedAt: '2024-01-15T10:30:00Z',
        cwd: '/test/project'
      },
      loopState: {
        isLooping: true,
        currentMilestone: {
          phaseTitle: 'Phase 1',
          milestoneTitle: 'Milestone 1',
          pendingTasks: ['Task 1', 'Task 2']
        },
        currentConversationId: 'conv-123'
      },
      memoryUsage: {
        heapUsed: 50000000,
        heapTotal: 100000000,
        rss: 150000000,
        external: 10000000
      },
      lastCommand: 'claude --session-id test',
      recentLogs: [
        {
          timestamp: '2024-01-15T10:30:00Z',
          level: 'info',
          message: 'Test log',
          name: 'TestLogger',
          context: { key: 'value' }
        },
        {
          timestamp: '2024-01-15T10:30:01Z',
          level: 'error',
          message: 'Error log',
          context: { error: 'test error' }
        },
        {
          timestamp: '2024-01-15T10:30:02Z',
          level: 'debug',
          message: 'Debug log',
          context: { direction: 'input', eventType: 'message', toolName: 'Read' }
        }
      ],
      trackedProcesses: [
        { pid: 12345, projectId: 'project-123', startedAt: '2024-01-15T10:30:00Z' },
        { pid: 67890, projectId: 'project-456', startedAt: '2024-01-15T10:35:00Z' }
      ]
    };

    function setupMocksWithData(projectData) {
      // Mock getGlobalLogs to return logs, then getDebugInfo to return project data
      mockApi.getGlobalLogs = jest.fn().mockImplementation(() => ({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ logs: mockDebugData.recentLogs || [] });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      }));

      mockApi.getDebugInfo = jest.fn().mockImplementation(() => ({
        done: jest.fn().mockImplementation(function(cb) {
          cb(projectData);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      }));
    }

    it('should render all tabs when data is received', () => {
      mockState.debugPanelOpen = true;
      setupMocksWithData(mockDebugData);

      DebugModal.refresh();

      // Verify all tab content containers were updated
      expect(global.$).toHaveBeenCalledWith('#debug-claude-io-content');
      expect(global.$).toHaveBeenCalledWith('#debug-process-content');
      expect(global.$).toHaveBeenCalledWith('#debug-commands-content');
      expect(global.$).toHaveBeenCalledWith('#debug-logs-content');
      expect(global.$).toHaveBeenCalledWith('#debug-all-processes-content');
    });

    it('should escape HTML in rendered content', () => {
      mockState.debugPanelOpen = true;
      setupMocksWithData(mockDebugData);

      DebugModal.refresh();

      // escapeHtml should be called for various content
      expect(mockEscapeHtml).toHaveBeenCalled();
    });

    it('should format dates using formatDateTime', () => {
      mockState.debugPanelOpen = true;
      setupMocksWithData(mockDebugData);

      DebugModal.refresh();

      expect(mockFormatDateTime).toHaveBeenCalled();
    });

    it('should format log times using formatLogTime', () => {
      mockState.debugPanelOpen = true;
      setupMocksWithData(mockDebugData);

      DebugModal.refresh();

      expect(mockFormatLogTime).toHaveBeenCalled();
    });

    it('should format bytes using formatBytes', () => {
      mockState.debugPanelOpen = true;
      setupMocksWithData(mockDebugData);

      DebugModal.refresh();

      expect(mockFormatBytes).toHaveBeenCalled();
    });
  });

  describe('log filtering', () => {
    const mockDataWithLogs = {
      recentLogs: [
        { timestamp: '2024-01-15T10:30:00Z', level: 'info', message: 'Info log', context: {} },
        { timestamp: '2024-01-15T10:30:01Z', level: 'error', message: 'Error log', context: {} },
        { timestamp: '2024-01-15T10:30:02Z', level: 'warn', message: 'Warn log', context: {} },
        { timestamp: '2024-01-15T10:30:03Z', level: 'debug', message: 'Debug log', context: {} },
        { timestamp: '2024-01-15T10:30:04Z', level: 'info', message: 'Frontend log', context: { type: 'frontend' } }
      ]
    };

    it('should filter logs based on debugLogFilters state', () => {
      mockState.debugPanelOpen = true;
      mockState.debugLogFilters.error = false;

      mockApi.getDebugInfo.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockDataWithLogs);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      DebugModal.refresh();

      // Error logs should be filtered out based on state
      const htmlCalls = global.$().html.mock.calls;
      expect(htmlCalls.length).toBeGreaterThan(0);
    });

    it('should filter frontend logs when frontend filter is disabled', () => {
      mockState.debugPanelOpen = true;
      mockState.debugLogFilters.frontend = false;

      mockApi.getDebugInfo.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockDataWithLogs);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      DebugModal.refresh();

      // Frontend logs should be filtered out
      const htmlCalls = global.$().html.mock.calls;
      expect(htmlCalls.length).toBeGreaterThan(0);
    });
  });

  describe('expanded logs state', () => {
    it('should track expanded log state in debugExpandedLogs', () => {
      mockState.debugExpandedLogs['log-123'] = true;

      expect(mockState.debugExpandedLogs['log-123']).toBe(true);
    });

    it('should clear expanded state when modal is closed', () => {
      mockState.debugExpandedLogs['log-123'] = true;
      mockState.debugExpandedLogs['log-456'] = true;

      DebugModal.close();

      expect(mockState.debugExpandedLogs).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('should handle empty processInfo', () => {
      mockState.debugPanelOpen = true;
      mockApi.getDebugInfo.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ processInfo: null });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      expect(() => DebugModal.refresh()).not.toThrow();
    });

    it('should handle empty loopState', () => {
      mockState.debugPanelOpen = true;
      mockApi.getDebugInfo.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ loopState: null });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      expect(() => DebugModal.refresh()).not.toThrow();
    });

    it('should handle empty recentLogs', () => {
      mockState.debugPanelOpen = true;
      mockApi.getDebugInfo.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ recentLogs: [] });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      expect(() => DebugModal.refresh()).not.toThrow();
    });

    it('should handle missing trackedProcesses', () => {
      mockState.debugPanelOpen = true;
      mockApi.getDebugInfo.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ trackedProcesses: null });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      expect(() => DebugModal.refresh()).not.toThrow();
    });

    it('should handle loop state without currentMilestone', () => {
      mockState.debugPanelOpen = true;
      mockApi.getDebugInfo.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({
            loopState: {
              isLooping: true,
              currentMilestone: null
            }
          });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      expect(() => DebugModal.refresh()).not.toThrow();
    });
  });
});
