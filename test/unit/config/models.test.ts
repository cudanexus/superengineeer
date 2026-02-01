import {
  SUPPORTED_MODELS,
  DEFAULT_MODEL,
  MODEL_DISPLAY_NAMES,
  isValidModel,
  getModelDisplayName,
  SupportedModel,
} from '../../../src/config/models';

describe('Models Configuration', () => {
  describe('SUPPORTED_MODELS', () => {
    it('should contain expected models', () => {
      expect(SUPPORTED_MODELS).toEqual([
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514',
      ]);
    });

    it('should be readonly array', () => {
      expect(Array.isArray(SUPPORTED_MODELS)).toBe(true);
      expect(SUPPORTED_MODELS.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_MODEL', () => {
    it('should be a supported model', () => {
      expect(SUPPORTED_MODELS).toContain(DEFAULT_MODEL);
    });

    it('should be claude-opus-4-20250514', () => {
      expect(DEFAULT_MODEL).toBe('claude-opus-4-20250514');
    });
  });

  describe('MODEL_DISPLAY_NAMES', () => {
    it('should have display names for all supported models', () => {
      SUPPORTED_MODELS.forEach((model: SupportedModel) => {
        expect(MODEL_DISPLAY_NAMES[model]).toBeDefined();
        expect(typeof MODEL_DISPLAY_NAMES[model]).toBe('string');
        expect(MODEL_DISPLAY_NAMES[model].length).toBeGreaterThan(0);
      });
    });

    it('should have correct display names', () => {
      expect(MODEL_DISPLAY_NAMES['claude-sonnet-4-20250514']).toBe('Claude Sonnet 4');
      expect(MODEL_DISPLAY_NAMES['claude-opus-4-20250514']).toBe('Claude Opus 4');
    });
  });

  describe('isValidModel', () => {
    it('should return true for supported models', () => {
      SUPPORTED_MODELS.forEach((model) => {
        expect(isValidModel(model)).toBe(true);
      });
    });

    it('should return false for unsupported models', () => {
      const unsupportedModels = [
        'claude-2',
        'gpt-4',
        'invalid-model',
        '',
        'claude-sonnet-3',
      ];

      unsupportedModels.forEach((model) => {
        expect(isValidModel(model)).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      expect(isValidModel(null as any)).toBe(false);
      expect(isValidModel(undefined as any)).toBe(false);
      expect(isValidModel(123 as any)).toBe(false);
      expect(isValidModel({} as any)).toBe(false);
    });
  });

  describe('getModelDisplayName', () => {
    it('should return correct display names for supported models', () => {
      SUPPORTED_MODELS.forEach((model) => {
        const displayName = getModelDisplayName(model);
        expect(displayName).toBe(MODEL_DISPLAY_NAMES[model]);
      });
    });

    it('should return the input model for unsupported models', () => {
      const unsupportedModels = [
        'claude-2',
        'gpt-4',
        'invalid-model',
        'some-random-string',
      ];

      unsupportedModels.forEach((model) => {
        expect(getModelDisplayName(model)).toBe(model);
      });
    });

    it('should handle edge cases', () => {
      expect(getModelDisplayName('')).toBe('');
      expect(getModelDisplayName('   ')).toBe('   ');
    });
  });

  describe('Type safety', () => {
    it('should maintain type safety for SupportedModel', () => {
      // This test ensures TypeScript compilation works correctly
      const model: SupportedModel = 'claude-sonnet-4-20250514';
      expect(isValidModel(model)).toBe(true);

      const displayName: string = MODEL_DISPLAY_NAMES[model];
      expect(typeof displayName).toBe('string');
    });
  });
});