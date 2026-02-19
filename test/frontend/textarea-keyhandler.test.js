/**
 * Tests for textarea keyboard handling
 * - Enter key should NOT submit the form (allows multiline input)
 * - Ctrl+Enter should submit the form
 * - Cmd+Enter (metaKey) should submit the form (Mac support)
 */

describe('Textarea Key Handlers', () => {
  let form;
  let textarea;
  let submitCount;

  /**
   * Handler function that mirrors the app.js implementation
   */
  function handleTextareaKeydown(e) {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const formElement = e.target.closest('form');

        if (formElement) {
          formElement.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }
    }
  }

  beforeEach(() => {
    // Reset DOM completely
    document.body.innerHTML = `
      <form id="test-form">
        <textarea id="test-textarea" name="content"></textarea>
        <button type="submit">Submit</button>
      </form>
    `;

    form = document.getElementById('test-form');
    textarea = document.getElementById('test-textarea');
    submitCount = 0;

    // Track form submissions
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitCount++;
    });

    // Attach handler directly to textarea for cleaner testing
    textarea.addEventListener('keydown', handleTextareaKeydown);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Plain Enter key', () => {
    it('should NOT submit the form when Enter is pressed', () => {
      const event = createKeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: false,
        metaKey: false
      });

      textarea.dispatchEvent(event);

      expect(submitCount).toBe(0);
    });

    it('should NOT prevent default for plain Enter (allows newline)', () => {
      const event = createKeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: false,
        metaKey: false
      });

      textarea.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('Ctrl+Enter', () => {
    it('should submit the form when Ctrl+Enter is pressed', () => {
      const event = createKeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        metaKey: false
      });

      textarea.dispatchEvent(event);

      expect(submitCount).toBe(1);
    });

    it('should prevent default for Ctrl+Enter', () => {
      const event = createKeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        metaKey: false
      });

      textarea.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('Cmd+Enter (Mac)', () => {
    it('should submit the form when Cmd+Enter is pressed', () => {
      const event = createKeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: false,
        metaKey: true
      });

      textarea.dispatchEvent(event);

      expect(submitCount).toBe(1);
    });

    it('should prevent default for Cmd+Enter', () => {
      const event = createKeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: false,
        metaKey: true
      });

      textarea.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('Other keys', () => {
    it('should NOT submit the form for other keys', () => {
      const keys = ['a', 'Tab', 'Escape', 'ArrowDown'];

      keys.forEach(key => {
        const event = createKeyboardEvent('keydown', {
          key: key,
          ctrlKey: false,
          metaKey: false
        });

        textarea.dispatchEvent(event);
      });

      expect(submitCount).toBe(0);
    });

    it('should NOT submit for Shift+Enter', () => {
      const event = createKeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        ctrlKey: false,
        metaKey: false
      });

      textarea.dispatchEvent(event);

      expect(submitCount).toBe(0);
    });

    it('should NOT submit for Alt+Enter', () => {
      const event = createKeyboardEvent('keydown', {
        key: 'Enter',
        altKey: true,
        ctrlKey: false,
        metaKey: false
      });

      textarea.dispatchEvent(event);

      expect(submitCount).toBe(0);
    });
  });

  describe('Textarea outside form', () => {
    it('should not error when textarea is not inside a form', () => {
      document.body.innerHTML = '<textarea id="standalone"></textarea>';
      const standalone = document.getElementById('standalone');
      standalone.addEventListener('keydown', handleTextareaKeydown);

      const event = createKeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        metaKey: false
      });

      // Should not throw
      expect(() => standalone.dispatchEvent(event)).not.toThrow();
    });
  });
});
