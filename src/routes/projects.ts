import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ProjectRepository, ConversationRepository, MilestoneItemRef } from '../repositories';
import { MilestoneRef, AgentMessage, ImageData } from '../agents';
import { ProjectService, RoadmapParser, RoadmapGenerator, InstructionGenerator, RoadmapEditor } from '../services';
import { AgentManager } from '../agents';

// Request body types
interface CreateProjectBody {
  name?: string;
  path?: string;
  createNew?: boolean;
}

interface RoadmapPromptBody {
  prompt?: string;
}

interface DeleteTaskBody {
  phaseId?: string;
  milestoneId?: string;
  taskIndex?: number;
}

interface DeleteMilestoneBody {
  phaseId?: string;
  milestoneId?: string;
}

interface DeletePhaseBody {
  phaseId?: string;
}

interface RoadmapRespondBody {
  response?: string;
}

interface NextItemBody {
  phaseId?: string;
  milestoneId?: string;
  itemIndex?: number;
  taskTitle?: string;
}

interface AgentMessageBody {
  message?: string;
  images?: ImageData[];
}

interface RenameConversationBody {
  label?: string;
}

interface ClaudeFileSaveBody {
  filePath?: string;
  content?: string;
}

function computeConversationStats(
  messages: AgentMessage[],
  createdAt: string | null
): ConversationStats {
  const toolCallCount = messages.filter((m) => m.type === 'tool_use').length;
  const userMessageCount = messages.filter((m) => m.type === 'user').length;

  let durationMs: number | null = null;
  let startedAt: string | null = createdAt;

  if (messages.length > 0) {
    const firstMsg = messages[0]!;
    const lastMsg = messages[messages.length - 1]!;

    if (!startedAt && firstMsg.timestamp) {
      startedAt = firstMsg.timestamp;
    }

    if (startedAt && lastMsg.timestamp) {
      const startTime = new Date(startedAt).getTime();
      const endTime = new Date(lastMsg.timestamp).getTime();
      durationMs = endTime - startTime;
    }
  }

  return {
    messageCount: messages.length,
    toolCallCount,
    userMessageCount,
    durationMs,
    startedAt,
  };
}
import { asyncHandler, NotFoundError, ValidationError, ConflictError, getProjectLogs } from '../utils';

export interface ProjectRouterDependencies {
  projectRepository: ProjectRepository;
  projectService: ProjectService;
  roadmapParser: RoadmapParser;
  roadmapGenerator: RoadmapGenerator;
  roadmapEditor: RoadmapEditor;
  agentManager: AgentManager;
  instructionGenerator: InstructionGenerator;
  conversationRepository: ConversationRepository;
}

export interface ConversationStats {
  messageCount: number;
  toolCallCount: number;
  userMessageCount: number;
  durationMs: number | null;
  startedAt: string | null;
}

export interface DebugInfo {
  lastCommand: string | null;
  processInfo: {
    pid: number;
    cwd: string;
    startedAt: string;
  } | null;
  loopState: {
    isLooping: boolean;
    currentMilestone: MilestoneRef | null;
    currentConversationId: string | null;
  } | null;
  recentLogs: Array<{
    level: string;
    message: string;
    timestamp: string;
    context?: Record<string, unknown>;
  }>;
  trackedProcesses: Array<{
    pid: number;
    projectId: string;
    startedAt: string;
  }>;
}

export function createProjectsRouter(deps: ProjectRouterDependencies): Router {
  const router = Router();
  const {
    projectRepository,
    projectService,
    roadmapParser,
    roadmapGenerator,
    roadmapEditor,
    agentManager,
    conversationRepository,
  } = deps;

  router.get('/', asyncHandler(async (_req: Request, res: Response) => {
    const projects = await projectRepository.findAll();
    res.json(projects);
  }));

  router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateProjectBody;
    const { name, path: projectPath, createNew } = body;

    if (!projectPath) {
      throw new ValidationError('Path is required');
    }

    const result = await projectService.createProject({
      name: name ?? '',
      path: projectPath,
      createNew: createNew === true,
    });

    if (!result.success) {
      throw new ValidationError(result.error || 'Failed to create project');
    }

    res.status(201).json(result.project);
  }));

  router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    res.json(project);
  }));

  router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const deleted = await projectRepository.delete(id);

    if (!deleted) {
      throw new NotFoundError('Project');
    }

    res.status(204).send();
  }));

  router.get('/:id/roadmap', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const roadmapPath = path.join(project.path, 'doc', 'ROADMAP.md');

    try {
      const content = await fs.promises.readFile(roadmapPath, 'utf-8');
      const parsed = roadmapParser.parse(content);
      res.json({ content, parsed });
    } catch {
      throw new NotFoundError('Roadmap');
    }
  }));

  router.post('/:id/roadmap/generate', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as RoadmapPromptBody;
    const { prompt } = body;

    if (!prompt) {
      throw new ValidationError('Prompt is required');
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const result = await roadmapGenerator.generate({
      projectId: id,
      projectPath: project.path,
      projectName: project.name,
      prompt,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to generate roadmap');
    }

    res.json({ success: true });
  }));

  // Modify roadmap via Claude prompt
  router.put('/:id/roadmap', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as RoadmapPromptBody;
    const { prompt } = body;

    if (!prompt) {
      throw new ValidationError('Prompt is required');
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const roadmapPath = path.join(project.path, 'doc', 'ROADMAP.md');

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
      projectPath: project.path,
      projectName: project.name,
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
  router.delete('/:id/roadmap/task', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as DeleteTaskBody;
    const { phaseId, milestoneId, taskIndex } = body;

    if (!phaseId || !milestoneId || taskIndex === undefined) {
      throw new ValidationError('phaseId, milestoneId, and taskIndex are required');
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const roadmapPath = path.join(project.path, 'doc', 'ROADMAP.md');

    let content: string;

    try {
      content = await fs.promises.readFile(roadmapPath, 'utf-8');
    } catch {
      throw new NotFoundError('Roadmap');
    }

    const updatedContent = roadmapEditor.deleteTask(content, { phaseId, milestoneId, taskIndex });
    await fs.promises.writeFile(roadmapPath, updatedContent, 'utf-8');

    const parsed = roadmapParser.parse(updatedContent);
    res.json({ content: updatedContent, parsed });
  }));

  // Delete an entire milestone from the roadmap
  router.delete('/:id/roadmap/milestone', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as DeleteMilestoneBody;
    const { phaseId, milestoneId } = body;

    if (!phaseId || !milestoneId) {
      throw new ValidationError('phaseId and milestoneId are required');
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const roadmapPath = path.join(project.path, 'doc', 'ROADMAP.md');

    let content: string;

    try {
      content = await fs.promises.readFile(roadmapPath, 'utf-8');
    } catch {
      throw new NotFoundError('Roadmap');
    }

    const updatedContent = roadmapEditor.deleteMilestone(content, { phaseId, milestoneId });
    await fs.promises.writeFile(roadmapPath, updatedContent, 'utf-8');

    const parsed = roadmapParser.parse(updatedContent);
    res.json({ content: updatedContent, parsed });
  }));

  // Delete an entire phase from the roadmap
  router.delete('/:id/roadmap/phase', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as DeletePhaseBody;
    const { phaseId } = body;

    if (!phaseId) {
      throw new ValidationError('phaseId is required');
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const roadmapPath = path.join(project.path, 'doc', 'ROADMAP.md');

    let content: string;

    try {
      content = await fs.promises.readFile(roadmapPath, 'utf-8');
    } catch {
      throw new NotFoundError('Roadmap');
    }

    const updatedContent = roadmapEditor.deletePhase(content, { phaseId });
    await fs.promises.writeFile(roadmapPath, updatedContent, 'utf-8');

    const parsed = roadmapParser.parse(updatedContent);
    res.json({ content: updatedContent, parsed });
  }));

  // Send response to roadmap generator
  router.post('/:id/roadmap/respond', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as RoadmapRespondBody;
    const { response } = body;

    if (!response) {
      throw new ValidationError('Response is required');
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!roadmapGenerator.isGenerating(id)) {
      throw new ValidationError('No active roadmap generation for this project');
    }

    roadmapGenerator.sendResponse(id, response);
    res.json({ success: true });
  }));

  // Set next item to work on
  router.put('/:id/roadmap/next-item', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as NextItemBody;
    const { phaseId, milestoneId, itemIndex, taskTitle } = body;

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

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

  // Start autonomous loop
  router.post('/:id/agent/start', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (agentManager.isRunning(id)) {
      throw new ConflictError('Agent is already running');
    }

    // Validate roadmap exists before starting
    const roadmapPath = path.join(project.path, 'doc', 'ROADMAP.md');

    try {
      await fs.promises.access(roadmapPath);
    } catch {
      throw new ValidationError('Roadmap not found. A ROADMAP.md file is required to start the agent.');
    }

    await agentManager.startAutonomousLoop(id);
    res.json({ success: true, status: agentManager.isQueued(id) ? 'queued' : 'running' });
  }));

  router.post('/:id/agent/stop', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    await agentManager.stopAgent(id);
    res.json({ success: true, status: 'stopped' });
  }));

  router.get('/:id/agent/status', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const status = agentManager.getAgentStatus(id);
    const isQueued = agentManager.isQueued(id);
    const mode = agentManager.getAgentMode(id);
    const queuedMessageCount = agentManager.getQueuedMessageCount(id);
    res.json({ status, queued: isQueued, mode, queuedMessageCount });
  }));

  // Get context usage for running agent or last saved usage
  router.get('/:id/agent/context', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    // First try to get from running agent
    let contextUsage = agentManager.getContextUsage(id);

    // If agent is not running, use last saved context usage from project status
    if (!contextUsage && project.lastContextUsage) {
      contextUsage = project.lastContextUsage;
    }

    res.json({ contextUsage });
  }));

  // Get queued messages for running agent
  router.get('/:id/agent/queue', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const messages = agentManager.getQueuedMessages(id);
    res.json({ messages });
  }));

  // Get loop status
  router.get('/:id/agent/loop', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const loopState = agentManager.getLoopState(id);
    res.json({
      isLooping: loopState?.isLooping || false,
      currentMilestone: loopState?.currentMilestone || null,
      currentConversationId: loopState?.currentConversationId || null,
    });
  }));

  router.delete('/:id/agent/queue', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!agentManager.isQueued(id)) {
      throw new ValidationError('Agent is not queued');
    }

    agentManager.removeFromQueue(id);
    res.json({ success: true });
  }));

  // Start interactive agent session
  router.post('/:id/agent/interactive', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as AgentMessageBody;
    const { message, images } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (agentManager.isRunning(id)) {
      throw new ConflictError('Agent is already running');
    }

    await agentManager.startInteractiveAgent(id, message, images);
    res.json({ success: true, status: 'running', mode: 'interactive' });
  }));

  // Send input to running interactive agent
  router.post('/:id/agent/send', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as AgentMessageBody;
    const { message, images } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    // Allow empty message if images are provided
    if (!message && (!images || images.length === 0)) {
      throw new ValidationError('Message or images required');
    }

    if (!agentManager.isRunning(id)) {
      throw new ValidationError('Agent is not running');
    }

    const mode = agentManager.getAgentMode(id);

    if (mode !== 'interactive') {
      throw new ValidationError('Agent is not in interactive mode');
    }

    agentManager.sendInput(id, message ?? '', images);
    res.json({ success: true });
  }));

  router.get('/:id/conversation', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const conversationId = req.query['conversationId'] as string | undefined;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    // If a specific conversation ID is provided, get that conversation
    if (conversationId) {
      const conversation = await conversationRepository.findById(id, conversationId);
      const messages = conversation?.messages || [];
      const stats = computeConversationStats(messages, conversation?.createdAt || null);
      const metadata = conversation?.metadata || null;
      res.json({ messages, stats, metadata });
      return;
    }

    // Otherwise, get messages from the most recent conversation (legacy behavior)
    const conversations = await conversationRepository.getByProject(id, 1);
    const conversation = conversations[0];
    const messages = conversation?.messages || [];
    const stats = computeConversationStats(messages, conversation?.createdAt || null);
    const metadata = conversation?.metadata || null;
    res.json({ messages, stats, metadata });
  }));

  // Get all conversations for a project
  router.get('/:id/conversations', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const conversations = await conversationRepository.getByProject(id, limit);
    res.json({ conversations });
  }));

  // Rename a conversation
  router.put('/:id/conversations/:conversationId', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const conversationId = req.params['conversationId'] as string;
    const body = req.body as RenameConversationBody;
    const { label } = body;

    if (typeof label !== 'string') {
      throw new ValidationError('label is required');
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const conversation = await conversationRepository.findById(id, conversationId);

    if (!conversation) {
      throw new NotFoundError('Conversation');
    }

    await conversationRepository.renameConversation(id, conversationId, label);
    res.json({ success: true });
  }));

  // Clear current conversation (start fresh)
  router.post('/:id/conversation/clear', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    // Clear the current conversation ID
    await projectRepository.setCurrentConversation(id, null);
    res.json({ success: true });
  }));

  // Debug endpoint
  router.get('/:id/debug', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const debugInfo: DebugInfo = {
      lastCommand: agentManager.getLastCommand(id),
      processInfo: agentManager.getProcessInfo(id),
      loopState: agentManager.getLoopState(id),
      recentLogs: getProjectLogs(id, limit),
      trackedProcesses: agentManager.getTrackedProcesses(),
    };

    res.json(debugInfo);
  }));

  // Get Claude files (CLAUDE.md files in project)
  router.get('/:id/claude-files', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const claudeFiles = findClaudeFiles(project.path);
    res.json({ files: claudeFiles });
  }));

  // Save Claude file
  router.put('/:id/claude-files', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as ClaudeFileSaveBody;
    const { filePath, content } = body;

    if (!filePath || typeof content !== 'string') {
      throw new ValidationError('filePath and content are required');
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    // Validate that the file path is within the project or is a global Claude file
    const normalizedPath = path.normalize(filePath);
    const isInProject = normalizedPath.startsWith(path.normalize(project.path));
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const globalClaudePath = path.join(homeDir, '.claude', 'CLAUDE.md');
    const isGlobalClaude = normalizedPath === path.normalize(globalClaudePath);

    if (!isInProject && !isGlobalClaude) {
      throw new ValidationError('File path must be within the project or be the global CLAUDE.md');
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true });
  }));

  return router;
}

interface ClaudeFile {
  path: string;
  name: string;
  content: string;
  size: number;
  isGlobal: boolean;
}

function findClaudeFiles(projectPath: string): ClaudeFile[] {
  const files: ClaudeFile[] = [];
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';

  // Check global CLAUDE.md in ~/.claude/
  const globalClaudePath = path.join(homeDir, '.claude', 'CLAUDE.md');

  if (fs.existsSync(globalClaudePath)) {
    try {
      const content = fs.readFileSync(globalClaudePath, 'utf-8');
      const stats = fs.statSync(globalClaudePath);
      files.push({
        path: globalClaudePath,
        name: 'CLAUDE.md (Global)',
        content,
        size: stats.size,
        isGlobal: true,
      });
    } catch {
      // Ignore read errors
    }
  }

  // Check project CLAUDE.md
  const projectClaudePath = path.join(projectPath, 'CLAUDE.md');

  if (fs.existsSync(projectClaudePath)) {
    try {
      const content = fs.readFileSync(projectClaudePath, 'utf-8');
      const stats = fs.statSync(projectClaudePath);
      files.push({
        path: projectClaudePath,
        name: 'CLAUDE.md (Project)',
        content,
        size: stats.size,
        isGlobal: false,
      });
    } catch {
      // Ignore read errors
    }
  }

  // Check .claude/CLAUDE.md in project (per-project local)
  const localClaudePath = path.join(projectPath, '.claude', 'CLAUDE.md');

  if (fs.existsSync(localClaudePath)) {
    try {
      const content = fs.readFileSync(localClaudePath, 'utf-8');
      const stats = fs.statSync(localClaudePath);
      files.push({
        path: localClaudePath,
        name: 'CLAUDE.md (Local)',
        content,
        size: stats.size,
        isGlobal: false,
      });
    } catch {
      // Ignore read errors
    }
  }

  return files;
}
