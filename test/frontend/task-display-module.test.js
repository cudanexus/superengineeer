/**
 * @jest-environment jsdom
 */

const TaskDisplayModule = require('../../public/js/modules/task-display-module');

describe('TaskDisplayModule', () => {
  let mockState;
  let mockApi;
  let mockEscapeHtml;
  let mockTruncateString;
  let mockFormatTodoStatus;
  let mockOpenModal;
  let mockShowToast;

  function createMockJQuery() {
    const mockElement = {
      html: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      empty: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(),
      addClass: jest.fn().mockReturnThis(),
      removeClass: jest.fn().mockReturnThis(),
      hasClass: jest.fn().mockReturnValue(false),
      on: jest.fn().mockReturnThis()
    };

    return jest.fn().mockReturnValue(mockElement);
  }

  beforeEach(() => {
    mockState = {
      selectedProjectId: 'test-project-id',
      currentTodos: []
    };

    mockApi = {
      getOptimizations: jest.fn().mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockReturnThis()
      })
    };

    mockEscapeHtml = jest.fn((str) => str);
    mockTruncateString = jest.fn((str, len) => str.substring(0, len));
    mockFormatTodoStatus = jest.fn((status) => status);
    mockOpenModal = jest.fn();
    mockShowToast = jest.fn();

    global.$ = createMockJQuery();

    TaskDisplayModule.init({
      state: mockState,
      api: mockApi,
      escapeHtml: mockEscapeHtml,
      truncateString: mockTruncateString,
      formatTodoStatus: mockFormatTodoStatus,
      openModal: mockOpenModal,
      showToast: mockShowToast
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatusIcon', () => {
    it('should return green checkmark for completed', () => {
      const icon = TaskDisplayModule.getStatusIcon('completed');
      expect(icon).toContain('text-green-400');
      expect(icon).toContain('M5 13l4 4L19 7');
    });

    it('should return yellow lightning for in_progress', () => {
      const icon = TaskDisplayModule.getStatusIcon('in_progress');
      expect(icon).toContain('text-yellow-400');
      expect(icon).toContain('animate-pulse');
    });

    it('should return gray circle for pending', () => {
      const icon = TaskDisplayModule.getStatusIcon('pending');
      expect(icon).toContain('text-gray-500');
      expect(icon).toContain('circle');
    });

    it('should default to pending for unknown status', () => {
      const icon = TaskDisplayModule.getStatusIcon('unknown');
      expect(icon).toContain('text-gray-500');
    });
  });

  describe('getStatusClass', () => {
    it('should return green border for completed', () => {
      const cls = TaskDisplayModule.getStatusClass('completed');
      expect(cls).toContain('border-green-500');
    });

    it('should return yellow border for in_progress', () => {
      const cls = TaskDisplayModule.getStatusClass('in_progress');
      expect(cls).toContain('border-yellow-500');
    });

    it('should return gray border for pending', () => {
      const cls = TaskDisplayModule.getStatusClass('pending');
      expect(cls).toContain('border-gray-600');
    });
  });

  describe('getStatusBadgeClass', () => {
    it('should return green badge for completed', () => {
      const cls = TaskDisplayModule.getStatusBadgeClass('completed');
      expect(cls).toContain('bg-green-900');
      expect(cls).toContain('text-green-400');
    });

    it('should return yellow badge for in_progress', () => {
      const cls = TaskDisplayModule.getStatusBadgeClass('in_progress');
      expect(cls).toContain('bg-yellow-900');
      expect(cls).toContain('text-yellow-400');
    });

    it('should return gray badge for pending', () => {
      const cls = TaskDisplayModule.getStatusBadgeClass('pending');
      expect(cls).toContain('bg-gray-700');
      expect(cls).toContain('text-gray-400');
    });
  });

  describe('renderList', () => {
    it('should return no tasks message for empty array', () => {
      const html = TaskDisplayModule.renderList([]);
      expect(html).toContain('No tasks');
    });

    it('should return no tasks message for null', () => {
      const html = TaskDisplayModule.renderList(null);
      expect(html).toContain('No tasks');
    });

    it('should render tasks with status icons', () => {
      const todos = [
        { content: 'Task 1', status: 'completed' },
        { content: 'Task 2', status: 'in_progress' }
      ];

      const html = TaskDisplayModule.renderList(todos);

      expect(html).toContain('todo-list');
      expect(html).toContain('Task 1');
      expect(html).toContain('Task 2');
      expect(mockEscapeHtml).toHaveBeenCalledWith('Task 1');
      expect(mockEscapeHtml).toHaveBeenCalledWith('Task 2');
    });
  });

  describe('renderListPreview', () => {
    it('should return no tasks message for empty array', () => {
      const html = TaskDisplayModule.renderListPreview([]);
      expect(html).toContain('No tasks');
    });

    it('should show summary line with counts', () => {
      const todos = [
        { content: 'Task 1', status: 'completed' },
        { content: 'Task 2', status: 'in_progress' },
        { content: 'Task 3', status: 'pending' }
      ];

      const html = TaskDisplayModule.renderListPreview(todos);

      expect(html).toContain('3 tasks');
      expect(html).toContain('1 done');
      expect(html).toContain('1 active');
      expect(html).toContain('1 pending');
    });

    it('should limit preview to 3 tasks', () => {
      const todos = [
        { content: 'Task 1', status: 'pending' },
        { content: 'Task 2', status: 'pending' },
        { content: 'Task 3', status: 'pending' },
        { content: 'Task 4', status: 'pending' },
        { content: 'Task 5', status: 'pending' }
      ];

      const html = TaskDisplayModule.renderListPreview(todos);

      expect(html).toContain('+2 more...');
    });
  });

  describe('updateCurrentTodos', () => {
    it('should update state from object input', () => {
      const input = {
        todos: [
          { content: 'Task 1', status: 'pending' }
        ]
      };

      TaskDisplayModule.updateCurrentTodos(input);

      expect(mockState.currentTodos).toHaveLength(1);
      expect(mockState.currentTodos[0].content).toBe('Task 1');
    });

    it('should update state from JSON string input', () => {
      const input = JSON.stringify({
        todos: [
          { content: 'Task 1', status: 'completed' }
        ]
      });

      TaskDisplayModule.updateCurrentTodos(input);

      expect(mockState.currentTodos).toHaveLength(1);
    });

    it('should handle invalid JSON gracefully', () => {
      mockState.currentTodos = [];

      TaskDisplayModule.updateCurrentTodos('invalid json');

      expect(mockState.currentTodos).toHaveLength(0);
    });

    it('should not update if todos is not array', () => {
      mockState.currentTodos = [{ content: 'existing' }];

      TaskDisplayModule.updateCurrentTodos({ todos: 'not an array' });

      expect(mockState.currentTodos).toHaveLength(1);
      expect(mockState.currentTodos[0].content).toBe('existing');
    });
  });

  describe('updateButtonBadge', () => {
    it('should hide badge when no todos', () => {
      mockState.currentTodos = [];
      const mockBadge = global.$();

      TaskDisplayModule.updateButtonBadge();

      expect(global.$).toHaveBeenCalledWith('#tasks-badge');
      expect(mockBadge.addClass).toHaveBeenCalledWith('hidden');
    });

    it('should show count of active tasks', () => {
      mockState.currentTodos = [
        { status: 'completed' },
        { status: 'in_progress' },
        { status: 'pending' },
        { status: 'pending' }
      ];
      const mockBadge = global.$();

      TaskDisplayModule.updateButtonBadge();

      expect(mockBadge.text).toHaveBeenCalledWith(3); // 1 in_progress + 2 pending
      expect(mockBadge.removeClass).toHaveBeenCalledWith('hidden');
    });

    it('should hide badge when all completed', () => {
      mockState.currentTodos = [
        { status: 'completed' },
        { status: 'completed' }
      ];
      const mockBadge = global.$();

      TaskDisplayModule.updateButtonBadge();

      expect(mockBadge.addClass).toHaveBeenCalledWith('hidden');
    });
  });

  describe('renderModalContent', () => {
    it('should show empty state when no todos', () => {
      mockState.currentTodos = [];

      const html = TaskDisplayModule.renderModalContent();

      expect(html).toContain('No active tasks');
      expect(html).toContain('Tasks will appear here');
    });

    it('should show progress bar', () => {
      mockState.currentTodos = [
        { content: 'Task 1', status: 'completed' },
        { content: 'Task 2', status: 'pending' }
      ];

      const html = TaskDisplayModule.renderModalContent();

      expect(html).toContain('1 of 2 completed');
      expect(html).toContain('50%');
      expect(html).toContain('bg-green-500 h-2');
    });

    it('should show task list with activeForm for in_progress', () => {
      mockState.currentTodos = [
        { content: 'Working task', status: 'in_progress', activeForm: 'Processing...' }
      ];

      const html = TaskDisplayModule.renderModalContent();

      expect(html).toContain('Working task');
      expect(html).toContain('Processing...');
    });

    it('should use todosOverride when provided', () => {
      mockState.currentTodos = [
        { content: 'Global task', status: 'pending' }
      ];

      const overrideTodos = [
        { content: 'Override task', status: 'completed' },
        { content: 'Override task 2', status: 'in_progress' }
      ];

      const html = TaskDisplayModule.renderModalContent(overrideTodos);

      expect(html).toContain('Override task');
      expect(html).toContain('Override task 2');
      expect(html).not.toContain('Global task');
      expect(html).toContain('1 of 2 completed');
    });

    it('should fall back to state.currentTodos when override is null', () => {
      mockState.currentTodos = [
        { content: 'State task', status: 'pending' }
      ];

      const html = TaskDisplayModule.renderModalContent(null);

      expect(html).toContain('State task');
    });
  });

  describe('openTasksModal', () => {
    it('should render content and open modal', () => {
      mockState.currentTodos = [{ content: 'Test', status: 'pending' }];

      TaskDisplayModule.openTasksModal();

      expect(global.$).toHaveBeenCalledWith('#tasks-modal-content');
      expect(mockOpenModal).toHaveBeenCalledWith('modal-tasks');
    });
  });

  describe('openOptimizationsModal', () => {
    it('should show error if no project selected', () => {
      mockState.selectedProjectId = null;

      TaskDisplayModule.openOptimizationsModal();

      expect(mockShowToast).toHaveBeenCalledWith('Please select a project first', 'error');
      expect(mockOpenModal).not.toHaveBeenCalled();
    });

    it('should open modal and load optimizations', () => {
      TaskDisplayModule.openOptimizationsModal();

      expect(mockOpenModal).toHaveBeenCalledWith('modal-optimizations');
      expect(mockApi.getOptimizations).toHaveBeenCalledWith('test-project-id');
    });
  });

  describe('renderOptimizationsContent', () => {
    it('should render passed check with green styling', () => {
      const data = {
        checks: [{
          title: 'Good check',
          description: 'Everything is fine',
          status: 'passed',
          statusMessage: 'OK'
        }],
        settings: { claudeMdMaxSizeKB: 50 }
      };

      const html = TaskDisplayModule.renderOptimizationsContent(data);

      expect(html).toContain('border-green-500');
      expect(html).toContain('Good check');
      expect(html).toContain('Everything is fine');
    });

    it('should render warning check with yellow styling', () => {
      const data = {
        checks: [{
          title: 'Warning check',
          description: 'Something to look at',
          status: 'warning',
          statusMessage: 'Warning'
        }],
        settings: { claudeMdMaxSizeKB: 50 }
      };

      const html = TaskDisplayModule.renderOptimizationsContent(data);

      expect(html).toContain('border-yellow-500');
    });

    it('should render action buttons', () => {
      const data = {
        checks: [{
          title: 'Create file',
          description: 'File missing',
          status: 'info',
          statusMessage: 'Missing',
          action: 'create',
          actionLabel: 'Create File',
          filePath: '/path/to/file'
        }],
        settings: { claudeMdMaxSizeKB: 50 }
      };

      const html = TaskDisplayModule.renderOptimizationsContent(data);

      expect(html).toContain('optimization-action');
      expect(html).toContain('data-action="create"');
      expect(html).toContain('Create File');
    });

    it('should show settings info', () => {
      const data = {
        checks: [],
        settings: { claudeMdMaxSizeKB: 100 }
      };

      const html = TaskDisplayModule.renderOptimizationsContent(data);

      expect(html).toContain('100 KB');
    });
  });

  describe('updateOptimizationsBadge', () => {
    it('should show badge with ! when count > 0', () => {
      const mockBadge = global.$();

      TaskDisplayModule.updateOptimizationsBadge(3);

      expect(global.$).toHaveBeenCalledWith('#optimizations-badge');
      expect(mockBadge.text).toHaveBeenCalledWith('!');
      expect(mockBadge.removeClass).toHaveBeenCalledWith('hidden');
    });

    it('should hide badge when count is 0', () => {
      const mockBadge = global.$();

      TaskDisplayModule.updateOptimizationsBadge(0);

      expect(mockBadge.addClass).toHaveBeenCalledWith('hidden');
    });
  });

  describe('loadOptimizationsBadge', () => {
    it('should clear badge if no project', () => {
      const mockBadge = global.$();

      TaskDisplayModule.loadOptimizationsBadge(null);

      expect(mockApi.getOptimizations).not.toHaveBeenCalled();
      expect(mockBadge.addClass).toHaveBeenCalledWith('hidden');
    });

    it('should load optimizations for project', () => {
      TaskDisplayModule.loadOptimizationsBadge('project-123');

      expect(mockApi.getOptimizations).toHaveBeenCalledWith('project-123');
    });
  });

  describe('setupHandlers', () => {
    it('should register tasks button handler', () => {
      const mockBtn = global.$();

      TaskDisplayModule.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-tasks');
      expect(mockBtn.on).toHaveBeenCalledWith('click', expect.any(Function));
    });

  });
});
