import { getLogger } from './logger';

const logger = getLogger('json-utils');

/**
 * Safely parse JSON with fallback value
 */
export function safeJsonParse<T>(data: string, fallback: T): T {
  try {
    return JSON.parse(data) as T;
  } catch (error) {
    logger.debug('JSON parse error, returning fallback', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return fallback;
  }
}

/**
 * Safely parse JSON file with error details
 */
export function parseJsonFile<T>(
  data: string,
  filePath: string,
  fallback: T
): { success: true; data: T } | { success: false; data: T; error: string } {
  try {
    const parsed = JSON.parse(data) as T;
    return { success: true, data: parsed };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Failed to parse JSON file', { filePath, error: errorMessage });
    return { success: false, data: fallback, error: errorMessage };
  }
}

/**
 * Stringify JSON with proper formatting
 */
export function safeJsonStringify(data: unknown, pretty = true): string {
  try {
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  } catch (error) {
    logger.error('JSON stringify error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return '{}';
  }
}