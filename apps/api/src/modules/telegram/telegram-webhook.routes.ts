import { Router } from 'express';
import type { Request, Response } from 'express';
import { logger } from '../../common/logger';
import { TelegramBotService } from './telegram-bot.service';

export const telegramWebhookRouter: import('express').Router = Router();

/**
 * POST /api/webhooks/telegram/:botIdentifier
 * POST /api/telegram/webhook/:botIdentifier
 * Handles incoming updates from Telegram Bot API webhooks.
 */
async function handleTelegramWebhook(req: Request, res: Response) {
  const botIdentifier = req.params.botIdentifier || req.headers['x-bot-id'] || 'default';
  const secretToken = (req.headers['x-telegram-bot-api-secret-token'] as string) || undefined;
  const update = req.body;

  try {
    const result = await TelegramBotService.processTelegramUpdate(
      String(botIdentifier),
      update,
      secretToken,
    );
    res.json(result);
  } catch (err: any) {
    logger.error(`[TelegramWebhook] Failed to process update: ${err.message}`, {
      botIdentifier,
      error: err.stack,
    });
    // Return 200 OK so Telegram doesn't retry invalid updates continuously
    res.status(200).json({ success: false, error: err.message });
  }
}

telegramWebhookRouter.post('/:botIdentifier', handleTelegramWebhook);
telegramWebhookRouter.post('/', handleTelegramWebhook);
