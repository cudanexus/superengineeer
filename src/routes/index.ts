import { Router } from 'express';
import { createFilesystemRouter, WindowsFilesystemService } from './filesystem';
import { createProjectsRouter } from './projects';
import { createSettingsRouter } from './settings';
import {
  FileProjectRepository,
  FileConversationRepository,
  FileSettingsRepository,
} from '../repositories';
import {
  DefaultProjectService,
  MarkdownRoadmapParser,
  MarkdownRoadmapEditor,
  ClaudeRoadmapGenerator,
  DefaultInstructionGenerator,
} from '../services';
import { DefaultAgentManager, AgentManager } from '../agents';
import { getDataDirectory } from '../utils';
import { RoadmapGenerator } from '../services';

let sharedAgentManager: AgentManager | null = null;
let sharedRoadmapGenerator: RoadmapGenerator | null = null;

export interface ApiRouterDependencies {
  agentManager?: AgentManager;
  maxConcurrentAgents?: number;
}

export function createApiRouter(deps: ApiRouterDependencies = {}): Router {
  const router = Router();
  const dataDir = getDataDirectory();

  // Repositories
  const projectRepository = new FileProjectRepository(dataDir);
  // Conversation repository uses project repository to resolve project paths
  const conversationRepository = new FileConversationRepository({
    projectPathResolver: projectRepository,
  });
  const settingsRepository = new FileSettingsRepository(dataDir);

  // Services
  const projectService = new DefaultProjectService({ projectRepository });
  const roadmapParser = new MarkdownRoadmapParser();
  const roadmapEditor = new MarkdownRoadmapEditor(roadmapParser);
  const roadmapGenerator = getOrCreateRoadmapGenerator();
  const instructionGenerator = new DefaultInstructionGenerator();

  // Agent Manager (singleton for WebSocket integration)
  const agentManager = deps.agentManager || getOrCreateAgentManager({
    projectRepository,
    conversationRepository,
    settingsRepository,
    instructionGenerator,
    roadmapParser,
    maxConcurrentAgents: deps.maxConcurrentAgents,
  });

  // Health check
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Agent resource status
  router.get('/agents/status', (_req, res) => {
    const resourceStatus = agentManager.getResourceStatus();
    res.json(resourceStatus);
  });

  // Filesystem routes
  const filesystemService = new WindowsFilesystemService();
  router.use('/fs', createFilesystemRouter(filesystemService));

  // Settings routes
  router.use('/settings', createSettingsRouter({
    settingsRepository,
    onSettingsChange: (settings) => {
      agentManager.setMaxConcurrentAgents(settings.maxConcurrentAgents);
    },
  }));

  // Project routes
  router.use('/projects', createProjectsRouter({
    projectRepository,
    projectService,
    roadmapParser,
    roadmapGenerator,
    roadmapEditor,
    agentManager,
    instructionGenerator,
    conversationRepository,
  }));

  return router;
}

interface AgentManagerConfig {
  projectRepository: FileProjectRepository;
  conversationRepository: FileConversationRepository;
  settingsRepository: FileSettingsRepository;
  instructionGenerator: DefaultInstructionGenerator;
  roadmapParser: MarkdownRoadmapParser;
  maxConcurrentAgents?: number;
}

function getOrCreateAgentManager(config: AgentManagerConfig): AgentManager {
  if (!sharedAgentManager) {
    sharedAgentManager = new DefaultAgentManager({
      projectRepository: config.projectRepository,
      conversationRepository: config.conversationRepository,
      settingsRepository: config.settingsRepository,
      instructionGenerator: config.instructionGenerator,
      roadmapParser: config.roadmapParser,
      maxConcurrentAgents: config.maxConcurrentAgents,
    });
  }

  return sharedAgentManager;
}

export function getAgentManager(): AgentManager | null {
  return sharedAgentManager;
}

function getOrCreateRoadmapGenerator(): RoadmapGenerator {
  if (!sharedRoadmapGenerator) {
    sharedRoadmapGenerator = new ClaudeRoadmapGenerator();
  }

  return sharedRoadmapGenerator;
}

export function getRoadmapGenerator(): RoadmapGenerator | null {
  return sharedRoadmapGenerator;
}
