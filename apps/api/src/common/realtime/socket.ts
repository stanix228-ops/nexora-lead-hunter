import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { env } from '../../config/env';
import { logger } from '../logger';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
}

let io: SocketIOServer | null = null;

export function initRealtime(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    path: '/socket.io',
    cors: {
      origin: env.NODE_ENV === 'development' ? true : env.API_CORS_ORIGIN.split(','),
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket: AuthenticatedSocket, next) => {
    try {
      let token: string | undefined;
      const auth = socket.handshake.auth?.token as string | undefined;
      const cookieHeader = socket.handshake.headers.cookie;
      if (auth) token = auth;
      else if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|;\s*)nexora_token=([^;]+)/);
        if (match) token = decodeURIComponent(match[1]);
      }
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
      socket.userId = payload.sub;
      socket.join(`user:${payload.sub}`);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('socket connected', { userId: socket.userId });
    socket.on('disconnect', () => {
      logger.info('socket disconnected', { userId: socket.userId });
    });
  });

  return io;
}

export function getRealtime() {
  return io;
}

/**
 * Emit a realtime event to a single user's rooms. Events follow the
 * product contract: account.status.changed, lead.created, message.created,
 * conversation.updated, campaign.updated, risk.updated, etc.
 */
export function emitToUser(userId: string, event: string, payload: unknown) {
  if (!io) return;
  try {
    io.to(`user:${userId}`).emit(event, payload);
  } catch (err) {
    logger.warn('realtime emit failed', { event, error: (err as Error).message });
  }
}