import express, { Application, Request, Response } from 'express';
import { Server, createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { AppConfig } from '../config';
import { createApiRouter, getAgentManager, getRoadmapGenerator } from '../routes';
import { DefaultWebSocketServer, ProjectWebSocketServer } from '../websocket';
import { createErrorHandler, formatAccessibleUrls } from '../utils';

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
  onShutdown?: () => void;
}

export function createExpressApp(options: ExpressAppOptions = {}): Application {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const publicPath = path.join(__dirname, '../../public');

  app.get('/', (_req: Request, res: Response) => {
    serveIndexWithCacheBusting(publicPath, res);
  });

  app.use(express.static(publicPath));

  app.use('/api', createApiRouter({
    maxConcurrentAgents: options.maxConcurrentAgents,
    devMode: options.devMode,
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
  private shutdownCallback?: () => void;

  constructor(deps: ServerDependencies) {
    this.config = deps.config;
    this.app = createExpressApp({
      maxConcurrentAgents: this.config.maxConcurrentAgents,
      devMode: this.config.devMode,
      onShutdown: () => this.triggerShutdown(),
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

  async stop(): Promise<void> {
    // Stop all agents first
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

    if (!agentManager || !this.httpServer) {
      return;
    }

    this.wsServer = new DefaultWebSocketServer({
      agentManager,
      roadmapGenerator: roadmapGenerator || undefined,
    });
    this.wsServer.initialize(this.httpServer);
  }

  private logAccessibleUrls(): void {
    const urls = formatAccessibleUrls(this.config.host, this.config.port);

    console.log('\nServer running at:');

    for (const url of urls) {
      console.log(`  ${url}`);
    }

    console.log('');
  }
}
