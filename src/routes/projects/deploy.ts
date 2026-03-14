import { Request, Response, Router } from 'express';
import { asyncHandler } from '../../utils';
import { validateProjectExists } from '../../middleware/project';
import { strictRateLimit } from '../../middleware/rate-limit';
import { ProjectRouterDependencies } from './types';
import { FlyDeploymentInfo } from '../../repositories/project';

function parseExternalDeployment(value: unknown): FlyDeploymentInfo | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const appName = typeof raw.appName === 'string' ? raw.appName.trim() : '';
  const appUrl = typeof raw.appUrl === 'string' ? raw.appUrl.trim() : '';
  const lastDeploymentStatus = raw.lastDeploymentStatus;
  const lastDeployedAt = raw.lastDeployedAt;

  if (!appName) {
    return null;
  }

  if (lastDeploymentStatus !== 'created' && lastDeploymentStatus !== 'deployed' && lastDeploymentStatus !== 'failed') {
    return null;
  }

  return {
    appName,
    appUrl,
    lastDeploymentStatus,
    lastDeployedAt: typeof lastDeployedAt === 'string' ? lastDeployedAt : null,
  };
}

export function createDeployRouter(deps: ProjectRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  const {
    projectRepository,
    projectDiscoveryService,
    flyDeployService,
  } = deps;

  router.get('/status', validateProjectExists(projectRepository, projectDiscoveryService || undefined), (req: Request, res: Response) => {
    if (!flyDeployService) {
      res.status(503).json({ error: 'Fly deploy service not available' });
      return;
    }

    const deployment = flyDeployService.getDeploymentByProject(req.params['id'] as string);

    if (!deployment) {
      res.json({
        status: 'idle',
        isActive: false,
        appName: null,
        appUrl: null,
        hasExistingApp: false,
      });
      return;
    }

    res.json({
      deploymentId: deployment.deploymentId,
      appName: deployment.appName,
      appUrl: deployment.appUrl,
      status: deployment.status,
      stage: deployment.stage,
      message: deployment.message,
      startedAt: deployment.startedAt,
      completedAt: deployment.completedAt,
      missingFiles: deployment.missingFiles || [],
      isActive: deployment.status === 'validating' || deployment.status === 'creating_app' || deployment.status === 'deploying',
      hasExistingApp: deployment.reuseExistingApp,
    });
  });

  router.post('/start', validateProjectExists(projectRepository, projectDiscoveryService || undefined), strictRateLimit, asyncHandler(async (req: Request, res: Response) => {
    if (!flyDeployService) {
      res.status(503).json({ error: 'Fly deploy service not available' });
      return;
    }

    const project = req.project!;
    const existingDeployment = parseExternalDeployment((req.body as { existingDeployment?: unknown } | undefined)?.existingDeployment);
    let deployment;

    try {
      deployment = await flyDeployService.deploy(project.id, project.path, project.name, existingDeployment);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('already running')) {
        res.status(409).json({ error: message });
        return;
      }

      throw error;
    }

    res.json({
      deploymentId: deployment.deploymentId,
      appName: deployment.appName,
      appUrl: deployment.appUrl,
      status: deployment.status,
      stage: deployment.stage,
      message: deployment.message,
      startedAt: deployment.startedAt,
      completedAt: deployment.completedAt,
      missingFiles: deployment.missingFiles || [],
      isActive: deployment.status === 'validating' || deployment.status === 'creating_app' || deployment.status === 'deploying',
      hasExistingApp: deployment.reuseExistingApp || deployment.status === 'completed',
    });
  }));

  router.get('/app-logs', validateProjectExists(projectRepository, projectDiscoveryService || undefined), asyncHandler(async (req: Request, res: Response) => {
    if (!flyDeployService) {
      res.status(503).json({ error: 'Fly deploy service not available' });
      return;
    }

    try {
      const result = await flyDeployService.getAppLogs(
        req.project!.id,
        parseExternalDeployment({
          appName: typeof req.query['appName'] === 'string' ? req.query['appName'] : '',
          appUrl: typeof req.query['appUrl'] === 'string' ? req.query['appUrl'] : '',
          lastDeploymentStatus: 'deployed',
          lastDeployedAt: null,
        }),
      );

      res.json({
        appName: result.appName,
        appUrl: result.appUrl,
        logs: result.logs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  }));

  return router;
}
