/**
 * @jest-environment jsdom
 */

const PermissionModeModule = require('../../public/js/modules/permission-mode-module');

describe('PermissionModeModule', () => {
  let mockState;
  let mockApi;
  let mockShowToast;
  let mockShowErrorToast;
  let mockFindProjectById;
  let mockUpdateProjectStatusById;
  let mockStartAgentStatusPolling;
  let mockAppendMessage;
  let mockRenderProjectList;

  function createMockJQuery() {
    const mockElement = {
      text: jest.fn().mockReturnThis(),
      addClass: jest.fn().mockReturnThis(),
      removeClass: jest.fn().mockReturnThis(),
      prop: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis()
    };

    return jest.fn().mockReturnValue(mockElement);
  }

  beforeEach(() => {
    mockState = {
      selectedProjectId: 'test-project-id',
      permissionMode: 'acceptEdits',
      pendingPermissionMode: null,
      currentSessionId: null,
      isModeSwitching: false,
      currentAgentMode: null,
      waitingVersion: 0
    };

    mockApi = {
      stopAgent: jest.fn().mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          this._doneCb = cb;
          return this;
        }),
        fail: jest.fn().mockReturnThis()
      }),
      startInteractiveAgent: jest.fn().mockReturnValue({
        done: jest.fn().mockReturnThis(),
        fail: jest.fn().mockReturnThis()
      })
    };

    mockShowToast = jest.fn();
    mockShowErrorToast = jest.fn();
    mockFindProjectById = jest.fn().mockReturnValue(null);
    mockUpdateProjectStatusById = jest.fn();
    mockStartAgentStatusPolling = jest.fn();
    mockAppendMessage = jest.fn();
    mockRenderProjectList = jest.fn();

    global.$ = createMockJQuery();

    PermissionModeModule.init({
      state: mockState,
      api: mockApi,
      showToast: mockShowToast,
      showErrorToast: mockShowErrorToast,
      findProjectById: mockFindProjectById,
      updateProjectStatusById: mockUpdateProjectStatusById,
      startAgentStatusPolling: mockStartAgentStatusPolling,
      appendMessage: mockAppendMessage,
      renderProjectList: mockRenderProjectList
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getModeLabel', () => {
    it('should return "Plan" for plan mode', () => {
      expect(PermissionModeModule.getModeLabel('plan')).toBe('Plan');
    });

    it('should return "Accept Edits" for acceptEdits mode', () => {
      expect(PermissionModeModule.getModeLabel('acceptEdits')).toBe('Accept Edits');
    });

    it('should return "Default" for unknown mode', () => {
      expect(PermissionModeModule.getModeLabel('unknown')).toBe('Default');
    });
  });

  describe('updateButtons', () => {
    it('should activate Accept Edits button by default', () => {
      mockState.permissionMode = 'acceptEdits';
      mockState.pendingPermissionMode = null;
      const mockBtn = global.$();

      PermissionModeModule.updateButtons();

      expect(global.$).toHaveBeenCalledWith('.perm-btn');
      expect(mockBtn.removeClass).toHaveBeenCalledWith('perm-active');
    });

    it('should activate Plan button when mode is plan', () => {
      mockState.permissionMode = 'plan';
      mockState.pendingPermissionMode = null;

      PermissionModeModule.updateButtons();

      expect(global.$).toHaveBeenCalledWith('#btn-perm-plan');
    });

    it('should use pending mode for display if set', () => {
      mockState.permissionMode = 'acceptEdits';
      mockState.pendingPermissionMode = 'plan';

      PermissionModeModule.updateButtons();

      expect(global.$).toHaveBeenCalledWith('#btn-perm-plan');
    });
  });

  describe('updatePendingIndicator', () => {
    it('should show indicator when pending mode exists', () => {
      mockState.pendingPermissionMode = 'plan';
      const mockIndicator = global.$();

      PermissionModeModule.updatePendingIndicator();

      expect(global.$).toHaveBeenCalledWith('#pending-mode-label');
      expect(mockIndicator.text).toHaveBeenCalledWith('(switching to Plan)');
      expect(mockIndicator.removeClass).toHaveBeenCalledWith('hidden');
    });

    it('should hide indicator when no pending mode', () => {
      mockState.pendingPermissionMode = null;
      const mockIndicator = global.$();

      PermissionModeModule.updatePendingIndicator();

      expect(mockIndicator.addClass).toHaveBeenCalledWith('hidden');
    });
  });

  describe('setSwitchingState', () => {
    it('should disable buttons when switching', () => {
      const mockBtn = global.$();

      PermissionModeModule.setSwitchingState(true);

      expect(mockState.isModeSwitching).toBe(true);
      expect(global.$).toHaveBeenCalledWith('#btn-perm-accept, #btn-perm-plan');
      expect(mockBtn.prop).toHaveBeenCalledWith('disabled', true);
    });

    it('should enable buttons when not switching', () => {
      const mockBtn = global.$();

      PermissionModeModule.setSwitchingState(false);

      expect(mockState.isModeSwitching).toBe(false);
      expect(mockBtn.prop).toHaveBeenCalledWith('disabled', false);
    });

    it('should add opacity class when switching', () => {
      const mockSelector = global.$();

      PermissionModeModule.setSwitchingState(true);

      expect(global.$).toHaveBeenCalledWith('#permission-mode-selector');
      expect(mockSelector.addClass).toHaveBeenCalledWith('opacity-50 pointer-events-none');
    });

    it('should remove opacity class when not switching', () => {
      const mockSelector = global.$();

      PermissionModeModule.setSwitchingState(false);

      expect(mockSelector.removeClass).toHaveBeenCalledWith('opacity-50 pointer-events-none');
    });
  });

  describe('setMode', () => {
    it('should do nothing if mode is same as effective current mode', () => {
      mockState.permissionMode = 'acceptEdits';

      PermissionModeModule.setMode('acceptEdits');

      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('should cancel pending change if clicking original mode', () => {
      mockState.permissionMode = 'acceptEdits';
      mockState.pendingPermissionMode = 'plan';

      PermissionModeModule.setMode('acceptEdits');

      expect(mockState.pendingPermissionMode).toBeNull();
      expect(mockShowToast).toHaveBeenCalledWith('Pending mode change cancelled', 'info');
    });

    it('should queue change if agent is running and busy', () => {
      mockState.permissionMode = 'acceptEdits';
      mockState.currentSessionId = 'session-123';
      mockFindProjectById.mockReturnValue({
        status: 'running',
        isWaitingForInput: false
      });

      PermissionModeModule.setMode('plan');

      expect(mockState.pendingPermissionMode).toBe('plan');
      expect(mockShowToast).toHaveBeenCalledWith(
        'Mode change to Plan will apply when Claude finishes current operation',
        'info'
      );
    });

    it('should apply mode immediately if agent not running', () => {
      mockState.permissionMode = 'acceptEdits';
      mockFindProjectById.mockReturnValue(null);

      PermissionModeModule.setMode('plan');

      expect(mockState.permissionMode).toBe('plan');
      expect(mockState.pendingPermissionMode).toBeNull();
      expect(mockShowToast).toHaveBeenCalledWith(
        'Permission mode set to Plan (will apply on next agent start)',
        'info'
      );
    });

    it('should restart agent if running and waiting', () => {
      mockState.permissionMode = 'acceptEdits';
      mockState.currentSessionId = 'session-123';
      mockFindProjectById.mockReturnValue({
        status: 'running',
        isWaitingForInput: true
      });

      PermissionModeModule.setMode('plan');

      expect(mockState.permissionMode).toBe('plan');
      expect(mockApi.stopAgent).toHaveBeenCalledWith('test-project-id');
    });
  });

  describe('applyPendingIfNeeded', () => {
    it('should do nothing if no pending mode', () => {
      mockState.pendingPermissionMode = null;

      PermissionModeModule.applyPendingIfNeeded();

      expect(mockApi.stopAgent).not.toHaveBeenCalled();
    });

    it('should clear pending if project not running', () => {
      mockState.pendingPermissionMode = 'plan';
      mockFindProjectById.mockReturnValue({
        status: 'stopped'
      });

      PermissionModeModule.applyPendingIfNeeded();

      expect(mockState.pendingPermissionMode).toBeNull();
      expect(mockApi.stopAgent).not.toHaveBeenCalled();
    });

    it('should apply pending mode if conditions met', () => {
      mockState.pendingPermissionMode = 'plan';
      mockState.currentSessionId = 'session-123';
      mockFindProjectById.mockReturnValue({
        status: 'running'
      });

      PermissionModeModule.applyPendingIfNeeded();

      expect(mockState.permissionMode).toBe('plan');
      expect(mockState.pendingPermissionMode).toBeNull();
      expect(mockApi.stopAgent).toHaveBeenCalled();
    });
  });

  describe('restartAgent', () => {
    it('should stop agent and start with new mode', () => {
      mockState.currentSessionId = 'session-123';
      mockState.permissionMode = 'plan';

      PermissionModeModule.restartAgent();

      expect(mockApi.stopAgent).toHaveBeenCalledWith('test-project-id');
      expect(mockShowToast).toHaveBeenCalledWith(
        'Stopping agent to switch to Plan mode...',
        'info'
      );
    });

    it('should do nothing if no project selected', () => {
      mockState.selectedProjectId = null;

      PermissionModeModule.restartAgent();

      expect(mockApi.stopAgent).not.toHaveBeenCalled();
    });
  });

  describe('approvePlanAndSwitch', () => {
    it('should set mode to acceptEdits and stop agent', () => {
      mockState.currentSessionId = 'session-123';

      PermissionModeModule.approvePlanAndSwitch();

      expect(mockState.permissionMode).toBe('acceptEdits');
      expect(mockState.pendingPermissionMode).toBeNull();
      expect(mockApi.stopAgent).toHaveBeenCalledWith('test-project-id');
      expect(mockShowToast).toHaveBeenCalledWith(
        'Plan approved. Switching to Accept Edits mode...',
        'info'
      );
    });

    it('should do nothing if no project selected', () => {
      mockState.selectedProjectId = null;

      PermissionModeModule.approvePlanAndSwitch();

      expect(mockApi.stopAgent).not.toHaveBeenCalled();
    });
  });

  describe('setupHandlers', () => {
    it('should register Accept Edits button handler', () => {
      const mockBtn = global.$();

      PermissionModeModule.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-perm-accept');
      expect(mockBtn.on).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should register Plan button handler', () => {
      const mockBtn = global.$();

      PermissionModeModule.setupHandlers();

      expect(global.$).toHaveBeenCalledWith('#btn-perm-plan');
      expect(mockBtn.on).toHaveBeenCalledWith('click', expect.any(Function));
    });
  });
});
