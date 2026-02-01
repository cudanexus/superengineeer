/**
 * Supported Claude models for agent execution
 */

export const SUPPORTED_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

export const DEFAULT_MODEL: SupportedModel = 'claude-opus-4-20250514';

export const MODEL_DISPLAY_NAMES: Record<SupportedModel, string> = {
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-opus-4-20250514': 'Claude Opus 4',
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
