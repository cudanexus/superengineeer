import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { asyncHandler, NotFoundError, ValidationError } from '../../utils';
import {
  ProjectRouterDependencies,
  RoadmapPromptBody,
  DeleteTaskBody,
  DeleteMilestoneBody,
  DeletePhaseBody,
  AddTaskBody,
  RoadmapRespondBody,
  NextItemBody
} from './types';
import { MilestoneItemRef } from '../../repositories';
import { validateBody } from '../../middleware/validation';
import { validateProjectExists } from '../../middleware/project';
import { roadmapGenerationRateLimit } from '../../middleware/rate-limit';
import {
  roadmapPromptSchema,
  roadmapRespondSchema,
  deleteTaskSchema,
  deleteMilestoneSchema,
  deletePhaseSchema,
  addTaskSchema,
  nextItemSchema
} from './schemas';

export function createRoadmapRouter(deps: ProjectRouterDependencies): Router {
  const router = Router({ mergeParams: true }); // mergeParams to access :id from parent
  const {
    projectRepository,
    roadmapParser,
    roadmapGenerator,
    roadmapEditor,
  } = deps;

  // Get roadmap
  router.get('/', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;

    const roadmapPath = path.join((project).path, 'doc', 'ROADMAP.md');

    try {
      const content = await fs.promises.readFile(roadmapPath, 'utf-8');
      const parsed = roadmapParser.parse(content);
      res.json({ content, parsed });
    } catch {
      throw new NotFoundError('Roadmap');
    }
  }));

  // Generate roadmap
  router.post('/generate', validateBody(roadmapPromptSchema), validateProjectExists(projectRepository), roadmapGenerationRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = req.project!;
    const body = req.body as RoadmapPromptBody;
    const { prompt } = body;

    const result = await roadmapGenerator.generate({
      projectId: id,
      projectPath: (project).path,
      projectName: (project).name,
      prompt: prompt!,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to generate roadmap');
    }

    res.json({ success: true });
  }));

  // Modify roadmap via Claude prompt
  router.put('/', validateBody(roadmapPromptSchema), validateProjectExists(projectRepository), roadmapGenerationRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = req.project!;
    const body = req.body as RoadmapPromptBody;
    const { prompt } = body;

    const roadmapPath = path.join((project).path, 'doc', 'ROADMAP.md');

    // Read existing roadmap
    let existingContent = '';

    try {
      existingContent = await fs.promises.readFile(roadmapPath, 'utf-8');
    } catch {
      throw new NotFoundError('Roadmap');
    }

    // Generate modified roadmap
    const result = await roadmapGenerator.generate({
      projectId: id,
      projectPath: (project).path,
      projectName: (project).name,
      prompt: `Here is the existing ROADMAP.md:\n\n${existingContent}\n\nPlease modify it according to this request: ${prompt}`,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to modify roadmap');
    }

    // Read and return the updated roadmap
    const updatedContent = await fs.promises.readFile(roadmapPath, 'utf-8');
    const parsed = roadmapParser.parse(updatedContent);

    res.json({ content: updatedContent, parsed });
  }));

  // Delete a specific task from the roadmap
  router.delete('/task', validateBody(deleteTaskSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const body = req.body as DeleteTaskBody;
    const { phaseId, milestoneId, taskIndex } = body;

    const roadmapPath = path.join((project).path, 'doc', 'ROADMAP.md');

    let content: string;

    try {
      content = await fs.promises.readFile(roadmapPath, 'utf-8');
    } catch {
      throw new NotFoundError('Roadmap');
    }

    const updatedContent = roadmapEditor.deleteTask(content, { phaseId: phaseId!, milestoneId: milestoneId!, taskIndex: taskIndex! });
    await fs.promises.writeFile(roadmapPath, updatedContent, 'utf-8');

    const parsed = roadmapParser.parse(updatedContent);
    res.json({ content: updatedContent, parsed });
  }));

  // Delete an entire milestone from the roadmap
  router.delete('/milestone', validateBody(deleteMilestoneSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const body = req.body as DeleteMilestoneBody;
    const { phaseId, milestoneId } = body;

    const roadmapPath = path.join((project).path, 'doc', 'ROADMAP.md');

    let content: string;

    try {
      content = await fs.promises.readFile(roadmapPath, 'utf-8');
    } catch {
      throw new NotFoundError('Roadmap');
    }

    const updatedContent = roadmapEditor.deleteMilestone(content, { phaseId: phaseId!, milestoneId: milestoneId! });
    await fs.promises.writeFile(roadmapPath, updatedContent, 'utf-8');

    const parsed = roadmapParser.parse(updatedContent);
    res.json({ content: updatedContent, parsed });
  }));

  // Delete an entire phase from the roadmap
  router.delete('/phase', validateBody(deletePhaseSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const body = req.body as DeletePhaseBody;
    const { phaseId } = body;

    const roadmapPath = path.join((project).path, 'doc', 'ROADMAP.md');

    let content: string;

    try {
      content = await fs.promises.readFile(roadmapPath, 'utf-8');
    } catch {
      throw new NotFoundError('Roadmap');
    }

    const updatedContent = roadmapEditor.deletePhase(content, { phaseId: phaseId! });
    await fs.promises.writeFile(roadmapPath, updatedContent, 'utf-8');

    const parsed = roadmapParser.parse(updatedContent);
    res.json({ content: updatedContent, parsed });
  }));

  // Send response to roadmap generator
  router.post('/respond', validateBody(roadmapRespondSchema), validateProjectExists(projectRepository), asyncHandler((req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as RoadmapRespondBody;
    const { response } = body;

    if (!roadmapGenerator.isGenerating(id)) {
      throw new ValidationError('No active roadmap generation for this project');
    }

    roadmapGenerator.sendResponse(id, response!);
    res.json({ success: true });
  }));

  // Add a task to a milestone in the roadmap
  router.post('/task', validateBody(addTaskSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const body = req.body as AddTaskBody;
    const { phaseId, milestoneId, taskTitle } = body;

    const roadmapPath = path.join((project).path, 'doc', 'ROADMAP.md');

    let content: string;

    try {
      content = await fs.promises.readFile(roadmapPath, 'utf-8');
    } catch {
      throw new NotFoundError('Roadmap');
    }

    const updatedContent = roadmapEditor.addTask(content, {
      phaseId: phaseId!,
      milestoneId: milestoneId!,
      taskTitle: taskTitle!,
    });
    await fs.promises.writeFile(roadmapPath, updatedContent, 'utf-8');

    const parsed = roadmapParser.parse(updatedContent);
    res.json({ content: updatedContent, parsed });
  }));

  // Set next item to work on
  router.put('/next-item', validateBody(nextItemSchema), validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as NextItemBody;
    const { phaseId, milestoneId, itemIndex, taskTitle } = body;

    // Allow clearing the next item by sending null or empty body
    if (!phaseId && !milestoneId && itemIndex === undefined) {
      await projectRepository.updateNextItem(id, null);
      res.json({ success: true, nextItem: null });
      return;
    }

    if (!phaseId || !milestoneId || itemIndex === undefined) {
      throw new ValidationError('phaseId, milestoneId, and itemIndex are required');
    }

    const nextItem: MilestoneItemRef = {
      phaseId,
      milestoneId,
      itemIndex,
      taskTitle: taskTitle ?? '',
    };

    await projectRepository.updateNextItem(id, nextItem);
    res.json({ success: true, nextItem });
  }));

  return router;
}