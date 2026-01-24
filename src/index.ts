import { EnvironmentConfigLoader } from './config';
import { ExpressHttpServer } from './server';
import { initializeLogger, getLogger } from './utils';

async function main(): Promise<void> {
  const configLoader = new EnvironmentConfigLoader();
  const config = configLoader.load();

  initializeLogger({ level: config.logLevel });
  const logger = getLogger('main');

  const server = new ExpressHttpServer({ config });

  let isShuttingDown = false;

  const shutdown = (signal: string): void => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.info('Shutting down...', { signal });
    server
      .stop()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await server.start();
  logger.info('Server started', { port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  const logger = getLogger('main');
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Failed to start server', { error: message });
  process.exit(1);
});
