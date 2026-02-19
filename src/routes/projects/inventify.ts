import { Router, Request, Response } from 'express';
import {
  inventifyStartSchema,
  inventifySelectSchema,
  inventifySuggestNamesSchema,
  inventifyCompleteBuildSchema,
} from './schemas';
import { ProjectRouterDependencies } from './types';

function validateService(
  deps: ProjectRouterDependencies,
  res: Response,
): boolean {
  if (!deps.inventifyService) {
    res.status(503).json({ error: 'Inventify service not available' });
    return false;
  }

  return true;
}

export function createInventifyRouter(
  deps: ProjectRouterDependencies,
): Router {
  const router = Router();

  // POST /api/projects/inventify/start
  router.post('/start', async (req: Request, res: Response) => {
    if (!validateService(deps, res)) return;

    const parseResult = inventifyStartSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.issues,
      });
      return;
    }

    try {
      const settings = await deps.settingsRepository.get();

      if (!settings.inventifyFolder) {
        res.status(400).json({
          error: 'Inventify folder not configured. Set it in Settings.',
        });
        return;
      }

      const { projectTypes, themes } = parseResult.data;

      const result = await deps.inventifyService!.start({
        projectTypes,
        themes,
        inventifyFolder: settings.inventifyFolder,
      });

      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // GET /api/projects/inventify/ideas
  router.get('/ideas', (_req: Request, res: Response) => {
    if (!validateService(deps, res)) return;

    const ideas = deps.inventifyService!.getIdeas();

    if (!ideas) {
      res.status(404).json({ error: 'No ideas available' });
      return;
    }

    res.json({ ideas });
  });

  // POST /api/projects/inventify/cancel
  router.post('/cancel', async (_req: Request, res: Response) => {
    if (!validateService(deps, res)) return;

    try {
      await deps.inventifyService!.cancel();
      res.json({ success: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // POST /api/projects/inventify/suggest-names
  router.post('/suggest-names', async (req: Request, res: Response) => {
    if (!validateService(deps, res)) return;

    const parseResult = inventifySuggestNamesSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.issues,
      });
      return;
    }

    try {
      const { selectedIndex } = parseResult.data;
      const result =
        await deps.inventifyService!.suggestNames(selectedIndex);

      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // GET /api/projects/inventify/name-suggestions
  router.get('/name-suggestions', (_req: Request, res: Response) => {
    if (!validateService(deps, res)) return;

    const suggestions = deps.inventifyService!.getNameSuggestions();

    if (!suggestions) {
      res.status(404).json({ error: 'No name suggestions available' });
      return;
    }

    res.json(suggestions);
  });

  // GET /api/projects/inventify/build-result
  router.get('/build-result', (_req: Request, res: Response) => {
    if (!validateService(deps, res)) return;

    const result = deps.inventifyService!.getBuildResult();

    if (!result) {
      res.status(404).json({ error: 'No build result available' });
      return;
    }

    res.json(result);
  });

  // POST /api/projects/inventify/complete-build
  router.post('/complete-build', async (req: Request, res: Response) => {
    if (!validateService(deps, res)) return;

    const parseResult = inventifyCompleteBuildSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.issues,
      });
      return;
    }

    try {
      const { projectId } = parseResult.data;

      const project =
        await deps.projectRepository.findById(projectId);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      await deps.inventifyService!.completeBuild(
        projectId,
        project.path,
      );

      res.json({ success: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // POST /api/projects/inventify/select
  router.post('/select', async (req: Request, res: Response) => {
    if (!validateService(deps, res)) return;

    const parseResult = inventifySelectSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.issues,
      });
      return;
    }

    try {
      const { selectedIndex, projectName } = parseResult.data;
      const result =
        await deps.inventifyService!.selectIdea(selectedIndex, projectName);

      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
