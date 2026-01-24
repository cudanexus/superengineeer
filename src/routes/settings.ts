import { Router, Request, Response } from 'express';
import { SettingsRepository } from '../repositories';
import { asyncHandler, ValidationError } from '../utils';

export interface SettingsRouterDependencies {
  settingsRepository: SettingsRepository;
  onSettingsChange?: (settings: { maxConcurrentAgents: number }) => void;
}

export function createSettingsRouter(deps: SettingsRouterDependencies): Router {
  const router = Router();
  const { settingsRepository, onSettingsChange } = deps;

  router.get('/', asyncHandler(async (_req: Request, res: Response) => {
    const settings = await settingsRepository.get();
    res.json(settings);
  }));

  router.put('/', asyncHandler(async (req: Request, res: Response) => {
    const { maxConcurrentAgents, claudePermissions } = req.body;

    if (maxConcurrentAgents !== undefined && (typeof maxConcurrentAgents !== 'number' || maxConcurrentAgents < 1)) {
      throw new ValidationError('maxConcurrentAgents must be a positive number');
    }

    const updated = await settingsRepository.update({
      maxConcurrentAgents,
      claudePermissions,
    });

    if (onSettingsChange && maxConcurrentAgents !== undefined) {
      onSettingsChange({ maxConcurrentAgents });
    }

    res.json(updated);
  }));

  return router;
}
