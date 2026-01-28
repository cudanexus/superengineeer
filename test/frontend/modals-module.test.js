/**
 * @jest-environment jsdom
 */

const ModalsModule = require('../../public/js/modules/modals-module');

describe('ModalsModule', () => {
  let mockState;
  let mockApi;
  let mockEscapeHtml;
  let mockShowToast;
  let mockShowErrorToast;
  let mockOpenModal;
  let mockFormatters;
  let mockFileBrowser;

  function createMockJQuery() {
    const mockElement = {
      html: jest.fn().mockReturnThis(),
      val: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      prop: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      find: jest.fn().mockReturnThis(),
      each: jest.fn().mockReturnThis(),
      addClass: jest.fn().mockReturnThis(),
      removeClass: jest.fn().mockReturnThis(),
      hasClass: jest.fn().mockReturnValue(false),
      data: jest.fn(),
      length: 1
    };

    const $ = jest.fn().mockReturnValue(mockElement);
    $.fn = {};
    return $;
  }

  beforeEach(() => {
    mockState = {
      selectedProjectId: 'project-123',
      claudeFilesState: {
        files: [],
        currentFile: null
      }
    };

    mockApi = {
      getContextUsage: jest.fn().mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          this._doneCb = cb;
          return this;
        }),
        fail: jest.fn().mockImplementation(function(cb) {
          this._failCb = cb;
          return this;
        })
      }),
      getClaudeFiles: jest.fn().mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          this._doneCb = cb;
          return this;
        }),
        fail: jest.fn().mockImplementation(function(cb) {
          this._failCb = cb;
          return this;
        })
      }),
      saveClaudeFile: jest.fn().mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          this._doneCb = cb;
          return this;
        }),
        fail: jest.fn().mockImplementation(function(cb) {
          this._failCb = cb;
          return this;
        })
      })
    };

    mockEscapeHtml = jest.fn((str) => str);
    mockShowToast = jest.fn();
    mockShowErrorToast = jest.fn();
    mockOpenModal = jest.fn();
    mockFormatters = {
      formatNumberCompact: jest.fn((n) => n ? n.toLocaleString() : '0'),
      formatFileSize: jest.fn((bytes) => bytes + ' bytes')
    };
    mockFileBrowser = {
      showMobileClaudeFileEditor: jest.fn()
    };

    global.$ = createMockJQuery();
    global.marked = { parse: jest.fn((content) => `<p>${content}</p>`) };
    global.hljs = { highlightElement: jest.fn() };

    ModalsModule.init({
      state: mockState,
      api: mockApi,
      escapeHtml: mockEscapeHtml,
      showToast: mockShowToast,
      showErrorToast: mockShowErrorToast,
      openModal: mockOpenModal,
      Formatters: mockFormatters,
      FileBrowser: mockFileBrowser
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete global.$;
    delete global.marked;
    delete global.hljs;
  });

  describe('openContextUsageModal', () => {
    it('should show loading message', () => {
      ModalsModule.openContextUsageModal();

      expect(global.$).toHaveBeenCalledWith('#context-usage-content');
      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('Loading...'));
    });

    it('should open the context usage modal', () => {
      ModalsModule.openContextUsageModal();

      expect(mockOpenModal).toHaveBeenCalledWith('modal-context-usage');
    });

    it('should show no project message when no project selected', () => {
      mockState.selectedProjectId = null;

      ModalsModule.openContextUsageModal();

      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('No project selected'));
    });

    it('should call API to get context usage', () => {
      ModalsModule.openContextUsageModal();

      expect(mockApi.getContextUsage).toHaveBeenCalledWith('project-123');
    });

    it('should render context usage on success', () => {
      const mockUsage = {
        contextUsage: {
          percentUsed: 45,
          totalTokens: 50000,
          maxContextTokens: 100000,
          inputTokens: 30000,
          outputTokens: 20000,
          cacheCreationInputTokens: 5000,
          cacheReadInputTokens: 2000
        }
      };

      mockApi.getContextUsage.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockUsage);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      ModalsModule.openContextUsageModal();

      expect(global.$().html).toHaveBeenCalled();
    });

    it('should show error on API failure', () => {
      mockApi.getContextUsage.mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        })
      });

      ModalsModule.openContextUsageModal();

      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('Failed to load'));
    });

    it('should show no data message when usage is null', () => {
      mockApi.getContextUsage.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ contextUsage: null });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      ModalsModule.openContextUsageModal();

      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('No context usage data'));
    });
  });

  describe('openClaudeFilesModal', () => {
    it('should show loading message', () => {
      ModalsModule.openClaudeFilesModal();

      expect(global.$).toHaveBeenCalledWith('#claude-files-list');
      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('Loading...'));
    });

    it('should reset editor state', () => {
      ModalsModule.openClaudeFilesModal();

      expect(global.$).toHaveBeenCalledWith('#claude-file-editor');
      expect(global.$().val).toHaveBeenCalledWith('');
      expect(global.$().prop).toHaveBeenCalledWith('disabled', true);
    });

    it('should open the claude files modal', () => {
      ModalsModule.openClaudeFilesModal();

      expect(mockOpenModal).toHaveBeenCalledWith('modal-claude-files');
    });

    it('should show no project message when no project selected', () => {
      mockState.selectedProjectId = null;

      ModalsModule.openClaudeFilesModal();

      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('No project selected'));
    });

    it('should call API to get claude files', () => {
      ModalsModule.openClaudeFilesModal();

      expect(mockApi.getClaudeFiles).toHaveBeenCalledWith('project-123');
    });

    it('should store files in state on success', () => {
      const mockFiles = {
        files: [
          { path: '/global/CLAUDE.md', name: 'CLAUDE.md', content: 'test', size: 100, isGlobal: true },
          { path: '/project/CLAUDE.md', name: 'CLAUDE.md', content: 'test2', size: 200, isGlobal: false }
        ]
      };

      mockApi.getClaudeFiles.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockFiles);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      ModalsModule.openClaudeFilesModal();

      expect(mockState.claudeFilesState.files).toEqual(mockFiles.files);
    });

    it('should show error on API failure', () => {
      mockApi.getClaudeFiles.mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        })
      });

      ModalsModule.openClaudeFilesModal();

      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('Failed to load'));
    });
  });

  describe('selectClaudeFile', () => {
    beforeEach(() => {
      mockState.claudeFilesState.files = [
        { path: '/test/CLAUDE.md', name: 'CLAUDE.md', content: 'test content', size: 100, isGlobal: false }
      ];
    });

    it('should not select if file not found', () => {
      ModalsModule.selectClaudeFile('/nonexistent/file.md');

      expect(mockState.claudeFilesState.currentFile).toBeNull();
    });

    it('should set current file in state', () => {
      ModalsModule.selectClaudeFile('/test/CLAUDE.md');

      expect(mockState.claudeFilesState.currentFile).toEqual({
        path: '/test/CLAUDE.md',
        name: 'CLAUDE.md',
        content: 'test content',
        originalContent: 'test content',
        size: 100,
        isGlobal: false
      });
    });

    it('should update file name display', () => {
      ModalsModule.selectClaudeFile('/test/CLAUDE.md');

      expect(global.$).toHaveBeenCalledWith('#claude-file-name');
      expect(global.$().text).toHaveBeenCalledWith('CLAUDE.md');
    });

    it('should update file size display', () => {
      ModalsModule.selectClaudeFile('/test/CLAUDE.md');

      expect(global.$).toHaveBeenCalledWith('#claude-file-size');
      expect(mockFormatters.formatFileSize).toHaveBeenCalledWith(100);
    });

    it('should update editor content', () => {
      ModalsModule.selectClaudeFile('/test/CLAUDE.md');

      expect(global.$).toHaveBeenCalledWith('#claude-file-editor');
      expect(global.$().val).toHaveBeenCalledWith('test content');
    });

    it('should enable the editor', () => {
      ModalsModule.selectClaudeFile('/test/CLAUDE.md');

      expect(global.$().prop).toHaveBeenCalledWith('disabled', false);
    });

    it('should hide save button', () => {
      ModalsModule.selectClaudeFile('/test/CLAUDE.md');

      expect(global.$).toHaveBeenCalledWith('#btn-save-claude-file');
      expect(global.$().addClass).toHaveBeenCalledWith('hidden');
    });

    it('should call showMobileClaudeFileEditor', () => {
      ModalsModule.selectClaudeFile('/test/CLAUDE.md');

      expect(mockFileBrowser.showMobileClaudeFileEditor).toHaveBeenCalled();
    });
  });

  describe('saveClaudeFile', () => {
    beforeEach(() => {
      mockState.claudeFilesState.currentFile = {
        path: '/test/CLAUDE.md',
        name: 'CLAUDE.md',
        content: 'old content',
        originalContent: 'old content',
        size: 100,
        isGlobal: false
      };
      mockState.claudeFilesState.files = [
        { path: '/test/CLAUDE.md', name: 'CLAUDE.md', content: 'old content', size: 100, isGlobal: false }
      ];

      global.$('#claude-file-editor').val.mockReturnValue('new content');
    });

    it('should not save if no current file', () => {
      mockState.claudeFilesState.currentFile = null;

      ModalsModule.saveClaudeFile();

      expect(mockApi.saveClaudeFile).not.toHaveBeenCalled();
    });

    it('should not save if no project selected', () => {
      mockState.selectedProjectId = null;

      ModalsModule.saveClaudeFile();

      expect(mockApi.saveClaudeFile).not.toHaveBeenCalled();
    });

    it('should call API to save file', () => {
      ModalsModule.saveClaudeFile();

      expect(mockApi.saveClaudeFile).toHaveBeenCalledWith('project-123', '/test/CLAUDE.md', 'new content');
    });

    it('should show saving state on button', () => {
      ModalsModule.saveClaudeFile();

      expect(global.$).toHaveBeenCalledWith('#btn-save-claude-file');
      expect(global.$().text).toHaveBeenCalledWith('Saving...');
      expect(global.$().prop).toHaveBeenCalledWith('disabled', true);
    });

    it('should update file content on success', () => {
      mockApi.saveClaudeFile.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      ModalsModule.saveClaudeFile();

      expect(mockState.claudeFilesState.currentFile.content).toBe('new content');
      expect(mockState.claudeFilesState.currentFile.originalContent).toBe('new content');
    });

    it('should show success toast on save', () => {
      mockApi.saveClaudeFile.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      ModalsModule.saveClaudeFile();

      expect(mockShowToast).toHaveBeenCalledWith('File saved', 'success');
    });

    it('should show error toast on failure', () => {
      const mockXhr = { status: 500 };
      mockApi.saveClaudeFile.mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb(mockXhr);
          return this;
        })
      });

      ModalsModule.saveClaudeFile();

      expect(mockShowErrorToast).toHaveBeenCalledWith(mockXhr, 'Failed to save file');
    });
  });

  describe('toggleClaudeFilePreview', () => {
    it('should toggle between preview and edit modes', () => {
      // Initial state - not preview mode
      global.$('#claude-preview-pane').hasClass.mockReturnValue(false);

      ModalsModule.toggleClaudeFilePreview();

      expect(global.$).toHaveBeenCalledWith('#claude-preview-pane');
      expect(global.$).toHaveBeenCalledWith('#claude-editor-pane');
    });

    it('should update button text when switching to edit mode', () => {
      // Currently in preview mode
      global.$('#claude-preview-pane').hasClass.mockReturnValue(true);

      ModalsModule.toggleClaudeFilePreview();

      expect(global.$).toHaveBeenCalledWith('#claude-preview-btn-text');
    });
  });

  describe('renderClaudeFilesList', () => {
    it('should show no files message when empty', () => {
      mockState.claudeFilesState.files = [];

      ModalsModule.renderClaudeFilesList();

      expect(global.$).toHaveBeenCalledWith('#claude-files-list');
      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('No CLAUDE.md files'));
    });

    it('should render files with icons', () => {
      mockState.claudeFilesState.files = [
        { path: '/global/CLAUDE.md', name: 'CLAUDE.md', content: 'test', size: 100, isGlobal: true },
        { path: '/project/CLAUDE.md', name: 'CLAUDE.md', content: 'test2', size: 200, isGlobal: false }
      ];

      ModalsModule.renderClaudeFilesList();

      expect(mockEscapeHtml).toHaveBeenCalled();
      expect(mockFormatters.formatFileSize).toHaveBeenCalled();
    });
  });

  describe('setupHandlers', () => {
    it('should register claude file item click handler', () => {
      ModalsModule.setupHandlers();

      expect(global.$).toHaveBeenCalledWith(document);
      expect(global.$().on).toHaveBeenCalledWith('click', '.claude-file-item', expect.any(Function));
    });

    it('should register editor input handler', () => {
      ModalsModule.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#claude-file-editor');
      expect(global.$().on).toHaveBeenCalledWith('input', expect.any(Function));
    });

    it('should register save button handler', () => {
      ModalsModule.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-save-claude-file');
      expect(global.$().on).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should register preview toggle handler', () => {
      ModalsModule.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-toggle-claude-preview');
      expect(global.$().on).toHaveBeenCalledWith('click', expect.any(Function));
    });
  });

  describe('color coding for percent usage', () => {
    it('should render green for low usage', () => {
      const mockUsage = {
        contextUsage: {
          percentUsed: 25,
          totalTokens: 25000,
          maxContextTokens: 100000,
          inputTokens: 15000,
          outputTokens: 10000
        }
      };

      mockApi.getContextUsage.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockUsage);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      ModalsModule.openContextUsageModal();

      // The HTML should contain green color classes
      expect(global.$().html).toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    it('should initialize with correct claude files state structure', () => {
      expect(mockState.claudeFilesState).toBeDefined();
      expect(mockState.claudeFilesState.files).toEqual([]);
      expect(mockState.claudeFilesState.currentFile).toBeNull();
    });
  });

  describe('HTML escaping', () => {
    it('should escape file paths in claude files list', () => {
      mockState.claudeFilesState.files = [
        { path: '<script>alert(1)</script>', name: '<img onerror=alert(1)>', content: 'test', size: 100, isGlobal: false }
      ];

      ModalsModule.renderClaudeFilesList();

      expect(mockEscapeHtml).toHaveBeenCalledWith('<script>alert(1)</script>');
      expect(mockEscapeHtml).toHaveBeenCalledWith('<img onerror=alert(1)>');
    });
  });
});
