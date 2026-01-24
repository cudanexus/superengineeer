import express, { Application } from 'express';
import { Server, createServer } from 'http';
import path from 'path';
import { AppConfig } from '../config';
import { createApiRouter, getAgentManager, getRoadmapGenerator } from '../routes';
import { DefaultWebSocketServer, ProjectWebSocketServer } from '../websocket';
import { createErrorHandler } from '../utils';

export interface HttpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ServerDependencies {
  config: AppConfig;
}

export interface ExpressAppOptions {
  maxConcurrentAgents?: number;
}

export function createExpressApp(options: ExpressAppOptions = {}): Application {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const publicPath = path.join(__dirname, '../../public');
  app.use(express.static(publicPath));

  app.use('/api', createApiRouter({
    maxConcurrentAgents: options.maxConcurrentAgents,
  }));

  app.use(createErrorHandler());

  return app;
}

export class ExpressHttpServer implements HttpServer {
  private httpServer: Server | null = null;
  private wsServer: ProjectWebSocketServer | null = null;
  private readonly app: Application;
  private readonly config: AppConfig;

  constructor(deps: ServerDependencies) {
    this.config = deps.config;
    this.app = createExpressApp({
      maxConcurrentAgents: this.config.maxConcurrentAgents,
    });
  }

  async start(): Promise<void> {
    // Cleanup any orphan processes from previous runs
    await this.cleanupOrphanProcesses();

    return new Promise((resolve) => {
      this.httpServer = createServer(this.app);
      this.initializeWebSocket();

      this.httpServer.listen(this.config.port, this.config.host, () => {
        console.log(`Server running at http://${this.config.host}:${this.config.port}`);
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

  async stop(): Promise<void> {
    // Stop all agents first
    const agentManager = getAgentManager();

    if (agentManager) {
      await agentManager.stopAllAgents();
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
        this.wsServer = null;
        resolve();
      });
    });
  }

  private initializeWebSocket(): void {
    const agentManager = getAgentManager();
    const roadmapGenerator = getRoadmapGenerator();

    if (!agentManager || !this.httpServer) {
      return;
    }

    this.wsServer = new DefaultWebSocketServer({
      agentManager,
      roadmapGenerator: roadmapGenerator || undefined,
    });
    this.wsServer.initialize(this.httpServer);
  }
}
