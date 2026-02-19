import { StreamHandler } from '../../../src/agents/stream-handler';
import { getLogger } from '../../../src/utils';

describe('StreamHandler ExitPlanMode Tests', () => {
  let streamHandler: StreamHandler;

  beforeEach(() => {
    const logger = getLogger('test');
    streamHandler = new StreamHandler(logger, 'test-project', 'test-session');

    // Spy on emit method
    jest.spyOn(streamHandler as any, 'emit');
  });

  describe('Duplicate ExitPlanMode Prevention', () => {
    it('should emit ExitPlanMode for the first occurrence in a turn', () => {
      const emitSpy = jest.spyOn(streamHandler as any, 'emit');

      // First ExitPlanMode
      (streamHandler as any).handleExitPlanModeTool({ planContent: 'Test plan' });

      expect(emitSpy).toHaveBeenCalledWith('exitPlanMode', 'Test plan');
      // plan_mode message is now handled by agent-manager, not stream-handler
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    it('should ignore duplicate ExitPlanMode in the same turn', () => {
      const emitSpy = jest.spyOn(streamHandler as any, 'emit');
      const loggerWarnSpy = jest.spyOn((streamHandler as any).logger, 'warn');

      // First ExitPlanMode
      (streamHandler as any).handleExitPlanModeTool({ planContent: 'Test plan 1' });

      // Clear spy to check second call
      emitSpy.mockClear();

      // Second ExitPlanMode (should be ignored)
      (streamHandler as any).handleExitPlanModeTool({ planContent: 'Test plan 2' });

      expect(emitSpy).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith('Ignoring duplicate ExitPlanMode in same turn');
    });

    it('should allow ExitPlanMode after turn reset', () => {
      const emitSpy = jest.spyOn(streamHandler as any, 'emit');

      // First ExitPlanMode
      (streamHandler as any).handleExitPlanModeTool({ planContent: 'Test plan 1' });

      // Reset tracking (simulating new turn)
      (streamHandler as any).resetEmittedTracking();

      // Clear spy
      emitSpy.mockClear();

      // Second ExitPlanMode after reset (should be processed)
      (streamHandler as any).handleExitPlanModeTool({ planContent: 'Test plan 2' });

      expect(emitSpy).toHaveBeenCalledWith('exitPlanMode', 'Test plan 2');
      // plan_mode message is now handled by agent-manager, not stream-handler
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle ExitPlanMode through tool use block processing', () => {
      const emitSpy = jest.spyOn(streamHandler as any, 'emit');

      // Process tool use block with ExitPlanMode
      const toolUseBlock = {
        id: 'tool-1',
        name: 'ExitPlanMode',
        input: { planContent: 'Plan from tool use' }
      };

      (streamHandler as any).processToolUseBlock(toolUseBlock);

      expect(emitSpy).toHaveBeenCalledWith('exitPlanMode', 'Plan from tool use');
    });

    it('should prevent duplicate ExitPlanMode even with different tool IDs', () => {
      const emitSpy = jest.spyOn(streamHandler as any, 'emit');

      // First tool use
      const toolUseBlock1 = {
        id: 'tool-1',
        name: 'ExitPlanMode',
        input: { planContent: 'Plan 1' }
      };
      (streamHandler as any).processToolUseBlock(toolUseBlock1);

      // Clear spy
      emitSpy.mockClear();

      // Second tool use with different ID (should still be ignored)
      const toolUseBlock2 = {
        id: 'tool-2',
        name: 'ExitPlanMode',
        input: { planContent: 'Plan 2' }
      };
      (streamHandler as any).processToolUseBlock(toolUseBlock2);

      // Should not emit exitPlanMode again
      expect(emitSpy).not.toHaveBeenCalledWith('exitPlanMode', expect.anything());
    });

    it('should track hasEmittedExitPlanMode flag correctly', () => {
      // Initially false
      expect((streamHandler as any).hasEmittedExitPlanMode).toBe(false);

      // After first ExitPlanMode
      (streamHandler as any).handleExitPlanModeTool({ planContent: 'Test plan' });
      expect((streamHandler as any).hasEmittedExitPlanMode).toBe(true);

      // After reset
      (streamHandler as any).resetEmittedTracking();
      expect((streamHandler as any).hasEmittedExitPlanMode).toBe(false);
    });

    it('should extract plan content from various input formats', () => {
      const emitSpy = jest.spyOn(streamHandler as any, 'emit');

      // Test with planContent property
      (streamHandler as any).handleExitPlanModeTool({ planContent: 'Plan with planContent' });
      expect(emitSpy).toHaveBeenCalledWith('exitPlanMode', 'Plan with planContent');

      // Reset for next test
      (streamHandler as any).resetEmittedTracking();
      emitSpy.mockClear();

      // Test with empty/missing planContent
      (streamHandler as any).handleExitPlanModeTool({});
      expect(emitSpy).toHaveBeenCalledWith('exitPlanMode', '');

      // Reset for next test
      (streamHandler as any).resetEmittedTracking();
      emitSpy.mockClear();

      // Test with undefined input
      (streamHandler as any).handleExitPlanModeTool(undefined);
      expect(emitSpy).toHaveBeenCalledWith('exitPlanMode', '');
    });
  });
});