import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { env, allowedOrigins } from './config/env';
import { logger } from './common/logger';
import { errorHandler, notFoundHandler } from './common/errors';
import { swaggerSpec } from './common/swagger';
import {
  apiLimiter,
  authLimiter,
  requestLogger,
  securityHeaders,
} from './common/security/middleware';
import { csrfProtection } from './common/security/csrf';
import { authorize, optionalAuth } from './common/security/auth';

import { authRouter } from './modules/auth/auth.routes';
import { whatsappRouter } from './modules/whatsapp/whatsapp.routes';
import { leadsRouter } from './modules/leads/leads.routes';
import { campaignsRouter } from './modules/campaigns/campaigns.routes';
import { conversationRouter, messageRouter } from './modules/conversations/conversations.routes';
import { riskRouter } from './modules/risk/risk.routes';
import { activityRouter } from './modules/activity/activity.routes';
import { importRouter } from './modules/import/import.routes';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { waRouter } from './modules/wa/wa.routes';
import { parserRouter } from './modules/parser/parser.routes';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  // Swagger UI needs its own scripts/styles, so it must run before the
  // strict security headers (CSP default-src 'none' blocks them).
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec as never));

  app.use(helmet());
  app.use(securityHeaders());
  app.use(requestLogger);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.NODE_ENV === 'development' || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // CSRF double-submit protection (skips GET/HEAD/OPTIONS and Bearer flows).
  app.use(csrfProtection);

  // API-wide rate limit; stricter on auth endpoints.
  app.use('/api', apiLimiter());
  app.use('/api/auth', authLimiter());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'nexora-api', uptime: process.uptime() });
  });

  // Public-ish routes (self-contained auth).
  app.use('/api/auth', authRouter);

  // Everything below requires an authenticated user.
  app.use(optionalAuth);
  app.use('/api', authorize);

  app.use('/api/accounts', whatsappRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/conversations', conversationRouter);
  app.use('/api/messages', messageRouter);
  app.use('/api/risk', riskRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/import', importRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/wa', waRouter);
  app.use('/api/parser', parserRouter);

  app.use(notFoundHandler);
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON body.' } });
      return;
    }
    errorHandler(err, req, res, _next);
  });

  logger.info('Express app created');
  return app;
}