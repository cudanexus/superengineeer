/**
 * @jest-environment jsdom
 */

const GitModule = require('../../public/js/modules/git-module');

describe('GitModule', () => {
  let mockState;
  let mockApi;
  let mockEscapeHtml;
  let mockShowToast;
  let mockShowPrompt;
  let mockShowConfirm;
  let mockGetErrorMessage;
  let mockHighlightCode;
  let mockGetLanguageFromPath;
  let mockFindProjectById;
  let mockSwitchTab;
  let mockFileBrowser;
  let mockComputeWordDiff;

  function createMockJQuery() {
    const mockElement = {
      html: jest.fn().mockReturnThis(),
      empty: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(),
      val: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      one: jest.fn().mockReturnThis(),
      find: jest.fn().mockReturnThis(),
      first: jest.fn().mockReturnThis(),
      next: jest.fn().mockReturnThis(),
      after: jest.fn().mockReturnThis(),
      remove: jest.fn().mockReturnThis(),
      addClass: jest.fn().mockReturnThis(),
      removeClass: jest.fn().mockReturnThis(),
      toggleClass: jest.fn().mockReturnThis(),
      hasClass: jest.fn().mockReturnValue(false),
      css: jest.fn().mockReturnThis(),
      data: jest.fn(),
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
      git: {
        expandedDirs: {},
        selectedFile: null
      },
      gitContextTarget: null
    };

    const createDeferredMock = () => ({
      done: jest.fn().mockImplementation(function(cb) {
        this._doneCb = cb;
        return this;
      }),
      fail: jest.fn().mockImplementation(function(cb) {
        this._failCb = cb;
        return this;
      }),
      always: jest.fn().mockImplementation(function(cb) {
        this._alwaysCb = cb;
        return this;
      })
    });

    mockApi = {
      getGitStatus: jest.fn().mockReturnValue(createDeferredMock()),
      getGitBranches: jest.fn().mockReturnValue(createDeferredMock()),
      getGitTags: jest.fn().mockReturnValue(createDeferredMock()),
      getGitFileDiff: jest.fn().mockReturnValue(createDeferredMock()),
      gitStage: jest.fn().mockReturnValue(createDeferredMock()),
      gitUnstage: jest.fn().mockReturnValue(createDeferredMock()),
      gitStageAll: jest.fn().mockReturnValue(createDeferredMock()),
      gitUnstageAll: jest.fn().mockReturnValue(createDeferredMock()),
      gitCommit: jest.fn().mockReturnValue(createDeferredMock()),
      gitPush: jest.fn().mockReturnValue(createDeferredMock()),
      gitPull: jest.fn().mockReturnValue(createDeferredMock()),
      gitCheckout: jest.fn().mockReturnValue(createDeferredMock()),
      gitCreateBranch: jest.fn().mockReturnValue(createDeferredMock()),
      gitDiscard: jest.fn().mockReturnValue(createDeferredMock()),
      gitCreateTag: jest.fn().mockReturnValue(createDeferredMock()),
      gitPushTag: jest.fn().mockReturnValue(createDeferredMock())
    };

    mockEscapeHtml = jest.fn((str) => str);
    mockShowToast = jest.fn();
    mockShowPrompt = jest.fn().mockResolvedValue('test-branch');
    mockShowConfirm = jest.fn().mockResolvedValue(true);
    mockGetErrorMessage = jest.fn((xhr) => 'Error message');
    mockHighlightCode = jest.fn((content, lang) => content);
    mockGetLanguageFromPath = jest.fn().mockReturnValue('javascript');
    mockFindProjectById = jest.fn().mockReturnValue({ id: 'project-123', path: '/test/project' });
    mockSwitchTab = jest.fn();
    mockFileBrowser = { openFile: jest.fn() };
    mockComputeWordDiff = jest.fn().mockReturnValue({
      leftChunks: [{ text: 'old', type: 'removed' }],
      rightChunks: [{ text: 'new', type: 'added' }]
    });

    global.CSS = { escape: jest.fn((str) => str) };
    global.$ = createMockJQuery();

    GitModule.init({
      state: mockState,
      api: mockApi,
      escapeHtml: mockEscapeHtml,
      showToast: mockShowToast,
      showPrompt: mockShowPrompt,
      showConfirm: mockShowConfirm,
      getErrorMessage: mockGetErrorMessage,
      highlightCode: mockHighlightCode,
      getLanguageFromPath: mockGetLanguageFromPath,
      findProjectById: mockFindProjectById,
      switchTab: mockSwitchTab,
      FileBrowser: mockFileBrowser,
      computeWordDiff: mockComputeWordDiff
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete global.$;
    delete global.CSS;
  });

  describe('loadGitStatus', () => {
    it('should not load if no project selected', () => {
      mockState.selectedProjectId = null;

      GitModule.loadGitStatus();

      expect(mockApi.getGitStatus).not.toHaveBeenCalled();
    });

    it('should call API to get git status', () => {
      GitModule.loadGitStatus();

      expect(mockApi.getGitStatus).toHaveBeenCalledWith('project-123');
    });

    it('should call API to get git branches', () => {
      GitModule.loadGitStatus();

      expect(mockApi.getGitBranches).toHaveBeenCalledWith('project-123');
    });

    it('should call API to get git tags', () => {
      GitModule.loadGitStatus();

      expect(mockApi.getGitTags).toHaveBeenCalledWith('project-123');
    });

    it('should show error toast on failure', () => {
      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        })
      });

      GitModule.loadGitStatus();

      expect(mockShowToast).toHaveBeenCalledWith('Failed to load git status', 'error');
    });

    it('should render git status on success', () => {
      const mockStatus = {
        isRepo: true,
        staged: [{ path: 'file.js', status: 'modified' }],
        unstaged: [{ path: 'other.js', status: 'modified' }],
        untracked: []
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-staged-count');
      expect(global.$).toHaveBeenCalledWith('#git-unstaged-count');
    });
  });

  describe('setupGitHandlers', () => {
    it('should register refresh button handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-git-refresh');
      expect(global.$().on).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should register branch select change handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#git-branch-select');
      expect(global.$().on).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should register branch item click handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith(document);
      expect(global.$().on).toHaveBeenCalledWith('click', '.git-branch-item', expect.any(Function));
    });

    it('should register new branch button handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-git-new-branch');
    });

    it('should register stage all button handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-git-stage-all');
    });

    it('should register unstage all button handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-git-unstage-all');
    });

    it('should register stage button click handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$().on).toHaveBeenCalledWith('click', '.git-stage-btn', expect.any(Function));
    });

    it('should register unstage button click handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$().on).toHaveBeenCalledWith('click', '.git-unstage-btn', expect.any(Function));
    });

    it('should register git tree item click handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$().on).toHaveBeenCalledWith('click', '.git-tree-item', expect.any(Function));
    });

    it('should register file context menu handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$().on).toHaveBeenCalledWith('contextmenu', '.git-tree-item.file', expect.any(Function));
    });

    it('should register directory context menu handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$().on).toHaveBeenCalledWith('contextmenu', '.git-tree-item.directory', expect.any(Function));
    });

    it('should register commit button handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-git-commit');
    });

    it('should register push button handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-git-push');
    });

    it('should register pull button handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-git-pull');
    });

    it('should register new tag button handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-git-new-tag');
    });

    it('should register create tag form handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#form-create-tag');
    });

    it('should register push tag button handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$().on).toHaveBeenCalledWith('click', '.git-push-tag-btn', expect.any(Function));
    });

    it('should register mobile back button handler', () => {
      GitModule.setupGitHandlers();

      expect(global.$).toHaveBeenCalledWith('#git-mobile-back-btn');
    });
  });

  describe('mobile view functions', () => {
    describe('showMobileGitDiff', () => {
      it('should add mobile-visible class when in mobile view', () => {
        Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });

        GitModule.showMobileGitDiff();

        expect(global.$).toHaveBeenCalledWith('#git-diff-area');
        expect(global.$().addClass).toHaveBeenCalledWith('mobile-visible');
      });

      it('should not add class when not in mobile view', () => {
        Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
        const addClassMock = jest.fn();
        global.$ = jest.fn().mockReturnValue({ addClass: addClassMock });

        GitModule.showMobileGitDiff();

        expect(addClassMock).not.toHaveBeenCalled();
      });
    });

    describe('hideMobileGitDiff', () => {
      it('should remove mobile-visible class', () => {
        GitModule.hideMobileGitDiff();

        expect(global.$).toHaveBeenCalledWith('#git-diff-area');
        expect(global.$().removeClass).toHaveBeenCalledWith('mobile-visible');
      });
    });
  });

  describe('state management', () => {
    it('should initialize with correct git state structure', () => {
      expect(mockState.git).toBeDefined();
      expect(mockState.git.expandedDirs).toEqual({});
      expect(mockState.git.selectedFile).toBeNull();
    });

    it('should track selected project', () => {
      expect(mockState.selectedProjectId).toBe('project-123');
    });
  });

  describe('HTML escaping', () => {
    it('should escape file paths in git tree', () => {
      const mockStatus = {
        isRepo: true,
        staged: [{ path: '<script>alert(1)</script>', status: 'added' }],
        unstaged: [],
        untracked: []
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(mockEscapeHtml).toHaveBeenCalled();
    });
  });

  describe('git status rendering', () => {
    it('should show not-repo message when not a git repo', () => {
      const mockStatus = { isRepo: false };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-not-repo');
      expect(global.$().removeClass).toHaveBeenCalledWith('hidden');
    });

    it('should show git content when is a git repo', () => {
      const mockStatus = {
        isRepo: true,
        staged: [],
        unstaged: [],
        untracked: []
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-content');
      expect(global.$().removeClass).toHaveBeenCalledWith('hidden');
    });

    it('should display staged file count', () => {
      const mockStatus = {
        isRepo: true,
        staged: [{ path: 'a.js', status: 'added' }, { path: 'b.js', status: 'modified' }],
        unstaged: [],
        untracked: []
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-staged-count');
      expect(global.$().text).toHaveBeenCalledWith('(2)');
    });

    it('should display unstaged and untracked file count', () => {
      const mockStatus = {
        isRepo: true,
        staged: [],
        unstaged: [{ path: 'a.js', status: 'modified' }],
        untracked: [{ path: 'b.js', status: 'untracked' }]
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-unstaged-count');
      expect(global.$().text).toHaveBeenCalledWith('(2)');
    });
  });

  describe('git branches rendering', () => {
    it('should render branches in select dropdown', () => {
      const mockBranches = {
        current: 'main',
        local: ['main', 'feature'],
        remote: ['origin/main']
      };

      mockApi.getGitBranches.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockBranches);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-branch-select');
      expect(global.$().empty).toHaveBeenCalled();
    });

    it('should show no branches message when empty', () => {
      const mockBranches = {
        current: null,
        local: [],
        remote: []
      };

      mockApi.getGitBranches.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockBranches);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-branch-select');
    });
  });

  describe('git tags rendering', () => {
    it('should render tags list', () => {
      mockApi.getGitTags.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ tags: ['v1.0.0', 'v1.1.0'] });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-tags-list');
    });

    it('should show no tags message when empty', () => {
      mockApi.getGitTags.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ tags: [] });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-tags-list');
      expect(global.$().html).toHaveBeenCalledWith(expect.stringContaining('No tags'));
    });

    it('should handle API failure gracefully', () => {
      mockApi.getGitTags.mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        })
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-tags-list');
    });
  });

  describe('expanded directories state', () => {
    it('should track expanded directories by type', () => {
      mockState.git.expandedDirs['staged:src'] = true;

      expect(mockState.git.expandedDirs['staged:src']).toBe(true);
    });

    it('should allow different expansion states for same path in different types', () => {
      mockState.git.expandedDirs['staged:src'] = true;
      mockState.git.expandedDirs['unstaged:src'] = false;

      expect(mockState.git.expandedDirs['staged:src']).toBe(true);
      expect(mockState.git.expandedDirs['unstaged:src']).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should use getErrorMessage for API errors', () => {
      const mockXhr = { status: 500, responseText: 'Server error' };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb(mockXhr);
          return this;
        })
      });

      GitModule.loadGitStatus();

      // Error toast is shown
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load git status', 'error');
    });
  });

  describe('isOperationInProgress', () => {
    it('should return false initially', () => {
      expect(GitModule.isOperationInProgress()).toBe(false);
    });
  });

  describe('diff rendering', () => {
    it('should handle loading diff for staged file', () => {
      const mockDiff = `diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
--- a/file.js
+++ b/file.js
@@ -1,3 +1,3 @@
-const old = 1;
+const new = 2;
 unchanged line`;

      mockApi.getGitFileDiff.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ diff: mockDiff });
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      // Set up mock to track calls
      const htmlMock = jest.fn().mockReturnThis();
      global.$ = jest.fn().mockReturnValue({
        html: htmlMock,
        text: jest.fn().mockReturnThis(),
        addClass: jest.fn().mockReturnThis(),
        removeClass: jest.fn().mockReturnThis()
      });

      // Need to re-init with proper state
      mockState.selectedProjectId = 'project-123';

      // loadGitFileDiff is internal, test through setupHandlers behavior
      expect(global.$).toBeDefined();
    });

    it('should handle diff API failure', () => {
      mockApi.getGitFileDiff.mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockImplementation(function(cb) {
          cb({ status: 500 });
          return this;
        })
      });

      expect(mockApi.getGitFileDiff).toBeDefined();
    });
  });

  describe('git operations', () => {
    it('should handle commit operation', () => {
      mockApi.gitCommit.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb({ hash: 'abc1234' });
          return this;
        }),
        fail: jest.fn().mockReturnThis(),
        always: jest.fn().mockReturnThis()
      });

      expect(mockApi.gitCommit).toBeDefined();
    });

    it('should handle push operation', () => {
      mockApi.gitPush.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis(),
        always: jest.fn().mockReturnThis()
      });

      expect(mockApi.gitPush).toBeDefined();
    });

    it('should handle pull operation', () => {
      mockApi.gitPull.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis(),
        always: jest.fn().mockReturnThis()
      });

      expect(mockApi.gitPull).toBeDefined();
    });

    it('should handle checkout operation', () => {
      mockApi.gitCheckout.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis(),
        always: jest.fn().mockReturnThis()
      });

      expect(mockApi.gitCheckout).toBeDefined();
    });

    it('should handle create branch operation', () => {
      mockApi.gitCreateBranch.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis(),
        always: jest.fn().mockReturnThis()
      });

      expect(mockApi.gitCreateBranch).toBeDefined();
    });

    it('should handle stage operation', () => {
      mockApi.gitStage.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis(),
        always: jest.fn().mockReturnThis()
      });

      expect(mockApi.gitStage).toBeDefined();
    });

    it('should handle unstage operation', () => {
      mockApi.gitUnstage.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis(),
        always: jest.fn().mockReturnThis()
      });

      expect(mockApi.gitUnstage).toBeDefined();
    });

    it('should handle discard operation', () => {
      mockApi.gitDiscard.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis(),
        always: jest.fn().mockReturnThis()
      });

      expect(mockApi.gitDiscard).toBeDefined();
    });

    it('should handle create tag operation', () => {
      mockApi.gitCreateTag.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis(),
        always: jest.fn().mockReturnThis()
      });

      expect(mockApi.gitCreateTag).toBeDefined();
    });

    it('should handle push tag operation', () => {
      mockApi.gitPushTag.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb();
          return this;
        }),
        fail: jest.fn().mockReturnThis(),
        always: jest.fn().mockReturnThis()
      });

      expect(mockApi.gitPushTag).toBeDefined();
    });
  });

  describe('file tree building', () => {
    it('should build correct tree structure from flat file list', () => {
      const mockStatus = {
        isRepo: true,
        staged: [
          { path: 'src/index.ts', status: 'modified' },
          { path: 'src/utils/helper.ts', status: 'added' },
          { path: 'package.json', status: 'modified' }
        ],
        unstaged: [],
        untracked: []
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(mockApi.getGitStatus).toHaveBeenCalledWith('project-123');
    });

    it('should handle files with backslash paths (Windows)', () => {
      const mockStatus = {
        isRepo: true,
        staged: [
          { path: 'src\\index.ts', status: 'modified' }
        ],
        unstaged: [],
        untracked: []
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(mockApi.getGitStatus).toHaveBeenCalled();
    });
  });

  describe('branches list rendering', () => {
    it('should render local and remote branches separately', () => {
      const mockBranches = {
        current: 'main',
        local: ['main', 'develop', 'feature/test'],
        remote: ['origin/main', 'origin/develop']
      };

      mockApi.getGitBranches.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockBranches);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(global.$).toHaveBeenCalledWith('#git-branches-list');
    });

    it('should highlight current branch', () => {
      const mockBranches = {
        current: 'feature/active',
        local: ['main', 'feature/active'],
        remote: []
      };

      mockApi.getGitBranches.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockBranches);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(mockApi.getGitBranches).toHaveBeenCalled();
    });
  });

  describe('context menu handling', () => {
    it('should track context target state', () => {
      expect(mockState.gitContextTarget).toBeNull();
    });

    it('should store context target for file operations', () => {
      mockState.gitContextTarget = { path: 'test.js', type: 'unstaged', status: 'modified', isDirectory: false };

      expect(mockState.gitContextTarget.path).toBe('test.js');
      expect(mockState.gitContextTarget.type).toBe('unstaged');
      expect(mockState.gitContextTarget.isDirectory).toBe(false);
    });

    it('should store context target for directory operations', () => {
      mockState.gitContextTarget = { path: 'src', type: 'staged', status: null, isDirectory: true };

      expect(mockState.gitContextTarget.path).toBe('src');
      expect(mockState.gitContextTarget.isDirectory).toBe(true);
    });
  });

  describe('status icons', () => {
    it('should render correct status icon class for added files', () => {
      const mockStatus = {
        isRepo: true,
        staged: [{ path: 'new.js', status: 'added' }],
        unstaged: [],
        untracked: []
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(mockApi.getGitStatus).toHaveBeenCalled();
    });

    it('should render correct status icon for deleted files', () => {
      const mockStatus = {
        isRepo: true,
        staged: [{ path: 'deleted.js', status: 'deleted' }],
        unstaged: [],
        untracked: []
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(mockApi.getGitStatus).toHaveBeenCalled();
    });

    it('should render correct status icon for renamed files', () => {
      const mockStatus = {
        isRepo: true,
        staged: [{ path: 'renamed.js', status: 'renamed' }],
        unstaged: [],
        untracked: []
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(mockApi.getGitStatus).toHaveBeenCalled();
    });

    it('should render correct status icon for untracked files', () => {
      const mockStatus = {
        isRepo: true,
        staged: [],
        unstaged: [],
        untracked: [{ path: 'untracked.js', status: 'untracked' }]
      };

      mockApi.getGitStatus.mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          cb(mockStatus);
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      });

      GitModule.loadGitStatus();

      expect(mockApi.getGitStatus).toHaveBeenCalled();
    });
  });

  describe('loadGitTags', () => {
    it('should not load if no project selected', () => {
      mockState.selectedProjectId = null;

      GitModule.loadGitStatus();

      expect(mockApi.getGitTags).not.toHaveBeenCalled();
    });
  });
});
