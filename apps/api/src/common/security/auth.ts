import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { logger } from '../logger';

const TOKEN_COOKIE = 'nexora_token';

export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

export function signToken(user: { id: string; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: env.SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
}

export function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.cookies?.[TOKEN_COOKIE];
  if (cookie) return String(cookie);
  if (typeof req.query?.token === 'string' && req.query.token.trim()) return req.query.token.trim();
  return null;
}

function verify(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Optional auth — attaches req.user when a valid token is present. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    const payload = verify(token);
    if (payload) {
      req.user = {
        id: payload.sub,
        email: payload.email,
        name: null,
        isAdmin: false,
        isDemo: false,
      };
    }
  }
  next();
}

export const TOKEN_COOKIE_NAME = TOKEN_COOKIE;

export async function authorize(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    const payload = verify(token);
    if (payload) {
      req.user = {
        id: payload.sub,
        email: payload.email,
        name: null,
        isAdmin: false,
        isDemo: false,
      };
      return next();
    }
  }

  // Development mode seamless auto-auth fallback
  if (env.NODE_ENV === 'development') {
    try {
      const { prisma } = await import('@nexora/database');
      const admin = (await prisma.user.findFirst({ where: { isAdmin: true } })) || (await prisma.user.findFirst());
      if (admin) {
        req.user = {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          isAdmin: admin.isAdmin,
          isDemo: admin.isDemo,
        };
        return next();
      }
    } catch {
      /* ignore */
    }
  }

  return res.status(401).json({
    error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
  });
}