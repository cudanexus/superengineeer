import * as path from 'path';

/**
 * Validates that a file path is within the specified project directory.
 * Prevents path traversal attacks by ensuring the resolved path
 * stays within the project boundaries.
 *
 * @param filePath - The file path to validate
 * @param projectPath - The project root directory
 * @returns true if the path is within the project, false otherwise
 */
export function isPathWithinProject(filePath: string, projectPath: string): boolean {
  // Resolve both paths to absolute paths
  const resolvedFile = path.resolve(filePath);
  const resolvedProject = path.resolve(projectPath);

  // Ensure the project path ends with separator to prevent
  // /project matching /project2 or /project-other
  const projectBase = resolvedProject + path.sep;

  // Check if the file path starts with the project base path
  // or is exactly the project path itself
  return resolvedFile.startsWith(projectBase) || resolvedFile === resolvedProject;
}

/**
 * Validates and normalizes a path, throwing an error if it attempts
 * to escape the project directory.
 *
 * @param filePath - The file path to validate
 * @param projectPath - The project root directory
 * @throws ValidationError if the path is outside the project
 * @returns The resolved, normalized path
 */
export function validateProjectPath(filePath: string, projectPath: string): string {
  const resolved = path.resolve(filePath);

  if (!isPathWithinProject(resolved, projectPath)) {
    throw new Error(`Path '${filePath}' is outside the project directory`);
  }

  return resolved;
}