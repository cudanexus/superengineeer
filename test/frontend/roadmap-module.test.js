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
      selectedProjectId: 'test-project-id'
    };

    mockEscapeHtml = jest.fn((str) => str);
    mockShowToast = jest.fn();
    mockCloseModal = jest.fn();
    mockFindProjectById = jest.fn();
    mockDoSendMessage = jest.fn();
    mockStartInteractiveAgentWithMessage = jest.fn();

    // Initialize module
    RoadmapModule.init({
      state: mockState,
      escapeHtml: mockEscapeHtml,
      showToast: mockShowToast,
      closeModal: mockCloseModal,
      findProjectById: mockFindProjectById,
      doSendMessage: mockDoSendMessage,
      startInteractiveAgentWithMessage: mockStartInteractiveAgentWithMessage
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
      const stored = JSON.parse(localStorage.getItem('claudito-milestone-expanded'));
      expect(stored[key]).toBe(true);
    });

    it('should toggle from expanded to collapsed', () => {
      const key = 'phase1-milestone1';
      localStorage.setItem('claudito-milestone-expanded', JSON.stringify({ [key]: true }));

      const result = RoadmapModule.toggleMilestoneExpanded(key);

      expect(result).toBe(false);
      const stored = JSON.parse(localStorage.getItem('claudito-milestone-expanded'));
      expect(stored[key]).toBe(false);
    });

    it('should handle multiple milestones independently', () => {
      const key1 = 'phase1-milestone1';
      const key2 = 'phase1-milestone2';

      RoadmapModule.toggleMilestoneExpanded(key1);
      RoadmapModule.toggleMilestoneExpanded(key2);

      const stored = JSON.parse(localStorage.getItem('claudito-milestone-expanded'));
      expect(stored[key1]).toBe(true);
      expect(stored[key2]).toBe(true);
    });

    it('should preserve other milestone states when toggling', () => {
      const key1 = 'phase1-milestone1';
      const key2 = 'phase1-milestone2';
      localStorage.setItem('claudito-milestone-expanded', JSON.stringify({ [key1]: true }));

      RoadmapModule.toggleMilestoneExpanded(key2);

      const stored = JSON.parse(localStorage.getItem('claudito-milestone-expanded'));
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

      expect(global.$).toHaveBeenCalledWith('.roadmap-select-milestone, .roadmap-select-task');
      expect(mockProp).toHaveBeenCalledWith('checked', false);
    });
  });

  describe('runSelectedTasks', () => {
    it('should show error toast when no items selected', () => {
      global.$ = jest.fn().mockReturnValue({
        each: jest.fn(),
        removeClass: jest.fn().mockReturnThis(),
        addClass: jest.fn().mockReturnThis()
      });

      RoadmapModule.runSelectedTasks();

      expect(mockShowToast).toHaveBeenCalledWith('No items selected', 'error');
    });

    it('should send message to running agent', () => {
      // Create mock element with data
      const mockMilestoneElement = {
        data: jest.fn((key) => {
          if (key === 'phase-id') return 'phase1';
          if (key === 'milestone-id') return 'milestone1';
          if (key === 'milestone-title') return 'Test Milestone';
        })
      };

      global.$ = jest.fn((selector) => {
        // When $(this) is called inside each callback, return the mock element
        if (selector === mockMilestoneElement || typeof selector === 'object') {
          return mockMilestoneElement;
        }

        if (selector === '.roadmap-select-milestone:checked') {
          return {
            each: (cb) => {
              cb.call(mockMilestoneElement, 0, mockMilestoneElement);
            }
          };
        }

        if (selector === '.roadmap-select-task:checked:not(:disabled)') {
          return { each: jest.fn() };
        }

        return {
          removeClass: jest.fn().mockReturnThis(),
          addClass: jest.fn().mockReturnThis(),
          text: jest.fn().mockReturnThis(),
          prop: jest.fn().mockReturnThis(),
          each: jest.fn()
        };
      });

      mockFindProjectById.mockReturnValue({ status: 'running' });

      RoadmapModule.runSelectedTasks();

      expect(mockCloseModal).toHaveBeenCalledWith('modal-roadmap');
      expect(mockDoSendMessage).toHaveBeenCalled();
      expect(mockStartInteractiveAgentWithMessage).not.toHaveBeenCalled();
    });

    it('should start interactive agent when not running', () => {
      const mockMilestoneElement = {
        data: jest.fn((key) => {
          if (key === 'phase-id') return 'phase1';
          if (key === 'milestone-id') return 'milestone1';
          if (key === 'milestone-title') return 'Test Milestone';
        })
      };

      global.$ = jest.fn((selector) => {
        if (selector === mockMilestoneElement || typeof selector === 'object') {
          return mockMilestoneElement;
        }

        if (selector === '.roadmap-select-milestone:checked') {
          return {
            each: (cb) => {
              cb.call(mockMilestoneElement, 0, mockMilestoneElement);
            }
          };
        }

        if (selector === '.roadmap-select-task:checked:not(:disabled)') {
          return { each: jest.fn() };
        }

        return {
          removeClass: jest.fn().mockReturnThis(),
          addClass: jest.fn().mockReturnThis(),
          text: jest.fn().mockReturnThis(),
          prop: jest.fn().mockReturnThis(),
          each: jest.fn()
        };
      });

      mockFindProjectById.mockReturnValue({ status: 'stopped' });

      RoadmapModule.runSelectedTasks();

      expect(mockCloseModal).toHaveBeenCalledWith('modal-roadmap');
      expect(mockStartInteractiveAgentWithMessage).toHaveBeenCalled();
      expect(mockDoSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('prompt generation', () => {
    it('should generate correct prompt for milestone items', () => {
      const mockMilestoneElement = {
        data: jest.fn((key) => {
          if (key === 'phase-id') return 'phase1';
          if (key === 'milestone-id') return 'milestone1';
          if (key === 'milestone-title') return 'Setup Database';
        })
      };

      let capturedPrompt = '';

      global.$ = jest.fn((selector) => {
        if (selector === mockMilestoneElement || typeof selector === 'object') {
          return mockMilestoneElement;
        }

        if (selector === '.roadmap-select-milestone:checked') {
          return {
            each: (cb) => {
              cb.call(mockMilestoneElement, 0, mockMilestoneElement);
            }
          };
        }

        if (selector === '.roadmap-select-task:checked:not(:disabled)') {
          return { each: jest.fn() };
        }

        return {
          removeClass: jest.fn().mockReturnThis(),
          addClass: jest.fn().mockReturnThis(),
          text: jest.fn().mockReturnThis(),
          prop: jest.fn().mockReturnThis(),
          each: jest.fn()
        };
      });

      mockFindProjectById.mockReturnValue({ status: 'stopped' });
      mockStartInteractiveAgentWithMessage.mockImplementation((prompt) => {
        capturedPrompt = prompt;
      });

      RoadmapModule.runSelectedTasks();

      expect(capturedPrompt).toContain('Please work on the following roadmap items:');
      expect(capturedPrompt).toContain('**Milestone**: Setup Database');
      expect(capturedPrompt).toContain('Complete all pending tasks in this milestone');
      expect(capturedPrompt).toContain('Update the ROADMAP.md to mark completed items with [x]');
    });

    it('should generate correct prompt for task items', () => {
      const mockTaskElement = {
        data: jest.fn((key) => {
          if (key === 'phase-id') return 'phase1';
          if (key === 'milestone-id') return 'milestone1';
          if (key === 'task-index') return 0;
          if (key === 'task-title') return 'Create user table';
        })
      };

      let capturedPrompt = '';

      global.$ = jest.fn((selector) => {
        if (selector === mockTaskElement || typeof selector === 'object') {
          return mockTaskElement;
        }

        if (selector === '.roadmap-select-milestone:checked') {
          return { each: jest.fn() };
        }

        if (selector === '.roadmap-select-task:checked:not(:disabled)') {
          return {
            each: (cb) => {
              cb.call(mockTaskElement, 0, mockTaskElement);
            }
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

      mockFindProjectById.mockReturnValue({ status: 'stopped' });
      mockStartInteractiveAgentWithMessage.mockImplementation((prompt) => {
        capturedPrompt = prompt;
      });

      RoadmapModule.runSelectedTasks();

      expect(capturedPrompt).toContain('**Task**: Create user table');
    });

    it('should skip tasks when their milestone is selected', () => {
      const mockMilestoneElement = {
        data: jest.fn((key) => {
          if (key === 'phase-id') return 'phase1';
          if (key === 'milestone-id') return 'milestone1';
          if (key === 'milestone-title') return 'Database Setup';
        })
      };

      const mockTaskElement = {
        data: jest.fn((key) => {
          if (key === 'phase-id') return 'phase1';
          if (key === 'milestone-id') return 'milestone1'; // Same milestone
          if (key === 'task-index') return 0;
          if (key === 'task-title') return 'Create user table';
        })
      };

      let capturedPrompt = '';
      let currentMockElement = null;

      global.$ = jest.fn((selector) => {
        if (typeof selector === 'object') {
          return selector; // Return the element itself when wrapped
        }

        if (selector === '.roadmap-select-milestone:checked') {
          return {
            each: (cb) => {
              currentMockElement = mockMilestoneElement;
              cb.call(mockMilestoneElement, 0, mockMilestoneElement);
            }
          };
        }

        if (selector === '.roadmap-select-task:checked:not(:disabled)') {
          return {
            each: (cb) => {
              currentMockElement = mockTaskElement;
              cb.call(mockTaskElement, 0, mockTaskElement);
            }
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

      mockFindProjectById.mockReturnValue({ status: 'stopped' });
      mockStartInteractiveAgentWithMessage.mockImplementation((prompt) => {
        capturedPrompt = prompt;
      });

      RoadmapModule.runSelectedTasks();

      // Should only include the milestone, not the individual task
      expect(capturedPrompt).toContain('**Milestone**: Database Setup');
      expect(capturedPrompt).not.toContain('**Task**: Create user table');
    });
  });
});
