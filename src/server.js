import env from './config/env.js';
import logger from './shared/utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import createApp from './app.js';

async function start() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`ByteHub API listening on http://localhost:${env.port}${env.apiPrefix}`);
    logger.info(`environment=${env.nodeEnv} base_currency=${env.baseCurrency}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Do not let a hung connection hold the process open forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', reason);
  });
}

start().catch((error) => {
  logger.error('failed to start', error);
  process.exit(1);
});
