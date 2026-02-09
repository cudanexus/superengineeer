import { Router, Request, Response } from 'express';
import { asyncHandler, getLogger } from '../../utils';
import { ProjectRouterDependencies, ShellInputBody, ShellResizeBody } from './types';
import { validateBody } from '../../middleware/validation';
import { validateProjectExists } from '../../middleware/project';
import { strictRateLimit } from '../../middleware/rate-limit';
import {
  shellInputSchema,
  shellResizeSchema
} from './schemas';

const shellDisabledMessage = 'Shell integration is disabled due to security restrictions. The server is bound to 0.0.0.0 which would expose terminal access to all network interfaces. For security, bind to 127.0.0.1 or use shellEnabled flag to force enable.';

export function createShellRouter(deps: ProjectRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  const {
    projectRepository,
    shellService,
    shellEnabled,
  } = deps;

  // Check if shell is enabled
  router.get('/enabled', (_req: Request, res: Response) => {
    res.json({ enabled: shellEnabled !== false });
  });

  // Create or get shell session for project
  router.post('/start', validateProjectExists(projectRepository), strictRateLimit, asyncHandler((req: Request, res: Response) => {
    if (shellEnabled === false) {
      res.status(403).json({ error: shellDisabledMessage, shellDisabled: true });
      return;
    }

    if (!shellService) {
      res.status(503).json({ error: 'Shell service not available' });
      return;
    }

    const id = req.params['id'] as string;
    const project = req.project!;

    // Create or get existing session
    const existingSession = shellService.getSessionByProject(id);
    if (existingSession) {
      res.json({ sessionId: existingSession.id, status: 'ready' });
      return;
    }

    const session = shellService.createSession(id, (project).path);
    res.json({ sessionId: session.id, status: 'ready' });
  }));

  // Get current shell session status
  router.get('/status', (req: Request, res: Response) => {
    if (shellEnabled === false) {
      res.status(403).json({ error: shellDisabledMessage, shellDisabled: true });
      return;
    }

    if (!shellService) {
      res.status(503).json({ error: 'Shell service not available' });
      return;
    }

    const id = req.params['id'] as string;
    const session = shellService.getSessionByProject(id);

    if (!session) {
      res.json({ status: 'no_session' });
      return;
    }

    res.json({
      status: 'active',
      sessionId: session.id,
      dimensions: { cols: 80, rows: 24 }, // Default dimensions
    });
  });

  // Send input to shell
  router.post('/input', validateBody(shellInputSchema), (req: Request, res: Response) => {
    const logger = getLogger('shell-routes');

    if (shellEnabled === false) {
      res.status(403).json({ error: shellDisabledMessage, shellDisabled: true });
      return;
    }

    if (!shellService) {
      res.status(503).json({ error: 'Shell service not available' });
      return;
    }

    const id = req.params['id'] as string;
    const body = req.body as ShellInputBody;
    const { input } = body;

    const session = shellService.getSessionByProject(id);

    if (!session) {
      res.status(404).json({ error: 'No shell session found' });
      return;
    }

    try {
      shellService.write(session.id, input!);
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to send shell input', { error });
      res.status(500).json({ error: 'Failed to send input' });
    }
  });

  // Resize shell terminal
  router.post('/resize', validateBody(shellResizeSchema), (req: Request, res: Response) => {
    if (shellEnabled === false) {
      res.status(403).json({ error: shellDisabledMessage, shellDisabled: true });
      return;
    }

    if (!shellService) {
      res.status(503).json({ error: 'Shell service not available' });
      return;
    }

    const id = req.params['id'] as string;
    const body = req.body as ShellResizeBody;
    const { cols, rows } = body;

    const session = shellService.getSessionByProject(id);

    if (!session) {
      res.status(404).json({ error: 'No shell session found' });
      return;
    }

    shellService.resize(session.id, cols!, rows!);
    res.json({ success: true });
  });

  // Stop shell session
  router.post('/stop', (req: Request, res: Response) => {
    if (shellEnabled === false) {
      res.status(403).json({ error: shellDisabledMessage, shellDisabled: true });
      return;
    }

    if (!shellService) {
      res.status(503).json({ error: 'Shell service not available' });
      return;
    }

    const id = req.params['id'] as string;
    const session = shellService.getSessionByProject(id);

    if (!session) {
      res.json({ success: true }); // Already stopped
      return;
    }

    shellService.killSession(session.id);
    res.json({ success: true });
  });

  return router;
}