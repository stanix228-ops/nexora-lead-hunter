import { prisma } from '@nexora/database';
import { env } from '../../config/env';
import { logger } from '../logger';
import net from 'node:net';

function isLocalhostHost(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
}

function portFromUrl(url: string): number | null {
  const m = url.match(/@[^:/]+:(\d+)/);
  return m ? Number(m[1]) : null;
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function tryConnect(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures the PostgreSQL database is reachable. When the DATABASE_URL
 * points at a free localhost port and AUTO_BOOT_EMBEDDED is enabled, an
 * embedded PostgreSQL cluster is booted automatically (dev convenience for
 * machines without Docker). Never used in production.
 */
export async function ensureDatabase(): Promise<void> {
  if (await tryConnect()) return;

  const url = env.DATABASE_URL;
  const canEmbed = isLocalhostHost(url) && env.AUTO_BOOT_EMBEDDED === 'true';

  if (!canEmbed) {
    throw new Error(
      `Database unreachable at ${url}. Start PostgreSQL (docker compose up -d) and check DATABASE_URL.`,
    );
  }

  const port = portFromUrl(url);
  if (port && (await portOpen(port))) {
    logger.info('PostgreSQL already listening on port', { port });
    return;
  }

  logger.info('Booting embedded PostgreSQL for local development…');
  const { bootEmbedded } = (await import('@nexora/dev-db')) as {
    bootEmbedded: (url?: string) => Promise<boolean>;
  };
  const booted = await bootEmbedded(url);
  if (!booted) {
    throw new Error('Embedded PostgreSQL could not be started.');
  }

  if (!(await tryConnect())) {
    throw new Error('Embedded PostgreSQL started but connection failed.');
  }
  logger.info('Embedded PostgreSQL ready.');
}