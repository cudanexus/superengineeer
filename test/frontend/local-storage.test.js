/**
 * Tests for LocalStorage module
 */

const LocalStorage = require('../../public/js/modules/local-storage.js');

describe('LocalStorage', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Suppress console.warn during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('KEYS', () => {
    it('should have FONT_SIZE key', () => {
      expect(LocalStorage.KEYS.FONT_SIZE).toBe('superengineer-font-size');
    });

    it('should have ACTIVE_TAB key', () => {
      expect(LocalStorage.KEYS.ACTIVE_TAB).toBe('superengineer-active-tab');
    });

    it('should have SELECTED_PROJECT key', () => {
      expect(LocalStorage.KEYS.SELECTED_PROJECT).toBe('superengineer-selected-project');
    });

    it('should have SCROLL_LOCK key', () => {
      expect(LocalStorage.KEYS.SCROLL_LOCK).toBe('superengineer-scroll-lock');
    });

    it('should have MILESTONE_EXPANDED key', () => {
      expect(LocalStorage.KEYS.MILESTONE_EXPANDED).toBe('superengineer-milestone-expanded');
    });
  });

  describe('save', () => {
    it('should save string value', () => {
      const result = LocalStorage.save('test-key', 'test-value');

      expect(result).toBe(true);
      expect(localStorage.getItem('test-key')).toBe('"test-value"');
    });

    it('should save number value', () => {
      const result = LocalStorage.save('test-key', 42);

      expect(result).toBe(true);
      expect(localStorage.getItem('test-key')).toBe('42');
    });

    it('should save boolean value', () => {
      const result = LocalStorage.save('test-key', true);

      expect(result).toBe(true);
      expect(localStorage.getItem('test-key')).toBe('true');
    });

    it('should save false boolean value', () => {
      const result = LocalStorage.save('test-key', false);

      expect(result).toBe(true);
      expect(localStorage.getItem('test-key')).toBe('false');
    });

    it('should save object value', () => {
      const obj = { name: 'test', count: 5 };
      const result = LocalStorage.save('test-key', obj);

      expect(result).toBe(true);
      expect(localStorage.getItem('test-key')).toBe(JSON.stringify(obj));
    });

    it('should save array value', () => {
      const arr = [1, 2, 3];
      const result = LocalStorage.save('test-key', arr);

      expect(result).toBe(true);
      expect(localStorage.getItem('test-key')).toBe('[1,2,3]');
    });

    it('should save null value', () => {
      const result = LocalStorage.save('test-key', null);

      expect(result).toBe(true);
      expect(localStorage.getItem('test-key')).toBe('null');
    });

    it('should save empty string', () => {
      const result = LocalStorage.save('test-key', '');

      expect(result).toBe(true);
      expect(localStorage.getItem('test-key')).toBe('""');
    });

    it('should save zero', () => {
      const result = LocalStorage.save('test-key', 0);

      expect(result).toBe(true);
      expect(localStorage.getItem('test-key')).toBe('0');
    });

    it('should save nested object', () => {
      const nested = { level1: { level2: { value: 'deep' } } };
      const result = LocalStorage.save('test-key', nested);

      expect(result).toBe(true);
      expect(JSON.parse(localStorage.getItem('test-key'))).toEqual(nested);
    });
  });

  describe('load', () => {
    it('should load string value', () => {
      localStorage.setItem('test-key', '"test-value"');

      const result = LocalStorage.load('test-key', 'default');

      expect(result).toBe('test-value');
    });

    it('should load number value', () => {
      localStorage.setItem('test-key', '42');

      const result = LocalStorage.load('test-key', 0);

      expect(result).toBe(42);
    });

    it('should load boolean value', () => {
      localStorage.setItem('test-key', 'true');

      const result = LocalStorage.load('test-key', false);

      expect(result).toBe(true);
    });

    it('should load false boolean value', () => {
      localStorage.setItem('test-key', 'false');

      const result = LocalStorage.load('test-key', true);

      expect(result).toBe(false);
    });

    it('should load object value', () => {
      localStorage.setItem('test-key', '{"name":"test","count":5}');

      const result = LocalStorage.load('test-key', {});

      expect(result).toEqual({ name: 'test', count: 5 });
    });

    it('should load array value', () => {
      localStorage.setItem('test-key', '[1,2,3]');

      const result = LocalStorage.load('test-key', []);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should load null value', () => {
      localStorage.setItem('test-key', 'null');

      const result = LocalStorage.load('test-key', 'default');

      expect(result).toBe(null);
    });

    it('should return default value when key not found', () => {
      const result = LocalStorage.load('nonexistent', 'default-value');

      expect(result).toBe('default-value');
    });

    it('should return default value when key not found (object default)', () => {
      const defaultObj = { foo: 'bar' };
      const result = LocalStorage.load('nonexistent', defaultObj);

      expect(result).toEqual(defaultObj);
    });

    it('should return default value and warn on parse error', () => {
      localStorage.setItem('test-key', 'invalid json {{{');

      const result = LocalStorage.load('test-key', 'default');

      expect(result).toBe('default');
      expect(console.warn).toHaveBeenCalled();
    });

    it('should load zero correctly', () => {
      localStorage.setItem('test-key', '0');

      const result = LocalStorage.load('test-key', 99);

      expect(result).toBe(0);
    });

    it('should load empty string correctly', () => {
      localStorage.setItem('test-key', '""');

      const result = LocalStorage.load('test-key', 'default');

      expect(result).toBe('');
    });

    it('should load empty array correctly', () => {
      localStorage.setItem('test-key', '[]');

      const result = LocalStorage.load('test-key', ['default']);

      expect(result).toEqual([]);
    });

    it('should load empty object correctly', () => {
      localStorage.setItem('test-key', '{}');

      const result = LocalStorage.load('test-key', { foo: 'bar' });

      expect(result).toEqual({});
    });
  });

  describe('remove', () => {
    it('should remove existing key', () => {
      localStorage.setItem('test-key', '"value"');

      const result = LocalStorage.remove('test-key');

      expect(result).toBe(true);
      expect(localStorage.getItem('test-key')).toBe(null);
    });

    it('should return true for non-existent key', () => {
      const result = LocalStorage.remove('nonexistent');

      expect(result).toBe(true);
    });

    it('should not affect other keys', () => {
      localStorage.setItem('key1', '"value1"');
      localStorage.setItem('key2', '"value2"');

      LocalStorage.remove('key1');

      expect(localStorage.getItem('key1')).toBe(null);
      expect(localStorage.getItem('key2')).toBe('"value2"');
    });
  });

  describe('clear', () => {
    it('should remove all superengineer keys', () => {
      // Set up superengineer keys
      localStorage.setItem(LocalStorage.KEYS.FONT_SIZE, '14');
      localStorage.setItem(LocalStorage.KEYS.ACTIVE_TAB, '"agent-output"');
      localStorage.setItem(LocalStorage.KEYS.SELECTED_PROJECT, '"proj-1"');
      localStorage.setItem(LocalStorage.KEYS.SCROLL_LOCK, 'false');
      localStorage.setItem(LocalStorage.KEYS.MILESTONE_EXPANDED, '{}');

      const result = LocalStorage.clear();

      expect(result).toBe(true);
      expect(localStorage.getItem(LocalStorage.KEYS.FONT_SIZE)).toBe(null);
      expect(localStorage.getItem(LocalStorage.KEYS.ACTIVE_TAB)).toBe(null);
      expect(localStorage.getItem(LocalStorage.KEYS.SELECTED_PROJECT)).toBe(null);
      expect(localStorage.getItem(LocalStorage.KEYS.SCROLL_LOCK)).toBe(null);
      expect(localStorage.getItem(LocalStorage.KEYS.MILESTONE_EXPANDED)).toBe(null);
    });

    it('should not affect non-superengineer keys', () => {
      localStorage.setItem('other-app-key', 'should-remain');
      localStorage.setItem(LocalStorage.KEYS.FONT_SIZE, '14');

      LocalStorage.clear();

      expect(localStorage.getItem('other-app-key')).toBe('should-remain');
    });
  });

  describe('isAvailable', () => {
    it('should return true when localStorage works', () => {
      const result = LocalStorage.isAvailable();

      expect(result).toBe(true);
    });

    it('should clean up test key', () => {
      LocalStorage.isAvailable();

      expect(localStorage.getItem('__superengineer_test__')).toBe(null);
    });
  });

  describe('integration scenarios', () => {
    it('should handle save then load cycle', () => {
      const testData = { projects: ['a', 'b'], settings: { dark: true } };

      LocalStorage.save('complex-data', testData);
      const loaded = LocalStorage.load('complex-data', null);

      expect(loaded).toEqual(testData);
    });

    it('should handle save, remove, load cycle', () => {
      LocalStorage.save('temp-key', 'temp-value');
      LocalStorage.remove('temp-key');
      const loaded = LocalStorage.load('temp-key', 'default');

      expect(loaded).toBe('default');
    });

    it('should handle overwriting existing value', () => {
      LocalStorage.save('key', 'value1');
      LocalStorage.save('key', 'value2');

      const loaded = LocalStorage.load('key', null);

      expect(loaded).toBe('value2');
    });

    it('should handle using KEYS constants', () => {
      LocalStorage.save(LocalStorage.KEYS.FONT_SIZE, 16);
      LocalStorage.save(LocalStorage.KEYS.SCROLL_LOCK, true);

      expect(LocalStorage.load(LocalStorage.KEYS.FONT_SIZE, 14)).toBe(16);
      expect(LocalStorage.load(LocalStorage.KEYS.SCROLL_LOCK, false)).toBe(true);
    });
  });
});
