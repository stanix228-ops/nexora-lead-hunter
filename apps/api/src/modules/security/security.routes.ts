import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/errors';
import { SecurityAuditService } from '../../common/security/security-audit.service';
import { getAiPermissions, setAiPermissions } from '../../common/security/permissions';
import { PromptFirewall } from '../../common/security/prompt-firewall';
import type { AiPermissionsConfig } from '@nexora/types';

export const securityRouter: import('express').Router = Router();

/**
 * GET /api/security/audit
 * Runs a comprehensive security audit of the AI Sales system.
 */
securityRouter.get(
  '/audit',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const report = await SecurityAuditService.runFullAudit(userId);
    res.json(report);
  }),
);

/**
 * GET /api/security/permissions
 * Retrieves the AI permissions matrix for the current user.
 */
securityRouter.get(
  '/permissions',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const permissions = await getAiPermissions(userId);
    res.json({ permissions });
  }),
);

/**
 * PUT /api/security/permissions
 * Updates granular AI permissions for the current user.
 */
securityRouter.put(
  '/permissions',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const updates = (req.body?.permissions || req.body) as Partial<AiPermissionsConfig>;
    const permissions = await setAiPermissions(userId, updates);
    res.json({ success: true, permissions });
  }),
);

/**
 * POST /api/security/test-prompt
 * Inspects a prompt or text payload against the PromptFirewall.
 */
securityRouter.post(
  '/test-prompt',
  asyncHandler(async (req: Request, res: Response) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const incomingCheck = PromptFirewall.inspectIncomingPrompt(text);
    const outgoingCheck = PromptFirewall.sanitizeOutgoingReply(text);

    res.json({
      incomingCheck,
      outgoingCheck,
    });
  }),
);
