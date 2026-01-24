/**
 * Tests for character count indicator on the modification prompt textarea
 * - Shows "0 characters" initially
 * - Updates count on input
 * - Uses singular "character" for count of 1
 * - Resets to "0 characters" when form is reset
 */

describe('Character Count Indicator', () => {
  let form;
  let textarea;
  let charCount;

  function setupCharacterCountHandlers() {
    var $textarea = $('#input-edit-roadmap');
    var $charCount = $('#edit-roadmap-char-count');

    function updateCharCount() {
      var length = $textarea.val().length;
      var text = length === 1 ? '1 character' : length + ' characters';
      $charCount.text(text);
    }

    $textarea.on('input', updateCharCount);

    $('#form-edit-roadmap').on('reset', function() {
      setTimeout(function() {
        updateCharCount();
      }, 0);
    });
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="form-edit-roadmap">
        <textarea name="editPrompt" id="input-edit-roadmap"></textarea>
        <span id="edit-roadmap-char-count">0 characters</span>
        <button type="submit">Modify</button>
      </form>
    `;

    form = document.getElementById('form-edit-roadmap');
    textarea = document.getElementById('input-edit-roadmap');
    charCount = document.getElementById('edit-roadmap-char-count');

    setupCharacterCountHandlers();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Initial state', () => {
    it('should show "0 characters" initially', () => {
      expect(charCount.textContent).toBe('0 characters');
    });
  });

  describe('Input handling', () => {
    it('should update count when text is entered', () => {
      textarea.value = 'hello';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(charCount.textContent).toBe('5 characters');
    });

    it('should use singular "character" for count of 1', () => {
      textarea.value = 'a';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(charCount.textContent).toBe('1 character');
    });

    it('should use plural "characters" for count of 0', () => {
      textarea.value = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(charCount.textContent).toBe('0 characters');
    });

    it('should use plural "characters" for count greater than 1', () => {
      textarea.value = 'ab';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(charCount.textContent).toBe('2 characters');
    });

    it('should handle longer text correctly', () => {
      textarea.value = 'Add a new testing phase with unit tests and integration tests';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(charCount.textContent).toBe('61 characters');
    });

    it('should count spaces and special characters', () => {
      textarea.value = 'a b\nc!@#';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(charCount.textContent).toBe('8 characters');
    });
  });

  describe('Form reset', () => {
    it('should reset count to "0 characters" when form is reset', (done) => {
      // First add some text
      textarea.value = 'some text';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      expect(charCount.textContent).toBe('9 characters');

      // Reset the form
      form.reset();

      // The reset handler uses setTimeout, so we need to wait
      setTimeout(() => {
        expect(charCount.textContent).toBe('0 characters');
        done();
      }, 10);
    });
  });
});
