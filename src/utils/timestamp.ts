/**
 * Get current ISO timestamp
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get Unix timestamp in milliseconds
 */
export function getUnixTimestamp(): number {
  return Date.now();
}

/**
 * Get Unix timestamp in seconds
 */
export function getUnixTimestampSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Parse ISO timestamp to Date
 */
export function parseTimestamp(timestamp: string): Date {
  return new Date(timestamp);
}

/**
 * Format date to ISO string
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

/**
 * Get time elapsed in human readable format
 */
export function getTimeElapsed(startTime: number): string {
  const elapsed = Date.now() - startTime;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}