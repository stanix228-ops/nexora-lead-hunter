import { Router } from 'express';
import type { Request, Response } from 'express';
import { EmailService } from './email.service';
import { logger } from '../../common/logger';

export const emailWebhookRouter: import('express').Router = Router();

// 1x1 Transparent GIF buffer (43 bytes)
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/**
 * GET /api/email/track/open/:token
 * Transparent 1x1 tracking pixel to detect email opens.
 */
emailWebhookRouter.get('/track/open/:token', async (req: Request, res: Response) => {
  const token = req.params.token.replace(/\.gif$/i, '');

  try {
    await EmailService.trackOpen(token);
  } catch (err: any) {
    logger.warn(`[EmailTracking] Open track error for token ${token}: ${err.message}`);
  }

  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': TRANSPARENT_GIF_BUFFER.length.toString(),
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(TRANSPARENT_GIF_BUFFER);
});

/**
 * GET /api/email/track/click/:token
 * Link click tracking endpoint with instant redirection to original destination.
 */
emailWebhookRouter.get('/track/click/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  const targetUrl = (req.query.url as string) || 'https://nexora.io';

  try {
    const finalDestination = await EmailService.trackClick(token, targetUrl);
    res.redirect(302, finalDestination);
  } catch (err: any) {
    logger.warn(`[EmailTracking] Click track error for token ${token}: ${err.message}`);
    res.redirect(302, targetUrl);
  }
});

/**
 * GET /api/email/unsubscribe
 * Web-based 1-click unsubscribe page.
 */
emailWebhookRouter.get('/unsubscribe', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  const email = req.query.email as string;

  try {
    const result = await EmailService.handleUnsubscribe(token, email);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Отписка от рассылки | Nexora</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 40px; max-width: 480px; text-align: center; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #38bdf8; }
    p { font-size: 15px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
    .btn { display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Вы успешно отписаны</h1>
    <p>${result.message}</p>
    <a href="https://nexora.io" class="btn">Перейти на главную Nexora</a>
  </div>
</body>
</html>
`;
    res.send(html);
  } catch (err: any) {
    res.status(500).send('Ошибка при обработке отписки.');
  }
});

/**
 * POST /api/email/unsubscribe
 * RFC 8058 standard One-Click Unsubscribe POST endpoint.
 */
emailWebhookRouter.post('/unsubscribe', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  const email = (req.body?.email || req.query.email) as string;

  try {
    const result = await EmailService.handleUnsubscribe(token, email);
    res.json({ success: result.success, message: result.message });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/webhooks/email/inbound
 * Inbound Email Webhook (handles incoming emails from SMTP relay / Resend / SendGrid / Mailgun).
 */
emailWebhookRouter.post('/webhooks/email/inbound', async (req: Request, res: Response) => {
  try {
    const { from, to, subject, text, html, messageId, inReplyTo, references, emailAccountId } = req.body;

    if (!from || !to) {
      return res.status(400).json({ success: false, error: 'Поля from и to обязательны' });
    }

    const result = await EmailService.processInboundEmail({
      from,
      to,
      subject: subject || '',
      text,
      html,
      messageId,
      inReplyTo,
      references,
      emailAccountId,
    });

    res.json(result);
  } catch (error: any) {
    logger.error(`[EmailWebhook] Inbound webhook error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/webhooks/email/bounce
 * Bounce and Spam Complaint handler.
 */
emailWebhookRouter.post('/webhooks/email/bounce', async (req: Request, res: Response) => {
  try {
    const { email, bounceType, details, sourceMessageId } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email обязателен' });
    }

    await EmailService.processBounce(
      email,
      bounceType || 'HARD',
      details || 'Bounce webhook event',
      sourceMessageId,
    );

    res.json({ success: true, message: `Bounce processed for ${email}` });
  } catch (error: any) {
    logger.error(`[EmailWebhook] Bounce webhook error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});
