/**
 * @jest-environment jsdom
 */

const Formatters = require('../../public/js/modules/formatters');

describe('Formatters', () => {
  describe('formatFileSize', () => {
    it('should format 0 bytes', () => {
      expect(Formatters.formatFileSize(0)).toBe('0 B');
    });

    it('should format bytes without decimals', () => {
      expect(Formatters.formatFileSize(100)).toBe('100 B');
      expect(Formatters.formatFileSize(999)).toBe('999 B');
    });

    it('should format kilobytes with one decimal', () => {
      expect(Formatters.formatFileSize(1024)).toBe('1.0 KB');
      expect(Formatters.formatFileSize(1536)).toBe('1.5 KB');
      expect(Formatters.formatFileSize(10240)).toBe('10.0 KB');
    });

    it('should format megabytes with one decimal', () => {
      expect(Formatters.formatFileSize(1048576)).toBe('1.0 MB');
      expect(Formatters.formatFileSize(1572864)).toBe('1.5 MB');
    });

    it('should format gigabytes with one decimal', () => {
      expect(Formatters.formatFileSize(1073741824)).toBe('1.0 GB');
      expect(Formatters.formatFileSize(2147483648)).toBe('2.0 GB');
    });
  });

  describe('formatBytes (alias)', () => {
    it('should be an alias for formatFileSize', () => {
      expect(Formatters.formatBytes).toBe(Formatters.formatFileSize);
      expect(Formatters.formatBytes(1024)).toBe('1.0 KB');
    });
  });

  describe('formatNumberCompact', () => {
    it('should return "0" for undefined/null', () => {
      expect(Formatters.formatNumberCompact(undefined)).toBe('0');
      expect(Formatters.formatNumberCompact(null)).toBe('0');
    });

    it('should format small numbers with locale string', () => {
      expect(Formatters.formatNumberCompact(0)).toBe('0');
      expect(Formatters.formatNumberCompact(100)).toBe('100');
      expect(Formatters.formatNumberCompact(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
      expect(Formatters.formatNumberCompact(1000)).toBe('1.0K');
      expect(Formatters.formatNumberCompact(1500)).toBe('1.5K');
      expect(Formatters.formatNumberCompact(50000)).toBe('50.0K');
      expect(Formatters.formatNumberCompact(999999)).toBe('1000.0K');
    });

    it('should format millions with M suffix', () => {
      expect(Formatters.formatNumberCompact(1000000)).toBe('1.0M');
      expect(Formatters.formatNumberCompact(2500000)).toBe('2.5M');
      expect(Formatters.formatNumberCompact(10000000)).toBe('10.0M');
    });
  });

  describe('formatNumberWithCommas', () => {
    it('should format small numbers without commas', () => {
      expect(Formatters.formatNumberWithCommas(0)).toBe('0');
      expect(Formatters.formatNumberWithCommas(100)).toBe('100');
      expect(Formatters.formatNumberWithCommas(999)).toBe('999');
    });

    it('should add commas for thousands', () => {
      expect(Formatters.formatNumberWithCommas(1000)).toBe('1,000');
      expect(Formatters.formatNumberWithCommas(10000)).toBe('10,000');
      expect(Formatters.formatNumberWithCommas(100000)).toBe('100,000');
    });

    it('should add commas for millions', () => {
      expect(Formatters.formatNumberWithCommas(1000000)).toBe('1,000,000');
      expect(Formatters.formatNumberWithCommas(1234567)).toBe('1,234,567');
    });
  });

  describe('formatDateTime', () => {
    it('should format valid ISO string', () => {
      const result = Formatters.formatDateTime('2024-01-15T10:30:00.000Z');
      expect(result).toContain('2024');
      expect(result).toMatch(/\d/);
    });

    it('should return original string on invalid input', () => {
      expect(Formatters.formatDateTime('invalid')).toBe('invalid');
    });
  });

  describe('formatTime', () => {
    it('should format valid ISO string to time', () => {
      const result = Formatters.formatTime('2024-01-15T10:30:00.000Z');
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it('should return original string on invalid input', () => {
      expect(Formatters.formatTime('invalid')).toBe('invalid');
    });
  });

  describe('formatLogTime', () => {
    it('should format to HH:MM:SS', () => {
      const result = Formatters.formatLogTime('2024-01-15T10:30:45.000Z');
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('should return empty string on invalid input', () => {
      expect(Formatters.formatLogTime('invalid')).toBe('');
    });
  });

  describe('formatConversationDate', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return "Just now" for very recent dates', () => {
      const now = new Date('2024-01-15T10:30:00.000Z');
      jest.setSystemTime(now);

      const thirtySecondsAgo = new Date(now.getTime() - 30000).toISOString();
      expect(Formatters.formatConversationDate(thirtySecondsAgo)).toBe('Just now');
    });

    it('should return minutes ago for recent dates', () => {
      const now = new Date('2024-01-15T10:30:00.000Z');
      jest.setSystemTime(now);

      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000).toISOString();
      expect(Formatters.formatConversationDate(fiveMinutesAgo)).toBe('5m ago');
    });

    it('should return hours ago for same-day dates', () => {
      const now = new Date('2024-01-15T10:30:00.000Z');
      jest.setSystemTime(now);

      const threeHoursAgo = new Date(now.getTime() - 3 * 3600000).toISOString();
      expect(Formatters.formatConversationDate(threeHoursAgo)).toBe('3h ago');
    });

    it('should return days ago for recent dates', () => {
      const now = new Date('2024-01-15T10:30:00.000Z');
      jest.setSystemTime(now);

      const twoDaysAgo = new Date(now.getTime() - 2 * 86400000).toISOString();
      expect(Formatters.formatConversationDate(twoDaysAgo)).toBe('2d ago');
    });

    it('should return formatted date for older dates', () => {
      const now = new Date('2024-01-15T10:30:00.000Z');
      jest.setSystemTime(now);

      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
      const result = Formatters.formatConversationDate(twoWeeksAgo);
      expect(result).toMatch(/\d/);
      expect(result).not.toContain('ago');
    });

    it('should return empty string on invalid input', () => {
      expect(Formatters.formatConversationDate('invalid')).toBe('');
    });
  });

  describe('formatDuration', () => {
    it('should return empty string for invalid values', () => {
      expect(Formatters.formatDuration(0)).toBe('');
      expect(Formatters.formatDuration(-1000)).toBe('');
      expect(Formatters.formatDuration(null)).toBe('');
      expect(Formatters.formatDuration(undefined)).toBe('');
    });

    it('should format seconds only', () => {
      expect(Formatters.formatDuration(1000)).toBe('1s');
      expect(Formatters.formatDuration(30000)).toBe('30s');
      expect(Formatters.formatDuration(59000)).toBe('59s');
    });

    it('should format minutes and seconds', () => {
      expect(Formatters.formatDuration(60000)).toBe('1m 0s');
      expect(Formatters.formatDuration(90000)).toBe('1m 30s');
      expect(Formatters.formatDuration(300000)).toBe('5m 0s');
      expect(Formatters.formatDuration(3599000)).toBe('59m 59s');
    });

    it('should format hours and minutes', () => {
      expect(Formatters.formatDuration(3600000)).toBe('1h 0m');
      expect(Formatters.formatDuration(5400000)).toBe('1h 30m');
      expect(Formatters.formatDuration(7200000)).toBe('2h 0m');
    });
  });

  describe('formatTokenCount', () => {
    it('should format small numbers as-is', () => {
      expect(Formatters.formatTokenCount(0)).toBe('0');
      expect(Formatters.formatTokenCount(500)).toBe('500');
      expect(Formatters.formatTokenCount(999)).toBe('999');
    });

    it('should format thousands with lowercase k', () => {
      expect(Formatters.formatTokenCount(1000)).toBe('1.0k');
      expect(Formatters.formatTokenCount(5000)).toBe('5.0k');
      expect(Formatters.formatTokenCount(50000)).toBe('50.0k');
    });

    it('should format millions with M', () => {
      expect(Formatters.formatTokenCount(1000000)).toBe('1.0M');
      expect(Formatters.formatTokenCount(2500000)).toBe('2.5M');
    });
  });

  describe('formatTodoStatus', () => {
    it('should format completed status', () => {
      expect(Formatters.formatTodoStatus('completed')).toBe('Done');
    });

    it('should format in_progress status', () => {
      expect(Formatters.formatTodoStatus('in_progress')).toBe('Working');
    });

    it('should format pending status', () => {
      expect(Formatters.formatTodoStatus('pending')).toBe('Pending');
    });

    it('should return original value for unknown status', () => {
      expect(Formatters.formatTodoStatus('unknown')).toBe('unknown');
      expect(Formatters.formatTodoStatus('custom')).toBe('custom');
    });
  });
});
