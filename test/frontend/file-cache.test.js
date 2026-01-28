/**
 * @jest-environment jsdom
 */

const FileCache = require('../../public/js/modules/file-cache');

describe('FileCache', () => {
  let mockApi;

  beforeEach(() => {
    mockApi = {
      readFile: jest.fn().mockReturnValue({
        done: jest.fn().mockImplementation(function(cb) {
          this._doneCb = cb;
          return this;
        }),
        fail: jest.fn().mockImplementation(function(cb) {
          this._failCb = cb;
          return this;
        })
      })
    };

    FileCache.init({ api: mockApi });
    FileCache.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('init', () => {
    it('should initialize with api dependency', () => {
      expect(() => FileCache.init({ api: mockApi })).not.toThrow();
    });
  });

  describe('_normalizePath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(FileCache._normalizePath('C:\\Users\\test\\file.js')).toBe('C:/Users/test/file.js');
    });

    it('should leave forward slashes unchanged', () => {
      expect(FileCache._normalizePath('/home/user/file.js')).toBe('/home/user/file.js');
    });

    it('should handle mixed slashes', () => {
      expect(FileCache._normalizePath('C:\\Users/test\\file.js')).toBe('C:/Users/test/file.js');
    });
  });

  describe('cacheFile', () => {
    it('should call api.readFile with the file path', () => {
      FileCache.cacheFile('/path/to/file.js');

      expect(mockApi.readFile).toHaveBeenCalledWith('/path/to/file.js');
    });

    it('should cache content on successful read', () => {
      const apiReturn = mockApi.readFile();
      FileCache.cacheFile('/path/to/file.js');

      // Simulate API success
      apiReturn._doneCb({ content: 'file content here' });

      expect(FileCache.getContent('/path/to/file.js')).toBe('file content here');
    });

    it('should cache null on failed read', () => {
      const apiReturn = mockApi.readFile();
      FileCache.cacheFile('/path/to/file.js');

      // Simulate API failure
      apiReturn._failCb();

      expect(FileCache.wasRead('/path/to/file.js')).toBe(true);
      expect(FileCache.getContent('/path/to/file.js')).toBeNull();
    });

    it('should normalize path when caching', () => {
      const apiReturn = mockApi.readFile();
      FileCache.cacheFile('C:\\Users\\file.js');

      apiReturn._doneCb({ content: 'content' });

      // Should be retrievable with forward slashes too
      expect(FileCache.getContent('C:/Users/file.js')).toBe('content');
    });

    it('should enforce cache limit', () => {
      // Cache 10 files (at limit)
      for (let i = 0; i < 10; i++) {
        const apiReturn = mockApi.readFile();
        FileCache.cacheFile(`/file${i}.js`);
        apiReturn._doneCb({ content: `content${i}` });
      }

      expect(FileCache.getStats().size).toBe(10);

      // Cache one more file - should evict oldest
      const apiReturn = mockApi.readFile();
      FileCache.cacheFile('/file10.js');
      apiReturn._doneCb({ content: 'content10' });

      expect(FileCache.getStats().size).toBe(10);
      // Oldest file should be evicted
      expect(FileCache.wasRead('/file0.js')).toBe(false);
      // Newest file should be present
      expect(FileCache.wasRead('/file10.js')).toBe(true);
    });
  });

  describe('getContent', () => {
    it('should return null for uncached file', () => {
      expect(FileCache.getContent('/not/cached.js')).toBeNull();
    });

    it('should return cached content', () => {
      const apiReturn = mockApi.readFile();
      FileCache.cacheFile('/path/file.js');
      apiReturn._doneCb({ content: 'cached content' });

      expect(FileCache.getContent('/path/file.js')).toBe('cached content');
    });

    it('should return null for expired cache', () => {
      const apiReturn = mockApi.readFile();
      FileCache.cacheFile('/path/file.js');
      apiReturn._doneCb({ content: 'cached content' });

      // Fast-forward time past TTL (5 minutes)
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 6 * 60 * 1000);

      expect(FileCache.getContent('/path/file.js')).toBeNull();

      Date.now = originalDateNow;
    });
  });

  describe('wasRead', () => {
    it('should return false for uncached file', () => {
      expect(FileCache.wasRead('/not/cached.js')).toBe(false);
    });

    it('should return true for cached file', () => {
      const apiReturn = mockApi.readFile();
      FileCache.cacheFile('/path/file.js');
      apiReturn._doneCb({ content: 'content' });

      expect(FileCache.wasRead('/path/file.js')).toBe(true);
    });

    it('should return true even if content is null', () => {
      const apiReturn = mockApi.readFile();
      FileCache.cacheFile('/path/file.js');
      apiReturn._failCb();

      expect(FileCache.wasRead('/path/file.js')).toBe(true);
    });

    it('should return false for expired cache', () => {
      const apiReturn = mockApi.readFile();
      FileCache.cacheFile('/path/file.js');
      apiReturn._doneCb({ content: 'content' });

      // Fast-forward time past TTL
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 6 * 60 * 1000);

      expect(FileCache.wasRead('/path/file.js')).toBe(false);

      Date.now = originalDateNow;
    });
  });

  describe('clear', () => {
    it('should remove all cached files', () => {
      const apiReturn1 = mockApi.readFile();
      FileCache.cacheFile('/file1.js');
      apiReturn1._doneCb({ content: 'content1' });

      const apiReturn2 = mockApi.readFile();
      FileCache.cacheFile('/file2.js');
      apiReturn2._doneCb({ content: 'content2' });

      expect(FileCache.getStats().size).toBe(2);

      FileCache.clear();

      expect(FileCache.getStats().size).toBe(0);
      expect(FileCache.wasRead('/file1.js')).toBe(false);
      expect(FileCache.wasRead('/file2.js')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = FileCache.getStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('limit');
      expect(stats).toHaveProperty('ttl');
      expect(stats.limit).toBe(10);
      expect(stats.ttl).toBe(5 * 60 * 1000);
    });

    it('should reflect current cache size', () => {
      expect(FileCache.getStats().size).toBe(0);

      const apiReturn = mockApi.readFile();
      FileCache.cacheFile('/file.js');
      apiReturn._doneCb({ content: 'content' });

      expect(FileCache.getStats().size).toBe(1);
    });
  });
});
