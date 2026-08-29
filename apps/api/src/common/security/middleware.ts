import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { logger } from '../logger';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  res.on('finish', () => {
    logger.http(req.method, req.originalUrl, res.statusCode, Date.now() - started);
  });
  next();
}

export function apiLimiter() {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.NODE_ENV === 'development' ? 5000 : env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      env.NODE_ENV === 'development' ||
      req.originalUrl.startsWith('/api/wa/') ||
      req.originalUrl.startsWith('/api/parser/'),
    handler: (req: Request, res: Response) => {
      logger.warn('rate limited', { ip: req.ip, url: req.originalUrl });
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Слишком много запросов. Пожалуйста, подождите немного.',
        },
      });
    },
  });
}

export function authLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.NODE_ENV === 'development' ? 1000 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'development',
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Слишком много попыток авторизации. Попробуйте позже.',
        },
      });
    },
  });
}

export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
}