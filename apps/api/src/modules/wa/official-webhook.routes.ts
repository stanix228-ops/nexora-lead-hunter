import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { asyncHandler, AppError, NotFoundError } from '../../common/errors';
import { logger } from '../../common/logger';
import { OfficialWhatsAppService } from './official-wa.service';
import { PreFlightGuardrailService } from '../ai/pre-flight-guardrail.service';

export const officialWebhookRouter: import('express').Router = Router();

const DEFAULT_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'nexora_whatsapp_webhook_token_2026';

// ----------------------------------------------------------------------------
// 1. Meta Webhook Verification (GET /api/webhooks/whatsapp)
// ----------------------------------------------------------------------------
officialWebhookRouter.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info('[OfficialWebhook] Meta challenge verification requested', { mode, token });

  if (mode === 'subscribe' && (token === DEFAULT_VERIFY_TOKEN || process.env.NODE_ENV === 'development')) {
    logger.info('[OfficialWebhook] Meta Webhook verified successfully.');
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: 'Verification token mismatch' });
});

// Also alias on root / for flexible Meta configuration
officialWebhookRouter.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && (token === DEFAULT_VERIFY_TOKEN || process.env.NODE_ENV === 'development')) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: 'Verification token mismatch' });
});

// ----------------------------------------------------------------------------
// 2. Inbound Webhook Event Processing (POST /api/webhooks/whatsapp)
// ----------------------------------------------------------------------------
officialWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const appSecret = process.env.WHATSAPP_APP_SECRET || '';

    // Verify HMAC-SHA256 signature if configured
    if (appSecret && signature) {
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      const isValid = OfficialWhatsAppService.verifyWebhookSignature(rawBody, signature, appSecret);
      if (!isValid) {
        logger.warn('[OfficialWebhook] Signature validation failed for incoming webhook.');
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
    }

    // Immediately respond with 200 OK to prevent Meta retries
    res.status(200).json({ status: 'EVENT_RECEIVED' });

    // Asynchronously process the event payload in background
    setImmediate(async () => {
      try {
        const result = await OfficialWhatsAppService.processMetaWebhook(req.body);
        logger.info(`[OfficialWebhook] Processed ${result.processed} events from Meta webhook.`, {
          errors: result.errors,
        });
      } catch (err: any) {
        logger.error(`[OfficialWebhook] Error in async webhook processing: ${err.message}`);
      }
    });
  } catch (err: any) {
    logger.error(`[OfficialWebhook] Webhook endpoint error: ${err.message}`);
    res.status(500).json({ error: 'Internal webhook error' });
  }
});

officialWebhookRouter.post('/', async (req: Request, res: Response) => {
  // Alias for root path POST
  try {
    res.status(200).json({ status: 'EVENT_RECEIVED' });
    setImmediate(async () => {
      try {
        await OfficialWhatsAppService.processMetaWebhook(req.body);
      } catch (err: any) {
        logger.error(`[OfficialWebhook] Error: ${err.message}`);
      }
    });
  } catch {
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ----------------------------------------------------------------------------
// 3. Authenticated Official API Actions (Configure & Direct Send)
// ----------------------------------------------------------------------------

export const officialWaApiRouter: import('express').Router = Router();

const configureOfficialSchema = z.object({
  accountId: z.string(),
  provider: z.enum(['OFFICIAL_CLOUD_API', 'BSP_360DIALOG', 'BSP_TWILIO', 'WHATSAPP_WEB']).default('OFFICIAL_CLOUD_API'),
  phoneNumberId: z.string().optional(),
  wabaId: z.string().optional(),
  accessToken: z.string().optional(),
  verifyToken: z.string().optional(),
  appSecret: z.string().optional(),
  webhookUrl: z.string().optional(),
});

/** POST /api/wa/official/configure — Save Meta Cloud API credentials */
officialWaApiRouter.post(
  '/configure',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = configureOfficialSchema.parse(req.body);
    const userId = req.user!.id;

    const account = await prisma.whatsAppAccount.findFirst({
      where: { id: parsed.accountId, userId },
      include: { gateway: true },
    });

    if (!account) throw new NotFoundError('WhatsApp account not found.');

    const gateway = await prisma.gatewayConnection.upsert({
      where: { accountId: account.id },
      update: {
        provider: parsed.provider,
        officialPhoneNumberId: parsed.phoneNumberId,
        officialWabaId: parsed.wabaId,
        officialAccessToken: parsed.accessToken,
        officialVerifyToken: parsed.verifyToken || DEFAULT_VERIFY_TOKEN,
        officialAppSecret: parsed.appSecret,
        webhookUrl: parsed.webhookUrl,
        status: parsed.phoneNumberId && parsed.accessToken ? 'CONNECTED' : 'DISCONNECTED',
      },
      create: {
        accountId: account.id,
        provider: parsed.provider,
        officialPhoneNumberId: parsed.phoneNumberId,
        officialWabaId: parsed.wabaId,
        officialAccessToken: parsed.accessToken,
        officialVerifyToken: parsed.verifyToken || DEFAULT_VERIFY_TOKEN,
        officialAppSecret: parsed.appSecret,
        webhookUrl: parsed.webhookUrl,
        status: parsed.phoneNumberId && parsed.accessToken ? 'CONNECTED' : 'DISCONNECTED',
      },
    });

    // Update account status
    if (parsed.phoneNumberId && parsed.accessToken) {
      await prisma.whatsAppAccount.update({
        where: { id: account.id },
        data: { status: 'ONLINE' },
      });
    }

    res.json({
      success: true,
      message: 'Official WhatsApp Cloud API configuration saved.',
      gateway,
    });
  }),
);

const sendOfficialSchema = z.object({
  conversationId: z.string(),
  body: z.string().optional(),
  mediaType: z.enum(['IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'STICKER', 'LOCATION', 'CONTACT', 'INTERACTIVE']).optional(),
  mediaUrl: z.string().optional(),
  mediaCaption: z.string().optional(),
  mediaFileName: z.string().optional(),
  templateName: z.string().optional(),
  templateLanguage: z.string().optional(),
  templateComponents: z.array(z.record(z.any())).optional(),
  skipPreFlightChecks: z.boolean().optional(),
});

/** POST /api/wa/official/send — Send official message with pre-flight check */
officialWaApiRouter.post(
  '/send',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = sendOfficialSchema.parse(req.body);
    const userId = req.user!.id;

    const messageText = parsed.body || parsed.mediaCaption || '';

    // Run Pre-Flight Guardrail checks unless explicitly bypassed by human agent
    if (!parsed.skipPreFlightChecks) {
      const preFlight = await PreFlightGuardrailService.validateAiDispatch(
        userId,
        parsed.conversationId,
        messageText,
      );

      if (!preFlight.allowed) {
        throw new AppError(
          400,
          `Отправка заблокирована проверкой безопасности: ${preFlight.blockedReason}`,
          'PRE_FLIGHT_GUARDRAIL_BLOCKED',
        );
      }
    }

    const result = await OfficialWhatsAppService.sendMessage(userId, parsed.conversationId, {
      body: parsed.body,
      mediaType: parsed.mediaType,
      mediaUrl: parsed.mediaUrl,
      mediaCaption: parsed.mediaCaption,
      mediaFileName: parsed.mediaFileName,
      templateName: parsed.templateName,
      templateLanguage: parsed.templateLanguage,
      templateComponents: parsed.templateComponents,
    });

    res.json(result);
  }),
);
