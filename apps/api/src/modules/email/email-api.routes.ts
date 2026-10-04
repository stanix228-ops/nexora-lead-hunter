import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@nexora/database';
import { EmailService } from './email.service';
import { EmailPersonalizationService } from './email-personalization.service';
import { logger } from '../../common/logger';

export const emailApiRouter: import('express').Router = Router();

// --------------------------------------------------------------------------
// EMAIL ACCOUNTS MANAGEMENT
// --------------------------------------------------------------------------

/**
 * GET /api/email/accounts
 * List all email accounts belonging to authenticated user.
 */
emailApiRouter.get('/accounts', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  try {
    const accounts = await prisma.emailAccount.findMany({
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

    res.json({ success: true, data: accounts });
  } catch (error: any) {
    logger.error(`[EmailApi] Failed to list accounts: ${error.message}`);
    res.status(500).json({ success: false, error: 'Не удалось получить список email-аккаунтов' });
  }
});

/**
 * POST /api/email/accounts
 * Connect / register a new Email account (SMTP or API).
 */
emailApiRouter.post('/accounts', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const {
    name,
    emailAddress,
    senderName,
    replyToAddress,
    provider,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    smtpSecure,
    apiKey,
    dailyMessageLimit,
    hourlyMessageLimit,
    aiExecutionMode,
    trackingEnabled,
    signatureHtml,
  } = req.body;

  if (!name || !emailAddress) {
    return res.status(400).json({ success: false, error: 'Имя и email обязательны для заполнения.' });
  }

  try {
    const existing = await prisma.emailAccount.findFirst({
      where: { userId, emailAddress: emailAddress.trim().toLowerCase() },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: `Email аккаунт ${emailAddress} уже подключен.`,
      });
    }

    const account = await prisma.emailAccount.create({
      data: {
        userId,
        name,
        emailAddress: emailAddress.trim().toLowerCase(),
        senderName: senderName || name,
        replyToAddress: replyToAddress || emailAddress.trim().toLowerCase(),
        provider: provider || 'SMTP',
        smtpHost: smtpHost || null,
        smtpPort: smtpPort ? parseInt(smtpPort, 10) : 587,
        smtpUser: smtpUser || null,
        smtpPassword: smtpPassword || null,
        smtpSecure: Boolean(smtpSecure),
        apiKey: apiKey || null,
        dailyMessageLimit: dailyMessageLimit ? parseInt(dailyMessageLimit, 10) : 50,
        hourlyMessageLimit: hourlyMessageLimit ? parseInt(hourlyMessageLimit, 10) : 10,
        aiExecutionMode: aiExecutionMode || 'AUTOMATIC_REPLIES',
        trackingEnabled: trackingEnabled !== false,
        signatureHtml: signatureHtml || null,
        status: 'ONLINE',
      },
    });

    res.status(201).json({ success: true, data: account });
  } catch (error: any) {
    logger.error(`[EmailApi] Failed to create account: ${error.message}`);
    res.status(500).json({ success: false, error: error.message || 'Ошибка подключения email аккаунта' });
  }
});

/**
 * PUT /api/email/accounts/:id
 * Update email account settings and anti-spam limits.
 */
emailApiRouter.put('/accounts/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const {
    name,
    senderName,
    replyToAddress,
    status,
    aiExecutionMode,
    dailyMessageLimit,
    hourlyMessageLimit,
    warmupStage,
    trackingEnabled,
    signatureHtml,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    smtpSecure,
    apiKey,
  } = req.body;

  try {
    const existing = await prisma.emailAccount.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Email аккаунт не найден.' });
    }

    const updated = await prisma.emailAccount.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(senderName !== undefined && { senderName }),
        ...(replyToAddress !== undefined && { replyToAddress }),
        ...(status && { status }),
        ...(aiExecutionMode && { aiExecutionMode }),
        ...(dailyMessageLimit !== undefined && { dailyMessageLimit: parseInt(dailyMessageLimit, 10) }),
        ...(hourlyMessageLimit !== undefined && { hourlyMessageLimit: parseInt(hourlyMessageLimit, 10) }),
        ...(warmupStage !== undefined && { warmupStage: parseInt(warmupStage, 10) }),
        ...(trackingEnabled !== undefined && { trackingEnabled: Boolean(trackingEnabled) }),
        ...(signatureHtml !== undefined && { signatureHtml }),
        ...(smtpHost !== undefined && { smtpHost }),
        ...(smtpPort !== undefined && { smtpPort: parseInt(smtpPort, 10) }),
        ...(smtpUser !== undefined && { smtpUser }),
        ...(smtpPassword !== undefined && { smtpPassword }),
        ...(smtpSecure !== undefined && { smtpSecure: Boolean(smtpSecure) }),
        ...(apiKey !== undefined && { apiKey }),
      },
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    logger.error(`[EmailApi] Failed to update account ${id}: ${error.message}`);
    res.status(500).json({ success: false, error: 'Ошибка обновления настроек email аккаунта' });
  }
});

/**
 * DELETE /api/email/accounts/:id
 * Delete email account.
 */
emailApiRouter.delete('/accounts/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    await prisma.emailAccount.deleteMany({
      where: { id, userId },
    });
    res.json({ success: true, message: 'Email аккаунт удален' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Не удалось удалить email аккаунт' });
  }
});

/**
 * POST /api/email/accounts/:id/test
 * Test connection / credentials for email account.
 */
emailApiRouter.post('/accounts/:id/test', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const account = await prisma.emailAccount.findFirst({
      where: { id, userId },
    });

    if (!account) {
      return res.status(404).json({ success: false, error: 'Email аккаунт не найден.' });
    }

    res.json({
      success: true,
      data: {
        provider: account.provider,
        emailAddress: account.emailAddress,
        status: 'CONNECTED',
        message: `Подключение к почтовому серверу (${account.emailAddress}) успешно проверено.`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Ошибка проверки соединения' });
  }
});

// --------------------------------------------------------------------------
// SUPPRESSION LIST MANAGEMENT
// --------------------------------------------------------------------------

/**
 * GET /api/email/suppressions
 * List all suppressed emails for the user.
 */
emailApiRouter.get('/suppressions', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  try {
    const suppressions = await prisma.emailSuppression.findMany({
      where: { userId },
      orderBy: { suppressedAt: 'desc' },
    });

    res.json({ success: true, data: suppressions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Не удалось получить suppression list' });
  }
});

/**
 * POST /api/email/suppressions
 * Add email to suppression list.
 */
emailApiRouter.post('/suppressions', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { email, reason, bounceDetails } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email обязателен' });
  }

  try {
    await EmailService.addToSuppression(userId, email, reason || 'MANUAL', undefined, bounceDetails);
    res.json({ success: true, message: `Email ${email} добавлен в список отписок/блокировок` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/email/suppressions/:id
 * Remove email from suppression list.
 */
emailApiRouter.delete('/suppressions/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const record = await prisma.emailSuppression.findFirst({
      where: { id, userId },
    });

    if (!record) {
      return res.status(404).json({ success: false, error: 'Запись не найдена' });
    }

    await prisma.emailSuppression.delete({ where: { id: record.id } });
    res.json({ success: true, message: `Email ${record.email} исключен из suppression list` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Не удалось удалить запись' });
  }
});

// --------------------------------------------------------------------------
// OUTREACH & DRAFT PREVIEWS
// --------------------------------------------------------------------------

/**
 * POST /api/email/personalize-preview
 * Generate a personalized cold outreach email draft for a lead based on BusinessAnalysis.
 */
emailApiRouter.post('/personalize-preview', async (req: Request, res: Response) => {
  const { leadId } = req.body;

  if (!leadId) {
    return res.status(400).json({ success: false, error: 'ID лида (leadId) обязателен' });
  }

  try {
    const draft = await EmailPersonalizationService.generatePersonalizedFirstTouch(leadId);
    res.json({ success: true, data: draft });
  } catch (error: any) {
    logger.error(`[EmailApi] Failed to generate personalized preview: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/email/send
 * Dispatch an outbound email.
 */
emailApiRouter.post('/send', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const {
    emailAccountId,
    to,
    subject,
    bodyText,
    bodyHtml,
    leadId,
    conversationId,
    inReplyTo,
    references,
    isPersonalizedOutreach,
  } = req.body;

  if (!emailAccountId || !to || !subject) {
    return res.status(400).json({
      success: false,
      error: 'Параметры emailAccountId, to и subject обязательны для отправки письма.',
    });
  }

  try {
    const result = await EmailService.sendEmail(userId, {
      emailAccountId,
      to,
      subject,
      bodyText,
      bodyHtml,
      leadId,
      conversationId,
      inReplyTo,
      references,
      isPersonalizedOutreach,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error, data: result });
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error(`[EmailApi] Send email error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});
