import { safeJsonParse, parseJsonFile, safeJsonStringify } from '../../../src/utils/json-utils';

jest.mock('../../../src/utils/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('json-utils', () => {
  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const result = safeJsonParse('{"key":"value"}', {});
      expect(result).toEqual({ key: 'value' });
    });

    it('should return fallback for invalid JSON', () => {
      const fallback = { default: true };
      const result = safeJsonParse('not-json', fallback);
      expect(result).toBe(fallback);
    });

    it('should return fallback for empty string', () => {
      const result = safeJsonParse('', []);
      expect(result).toEqual([]);
    });

    it('should parse arrays', () => {
      const result = safeJsonParse('[1,2,3]', []);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('parseJsonFile', () => {
    it('should return success with parsed data', () => {
      const result = parseJsonFile('{"key":"value"}', '/test/file.json', {});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });

    it('should return failure with fallback for invalid JSON', () => {
      const fallback = { default: true };
      const result = parseJsonFile('bad-json', '/test/file.json', fallback);
      expect(result.success).toBe(false);
      expect(result.data).toBe(fallback);
      expect('error' in result && result.error).toBeTruthy();
    });
  });

  describe('safeJsonStringify', () => {
    it('should stringify with pretty formatting by default', () => {
      const result = safeJsonStringify({ a: 1 });
      expect(result).toBe(JSON.stringify({ a: 1 }, null, 2));
    });

    it('should stringify compact when pretty is false', () => {
      const result = safeJsonStringify({ a: 1 }, false);
      expect(result).toBe('{"a":1}');
    });

    it('should return {} for circular references', () => {
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      const result = safeJsonStringify(obj);
      expect(result).toBe('{}');
    });

    it('should handle null and primitives', () => {
      expect(safeJsonStringify(null)).toBe('null');
      expect(safeJsonStringify(42)).toBe('42');
      expect(safeJsonStringify('hello')).toBe('"hello"');
    });
  });
});
