/**
 * Tests for run configurations module functionality
 */

// Mock dependencies
const mockApi = {
  getRunConfigs: jest.fn(),
  createRunConfig: jest.fn(),
  updateRunConfig: jest.fn(),
  deleteRunConfig: jest.fn(),
  startRunConfig: jest.fn(),
  stopRunConfig: jest.fn(),
  getRunConfigStatus: jest.fn()
};

const mockState = {
  selectedProjectId: 'test-project',
  activeTab: 'run-configs'
};

const mockShowToast = jest.fn();
const mockShowErrorToast = jest.fn();
const mockEscapeHtml = jest.fn((s) => s);

// Create jQuery mock chain
function createJqueryChain() {
  const chain = {
    on: jest.fn().mockReturnThis(),
    off: jest.fn().mockReturnThis(),
    prop: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    val: jest.fn().mockReturnValue(''),
    html: jest.fn().mockReturnThis(),
    empty: jest.fn().mockReturnThis(),
    append: jest.fn().mockReturnThis(),
    addClass: jest.fn().mockReturnThis(),
    removeClass: jest.fn().mockReturnThis(),
    show: jest.fn().mockReturnThis(),
    hide: jest.fn().mockReturnThis(),
    find: jest.fn().mockReturnThis(),
    closest: jest.fn().mockReturnThis(),
    remove: jest.fn().mockReturnThis(),
    data: jest.fn().mockReturnValue(null),
    is: jest.fn().mockReturnValue(false),
    length: 0,
    replaceWith: jest.fn().mockReturnThis(),
    scrollTop: jest.fn().mockReturnThis(),
    hasClass: jest.fn().mockReturnValue(false),
    each: jest.fn()
  };
  return chain;
}

global.$ = jest.fn(() => createJqueryChain());
global.window = {
  Terminal: jest.fn(() => ({
    loadAddon: jest.fn(),
    open: jest.fn(),
    write: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn()
  })),
  FitAddon: {
    FitAddon: jest.fn(() => ({
      fit: jest.fn()
    }))
  }
};

global.document = {
  getElementById: jest.fn(() => null),
  addEventListener: jest.fn()
};

global.ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn()
}));

describe('Run Configs Module', () => {
  let RunConfigsModule;

  beforeEach(() => {
    jest.clearAllMocks();
    delete require.cache[require.resolve('../../public/js/modules/run-configs-module.js')];
  });

  it('should load the module without errors', () => {
    expect(() => {
      RunConfigsModule = require('../../public/js/modules/run-configs-module.js');
    }).not.toThrow();
  });

  it('should expose expected public API methods', () => {
    RunConfigsModule = require('../../public/js/modules/run-configs-module.js');

    expect(typeof RunConfigsModule.init).toBe('function');
    expect(typeof RunConfigsModule.setupHandlers).toBe('function');
    expect(typeof RunConfigsModule.onTabActivated).toBe('function');
    expect(typeof RunConfigsModule.onProjectChanged).toBe('function');
    expect(typeof RunConfigsModule.handleOutput).toBe('function');
    expect(typeof RunConfigsModule.handleStatusChange).toBe('function');
  });

  it('should initialize without errors', () => {
    RunConfigsModule = require('../../public/js/modules/run-configs-module.js');

    expect(() => {
      RunConfigsModule.init({
        state: mockState,
        api: mockApi,
        showToast: mockShowToast,
        showErrorToast: mockShowErrorToast,
        escapeHtml: mockEscapeHtml
      });
    }).not.toThrow();
  });

  it('should setup event handlers without errors', () => {
    RunConfigsModule = require('../../public/js/modules/run-configs-module.js');

    RunConfigsModule.init({
      state: mockState,
      api: mockApi,
      showToast: mockShowToast,
      showErrorToast: mockShowErrorToast,
      escapeHtml: mockEscapeHtml
    });

    expect(() => {
      RunConfigsModule.setupHandlers();
    }).not.toThrow();

    // Verify delegated event handlers were registered
    expect(global.$).toHaveBeenCalledWith(document);
  });

  it('should load configs when tab is activated with a selected project', () => {
    RunConfigsModule = require('../../public/js/modules/run-configs-module.js');

    const mockPromise = {
      done: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis()
    };

    mockApi.getRunConfigs.mockReturnValue(mockPromise);

    RunConfigsModule.init({
      state: mockState,
      api: mockApi,
      showToast: mockShowToast,
      showErrorToast: mockShowErrorToast,
      escapeHtml: mockEscapeHtml
    });

    RunConfigsModule.onTabActivated();

    expect(mockApi.getRunConfigs).toHaveBeenCalledWith('test-project');
  });

  it('should not load configs when no project is selected', () => {
    RunConfigsModule = require('../../public/js/modules/run-configs-module.js');

    RunConfigsModule.init({
      state: { selectedProjectId: null, activeTab: 'run-configs' },
      api: mockApi,
      showToast: mockShowToast,
      showErrorToast: mockShowErrorToast,
      escapeHtml: mockEscapeHtml
    });

    RunConfigsModule.onTabActivated();

    expect(mockApi.getRunConfigs).not.toHaveBeenCalled();
  });

  it('should handle project change without errors', () => {
    RunConfigsModule = require('../../public/js/modules/run-configs-module.js');

    RunConfigsModule.init({
      state: mockState,
      api: mockApi,
      showToast: mockShowToast,
      showErrorToast: mockShowErrorToast,
      escapeHtml: mockEscapeHtml
    });

    expect(() => {
      RunConfigsModule.onProjectChanged();
    }).not.toThrow();
  });

  it('should ignore output data without configId', () => {
    RunConfigsModule = require('../../public/js/modules/run-configs-module.js');

    RunConfigsModule.init({
      state: mockState,
      api: mockApi,
      showToast: mockShowToast,
      showErrorToast: mockShowErrorToast,
      escapeHtml: mockEscapeHtml
    });

    // These should all return early without creating terminals
    expect(() => {
      RunConfigsModule.handleOutput(null);
      RunConfigsModule.handleOutput({});
      RunConfigsModule.handleOutput({ data: 'no config id' });
    }).not.toThrow();
  });

  it('should handle status change data', () => {
    RunConfigsModule = require('../../public/js/modules/run-configs-module.js');

    RunConfigsModule.init({
      state: mockState,
      api: mockApi,
      showToast: mockShowToast,
      showErrorToast: mockShowErrorToast,
      escapeHtml: mockEscapeHtml
    });

    // Should not throw
    expect(() => {
      RunConfigsModule.handleStatusChange({ configId: 'config-1', status: { state: 'running' } });
    }).not.toThrow();
  });

  it('should ignore status change without required data', () => {
    RunConfigsModule = require('../../public/js/modules/run-configs-module.js');

    RunConfigsModule.init({
      state: mockState,
      api: mockApi,
      showToast: mockShowToast,
      showErrorToast: mockShowErrorToast,
      escapeHtml: mockEscapeHtml
    });

    expect(() => {
      RunConfigsModule.handleStatusChange(null);
      RunConfigsModule.handleStatusChange({});
      RunConfigsModule.handleStatusChange({ configId: 'x' });
    }).not.toThrow();
  });
});
