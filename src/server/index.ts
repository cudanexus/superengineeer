import express, { Application, Request, Response } from 'express';
import { Server, createServer } from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AppConfig } from '../config';
import { DEFAULT_WORKFLOW_RULES } from '../constants/claude-workflow';
import { createApiRouter, getAgentManager, getRoadmapGenerator, getShellService, getRalphLoopService, getConversationRepository, getProjectRepository, setWebSocketServer, getRunProcessManager } from '../routes';
import { createAuthRouter } from '../routes/auth';
import { DefaultWebSocketServer, ProjectWebSocketServer } from '../websocket';
import { createErrorHandler, formatAccessibleUrls } from '../utils';
import { AuthService, createAuthService } from '../services/auth-service';
import { createAuthMiddleware, parseCookie, COOKIE_NAME } from '../middleware/auth-middleware';
import { displayLoginCredentials } from '../utils/qr-generator';
import packageJson from '../../package.json';

export interface HttpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ServerDependencies {
  config: AppConfig;
}

export interface ExpressAppOptions {
  maxConcurrentAgents?: number;
  devMode?: boolean;
  shellEnabled?: boolean;
  onShutdown?: () => void;
  authService?: AuthService;
}

export function createExpressApp(options: ExpressAppOptions = {}): Application {
  const app = express();

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const publicPath = path.join(__dirname, '../../public');

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    // Return normal health response
    return res.json({ status: 'ok', version: packageJson.version });
  });

  // Root route
  app.get('/', (req: Request, res: Response) => {
    serveIndexWithCacheBusting(publicPath, res);
  });

  // Add middleware to set proper Content-Type headers for TV browser compatibility
  app.use((req, res, next) => {
    if (req.path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (req.path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (req.path.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    next();
  });

  app.use(express.static(publicPath));


  app.use('/api', createApiRouter({
    maxConcurrentAgents: options.maxConcurrentAgents,
    devMode: options.devMode,
    shellEnabled: options.shellEnabled,
    onShutdown: options.onShutdown,
  }));

  app.use(createErrorHandler());

  return app;
}

function serveIndexWithCacheBusting(publicPath: string, res: Response): void {
  const indexPath = path.join(publicPath, 'index.html');

  try {
    let html = fs.readFileSync(indexPath, 'utf-8');
    const timestamp = Date.now();

    html = html.replace(
      /(<(?:script|link)[^>]*(?:src|href)=["'])([^"']+\.(?:js|css))([^"']*["'])/gi,
      (match, prefix: string, url: string, suffix: string) => {
        if (url.startsWith('/vendor/')) {
          return match;
        }
        const separator = url.includes('?') ? '&' : '?';
        return `${prefix}${url}${separator}v=${timestamp}${suffix}`;
      }
    );

    res.type('html').send(html);
  } catch {
    res.status(500).send('Error loading page');
  }
}

export class ExpressHttpServer implements HttpServer {
  private httpServer: Server | null = null;
  private wsServer: ProjectWebSocketServer | null = null;
  private readonly app: Application;
  private readonly config: AppConfig;
  private readonly authService: AuthService;
  private shutdownCallback?: () => void;

  constructor(deps: ServerDependencies) {
    this.config = deps.config;
    this.authService = createAuthService();
    this.app = createExpressApp({
      maxConcurrentAgents: this.config.maxConcurrentAgents,
      devMode: this.config.devMode,
      shellEnabled: this.config.shellEnabled,
      onShutdown: () => this.triggerShutdown(),
      authService: undefined,
    });
  }

  onShutdown(callback: () => void): void {
    this.shutdownCallback = callback;
  }

  private triggerShutdown(): void {
    if (this.shutdownCallback) {
      this.shutdownCallback();
    }
  }

  async start(): Promise<void> {
    // Cleanup any orphan processes from previous runs
    await this.cleanupOrphanProcesses();

    // Auto-register default project if none exist
    await this.ensureDefaultProject();

    // Ensure all projects have a CLAUDE.md file
    await this.ensureClaudeMdFiles();

    return new Promise((resolve, reject) => {
      this.httpServer = createServer(this.app);

      this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
        const address = `${this.config.host}:${this.config.port}`;

        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.config.port} is already in use`));
        } else if (err.code === 'EADDRNOTAVAIL') {
          reject(new Error(`Cannot bind to address ${address}: address not available`));
        } else if (err.code === 'EACCES') {
          reject(new Error(`Cannot bind to ${address}: permission denied`));
        } else {
          reject(new Error(`Failed to start server on ${address}: ${err.message}`));
        }
      });

      this.initializeWebSocket();

      this.httpServer.listen(this.config.port, this.config.host, () => {
        this.logAccessibleUrls();
        resolve();
      });
    });
  }

  private async cleanupOrphanProcesses(): Promise<void> {
    const agentManager = getAgentManager();

    if (!agentManager) {
      return;
    }

    const result = await agentManager.cleanupOrphanProcesses();

    if (result.foundCount > 0) {
      console.log(`Found ${result.foundCount} tracked PID(s) from previous run`);

      if (result.killedCount > 0) {
        console.log(`Killed ${result.killedCount} orphan Claude process(es): ${result.killedPids.join(', ')}`);
      }

      if (result.skippedPids.length > 0) {
        console.log(`Skipped ${result.skippedPids.length} PID(s) reused by other processes: ${result.skippedPids.join(', ')}`);
      }

      if (result.failedPids.length > 0) {
        console.log(`Failed to kill: ${result.failedPids.join(', ')}`);
      }
    }
  }

  private async ensureDefaultProject(): Promise<void> {
    const DEFAULT_PROJECT_PATH = '/home/superengineer/super-code';
    const DEFAULT_PROJECT_NAME = 'super-code';

    try {
      let projectRepository = getProjectRepository();

      if (!projectRepository) {
        const { getDataDirectory } = await import('../utils');
        const { FileProjectRepository } = await import('../repositories');
        projectRepository = new FileProjectRepository(getDataDirectory());
      }

      const projects = await projectRepository.findAll();

      if (projects.length > 0) {
        return;
      }

      // Create the directory if it doesn't exist
      if (!fs.existsSync(DEFAULT_PROJECT_PATH)) {
        try {
          fs.mkdirSync(DEFAULT_PROJECT_PATH, { recursive: true });
          console.log(`Created default project directory: ${DEFAULT_PROJECT_PATH}`);
        } catch {
          console.warn(`Could not create ${DEFAULT_PROJECT_PATH} — will register if it exists`);
        }
      }

      // Only register if directory is accessible
      if (!fs.existsSync(DEFAULT_PROJECT_PATH)) {
        console.warn(`Default project path not accessible, skipping: ${DEFAULT_PROJECT_PATH}`);
        return;
      }

      await projectRepository.create({
        name: DEFAULT_PROJECT_NAME,
        path: DEFAULT_PROJECT_PATH,
      });

      console.log(`Auto-registered default project: ${DEFAULT_PROJECT_PATH}`);
    } catch (err) {
      console.warn('Failed to auto-register default project:', err);
    }
  }

  /**
   * Ensure all registered projects have a CLAUDE.md file.
   * This runs on every startup to cover projects that were registered
   * before CLAUDE.md auto-creation was added, or via ensureDefaultProject
   * which bypasses ProjectService.createProject.
   */
  private async ensureClaudeMdFiles(): Promise<void> {
    try {
      let projectRepository = getProjectRepository();

      if (!projectRepository) {
        const { getDataDirectory } = await import('../utils');
        const { FileProjectRepository } = await import('../repositories');
        projectRepository = new FileProjectRepository(getDataDirectory());
      }

      const projects = await projectRepository.findAll();

      for (const project of projects) {
        const projectPath = (project as { path: string }).path;
        if (!projectPath || !fs.existsSync(projectPath)) continue;

        const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
        if (!fs.existsSync(claudeMdPath)) {
          try {
            fs.writeFileSync(claudeMdPath, DEFAULT_WORKFLOW_RULES, 'utf-8');
            console.log(`Created CLAUDE.md for project: ${projectPath}`);
          } catch {
            // Silently skip if we can't write (e.g. permission issues)
          }
        }
      }
    } catch {
      // Non-critical, don't break startup
    }
  }

  async stop(): Promise<void> {
    // Shutdown run config processes
    const runProcessManager = getRunProcessManager();

    if (runProcessManager) {
      await runProcessManager.shutdown();
    }

    // Stop all agents
    const agentManager = getAgentManager();

    if (agentManager) {
      await agentManager.stopAllAgents();
    }

    // Close WebSocket server and all connections before closing HTTP server
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }

    return new Promise((resolve, reject) => {
      if (!this.httpServer) {
        resolve();
        return;
      }

      this.httpServer.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        this.httpServer = null;
        resolve();
      });
    });
  }

  private initializeWebSocket(): void {
    const agentManager = getAgentManager();
    const roadmapGenerator = getRoadmapGenerator();
    const shellService = getShellService();
    const ralphLoopService = getRalphLoopService();

    if (!agentManager || !this.httpServer) {
      return;
    }

    const runProcessManager = getRunProcessManager();

    this.wsServer = new DefaultWebSocketServer({
      agentManager,
      roadmapGenerator: roadmapGenerator || undefined,
      authService: undefined,
      shellService: shellService || undefined,
      ralphLoopService: ralphLoopService || undefined,
      runProcessManager: runProcessManager || undefined,
      conversationRepository: getConversationRepository() || undefined,
      projectRepository: getProjectRepository() || undefined,
    });
    this.wsServer.initialize(this.httpServer);

    // Make WebSocket server available to routes
    setWebSocketServer(this.wsServer);
  }

  private logAccessibleUrls(): void {
    const urls = formatAccessibleUrls(this.config.host, this.config.port);

    console.log('\nServer running at:');

    for (const url of urls) {
      console.log(`  ${url}`);
    }

    console.log('');

    // Log shell status
    this.logShellStatus();

    // Display login credentials and QR code
    displayLoginCredentials({
      credentials: this.authService.getCredentials(),
      host: this.config.host,
      port: this.config.port,
    });
  }

  private logShellStatus(): void {
    const { shellEnabled, shellForceEnabled, host } = this.config;
    const isBindingToAllInterfaces = host === '0.0.0.0';

    if (!shellEnabled && isBindingToAllInterfaces) {
      console.log('\x1b[33m⚠ Shell terminal is DISABLED\x1b[0m');
      console.log('  Reason: Server is bound to all interfaces (0.0.0.0)');
      console.log('  To enable: Set SUPERENGINEER_FORCE_SHELL_ENABLED=1 (security risk)');
      console.log('         or: Bind to a specific host (e.g., --host 127.0.0.1)');
      console.log('');
    } else if (shellEnabled && shellForceEnabled && isBindingToAllInterfaces) {
      console.log('\x1b[31m⚠ WARNING: Shell terminal is FORCE-ENABLED on all interfaces!\x1b[0m');
      console.log('  This allows remote shell access. Ensure proper network security.');
      console.log('');
    }
  }

  getAuthService(): AuthService {
    return this.authService;
  }
}
