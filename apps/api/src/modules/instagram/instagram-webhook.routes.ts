import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@nexora/database';
import { logger } from '../../common/logger';
import { InstagramDirectService } from './instagram-direct.service';

export const instagramWebhookRouter: import('express').Router = Router();

/**
 * GET /api/webhooks/instagram & /api/instagram/webhook
 * Meta Webhook Handshake / Challenge Verification Endpoint
 */
async function handleMetaChallenge(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info('[InstagramWebhook] GET Challenge verification request received', {
    mode,
    tokenMasked: token ? `${String(token).slice(0, 4)}***` : 'missing',
  });

  if (mode !== 'subscribe' || !token) {
    logger.warn('[InstagramWebhook] Verification failed: missing or invalid hub.mode/token');
    res.status(403).send('Forbidden: invalid hub.mode or token');
    return;
  }

  // Find any Instagram account matching verifyToken, or fallback to default
  const account = await prisma.instagramAccount.findFirst({
    where: { verifyToken: String(token) },
  });

  const envVerifyToken = process.env.INSTAGRAM_VERIFY_TOKEN || 'nexora_instagram_webhook_token_2026';

  if (account || token === envVerifyToken) {
    logger.info('[InstagramWebhook] Verification SUCCESS. Responding with challenge token.');
    res.status(200).send(challenge);
    return;
  }

  logger.warn('[InstagramWebhook] Verify token mismatch.');
  res.status(403).send('Forbidden: verify_token mismatch');
}

/**
 * POST /api/webhooks/instagram & /api/instagram/webhook
 * Meta Webhook Inbound Events Dispatcher with HMAC Signature Validation
 */
async function handleWebhookPost(req: Request, res: Response) {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  logger.info('[InstagramWebhook] POST Event received from Meta', {
    object: req.body?.object,
    entryCount: req.body?.entry?.length,
  });

  // Optional HMAC-SHA256 signature verification if configured
  const envAppSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  if (envAppSecret && signature) {
    const isValid = InstagramDirectService.verifyWebhookSignature(rawBody, signature, envAppSecret);
    if (!isValid) {
      logger.warn('[InstagramWebhook] Invalid HMAC-SHA256 signature on incoming payload');
      res.status(401).json({ error: 'Invalid HMAC signature' });
      return;
    }
  }

  try {
    const result = await InstagramDirectService.processInstagramWebhook(req.body);
    logger.info(`[InstagramWebhook] Processed ${result.processed} events. Errors: ${result.errors.length}`);
    res.status(200).json({ status: 'EVENT_RECEIVED', ...result });
  } catch (err: any) {
    logger.error(`[InstagramWebhook] Internal processing error: ${err.message}`, { stack: err.stack });
    res.status(200).json({ status: 'ERROR_RECORDED', error: err.message });
  }
}

instagramWebhookRouter.get('/', handleMetaChallenge);
instagramWebhookRouter.post('/', handleWebhookPost);
