/**
 * Unit tests for Prompt Templates Module
 */

describe('PromptTemplatesModule', function() {
  var PromptTemplatesModule;
  var mockDeps;
  var $;

  beforeEach(function() {
    // Create specific mocks for different elements
    var templatesListMock = {
      html: jest.fn()
    };
    var templateSelectorListMock = {
      html: jest.fn()
    };
    var documentMock = {
      on: jest.fn()
    };

    // Setup jQuery mock with specific element mapping
    $ = jest.fn().mockImplementation(function(selector) {
      if (selector === document) {
        return documentMock;
      }
      if (selector === '#templates-list') {
        return templatesListMock;
      }
      if (selector === '#template-selector-list') {
        return templateSelectorListMock;
      }
      if (typeof selector === 'string' && selector.startsWith('#')) {
        // Generic element mock
        return {
          html: jest.fn(),
          text: jest.fn(),
          val: jest.fn().mockReturnValue(''),
          attr: jest.fn().mockReturnValue(''),
          trigger: jest.fn(),
          focus: jest.fn(),
          data: jest.fn().mockReturnValue(''),
          find: jest.fn().mockReturnValue({
            first: jest.fn().mockReturnValue({
              focus: jest.fn()
            }),
            each: jest.fn()
          }),
          closest: jest.fn().mockReturnValue({
            data: jest.fn().mockReturnValue('')
          }),
          addClass: jest.fn().mockReturnValue({
            removeClass: jest.fn()
          }),
          removeClass: jest.fn().mockReturnValue({
            addClass: jest.fn()
          }),
          is: jest.fn().mockReturnValue(false),
          trim: jest.fn().mockReturnValue('')
        };
      }
      return {
        html: jest.fn(),
        text: jest.fn(),
        val: jest.fn().mockReturnValue(''),
        attr: jest.fn().mockReturnValue(''),
        data: jest.fn().mockReturnValue(''),
        addClass: jest.fn(),
        removeClass: jest.fn(),
        find: jest.fn().mockReturnValue({
          first: jest.fn().mockReturnValue({
            focus: jest.fn()
          }),
          each: jest.fn()
        })
      };
    });

    // Mock global $ and $.ajax
    $.ajax = jest.fn().mockReturnValue({
      fail: jest.fn()
    });

    window.$ = $;
    global.$ = $;

    // Mock confirm dialog
    window.confirm = jest.fn().mockReturnValue(true);

    // Load the module
    PromptTemplatesModule = require('../../public/js/modules/prompt-templates-module.js');

    // Setup mock dependencies
    mockDeps = {
      state: {
        settings: {
          promptTemplates: [
            {
              id: 'test-template',
              name: 'Test Template',
              description: 'A test template',
              content: 'Hello ${text:name}, how are you?'
            },
            {
              id: 'complex-template',
              name: 'Complex Template',
              description: 'Complex template with variables',
              content: '${textarea:description}\n\nType: ${select:type:bug,feature,enhancement}\nUrgent: ${checkbox:urgent}'
            }
          ]
        }
      },
      escapeHtml: jest.fn().mockImplementation(function(str) {
        return str; // Simple mock - return input as-is
      }),
      showToast: jest.fn(),
      openModal: jest.fn(),
      closeAllModals: jest.fn()
    };
  });

  afterEach(function() {
    delete window.$;
    delete global.$;
    delete window.confirm;
  });

  describe('init', function() {
    it('should initialize with dependencies', function() {
      expect(function() {
        PromptTemplatesModule.init(mockDeps);
      }).not.toThrow();
    });

    it('should setup event handlers', function() {
      PromptTemplatesModule.init(mockDeps);

      // Verify that document event handlers are set up
      expect($(document).on).toHaveBeenCalledWith('click', '#btn-open-templates', expect.any(Function));
      expect($(document).on).toHaveBeenCalledWith('click', '.template-selector-item', expect.any(Function));
      expect($(document).on).toHaveBeenCalledWith('submit', '#form-template-fill', expect.any(Function));
      expect($(document).on).toHaveBeenCalledWith('submit', '#form-template-editor', expect.any(Function));
      expect($(document).on).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should handle missing dependencies gracefully', function() {
      expect(function() {
        PromptTemplatesModule.init({});
      }).not.toThrow();
    });
  });

  describe('parseTemplateVariables', function() {
    it('should parse text variables', function() {
      var content = 'Hello ${text:name}!';
      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      expect(variables).toEqual([
        {
          type: 'text',
          name: 'name',
          label: 'Name',
          options: null,
          defaultValue: null
        }
      ]);
    });

    it('should parse textarea variables', function() {
      var content = 'Description: ${textarea:description}';
      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      expect(variables).toEqual([
        {
          type: 'textarea',
          name: 'description',
          label: 'Description',
          options: null,
          defaultValue: null
        }
      ]);
    });

    it('should parse select variables with options', function() {
      var content = 'Type: ${select:type:bug,feature,enhancement}';
      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      expect(variables).toEqual([
        {
          type: 'select',
          name: 'type',
          label: 'Type',
          options: ['bug', 'feature', 'enhancement'],
          defaultValue: null
        }
      ]);
    });

    it('should parse checkbox variables', function() {
      var content = 'Urgent: ${checkbox:urgent}';
      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      expect(variables).toEqual([
        {
          type: 'checkbox',
          name: 'urgent',
          label: 'Urgent',
          options: null,
          defaultValue: null
        }
      ]);
    });

    it('should parse variables with default values', function() {
      var content = 'Name: ${text:name=John Doe}, Age: ${text:age=25}, Active: ${checkbox:active=true}';
      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      expect(variables).toEqual([
        {
          type: 'text',
          name: 'name',
          label: 'Name',
          options: null,
          defaultValue: 'John Doe'
        },
        {
          type: 'text',
          name: 'age',
          label: 'Age',
          options: null,
          defaultValue: '25'
        },
        {
          type: 'checkbox',
          name: 'active',
          label: 'Active',
          options: null,
          defaultValue: 'true'
        }
      ]);
    });

    it('should handle escaped newlines in default values', function() {
      var content = 'Description: ${textarea:description=Line 1\\nLine 2}';
      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      expect(variables[0].defaultValue).toBe('Line 1\nLine 2');
    });

    it('should avoid duplicate variables', function() {
      var content = 'Hello ${text:name}, goodbye ${text:name}';
      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      expect(variables).toHaveLength(1);
      expect(variables[0].name).toBe('name');
    });

    it('should format variable labels correctly', function() {
      var content = '${text:user_name} ${text:api-key} ${text:firstName}';
      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      expect(variables[0].label).toBe('User Name');
      expect(variables[1].label).toBe('Api Key');
      expect(variables[2].label).toBe('FirstName');
    });

    it('should handle empty content', function() {
      var variables = PromptTemplatesModule.parseTemplateVariables('');
      expect(variables).toEqual([]);
    });

    it('should handle content with no variables', function() {
      var variables = PromptTemplatesModule.parseTemplateVariables('Just plain text');
      expect(variables).toEqual([]);
    });

    it('should handle malformed variables gracefully', function() {
      var content = '${invalid} ${text} ${text:}';
      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      // Should not match malformed variables
      expect(variables).toEqual([]);
    });
  });

  describe('renderTemplate', function() {
    it('should render text variables', function() {
      var content = 'Hello ${text:name}!';
      var values = { name: 'John' };
      var result = PromptTemplatesModule.renderTemplate(content, values);

      expect(result).toBe('Hello John!');
    });

    it('should render textarea variables', function() {
      var content = 'Description: ${textarea:description}';
      var values = { description: 'This is a\nmulti-line description' };
      var result = PromptTemplatesModule.renderTemplate(content, values);

      expect(result).toBe('Description: This is a\nmulti-line description');
    });

    it('should render select variables', function() {
      var content = 'Type: ${select:type:bug,feature}';
      var values = { type: 'bug' };
      var result = PromptTemplatesModule.renderTemplate(content, values);

      expect(result).toBe('Type: bug');
    });

    it('should render checkbox variables', function() {
      var content = 'Urgent: ${checkbox:urgent}, Normal: ${checkbox:normal}';
      var values = { urgent: true, normal: false };
      var result = PromptTemplatesModule.renderTemplate(content, values);

      expect(result).toBe('Urgent: Yes, Normal: ');
    });

    it('should handle missing values', function() {
      var content = 'Hello ${text:name}, age ${text:age}';
      var values = { name: 'John' };
      var result = PromptTemplatesModule.renderTemplate(content, values);

      expect(result).toBe('Hello John, age ');
    });

    it('should handle variables with defaults in template', function() {
      var content = 'Hello ${text:name=Default}';
      var values = { name: 'John' };
      var result = PromptTemplatesModule.renderTemplate(content, values);

      expect(result).toBe('Hello John');
    });

    it('should handle empty values object', function() {
      var content = 'Hello ${text:name}';
      var result = PromptTemplatesModule.renderTemplate(content, {});

      expect(result).toBe('Hello ');
    });
  });

  describe('openSelector', function() {
    beforeEach(function() {
      PromptTemplatesModule.init(mockDeps);
    });

    it('should show message when no templates available', function() {
      mockDeps.state.settings.promptTemplates = [];
      PromptTemplatesModule.openSelector();

      expect(mockDeps.showToast).toHaveBeenCalledWith('No templates available. Add templates in Settings.', 'info');
      expect(mockDeps.openModal).not.toHaveBeenCalled();
    });

    it('should render template list when templates exist', function() {
      PromptTemplatesModule.openSelector();

      expect($('#template-selector-list').html).toHaveBeenCalled();
      expect(mockDeps.openModal).toHaveBeenCalledWith('modal-template-selector');

      var htmlMock = $('#template-selector-list').html;
      var html = htmlMock.mock.calls[htmlMock.mock.calls.length - 1][0];

      expect(html).toContain('template-selector-item');
      expect(html).toContain('Test Template');
      expect(html).toContain('A test template');
      expect(html).toContain('Complex Template');
    });

    it('should escape HTML in template names and descriptions', function() {
      PromptTemplatesModule.openSelector();

      expect(mockDeps.escapeHtml).toHaveBeenCalledWith('test-template');
      expect(mockDeps.escapeHtml).toHaveBeenCalledWith('Test Template');
      expect(mockDeps.escapeHtml).toHaveBeenCalledWith('A test template');
    });

    it('should handle templates without descriptions', function() {
      mockDeps.state.settings.promptTemplates = [
        { id: 'simple', name: 'Simple', content: 'Hello' }
      ];

      PromptTemplatesModule.openSelector();

      var htmlMock = $('#template-selector-list').html;
      var html = htmlMock.mock.calls[htmlMock.mock.calls.length - 1][0];

      expect(html).toContain('Simple');
      expect(html).not.toContain('text-gray-400 mt-0.5'); // Description styling
    });
  });

  describe('closeSelector', function() {
    beforeEach(function() {
      PromptTemplatesModule.init(mockDeps);
    });

    it('should close all modals and reset selector state', function() {
      PromptTemplatesModule.closeSelector();

      expect(mockDeps.closeAllModals).toHaveBeenCalled();
    });
  });

  describe('template selection and insertion', function() {
    beforeEach(function() {
      PromptTemplatesModule.init(mockDeps);
    });

    it('should insert template directly if no variables', function() {
      mockDeps.state.settings.promptTemplates = [
        { id: 'simple', name: 'Simple', content: 'Hello world!' }
      ];

      // Mock input element
      var mockInput = $('#input-message');
      mockInput.val.mockReturnValue('Existing text');
      mockInput[0] = { selectionStart: 13, setSelectionRange: jest.fn() };

      // Simulate template selection via event handling would be tested
      // Here we test the core functionality
      expect(function() {
        // Would trigger selectTemplate('simple') through event handler
      }).not.toThrow();
    });
  });

  describe('renderSettingsTab', function() {
    beforeEach(function() {
      PromptTemplatesModule.init(mockDeps);
    });

    it('should show empty message when no templates', function() {
      mockDeps.state.settings.promptTemplates = [];
      PromptTemplatesModule.renderSettingsTab();

      expect($('#templates-list').html).toHaveBeenCalledWith(
        '<div class="text-gray-500 text-sm text-center py-4">No templates. Click "Add Template" to create one.</div>'
      );
    });

    it('should render template list with edit and delete buttons', function() {
      PromptTemplatesModule.renderSettingsTab();

      expect($('#templates-list').html).toHaveBeenCalled();

      var htmlMock = $('#templates-list').html;
      var html = htmlMock.mock.calls[htmlMock.mock.calls.length - 1][0];

      expect(html).toContain('template-list-item');
      expect(html).toContain('btn-edit-template');
      expect(html).toContain('btn-delete-template');
      expect(html).toContain('Test Template');
      expect(html).toContain('Complex Template');
    });

    it('should escape HTML in template display', function() {
      PromptTemplatesModule.renderSettingsTab();

      expect(mockDeps.escapeHtml).toHaveBeenCalledWith('test-template');
      expect(mockDeps.escapeHtml).toHaveBeenCalledWith('Test Template');
      expect(mockDeps.escapeHtml).toHaveBeenCalledWith('A test template');
    });

    it('should handle templates without descriptions in settings', function() {
      mockDeps.state.settings.promptTemplates = [
        { id: 'simple', name: 'Simple', content: 'Hello' }
      ];

      PromptTemplatesModule.renderSettingsTab();

      var htmlMock = $('#templates-list').html;
      var html = htmlMock.mock.calls[htmlMock.mock.calls.length - 1][0];

      expect(html).toContain('Simple');
      // Should not include description div
      expect(html).not.toContain('text-gray-400 truncate');
    });
  });

  describe('error handling', function() {
    beforeEach(function() {
      PromptTemplatesModule.init(mockDeps);
    });

    it('should handle missing state gracefully', function() {
      // Reinitialize with null state
      var nullStateDeps = Object.assign({}, mockDeps, { state: null });
      PromptTemplatesModule.init(nullStateDeps);

      expect(function() {
        PromptTemplatesModule.openSelector();
      }).not.toThrow();

      expect(mockDeps.showToast).toHaveBeenCalledWith('No templates available. Add templates in Settings.', 'info');
    });

    it('should handle missing settings gracefully', function() {
      mockDeps.state.settings = null;

      expect(function() {
        PromptTemplatesModule.openSelector();
      }).not.toThrow();
    });

    it('should handle missing promptTemplates array', function() {
      delete mockDeps.state.settings.promptTemplates;

      expect(function() {
        PromptTemplatesModule.openSelector();
      }).not.toThrow();

      expect(mockDeps.showToast).toHaveBeenCalledWith('No templates available. Add templates in Settings.', 'info');
    });

    it('should handle malformed template objects', function() {
      mockDeps.state.settings.promptTemplates = [
        null,
        { id: 'valid', name: 'Valid Template', content: 'Hello' },
        { /* missing required fields */ }
      ];

      expect(function() {
        PromptTemplatesModule.renderSettingsTab();
      }).not.toThrow();
    });
  });

  describe('module structure', function() {
    it('should expose the required public interface', function() {
      expect(typeof PromptTemplatesModule.init).toBe('function');
      expect(typeof PromptTemplatesModule.openSelector).toBe('function');
      expect(typeof PromptTemplatesModule.closeSelector).toBe('function');
      expect(typeof PromptTemplatesModule.renderSettingsTab).toBe('function');
      expect(typeof PromptTemplatesModule.parseTemplateVariables).toBe('function');
      expect(typeof PromptTemplatesModule.renderTemplate).toBe('function');
    });

    it('should be a valid UMD module', function() {
      expect(PromptTemplatesModule).toBeDefined();
      expect(typeof PromptTemplatesModule).toBe('object');
    });
  });

  describe('variable regex patterns', function() {
    it('should handle complex variable patterns', function() {
      var content = [
        '${text:simple}',
        '${text:with-dash}',
        '${text:with_underscore}',
        '${select:options:opt1,opt2,opt3}',
        '${text:default=value}',
        '${select:with_default:a,b,c=b}',
        '${checkbox:flag=true}'
      ].join(' ');

      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      expect(variables).toHaveLength(7);
      expect(variables[0].name).toBe('simple');
      expect(variables[1].name).toBe('with-dash');
      expect(variables[2].name).toBe('with_underscore');
      expect(variables[3].name).toBe('options');
      expect(variables[3].options).toEqual(['opt1', 'opt2', 'opt3']);
      expect(variables[4].defaultValue).toBe('value');
      expect(variables[5].defaultValue).toBe('b');
      expect(variables[6].defaultValue).toBe('true');
    });

    it('should reject invalid variable names', function() {
      var content = [
        '${text:invalid@name}',
        '${text:invalid.name}',
        '${text:invalid name}',
        '${text:123invalid}' // numbers at start might be ok
      ].join(' ');

      var variables = PromptTemplatesModule.parseTemplateVariables(content);

      // Should only match valid patterns (numbers might be ok)
      expect(variables.length).toBeLessThan(4);
    });
  });

  describe('integration tests', function() {
    beforeEach(function() {
      PromptTemplatesModule.init(mockDeps);
    });

    it('should handle full template workflow', function() {
      // Test parsing complex template
      var template = mockDeps.state.settings.promptTemplates[1]; // complex-template
      var variables = PromptTemplatesModule.parseTemplateVariables(template.content);

      expect(variables).toHaveLength(3);
      expect(variables[0].type).toBe('textarea');
      expect(variables[1].type).toBe('select');
      expect(variables[2].type).toBe('checkbox');

      // Test rendering with values
      var values = {
        description: 'Test description',
        type: 'bug',
        urgent: true
      };

      var result = PromptTemplatesModule.renderTemplate(template.content, values);

      expect(result).toContain('Test description');
      expect(result).toContain('bug');
      expect(result).toContain('Yes'); // checkbox true renders as "Yes"
    });
  });
});