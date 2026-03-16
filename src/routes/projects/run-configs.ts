/**
 * Run Configurations Router
 * CRUD endpoints + start/stop for project run configurations
 */

import path from 'path';
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

  // Create a run configuration AND immediately start it in one shot.
  // Designed for AI agents: a single curl call registers and launches the dev server.
  router.post(
    '/create-and-start',
    validateProjectExists(projectRepository),
    validateBody(createRunConfigSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (!runConfigurationService) {
        res.status(503).json({ error: 'Run configuration service not available' });
        return;
      }
      if (!runProcessManager) {
        res.status(503).json({ error: 'Run process manager not available' });
        return;
      }

      const id = req.params['id'] as string;
      const body = req.body as CreateRunConfigData;
      const project = req.project!;

      const targetName = body.name.trim().toLowerCase();
      const existingConfigs = await runConfigurationService.list(id);
      const existingConfig = existingConfigs.find(c => c.name.toLowerCase() === targetName);

      const normalizedCwd = normalizeCwd(body.cwd, project.path);
      let config;

      if (existingConfig) {
        // Update existing config instead of failing
        const updated = await runConfigurationService.update(id, existingConfig.id, {
          ...body,
          cwd: normalizedCwd,
        });
        if (!updated) {
          res.status(500).json({ error: 'Failed to update existing run configuration' });
          return;
        }
        config = updated;
      } else {
        // Create new config
        config = await runConfigurationService.create(id, {
          ...body,
          cwd: normalizedCwd,
        });
      }

      const status = await runProcessManager.start(id, project.path, config.id);

      res.status(201).json({ config, status });
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
      const body = req.body as CreateRunConfigData;
      const project = req.project!;
      const config = await runConfigurationService.create(id, {
        ...body,
        cwd: normalizeCwd(body.cwd, project.path),
      });
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
      const body = req.body as UpdateRunConfigData;
      const project = req.project!;
      const updated = await runConfigurationService.update(id, configId, {
        ...body,
        cwd: normalizeCwd(body.cwd, project.path),
      });

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

/**
 * If cwd is an absolute path that starts with projectRoot, strip the prefix
 * to make it relative. Otherwise return it unchanged so the service's own
 * validation can catch any remaining issues.
 */
function normalizeCwd(cwd: string | undefined, projectRoot: string): string | undefined {
  if (!cwd) return cwd;

  const isAbsolute = cwd.startsWith('/') || cwd.startsWith('\\') || /^[A-Za-z]:/.test(cwd);
  if (!isAbsolute) return cwd;

  const normalizedRoot = projectRoot.endsWith('/') ? projectRoot : projectRoot + '/';
  const normalizedCwd = cwd.endsWith('/') ? cwd : cwd + '/';

  if (normalizedCwd.startsWith(normalizedRoot)) {
    const relative = path.relative(projectRoot, cwd);
    return relative || '.';
  }

  // Absolute path outside project root — return as-is so service validation fires
  return cwd;
}
