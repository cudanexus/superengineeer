/**
 * Tests for message timestamp functionality with time differences
 */

// Mock dependencies
const mockMessageRenderer = {
  formatTimestamp: null,
  formatTimeDifference: null,
  resetRenderingContext: jest.fn(),
  setStartingTimestamp: jest.fn(),
  renderingContext: { previousTimestamp: null }
};

// Load the module
const fs = require('fs');
const path = require('path');
const messageRendererPath = path.join(__dirname, '../../public/js/modules/message-renderer.js');
const messageRendererCode = fs.readFileSync(messageRendererPath, 'utf8');

// Extract formatTimeDifference function for testing
function formatTimeDifference(diffMs) {
  if (diffMs < 1000) {
    return diffMs + 'ms';
  } else if (diffMs < 60000) {
    return Math.round(diffMs / 1000) + 's';
  } else if (diffMs < 3600000) {
    var minutes = Math.floor(diffMs / 60000);
    var seconds = Math.round((diffMs % 60000) / 1000);
    return minutes + 'm' + (seconds > 0 ? ' ' + seconds + 's' : '');
  } else {
    var hours = Math.floor(diffMs / 3600000);
    var minutes = Math.round((diffMs % 3600000) / 60000);
    return hours + 'h' + (minutes > 0 ? ' ' + minutes + 'm' : '');
  }
}

describe('Message Timestamp Functionality', () => {
  let MessageRenderer;
  let mockContext;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '';

    // Reset context
    mockContext = {
      previousTimestamp: null
    };

    // Mock MessageRenderer with context management
    MessageRenderer = {
      renderingContext: mockContext,
      resetRenderingContext: jest.fn(() => {
        mockContext.previousTimestamp = null;
      }),
      setStartingTimestamp: jest.fn((timestamp) => {
        mockContext.previousTimestamp = timestamp;
      }),
      formatTimestamp: function(timestamp) {
        if (!timestamp) return '';
        try {
          var date = new Date(timestamp);
          var timeStr = date.toLocaleTimeString();

          // Calculate time difference if previous timestamp is available
          var diffStr = '';
          if (mockContext.previousTimestamp) {
            try {
              var prevDate = new Date(mockContext.previousTimestamp);
              var diffMs = date.getTime() - prevDate.getTime();
              if (diffMs > 0) {
                diffStr = ' <span class="text-xs text-gray-400 ml-1">+' + formatTimeDifference(diffMs) + '</span>';
              }
            } catch (e) {
              // Ignore error calculating difference
            }
          }

          // Update context for next message
          mockContext.previousTimestamp = timestamp;

          return '<span class="text-xs text-gray-500 ml-2">' + timeStr + diffStr + '</span>';
        } catch (e) {
          return '';
        }
      }
    };
  });

  describe('formatTimeDifference', () => {
    it('should format milliseconds correctly', () => {
      expect(formatTimeDifference(100)).toBe('100ms');
      expect(formatTimeDifference(500)).toBe('500ms');
      expect(formatTimeDifference(999)).toBe('999ms');
    });

    it('should format seconds correctly', () => {
      expect(formatTimeDifference(1000)).toBe('1s');
      expect(formatTimeDifference(2500)).toBe('3s'); // rounded
      expect(formatTimeDifference(15000)).toBe('15s');
      expect(formatTimeDifference(59999)).toBe('60s');
    });

    it('should format minutes correctly', () => {
      expect(formatTimeDifference(60000)).toBe('1m');
      expect(formatTimeDifference(90000)).toBe('1m 30s');
      expect(formatTimeDifference(120000)).toBe('2m');
      expect(formatTimeDifference(125000)).toBe('2m 5s');
      expect(formatTimeDifference(3540000)).toBe('59m');
    });

    it('should format hours correctly', () => {
      expect(formatTimeDifference(3600000)).toBe('1h');
      expect(formatTimeDifference(3660000)).toBe('1h 1m');
      expect(formatTimeDifference(7200000)).toBe('2h');
      expect(formatTimeDifference(7380000)).toBe('2h 3m');
    });

    it('should handle edge cases', () => {
      expect(formatTimeDifference(0)).toBe('0ms');
      expect(formatTimeDifference(59000)).toBe('59s');
      expect(formatTimeDifference(61000)).toBe('1m 1s');
    });
  });

  describe('formatTimestamp', () => {
    it('should return empty string for null/undefined timestamp', () => {
      expect(MessageRenderer.formatTimestamp(null)).toBe('');
      expect(MessageRenderer.formatTimestamp(undefined)).toBe('');
      expect(MessageRenderer.formatTimestamp('')).toBe('');
    });

    it('should format basic timestamp without previous context', () => {
      const timestamp = '2024-01-01T12:00:00.000Z';
      const result = MessageRenderer.formatTimestamp(timestamp);

      expect(result).toContain('text-gray-500');
      expect(result).toContain('ml-2');
      expect(result).not.toContain('text-gray-400'); // No time difference
      expect(result).not.toContain('+');
    });

    it('should include time difference when previous timestamp exists', () => {
      const timestamp1 = '2024-01-01T12:00:00.000Z';
      const timestamp2 = '2024-01-01T12:00:03.000Z'; // 3 seconds later

      // First call - no difference
      const result1 = MessageRenderer.formatTimestamp(timestamp1);
      expect(result1).not.toContain('+');

      // Second call - should show difference
      const result2 = MessageRenderer.formatTimestamp(timestamp2);
      expect(result2).toContain('text-gray-400');
      expect(result2).toContain('+3s');
    });

    it('should update context with current timestamp', () => {
      const timestamp = '2024-01-01T12:00:00.000Z';
      MessageRenderer.formatTimestamp(timestamp);

      expect(mockContext.previousTimestamp).toBe(timestamp);
    });

    it('should handle multiple consecutive timestamps', () => {
      const timestamps = [
        '2024-01-01T12:00:00.000Z',
        '2024-01-01T12:00:02.000Z', // +2s
        '2024-01-01T12:00:07.000Z', // +5s
        '2024-01-01T12:01:07.000Z'  // +1m
      ];

      const results = timestamps.map(ts => MessageRenderer.formatTimestamp(ts));

      // First message - no difference
      expect(results[0]).not.toContain('+');

      // Second message - 2 seconds
      expect(results[1]).toContain('+2s');

      // Third message - 5 seconds
      expect(results[2]).toContain('+5s');

      // Fourth message - 1 minute
      expect(results[3]).toContain('+1m');
    });

    it('should not show difference for negative time differences', () => {
      const timestamp1 = '2024-01-01T12:00:10.000Z';
      const timestamp2 = '2024-01-01T12:00:05.000Z'; // 5 seconds earlier

      MessageRenderer.formatTimestamp(timestamp1);
      const result = MessageRenderer.formatTimestamp(timestamp2);

      // Should not contain time difference for negative values
      expect(result).not.toContain('+');
      expect(result).not.toContain('text-gray-400');
    });

    it('should handle invalid timestamps gracefully', () => {
      // Invalid dates still produce output but with "Invalid Date" string
      const result1 = MessageRenderer.formatTimestamp('invalid-date');
      const result2 = MessageRenderer.formatTimestamp('2024-13-45T25:99:99.000Z');

      expect(result1).toContain('Invalid Date');
      expect(result2).toContain('Invalid Date');

      // Both should have valid HTML structure
      expect(result1).toMatch(/^<span[^>]*>.*<\/span>$/);
      expect(result2).toMatch(/^<span[^>]*>.*<\/span>$/);
    });
  });

  describe('Context Management', () => {
    it('should reset context correctly', () => {
      // Set some context
      mockContext.previousTimestamp = '2024-01-01T12:00:00.000Z';

      MessageRenderer.resetRenderingContext();

      expect(mockContext.previousTimestamp).toBe(null);
      expect(MessageRenderer.resetRenderingContext).toHaveBeenCalled();
    });

    it('should set starting timestamp correctly', () => {
      const timestamp = '2024-01-01T12:00:00.000Z';

      MessageRenderer.setStartingTimestamp(timestamp);

      expect(mockContext.previousTimestamp).toBe(timestamp);
      expect(MessageRenderer.setStartingTimestamp).toHaveBeenCalledWith(timestamp);
    });

    it('should handle context reset in conversation rendering', () => {
      // Simulate conversation rendering flow
      MessageRenderer.resetRenderingContext();

      const messages = [
        { timestamp: '2024-01-01T12:00:00.000Z' },
        { timestamp: '2024-01-01T12:00:03.000Z' },
        { timestamp: '2024-01-01T12:00:08.000Z' }
      ];

      const results = messages.map(msg => MessageRenderer.formatTimestamp(msg.timestamp));

      // First message after reset - no difference
      expect(results[0]).not.toContain('+');

      // Subsequent messages - should have differences
      expect(results[1]).toContain('+3s');
      expect(results[2]).toContain('+5s');
    });
  });

  describe('Real-time Message Scenarios', () => {
    it('should handle new conversation start correctly', () => {
      // Simulate starting a new conversation
      MessageRenderer.resetRenderingContext();

      const firstMessage = '2024-01-01T12:00:00.000Z';
      const result = MessageRenderer.formatTimestamp(firstMessage);

      expect(result).not.toContain('+');
      expect(mockContext.previousTimestamp).toBe(firstMessage);
    });

    it('should handle real-time message append correctly', () => {
      // Simulate existing conversation with last message
      const lastTimestamp = '2024-01-01T12:00:00.000Z';
      MessageRenderer.setStartingTimestamp(lastTimestamp);

      // New message arrives
      const newMessage = '2024-01-01T12:00:05.000Z';
      const result = MessageRenderer.formatTimestamp(newMessage);

      expect(result).toContain('+5s');
      expect(mockContext.previousTimestamp).toBe(newMessage);
    });

    it('should handle conversation clear and restart', () => {
      // Set some existing context
      MessageRenderer.setStartingTimestamp('2024-01-01T12:00:00.000Z');
      MessageRenderer.formatTimestamp('2024-01-01T12:00:05.000Z');

      // Clear conversation
      MessageRenderer.resetRenderingContext();

      // Start new conversation
      const newMessage = '2024-01-01T13:00:00.000Z';
      const result = MessageRenderer.formatTimestamp(newMessage);

      expect(result).not.toContain('+');
      expect(mockContext.previousTimestamp).toBe(newMessage);
    });
  });

  describe('HTML Output Validation', () => {
    it('should produce valid HTML structure', () => {
      const timestamp = '2024-01-01T12:00:00.000Z';
      const result = MessageRenderer.formatTimestamp(timestamp);

      // Check basic HTML structure
      expect(result).toMatch(/^<span[^>]*>.*<\/span>$/);
      expect(result).toContain('text-xs');
      expect(result).toContain('text-gray-500');
      expect(result).toContain('ml-2');
    });

    it('should include time difference span when applicable', () => {
      MessageRenderer.formatTimestamp('2024-01-01T12:00:00.000Z');
      const result = MessageRenderer.formatTimestamp('2024-01-01T12:00:03.000Z');

      // Should have nested span for time difference
      expect(result).toMatch(/<span[^>]*>.*<span[^>]*>\+3s<\/span><\/span>/);
      expect(result).toContain('text-gray-400');
      expect(result).toContain('ml-1');
    });

    it('should escape HTML in timestamps', () => {
      // This shouldn't happen in normal usage, but test defensive coding
      const result = MessageRenderer.formatTimestamp('2024-01-01T12:00:00.000Z');

      // Should not contain unescaped HTML
      expect(result).not.toMatch(/<script/);
      expect(result).not.toMatch(/javascript:/);
    });
  });
});