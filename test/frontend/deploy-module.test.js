const mockApi = {
  getFlyDeployStatus: jest.fn(),
  startFlyDeploy: jest.fn()
};

const mockState = {
  selectedProjectId: 'project-1'
};

const mockShowToast = jest.fn();
const mockShowErrorToast = jest.fn();
const mockOpenModal = jest.fn();

function makeJQueryObject() {
  const api = {
    on: jest.fn().mockReturnThis(),
    addClass: jest.fn().mockReturnThis(),
    removeClass: jest.fn().mockReturnThis(),
    attr: jest.fn().mockReturnThis(),
    html: jest.fn().mockReturnThis(),
    prop: jest.fn().mockReturnThis(),
    toggleClass: jest.fn().mockReturnThis(),
    hasClass: jest.fn().mockReturnValue(false),
    scrollTop: jest.fn().mockReturnThis(),
    length: 1,
    0: { scrollHeight: 100 }
  };

  let textValue = '';
  api.text = jest.fn((value) => {
    if (arguments.length === 0) {
      return textValue;
    }
    textValue = value;
    return api;
  });

  return api;
}

describe('Deploy Module', () => {
  let DeployModule;
  let jqueryMap;

  beforeEach(() => {
    jest.clearAllMocks();
    jqueryMap = {};
    mockApi.getFlyDeployStatus.mockReturnValue({
      done(callback) {
        callback({ status: 'idle', isActive: false, message: 'Ready to deploy' });
        return this;
      },
      fail() {
        return this;
      }
    });

    global.document = {};
    global.$ = jest.fn((selector) => {
      if (!jqueryMap[selector]) {
        jqueryMap[selector] = makeJQueryObject();
      }
      return jqueryMap[selector];
    });

    delete require.cache[require.resolve('../../public/js/modules/deploy-module.js')];
    DeployModule = require('../../public/js/modules/deploy-module.js');

    DeployModule.init({
      state: mockState,
      api: mockApi,
      showToast: mockShowToast,
      showErrorToast: mockShowErrorToast,
      openModal: mockOpenModal
    });
  });

  it('exposes the deploy module API', () => {
    expect(typeof DeployModule.init).toBe('function');
    expect(typeof DeployModule.setupHandlers).toBe('function');
    expect(typeof DeployModule.startDeploy).toBe('function');
    expect(typeof DeployModule.handleDeployOutput).toBe('function');
    expect(typeof DeployModule.handleDeployStatus).toBe('function');
  });

  it('starts a deployment for the selected project', () => {
    const promise = {
      done(callback) {
        callback({
          deploymentId: 'deploy-1',
          appName: 'test-app',
          status: 'deploying',
          message: 'Deploying test-app'
        });
        return promise;
      },
      fail() {
        return promise;
      }
    };

    mockApi.startFlyDeploy.mockReturnValue(promise);

    DeployModule.startDeploy();

    expect(mockApi.startFlyDeploy).toHaveBeenCalledWith('project-1', {});
    expect(mockOpenModal).toHaveBeenCalledWith('modal-fly-deploy');
  });

  it('updates UI state from deploy status messages', () => {
    DeployModule.onProjectChanged('project-1');
    DeployModule.handleDeployStatus({
      deploymentId: 'deploy-1',
      appName: 'test-app',
      status: 'completed',
      isActive: false,
      message: 'Deployment finished'
    });

    expect(global.$).toHaveBeenCalledWith('#btn-deploy-project');
    expect(global.$).toHaveBeenCalledWith('#fly-deploy-status');
  });
});
