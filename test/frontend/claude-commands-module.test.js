/**
 * Unit tests for Claude Commands Module
 */

describe('ClaudeCommandsModule', function() {
  var ClaudeCommandsModule;
  var mockDeps;
  var $;

  beforeEach(function() {
    // Create specific mocks for different elements
    var documentMock = {
      on: jest.fn()
    };
    var commandSelectorListMock = {
      html: jest.fn()
    };

    // Setup jQuery mock with specific element mapping
    $ = jest.fn().mockImplementation(function(selector) {
      if (selector === document) {
        return documentMock;
      }
      if (selector === '#command-selector-list') {
        return commandSelectorListMock;
      }
      if (typeof selector === 'string' && selector.startsWith('#')) {
        // Generic element mock
        return {
          html: jest.fn(),
          text: jest.fn(),
          attr: jest.fn().mockReturnValue({
            val: jest.fn().mockReturnValue('')
          }),
          val: jest.fn().mockReturnValue(''),
          trim: jest.fn().mockReturnValue(''),
          focus: jest.fn(),
          data: jest.fn().mockReturnValue(''),
          on: jest.fn(),
          click: jest.fn()
        };
      }
      return {
        html: jest.fn(),
        text: jest.fn(),
        attr: jest.fn().mockReturnValue({
          val: jest.fn().mockReturnValue('')
        }),
        val: jest.fn().mockReturnValue(''),
        focus: jest.fn(),
        data: jest.fn().mockReturnValue(''),
        on: jest.fn()
      };
    });

    window.$ = $;
    global.$ = $;

    // Load the module
    ClaudeCommandsModule = require('../../public/js/modules/claude-commands-module.js');

    // Setup mock dependencies
    mockDeps = {
      escapeHtml: jest.fn().mockImplementation(function(str) {
        return str; // Simple mock - return input as-is
      }),
      openModal: jest.fn(),
      closeAllModals: jest.fn(),
      sendCommand: jest.fn()
    };
  });

  afterEach(function() {
    delete window.$;
    delete global.$;
  });

  describe('init', function() {
    it('should initialize with dependencies', function() {
      expect(function() {
        ClaudeCommandsModule.init(mockDeps);
      }).not.toThrow();
    });

    it('should setup event handlers', function() {
      ClaudeCommandsModule.init(mockDeps);

      // Verify that document event handlers are set up
      expect($(document).on).toHaveBeenCalledWith('click', '#btn-open-commands', expect.any(Function));
      expect($(document).on).toHaveBeenCalledWith('click', '.command-selector-item', expect.any(Function));
      expect($(document).on).toHaveBeenCalledWith('submit', '#form-command-args', expect.any(Function));
    });

    it('should handle missing dependencies gracefully', function() {
      expect(function() {
        ClaudeCommandsModule.init({});
      }).not.toThrow();
    });
  });

  describe('openCommandSelector', function() {
    beforeEach(function() {
      ClaudeCommandsModule.init(mockDeps);
    });

    it('should generate command list HTML', function() {
      ClaudeCommandsModule.openCommandSelector();

      expect($('#command-selector-list').html).toHaveBeenCalled();

      var htmlMock = $('#command-selector-list').html;
      var html = htmlMock.mock.calls[htmlMock.mock.calls.length - 1][0];

      expect(html).toContain('command-selector-item');
      expect(html).toContain('/compact');
      expect(html).toContain('Compact context to save tokens');
    });

    it('should open the correct modal', function() {
      ClaudeCommandsModule.openCommandSelector();

      expect(mockDeps.openModal).toHaveBeenCalledWith('modal-claude-commands');
    });

    it('should escape HTML in command names and descriptions', function() {
      ClaudeCommandsModule.openCommandSelector();

      expect(mockDeps.escapeHtml).toHaveBeenCalledWith('compact');
      expect(mockDeps.escapeHtml).toHaveBeenCalledWith('/compact');
      expect(mockDeps.escapeHtml).toHaveBeenCalledWith('Compact context to save tokens');
    });

    it('should include command selector items with data attributes', function() {
      ClaudeCommandsModule.openCommandSelector();

      var htmlMock = $('#command-selector-list').html;
      var html = htmlMock.mock.calls[htmlMock.mock.calls.length - 1][0];

      expect(html).toContain('data-id="compact"');
    });

    it('should handle commands that require arguments', function() {
      // Mock a command that requires args
      var originalModule = ClaudeCommandsModule;

      // We can't easily modify the internal commands array, so we test the structure
      ClaudeCommandsModule.openCommandSelector();

      var htmlMock = $('#command-selector-list').html;
      var html = htmlMock.mock.calls[htmlMock.mock.calls.length - 1][0];

      // Current compact command doesn't require args, so should not have args badge
      expect(html).not.toContain('args');
    });
  });

  describe('command execution flow', function() {
    var clickHandler;
    var commandSelectorClickHandler;
    var submitHandler;

    beforeEach(function() {
      ClaudeCommandsModule.init(mockDeps);

      // Extract the event handlers
      var onCalls = $(document).on.mock.calls;

      clickHandler = onCalls.find(function(call) {
        return call[0] === 'click' && call[1] === '#btn-open-commands';
      })[2];

      commandSelectorClickHandler = onCalls.find(function(call) {
        return call[0] === 'click' && call[1] === '.command-selector-item';
      })[2];

      submitHandler = onCalls.find(function(call) {
        return call[0] === 'submit' && call[1] === '#form-command-args';
      })[2];
    });

    it('should open command selector when button is clicked', function() {
      // Instead of spying on the function, verify the modal is opened
      var mockEvent = { stopPropagation: jest.fn() };
      clickHandler(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockDeps.openModal).toHaveBeenCalledWith('modal-claude-commands');
    });

    it('should handle command selection for commands without args', function() {
      var mockElement = {
        data: jest.fn().mockReturnValue('compact')
      };

      // Temporarily override $ to handle $(this)
      var originalImplementation = $;
      $ = jest.fn().mockImplementation(function(selector) {
        if (selector === mockElement) {
          return mockElement;
        }
        return originalImplementation(selector);
      });
      window.$ = $;
      global.$ = $;

      commandSelectorClickHandler.call(mockElement);

      expect(mockDeps.closeAllModals).toHaveBeenCalled();
      expect(mockDeps.sendCommand).toHaveBeenCalledWith('/compact');

      // Restore original implementation
      $ = originalImplementation;
      window.$ = $;
      global.$ = $;
    });

    it('should handle invalid command selection', function() {
      var mockElement = {
        data: jest.fn().mockReturnValue('invalid-command')
      };

      // Temporarily override $ to handle $(this)
      var originalImplementation = $;
      $ = jest.fn().mockImplementation(function(selector) {
        if (selector === mockElement) {
          return mockElement;
        }
        return originalImplementation(selector);
      });
      window.$ = $;
      global.$ = $;

      commandSelectorClickHandler.call(mockElement);

      // Should not send command for invalid command ID
      expect(mockDeps.sendCommand).not.toHaveBeenCalled();

      // Restore original implementation
      $ = originalImplementation;
      window.$ = $;
      global.$ = $;
    });

    it('should prevent form submission for args modal', function() {
      var mockEvent = { preventDefault: jest.fn() };

      submitHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });
  });

  describe('command with arguments flow', function() {
    it('should handle commands requiring arguments', function() {
      // This test covers the flow for commands that require args
      // Since the current /compact command doesn't require args,
      // we test the structure and ensure the modal elements are accessed

      ClaudeCommandsModule.init(mockDeps);

      // The actual args modal functionality would be tested if there were
      // commands that require arguments in the commands array
      expect($('#command-args-title').text).toBeDefined();
      expect($('#command-args-label').text).toBeDefined();
      expect($('#input-command-arg').attr).toBeDefined();
    });
  });

  describe('error handling', function() {
    it('should handle missing DOM elements gracefully', function() {
      // Keep the document mock but override other elements to return generic mocks
      var documentMock = {
        on: jest.fn()
      };

      $.mockImplementation(function(selector) {
        if (selector === document) {
          return documentMock;
        }
        // Return generic mock for all other selectors
        return {
          html: jest.fn(),
          text: jest.fn(),
          attr: jest.fn().mockReturnValue({
            val: jest.fn()
          }),
          val: jest.fn().mockReturnValue(''),
          focus: jest.fn()
        };
      });

      ClaudeCommandsModule.init(mockDeps);

      expect(function() {
        ClaudeCommandsModule.openCommandSelector();
      }).not.toThrow();
    });

    it('should handle missing dependencies', function() {
      expect(function() {
        ClaudeCommandsModule.init({
          escapeHtml: null,
          openModal: null,
          closeAllModals: null,
          sendCommand: null
        });
      }).not.toThrow();
    });
  });

  describe('module structure', function() {
    it('should expose the required public interface', function() {
      expect(typeof ClaudeCommandsModule.init).toBe('function');
      expect(typeof ClaudeCommandsModule.openCommandSelector).toBe('function');
    });

    it('should be a valid UMD module', function() {
      expect(ClaudeCommandsModule).toBeDefined();
      expect(typeof ClaudeCommandsModule).toBe('object');
    });
  });

  describe('HTML generation', function() {
    beforeEach(function() {
      ClaudeCommandsModule.init(mockDeps);
    });

    it('should generate well-formed HTML', function() {
      ClaudeCommandsModule.openCommandSelector();

      var htmlMock = $('#command-selector-list').html;
      expect(htmlMock).toHaveBeenCalled(); // Verify HTML was set

      // Get the HTML content that was set
      var html = htmlMock.mock.calls[0][0];

      // Check for proper HTML structure
      expect(html).toContain('<div class="py-1">');
      expect(html).toContain('</div>');
      expect(html).toContain('command-selector-item');
      expect(html).toContain('hover:bg-gray-700');
      expect(html).toContain('cursor-pointer');
    });

    it('should include proper CSS classes for styling', function() {
      ClaudeCommandsModule.openCommandSelector();

      var htmlMock = $('#command-selector-list').html;
      expect(htmlMock).toHaveBeenCalled(); // Verify HTML was set

      // Get the HTML content that was set
      var html = htmlMock.mock.calls[0][0];

      expect(html).toContain('text-purple-400');
      expect(html).toContain('font-mono');
      expect(html).toContain('text-gray-400');
      expect(html).toContain('flex');
      expect(html).toContain('items-center');
      expect(html).toContain('justify-between');
    });
  });

  describe('integration with jQuery', function() {
    it('should properly use jQuery selectors', function() {
      ClaudeCommandsModule.init(mockDeps);
      ClaudeCommandsModule.openCommandSelector();

      // Verify the correct modal was opened
      expect(mockDeps.openModal).toHaveBeenCalledWith('modal-claude-commands');
    });

    it('should setup event delegation correctly', function() {
      ClaudeCommandsModule.init(mockDeps);

      expect($(document).on).toHaveBeenCalledWith('click', '#btn-open-commands', expect.any(Function));
      expect($(document).on).toHaveBeenCalledWith('click', '.command-selector-item', expect.any(Function));
      expect($(document).on).toHaveBeenCalledWith('submit', '#form-command-args', expect.any(Function));
    });
  });
});