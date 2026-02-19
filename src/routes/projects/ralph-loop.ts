import { Router, Request, Response } from 'express';
import { asyncHandler, NotFoundError, ValidationError } from '../../utils';
import { ProjectRouterDependencies, RalphLoopStartBody } from './types';
import { isValidModel, DEFAULT_MODEL } from '../../config/models';
import { validateBody, validateParams } from '../../middleware/validation';
import { validateProjectExists } from '../../middleware/project';
import { agentOperationRateLimit } from '../../middleware/rate-limit';
import {
  ralphLoopStartSchema,
  projectAndTaskIdSchema
} from './schemas';

const ralphLoopDisabledMessage = 'Ralph Loop service is not available';

export function createRalphLoopRouter(deps: ProjectRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  const {
    projectRepository,
    ralphLoopService,
    settingsRepository,
  } = deps;

  // Start a new Ralph Loop
  router.post('/start', validateBody(ralphLoopStartSchema), validateProjectExists(projectRepository), agentOperationRateLimit, asyncHandler(async (req: Request, res: Response) => {
    if (!ralphLoopService) {
      res.status(503).json({ error: ralphLoopDisabledMessage });
      return;
    }

    const id = req.params['id'] as string;
    const body = req.body as RalphLoopStartBody;
    const { taskDescription, maxTurns, workerModel, reviewerModel } = body;

    // Get default settings
    const settings = await settingsRepository.get();
    const defaults = settings.ralphLoop || {};

    // Validate models if provided
    if (workerModel && !isValidModel(workerModel)) {
      throw new ValidationError(`Invalid worker model: ${workerModel}`);
    }

    if (reviewerModel && !isValidModel(reviewerModel)) {
      throw new ValidationError(`Invalid reviewer model: ${reviewerModel}`);
    }

    const state = await ralphLoopService.start(id, {
      taskDescription: taskDescription!,
      maxTurns: maxTurns || defaults.defaultMaxTurns || 5,
      workerModel: workerModel || defaults.defaultWorkerModel || DEFAULT_MODEL,
      reviewerModel: reviewerModel || defaults.defaultReviewerModel || DEFAULT_MODEL,
    });

    res.status(201).json({
      taskId: state.taskId,
      config: state.config,
    });
  }));

  // List all Ralph Loops for a project
  router.get('/', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    if (!ralphLoopService) {
      res.status(503).json({ error: ralphLoopDisabledMessage });
      return;
    }

    const id = req.params['id'] as string;

    const loops = await ralphLoopService.listByProject(id);
    res.json(loops);
  }));

  // Get specific Ralph Loop state
  router.get('/:taskId', validateParams(projectAndTaskIdSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    if (!ralphLoopService) {
      res.status(503).json({ error: ralphLoopDisabledMessage });
      return;
    }

    const id = req.params['id'] as string;
    const taskId = req.params['taskId'] as string;

    const loop = await ralphLoopService.getState(id, taskId);

    if (!loop) {
      throw new NotFoundError('Ralph Loop');
    }

    res.json(loop);
  }));

  // Stop a Ralph Loop
  router.post('/:taskId/stop', validateParams(projectAndTaskIdSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    if (!ralphLoopService) {
      res.status(503).json({ error: ralphLoopDisabledMessage });
      return;
    }

    const id = req.params['id'] as string;
    const taskId = req.params['taskId'] as string;

    const loop = await ralphLoopService.getState(id, taskId);

    if (!loop) {
      throw new NotFoundError('Ralph Loop');
    }

    await ralphLoopService.stop(id, taskId);

    res.json({ success: true });
  }));

  // Pause a Ralph Loop
  router.post('/:taskId/pause', validateParams(projectAndTaskIdSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    if (!ralphLoopService) {
      res.status(503).json({ error: ralphLoopDisabledMessage });
      return;
    }

    const id = req.params['id'] as string;
    const taskId = req.params['taskId'] as string;

    const loop = await ralphLoopService.getState(id, taskId);

    if (!loop) {
      throw new NotFoundError('Ralph Loop');
    }

    if (loop.status === 'paused') {
      res.status(409).json({ error: 'Ralph Loop is already paused' });
      return;
    }

    if (loop.status !== 'worker_running' && loop.status !== 'reviewer_running') {
      res.status(409).json({ error: 'Ralph Loop is not running' });
      return;
    }

    await ralphLoopService.pause(id, taskId);

    res.json({ success: true });
  }));

  // Resume a paused Ralph Loop
  router.post('/:taskId/resume', validateParams(projectAndTaskIdSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    if (!ralphLoopService) {
      res.status(503).json({ error: ralphLoopDisabledMessage });
      return;
    }

    const id = req.params['id'] as string;
    const taskId = req.params['taskId'] as string;

    const loop = await ralphLoopService.getState(id, taskId);

    if (!loop) {
      throw new NotFoundError('Ralph Loop');
    }

    if (loop.status !== 'paused') {
      res.status(409).json({ error: 'Ralph Loop is not paused' });
      return;
    }

    await ralphLoopService.resume(id, taskId);

    res.json({ success: true });
  }));

  // Delete a Ralph Loop
  router.delete('/:taskId', validateParams(projectAndTaskIdSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    if (!ralphLoopService) {
      res.status(503).json({ error: ralphLoopDisabledMessage });
      return;
    }

    const id = req.params['id'] as string;
    const taskId = req.params['taskId'] as string;

    // Delete the Ralph Loop (this will also stop it if running)
    const deleted = await ralphLoopService.delete(id, taskId);

    if (!deleted) {
      throw new NotFoundError('Ralph Loop');
    }

    res.status(204).send();
  }));

  return router;
}