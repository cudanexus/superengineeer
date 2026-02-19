/**
 * @jest-environment jsdom
 */

const RoadmapModule = require('../../public/js/modules/roadmap-module');

describe('RoadmapModule', () => {
  let mockState;
  let mockEscapeHtml;
  let mockShowToast;
  let mockCloseModal;
  let mockFindProjectById;
  let mockDoSendMessage;
  let mockStartInteractiveAgentWithMessage;
  let mockApi;
  let mockUpdateProjectStatusById;
  let mockStartAgentStatusPolling;
  let mockAppendMessage;
  let mockPermissionModeModule;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Setup jQuery mock
    global.$ = jest.fn((selector) => {
      const mockElement = {
        html: jest.fn().mockReturnThis(),
        removeClass: jest.fn().mockReturnThis(),
        addClass: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        prop: jest.fn().mockReturnThis(),
        data: jest.fn(),
        each: jest.fn(),
        find: jest.fn().mockReturnThis(),
        closest: jest.fn().mockReturnThis(),
        slideDown: jest.fn().mockReturnThis(),
        slideUp: jest.fn().mockReturnThis(),
        on: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnValue(false)
      };
      return mockElement;
    });

    // Setup mocks
    mockState = {
      selectedProjectId: 'test-project-id',
      permissionMode: 'acceptEdits',
      pendingPermissionMode: null,
      currentSessionId: null
    };

    mockEscapeHtml = jest.fn((str) => str);
    mockShowToast = jest.fn();
    mockCloseModal = jest.fn();
    mockFindProjectById = jest.fn();
    mockDoSendMessage = jest.fn();
    mockStartInteractiveAgentWithMessage = jest.fn();
    mockApi = {
      stopAgent: jest.fn(),
      startInteractiveAgent: jest.fn()
    };
    mockUpdateProjectStatusById = jest.fn();
    mockStartAgentStatusPolling = jest.fn();
    mockAppendMessage = jest.fn();
    mockPermissionModeModule = {
      updateButtons: jest.fn(),
      updatePendingIndicator: jest.fn(),
      setSwitchingState: jest.fn()
    };

    // Initialize module
    RoadmapModule.init({
      state: mockState,
      escapeHtml: mockEscapeHtml,
      showToast: mockShowToast,
      closeModal: mockCloseModal,
      findProjectById: mockFindProjectById,
      doSendMessage: mockDoSendMessage,
      startInteractiveAgentWithMessage: mockStartInteractiveAgentWithMessage,
      api: mockApi,
      updateProjectStatusById: mockUpdateProjectStatusById,
      startAgentStatusPolling: mockStartAgentStatusPolling,
      appendMessage: mockAppendMessage,
      PermissionModeModule: mockPermissionModeModule
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('toggleMilestoneExpanded', () => {
    it('should toggle from collapsed to expanded', () => {
      const key = 'phase1-milestone1';

      const result = RoadmapModule.toggleMilestoneExpanded(key);

      expect(result).toBe(true);
      const stored = JSON.parse(localStorage.getItem('superengineer-milestone-expanded'));
      expect(stored[key]).toBe(true);
    });

    it('should toggle from expanded to collapsed', () => {
      const key = 'phase1-milestone1';
      localStorage.setItem('superengineer-milestone-expanded', JSON.stringify({ [key]: true }));

      const result = RoadmapModule.toggleMilestoneExpanded(key);

      expect(result).toBe(false);
      const stored = JSON.parse(localStorage.getItem('superengineer-milestone-expanded'));
      expect(stored[key]).toBe(false);
    });

    it('should handle multiple milestones independently', () => {
      const key1 = 'phase1-milestone1';
      const key2 = 'phase1-milestone2';

      RoadmapModule.toggleMilestoneExpanded(key1);
      RoadmapModule.toggleMilestoneExpanded(key2);

      const stored = JSON.parse(localStorage.getItem('superengineer-milestone-expanded'));
      expect(stored[key1]).toBe(true);
      expect(stored[key2]).toBe(true);
    });

    it('should preserve other milestone states when toggling', () => {
      const key1 = 'phase1-milestone1';
      const key2 = 'phase1-milestone2';
      localStorage.setItem('superengineer-milestone-expanded', JSON.stringify({ [key1]: true }));

      RoadmapModule.toggleMilestoneExpanded(key2);

      const stored = JSON.parse(localStorage.getItem('superengineer-milestone-expanded'));
      expect(stored[key1]).toBe(true);
      expect(stored[key2]).toBe(true);
    });
  });

  describe('render', () => {
    it('should render "No roadmap found" when data is null', () => {
      const mockHtml = jest.fn();
      global.$ = jest.fn().mockReturnValue({ html: mockHtml });

      RoadmapModule.render(null);

      expect(mockHtml).toHaveBeenCalledWith(
        '<div class="text-gray-500 text-center">No roadmap found</div>'
      );
    });

    it('should render "No roadmap found" when data has no parsed property', () => {
      const mockHtml = jest.fn();
      global.$ = jest.fn().mockReturnValue({ html: mockHtml });

      RoadmapModule.render({ content: 'some content' });

      expect(mockHtml).toHaveBeenCalledWith(
        '<div class="text-gray-500 text-center">No roadmap found</div>'
      );
    });

    it('should render roadmap with phases and progress', () => {
      const mockHtml = jest.fn();
      global.$ = jest.fn().mockReturnValue({ html: mockHtml });

      const data = {
        parsed: {
          overallProgress: 50,
          currentPhase: 'phase1',
          currentMilestone: 'milestone1',
          phases: [
            {
              id: 'phase1',
              title: 'Phase 1',
              milestones: [
                {
                  id: 'milestone1',
                  title: 'Milestone 1',
                  completedCount: 2,
                  totalCount: 4,
                  tasks: [
                    { title: 'Task 1', completed: true },
                    { title: 'Task 2', completed: true },
                    { title: 'Task 3', completed: false },
                    { title: 'Task 4', completed: false }
                  ]
                }
              ]
            }
          ]
        }
      };

      RoadmapModule.render(data);

      expect(mockHtml).toHaveBeenCalled();
      const renderedHtml = mockHtml.mock.calls[0][0];
      expect(renderedHtml).toContain('50%');
      expect(renderedHtml).toContain('Phase 1');
      expect(renderedHtml).toContain('Milestone 1');
      expect(renderedHtml).toContain('2/4');
      expect(renderedHtml).toContain('roadmap-select-phase');
    });

    it('should use escapeHtml for phase and milestone titles', () => {
      const mockHtml = jest.fn();
      global.$ = jest.fn().mockReturnValue({ html: mockHtml });

      const data = {
        parsed: {
          overallProgress: 0,
          phases: [
            {
              id: 'phase1',
              title: '<script>alert("xss")</script>',
              milestones: []
            }
          ]
        }
      };

      RoadmapModule.render(data);

      expect(mockEscapeHtml).toHaveBeenCalledWith('<script>alert("xss")</script>');
    });
  });

  describe('getSelectedItems', () => {
    it('should return empty array when no items selected', () => {
      global.$ = jest.fn().mockReturnValue({
        each: jest.fn()
      });

      const items = RoadmapModule.getSelectedItems();

      expect(items).toEqual([]);
    });
  });

  describe('clearSelection', () => {
    it('should uncheck all roadmap checkboxes', () => {
      const mockProp = jest.fn().mockReturnThis();
      const mockElement = {
        prop: mockProp,
        each: jest.fn(),
        removeClass: jest.fn().mockReturnThis(),
        addClass: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis()
      };

      global.$ = jest.fn().mockReturnValue(mockElement);

      RoadmapModule.clearSelection();

      expect(global.$).toHaveBeenCalledWith('.roadmap-select-phase, .roadmap-select-milestone, .roadmap-select-task');
      expect(mockProp).toHaveBeenCalledWith('checked', false);
    });
  });

  // Helper: creates a $ mock that handles phase/milestone/task selectors
  // selectors: { phases: [elements], milestones: [elements], tasks: [elements] }
  function createSelectionMock(selectors) {
    var phases = selectors.phases || [];
    var milestones = selectors.milestones || [];
    var tasks = selectors.tasks || [];

    return jest.fn((selector) => {
      if (typeof selector === 'object') {
        return selector;
      }

      if (selector === '.roadmap-select-phase:checked') {
        return {
          each: (cb) => { phases.forEach((el, i) => cb.call(el, i, el)); }
        };
      }

      if (selector === '.roadmap-select-milestone:checked') {
        return {
          each: (cb) => { milestones.forEach((el, i) => cb.call(el, i, el)); }
        };
      }

      if (selector === '.roadmap-select-task:checked:not(:disabled)') {
        return {
          each: (cb) => { tasks.forEach((el, i) => cb.call(el, i, el)); }
        };
      }

      return {
        removeClass: jest.fn().mockReturnThis(),
        addClass: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        prop: jest.fn().mockReturnThis(),
        each: jest.fn()
      };
    });
  }

  function mockElement(dataMap) {
    return { data: jest.fn((key) => dataMap[key]) };
  }

  describe('convertToTasks', () => {
    it('should show warning toast when no items selected', () => {
      global.$ = createSelectionMock({});

      RoadmapModule.convertToTasks();

      expect(mockShowToast).toHaveBeenCalledWith('Please select items to convert', 'warning');
    });

    it('should send message to running agent', () => {
      global.$ = createSelectionMock({
        milestones: [mockElement({
          'phase-id': 'phase1', 'milestone-id': 'milestone1', 'milestone-title': 'Test Milestone'
        })]
      });

      mockFindProjectById.mockReturnValue({ status: 'running' });

      RoadmapModule.convertToTasks();

      expect(mockCloseModal).toHaveBeenCalledWith('modal-roadmap');
      expect(mockDoSendMessage).toHaveBeenCalled();
      expect(mockStartInteractiveAgentWithMessage).not.toHaveBeenCalled();
    });

    it('should switch to acceptEdits when agent is running in plan mode', () => {
      global.$ = createSelectionMock({
        milestones: [mockElement({
          'phase-id': 'phase1', 'milestone-id': 'milestone1', 'milestone-title': 'Test Milestone'
        })]
      });

      mockState.permissionMode = 'plan';
      mockState.currentSessionId = 'session-123';
      mockFindProjectById.mockReturnValue({ status: 'running' });
      mockApi.stopAgent.mockReturnValue({ done: jest.fn((cb) => { cb(); return { fail: jest.fn() }; }) });

      RoadmapModule.convertToTasks();

      expect(mockCloseModal).toHaveBeenCalledWith('modal-roadmap');
      expect(mockPermissionModeModule.setSwitchingState).toHaveBeenCalledWith(true);
      expect(mockApi.stopAgent).toHaveBeenCalledWith('test-project-id');
      expect(mockDoSendMessage).not.toHaveBeenCalled();
    });

    it('should set acceptEdits when starting agent not running', () => {
      global.$ = createSelectionMock({
        milestones: [mockElement({
          'phase-id': 'phase1', 'milestone-id': 'milestone1', 'milestone-title': 'Test Milestone'
        })]
      });

      mockState.permissionMode = 'plan';
      mockFindProjectById.mockReturnValue({ status: 'stopped' });

      RoadmapModule.convertToTasks();

      expect(mockState.permissionMode).toBe('acceptEdits');
      expect(mockStartInteractiveAgentWithMessage).toHaveBeenCalled();
      expect(mockPermissionModeModule.updateButtons).toHaveBeenCalled();
    });

    it('should start interactive agent when not running', () => {
      global.$ = createSelectionMock({
        milestones: [mockElement({
          'phase-id': 'phase1', 'milestone-id': 'milestone1', 'milestone-title': 'Test Milestone'
        })]
      });

      mockFindProjectById.mockReturnValue({ status: 'stopped' });

      RoadmapModule.convertToTasks();

      expect(mockCloseModal).toHaveBeenCalledWith('modal-roadmap');
      expect(mockStartInteractiveAgentWithMessage).toHaveBeenCalled();
      expect(mockDoSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('prompt generation', () => {
    it('should generate correct prompt for phase items', () => {
      let capturedPrompt = '';

      global.$ = createSelectionMock({
        phases: [mockElement({
          'phase-id': 'phase1', 'phase-title': 'Core Infrastructure'
        })]
      });

      mockFindProjectById.mockReturnValue({ status: 'stopped' });
      mockStartInteractiveAgentWithMessage.mockImplementation((prompt) => {
        capturedPrompt = prompt;
      });

      RoadmapModule.convertToTasks();

      expect(capturedPrompt).toContain('**Phase**: Core Infrastructure');
    });

    it('should generate correct prompt for milestone items', () => {
      let capturedPrompt = '';

      global.$ = createSelectionMock({
        milestones: [mockElement({
          'phase-id': 'phase1', 'milestone-id': 'milestone1', 'milestone-title': 'Setup Database'
        })]
      });

      mockFindProjectById.mockReturnValue({ status: 'stopped' });
      mockStartInteractiveAgentWithMessage.mockImplementation((prompt) => {
        capturedPrompt = prompt;
      });

      RoadmapModule.convertToTasks();

      expect(capturedPrompt).toContain('Please convert the following roadmap items into actionable tasks');
      expect(capturedPrompt).toContain('**Milestone**: Setup Database');
      expect(capturedPrompt).toContain('Break it down into specific, actionable sub-tasks');
      expect(capturedPrompt).toContain('Add these to your todo list using the TodoWrite tool');
    });

    it('should generate correct prompt for task items', () => {
      let capturedPrompt = '';

      global.$ = createSelectionMock({
        tasks: [mockElement({
          'phase-id': 'phase1', 'milestone-id': 'milestone1', 'task-index': 0, 'task-title': 'Create user table'
        })]
      });

      mockFindProjectById.mockReturnValue({ status: 'stopped' });
      mockStartInteractiveAgentWithMessage.mockImplementation((prompt) => {
        capturedPrompt = prompt;
      });

      RoadmapModule.convertToTasks();

      expect(capturedPrompt).toContain('**Task**: Create user table');
    });

    it('should skip milestones when their phase is selected', () => {
      let capturedPrompt = '';

      global.$ = createSelectionMock({
        phases: [mockElement({
          'phase-id': 'phase1', 'phase-title': 'Core Infrastructure'
        })],
        milestones: [mockElement({
          'phase-id': 'phase1', 'milestone-id': 'milestone1', 'milestone-title': 'Setup Database'
        })]
      });

      mockFindProjectById.mockReturnValue({ status: 'stopped' });
      mockStartInteractiveAgentWithMessage.mockImplementation((prompt) => {
        capturedPrompt = prompt;
      });

      RoadmapModule.convertToTasks();

      expect(capturedPrompt).toContain('**Phase**: Core Infrastructure');
      expect(capturedPrompt).not.toContain('**Milestone**: Setup Database');
    });

    it('should skip tasks when their phase is selected', () => {
      let capturedPrompt = '';

      global.$ = createSelectionMock({
        phases: [mockElement({
          'phase-id': 'phase1', 'phase-title': 'Core Infrastructure'
        })],
        tasks: [mockElement({
          'phase-id': 'phase1', 'milestone-id': 'milestone1', 'task-index': 0, 'task-title': 'Create user table'
        })]
      });

      mockFindProjectById.mockReturnValue({ status: 'stopped' });
      mockStartInteractiveAgentWithMessage.mockImplementation((prompt) => {
        capturedPrompt = prompt;
      });

      RoadmapModule.convertToTasks();

      expect(capturedPrompt).toContain('**Phase**: Core Infrastructure');
      expect(capturedPrompt).not.toContain('**Task**: Create user table');
    });

    it('should skip tasks when their milestone is selected', () => {
      let capturedPrompt = '';

      global.$ = createSelectionMock({
        milestones: [mockElement({
          'phase-id': 'phase1', 'milestone-id': 'milestone1', 'milestone-title': 'Database Setup'
        })],
        tasks: [mockElement({
          'phase-id': 'phase1', 'milestone-id': 'milestone1', 'task-index': 0, 'task-title': 'Create user table'
        })]
      });

      mockFindProjectById.mockReturnValue({ status: 'stopped' });
      mockStartInteractiveAgentWithMessage.mockImplementation((prompt) => {
        capturedPrompt = prompt;
      });

      RoadmapModule.convertToTasks();

      // Should only include the milestone, not the individual task
      expect(capturedPrompt).toContain('**Milestone**: Database Setup');
      expect(capturedPrompt).not.toContain('**Task**: Create user table');
    });
  });
});
