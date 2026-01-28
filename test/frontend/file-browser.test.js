/**
 * @jest-environment jsdom
 */

const FileBrowser = require('../../public/js/modules/file-browser');

describe('FileBrowser', () => {
  let mockState;
  let mockApi;
  let mockEscapeHtml;
  let mockShowToast;
  let mockShowConfirm;
  let mockOpenModal;
  let mockCloseModal;
  let mockFindProjectById;
  let mockHighlightCode;
  let mockGetLanguageFromPath;
  let mockValidators;

  function createMockJQuery() {
    const mockElement = {
      html: jest.fn().mockReturnThis(),
      empty: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(),
      val: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      find: jest.fn().mockReturnThis(),
      first: jest.fn().mockReturnThis(),
      next: jest.fn().mockReturnThis(),
      after: jest.fn().mockReturnThis(),
      remove: jest.fn().mockReturnThis(),
      addClass: jest.fn().mockReturnThis(),
      removeClass: jest.fn().mockReturnThis(),
      toggleClass: jest.fn().mockReturnThis(),
      css: jest.fn().mockReturnValue('0px'),
      data: jest.fn(),
      scrollTop: jest.fn().mockReturnThis(),
      scrollLeft: jest.fn().mockReturnThis(),
      focus: jest.fn().mockReturnThis(),
      closest: jest.fn().mockReturnValue({ length: 0 }),
      length: 1
    };

    const $ = jest.fn().mockReturnValue(mockElement);
    $.fn = {};
    return $;
  }

  beforeEach(() => {
    mockState = {
      selectedProjectId: 'project-123',
      fileBrowser: {
        rootEntries: [],
        expandedDirs: {},
        selectedFile: null
      },
      openFiles: [],
      activeFilePath: null,
      contextMenuTarget: null,
      pendingDeleteFile: null,
      pendingCreateFile: null,
      pendingCreateFolder: null
    };

    mockApi = {
      browseWithFiles: jest.fn().mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          this._doneCb = cb;
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      }),
      readFile: jest.fn().mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          this._doneCb = cb;
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      }),
      writeFile: jest.fn().mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          this._doneCb = cb;
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      }),
      deleteFileOrFolder: jest.fn().mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          this._doneCb = cb;
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      }),
      createFolder: jest.fn().mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          this._doneCb = cb;
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      })
    };

    mockEscapeHtml = jest.fn((str) => str);
    mockShowToast = jest.fn();
    mockShowConfirm = jest.fn().mockResolvedValue(true);
    mockOpenModal = jest.fn();
    mockCloseModal = jest.fn();
    mockFindProjectById = jest.fn().mockReturnValue({ id: 'project-123', path: '/test/project' });
    mockHighlightCode = jest.fn((content, lang) => `<span class="hljs">${content}</span>`);
    mockGetLanguageFromPath = jest.fn().mockReturnValue('javascript');
    mockValidators = {
      validateFileName: jest.fn().mockReturnValue({ valid: true }),
      validateFolderName: jest.fn().mockReturnValue({ valid: true })
    };

    // Mock CSS.escape
    global.CSS = { escape: jest.fn((str) => str) };

    global.$ = createMockJQuery();
    global.hljs = { highlight: jest.fn() };

    FileBrowser.init({
      state: mockState,
      api: mockApi,
      escapeHtml: mockEscapeHtml,
      showToast: mockShowToast,
      showConfirm: mockShowConfirm,
      openModal: mockOpenModal,
      closeModal: mockCloseModal,
      findProjectById: mockFindProjectById,
      highlightCode: mockHighlightCode,
      getLanguageFromPath: mockGetLanguageFromPath,
      Validators: mockValidators
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete global.$;
    delete global.CSS;
    delete global.hljs;
  });

  describe('loadFileTree', () => {
    it('should show loading message', () => {
      FileBrowser.loadFileTree('/test/path');

      expect(global.$).toHaveBeenCalledWith('#file-browser-tree');
      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('Loading...'));
    });

    it('should call API to browse files', () => {
      FileBrowser.loadFileTree('/test/path');

      expect(mockApi.browseWithFiles).toHaveBeenCalledWith('/test/path');
    });

    it('should store root entries in state on success', () => {
      const mockEntries = [{ name: 'file.js', path: '/test/file.js', isDirectory: false }];
      mockApi.browseWithFiles.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockEntries);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      FileBrowser.loadFileTree('/test/path');

      expect(mockState.fileBrowser.rootEntries).toEqual(mockEntries);
    });

    it('should show error on failure', () => {
      mockApi.browseWithFiles.mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        })
      });

      FileBrowser.loadFileTree('/test/path');

      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('Failed to load files'));
    });
  });

  describe('openFile', () => {
    it('should call API to read file content', () => {
      FileBrowser.openFile('/test/file.js', 'file.js');

      expect(mockApi.readFile).toHaveBeenCalledWith('/test/file.js');
    });

    it('should add file to open files on success', () => {
      mockApi.readFile.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ content: 'file content' });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      FileBrowser.openFile('/test/file.js', 'file.js');

      expect(mockState.openFiles).toHaveLength(1);
      expect(mockState.openFiles[0]).toEqual({
        path: '/test/file.js',
        name: 'file.js',
        content: 'file content',
        originalContent: 'file content',
        modified: false
      });
    });

    it('should not reload if file is already open', () => {
      mockState.openFiles = [{
        path: '/test/file.js',
        name: 'file.js',
        content: 'existing content',
        originalContent: 'existing content',
        modified: false
      }];

      FileBrowser.openFile('/test/file.js', 'file.js');

      expect(mockApi.readFile).not.toHaveBeenCalled();
    });

    it('should show error toast on failure', () => {
      mockApi.readFile.mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        })
      });

      FileBrowser.openFile('/test/file.js', 'file.js');

      expect(mockShowToast).toHaveBeenCalledWith('Failed to open file', 'error');
    });
  });

  describe('setActiveFile', () => {
    beforeEach(() => {
      mockState.openFiles = [{
        path: '/test/file.js',
        name: 'file.js',
        content: 'test content',
        originalContent: 'test content',
        modified: false
      }];
    });

    it('should update active file path in state', () => {
      FileBrowser.setActiveFile('/test/file.js');

      expect(mockState.activeFilePath).toBe('/test/file.js');
      expect(mockState.fileBrowser.selectedFile).toBe('/test/file.js');
    });

    it('should update tree selection', () => {
      FileBrowser.setActiveFile('/test/file.js');

      expect(global.$).toHaveBeenCalledWith('.file-tree-item');
      expect(global.$().removeClass).toHaveBeenCalledWith('selected');
    });

    it('should show file content in editor', () => {
      FileBrowser.setActiveFile('/test/file.js');

      expect(global.$).toHaveBeenCalledWith('#file-editor-empty');
      expect(global.$).toHaveBeenCalledWith('#file-editor-wrapper');
      expect(global.$).toHaveBeenCalledWith('#file-editor-path');
      expect(global.$).toHaveBeenCalledWith('#file-editor-textarea');
    });
  });

  describe('closeFile', () => {
    beforeEach(() => {
      mockState.openFiles = [
        { path: '/test/file1.js', name: 'file1.js', content: 'content1', originalContent: 'content1', modified: false },
        { path: '/test/file2.js', name: 'file2.js', content: 'content2', originalContent: 'content2', modified: false }
      ];
      mockState.activeFilePath = '/test/file1.js';
    });

    it('should remove file from open files', () => {
      FileBrowser.closeFile('/test/file1.js');

      expect(mockState.openFiles).toHaveLength(1);
      expect(mockState.openFiles[0].path).toBe('/test/file2.js');
    });

    it('should switch to another file if active file was closed', () => {
      FileBrowser.closeFile('/test/file1.js');

      expect(mockState.activeFilePath).toBe('/test/file2.js');
    });

    it('should show confirm dialog if file is modified', () => {
      mockState.openFiles[0].modified = true;

      FileBrowser.closeFile('/test/file1.js');

      expect(mockShowConfirm).toHaveBeenCalledWith(
        'Unsaved Changes',
        'This file has unsaved changes. Close anyway?',
        expect.objectContaining({ danger: true })
      );
    });

    it('should clear editor state if last file is closed', () => {
      mockState.openFiles = [{ path: '/test/file1.js', name: 'file1.js', content: 'c', originalContent: 'c', modified: false }];

      FileBrowser.closeFile('/test/file1.js');

      expect(mockState.activeFilePath).toBeNull();
      expect(mockState.fileBrowser.selectedFile).toBeNull();
    });
  });

  describe('saveCurrentFile', () => {
    beforeEach(() => {
      mockState.activeFilePath = '/test/file.js';
      mockState.openFiles = [{
        path: '/test/file.js',
        name: 'file.js',
        content: 'modified content',
        originalContent: 'original content',
        modified: true
      }];

      global.$('#file-editor-textarea').val.mockReturnValue('modified content');
    });

    it('should not save if no active file', () => {
      mockState.activeFilePath = null;

      FileBrowser.saveCurrentFile();

      expect(mockApi.writeFile).not.toHaveBeenCalled();
    });

    it('should call API to write file', () => {
      FileBrowser.saveCurrentFile();

      expect(mockApi.writeFile).toHaveBeenCalledWith('/test/file.js', 'modified content');
    });

    it('should update file state on success', () => {
      mockApi.writeFile.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      FileBrowser.saveCurrentFile();

      expect(mockState.openFiles[0].modified).toBe(false);
      expect(mockState.openFiles[0].originalContent).toBe('modified content');
      expect(mockShowToast).toHaveBeenCalledWith('File saved', 'success');
    });

    it('should show error toast on failure', () => {
      mockApi.writeFile.mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        })
      });

      FileBrowser.saveCurrentFile();

      expect(mockShowToast).toHaveBeenCalledWith('Failed to save file', 'error');
    });
  });

  describe('refreshDirectoryContents', () => {
    it('should reload entire tree for root directory', () => {
      global.$().length = 0;

      FileBrowser.refreshDirectoryContents('/test/project');

      expect(mockFindProjectById).toHaveBeenCalledWith('project-123');
      expect(mockApi.browseWithFiles).toHaveBeenCalled();
    });

    it('should call API to refresh directory children', () => {
      mockState.fileBrowser.expandedDirs['/test/dir'] = true;
      global.$().length = 1;
      global.$().css.mockReturnValue('16px');

      mockApi.browseWithFiles.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb([{ name: 'child.js', path: '/test/dir/child.js', isDirectory: false }]);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      FileBrowser.refreshDirectoryContents('/test/dir');

      expect(mockApi.browseWithFiles).toHaveBeenCalledWith('/test/dir');
    });
  });

  describe('isMobileView', () => {
    it('should return true for small screens', () => {
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });

      expect(FileBrowser.isMobileView()).toBe(true);
    });

    it('should return false for large screens', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });

      expect(FileBrowser.isMobileView()).toBe(false);
    });
  });

  describe('showMobileFileEditor', () => {
    it('should add mobile classes when in mobile view', () => {
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });

      FileBrowser.showMobileFileEditor();

      expect(global.$).toHaveBeenCalledWith('#file-browser-sidebar');
      expect(global.$().addClass).toHaveBeenCalledWith('mobile-hidden');
    });

    it('should not modify classes when not in mobile view', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      const addClassMock = jest.fn();
      global.$ = jest.fn().mockReturnValue({ addClass: addClassMock });

      FileBrowser.showMobileFileEditor();

      expect(addClassMock).not.toHaveBeenCalled();
    });
  });

  describe('hideMobileFileEditor', () => {
    it('should remove mobile classes', () => {
      FileBrowser.hideMobileFileEditor();

      expect(global.$).toHaveBeenCalledWith('#file-browser-sidebar');
      expect(global.$().removeClass).toHaveBeenCalledWith('mobile-hidden');
    });
  });

  describe('showMobileClaudeFileEditor', () => {
    it('should add mobile classes when in mobile view', () => {
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });

      FileBrowser.showMobileClaudeFileEditor();

      expect(global.$).toHaveBeenCalledWith('#claude-files-list');
      expect(global.$().addClass).toHaveBeenCalledWith('mobile-hidden');
    });
  });

  describe('hideMobileClaudeFileEditor', () => {
    it('should remove mobile classes', () => {
      FileBrowser.hideMobileClaudeFileEditor();

      expect(global.$).toHaveBeenCalledWith('#claude-files-list');
      expect(global.$().removeClass).toHaveBeenCalledWith('mobile-hidden');
    });
  });

  describe('setupHandlers', () => {
    it('should register file tree item click handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$).toHaveBeenCalledWith(document);
      expect(global.$().on).toHaveBeenCalledWith('click', '.file-tree-item', expect.any(Function));
    });

    it('should register delete button click handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$().on).toHaveBeenCalledWith('click', '.btn-delete-file', expect.any(Function));
    });

    it('should register context menu handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$().on).toHaveBeenCalledWith('contextmenu', '.file-tree-item', expect.any(Function));
    });

    it('should register file tab click handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$().on).toHaveBeenCalledWith('click', '.file-tab', expect.any(Function));
    });

    it('should register tab close button handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$().on).toHaveBeenCalledWith('click', '.tab-close', expect.any(Function));
    });

    it('should register middle-click on tab handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$().on).toHaveBeenCalledWith('mousedown', '.file-tab', expect.any(Function));
    });

    it('should register file editor input handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#file-editor-textarea');
    });

    it('should register save button handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-save-file');
    });

    it('should register Ctrl+S handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#file-editor-textarea');
      expect(global.$().on).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should register refresh files button handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-refresh-files');
    });

    it('should register mobile back buttons', () => {
      FileBrowser.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-file-editor-back');
      expect(global.$).toHaveBeenCalledWith('#btn-claude-files-back');
    });

    it('should register new file button handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-new-file');
    });

    it('should register new folder button handler', () => {
      FileBrowser.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-new-folder');
    });

    it('should register create file confirmation handlers', () => {
      FileBrowser.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-confirm-create-file');
      expect(global.$).toHaveBeenCalledWith('#create-file-name');
    });

    it('should register create folder confirmation handlers', () => {
      FileBrowser.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-confirm-create-folder');
      expect(global.$).toHaveBeenCalledWith('#create-folder-name');
    });
  });

  describe('state management', () => {
    it('should initialize with correct state structure', () => {
      expect(mockState.fileBrowser).toBeDefined();
      expect(mockState.fileBrowser.rootEntries).toEqual([]);
      expect(mockState.fileBrowser.expandedDirs).toEqual({});
      expect(mockState.fileBrowser.selectedFile).toBeNull();
    });

    it('should track open files', () => {
      expect(mockState.openFiles).toEqual([]);
    });

    it('should track active file path', () => {
      expect(mockState.activeFilePath).toBeNull();
    });
  });

  describe('HTML escaping', () => {
    it('should escape file paths in tree items', () => {
      mockApi.browseWithFiles.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb([{ name: '<script>alert(1)</script>', path: '/test/<script>', isDirectory: false }]);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      FileBrowser.loadFileTree('/test');

      expect(mockEscapeHtml).toHaveBeenCalledWith('<script>alert(1)</script>');
      expect(mockEscapeHtml).toHaveBeenCalledWith('/test/<script>');
    });
  });

  describe('syntax highlighting', () => {
    beforeEach(() => {
      mockState.openFiles = [{
        path: '/test/file.js',
        name: 'file.js',
        content: 'const x = 1;',
        originalContent: 'const x = 1;',
        modified: false
      }];
    });

    it('should detect language from file path', () => {
      FileBrowser.setActiveFile('/test/file.js');

      expect(mockGetLanguageFromPath).toHaveBeenCalledWith('/test/file.js');
    });

    it('should apply highlighting when language is detected', () => {
      FileBrowser.setActiveFile('/test/file.js');

      expect(mockHighlightCode).toHaveBeenCalledWith('const x = 1;', 'javascript');
    });

    it('should not apply highlighting when no language detected', () => {
      mockGetLanguageFromPath.mockReturnValue(null);

      FileBrowser.setActiveFile('/test/file.js');

      expect(mockHighlightCode).not.toHaveBeenCalled();
    });
  });
});
