import { Router } from 'express';
import { createFilesystemRouter, createFilesystemService } from './filesystem';
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
import { createGitService } from '../services/git-service';
import { createShellService, ShellService } from '../services/shell-service';
import { DefaultAgentManager, AgentManager } from '../agents';
import { DefaultRalphLoopService } from '../services/ralph-loop/ralph-loop-service';
import { RalphLoopService } from '../services/ralph-loop/types';
import { FileRalphLoopRepository } from '../repositories/ralph-loop';
import { getDataDirectory, getLogger, getGlobalLogs } from '../utils';
import { RoadmapGenerator } from '../services';
import packageJson from '../../package.json';

const frontendLogger = getLogger('frontend');

let sharedAgentManager: AgentManager | null = null;
let sharedRoadmapGenerator: RoadmapGenerator | null = null;
let sharedShellService: ShellService | null = null;
let sharedRalphLoopService: RalphLoopService | null = null;
let sharedConversationRepository: FileConversationRepository | null = null;
let sharedProjectRepository: FileProjectRepository | null = null;

export interface ApiRouterDependencies {
  agentManager?: AgentManager;
  maxConcurrentAgents?: number;
  devMode?: boolean;
  shellEnabled?: boolean;
  onShutdown?: () => void;
}

export function createApiRouter(deps: ApiRouterDependencies = {}): Router {
  const router = Router();
  const dataDir = getDataDirectory();

  // Repositories
  const projectRepository = sharedProjectRepository || new FileProjectRepository(dataDir);
  if (!sharedProjectRepository) {
    sharedProjectRepository = projectRepository;
  }
  // Conversation repository uses project repository to resolve project paths
  const conversationRepository = sharedConversationRepository || new FileConversationRepository({
    projectPathResolver: projectRepository,
  });
  if (!sharedConversationRepository) {
    sharedConversationRepository = conversationRepository;
  }
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
      version: packageJson.version,
      timestamp: new Date().toISOString(),
    });
  });

  // Frontend error logging
  router.post('/log/error', (req, res) => {
    const body = req.body as {
      message?: string;
      stack?: string;
      source?: string;
      line?: number;
      column?: number;
      projectId?: string;
      userAgent?: string;
    };

    const loggerWithProject = body.projectId
      ? frontendLogger.withProject(body.projectId)
      : frontendLogger;

    loggerWithProject.error('Frontend error', {
      message: body.message,
      stack: body.stack,
      source: body.source,
      line: body.line,
      column: body.column,
      userAgent: body.userAgent,
      type: 'frontend',
    });

    res.json({ success: true });
  });

  // Dev mode status
  router.get('/dev', (_req, res) => {
    res.json({
      devMode: deps.devMode || false,
    });
  });

  // Shutdown endpoint (only works in dev mode)
  router.post('/dev/shutdown', (_req, res) => {
    if (!deps.devMode) {
      res.status(403).json({ error: 'Shutdown only available in dev mode' });
      return;
    }

    res.json({ message: 'Shutting down...' });

    if (deps.onShutdown) {
      // Give response time to be sent, then trigger shutdown
      setTimeout(() => {
        deps.onShutdown!();
        // Force exit if graceful shutdown takes too long
        setTimeout(() => {
          console.log('Force exiting process...');
          process.exit(0);
        }, 5000);
      }, 100);
    }
  });

  // Agent resource status
  router.get('/agents/status', (_req, res) => {
    const resourceStatus = agentManager.getResourceStatus();
    res.json(resourceStatus);
  });

  // Global logs endpoint (for debug modal)
  router.get('/logs', (req, res) => {
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 100;
    const logs = getGlobalLogs(limit);
    res.json({ logs });
  });

  // Filesystem routes
  const filesystemService = createFilesystemService();
  router.use('/fs', createFilesystemRouter(filesystemService));

  // Settings routes
  router.use('/settings', createSettingsRouter({
    settingsRepository,
    onSettingsChange: (event) => {
      if (event.maxConcurrentAgents !== undefined) {
        agentManager.setMaxConcurrentAgents(event.maxConcurrentAgents);
      }

      if (event.appendSystemPromptChanged) {
        // Restart all running agents to apply the new system prompt
        agentManager.restartAllRunningAgents().catch((error) => {
          console.error('Failed to restart agents after settings change:', error);
        });
      }
    },
  }));

  // Git service
  const gitService = createGitService();

  // Shell service (singleton for WebSocket integration) - only create if enabled
  const shellEnabled = deps.shellEnabled !== false;
  const shellService = shellEnabled ? getOrCreateShellService() : null;

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
    settingsRepository,
    gitService,
    shellService,
    shellEnabled,
    ralphLoopService: getOrCreateRalphLoopService(projectRepository, settingsRepository),
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

function getOrCreateShellService(): ShellService {
  if (!sharedShellService) {
    sharedShellService = createShellService();
  }

  return sharedShellService;
}

export function getShellService(): ShellService | null {
  return sharedShellService;
}

function getOrCreateRalphLoopService(projectRepository: FileProjectRepository, settingsRepository?: FileSettingsRepository): RalphLoopService {
  if (!sharedRalphLoopService) {
    const ralphLoopRepository = new FileRalphLoopRepository({
      projectPathResolver: projectRepository,
    });
    sharedRalphLoopService = new DefaultRalphLoopService({
      repository: ralphLoopRepository,
      projectRepository,
      projectPathResolver: projectRepository,
      settingsRepository,
    });
  }
  return sharedRalphLoopService;
}

export function getRalphLoopService(): RalphLoopService | null {
  return sharedRalphLoopService;
}

export function getConversationRepository(): FileConversationRepository | null {
  return sharedConversationRepository;
}

export function getProjectRepository(): FileProjectRepository | null {
  return sharedProjectRepository;
}
