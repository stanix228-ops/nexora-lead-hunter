import type { NextFunction, Request, Response } from 'express';
import { allowedOrigins } from '../../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isAllowedOrigin(origin: string): boolean {
  // Same-site (no port distinction) always allowed for the UI host.
  if (allowedOrigins.some((o) => origin.startsWith(o.replace(/:\d+$/, '')))) return true;
  if (allowedOrigins.some((o) => o === origin)) return true;
  return allowedOrigins.includes('*');
}

/** Compare a bare host (no scheme/path) against a configured origin. */
function hostMatches(host: string): boolean {
  return allowedOrigins.some((o) => o.replace(/^https?:\/\//i, '').split('/')[0] === host);
}

/**
 * CSRF protection.
 *
 * Mutating requests either:
 *  - come from an allowed Origin (browser preflight for JSON already
 *    protects us; we double check), and
 *  - when authenticated via the httpOnly cookie, include an
 *    `x-csrf-token` header matching the cookie value (double-submit,
 *    the cookie is unreadable cross-origin so attackers cannot forge it).
 *
 * API clients using a Bearer token are not affected by cookie CSRF and
 * do not need the header.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin ?? req.headers.referer;
  if (origin) {
    const value = (Array.isArray(origin) ? origin[0] : origin) as string;
    const host = value.replace(/^https?:\/\//i, '').split('/')[0];
    const allowed = isAllowedOrigin(value) || hostMatches(host);
    if (!allowed) {
      return res.status(403).json({
        error: { code: 'CSRF_BLOCKED', message: 'Request origin not allowed.' },
      });
    }
  }

  const cookieToken = req.cookies?.nexora_token;
  if (cookieToken) {
    const headerToken = req.headers['x-csrf-token'];
    if (!headerToken || !Array.isArray(headerToken) ? headerToken !== cookieToken : !headerToken.includes(cookieToken)) {
      return res.status(403).json({
        error: { code: 'CSRF_BLOCKED', message: 'Missing or invalid CSRF token.' },
      });
    }
  }

  next();
}