/**
 * @jest-environment jsdom
 */

const MessageRenderer = require('../../public/js/modules/message-renderer');

describe('MessageRenderer', () => {
  let mockEscapeHtml;
  let mockToolRenderer;
  let mockMarked;

  beforeEach(() => {
    mockEscapeHtml = jest.fn((str) => str ? str.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '');
    mockToolRenderer = {
      renderToolMessage: jest.fn().mockReturnValue('<div class="tool-message">Tool</div>')
    };
    mockMarked = {
      setOptions: jest.fn(),
      parse: jest.fn((content) => `<p>${content}</p>`)
    };

    MessageRenderer.init({
      escapeHtml: mockEscapeHtml,
      ToolRenderer: mockToolRenderer,
      marked: mockMarked
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('renderMarkdown', () => {
    it('should use marked to parse markdown', () => {
      const result = MessageRenderer.renderMarkdown('**bold** text');

      expect(mockMarked.setOptions).toHaveBeenCalledWith({ breaks: true, gfm: true });
      expect(mockMarked.parse).toHaveBeenCalledWith('**bold** text');
    });

    it('should fallback to escaped pre when marked is undefined', () => {
      MessageRenderer.init({
        escapeHtml: mockEscapeHtml,
        ToolRenderer: mockToolRenderer,
        marked: undefined
      });

      const result = MessageRenderer.renderMarkdown('<script>alert(1)</script>');

      expect(result).toContain('pre');
      expect(mockEscapeHtml).toHaveBeenCalled();
    });

    it('should fallback to escaped pre when marked throws', () => {
      mockMarked.parse.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = MessageRenderer.renderMarkdown('test content');

      expect(result).toContain('pre');
      expect(result).toContain('whitespace-pre-wrap');
    });
  });

  describe('renderMessage', () => {
    it('should dispatch tool_use messages to ToolRenderer', () => {
      const msg = { type: 'tool_use', toolInfo: { name: 'Read' } };

      const result = MessageRenderer.renderMessage(msg);

      expect(mockToolRenderer.renderToolMessage).toHaveBeenCalledWith(msg);
      expect(result).toContain('tool-message');
    });

    it('should render question messages', () => {
      const msg = { type: 'question', content: 'Choose an option' };

      const result = MessageRenderer.renderMessage(msg);

      expect(result).toContain('conversation-message question');
      expect(result).toContain('question-header');
    });

    it('should render permission messages', () => {
      const msg = { type: 'permission', content: 'Allow this?' };

      const result = MessageRenderer.renderMessage(msg);

      expect(result).toContain('conversation-message permission');
      expect(result).toContain('permission-header');
    });

    it('should render plan_mode messages', () => {
      const msg = { type: 'plan_mode', content: 'Entering plan mode' };

      const result = MessageRenderer.renderMessage(msg);

      expect(result).toContain('conversation-message plan-mode');
    });

    it('should render compaction messages', () => {
      const msg = { type: 'compaction', content: 'Compacted' };

      const result = MessageRenderer.renderMessage(msg);

      expect(result).toContain('conversation-message compaction');
      expect(result).toContain('Context Compacted');
    });

    it('should render user messages', () => {
      const msg = { type: 'user', content: 'Hello Claude' };

      const result = MessageRenderer.renderMessage(msg);

      expect(result).toContain('conversation-message user');
      expect(result).toContain('data-msg-type="user"');
      expect(result).toContain('You');
    });

    it('should render stdout messages as assistant', () => {
      const msg = { type: 'stdout', content: 'Response text' };

      const result = MessageRenderer.renderMessage(msg);

      expect(result).toContain('conversation-message stdout');
      expect(result).toContain('data-msg-type="assistant"');
      expect(result).toContain('Claude');
    });

    it('should render assistant messages', () => {
      const msg = { type: 'assistant', content: 'I can help with that' };

      const result = MessageRenderer.renderMessage(msg);

      expect(result).toContain('conversation-message assistant');
      expect(result).toContain('data-msg-type="assistant"');
    });

    it('should render fallback system messages', () => {
      const msg = { type: 'unknown', content: 'System message' };

      const result = MessageRenderer.renderMessage(msg);

      expect(result).toContain('conversation-message unknown');
      expect(result).toContain('data-msg-type="system"');
      expect(result).toContain('pre');
    });

    it('should use system as default type class', () => {
      const msg = { content: 'No type message' };

      const result = MessageRenderer.renderMessage(msg);

      expect(result).toContain('conversation-message system');
    });
  });

  describe('renderUserMessage', () => {
    it('should include user icon and sender name', () => {
      const msg = { type: 'user', content: 'Test' };

      const result = MessageRenderer.renderUserMessage(msg);

      expect(result).toContain('message-header');
      expect(result).toContain('message-sender');
      expect(result).toContain('You');
    });

    it('should render attached images', () => {
      const msg = {
        type: 'user',
        content: 'With image',
        images: [
          { dataUrl: 'data:image/png;base64,ABC123' }
        ]
      };

      const result = MessageRenderer.renderUserMessage(msg);

      expect(result).toContain('conversation-image');
      expect(result).toContain('data:image/png;base64,ABC123');
      expect(result).toContain('window.showImageModal');
    });

    it('should render multiple images', () => {
      const msg = {
        type: 'user',
        images: [
          { dataUrl: 'data:image/png;base64,IMG1' },
          { dataUrl: 'data:image/png;base64,IMG2' }
        ]
      };

      const result = MessageRenderer.renderUserMessage(msg);

      expect(result).toContain('IMG1');
      expect(result).toContain('IMG2');
    });

    it('should render content with markdown', () => {
      const msg = { type: 'user', content: '**bold** text' };

      const result = MessageRenderer.renderUserMessage(msg);

      expect(result).toContain('markdown-content');
      expect(mockMarked.parse).toHaveBeenCalledWith('**bold** text');
    });

    it('should handle message with only images', () => {
      const msg = {
        type: 'user',
        images: [{ dataUrl: 'data:image/png;base64,IMG' }]
      };

      const result = MessageRenderer.renderUserMessage(msg);

      expect(result).toContain('conversation-image');
      expect(result).not.toContain('message-content markdown-content');
    });
  });

  describe('renderAssistantMessage', () => {
    it('should include Claude icon and sender name', () => {
      const msg = { type: 'assistant', content: 'Hello' };

      const result = MessageRenderer.renderAssistantMessage(msg, 'assistant');

      expect(result).toContain('claude-header');
      expect(result).toContain('Claude');
    });

    it('should render content with markdown', () => {
      const msg = { type: 'assistant', content: '# Heading' };

      const result = MessageRenderer.renderAssistantMessage(msg, 'assistant');

      expect(result).toContain('markdown-content');
      expect(mockMarked.parse).toHaveBeenCalledWith('# Heading');
    });

    it('should use provided type class', () => {
      const msg = { content: 'Test' };

      const result = MessageRenderer.renderAssistantMessage(msg, 'stdout');

      expect(result).toContain('conversation-message stdout');
    });
  });

  describe('renderQuestionMessage', () => {
    it('should render question with header', () => {
      const msg = {
        type: 'question',
        content: 'What do you want?',
        questionInfo: {
          header: 'User Choice',
          question: 'Pick one'
        }
      };

      const result = MessageRenderer.renderQuestionMessage(msg);

      expect(result).toContain('question-header');
      expect(result).toContain('User Choice');
      expect(result).toContain('Pick one');
    });

    it('should use content as fallback question', () => {
      const msg = {
        type: 'question',
        content: 'Fallback question'
      };

      const result = MessageRenderer.renderQuestionMessage(msg);

      expect(result).toContain('Fallback question');
    });

    it('should use Question as default header', () => {
      const msg = { type: 'question', content: 'Test' };

      const result = MessageRenderer.renderQuestionMessage(msg);

      expect(result).toContain('Question');
    });

    it('should render options with labels and descriptions', () => {
      const msg = {
        type: 'question',
        questionInfo: {
          question: 'Choose',
          options: [
            { label: 'Option A', description: 'First option' },
            { label: 'Option B', description: 'Second option' }
          ]
        }
      };

      const result = MessageRenderer.renderQuestionMessage(msg);

      expect(result).toContain('question-options');
      expect(result).toContain('Option A');
      expect(result).toContain('First option');
      expect(result).toContain('Option B');
      expect(result).toContain('Second option');
    });

    it('should add Other option when options exist', () => {
      const msg = {
        type: 'question',
        questionInfo: {
          question: 'Choose',
          options: [{ label: 'Option A' }]
        }
      };

      const result = MessageRenderer.renderQuestionMessage(msg);

      expect(result).toContain('question-option-other');
      expect(result).toContain('Other...');
      expect(result).toContain('Type a custom response');
    });

    it('should not render options section when no options', () => {
      const msg = { type: 'question', content: 'Simple question' };

      const result = MessageRenderer.renderQuestionMessage(msg);

      expect(result).not.toContain('question-options');
    });

    it('should include data attributes on option buttons', () => {
      const msg = {
        type: 'question',
        questionInfo: {
          options: [{ label: 'Test Label' }]
        }
      };

      const result = MessageRenderer.renderQuestionMessage(msg);

      expect(result).toContain('data-option-index="0"');
      expect(result).toContain('data-option-label="Test Label"');
    });
  });

  describe('renderPermissionMessage', () => {
    it('should render permission with tool name', () => {
      const msg = {
        type: 'permission',
        permissionInfo: {
          tool: 'Write',
          action: 'Write to file'
        }
      };

      const result = MessageRenderer.renderPermissionMessage(msg);

      expect(result).toContain('Permission Request');
      expect(result).toContain('permission-tool');
      expect(result).toContain('Write');
    });

    it('should use Unknown as default tool name', () => {
      const msg = { type: 'permission', content: 'Allow?' };

      const result = MessageRenderer.renderPermissionMessage(msg);

      expect(result).toContain('Unknown');
    });

    it('should show file path details', () => {
      const msg = {
        type: 'permission',
        permissionInfo: {
          tool: 'Write',
          details: { file_path: '/path/to/file.js' }
        }
      };

      const result = MessageRenderer.renderPermissionMessage(msg);

      expect(result).toContain('permission-detail');
      expect(result).toContain('File:');
      expect(result).toContain('/path/to/file.js');
    });

    it('should show command details', () => {
      const msg = {
        type: 'permission',
        permissionInfo: {
          tool: 'Bash',
          details: { command: 'npm install' }
        }
      };

      const result = MessageRenderer.renderPermissionMessage(msg);

      expect(result).toContain('Command:');
      expect(result).toContain('npm install');
    });

    it('should render all action buttons', () => {
      const msg = { type: 'permission', content: 'Allow?' };

      const result = MessageRenderer.renderPermissionMessage(msg);

      expect(result).toContain('permission-actions');
      expect(result).toContain('data-response="yes"');
      expect(result).toContain('Approve');
      expect(result).toContain('data-response="no"');
      expect(result).toContain('Deny');
      expect(result).toContain('data-response="always"');
      expect(result).toContain('Always Allow');
    });
  });

  describe('renderPlanModeMessage', () => {
    it('should render enter plan mode', () => {
      const msg = {
        type: 'plan_mode',
        content: 'Entering plan mode',
        planModeInfo: { action: 'enter' }
      };

      const result = MessageRenderer.renderPlanModeMessage(msg);

      expect(result).toContain('Plan Mode');
      expect(result).toContain('bg-blue-900/40');
      expect(result).toContain('border-blue-500');
      expect(result).toContain('text-blue-400');
    });

    it('should render exit plan mode with action buttons', () => {
      const msg = {
        type: 'plan_mode',
        content: 'Plan ready for review',
        planModeInfo: { action: 'exit' }
      };

      const result = MessageRenderer.renderPlanModeMessage(msg);

      expect(result).toContain('Plan Ready');
      expect(result).toContain('bg-green-900/40');
      expect(result).toContain('border-green-500');
      expect(result).toContain('text-green-400');
      expect(result).toContain('plan-approve-btn');
      expect(result).toContain('plan-request-changes-btn');
      expect(result).toContain('plan-reject-btn');
    });

    it('should include plan content container for exit mode', () => {
      const msg = {
        type: 'plan_mode',
        planModeInfo: { action: 'exit' }
      };

      const result = MessageRenderer.renderPlanModeMessage(msg);

      expect(result).toContain('plan-content-container');
    });

    it('should not include action buttons for enter mode', () => {
      const msg = {
        type: 'plan_mode',
        planModeInfo: { action: 'enter' }
      };

      const result = MessageRenderer.renderPlanModeMessage(msg);

      expect(result).not.toContain('plan-approve-btn');
      expect(result).not.toContain('plan-content-container');
    });

    it('should default to enter action', () => {
      const msg = { type: 'plan_mode', content: 'Test' };

      const result = MessageRenderer.renderPlanModeMessage(msg);

      expect(result).toContain('Plan Mode');
      expect(result).toContain('bg-blue-900/40');
    });
  });

  describe('renderCompactionMessage', () => {
    it('should render compaction header', () => {
      const msg = { type: 'compaction', content: 'Summary here' };

      const result = MessageRenderer.renderCompactionMessage(msg);

      expect(result).toContain('Context Compacted');
      expect(result).toContain('bg-amber-900/30');
      expect(result).toContain('border-amber-500');
      expect(result).toContain('text-amber-300');
    });

    it('should show summary in details if content provided', () => {
      const msg = {
        type: 'compaction',
        content: 'This is the compacted summary of the conversation.'
      };

      const result = MessageRenderer.renderCompactionMessage(msg);

      expect(result).toContain('details');
      expect(result).toContain('View Summary');
      expect(result).toContain('This is the compacted summary');
    });

    it('should not show details for default content', () => {
      const msg = {
        type: 'compaction',
        content: 'Context was compacted to reduce token usage.'
      };

      const result = MessageRenderer.renderCompactionMessage(msg);

      expect(result).not.toContain('details');
      expect(result).not.toContain('View Summary');
    });

    it('should not show details when content is empty', () => {
      const msg = { type: 'compaction', content: '' };

      const result = MessageRenderer.renderCompactionMessage(msg);

      expect(result).not.toContain('View Summary');
    });
  });

  describe('renderSystemMessage', () => {
    it('should render with escaped content in pre tag', () => {
      const msg = { content: '<script>alert(1)</script>' };

      const result = MessageRenderer.renderSystemMessage(msg, 'system');

      expect(result).toContain('pre');
      expect(result).toContain('whitespace-pre-wrap');
      expect(mockEscapeHtml).toHaveBeenCalledWith('<script>alert(1)</script>');
    });

    it('should include type class', () => {
      const msg = { content: 'Test' };

      const result = MessageRenderer.renderSystemMessage(msg, 'custom-type');

      expect(result).toContain('conversation-message custom-type');
    });
  });

  describe('icon helpers', () => {
    it('should return user icon SVG', () => {
      const icon = MessageRenderer.getUserIcon();

      expect(icon).toContain('svg');
      expect(icon).toContain('M16 7a4 4 0 11-8 0');
    });

    it('should return Claude icon SVG', () => {
      const icon = MessageRenderer.getClaudeIcon();

      expect(icon).toContain('svg');
      expect(icon).toContain('M12 2C6.48 2');
    });

    it('should return question icon SVG', () => {
      const icon = MessageRenderer.getQuestionIcon();

      expect(icon).toContain('svg');
      expect(icon).toContain('M8.228 9c');
    });

    it('should return permission icon SVG', () => {
      const icon = MessageRenderer.getPermissionIcon();

      expect(icon).toContain('svg');
      expect(icon).toContain('M12 15v2m-6 4h12');
    });

    it('should return compaction icon SVG', () => {
      const icon = MessageRenderer.getCompactionIcon();

      expect(icon).toContain('svg');
      expect(icon).toContain('text-amber-400');
      expect(icon).toContain('M19 11H5m14 0');
    });
  });

  describe('HTML escaping', () => {
    it('should escape HTML in question content', () => {
      const msg = {
        type: 'question',
        questionInfo: {
          header: '<script>',
          question: '<img onerror=alert(1)>'
        }
      };

      MessageRenderer.renderQuestionMessage(msg);

      expect(mockEscapeHtml).toHaveBeenCalledWith('<script>');
      expect(mockEscapeHtml).toHaveBeenCalledWith('<img onerror=alert(1)>');
    });

    it('should escape HTML in permission content', () => {
      const msg = {
        type: 'permission',
        permissionInfo: {
          tool: '<script>',
          action: '<img>',
          details: {
            file_path: '</code><script>',
            command: '&& rm -rf /'
          }
        }
      };

      MessageRenderer.renderPermissionMessage(msg);

      expect(mockEscapeHtml).toHaveBeenCalledWith('<script>');
      expect(mockEscapeHtml).toHaveBeenCalledWith('<img>');
      expect(mockEscapeHtml).toHaveBeenCalledWith('</code><script>');
      expect(mockEscapeHtml).toHaveBeenCalledWith('&& rm -rf /');
    });

    it('should escape HTML in plan mode content', () => {
      const msg = {
        type: 'plan_mode',
        content: '<script>alert(1)</script>'
      };

      MessageRenderer.renderPlanModeMessage(msg);

      expect(mockEscapeHtml).toHaveBeenCalledWith('<script>alert(1)</script>');
    });

    it('should escape HTML in compaction summary', () => {
      const msg = {
        type: 'compaction',
        content: '<div onclick="evil()">'
      };

      MessageRenderer.renderCompactionMessage(msg);

      expect(mockEscapeHtml).toHaveBeenCalledWith('<div onclick="evil()">');
    });

    it('should escape HTML in system message', () => {
      const msg = { content: '<script>bad</script>' };

      MessageRenderer.renderSystemMessage(msg, 'system');

      expect(mockEscapeHtml).toHaveBeenCalledWith('<script>bad</script>');
    });
  });
});
