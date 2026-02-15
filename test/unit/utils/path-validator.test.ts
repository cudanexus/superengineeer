import * as path from 'path';
import { isPathWithinProject, validateProjectPath } from '../../../src/utils/path-validator';

describe('path-validator', () => {
  const projectPath = path.resolve('/project/root');

  describe('isPathWithinProject', () => {
    it('should return true for a file within the project', () => {
      const filePath = path.join(projectPath, 'src', 'index.ts');
      expect(isPathWithinProject(filePath, projectPath)).toBe(true);
    });

    it('should return true for the project root itself', () => {
      expect(isPathWithinProject(projectPath, projectPath)).toBe(true);
    });

    it('should return false for a file outside the project', () => {
      const filePath = path.resolve('/other/directory/file.txt');
      expect(isPathWithinProject(filePath, projectPath)).toBe(false);
    });

    it('should return false for path traversal attempts', () => {
      const filePath = path.join(projectPath, '..', 'sibling', 'file.txt');
      expect(isPathWithinProject(filePath, projectPath)).toBe(false);
    });

    it('should prevent prefix-based attack (/project vs /project2)', () => {
      const projectPath2 = projectPath + '2';
      const filePath = path.join(projectPath2, 'file.txt');
      expect(isPathWithinProject(filePath, projectPath)).toBe(false);
    });

    it('should prevent prefix attack with -other suffix', () => {
      const otherProject = projectPath + '-other';
      const filePath = path.join(otherProject, 'file.txt');
      expect(isPathWithinProject(filePath, projectPath)).toBe(false);
    });
  });

  describe('validateProjectPath', () => {
    it('should return resolved path for valid file', () => {
      const filePath = path.join(projectPath, 'src', 'index.ts');
      const result = validateProjectPath(filePath, projectPath);
      expect(result).toBe(path.resolve(filePath));
    });

    it('should throw for path outside project', () => {
      const filePath = path.resolve('/outside/file.txt');
      expect(() => validateProjectPath(filePath, projectPath))
        .toThrow('outside the project directory');
    });

    it('should throw for path traversal', () => {
      const filePath = path.join(projectPath, '..', '..', 'etc', 'passwd');
      expect(() => validateProjectPath(filePath, projectPath))
        .toThrow('outside the project directory');
    });
  });
});
