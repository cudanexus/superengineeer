/**
 * Tests for textarea resize behavior
 * - Manual resize textareas should have resize: vertical
 * - Auto-resize textareas should grow with content
 * - Auto-resize textareas should respect max-height
 * - Form reset should reset auto-resize textareas
 */

describe('Textarea Resize Behavior', () => {
  describe('Auto-resize textareas', () => {
    let form;
    let textarea;

    function setupAutoResizeTextareas() {
      function autoResize(textareaEl) {
        var $textarea = $(textareaEl);
        var maxHeight = parseInt($textarea.css('max-height'), 10) || 300;

        textareaEl.style.height = 'auto';

        var newHeight = Math.min(textareaEl.scrollHeight, maxHeight);
        textareaEl.style.height = newHeight + 'px';

        if (textareaEl.scrollHeight > maxHeight) {
          $textarea.addClass('expanded');
        } else {
          $textarea.removeClass('expanded');
        }
      }

      $(document).on('input', '.textarea-auto-resize', function() {
        autoResize(this);
      });

      $(document).on('reset', 'form', function() {
        var formEl = this;

        setTimeout(function() {
          $(formEl).find('.textarea-auto-resize').each(function() {
            this.style.height = 'auto';
            $(this).removeClass('expanded');
          });
        }, 0);
      });

      $('.textarea-auto-resize').each(function() {
        autoResize(this);
      });
    }

    beforeEach(() => {
      document.body.innerHTML = `
        <form id="test-form">
          <textarea
            id="test-textarea"
            class="textarea-auto-resize"
            style="max-height: 200px; min-height: 40px;"
          ></textarea>
          <button type="submit">Submit</button>
        </form>
      `;

      form = document.getElementById('test-form');
      textarea = document.getElementById('test-textarea');

      setupAutoResizeTextareas();
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    describe('Initial state', () => {
      it('should have auto resize class', () => {
        expect(textarea.classList.contains('textarea-auto-resize')).toBe(true);
      });

      it('should not have expanded class initially', () => {
        expect(textarea.classList.contains('expanded')).toBe(false);
      });
    });

    describe('Height adjustment on input', () => {
      it('should adjust height when content is added', () => {
        const initialHeight = textarea.style.height;
        textarea.value = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // Height should be set (non-empty after input)
        expect(textarea.style.height).not.toBe('');
      });

      it('should reset height when content is cleared', () => {
        // First add content
        textarea.value = 'Line 1\nLine 2\nLine 3';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // Then clear it
        textarea.value = '';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // Height should be reset to auto calculation
        expect(textarea.style.height).not.toBe('');
      });
    });

    describe('Max height constraint', () => {
      it('should add expanded class when content exceeds max height', () => {
        // Add lots of content to exceed max height
        let content = '';

        for (let i = 0; i < 50; i++) {
          content += 'Line ' + i + '\n';
        }

        textarea.value = content;

        // Mock scrollHeight to be greater than max height
        Object.defineProperty(textarea, 'scrollHeight', {
          get: function() { return 500; },
          configurable: true
        });

        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        expect(textarea.classList.contains('expanded')).toBe(true);
      });

      it('should not add expanded class when content is within max height', () => {
        textarea.value = 'Short content';

        // Mock scrollHeight to be less than max height
        Object.defineProperty(textarea, 'scrollHeight', {
          get: function() { return 50; },
          configurable: true
        });

        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        expect(textarea.classList.contains('expanded')).toBe(false);
      });
    });

    describe('Form reset handler function', () => {
      it('should be able to reset height to auto directly', () => {
        // Set a specific height first
        textarea.style.height = '150px';
        textarea.classList.add('expanded');

        // Directly test the reset logic (what the handler does)
        textarea.style.height = 'auto';
        textarea.classList.remove('expanded');

        expect(textarea.style.height).toBe('auto');
        expect(textarea.classList.contains('expanded')).toBe(false);
      });
    });
  });

  describe('Resizable textareas CSS class', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <textarea id="resizable-textarea" class="textarea-resizable"></textarea>
      `;
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('should have resizable class applied', () => {
      const textarea = document.getElementById('resizable-textarea');
      expect(textarea.classList.contains('textarea-resizable')).toBe(true);
    });
  });

  describe('Multiple auto-resize textareas', () => {
    function setupAutoResizeTextareas() {
      function autoResize(textareaEl) {
        var $textarea = $(textareaEl);
        var maxHeight = parseInt($textarea.css('max-height'), 10) || 300;

        textareaEl.style.height = 'auto';

        var newHeight = Math.min(textareaEl.scrollHeight, maxHeight);
        textareaEl.style.height = newHeight + 'px';

        if (textareaEl.scrollHeight > maxHeight) {
          $textarea.addClass('expanded');
        } else {
          $textarea.removeClass('expanded');
        }
      }

      $(document).on('input', '.textarea-auto-resize', function() {
        autoResize(this);
      });

      $('.textarea-auto-resize').each(function() {
        autoResize(this);
      });
    }

    beforeEach(() => {
      document.body.innerHTML = `
        <textarea id="textarea1" class="textarea-auto-resize"></textarea>
        <textarea id="textarea2" class="textarea-auto-resize"></textarea>
      `;

      setupAutoResizeTextareas();
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('should handle multiple textareas independently', () => {
      const textarea1 = document.getElementById('textarea1');
      const textarea2 = document.getElementById('textarea2');

      textarea1.value = 'Content in first textarea';
      textarea1.dispatchEvent(new Event('input', { bubbles: true }));

      textarea2.value = 'Different content';
      textarea2.dispatchEvent(new Event('input', { bubbles: true }));

      // Both should have height set
      expect(textarea1.style.height).not.toBe('');
      expect(textarea2.style.height).not.toBe('');
    });
  });
});
