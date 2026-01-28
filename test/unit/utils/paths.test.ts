import path from 'path';

// Mock fs before importing the module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

// Mock os
jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/mock/home'),
}));

import { getDataDirectory } from '../../../src/utils/paths';
import fs from 'fs';
import os from 'os';

describe('paths utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDataDirectory', () => {
    it('should return path to .claudito in home directory', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = getDataDirectory();

      expect(result).toBe(path.join('/mock/home', '.claudito'));
    });

    it('should create directory if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      getDataDirectory();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join('/mock/home', '.claudito'),
        { recursive: true }
      );
    });

    it('should not create directory if it already exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      getDataDirectory();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should use os.homedir to get home directory', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      getDataDirectory();

      expect(os.homedir).toHaveBeenCalled();
    });

    it('should handle different home directory paths', () => {
      (os.homedir as jest.Mock).mockReturnValue('/users/testuser');
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = getDataDirectory();

      expect(result).toBe(path.join('/users/testuser', '.claudito'));
    });

    it('should return consistent path on multiple calls', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result1 = getDataDirectory();
      const result2 = getDataDirectory();

      expect(result1).toBe(result2);
    });
  });
});
