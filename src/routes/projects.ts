import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ProjectRepository, ConversationRepository, MilestoneItemRef, ProjectPermissionOverrides } from '../repositories';
import { MilestoneRef, AgentMessage, ImageData } from '../agents';
import { ProjectService, RoadmapParser, RoadmapGenerator, InstructionGenerator, RoadmapEditor, ShellService } from '../services';
import { GitService } from '../services/git-service';
import { AgentManager } from '../agents';
import { getLogger } from '../utils';

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
  sessionId?: string;
  permissionMode?: 'acceptEdits' | 'plan';
}

interface RenameConversationBody {
  label?: string;
}

interface ClaudeFileSaveBody {
  filePath?: string;
  content?: string;
}

interface PermissionOverridesBody {
  enabled?: boolean;
  allowRules?: string[];
  denyRules?: string[];
  defaultMode?: 'acceptEdits' | 'plan';
}

interface GitStageBody {
  paths?: string[];
}

interface GitCommitBody {
  message?: string;
}

interface GitBranchBody {
  name?: string;
  checkout?: boolean;
}

interface GitCheckoutBody {
  branch?: string;
}

interface GitPushBody {
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
}

interface GitPullBody {
  remote?: string;
  branch?: string;
}

interface GitTagBody {
  name: string;
  message?: string;
}

interface GitPushTagBody {
  remote?: string;
}

interface ShellInputBody {
  input?: string;
}

interface ShellResizeBody {
  cols?: number;
  rows?: number;
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
import { SettingsRepository } from '../repositories/settings';

export interface ProjectRouterDependencies {
  projectRepository: ProjectRepository;
  projectService: ProjectService;
  roadmapParser: RoadmapParser;
  roadmapGenerator: RoadmapGenerator;
  roadmapEditor: RoadmapEditor;
  agentManager: AgentManager;
  instructionGenerator: InstructionGenerator;
  conversationRepository: ConversationRepository;
  settingsRepository: SettingsRepository;
  gitService: GitService;
  shellService?: ShellService | null;
  shellEnabled?: boolean;
}

export interface ConversationStats {
  messageCount: number;
  toolCallCount: number;
  userMessageCount: number;
  durationMs: number | null;
  startedAt: string | null;
}

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
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
  memoryUsage: MemoryUsage;
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
    settingsRepository,
    gitService,
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

    const fullStatus = agentManager.getFullStatus(id);
    res.json(fullStatus);
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

  // Remove a queued message from a running agent
  router.delete('/:id/agent/queue/:index', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const index = parseInt(req.params['index'] as string, 10);
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (isNaN(index) || index < 0) {
      throw new ValidationError('Invalid queue index');
    }

    if (!agentManager.isRunning(id)) {
      throw new ValidationError('Agent is not running');
    }

    const success = agentManager.removeQueuedMessage(id, index);

    if (!success) {
      throw new ValidationError('Failed to remove message from queue');
    }

    res.json({ success: true });
  }));

  // Start interactive agent session
  router.post('/:id/agent/interactive', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as AgentMessageBody;
    const { message, images, sessionId, permissionMode } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (agentManager.isRunning(id)) {
      throw new ConflictError('Agent is already running');
    }

    await agentManager.startInteractiveAgent(id, {
      initialMessage: message,
      images,
      sessionId,
      permissionMode,
    });

    // Get the project again to retrieve the current conversation ID (may have been created)
    const updatedProject = await projectRepository.findById(id);
    const currentSessionId = agentManager.getSessionId(id) || updatedProject?.currentConversationId || null;

    res.json({
      success: true,
      status: 'running',
      mode: 'interactive',
      sessionId: currentSessionId,
      conversationId: updatedProject?.currentConversationId || null,
    });
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

    // Determine which conversation to load:
    // 1. If specific conversationId query param provided, use that
    // 2. If project has a currentConversationId, use that (preserves session)
    // 3. Fall back to most recent conversation
    const targetConversationId = conversationId || project.currentConversationId;

    if (targetConversationId) {
      const conversation = await conversationRepository.findById(id, targetConversationId);

      if (conversation) {
        const messages = conversation.messages || [];
        const stats = computeConversationStats(messages, conversation.createdAt || null);
        const metadata = conversation.metadata || null;
        res.json({ messages, stats, metadata });
        return;
      }
    }

    // Fall back to most recent conversation if target not found
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

  // Search conversations by content
  router.get('/:id/conversations/search', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const query = req.query['q'] as string;

    if (!query || query.length < 2) {
      res.json([]);
      return;
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const results = await conversationRepository.searchMessages(id, query);
    res.json(results);
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

  // Set current conversation (for resuming from history)
  router.put('/:id/conversation/current', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as { conversationId?: string };
    const { conversationId } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!conversationId) {
      throw new ValidationError('conversationId is required');
    }

    // Verify the conversation exists
    const conversation = await conversationRepository.findById(id, conversationId);

    if (!conversation) {
      throw new NotFoundError('Conversation');
    }

    await projectRepository.setCurrentConversation(id, conversationId);
    res.json({ success: true, sessionId: conversation.metadata?.sessionId || null });
  }));

  // Debug endpoint
  router.get('/:id/debug', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const mem = process.memoryUsage();
    const debugInfo: DebugInfo = {
      lastCommand: agentManager.getLastCommand(id),
      processInfo: agentManager.getProcessInfo(id),
      loopState: agentManager.getLoopState(id),
      recentLogs: getProjectLogs(id, limit),
      trackedProcesses: agentManager.getTrackedProcesses(),
      memoryUsage: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
      },
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

  // GET /api/projects/:id/permissions - Get project permission overrides
  router.get('/:id/permissions', asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = await projectRepository.findById(projectId);

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    res.json(project.permissionOverrides || { enabled: false });
  }));

  // PUT /api/projects/:id/permissions - Update project permission overrides
  router.put('/:id/permissions', asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = await projectRepository.findById(projectId);

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const body = req.body as PermissionOverridesBody;
    const overrides: ProjectPermissionOverrides = {
      enabled: body.enabled ?? false,
      allowRules: body.allowRules,
      denyRules: body.denyRules,
      defaultMode: body.defaultMode,
    };

    const updated = await projectRepository.updatePermissionOverrides(project.id, overrides.enabled ? overrides : null);
    res.json(updated?.permissionOverrides || { enabled: false });
  }));

  // GET /api/projects/:id/optimizations - Get optimization suggestions for the project
  router.get('/:id/optimizations', asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = await projectRepository.findById(projectId);

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const settings = await settingsRepository.get();
    const maxSizeBytes = settings.claudeMdMaxSizeKB * 1024;
    const checks: OptimizationCheck[] = [];

    // Check 1: Project CLAUDE.md
    const projectClaudeMdPath = path.join(project.path, 'CLAUDE.md');
    const projectClaudeMdCheck = await checkProjectClaudeMd(projectClaudeMdPath, maxSizeBytes, settings.claudeMdMaxSizeKB);
    checks.push(projectClaudeMdCheck);

    // Check 2: Global CLAUDE.md
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const globalClaudeMdPath = path.join(homeDir, '.claude', 'CLAUDE.md');
    const globalClaudeMdCheck = await checkGlobalClaudeMd(globalClaudeMdPath, maxSizeBytes, settings.claudeMdMaxSizeKB);
    checks.push(globalClaudeMdCheck);

    // Check 3: ROADMAP.md
    const roadmapPath = path.join(project.path, 'doc', 'ROADMAP.md');
    const roadmapCheck = await checkRoadmap(roadmapPath);
    checks.push(roadmapCheck);

    // Build legacy optimizations array for badge count (only items needing action)
    const optimizations = checks.filter(c => c.status !== 'passed');

    res.json({
      checks,
      optimizations,
      settings: {
        claudeMdMaxSizeKB: settings.claudeMdMaxSizeKB,
      },
    });
  }));

  // Git routes

  // GET /api/projects/:id/git/status - Get git status
  router.get('/:id/git/status', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const status = await gitService.getStatus(project.path);
    res.json(status);
  }));

  // GET /api/projects/:id/git/branches - List branches
  router.get('/:id/git/branches', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const branches = await gitService.getBranches(project.path);
    res.json(branches);
  }));

  // GET /api/projects/:id/git/diff - Get diff
  router.get('/:id/git/diff', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const staged = req.query['staged'] === 'true';
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const diff = await gitService.getDiff(project.path, staged);
    res.json({ diff });
  }));

  // POST /api/projects/:id/git/stage - Stage files
  router.post('/:id/git/stage', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitStageBody;
    const { paths } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!paths || !Array.isArray(paths)) {
      throw new ValidationError('paths array is required');
    }

    await gitService.stageFiles(project.path, paths);
    res.json({ success: true });
  }));

  // POST /api/projects/:id/git/stage-all - Stage all files
  router.post('/:id/git/stage-all', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    await gitService.stageAll(project.path);
    res.json({ success: true });
  }));

  // POST /api/projects/:id/git/unstage - Unstage files
  router.post('/:id/git/unstage', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitStageBody;
    const { paths } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!paths || !Array.isArray(paths)) {
      throw new ValidationError('paths array is required');
    }

    await gitService.unstageFiles(project.path, paths);
    res.json({ success: true });
  }));

  // POST /api/projects/:id/git/unstage-all - Unstage all files
  router.post('/:id/git/unstage-all', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    await gitService.unstageAll(project.path);
    res.json({ success: true });
  }));

  // POST /api/projects/:id/git/commit - Commit staged changes
  router.post('/:id/git/commit', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitCommitBody;
    const { message } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!message) {
      throw new ValidationError('message is required');
    }

    const result = await gitService.commit(project.path, message);
    res.json(result);
  }));

  // POST /api/projects/:id/git/branch - Create branch
  router.post('/:id/git/branch', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitBranchBody;
    const { name, checkout } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!name) {
      throw new ValidationError('name is required');
    }

    await gitService.createBranch(project.path, name, checkout);
    res.json({ success: true });
  }));

  // POST /api/projects/:id/git/checkout - Checkout branch
  router.post('/:id/git/checkout', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitCheckoutBody;
    const { branch } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!branch) {
      throw new ValidationError('branch is required');
    }

    await gitService.checkout(project.path, branch);
    res.json({ success: true });
  }));

  // POST /api/projects/:id/git/push - Push to remote
  router.post('/:id/git/push', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitPushBody;
    const { remote, branch, setUpstream } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const output = await gitService.push(project.path, remote, branch, setUpstream);
    res.json({ success: true, output });
  }));

  // POST /api/projects/:id/git/pull - Pull from remote
  router.post('/:id/git/pull', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitPullBody;
    const { remote, branch } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const output = await gitService.pull(project.path, remote, branch);
    res.json({ success: true, output });
  }));

  // GET /api/projects/:id/git/file-diff - Get diff for specific file
  router.get('/:id/git/file-diff', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const filePath = req.query['path'] as string;
    const staged = req.query['staged'] === 'true';
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!filePath) {
      throw new ValidationError('path query parameter is required');
    }

    const result = await gitService.getFileDiff(project.path, filePath, staged);
    res.json(result);
  }));

  // POST /api/projects/:id/git/discard - Discard changes to files
  router.post('/:id/git/discard', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitStageBody;
    const { paths } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!paths || !Array.isArray(paths)) {
      throw new ValidationError('paths array is required');
    }

    await gitService.discardChanges(project.path, paths);
    res.json({ success: true });
  }));

  // GET /api/projects/:id/git/tags - List tags
  router.get('/:id/git/tags', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const tags = await gitService.listTags(project.path);
    res.json({ tags });
  }));

  // POST /api/projects/:id/git/tags - Create tag
  router.post('/:id/git/tags', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as GitTagBody;
    const { name, message } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (!name || typeof name !== 'string') {
      throw new ValidationError('tag name is required');
    }

    await gitService.createTag(project.path, name, message);
    res.json({ success: true });
  }));

  // POST /api/projects/:id/git/tags/:name/push - Push tag to remote
  router.post('/:id/git/tags/:name/push', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const tagName = req.params['name'] as string;
    const body = req.body as GitPushTagBody;
    const { remote } = body;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const output = await gitService.pushTag(project.path, tagName, remote);
    res.json({ success: true, output });
  }));

  // ===== Shell Routes =====

  const shellDisabledMessage = 'Shell is disabled when server is bound to all interfaces (0.0.0.0). ' +
    'Set CLAUDITO_FORCE_SHELL_ENABLED=1 to enable, or bind to a specific host.';

  // Check if shell is enabled
  router.get('/:id/shell/enabled', (_req: Request, res: Response) => {
    const { shellEnabled } = deps;
    res.json({ enabled: shellEnabled !== false });
  });

  // Create or get shell session for project
  router.post('/:id/shell/start', asyncHandler(async (req: Request, res: Response) => {
    const { shellService, shellEnabled } = deps;

    if (shellEnabled === false) {
      res.status(403).json({ error: shellDisabledMessage, shellDisabled: true });
      return;
    }

    if (!shellService) {
      res.status(503).json({ error: 'Shell service not available' });
      return;
    }

    const id = req.params['id'] as string;
    const project = await projectRepository.findById(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    const session = shellService.createSession(id, project.path);
    res.json({
      sessionId: session.id,
      projectId: session.projectId,
      cwd: session.cwd
    });
  }));

  // Get current shell session status
  router.get('/:id/shell/status', (req: Request, res: Response) => {
    const { shellService, shellEnabled } = deps;

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
      res.json({ active: false });
      return;
    }

    res.json({
      active: true,
      sessionId: session.id,
      cwd: session.cwd,
      createdAt: session.createdAt
    });
  });

  // Send input to shell
  router.post('/:id/shell/input', (req: Request, res: Response) => {
    const { shellService, shellEnabled } = deps;
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

    logger.withProject(id).debug('Shell input request received', {
      inputLength: input?.length,
      inputPreview: typeof input === 'string' ? JSON.stringify(input.substring(0, 20)) : typeof input
    });

    const session = shellService.getSessionByProject(id);

    if (!session) {
      logger.withProject(id).warn('Shell input failed: no active session');
      res.status(404).json({ error: 'No active shell session' });
      return;
    }

    if (typeof input !== 'string') {
      throw new ValidationError('input must be a string');
    }

    const success = shellService.write(session.id, input);
    logger.withProject(id).debug('Shell input write result', { success, sessionId: session.id });
    res.json({ success });
  });

  // Resize shell terminal
  router.post('/:id/shell/resize', (req: Request, res: Response) => {
    const { shellService, shellEnabled } = deps;

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
      res.status(404).json({ error: 'No active shell session' });
      return;
    }

    if (typeof cols !== 'number' || typeof rows !== 'number') {
      throw new ValidationError('cols and rows must be numbers');
    }

    shellService.resize(session.id, cols, rows);
    res.json({ success: true });
  });

  // Stop shell session
  router.post('/:id/shell/stop', (req: Request, res: Response) => {
    const { shellService, shellEnabled } = deps;

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
      res.status(404).json({ error: 'No active shell session' });
      return;
    }

    shellService.killSession(session.id);
    res.json({ success: true });
  });

  return router;
}

async function checkProjectClaudeMd(
  filePath: string,
  maxSizeBytes: number,
  maxSizeKB: number
): Promise<OptimizationCheck> {
  const baseCheck: OptimizationCheck = {
    id: 'project-claude-md',
    title: 'Project CLAUDE.md',
    description: 'Project-specific instructions that help Claude understand your codebase structure and conventions.',
    status: 'passed',
    statusMessage: '',
    filePath,
  };

  try {
    const stats = await fs.promises.stat(filePath);
    const sizeKB = Math.round(stats.size / 1024);

    if (stats.size > maxSizeBytes) {
      return {
        ...baseCheck,
        status: 'warning',
        statusMessage: `${sizeKB}KB (exceeds ${maxSizeKB}KB limit)`,
        action: 'edit',
        actionLabel: 'Open in Editor',
      };
    }

    return {
      ...baseCheck,
      status: 'passed',
      statusMessage: `${sizeKB}KB (under ${maxSizeKB}KB limit)`,
    };
  } catch {
    return {
      ...baseCheck,
      status: 'info',
      statusMessage: 'File not found',
      action: 'create',
      actionLabel: 'Create CLAUDE.md',
    };
  }
}

async function checkGlobalClaudeMd(
  filePath: string,
  maxSizeBytes: number,
  maxSizeKB: number
): Promise<OptimizationCheck> {
  const baseCheck: OptimizationCheck = {
    id: 'global-claude-md',
    title: 'Global CLAUDE.md',
    description: 'User-wide instructions loaded for all projects (~/.claude/CLAUDE.md).',
    status: 'passed',
    statusMessage: '',
    filePath,
  };

  try {
    const stats = await fs.promises.stat(filePath);
    const sizeKB = Math.round(stats.size / 1024);

    if (stats.size > maxSizeBytes) {
      return {
        ...baseCheck,
        status: 'warning',
        statusMessage: `${sizeKB}KB (exceeds ${maxSizeKB}KB limit)`,
        action: 'claude-files',
        actionLabel: 'Open Claude Files',
      };
    }

    return {
      ...baseCheck,
      status: 'passed',
      statusMessage: `${sizeKB}KB (under ${maxSizeKB}KB limit)`,
    };
  } catch {
    return {
      ...baseCheck,
      status: 'passed',
      statusMessage: 'Not configured (optional)',
    };
  }
}

async function checkRoadmap(filePath: string): Promise<OptimizationCheck> {
  const baseCheck: OptimizationCheck = {
    id: 'roadmap',
    title: 'ROADMAP.md',
    description: 'Project roadmap file that enables milestone/task selection in the UI.',
    status: 'passed',
    statusMessage: '',
    filePath,
  };

  try {
    const stats = await fs.promises.stat(filePath);
    const sizeKB = Math.round(stats.size / 1024);

    return {
      ...baseCheck,
      status: 'passed',
      statusMessage: `Found (${sizeKB}KB)`,
    };
  } catch {
    return {
      ...baseCheck,
      status: 'info',
      statusMessage: 'File not found',
      action: 'create',
      actionLabel: 'Create ROADMAP.md',
    };
  }
}

interface OptimizationCheck {
  id: string;
  title: string;
  description: string;
  status: 'passed' | 'warning' | 'info';
  statusMessage: string;
  filePath: string;
  action?: 'create' | 'edit' | 'claude-files';
  actionLabel?: string;
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
