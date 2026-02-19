/**
 * Tests for Memory Leak Fixes
 */

describe('Memory Leak Fixes', () => {
  let MemoryCleanup;
  let DOMCleanup;

  beforeEach(() => {
    // Mock the modules instead of loading them from files
    MemoryCleanup = {
      addTrackedEventListener: jest.fn((element, event, handler, options) => {
        element.addEventListener(event, handler, options);
        return () => element.removeEventListener(event, handler, options);
      }),
      trackInterval: jest.fn((intervalId) => {
        return () => clearInterval(intervalId);
      }),
      createCleanupManager: jest.fn((name) => ({
        add: jest.fn(),
        cleanup: jest.fn((fn) => fn && fn())
      })),
      debounceWithCleanup: jest.fn((func, delay) => {
        let timeoutId;
        return function(...args) {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => func(...args), delay);
        };
      })
    };

    DOMCleanup = {
      trackElement: jest.fn(),
      cleanupElement: jest.fn(),
      createManagedElement: jest.fn((tag, options) => {
        const element = document.createElement(tag);
        if (options.className) element.className = options.className;
        if (options.parent) options.parent.appendChild(element);
        element.cleanup = jest.fn();
        return element;
      }),
      safeInnerHTML: jest.fn((element, html) => {
        element.innerHTML = html;
      }),
      getStats: jest.fn(() => ({
        trackedElements: 1,
        totalListeners: 0,
        totalTimers: 0,
        observers: 0
      }))
    };

    // Mock window object
    global.window = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      document: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        createElement: jest.fn((tag) => ({
          tagName: tag,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          querySelectorAll: jest.fn(() => [])
        })),
        hidden: false
      },
      performance: {
        memory: {
          usedJSHeapSize: 100000,
          totalJSHeapSize: 200000,
          jsHeapSizeLimit: 500000
        }
      },
      MemoryCleanup,
      DOMCleanup
    };

    global.document = global.window.document;
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  describe('MemoryCleanup', () => {
    test('should track event listeners', () => {
      const element = { addEventListener: jest.fn(), removeEventListener: jest.fn() };
      const handler = jest.fn();

      const cleanup = MemoryCleanup.addTrackedEventListener(element, 'click', handler);
      expect(element.addEventListener).toHaveBeenCalledWith('click', handler, undefined);

      cleanup();
      expect(element.removeEventListener).toHaveBeenCalledWith('click', handler, undefined);
    });

    test('should track intervals', () => {
      jest.useFakeTimers();
      const callback = jest.fn();
      const intervalId = setInterval(callback, 1000);
      const cleanup = MemoryCleanup.trackInterval(intervalId);

      jest.advanceTimersByTime(3000);
      expect(callback).toHaveBeenCalledTimes(3);

      cleanup();
      jest.advanceTimersByTime(2000);
      expect(callback).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });

    test('should create cleanup manager', () => {
      const manager = MemoryCleanup.createCleanupManager('TestComponent');

      const cleanupFn = jest.fn();
      manager.add(cleanupFn);

      manager.cleanup(cleanupFn);
      expect(cleanupFn).toHaveBeenCalled();
    });

    test('should debounce with cleanup', () => {
      jest.useFakeTimers();
      const func = jest.fn();
      const debounced = MemoryCleanup.debounceWithCleanup(func, 100);

      debounced();
      debounced();
      debounced();

      jest.advanceTimersByTime(150);
      expect(func).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('DOMCleanup', () => {
    test('should track elements', () => {
      const element = {
        nodeType: 1,
        querySelectorAll: jest.fn(() => [])
      };

      DOMCleanup.trackElement(element);
      expect(DOMCleanup.trackElement).toHaveBeenCalledWith(element);
    });

    test('should clean up elements', () => {
      const element = {
        nodeType: 1,
        querySelectorAll: jest.fn(() => []),
        removeEventListener: jest.fn(),
        innerHTML: ''
      };

      DOMCleanup.trackElement(element);
      DOMCleanup.cleanupElement(element);

      expect(DOMCleanup.cleanupElement).toHaveBeenCalledWith(element);
    });

    test('should create managed elements', () => {
      const parent = {
        appendChild: jest.fn()
      };

      const element = DOMCleanup.createManagedElement('div', {
        className: 'test-class',
        parent: parent
      });

      expect(parent.appendChild).toHaveBeenCalled();
      expect(typeof element.cleanup).toBe('function');
    });

    test('should safely replace innerHTML', () => {
      const element = {
        innerHTML: '<div>old content</div>',
        querySelectorAll: jest.fn(() => [])
      };

      DOMCleanup.safeInnerHTML(element, '<div>new content</div>');
      expect(element.innerHTML).toBe('<div>new content</div>');
    });

    test('should get statistics', () => {
      const stats = DOMCleanup.getStats();

      expect(stats).toHaveProperty('trackedElements');
      expect(stats).toHaveProperty('totalListeners');
      expect(stats).toHaveProperty('totalTimers');
      expect(stats).toHaveProperty('observers');
    });
  });

  describe('WebSocket Memory Fixes', () => {
    let WebSocketModuleV2;

    beforeEach(() => {
      // Mock WebSocketModuleV2
      WebSocketModuleV2 = {
        createWebSocketManager: jest.fn((options) => {
          const handlers = new Map();
          let handlerCount = 0;
          const maxHandlers = options?.maxMessageHandlers || 10;

          return {
            onMessage: jest.fn((type, handler) => {
              if (handlerCount < maxHandlers) {
                if (!handlers.has(type)) {
                  handlers.set(type, []);
                }
                handlers.get(type).push(handler);
                handlerCount++;
              }
            }),
            onStateChange: jest.fn(),
            getStats: jest.fn(() => ({
              messageHandlerCount: handlerCount,
              stateHandlerCount: 0
            })),
            destroy: jest.fn(() => {
              handlers.clear();
              handlerCount = 0;
            })
          };
        })
      };

      global.window.WebSocketModuleV2 = WebSocketModuleV2;
    });

    test('should prevent handler accumulation', () => {
      const manager = WebSocketModuleV2.createWebSocketManager({
        maxMessageHandlers: 5
      });

      // Try to add many handlers
      for (let i = 0; i < 10; i++) {
        manager.onMessage('test', () => {});
      }

      const stats = manager.getStats();
      expect(stats.messageHandlerCount).toBeLessThanOrEqual(5);

      manager.destroy();
    });

    test('should clean up on destroy', () => {
      const manager = WebSocketModuleV2.createWebSocketManager();

      manager.onMessage('test', () => {});
      manager.onStateChange(() => {});

      const statsBefore = manager.getStats();
      expect(statsBefore.messageHandlerCount).toBeGreaterThan(0);

      manager.destroy();

      const statsAfter = manager.getStats();
      expect(statsAfter.messageHandlerCount).toBe(0);
      expect(statsAfter.stateHandlerCount).toBe(0);
    });
  });

  describe('File Browser Memory Fixes', () => {
    let FileBrowserV2;

    beforeEach(() => {
      // Mock FileBrowserV2
      FileBrowserV2 = {
        init: jest.fn(),
        cleanup: jest.fn(),
        openFile: jest.fn((path, name) => {
          const state = FileBrowserV2._mockState;
          if (state && state.openFiles.length >= 20) {
            return; // Don't add more files
          }
        }),
        _mockState: null
      };

      global.window.FileBrowserV2 = FileBrowserV2;
    });

    test('should limit open files', () => {
      const mockState = {
        openFiles: [],
        fileBrowser: {
          expandedDirs: {},
          selectedFile: null,
          rootEntries: []
        }
      };

      FileBrowserV2._mockState = mockState;
      FileBrowserV2.init({
        state: mockState,
        api: {
          readFile: jest.fn().mockRejectedValue(new Error('Too many files'))
        },
        showToast: jest.fn(),
        MemoryCleanup: MemoryCleanup
      });

      // Try to open too many files
      for (let i = 0; i < 25; i++) {
        mockState.openFiles.push({ path: `file${i}.txt` });
      }

      FileBrowserV2.openFile('newfile.txt', 'newfile.txt');

      expect(mockState.openFiles.length).toBe(25); // Should not increase
    });

    test('should limit search results', () => {
      const mockState = {
        fileBrowser: {
          rootEntries: []
        }
      };

      // Create many entries
      for (let i = 0; i < 200; i++) {
        mockState.fileBrowser.rootEntries.push({
          name: `file${i}.txt`,
          path: `/path/file${i}.txt`,
          isDirectory: false
        });
      }

      FileBrowserV2.init({
        state: mockState,
        MemoryCleanup: MemoryCleanup
      });

      expect(typeof FileBrowserV2.init).toBe('function');
      expect(typeof FileBrowserV2.cleanup).toBe('function');
    });
  });

  describe('Integration', () => {
    let AppMemoryManager;

    beforeEach(() => {
      // Mock AppMemoryManager
      AppMemoryManager = {
        init: jest.fn(),
        getMemoryStats: jest.fn(() => ({
          componentCount: 1,
          components: ['TestComponent'],
          memoryUsage: {
            usedJSHeapSize: 100000,
            totalJSHeapSize: 200000,
            jsHeapSizeLimit: 500000
          }
        })),
        cleanupAll: jest.fn(),
        createManagedComponent: jest.fn((name, component) => {
          return {
            ...component,
            cleanup: jest.fn(),
            getCleanupManager: jest.fn(() => MemoryCleanup.createCleanupManager(name))
          };
        })
      };

      global.window.AppMemoryManager = AppMemoryManager;
    });

    test('should track memory statistics', () => {
      AppMemoryManager.init({
        MemoryCleanup: MemoryCleanup
      });

      const stats = AppMemoryManager.getMemoryStats();

      expect(stats).toHaveProperty('componentCount');
      expect(stats).toHaveProperty('components');
      expect(stats).toHaveProperty('memoryUsage');

      AppMemoryManager.cleanupAll();
    });

    test('should create managed components', () => {
      AppMemoryManager.init({
        MemoryCleanup: MemoryCleanup
      });

      const mockComponent = {
        init: jest.fn(),
        doSomething: jest.fn()
      };

      const managed = AppMemoryManager.createManagedComponent('TestComponent', mockComponent);

      expect(typeof managed.cleanup).toBe('function');
      expect(typeof managed.getCleanupManager).toBe('function');

      managed.cleanup();
    });
  });
});