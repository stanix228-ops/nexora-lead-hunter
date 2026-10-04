import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { AiExecutionMode, AccountStatus } from '@nexora/types';
import { asyncHandler, NotFoundError, AppError } from '../../common/errors';
import { emitToUser } from '../../common/realtime/socket';
import { InstagramDirectService } from './instagram-direct.service';
import { PreFlightGuardrailService } from '../ai/pre-flight-guardrail.service';

export const instagramApiRouter: import('express').Router = Router();

const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  username: z.string().min(1).max(100),
  instagramId: z.string().min(1).max(100),
  pageId: z.string().optional(),
  status: z.enum(['ONLINE', 'OFFLINE', 'PAUSED', 'ATTENTION'] as [AccountStatus, ...AccountStatus[]]).optional(),
  accessToken: z.string().optional(),
  verifyToken: z.string().optional(),
  appSecret: z.string().optional(),
  aiExecutionMode: z.enum(['AUTOMATIC_REPLIES', 'MANUAL_APPROVAL', 'FULL_AUTONOMY', 'PAUSED', 'HUMAN_HANDOFF'] as [AiExecutionMode, ...AiExecutionMode[]]).optional(),
  dailyMessageLimit: z.number().int().min(1).max(1000).optional(),
});

const updateAccountSchema = createAccountSchema.partial();

const sendDirectMessageSchema = z.object({
  conversationId: z.string().min(1),
  recipientId: z.string().optional(),
  text: z.string().optional(),
  mediaType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STORY_SHARE', 'STORY_MENTION', 'QUICK_REPLY', 'POSTBACK', 'LOCATION']).optional(),
  mediaUrl: z.string().url().optional(),
  tag: z.enum(['CONFIRMED_EVENT_UPDATE', 'POST_PURCHASE_UPDATE', 'ACCOUNT_UPDATE', 'HUMAN_AGENT']).optional(),
});

const toggleModeSchema = z.object({
  mode: z.enum(['AUTOMATIC_REPLIES', 'MANUAL_APPROVAL', 'FULL_AUTONOMY', 'PAUSED', 'HUMAN_HANDOFF'] as [AiExecutionMode, ...AiExecutionMode[]]),
  reason: z.string().optional(),
});

const manualApprovalSchema = z.object({
  action: z.enum(['APPROVE_AND_SEND', 'REJECT', 'EDIT_AND_SEND']),
  editedText: z.string().optional(),
});

/**
 * GET /api/instagram/accounts
 * Lists all connected Instagram accounts for the current user.
 */
instagramApiRouter.get(
  '/accounts',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const accounts = await prisma.instagramAccount.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            conversations: true,
            leads: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(accounts);
  }),
);

/**
 * POST /api/instagram/accounts
 * Creates or connects a new Instagram account.
 */
instagramApiRouter.post(
  '/accounts',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const body = createAccountSchema.parse(req.body);

    const account = await prisma.instagramAccount.upsert({
      where: {
        userId_username: { userId, username: body.username.replace(/^@/, '') },
      },
      update: {
        name: body.name,
        instagramId: body.instagramId,
        pageId: body.pageId || undefined,
        status: body.status || 'ONLINE',
        accessToken: body.accessToken,
        verifyToken: body.verifyToken || 'nexora_instagram_webhook_token_2026',
        appSecret: body.appSecret,
        aiExecutionMode: body.aiExecutionMode || 'AUTOMATIC_REPLIES',
        dailyMessageLimit: body.dailyMessageLimit ?? 100,
      },
      create: {
        userId,
        name: body.name,
        username: body.username.replace(/^@/, ''),
        instagramId: body.instagramId,
        pageId: body.pageId,
        status: body.status || 'ONLINE',
        accessToken: body.accessToken,
        verifyToken: body.verifyToken || 'nexora_instagram_webhook_token_2026',
        appSecret: body.appSecret,
        aiExecutionMode: body.aiExecutionMode || 'AUTOMATIC_REPLIES',
        dailyMessageLimit: body.dailyMessageLimit ?? 100,
      },
    });

    emitToUser(userId, 'instagram_account.updated', account);
    res.status(201).json(account);
  }),
);

/**
 * PATCH /api/instagram/accounts/:id
 * Updates an Instagram account settings and execution mode.
 */
instagramApiRouter.patch(
  '/accounts/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const body = updateAccountSchema.parse(req.body);

    const existing = await prisma.instagramAccount.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundError('Instagram account not found.');

    const updated = await prisma.instagramAccount.update({
      where: { id },
      data: {
        name: body.name,
        username: body.username ? body.username.replace(/^@/, '') : undefined,
        instagramId: body.instagramId,
        pageId: body.pageId,
        status: body.status,
        accessToken: body.accessToken,
        verifyToken: body.verifyToken,
        appSecret: body.appSecret,
        aiExecutionMode: body.aiExecutionMode,
        dailyMessageLimit: body.dailyMessageLimit,
      },
    });

    emitToUser(userId, 'instagram_account.updated', updated);
    res.json(updated);
  }),
);

/**
 * DELETE /api/instagram/accounts/:id
 * Disconnects an Instagram account.
 */
instagramApiRouter.delete(
  '/accounts/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await prisma.instagramAccount.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundError('Instagram account not found.');

    await prisma.instagramAccount.delete({ where: { id } });
    emitToUser(userId, 'instagram_account.deleted', { id });
    res.json({ success: true, id });
  }),
);

/**
 * POST /api/instagram/send
 * Sends an official direct message or media to an Instagram user.
 */
instagramApiRouter.post(
  '/send',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const body = sendDirectMessageSchema.parse(req.body);

    const result = await InstagramDirectService.sendMessage(userId, body.conversationId, {
      recipientId: body.recipientId as any,
      text: body.text,
      mediaType: body.mediaType as any,
      mediaUrl: body.mediaUrl,
      tag: body.tag as any,
    });

    res.json(result);
  }),
);

/**
 * POST /api/instagram/conversations/:id/toggle-mode
 * Updates the AI execution mode for a specific Instagram conversation.
 */
instagramApiRouter.post(
  '/conversations/:id/toggle-mode',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id: conversationId } = req.params;
    const body = toggleModeSchema.parse(req.body);

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: { instagramAccount: true },
    });

    if (!conversation) throw new NotFoundError('Conversation not found.');

    const isAiPaused = body.mode === 'PAUSED' || body.mode === 'HUMAN_HANDOFF';

    const aiState = await prisma.aiDialogueState.upsert({
      where: { conversationId },
      update: {
        executionMode: body.mode,
        isAiPaused,
        pausedReason: isAiPaused ? (body.reason || `Mode: ${body.mode}`) : null,
      },
      create: {
        conversationId,
        executionMode: body.mode,
        isAiPaused,
        pausedReason: isAiPaused ? (body.reason || `Mode: ${body.mode}`) : null,
      },
    });

    emitToUser(userId, 'ai.mode_updated', {
      conversationId,
      mode: body.mode,
      isAiPaused,
    });

    res.json({
      success: true,
      conversationId,
      mode: body.mode,
      isAiPaused,
      aiState,
    });
  }),
);

/**
 * POST /api/instagram/conversations/:id/takeover
 * Manager manually takes over an Instagram dialogue.
 */
instagramApiRouter.post(
  '/conversations/:id/takeover',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id: conversationId } = req.params;
    const managerName = req.body?.managerName || req.user?.name || 'Менеджер';

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });

    if (!conversation) throw new NotFoundError('Conversation not found.');

    const takeoverAt = new Date();

    const aiState = await prisma.aiDialogueState.upsert({
      where: { conversationId },
      update: {
        isAiPaused: true,
        pausedReason: `Human takeover by ${managerName}`,
        humanTakeoverAt: takeoverAt,
        humanTakeoverBy: managerName,
      },
      create: {
        conversationId,
        isAiPaused: true,
        pausedReason: `Human takeover by ${managerName}`,
        humanTakeoverAt: takeoverAt,
        humanTakeoverBy: managerName,
      },
    });

    emitToUser(userId, 'ai.takeover', {
      conversationId,
      managerName,
      takeoverAt,
    });

    res.json({
      success: true,
      conversationId,
      humanTakeoverAt: takeoverAt.toISOString(),
      humanTakeoverBy: managerName,
      aiState,
    });
  }),
);

/**
 * POST /api/instagram/conversations/:id/handback
 * Manager returns dialogue control to AI Sales Agent.
 */
instagramApiRouter.post(
  '/conversations/:id/handback',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id: conversationId } = req.params;

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });

    if (!conversation) throw new NotFoundError('Conversation not found.');

    const aiState = await prisma.aiDialogueState.upsert({
      where: { conversationId },
      update: {
        isAiPaused: false,
        pausedReason: null,
        humanTakeoverAt: null,
        humanTakeoverBy: null,
      },
      create: {
        conversationId,
        isAiPaused: false,
      },
    });

    emitToUser(userId, 'ai.handback', { conversationId });

    res.json({
      success: true,
      conversationId,
      isAiPaused: false,
      aiState,
    });
  }),
);

/**
 * POST /api/instagram/conversations/:id/manual-approval
 * Approves, edits, or rejects an AI suggested draft in MANUAL_APPROVAL mode.
 */
instagramApiRouter.post(
  '/conversations/:id/manual-approval',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id: conversationId } = req.params;
    const body = manualApprovalSchema.parse(req.body);

    const result = await InstagramDirectService.handleManualApproval(
      userId,
      conversationId,
      body.action,
      body.editedText,
    );

    res.json(result);
  }),
);

/**
 * GET /api/instagram/conversations/:id/pre-flight-status
 * Validates all 5 Pre-Flight checks for an Instagram conversation.
 */
instagramApiRouter.get(
  '/conversations/:id/pre-flight-status',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id: conversationId } = req.params;

    const result = await PreFlightGuardrailService.validateAiDispatch(
      userId,
      conversationId,
      'Здравствуйте! Готовы отправить коммерческое предложение.',
    );

    res.json(result);
  }),
);
