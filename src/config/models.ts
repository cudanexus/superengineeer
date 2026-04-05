/**
 * Supported Claude models for agent execution
 */

export const SUPPORTED_MODELS = [
  'claude-sonnet-4-6[1m]',
  'claude-opus-4-6[1m]',
  'claude-haiku-4-5',
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

export const DEFAULT_MODEL: SupportedModel = 'claude-sonnet-4-6[1m]';

export const MODEL_DISPLAY_NAMES: Record<SupportedModel, string> = {
  'claude-opus-4-6[1m]': 'Claude Opus 4.6 1M',
  'claude-sonnet-4-6[1m]': 'Claude Sonnet 4.6 1M',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
};

export function isValidModel(model: string): model is SupportedModel {
  return SUPPORTED_MODELS.includes(model as SupportedModel);
}

export function getModelDisplayName(model: string): string {
  if (isValidModel(model)) {
    return MODEL_DISPLAY_NAMES[model];
  }

  return model;
}
