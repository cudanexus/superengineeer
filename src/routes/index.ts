import { Router } from 'express';
import * as https from 'https';
import { createFilesystemRouter, createFilesystemService } from './filesystem';
import { createProjectsRouter } from './projects';
import { createAbilitiesRouter as createGlobalAbilitiesRouter } from './abilities';
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
  ClaudeOptimizationService,
  DefaultDataWipeService,
  DefaultRunConfigurationService,
  RunConfigurationService,
  DefaultRunProcessManager,
  DefaultRunConfigImportService,
  InventifyService,
  DefaultInventifyService,
  FlyDeployService,
  getOrCreateFlyDeployService as getOrCreateFlyDeployServiceInstance,
} from '../services';
import { RunProcessManager } from '../services/run-config/run-process-types';
import { createGitService, GitService } from '../services/git-service';
import { createShellService, ShellService } from '../services/shell-service';
import { createGitHubCLIService, GitHubCLIService } from '../services/github-cli-service';
import { createIntegrationsRouter } from './integrations';
import { DefaultAgentManager, AgentManager } from '../agents';
import { DefaultRalphLoopService } from '../services/ralph-loop/ralph-loop-service';
import { RalphLoopService } from '../services/ralph-loop/types';
import { FileRalphLoopRepository } from '../repositories/ralph-loop';
import { getDataDirectory, getLogger, getGlobalLogs } from '../utils';
import { RoadmapGenerator } from '../services';
import { ProjectWebSocketServer } from '../websocket';
import { ProjectDiscoveryService, DefaultProjectDiscoveryService } from '../services/project-discovery';
import packageJson from '../../package.json';

const frontendLogger = getLogger('frontend');

let sharedAgentManager: AgentManager | null = null;
let sharedRoadmapGenerator: RoadmapGenerator | null = null;
let sharedShellService: ShellService | null = null;
let sharedRalphLoopService: RalphLoopService | null = null;
let sharedConversationRepository: FileConversationRepository | null = null;
let sharedProjectRepository: FileProjectRepository | null = null;
let sharedWebSocketServer: ProjectWebSocketServer | null = null;
let sharedProjectDiscoveryService: ProjectDiscoveryService | null = null;
let sharedOptimizationService: ClaudeOptimizationService | null = null;
let sharedGitHubCLIService: GitHubCLIService | null = null;
let sharedRunConfigurationService: RunConfigurationService | null = null;
let sharedRunProcessManager: RunProcessManager | null = null;
let sharedInventifyService: InventifyService | null = null;
let sharedFlyDeployService: FlyDeployService | null = null;
const FILE_UPLOAD_LAMBDA_URL = 'https://n3uzo744vw6qsk6iv2kqclkqdq0ylgqp.lambda-url.ap-southeast-1.on.aws/';
const LAMBDA_INVOKE_PAYLOAD_LIMIT_BYTES = 6 * 1024 * 1024; // 6,291,456 bytes
const SAFE_UPLOAD_FILE_LIMIT_BYTES = 4 * 1024 * 1024; // base64 + JSON overhead safety margin

function sanitizeUploadFileName(input: unknown): string {
  const raw = typeof input === 'string' ? input : (input == null ? '' : String(input));
  const trimmed = raw.trim();
  const fallback = 'attachment.bin';
  const candidate = trimmed.length > 0 ? trimmed : fallback;
  const base = candidate.split(/[\\/]/).pop() || fallback;
  const cleaned = base
    .replace(/[<>:"|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function estimateBase64DecodedBytes(base64: string): number {
  const clean = String(base64 || '').replace(/\s/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : (clean.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

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
  const gitService = createGitService();

  // Agent Manager (singleton for WebSocket integration)
  const agentManager = deps.agentManager || getOrCreateAgentManager({
    projectRepository,
    conversationRepository,
    settingsRepository,
    instructionGenerator,
    roadmapParser,
    maxConcurrentAgents: deps.maxConcurrentAgents,
    gitService,
  });

  // Health check
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: packageJson.version,
      timestamp: new Date().toISOString(),
      shellEnabled: deps.shellEnabled !== false,
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
      clientId?: string;
      errorType?: string;
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
      errorType: body.errorType || 'runtime',
      clientId: body.clientId,
    });

    res.json({ success: true });
  });

  // File upload proxy (avoids browser CORS issues for direct Lambda calls)
  router.post('/attachments/presign', (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object'
        ? req.body
        : {}) as {
          fileName?: string;
          fileType?: string;
          mimeType?: string;
          contentType?: string;
          fileSize?: number | string;
        };

      const fileName = sanitizeUploadFileName(body.fileName);
      const fileType = String(body.fileType || body.mimeType || body.contentType || 'application/octet-stream').trim();
      const fileSize = Number(body.fileSize || 0);

      if (!fileName) {
        res.status(400).json({ error: 'fileName is required' });
        return;
      }

      const payload = JSON.stringify({
        fileName,
        fileType,
        fileSize: Number.isFinite(fileSize) && fileSize >= 0 ? fileSize : 0,
      });

      const upstreamReq = https.request(FILE_UPLOAD_LAMBDA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (upstreamRes) => {
        const chunks: Buffer[] = [];

        upstreamRes.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        upstreamRes.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let parsed: { uploadUrl?: string; url?: string; key?: string; message?: string; error?: string } | null = null;

          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }

          const statusCode = upstreamRes.statusCode || 502;
          if (statusCode >= 200 && statusCode < 300 && parsed && parsed.uploadUrl) {
            res.json({
              uploadUrl: parsed.uploadUrl,
              url: parsed.url,
              key: parsed.key,
            });
            return;
          }

          const upstreamMessage = (parsed && (parsed.error || parsed.message))
            || (raw && raw.trim().length > 0 ? raw.trim().slice(0, 500) : '');

          if (statusCode >= 400 && statusCode < 500) {
            res.status(statusCode).json({
              error: upstreamMessage || 'Upload rejected by upstream service',
              upstreamStatus: statusCode,
            });
            return;
          }

          res.status(502).json({
            error: upstreamMessage || 'Failed to request upload URL',
            upstreamStatus: statusCode,
          });
        });
      });

      upstreamReq.on('error', () => {
        res.status(502).json({ error: 'Upload service unavailable' });
      });

      upstreamReq.setTimeout(45000, () => {
        upstreamReq.destroy(new Error('Presign request timed out'));
      });

      upstreamReq.write(payload);
      upstreamReq.end();
    } catch {
      res.status(400).json({ error: 'Invalid presign payload' });
    }
  });

  // Legacy file upload proxy (base64 via backend, retained for compatibility)
  router.post('/attachments/upload', (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object'
        ? req.body
        : {}) as {
          fileData?: string;
          fileDataBase64?: string;
          dataUrl?: string;
          fileName?: string;
          mimeType?: string;
          contentType?: string;
        };
      const fileData = String(body.fileData || body.fileDataBase64 || '').trim();
      const fileName = sanitizeUploadFileName(body.fileName);
      const mimeType = String(body.mimeType || body.contentType || '').trim();
      const dataUrl = String(body.dataUrl || '').trim();

      if (!fileData || !fileName) {
        res.status(400).json({ error: 'fileData and fileName are required' });
        return;
      }

      const estimatedFileBytes = estimateBase64DecodedBytes(fileData);
      if (estimatedFileBytes > SAFE_UPLOAD_FILE_LIMIT_BYTES) {
        res.status(413).json({
          error: 'File is too large. Max supported size is 4 MB per file.',
          code: 'PAYLOAD_TOO_LARGE',
          maxFileBytes: SAFE_UPLOAD_FILE_LIMIT_BYTES,
          lambdaPayloadLimitBytes: LAMBDA_INVOKE_PAYLOAD_LIMIT_BYTES,
        });
        return;
      }

      const payload = JSON.stringify({
        // Keep legacy keys used by existing Lambda handler.
        fileData,
        fileName,
        // Forward richer metadata for handlers that infer extension/content-type.
        fileDataBase64: String(body.fileDataBase64 || fileData),
        dataUrl,
        mimeType,
        contentType: mimeType,
      });

      const upstreamReq = https.request(FILE_UPLOAD_LAMBDA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (upstreamRes) => {
        const chunks: Buffer[] = [];

        upstreamRes.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        upstreamRes.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let parsed: { message?: string; url?: string; error?: string } | null = null;

          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }

          const statusCode = upstreamRes.statusCode || 502;
          if (statusCode >= 200 && statusCode < 300 && parsed && parsed.url) {
            res.json({
              message: parsed.message || 'File uploaded successfully',
              url: parsed.url,
            });
            return;
          }

          const upstreamMessage = (parsed && (parsed.error || parsed.message))
            || (raw && raw.trim().length > 0 ? raw.trim().slice(0, 500) : '');

          // Preserve upstream client errors (4xx) instead of collapsing to 502.
          if (statusCode >= 400 && statusCode < 500) {
            res.status(statusCode).json({
              error: upstreamMessage || 'Upload rejected by upstream service',
              upstreamStatus: statusCode,
            });
            return;
          }

          // Upstream 5xx/network-like behavior maps to bad gateway.
          res.status(502).json({
            error: upstreamMessage || 'Failed to upload file',
            upstreamStatus: statusCode,
          });
        });
      });

      upstreamReq.on('error', () => {
        res.status(502).json({ error: 'Upload service unavailable' });
      });

      upstreamReq.setTimeout(45000, () => {
        upstreamReq.destroy(new Error('Upload request timed out'));
      });

      upstreamReq.write(payload);
      upstreamReq.end();
    } catch {
      res.status(400).json({ error: 'Invalid upload payload' });
    }
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

  // Get all connected clients
  router.get('/debug/clients', (_req, res) => {
    const webSocketServer = getWebSocketServer();
    const projectId = _req.query['projectId'] as string | undefined;

    if (!webSocketServer) {
      res.json([]);
      return;
    }

    const clients = projectId
      ? webSocketServer.getConnectedClients(projectId)
      : webSocketServer.getConnectedClients();

    res.json(clients);
  });

  // Filesystem routes
  const filesystemService = createFilesystemService();
  router.use('/fs', createFilesystemRouter(filesystemService));

  // Settings routes
  const dataWipeService = new DefaultDataWipeService({
    projectRepository,
    dataDirectory: dataDir,
  });

  router.use('/settings', createSettingsRouter({
    settingsRepository,
    dataWipeService,
    onSettingsChange: (event) => {
      if (event.maxConcurrentAgents !== undefined) {
        agentManager.setMaxConcurrentAgents(event.maxConcurrentAgents);
      }

      if (event.appendSystemPromptChanged || event.mcpChanged) {
        // Restart all running agents to apply the new system prompt or MCP changes
        agentManager.restartAllRunningAgents().catch((error) => {
          console.error('Failed to restart agents after settings change:', error);
        });
      }
    },
  }));

  // Integrations
  const githubCLIService = getOrCreateGitHubCLIService();
  router.use('/integrations', createIntegrationsRouter({
    githubCLIService,
    projectService,
    projectRepository,
    broadcast: (message) => {
      const ws = getWebSocketServer();

      if (ws) {
        ws.broadcast(message);
      }
    },
  }));

  // Shell service (singleton for WebSocket integration) - only create if enabled
  const shellEnabled = deps.shellEnabled !== false;
  const shellService = shellEnabled ? getOrCreateShellService() : null;
  const flyDeployService = getOrCreateFlyDeployService();

  // Optimization service
  const optimizationService = getOrCreateOptimizationService(agentManager);

  // Run configuration service, process manager & import service
  const runConfigurationService = getOrCreateRunConfigurationService(projectRepository);
  const runProcessManager = getOrCreateRunProcessManager(runConfigurationService);
  const runConfigImportService = new DefaultRunConfigImportService();

  // Inventify service
  const ralphLoopService = getOrCreateRalphLoopService(projectRepository, settingsRepository);
  const inventifyService = getOrCreateInventifyService(
    agentManager,
    projectService,
    ralphLoopService,
    settingsRepository,
  );

  // Project routes
  router.use('/abilities', createGlobalAbilitiesRouter({
    projectRepository,
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
    settingsRepository,
    gitService,
    shellService,
    flyDeployService,
    shellEnabled,
    ralphLoopService,
    projectDiscoveryService: getOrCreateProjectDiscoveryService(projectRepository),
    optimizationService,
    runConfigurationService,
    runProcessManager,
    runConfigImportService,
    inventifyService,
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
  gitService: GitService;
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
      gitService: config.gitService,
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

export function setWebSocketServer(server: ProjectWebSocketServer): void {
  sharedWebSocketServer = server;
}

export function getWebSocketServer(): ProjectWebSocketServer | null {
  return sharedWebSocketServer;
}

export function getProcessTracker(): unknown {
  // Process tracker is part of the agent manager
  return sharedAgentManager ? (sharedAgentManager as { processTracker?: unknown }).processTracker : null;
}

function getOrCreateProjectDiscoveryService(projectRepository: FileProjectRepository): ProjectDiscoveryService {
  if (!sharedProjectDiscoveryService) {
    const logger = getLogger('project-discovery');
    sharedProjectDiscoveryService = new DefaultProjectDiscoveryService(projectRepository, logger);
  }
  return sharedProjectDiscoveryService;
}

export function getProjectDiscoveryService(): ProjectDiscoveryService | null {
  return sharedProjectDiscoveryService;
}

function getOrCreateGitHubCLIService(): GitHubCLIService {
  if (!sharedGitHubCLIService) {
    sharedGitHubCLIService = createGitHubCLIService();
  }

  return sharedGitHubCLIService;
}

export function getGitHubCLIService(): GitHubCLIService | null {
  return sharedGitHubCLIService;
}

function getOrCreateOptimizationService(
  agentManager: AgentManager
): ClaudeOptimizationService {
  if (!sharedOptimizationService) {
    const logger = getLogger('optimization');
    sharedOptimizationService = new ClaudeOptimizationService(
      logger,
      agentManager
    );
  }
  return sharedOptimizationService;
}

export function getOptimizationService(): ClaudeOptimizationService | null {
  return sharedOptimizationService;
}

function getOrCreateRunConfigurationService(
  projectRepository: FileProjectRepository,
): RunConfigurationService {
  if (!sharedRunConfigurationService) {
    sharedRunConfigurationService = new DefaultRunConfigurationService({
      projectRepository,
    });
  }
  return sharedRunConfigurationService;
}

export function getRunConfigurationService(): RunConfigurationService | null {
  return sharedRunConfigurationService;
}

function getOrCreateRunProcessManager(
  runConfigurationService: RunConfigurationService,
): RunProcessManager {
  if (!sharedRunProcessManager) {
    sharedRunProcessManager = new DefaultRunProcessManager({
      runConfigurationService,
    });
  }
  return sharedRunProcessManager;
}

export function getRunProcessManager(): RunProcessManager | null {
  return sharedRunProcessManager;
}

function getOrCreateInventifyService(
  agentManager: AgentManager,
  projectService: DefaultProjectService,
  ralphLoopService: RalphLoopService,
  settingsRepository: FileSettingsRepository,
): InventifyService {
  if (!sharedInventifyService) {
    const logger = getLogger('inventify');
    sharedInventifyService = new DefaultInventifyService({
      logger,
      agentManager,
      projectService,
      ralphLoopService,
      settingsRepository,
    });
  }
  return sharedInventifyService;
}

export function getInventifyService(): InventifyService | null {
  return sharedInventifyService;
}

function getOrCreateFlyDeployService(): FlyDeployService {
  if (!sharedFlyDeployService) {
    if (!sharedProjectRepository) {
      throw new Error('Project repository must exist before Fly deploy service initialization');
    }
    sharedFlyDeployService = getOrCreateFlyDeployServiceInstance(sharedProjectRepository);
  }

  return sharedFlyDeployService;
}

export function getFlyDeployService(): FlyDeployService | null {
  return sharedFlyDeployService;
}
