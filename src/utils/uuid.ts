import { randomUUID } from 'crypto';

/**
 * Generates a UUID v4
 * Uses Node.js built-in crypto.randomUUID()
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * UUID v4 regex pattern
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * Where y is one of 8, 9, a, or b
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID v4
 */
export function isValidUUID(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}
