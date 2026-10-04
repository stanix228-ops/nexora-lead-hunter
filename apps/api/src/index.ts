import http from 'node:http';
import { prisma } from '@nexora/database';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './common/logger';
import { ensureDatabase } from './common/database/bootstrap';
import { initRealtime } from './common/realtime/socket';
import { resumeWaSessions } from './modules/wa/wa.manager';

async function main() {
  await ensureDatabase();

  const app = createApp();
  const server = http.createServer(app);

  initRealtime(server);
  void resumeWaSessions().catch((err) => {
    logger.warn('WA session resume failed', { error: (err as Error).message });
  });

  server.listen(env.PORT, () => {
    logger.info(`Nexora API listening on :${env.PORT}`);

    if (env.NODE_ENV === 'development') {
      logger.info('Dev mode: realtime via Socket.IO, queue in-memory (no Redis)');
    }
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down…`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  const errorObj = err instanceof Error ? err : new Error(String(err));
  logger.error('Fatal startup error', { error: errorObj.message, stack: errorObj.stack });
  process.exit(1);
});