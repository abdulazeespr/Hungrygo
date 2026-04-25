import app from './app.js';
import { config } from './config/index.js';
import logger from './config/logger.js';
import prisma from './config/database.js';
import redis from './config/redis.js';
import { startWorkers } from './jobs/worker.js';
import { startCronJobs } from './jobs/cron.js';

startWorkers();
startCronJobs();

const server = app.listen(config.PORT, () => {
  logger.info(`[Hungrygo] Server running on port ${config.PORT} (${config.NODE_ENV})`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const gracefulShutdown = async (signal: string) => {
  logger.info(`[Hungrygo] ${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    try {
      await prisma.$disconnect();
      logger.info('[Hungrygo] Prisma disconnected');

      redis.disconnect();
      logger.info('[Hungrygo] Redis disconnected');

      logger.info('[Hungrygo] Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('[Hungrygo] Error during shutdown', { error });
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('[Hungrygo] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason: Error) => {
  logger.error('[Hungrygo] Unhandled Rejection', { error: reason.message, stack: reason.stack });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('[Hungrygo] Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});
