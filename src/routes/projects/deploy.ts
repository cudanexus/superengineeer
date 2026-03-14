import { Request, Response, Router } from 'express';
import { asyncHandler } from '../../utils';
import { validateProjectExists } from '../../middleware/project';
import { strictRateLimit } from '../../middleware/rate-limit';
import { ProjectRouterDependencies } from './types';

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
        appName: req.project?.flyDeployment?.appName || null,
        appUrl: req.project?.flyDeployment?.appUrl || null,
        hasExistingApp: !!req.project?.flyDeployment?.appName,
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
      hasExistingApp: true,
    });
  });

  router.post('/start', validateProjectExists(projectRepository, projectDiscoveryService || undefined), strictRateLimit, asyncHandler(async (req: Request, res: Response) => {
    if (!flyDeployService) {
      res.status(503).json({ error: 'Fly deploy service not available' });
      return;
    }

    const project = req.project!;
    let deployment;

    try {
      deployment = await flyDeployService.deploy(project.id, project.path, project.name);
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
      hasExistingApp: true,
    });
  }));

  router.get('/app-logs', validateProjectExists(projectRepository, projectDiscoveryService || undefined), asyncHandler(async (req: Request, res: Response) => {
    if (!flyDeployService) {
      res.status(503).json({ error: 'Fly deploy service not available' });
      return;
    }

    try {
      const result = await flyDeployService.getAppLogs(req.project!.id);

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
