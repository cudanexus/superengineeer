/**
 * @jest-environment jsdom
 */

const ToolRenderer = require('../../public/js/modules/tool-renderer');

describe('ToolRenderer', () => {
  let mockEscapeHtml;
  let mockTruncateString;
  let mockDiffEngine;
  let mockFileCache;
  let mockTaskDisplayModule;
  let mockHljs;

  beforeEach(() => {
    mockEscapeHtml = jest.fn((str) => str.replace(/[<>&"']/g, (c) => {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
    }));

    mockTruncateString = jest.fn((str, max) => {
      if (str.length <= max) return str;
      return str.substring(0, max - 3) + '...';
    });

    mockDiffEngine = {
      DIFF_PREVIEW_LINES: 10,
      getLanguageFromPath: jest.fn((path) => {
        if (path && path.endsWith('.js')) return 'javascript';
        if (path && path.endsWith('.ts')) return 'typescript';
        return null;
      }),
      computeAlignedDiff: jest.fn((oldStr, newStr) => {
        const oldLines = oldStr.split('\n');
        const newLines = newStr.split('\n');
        return [
          { type: 'remove', left: oldLines[0], right: '' },
          { type: 'add', left: '', right: newLines[0] }
        ];
      }),
      selectDiffPreviewLines: jest.fn((diff, limit) => {
        return [{ startIndex: 0, lines: diff.map((row, i) => ({ index: i, row })) }];
      }),
      computeWordDiff: jest.fn()
    };

    mockFileCache = {
      getContent: jest.fn().mockReturnValue(null)
    };

    mockTaskDisplayModule = {
      renderList: jest.fn().mockReturnValue('<div class="task-list">Tasks</div>'),
      renderListPreview: jest.fn().mockReturnValue('<div class="task-preview">Tasks preview</div>')
    };

    mockHljs = {
      highlight: jest.fn((code, opts) => ({ value: `<span class="hljs">${code}</span>` }))
    };

    ToolRenderer.init({
      escapeHtml: mockEscapeHtml,
      truncateString: mockTruncateString,
      DiffEngine: mockDiffEngine,
      FileCache: mockFileCache,
      TaskDisplayModule: mockTaskDisplayModule,
      hljs: mockHljs
    });

    ToolRenderer.clearToolData();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getToolIcon', () => {
    it('should return Read icon', () => {
      const icon = ToolRenderer.getToolIcon('Read');
      expect(icon).toContain('svg');
      expect(icon).toContain('M9 12h6');
    });

    it('should return Write icon', () => {
      const icon = ToolRenderer.getToolIcon('Write');
      expect(icon).toContain('svg');
      expect(icon).toContain('M11 5H6');
    });

    it('should return Edit icon', () => {
      const icon = ToolRenderer.getToolIcon('Edit');
      expect(icon).toContain('svg');
    });

    it('should return Bash icon', () => {
      const icon = ToolRenderer.getToolIcon('Bash');
      expect(icon).toContain('svg');
      expect(icon).toContain('M8 9l3 3');
    });

    it('should return Glob icon', () => {
      const icon = ToolRenderer.getToolIcon('Glob');
      expect(icon).toContain('svg');
      expect(icon).toContain('M21 21l-6-6');
    });

    it('should return Grep icon', () => {
      const icon = ToolRenderer.getToolIcon('Grep');
      expect(icon).toContain('svg');
    });

    it('should return Task icon', () => {
      const icon = ToolRenderer.getToolIcon('Task');
      expect(icon).toContain('svg');
      expect(icon).toContain('M9 5H7');
    });

    it('should return default icon for unknown tool', () => {
      const icon = ToolRenderer.getToolIcon('UnknownTool');
      expect(icon).toContain('svg');
      expect(icon).toContain('M10.325 4.317');
    });
  });

  describe('highlightCode', () => {
    it('should highlight code with language', () => {
      const result = ToolRenderer.highlightCode('const x = 1;', 'javascript');
      expect(mockHljs.highlight).toHaveBeenCalledWith('const x = 1;', {
        language: 'javascript',
        ignoreIllegals: true
      });
      expect(result).toContain('hljs');
    });

    it('should return escaped code when no language', () => {
      const result = ToolRenderer.highlightCode('<script>', null);
      expect(mockEscapeHtml).toHaveBeenCalledWith('<script>');
      expect(result).toBe('&lt;script&gt;');
    });

    it('should return escaped code when hljs fails', () => {
      mockHljs.highlight.mockImplementation(() => {
        throw new Error('Highlight failed');
      });
      const result = ToolRenderer.highlightCode('code', 'javascript');
      expect(mockEscapeHtml).toHaveBeenCalledWith('code');
    });
  });

  describe('renderWordChunks', () => {
    it('should return empty string for empty chunks', () => {
      expect(ToolRenderer.renderWordChunks([], 'old')).toBe('');
      expect(ToolRenderer.renderWordChunks(null, 'old')).toBe('');
    });

    it('should highlight removed chunks in old view', () => {
      const chunks = [
        { type: 'unchanged', text: 'hello ' },
        { type: 'removed', text: 'world' }
      ];
      const result = ToolRenderer.renderWordChunks(chunks, 'old');
      expect(result).toContain('hello ');
      expect(result).toContain('<span class="diff-char-removed">world</span>');
    });

    it('should highlight added chunks in new view', () => {
      const chunks = [
        { type: 'unchanged', text: 'hello ' },
        { type: 'added', text: 'universe' }
      ];
      const result = ToolRenderer.renderWordChunks(chunks, 'new');
      expect(result).toContain('hello ');
      expect(result).toContain('<span class="diff-char-added">universe</span>');
    });
  });

  describe('renderDiff', () => {
    it('should call DiffEngine and render side by side', () => {
      const result = ToolRenderer.renderDiff('old', 'new', 'file.js');

      expect(mockDiffEngine.computeAlignedDiff).toHaveBeenCalledWith('old', 'new');
      expect(result).toContain('tool-diff');
      expect(result).toContain('side-by-side');
    });
  });

  describe('renderDiffPreview', () => {
    it('should render preview with gap indicators', () => {
      const result = ToolRenderer.renderDiffPreview('old', 'new', 'file.js');

      expect(mockDiffEngine.computeAlignedDiff).toHaveBeenCalledWith('old', 'new');
      expect(mockDiffEngine.selectDiffPreviewLines).toHaveBeenCalled();
      expect(result).toContain('tool-diff');
    });
  });

  describe('renderToolArgs', () => {
    it('should return empty string for empty input', () => {
      expect(ToolRenderer.renderToolArgs('Read', {})).toBe('');
      expect(ToolRenderer.renderToolArgs('Read', null)).toBe('');
    });

    it('should render Read tool args', () => {
      const result = ToolRenderer.renderToolArgs('Read', { file_path: '/path/file.js' });
      expect(result).toContain('Path:');
      expect(result).toContain('/path/file.js');
    });

    it('should render Write tool args with diff', () => {
      const result = ToolRenderer.renderToolArgs('Write', {
        file_path: '/path/file.js',
        content: 'new content'
      });
      expect(result).toContain('Path:');
      expect(result).toContain('tool-diff');
    });

    it('should render Write tool with cached content diff', () => {
      mockFileCache.getContent.mockReturnValue('old content');
      const result = ToolRenderer.renderToolArgs('Write', {
        file_path: '/path/file.js',
        content: 'new content'
      });
      expect(mockFileCache.getContent).toHaveBeenCalledWith('/path/file.js');
      expect(result).toContain('Diff against previously read file');
    });

    it('should render Edit tool args', () => {
      const result = ToolRenderer.renderToolArgs('Edit', {
        file_path: '/path/file.js',
        old_string: 'old',
        new_string: 'new'
      });
      expect(result).toContain('Path:');
      expect(result).toContain('tool-diff');
    });

    it('should render Bash tool args', () => {
      const result = ToolRenderer.renderToolArgs('Bash', { command: 'npm test' });
      expect(result).toContain('bash-command');
      expect(result).toContain('npm test');
    });

    it('should render Glob tool args', () => {
      const result = ToolRenderer.renderToolArgs('Glob', { pattern: '**/*.js' });
      expect(result).toContain('Pattern:');
      expect(result).toContain('**/*.js');
    });

    it('should render Grep tool args', () => {
      const result = ToolRenderer.renderToolArgs('Grep', {
        pattern: 'function',
        path: '/src'
      });
      expect(result).toContain('Pattern:');
      expect(result).toContain('function');
      expect(result).toContain('Path:');
      expect(result).toContain('/src');
    });

    it('should render TodoWrite tool args', () => {
      const result = ToolRenderer.renderToolArgs('TodoWrite', {
        todos: [{ content: 'Task 1', status: 'pending' }]
      });
      expect(mockTaskDisplayModule.renderList).toHaveBeenCalled();
      expect(result).toContain('task-list');
    });

    it('should render TodoWrite from string input', () => {
      const result = ToolRenderer.renderToolArgs('TodoWrite', JSON.stringify({
        todos: [{ content: 'Task 1', status: 'pending' }]
      }));
      expect(result).toContain('task-list');
    });

    it('should render unknown tool args', () => {
      const result = ToolRenderer.renderToolArgs('CustomTool', {
        option1: 'value1',
        option2: { nested: true }
      });
      expect(result).toContain('option1:');
      expect(result).toContain('value1');
      expect(result).toContain('option2:');
    });
  });

  describe('renderToolArgsPreview', () => {
    it('should return empty string for empty input', () => {
      expect(ToolRenderer.renderToolArgsPreview('Read', {})).toBe('');
    });

    it('should truncate long Bash commands', () => {
      const longCommand = 'a'.repeat(300);
      const result = ToolRenderer.renderToolArgsPreview('Bash', { command: longCommand });
      expect(result).toContain('a'.repeat(200) + '...');
    });

    it('should render TodoWrite preview', () => {
      const result = ToolRenderer.renderToolArgsPreview('TodoWrite', {
        todos: [{ content: 'Task 1', status: 'pending' }]
      });
      expect(mockTaskDisplayModule.renderListPreview).toHaveBeenCalled();
      expect(result).toContain('task-preview');
    });
  });

  describe('renderToolMessage', () => {
    it('should render tool message with header', () => {
      const msg = {
        toolInfo: {
          id: 'tool-123',
          name: 'Read',
          input: { file_path: '/path/file.js' },
          status: 'running'
        }
      };

      const result = ToolRenderer.renderToolMessage(msg);
      expect(result).toContain('conversation-message tool-use');
      expect(result).toContain('data-tool-id="tool-123"');
      expect(result).toContain('tool-name');
      expect(result).toContain('Read');
      expect(result).toContain('tool-status');
    });

    it('should generate tool ID if not provided', () => {
      const msg = {
        toolInfo: {
          name: 'Bash',
          input: { command: 'ls' }
        }
      };

      const result = ToolRenderer.renderToolMessage(msg);
      expect(result).toContain('data-tool-id=');
    });

    it('should store tool data for later access', () => {
      const msg = {
        toolInfo: {
          id: 'tool-456',
          name: 'Write',
          input: { file_path: '/test.js', content: 'code' },
          status: 'running'
        }
      };

      ToolRenderer.renderToolMessage(msg);
      const data = ToolRenderer.getToolData('tool-456');

      expect(data).not.toBeNull();
      expect(data.name).toBe('Write');
      expect(data.status).toBe('running');
    });
  });

  describe('updateToolStatus', () => {
    // Note: updateToolStatus depends heavily on jQuery DOM manipulation
    // These tests focus on the data store updates and error handling

    it('should do nothing when jQuery is not available', () => {
      // Ensure window.$ is not defined
      delete window.$;

      const msg = {
        toolInfo: {
          id: 'no-jquery-test',
          name: 'Read',
          input: {},
          status: 'running'
        }
      };
      ToolRenderer.renderToolMessage(msg);

      // Should not throw
      expect(() => {
        ToolRenderer.updateToolStatus('no-jquery-test', 'completed', null);
      }).not.toThrow();

      // Status should not change since $ wasn't available
      const data = ToolRenderer.getToolData('no-jquery-test');
      expect(data.status).toBe('running');
    });

    it('should do nothing when element not found', () => {
      window.$ = jest.fn().mockReturnValue({ length: 0 });

      const msg = {
        toolInfo: {
          id: 'not-found-test',
          name: 'Read',
          input: {},
          status: 'running'
        }
      };
      ToolRenderer.renderToolMessage(msg);

      // Status should remain unchanged since element wasn't found
      ToolRenderer.updateToolStatus('not-found-test', 'completed', null);
      const data = ToolRenderer.getToolData('not-found-test');
      expect(data.status).toBe('running');

      delete window.$;
    });

    it('should update data store when element found', () => {
      const mockStatusEl = {
        length: 1,
        removeClass: jest.fn().mockReturnThis(),
        addClass: jest.fn().mockReturnThis()
      };

      const mockTool = {
        length: 1,
        find: jest.fn((selector) => {
          if (selector === '.tool-status') return mockStatusEl;
          if (selector === '.tool-result-content') return { length: 0 };
          return { length: 0 };
        }),
        append: jest.fn()
      };

      // jsdom provides window, so we just need to add $
      window.$ = jest.fn().mockReturnValue(mockTool);

      const msg = {
        toolInfo: {
          id: 'found-test',
          name: 'Read',
          input: {},
          status: 'running'
        }
      };
      ToolRenderer.renderToolMessage(msg);

      ToolRenderer.updateToolStatus('found-test', 'completed', null);

      // Data store should be updated
      const data = ToolRenderer.getToolData('found-test');
      expect(data.status).toBe('completed');

      // jQuery methods should have been called
      expect(mockStatusEl.removeClass).toHaveBeenCalledWith('running completed failed');
      expect(mockStatusEl.addClass).toHaveBeenCalledWith('completed');

      delete window.$;
    });

    it('should store result content for failed status', () => {
      const mockStatusEl = {
        length: 1,
        removeClass: jest.fn().mockReturnThis(),
        addClass: jest.fn().mockReturnThis()
      };

      const mockTool = {
        length: 1,
        find: jest.fn((selector) => {
          if (selector === '.tool-status') return mockStatusEl;
          if (selector === '.tool-result-content') return { length: 0 };
          return { length: 0 };
        }),
        append: jest.fn()
      };

      window.$ = jest.fn().mockReturnValue(mockTool);

      const msg = {
        toolInfo: {
          id: 'fail-content-test',
          name: 'Bash',
          input: { command: 'exit 1' },
          status: 'running'
        }
      };
      ToolRenderer.renderToolMessage(msg);

      ToolRenderer.updateToolStatus('fail-content-test', 'failed', 'Error: command failed');

      const data = ToolRenderer.getToolData('fail-content-test');
      expect(data.status).toBe('failed');
      expect(data.resultContent).toBe('Error: command failed');

      // Should append error element
      expect(mockTool.append).toHaveBeenCalled();

      delete window.$;
    });
  });

  describe('getToolData', () => {
    it('should return null for unknown tool ID', () => {
      expect(ToolRenderer.getToolData('unknown-id')).toBeNull();
    });

    it('should return tool data for known ID', () => {
      const msg = {
        toolInfo: {
          id: 'known-tool',
          name: 'Glob',
          input: { pattern: '*.ts' },
          status: 'completed'
        }
      };
      ToolRenderer.renderToolMessage(msg);

      const data = ToolRenderer.getToolData('known-tool');
      expect(data).not.toBeNull();
      expect(data.name).toBe('Glob');
    });
  });

  describe('clearToolData', () => {
    it('should clear all tool data', () => {
      const msg = {
        toolInfo: {
          id: 'tool-to-clear',
          name: 'Read',
          input: {},
          status: 'running'
        }
      };
      ToolRenderer.renderToolMessage(msg);
      expect(ToolRenderer.getToolData('tool-to-clear')).not.toBeNull();

      ToolRenderer.clearToolData();
      expect(ToolRenderer.getToolData('tool-to-clear')).toBeNull();
    });
  });
});
