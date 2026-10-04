import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@nexora/database';
import type { AiPermission, AiPermissionsConfig } from '@nexora/types';
import { ForbiddenError, UnauthorizedError } from '../errors';
import { logger } from '../logger';

export const ALL_AI_PERMISSIONS: AiPermission[] = [
  'AI_READ',
  'AI_ANALYZE',
  'AI_CONTACT',
  'AI_PROPOSE',
  'AI_NEGOTIATE',
  'AI_FOLLOWUP',
  'AI_HANDOFF',
];

export const DEFAULT_AI_PERMISSIONS: AiPermissionsConfig = {
  AI_READ: true,
  AI_ANALYZE: true,
  AI_CONTACT: true,
  AI_PROPOSE: true,
  AI_NEGOTIATE: true,
  AI_FOLLOWUP: true,
  AI_HANDOFF: true,
};

// In-memory / cache store for custom permission configurations per user
const userPermissionOverrides = new Map<string, Partial<AiPermissionsConfig>>();

/**
 * Retrieves effective AI permissions for a user.
 */
export async function getAiPermissions(userId: string): Promise<AiPermissionsConfig> {
  const overrides = userPermissionOverrides.get(userId) || {};

  // Check if user has settings in DB
  try {
    const aiConfig = await prisma.aiAgentConfig.findUnique({
      where: { userId },
    });
    if (aiConfig) {
      // Map aiAgentConfig flags to permissions if present
      return {
        AI_READ: overrides.AI_READ ?? true,
        AI_ANALYZE: overrides.AI_ANALYZE ?? (aiConfig.mode !== 'OFF'),
        AI_CONTACT: overrides.AI_CONTACT ?? (aiConfig.mode === 'AUTONOMOUS'),
        AI_PROPOSE: overrides.AI_PROPOSE ?? true,
        AI_NEGOTIATE: overrides.AI_NEGOTIATE ?? (aiConfig.mode !== 'OFF'),
        AI_FOLLOWUP: overrides.AI_FOLLOWUP ?? (aiConfig.mode !== 'OFF'),
        AI_HANDOFF: overrides.AI_HANDOFF ?? true,
      };
    }
  } catch {
    // fallback to defaults with overrides
  }

  return {
    ...DEFAULT_AI_PERMISSIONS,
    ...overrides,
  };
}

/**
 * Updates AI permissions for a specific user.
 */
export async function setAiPermissions(
  userId: string,
  newPermissions: Partial<AiPermissionsConfig>,
): Promise<AiPermissionsConfig> {
  const current = await getAiPermissions(userId);
  const updated: AiPermissionsConfig = {
    ...current,
    ...newPermissions,
  };

  userPermissionOverrides.set(userId, updated);

  logger.info('AI permissions updated for user', { userId, updated });
  return updated;
}

/**
 * Programmatic check if an AI action is permitted for a user.
 */
export async function checkAiPermission(userId: string, permission: AiPermission): Promise<boolean> {
  const permissions = await getAiPermissions(userId);
  return Boolean(permissions[permission]);
}

/**
 * Asserts that an AI permission is granted. Throws ForbiddenError if denied.
 */
export async function assertAiPermission(
  userId: string,
  permission: AiPermission,
  actionContext?: string,
): Promise<void> {
  const hasPerm = await checkAiPermission(userId, permission);
  if (!hasPerm) {
    const errorMsg = `Действие запрещено политикой безопасности AI. Отсутствует разрешение [${permission}]${
      actionContext ? ` для контекста: ${actionContext}` : ''
    }.`;
    
    logger.warn('AI permission denied', { userId, permission, actionContext });

    // Log security violation into aiAuditLog
    try {
      await prisma.aiAuditLog.create({
        data: {
          userId,
          actionType: 'GUARDRAIL_TRIGGERED',
          executionTimeMs: 0,
          success: false,
          errorMessage: errorMsg,
          inputSnapshot: { permission, actionContext },
        },
      });
    } catch {
      /* ignore */
    }

    throw new ForbiddenError(errorMsg);
  }
}

/**
 * Express Middleware to enforce AI Permission on HTTP routes.
 */
export function requireAiPermission(permission: AiPermission) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      return next(new UnauthorizedError('Требуется авторизация'));
    }

    try {
      await assertAiPermission(userId, permission, `${req.method} ${req.originalUrl}`);
      next();
    } catch (err) {
      next(err);
    }
  };
}
