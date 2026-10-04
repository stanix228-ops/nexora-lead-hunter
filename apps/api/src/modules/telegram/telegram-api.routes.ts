import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { AccountStatus, AiExecutionMode } from '@nexora/types';
import { asyncHandler, NotFoundError, AppError } from '../../common/errors';
import { emitToUser } from '../../common/realtime/socket';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramNotificationService } from './telegram-notification.service';
import { PreFlightGuardrailService } from '../ai/pre-flight-guardrail.service';

export const telegramApiRouter: import('express').Router = Router();

const createBotSchema = z.object({
  name: z.string().min(1).max(100),
  botToken: z.string().min(10),
  username: z.string().optional(),
  secretToken: z.string().optional(),
  ownerChatId: z.string().optional(),
  ownerUsername: z.string().optional(),
  isNotificationChannel: z.boolean().optional(),
  notifyOnHotLead: z.boolean().optional(),
  notifyOnProposal: z.boolean().optional(),
  notifyOnHandoff: z.boolean().optional(),
  notifyOnObjection: z.boolean().optional(),
  aiExecutionMode: z.enum(['AUTOMATIC_REPLIES', 'MANUAL_APPROVAL', 'FULL_AUTONOMY', 'PAUSED', 'HUMAN_HANDOFF'] as [AiExecutionMode, ...AiExecutionMode[]]).optional(),
  dailyMessageLimit: z.number().int().min(1).max(2000).optional(),
});

const updateBotSchema = createBotSchema.partial().extend({
  status: z.enum(['ONLINE', 'OFFLINE', 'PAUSED', 'ATTENTION'] as [AccountStatus, ...AccountStatus[]]).optional(),
});

const sendTelegramMessageSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().min(1),
  parseMode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional(),
});

/**
 * GET /api/telegram/bots
 * Lists all Telegram bots configured for the current user.
 */
telegramApiRouter.get(
  '/bots',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const bots = await prisma.telegramBot.findMany({
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
    res.json(bots);
  }),
);

/**
 * POST /api/telegram/bots
 * Validates bot credentials via Telegram getMe and registers bot.
 */
telegramApiRouter.post(
  '/bots',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const body = createBotSchema.parse(req.body);

    // Validate bot token with Telegram getMe API
    const botInfo = await TelegramBotService.getMe(body.botToken);
    if (!botInfo || !botInfo.is_bot) {
      throw new AppError(
        400,
        'Не удалось верифицировать Bot Token через Telegram Bot API. Проверьте правильность токена от @BotFather.',
        'INVALID_BOT_TOKEN',
      );
    }

    const botUsername = (body.username || botInfo.username).replace(/^@/, '');
    const botId = String(botInfo.id);

    // Auto-setup webhook URL if baseUrl is available
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.API_URL || 'http://localhost:3001';
    const webhookUrl = `${baseUrl}/api/webhooks/telegram/${botUsername}`;

    // Upsert TelegramBot
    const bot = await prisma.telegramBot.upsert({
      where: {
        userId_username: { userId, username: botUsername },
      },
      update: {
        name: body.name || botInfo.first_name,
        botId,
        botToken: body.botToken,
        secretToken: body.secretToken,
        status: 'ONLINE',
        webhookUrl,
        ownerChatId: body.ownerChatId || undefined,
        ownerUsername: body.ownerUsername?.replace(/^@/, '') || undefined,
        isNotificationChannel: body.isNotificationChannel ?? Boolean(body.ownerChatId),
        notifyOnHotLead: body.notifyOnHotLead ?? true,
        notifyOnProposal: body.notifyOnProposal ?? true,
        notifyOnHandoff: body.notifyOnHandoff ?? true,
        notifyOnObjection: body.notifyOnObjection ?? false,
        aiExecutionMode: body.aiExecutionMode || 'AUTOMATIC_REPLIES',
        dailyMessageLimit: body.dailyMessageLimit ?? 500,
      },
      create: {
        userId,
        name: body.name || botInfo.first_name,
        username: botUsername,
        botId,
        botToken: body.botToken,
        secretToken: body.secretToken,
        status: 'ONLINE',
        webhookUrl,
        ownerChatId: body.ownerChatId || undefined,
        ownerUsername: body.ownerUsername?.replace(/^@/, '') || undefined,
        isNotificationChannel: body.isNotificationChannel ?? Boolean(body.ownerChatId),
        notifyOnHotLead: body.notifyOnHotLead ?? true,
        notifyOnProposal: body.notifyOnProposal ?? true,
        notifyOnHandoff: body.notifyOnHandoff ?? true,
        notifyOnObjection: body.notifyOnObjection ?? false,
        aiExecutionMode: body.aiExecutionMode || 'AUTOMATIC_REPLIES',
        dailyMessageLimit: body.dailyMessageLimit ?? 500,
      },
    });

    // Register Webhook in Telegram Bot API (if not localhost in production)
    if (!webhookUrl.includes('localhost') && !webhookUrl.includes('127.0.0.1')) {
      await TelegramBotService.setWebhook(body.botToken, webhookUrl, body.secretToken);
    }

    res.status(201).json(bot);
  }),
);

/**
 * PATCH /api/telegram/bots/:id
 * Updates Telegram bot parameters or notification toggles.
 */
telegramApiRouter.patch(
  '/bots/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const body = updateBotSchema.parse(req.body);

    const existing = await prisma.telegramBot.findFirst({
      where: { id, userId },
    });

    if (!existing) throw new NotFoundError('Telegram bot not found.');

    const updated = await prisma.telegramBot.update({
      where: { id },
      data: {
        name: body.name,
        ownerChatId: body.ownerChatId,
        ownerUsername: body.ownerUsername?.replace(/^@/, ''),
        isNotificationChannel: body.isNotificationChannel,
        notifyOnHotLead: body.notifyOnHotLead,
        notifyOnProposal: body.notifyOnProposal,
        notifyOnHandoff: body.notifyOnHandoff,
        notifyOnObjection: body.notifyOnObjection,
        aiExecutionMode: body.aiExecutionMode,
        dailyMessageLimit: body.dailyMessageLimit,
        status: body.status,
      },
    });

    res.json(updated);
  }),
);

/**
 * DELETE /api/telegram/bots/:id
 * Deletes Telegram bot registration and removes webhook.
 */
telegramApiRouter.delete(
  '/bots/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const bot = await prisma.telegramBot.findFirst({
      where: { id, userId },
    });

    if (!bot) throw new NotFoundError('Telegram bot not found.');

    // Unregister webhook from Telegram
    await TelegramBotService.deleteWebhook(bot.botToken).catch(() => undefined);

    await prisma.telegramBot.delete({ where: { id } });

    res.json({ success: true, message: 'Telegram bot deleted successfully.' });
  }),
);

/**
 * POST /api/telegram/bots/:id/test-notification
 * Sends a test HOT LEAD alert to the owner's Telegram chat.
 */
telegramApiRouter.post(
  '/bots/:id/test-notification',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await TelegramNotificationService.sendTestAlert(userId, id);
    if (!result.success) {
      throw new AppError(400, result.error || 'Не удалось отправить тестовое уведомление');
    }

    res.json({
      success: true,
      message: 'Тестовое уведомление 🔥 HOT LEAD успешно отправлено в Telegram владельца!',
    });
  }),
);

/**
 * POST /api/telegram/send
 * Sends an outbound message to a Telegram conversation.
 */
telegramApiRouter.post(
  '/send',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const body = sendTelegramMessageSchema.parse(req.body);

    const conv = await prisma.conversation.findFirst({
      where: { id: body.conversationId, userId },
      include: {
        telegramBot: true,
        lead: true,
      },
    });

    if (!conv) throw new NotFoundError('Conversation not found.');
    if (!conv.telegramBot) {
      throw new AppError(400, 'Диалог не привязан к Telegram-боту');
    }

    const chatId = conv.telegramChatId || conv.lead.telegramChatId;
    if (!chatId) {
      throw new AppError(400, 'У лида отсутствует Telegram Chat ID');
    }

    // Send via Telegram Bot API
    const sendResult = await TelegramBotService.sendMessage(
      conv.telegramBot.botToken,
      chatId,
      body.text,
      { parseMode: body.parseMode || 'HTML' },
    );

    // Save outbound message to CRM
    const message = await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'OUTBOUND',
        body: body.text,
        metaMessageId: String(sendResult.messageId || Date.now()),
        deliveryStatus: 'SENT',
        provenance: 'TRACKED',
        recordedAt: new Date(),
      },
    });

    await prisma.messageEvent.create({
      data: {
        messageId: message.id,
        type: 'MESSAGE_SENT',
        name: 'TELEGRAM_MESSAGE_SENT',
        provenance: 'TRACKED',
      },
    });

    const updatedConv = await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: body.text.slice(0, 100),
      },
      include: {
        lead: true,
        telegramBot: true,
        messages: {
          orderBy: { recordedAt: 'desc' },
          take: 50,
          include: { events: true },
        },
      },
    });

    // Emit Realtime socket update
    emitToUser(userId, 'message.created', {
      ...message,
      conversation: updatedConv,
      lead: updatedConv.lead,
      telegramBot: updatedConv.telegramBot,
    });
    emitToUser(userId, 'conversation.updated', updatedConv);

    res.json({
      success: true,
      message,
      conversation: {
        ...updatedConv,
        messages: [...updatedConv.messages].reverse(),
      },
    });
  }),
);

/**
 * POST /api/telegram/conversations/:id/toggle-mode
 * Toggles AI execution mode for a specific Telegram conversation.
 */
telegramApiRouter.post(
  '/conversations/:id/toggle-mode',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id: conversationId } = req.params;
    const mode = req.body.mode as AiExecutionMode;

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: { telegramBot: true },
    });

    if (!conversation) throw new NotFoundError('Conversation not found.');

    const isAiPaused = mode === 'PAUSED' || mode === 'HUMAN_HANDOFF';

    const aiState = await prisma.aiDialogueState.upsert({
      where: { conversationId },
      update: {
        executionMode: mode,
        isAiPaused,
        pausedReason: isAiPaused ? (req.body.reason || `Mode: ${mode}`) : null,
      },
      create: {
        conversationId,
        executionMode: mode,
        isAiPaused,
        pausedReason: isAiPaused ? (req.body.reason || `Mode: ${mode}`) : null,
      },
    });

    emitToUser(userId, 'ai.mode_updated', {
      conversationId,
      mode,
      isAiPaused,
    });

    res.json({
      success: true,
      conversationId,
      mode,
      isAiPaused,
      aiState,
    });
  }),
);
