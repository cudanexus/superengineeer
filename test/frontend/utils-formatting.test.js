/**
 * Tests for formatting utility functions
 */

const Utils = require('../../public/js/utils.js');

describe('Formatting Utilities', () => {
  describe('formatFileSize', () => {
    it('should format 0 bytes', () => {
      expect(Utils.formatFileSize(0)).toBe('0 B');
    });

    it('should format bytes without decimal', () => {
      expect(Utils.formatFileSize(500)).toBe('500 B');
    });

    it('should format exactly 1 KB', () => {
      expect(Utils.formatFileSize(1024)).toBe('1.0 KB');
    });

    it('should format KB with decimal', () => {
      expect(Utils.formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format exactly 1 MB', () => {
      expect(Utils.formatFileSize(1048576)).toBe('1.0 MB');
    });

    it('should format MB with decimal', () => {
      expect(Utils.formatFileSize(1572864)).toBe('1.5 MB');
    });

    it('should format exactly 1 GB', () => {
      expect(Utils.formatFileSize(1073741824)).toBe('1.0 GB');
    });

    it('should format GB with decimal', () => {
      expect(Utils.formatFileSize(1610612736)).toBe('1.5 GB');
    });

    it('should handle negative numbers', () => {
      expect(Utils.formatFileSize(-100)).toBe('0 B');
    });

    it('should handle null', () => {
      expect(Utils.formatFileSize(null)).toBe('0 B');
    });

    it('should handle undefined', () => {
      expect(Utils.formatFileSize(undefined)).toBe('0 B');
    });

    it('should handle very large numbers', () => {
      const result = Utils.formatFileSize(5368709120); // 5 GB

      expect(result).toBe('5.0 GB');
    });

    it('should handle fractional bytes', () => {
      expect(Utils.formatFileSize(1.5)).toBe('2 B');
    });
  });

  describe('formatNumber', () => {
    it('should return 0 for null', () => {
      expect(Utils.formatNumber(null)).toBe('0');
    });

    it('should return 0 for undefined', () => {
      expect(Utils.formatNumber(undefined)).toBe('0');
    });

    it('should return 0 for non-number', () => {
      expect(Utils.formatNumber('not a number')).toBe('0');
    });

    it('should format small numbers with locale string', () => {
      expect(Utils.formatNumber(123)).toBe('123');
    });

    it('should format numbers under 1000', () => {
      expect(Utils.formatNumber(999)).toBe('999');
    });

    it('should format 1000 as 1.0K', () => {
      expect(Utils.formatNumber(1000)).toBe('1.0K');
    });

    it('should format thousands with K suffix', () => {
      expect(Utils.formatNumber(1500)).toBe('1.5K');
    });

    it('should format 10000 as 10.0K', () => {
      expect(Utils.formatNumber(10000)).toBe('10.0K');
    });

    it('should format 999999 as K', () => {
      expect(Utils.formatNumber(999999)).toBe('1000.0K');
    });

    it('should format 1000000 as 1.0M', () => {
      expect(Utils.formatNumber(1000000)).toBe('1.0M');
    });

    it('should format millions with M suffix', () => {
      expect(Utils.formatNumber(2500000)).toBe('2.5M');
    });

    it('should format 0', () => {
      expect(Utils.formatNumber(0)).toBe('0');
    });

    it('should format negative numbers', () => {
      const result = Utils.formatNumber(-500);

      expect(result).toBe('-500');
    });

    it('should handle floating point numbers', () => {
      expect(Utils.formatNumber(1234.5)).toBe('1.2K');
    });
  });

  describe('getPercentColor', () => {
    it('should return green for 0%', () => {
      expect(Utils.getPercentColor(0)).toBe('text-green-400');
    });

    it('should return green for 25%', () => {
      expect(Utils.getPercentColor(25)).toBe('text-green-400');
    });

    it('should return green for 49%', () => {
      expect(Utils.getPercentColor(49)).toBe('text-green-400');
    });

    it('should return yellow for 50%', () => {
      expect(Utils.getPercentColor(50)).toBe('text-yellow-400');
    });

    it('should return yellow for 60%', () => {
      expect(Utils.getPercentColor(60)).toBe('text-yellow-400');
    });

    it('should return yellow for 74%', () => {
      expect(Utils.getPercentColor(74)).toBe('text-yellow-400');
    });

    it('should return orange for 75%', () => {
      expect(Utils.getPercentColor(75)).toBe('text-orange-400');
    });

    it('should return orange for 85%', () => {
      expect(Utils.getPercentColor(85)).toBe('text-orange-400');
    });

    it('should return orange for 89%', () => {
      expect(Utils.getPercentColor(89)).toBe('text-orange-400');
    });

    it('should return red for 90%', () => {
      expect(Utils.getPercentColor(90)).toBe('text-red-400');
    });

    it('should return red for 100%', () => {
      expect(Utils.getPercentColor(100)).toBe('text-red-400');
    });

    it('should return red for values over 100%', () => {
      expect(Utils.getPercentColor(150)).toBe('text-red-400');
    });
  });

  describe('getPercentBarColor', () => {
    it('should return green for 0%', () => {
      expect(Utils.getPercentBarColor(0)).toBe('bg-green-500');
    });

    it('should return green for 49%', () => {
      expect(Utils.getPercentBarColor(49)).toBe('bg-green-500');
    });

    it('should return yellow for 50%', () => {
      expect(Utils.getPercentBarColor(50)).toBe('bg-yellow-500');
    });

    it('should return yellow for 74%', () => {
      expect(Utils.getPercentBarColor(74)).toBe('bg-yellow-500');
    });

    it('should return orange for 75%', () => {
      expect(Utils.getPercentBarColor(75)).toBe('bg-orange-500');
    });

    it('should return orange for 89%', () => {
      expect(Utils.getPercentBarColor(89)).toBe('bg-orange-500');
    });

    it('should return red for 90%', () => {
      expect(Utils.getPercentBarColor(90)).toBe('bg-red-500');
    });

    it('should return red for 100%', () => {
      expect(Utils.getPercentBarColor(100)).toBe('bg-red-500');
    });
  });
});
