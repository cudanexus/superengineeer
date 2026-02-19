/**
 * Tests for string utility functions
 */

const Utils = require('../../public/js/utils.js');

describe('String Utilities', () => {
  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(Utils.escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than sign', () => {
      expect(Utils.escapeHtml('a < b')).toBe('a &lt; b');
    });

    it('should escape greater than sign', () => {
      expect(Utils.escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quotes', () => {
      expect(Utils.escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(Utils.escapeHtml("it's")).toBe("it&#039;s");
    });

    it('should escape multiple special characters', () => {
      expect(Utils.escapeHtml('<script>alert("XSS")</script>'))
        .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    it('should handle empty string', () => {
      expect(Utils.escapeHtml('')).toBe('');
    });

    it('should handle null', () => {
      expect(Utils.escapeHtml(null)).toBe('');
    });

    it('should handle undefined', () => {
      expect(Utils.escapeHtml(undefined)).toBe('');
    });

    it('should convert numbers to string', () => {
      expect(Utils.escapeHtml(123)).toBe('123');
    });

    it('should leave plain text unchanged', () => {
      expect(Utils.escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should handle HTML entities in input', () => {
      expect(Utils.escapeHtml('&amp;')).toBe('&amp;amp;');
    });
  });

  describe('escapeRegExp', () => {
    it('should escape dot', () => {
      expect(Utils.escapeRegExp('file.txt')).toBe('file\\.txt');
    });

    it('should escape asterisk', () => {
      expect(Utils.escapeRegExp('*.js')).toBe('\\*\\.js');
    });

    it('should escape question mark', () => {
      expect(Utils.escapeRegExp('file?.txt')).toBe('file\\?\\.txt');
    });

    it('should escape parentheses', () => {
      expect(Utils.escapeRegExp('(test)')).toBe('\\(test\\)');
    });

    it('should escape brackets', () => {
      expect(Utils.escapeRegExp('[a-z]')).toBe('\\[a-z\\]');
    });

    it('should escape braces', () => {
      expect(Utils.escapeRegExp('{foo}')).toBe('\\{foo\\}');
    });

    it('should escape caret and dollar', () => {
      expect(Utils.escapeRegExp('^start$end')).toBe('\\^start\\$end');
    });

    it('should escape pipe', () => {
      expect(Utils.escapeRegExp('a|b')).toBe('a\\|b');
    });

    it('should escape plus', () => {
      expect(Utils.escapeRegExp('a+b')).toBe('a\\+b');
    });

    it('should escape backslash', () => {
      expect(Utils.escapeRegExp('path\\file')).toBe('path\\\\file');
    });

    it('should handle empty string', () => {
      expect(Utils.escapeRegExp('')).toBe('');
    });

    it('should handle null', () => {
      expect(Utils.escapeRegExp(null)).toBe('');
    });

    it('should handle undefined', () => {
      expect(Utils.escapeRegExp(undefined)).toBe('');
    });

    it('should leave alphanumeric text unchanged', () => {
      expect(Utils.escapeRegExp('HelloWorld123')).toBe('HelloWorld123');
    });

    it('should work for use in RegExp constructor', () => {
      const pattern = Utils.escapeRegExp('file.txt');
      const regex = new RegExp(pattern);

      expect(regex.test('file.txt')).toBe(true);
      expect(regex.test('fileXtxt')).toBe(false);
    });
  });

  describe('capitalizeFirst', () => {
    it('should capitalize first letter of lowercase string', () => {
      expect(Utils.capitalizeFirst('hello')).toBe('Hello');
    });

    it('should keep first letter capitalized if already uppercase', () => {
      expect(Utils.capitalizeFirst('Hello')).toBe('Hello');
    });

    it('should handle single character', () => {
      expect(Utils.capitalizeFirst('a')).toBe('A');
    });

    it('should handle empty string', () => {
      expect(Utils.capitalizeFirst('')).toBe('');
    });

    it('should handle null', () => {
      expect(Utils.capitalizeFirst(null)).toBe('');
    });

    it('should handle undefined', () => {
      expect(Utils.capitalizeFirst(undefined)).toBe('');
    });

    it('should preserve rest of string', () => {
      expect(Utils.capitalizeFirst('hELLO wORLD')).toBe('HELLO wORLD');
    });

    it('should handle strings starting with numbers', () => {
      expect(Utils.capitalizeFirst('123abc')).toBe('123abc');
    });

    it('should handle strings starting with special characters', () => {
      expect(Utils.capitalizeFirst('!hello')).toBe('!hello');
    });

    it('should handle whitespace at beginning', () => {
      expect(Utils.capitalizeFirst(' hello')).toBe(' hello');
    });
  });
});
