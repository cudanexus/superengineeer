/**
 * Run Configurations Router
 * CRUD endpoints + start/stop for project run configurations
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils';
import { ProjectRouterDependencies } from './types';
import { validateBody, validateParams } from '../../middleware/validation';
import { validateProjectExists } from '../../middleware/project';
import {
  createRunConfigSchema,
  updateRunConfigSchema,
  projectAndConfigIdSchema,
} from './schemas';
import { CreateRunConfigData, UpdateRunConfigData } from '../../services/run-config/types';

export function createRunConfigsRouter(deps: ProjectRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  const {
    projectRepository,
    runConfigurationService,
    runProcessManager,
    runConfigImportService,
  } = deps;

  // Scan for importable run configurations from project files
  router.get(
    '/importable',
    validateProjectExists(projectRepository),
    asyncHandler(async (req: Request, res: Response) => {
      if (!runConfigImportService) {
        res.status(503).json({ error: 'Import service not available' });
        return;
      }

      const project = req.project!;
      const result = await runConfigImportService.scan(project.path);
      res.json(result);
    }),
  );

  // List all run configurations
  router.get(
    '/',
    validateProjectExists(projectRepository),
    asyncHandler(async (req: Request, res: Response) => {
      if (!runConfigurationService) {
        res.status(503).json({ error: 'Run configuration service not available' });
        return;
      }

      const id = req.params['id'] as string;
      const configs = await runConfigurationService.list(id);
      res.json(configs);
    }),
  );

  // Create a run configuration
  router.post(
    '/',
    validateProjectExists(projectRepository),
    validateBody(createRunConfigSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!runConfigurationService) {
        res.status(503).json({ error: 'Run configuration service not available' });
        return;
      }

      const id = req.params['id'] as string;
      const config = await runConfigurationService.create(id, req.body as CreateRunConfigData);
      res.status(201).json(config);
    }),
  );

  // Update a run configuration
  router.put(
    '/:configId',
    validateParams(projectAndConfigIdSchema),
    validateProjectExists(projectRepository),
    validateBody(updateRunConfigSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!runConfigurationService) {
        res.status(503).json({ error: 'Run configuration service not available' });
        return;
      }

      const { id, configId } = req.params as { id: string; configId: string };
      const updated = await runConfigurationService.update(id, configId, req.body as UpdateRunConfigData);

      if (!updated) {
        res.status(404).json({ error: 'Run configuration not found' });
        return;
      }

      res.json(updated);
    }),
  );

  // Delete a run configuration
  router.delete(
    '/:configId',
    validateParams(projectAndConfigIdSchema),
    validateProjectExists(projectRepository),
    asyncHandler(async (req: Request, res: Response) => {
      if (!runConfigurationService) {
        res.status(503).json({ error: 'Run configuration service not available' });
        return;
      }

      const { id, configId } = req.params as { id: string; configId: string };
      const deleted = await runConfigurationService.delete(id, configId);

      if (!deleted) {
        res.status(404).json({ error: 'Run configuration not found' });
        return;
      }

      res.json({ success: true });
    }),
  );

  // Start a run configuration process
  router.post(
    '/:configId/start',
    validateParams(projectAndConfigIdSchema),
    validateProjectExists(projectRepository),
    asyncHandler(async (req: Request, res: Response) => {
      if (!runConfigurationService || !runProcessManager) {
        res.status(503).json({ error: 'Run process manager not available' });
        return;
      }

      const { id, configId } = req.params as { id: string; configId: string };

      const config = await runConfigurationService.getById(id, configId);

      if (!config) {
        res.status(404).json({ error: 'Run configuration not found' });
        return;
      }

      const project = req.project!;
      const status = await runProcessManager.start(id, project.path, configId);
      res.json(status);
    }),
  );

  // Stop a run configuration process
  router.post(
    '/:configId/stop',
    validateParams(projectAndConfigIdSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!runProcessManager) {
        res.status(503).json({ error: 'Run process manager not available' });
        return;
      }

      const { id, configId } = req.params as { id: string; configId: string };
      await runProcessManager.stop(id, configId);
      res.json({ success: true });
    }),
  );

  // Get status of a run configuration process
  router.get(
    '/:configId/status',
    validateParams(projectAndConfigIdSchema),
    (req: Request, res: Response) => {
      if (!runProcessManager) {
        res.status(503).json({ error: 'Run process manager not available' });
        return;
      }

      const { id, configId } = req.params as { id: string; configId: string };
      const status = runProcessManager.getStatus(id, configId);
      res.json(status);
    },
  );

  return router;
}
