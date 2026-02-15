import {
  getCurrentTimestamp,
  getUnixTimestamp,
  getUnixTimestampSeconds,
  parseTimestamp,
  formatTimestamp,
  getTimeElapsed,
} from '../../../src/utils/timestamp';

describe('timestamp utilities', () => {
  describe('getCurrentTimestamp', () => {
    it('should return a valid ISO timestamp', () => {
      const ts = getCurrentTimestamp();
      expect(() => new Date(ts)).not.toThrow();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('getUnixTimestamp', () => {
    it('should return milliseconds since epoch', () => {
      const before = Date.now();
      const ts = getUnixTimestamp();
      const after = Date.now();

      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe('getUnixTimestampSeconds', () => {
    it('should return seconds since epoch', () => {
      const ts = getUnixTimestampSeconds();
      const now = Math.floor(Date.now() / 1000);

      expect(ts).toBeLessThanOrEqual(now);
      expect(ts).toBeGreaterThanOrEqual(now - 1);
    });
  });

  describe('parseTimestamp', () => {
    it('should parse a valid ISO string to Date', () => {
      const iso = '2025-06-01T12:30:00.000Z';
      const date = parseTimestamp(iso);

      expect(date).toBeInstanceOf(Date);
      expect(date.toISOString()).toBe(iso);
    });
  });

  describe('formatTimestamp', () => {
    it('should format a Date to ISO string', () => {
      const date = new Date('2025-06-01T12:30:00.000Z');
      expect(formatTimestamp(date)).toBe('2025-06-01T12:30:00.000Z');
    });

    it('should roundtrip with parseTimestamp', () => {
      const original = '2025-06-01T12:30:00.000Z';
      const roundtripped = formatTimestamp(parseTimestamp(original));
      expect(roundtripped).toBe(original);
    });
  });

  describe('getTimeElapsed', () => {
    it('should return seconds-only format for short durations', () => {
      const startTime = Date.now() - 5000; // 5 seconds ago
      const result = getTimeElapsed(startTime);
      expect(result).toMatch(/^\d+s$/);
    });

    it('should return minutes and seconds for medium durations', () => {
      const startTime = Date.now() - 125000; // 2m 5s ago
      const result = getTimeElapsed(startTime);
      expect(result).toMatch(/^\d+m \d+s$/);
    });

    it('should return hours, minutes, and seconds for long durations', () => {
      const startTime = Date.now() - 3665000; // 1h 1m 5s ago
      const result = getTimeElapsed(startTime);
      expect(result).toMatch(/^\d+h \d+m \d+s$/);
    });

    it('should return 0s for zero elapsed time', () => {
      const result = getTimeElapsed(Date.now());
      expect(result).toBe('0s');
    });
  });
});
