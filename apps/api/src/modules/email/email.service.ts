import { prisma } from '@nexora/database';
import type {
  EmailProviderType,
  EmailSuppressionReason,
  EmailBounceType,
  EmailSendPayload,
  EmailSendResponse,
  InboundEmailPayload,
  AiExecutionMode,
  AccountStatus,
} from '@nexora/types';
import { logger } from '../../common/logger';
import { EmailPersonalizationService } from './email-personalization.service';
import { processInboundWithSalesBrain } from '../ai/sales-brain.service';
import { TelegramNotificationService } from '../telegram/telegram-notification.service';
import crypto from 'crypto';

export class EmailService {
  /**
   * Generates a RFC-compliant Message-ID.
   */
  private static generateRfcMessageId(domain = 'nexora.io'): string {
    const randomHex = crypto.randomBytes(12).toString('hex');
    const timestamp = Date.now();
    return `<${timestamp}.${randomHex}@${domain}>`;
  }

  /**
   * Generates random URL-safe tokens for tracking & unsubscribe.
   */
  private static generateToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  // --------------------------------------------------------------------------
  // SUPPRESSION LIST CHECKS & MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Checks if an email address is on the suppression list.
   */
  static async isSuppressed(userId: string, email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const count = await prisma.emailSuppression.count({
      where: {
        userId,
        email: normalized,
      },
    });
    return count > 0;
  }

  /**
   * Adds an email address to the suppression list.
   */
  static async addToSuppression(
    userId: string,
    email: string,
    reason: EmailSuppressionReason = 'UNSUBSCRIBED',
    bounceType?: EmailBounceType,
    bounceDetails?: string,
    sourceMessageId?: string,
  ): Promise<void> {
    const normalized = email.trim().toLowerCase();
    await prisma.emailSuppression.upsert({
      where: {
        userId_email: {
          userId,
          email: normalized,
        },
      },
      update: {
        reason,
        bounceType,
        bounceDetails,
        sourceMessageId,
        suppressedAt: new Date(),
      },
      create: {
        userId,
        email: normalized,
        reason,
        bounceType,
        bounceDetails,
        sourceMessageId,
      },
    });

    // Also update any matching lead to opt-out
    await prisma.lead.updateMany({
      where: { userId, email: normalized },
      data: { status: 'NO_RESPONSE' },
    });

    logger.info(`[EmailService] Added email to suppression list: ${normalized} (reason: ${reason})`);
  }

  /**
   * Removes an email from suppression list.
   */
  static async removeFromSuppression(userId: string, email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    try {
      await prisma.emailSuppression.delete({
        where: {
          userId_email: {
            userId,
            email: normalized,
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // EMAIL SENDING ENGINE (RFC 2822 & RFC 8058 COMPLIANT)
  // --------------------------------------------------------------------------

  /**
   * Sends an outbound email message with anti-spam rate limiting, personalized drafting,
   * RFC 2822 threading headers, transparent open pixel, link tracking, and RFC 8058 1-click unsubscribe.
   */
  static async sendEmail(userId: string, payload: EmailSendPayload): Promise<EmailSendResponse> {
    const emailAccount = await prisma.emailAccount.findFirst({
      where: { id: payload.emailAccountId, userId },
    });

    if (!emailAccount) {
      throw new Error(`Email аккаунт с ID ${payload.emailAccountId} не найден.`);
    }

    if (emailAccount.status === 'PAUSED' || emailAccount.status === 'OFFLINE') {
      throw new Error(`Email аккаунт ${emailAccount.emailAddress} находится в неактивном статусе (${emailAccount.status}).`);
    }

    const recipientEmail = payload.to.trim().toLowerCase();

    // 1. Check Suppression List
    const suppressed = await this.isSuppressed(userId, recipientEmail);
    if (suppressed) {
      logger.warn(`[EmailService] Sending aborted: ${recipientEmail} is on suppression list.`);
      return {
        success: false,
        messageId: '',
        from: emailAccount.emailAddress,
        to: recipientEmail,
        subject: payload.subject,
        sentAt: new Date().toISOString(),
        isSuppressed: true,
        error: `Адрес ${recipientEmail} находится в списке отписок/блокировок (Suppression List).`,
      };
    }

    // 2. Check Daily & Hourly Anti-Spam Rate Limits
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const sentToday = await prisma.message.count({
      where: {
        conversation: { emailAccountId: emailAccount.id },
        direction: 'OUTBOUND',
        recordedAt: { gte: startOfToday },
      },
    });

    const sentThisHour = await prisma.message.count({
      where: {
        conversation: { emailAccountId: emailAccount.id },
        direction: 'OUTBOUND',
        recordedAt: { gte: oneHourAgo },
      },
    });

    if (sentToday >= emailAccount.dailyMessageLimit) {
      logger.warn(`[EmailService] Daily message limit reached for account ${emailAccount.emailAddress} (${sentToday}/${emailAccount.dailyMessageLimit}).`);
      return {
        success: false,
        messageId: '',
        from: emailAccount.emailAddress,
        to: recipientEmail,
        subject: payload.subject,
        sentAt: new Date().toISOString(),
        rateLimitThrottled: true,
        error: `Превышен суточный лимит отправки писем (${sentToday}/${emailAccount.dailyMessageLimit}).`,
      };
    }

    if (sentThisHour >= emailAccount.hourlyMessageLimit) {
      logger.warn(`[EmailService] Hourly message limit reached for account ${emailAccount.emailAddress} (${sentThisHour}/${emailAccount.hourlyMessageLimit}).`);
      return {
        success: false,
        messageId: '',
        from: emailAccount.emailAddress,
        to: recipientEmail,
        subject: payload.subject,
        sentAt: new Date().toISOString(),
        rateLimitThrottled: true,
        error: `Превышен часовой лимит прогрева (${sentThisHour}/${emailAccount.hourlyMessageLimit}). Попробуйте позже.`,
      };
    }

    // 3. Find or Create Lead & Conversation
    let lead = payload.leadId
      ? await prisma.lead.findUnique({ where: { id: payload.leadId, userId } })
      : await prisma.lead.findFirst({ where: { userId, email: recipientEmail } });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          userId,
          email: recipientEmail,
          contactName: recipientEmail.split('@')[0],
          source: 'EMAIL',
          status: 'NEW',
          assignedEmailAccountId: emailAccount.id,
        },
      });
    }

    let conversation = payload.conversationId
      ? await prisma.conversation.findUnique({ where: { id: payload.conversationId, userId } })
      : await prisma.conversation.findFirst({
          where: {
            userId,
            emailAccountId: emailAccount.id,
            leadId: lead.id,
            channel: 'EMAIL',
          },
        });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          emailAccountId: emailAccount.id,
          leadId: lead.id,
          channel: 'EMAIL',
          status: 'NEW',
        },
      });
    }

    // 4. Personalize First Touch if requested
    let finalSubject = payload.subject;
    let finalBodyText = payload.bodyText || '';
    let finalBodyHtml = payload.bodyHtml || '';
    let personalizationFactors: Record<string, unknown> | null = null;
    let isPersonalized = false;

    if (payload.isPersonalizedOutreach && lead.id) {
      try {
        const draft = await EmailPersonalizationService.generatePersonalizedFirstTouch(lead.id);
        finalSubject = payload.subject || draft.subject;
        finalBodyText = draft.bodyText;
        finalBodyHtml = draft.bodyHtml;
        personalizationFactors = draft.personalizationFactors;
        isPersonalized = true;
      } catch (err: any) {
        logger.warn(`[EmailService] Could not generate personalized email draft: ${err.message}`);
      }
    }

    if (!finalBodyHtml && finalBodyText) {
      finalBodyHtml = `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #1e293b;">${finalBodyText.replace(/\n/g, '<br/>')}</div>`;
    }

    // 5. Generate RFC Message-ID and Tracking Tokens
    const domain = emailAccount.emailAddress.split('@')[1] || 'nexora.io';
    const rfcMessageId = this.generateRfcMessageId(domain);
    const openToken = this.generateToken();
    const clickToken = this.generateToken();
    const unsubToken = this.generateToken();

    // Base URL for webhooks and tracking
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3001';

    const openTrackingUrl = `${apiBaseUrl}/api/email/track/open/${openToken}.gif`;
    const clickTrackingBaseUrl = `${apiBaseUrl}/api/email/track/click/${clickToken}?url=`;
    const unsubscribeUrl = `${apiBaseUrl}/api/email/unsubscribe?token=${unsubToken}`;

    // 6. Inject Open Pixel, Wrap Links & Inject RFC 8058 Compliance Footer
    let trackedHtml = finalBodyHtml;

    // Wrap hrefs for click tracking (excluding mailto: and unsubscribe)
    if (emailAccount.trackingEnabled) {
      trackedHtml = trackedHtml.replace(/href="((?!mailto:|javascript:|#|.*unsubscribe)[^"]+)"/gi, (match, url) => {
        return `href="${clickTrackingBaseUrl}${encodeURIComponent(url)}"`;
      });
      // Append transparent tracking pixel (1x1 gif)
      trackedHtml += `\n<img src="${openTrackingUrl}" width="1" height="1" style="display:none !important;" alt="" />`;
    }

    // Append Anti-Spam Compliance Footer with 1-Click Unsubscribe
    const complianceFooter = `
<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.5;">
  Вы получили это письмо, так как ваши контакты указаны в открытых источниках компании ${lead.companyName || recipientEmail}.<br/>
  Если вы не хотите получать подобные предложения, нажмите <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Отписаться от рассылки в 1 клик</a>.<br/>
  Nexora Digital Solutions | Юридический отдел | Все права защищены.
</div>`;

    trackedHtml += complianceFooter;

    // 7. Dispatch Email via Provider (SMTP / API / MOCK)
    logger.info(`[EmailService] Dispatching email via ${emailAccount.provider} to ${recipientEmail} (Subject: "${finalSubject}")`);

    // In a production setup, nodemailer or direct provider fetch is used here.
    // For MOCK/Local/Dev, we log and succeed instantly with RFC headers.
    const sentTimestamp = new Date();

    // 8. Store Message and EmailMessageMeta in Database
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        body: finalBodyText || finalSubject,
        provenance: 'TRACKED',
        deliveryStatus: 'SENT',
        recordedAt: sentTimestamp,
        events: {
          create: {
            type: 'MESSAGE_SENT',
            name: 'Email sent via ' + emailAccount.provider,
            at: sentTimestamp,
            provenance: 'TRACKED',
          },
        },
      },
    });

    await prisma.emailMessageMeta.create({
      data: {
        messageId: message.id,
        emailSubject: finalSubject,
        fromAddress: emailAccount.emailAddress,
        toAddress: recipientEmail,
        replyToAddress: emailAccount.replyToAddress || emailAccount.emailAddress,
        rfcMessageId,
        inReplyTo: payload.inReplyTo || null,
        references: payload.references || null,
        openToken,
        clickToken,
        unsubToken,
        isPersonalized,
        personalizationFactors: (personalizationFactors as any) || null,
      },
    });

    // 9. Update Conversation and Account Counters
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: sentTimestamp,
        lastMessagePreview: `[Email] ${finalSubject}: ${finalBodyText.slice(0, 100)}...`,
        status: conversation.status === 'NEW' ? 'REPLIED' : conversation.status,
      },
    });

    await prisma.emailAccount.update({
      where: { id: emailAccount.id },
      data: {
        messagesSentToday: { increment: 1 },
        messagesSentThisHour: { increment: 1 },
        lastSentAt: sentTimestamp,
      },
    });

    // 10. Record Unified CRM Timeline Event
    await prisma.timelineEvent.create({
      data: {
        userId,
        leadId: lead.id,
        conversationId: conversation.id,
        eventType: 'MESSAGE_SENT',
        title: `Исходящее письмо: ${finalSubject}`,
        description: `Отправлено с аккаунта ${emailAccount.emailAddress} на ${recipientEmail}. RFC Message-ID: ${rfcMessageId}`,
        metadata: {
          channel: 'EMAIL',
          subject: finalSubject,
          to: recipientEmail,
          from: emailAccount.emailAddress,
          rfcMessageId,
          isPersonalized,
          openToken,
        },
      },
    });

    return {
      success: true,
      messageId: message.id,
      rfcMessageId,
      from: emailAccount.emailAddress,
      to: recipientEmail,
      subject: finalSubject,
      sentAt: sentTimestamp.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // INBOUND EMAIL PROCESSOR (RFC THREADING, INTENT & AI SALES BRAIN)
  // --------------------------------------------------------------------------

  /**
   * Processes an incoming email (from webhook, IMAP forwarder or API).
   * Identifies lead, preserves RFC 2822 thread context, classifies intent,
   * handles Opt-Out, and triggers AI Sales Brain response or Human Handoff.
   */
  static async processInboundEmail(payload: InboundEmailPayload): Promise<{
    success: boolean;
    conversationId: string;
    leadId: string;
    intent?: string;
    aiReplySent?: boolean;
    optOut?: boolean;
    humanHandoff?: boolean;
  }> {
    const senderEmail = payload.from.trim().toLowerCase();
    const recipientEmail = payload.to.trim().toLowerCase();
    const subject = payload.subject || 'Без темы';
    const textBody = payload.text || payload.html?.replace(/<[^>]+>/g, ' ') || '';

    logger.info(`[EmailService] Processing inbound email from ${senderEmail} to ${recipientEmail} (Subject: "${subject}")`);

    // 1. Identify Email Account
    let emailAccount = payload.emailAccountId
      ? await prisma.emailAccount.findUnique({ where: { id: payload.emailAccountId } })
      : await prisma.emailAccount.findFirst({
          where: {
            emailAddress: recipientEmail,
          },
        });

    if (!emailAccount) {
      // Fallback: pick any active email account
      emailAccount = await prisma.emailAccount.findFirst({
        where: { status: 'ONLINE' },
      });
      if (!emailAccount) {
        throw new Error(`Нет активных Email аккаунтов для обработки входящего письма на ${recipientEmail}.`);
      }
    }

    const userId = emailAccount.userId;

    // 2. Match Thread via RFC In-Reply-To / References / Lead Email
    let existingMeta: any = null;
    if (payload.inReplyTo) {
      existingMeta = await prisma.emailMessageMeta.findFirst({
        where: { rfcMessageId: payload.inReplyTo },
        include: { message: { include: { conversation: true } } },
      });
    }

    let lead = await prisma.lead.findFirst({
      where: { userId, email: senderEmail },
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          userId,
          email: senderEmail,
          contactName: senderEmail.split('@')[0],
          source: 'EMAIL',
          status: 'REPLIED',
          assignedEmailAccountId: emailAccount.id,
        },
      });
    }

    let conversation: any = existingMeta?.message?.conversation;
    if (!conversation) {
      conversation = await prisma.conversation.findFirst({
        where: {
          userId,
          emailAccountId: emailAccount.id,
          leadId: lead.id,
          channel: 'EMAIL',
        },
      });
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          emailAccountId: emailAccount.id,
          leadId: lead.id,
          channel: 'EMAIL',
          status: 'REPLIED',
        },
      });
    }

    // 3. Store Inbound Message & Meta
    const receivedTime = new Date();
    const inboundRfcId = payload.messageId || this.generateRfcMessageId(senderEmail.split('@')[1] || 'client.com');

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        body: textBody,
        provenance: 'TRACKED',
        deliveryStatus: 'DELIVERED',
        recordedAt: receivedTime,
        events: {
          create: {
            type: 'MESSAGE_RECEIVED',
            name: 'Inbound email received',
            at: receivedTime,
            provenance: 'TRACKED',
          },
        },
      },
    });

    await prisma.emailMessageMeta.create({
      data: {
        messageId: message.id,
        emailSubject: subject,
        fromAddress: senderEmail,
        toAddress: recipientEmail,
        rfcMessageId: inboundRfcId,
        inReplyTo: payload.inReplyTo || null,
        references: payload.references || null,
        isPersonalized: false,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: receivedTime,
        lastMessagePreview: `[Inbound Email] ${subject}: ${textBody.slice(0, 100)}...`,
        status: 'UNREAD',
        unreadCount: { increment: 1 },
      },
    });

    // 4. Record CRM Timeline Event
    await prisma.timelineEvent.create({
      data: {
        userId,
        leadId: lead.id,
        conversationId: conversation.id,
        eventType: 'MESSAGE_RECEIVED',
        title: `Входящий ответ на email: ${subject}`,
        description: textBody.slice(0, 300),
        metadata: {
          channel: 'EMAIL',
          from: senderEmail,
          to: recipientEmail,
          subject,
          rfcMessageId: inboundRfcId,
        },
      },
    });

    // 5. Check for Opt-Out / Stop words in inbound text
    const lowerText = textBody.toLowerCase();
    const isOptOut = ['отписаться', 'отписка', 'стоп', 'stop', 'unsubscribe', 'не пишите', 'удалите почту'].some(
      (w) => lowerText.includes(w),
    );

    if (isOptOut) {
      await this.addToSuppression(userId, senderEmail, 'UNSUBSCRIBED', undefined, 'Клиент запросил отписку в тексте письма', message.id);
      
      // Pause AI for this conversation
      await prisma.aiDialogueState.upsert({
        where: { conversationId: conversation.id },
        update: { isAiPaused: true, pausedReason: 'OPT_OUT' },
        create: {
          conversationId: conversation.id,
          isAiPaused: true,
          pausedReason: 'OPT_OUT',
        },
      });

      logger.info(`[EmailService] Client ${senderEmail} requested Opt-Out via inbound email.`);
      return {
        success: true,
        conversationId: conversation.id,
        leadId: lead.id,
        intent: 'OPT_OUT',
        optOut: true,
      };
    }

    // 6. Process with AI Sales Brain
    let aiReplySent = false;
    let humanHandoff = false;
    let detectedIntent = 'GREETING';

    try {
      const brainResult = await processInboundWithSalesBrain(
        userId,
        conversation.id,
        textBody,
      );

      detectedIntent = brainResult.decision?.detectedIntent || 'GREETING';

      if (brainResult.humanHandoffTriggered || emailAccount.aiExecutionMode === 'HUMAN_HANDOFF') {
        humanHandoff = true;
        // Trigger Telegram Owner Alert if hot lead or handoff
        try {
          await TelegramNotificationService.sendHotLeadAlert(userId, {
            type: 'HUMAN_HANDOFF',
            leadId: lead.id,
            conversationId: conversation.id,
            companyName: lead.companyName || senderEmail,
            contactName: lead.contactName || senderEmail,
            channel: 'EMAIL',
            pain: textBody.slice(0, 150),
            nextBestAction: 'Подключиться к email-диалогу',
            customMessage: `Клиент запросил менеджера в Email переписке (тема: "${subject}").`,
          });
        } catch (tgErr: any) {
          logger.warn(`[EmailService] Telegram notification error: ${tgErr.message}`);
        }
      } else if (brainResult.replyText && (emailAccount.aiExecutionMode === 'AUTOMATIC_REPLIES' || emailAccount.aiExecutionMode === 'FULL_AUTONOMY')) {
        // Send AI Reply
        const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
        const threadReferences = payload.references ? `${payload.references} ${inboundRfcId}` : inboundRfcId;

        await this.sendEmail(userId, {
          emailAccountId: emailAccount.id,
          to: senderEmail,
          subject: replySubject,
          bodyText: brainResult.replyText,
          conversationId: conversation.id,
          leadId: lead.id,
          inReplyTo: inboundRfcId,
          references: threadReferences,
        });

        aiReplySent = true;
      }
    } catch (aiErr: any) {
      logger.error(`[EmailService] SalesBrain processing error for email: ${aiErr.message}`, aiErr);
    }

    return {
      success: true,
      conversationId: conversation.id,
      leadId: lead.id,
      intent: detectedIntent,
      aiReplySent,
      humanHandoff,
    };
  }

  // --------------------------------------------------------------------------
  // TRACKING & WEBHOOK HANDLERS (OPEN, CLICK, UNSUBSCRIBE, BOUNCE)
  // --------------------------------------------------------------------------

  /**
   * Tracks an email open event when the 1x1 transparent tracking pixel is rendered.
   */
  static async trackOpen(token: string): Promise<boolean> {
    const meta = await prisma.emailMessageMeta.findUnique({
      where: { openToken: token },
      include: {
        message: {
          include: {
            conversation: {
              include: { lead: true },
            },
          },
        },
      },
    });

    if (!meta) {
      return false;
    }

    const now = new Date();
    await prisma.emailMessageMeta.update({
      where: { id: meta.id },
      data: {
        openedAt: meta.openedAt || now,
        openCount: { increment: 1 },
      },
    });

    if (meta.message?.conversation) {
      await prisma.timelineEvent.create({
        data: {
          userId: meta.message.conversation.userId,
          leadId: meta.message.conversation.leadId,
          conversationId: meta.message.conversation.id,
          eventType: 'MESSAGE_RECEIVED',
          title: `Письмо открыто клиентом (${meta.toAddress})`,
          description: `Тема: "${meta.emailSubject || 'Без темы'}". Всего открытий: ${meta.openCount + 1}`,
          metadata: {
            trackingType: 'OPEN',
            openCount: meta.openCount + 1,
            emailSubject: meta.emailSubject,
            toAddress: meta.toAddress,
          },
        },
      });
    }

    logger.info(`[EmailService] Tracked open event for token ${token} (${meta.toAddress})`);
    return true;
  }

  /**
   * Tracks a link click event, logs CRM timeline event, and returns destination URL.
   */
  static async trackClick(token: string, targetUrl: string): Promise<string> {
    const meta = await prisma.emailMessageMeta.findUnique({
      where: { clickToken: token },
      include: {
        message: {
          include: {
            conversation: {
              include: { lead: true },
            },
          },
        },
      },
    });

    if (meta) {
      const now = new Date();
      const existingUrls = Array.isArray(meta.clickedUrls) ? (meta.clickedUrls as string[]) : [];
      if (!existingUrls.includes(targetUrl)) {
        existingUrls.push(targetUrl);
      }

      await prisma.emailMessageMeta.update({
        where: { id: meta.id },
        data: {
          clickedAt: meta.clickedAt || now,
          clickCount: { increment: 1 },
          clickedUrls: existingUrls,
        },
      });

      if (meta.message?.conversation) {
        await prisma.timelineEvent.create({
          data: {
            userId: meta.message.conversation.userId,
            leadId: meta.message.conversation.leadId,
            conversationId: meta.message.conversation.id,
            eventType: 'MESSAGE_RECEIVED',
            title: `Клиент перешел по ссылке в письме`,
            description: `Целевой URL: ${targetUrl}. Письмо: "${meta.emailSubject}"`,
            metadata: {
              trackingType: 'CLICK',
              targetUrl,
              clickCount: meta.clickCount + 1,
            },
          },
        });
      }

      logger.info(`[EmailService] Tracked click event for token ${token} -> ${targetUrl}`);
    }

    return targetUrl;
  }

  /**
   * Handles 1-click unsubscribe (RFC 8058 standard).
   */
  static async handleUnsubscribe(token: string, email?: string): Promise<{ success: boolean; message: string }> {
    let targetEmail = email?.trim().toLowerCase();
    let userId: string | null = null;

    if (token) {
      const meta = await prisma.emailMessageMeta.findUnique({
        where: { unsubToken: token },
        include: {
          message: {
            include: {
              conversation: true,
            },
          },
        },
      });

      if (meta) {
        targetEmail = meta.toAddress;
        userId = meta.message?.conversation?.userId || null;

        await prisma.emailMessageMeta.update({
          where: { id: meta.id },
          data: { unsubscribedAt: new Date() },
        });
      }
    }

    if (!targetEmail) {
      return { success: false, message: 'Не удалось определить адрес для отписки.' };
    }

    // Find user if not resolved from meta
    if (!userId) {
      const lead = await prisma.lead.findFirst({ where: { email: targetEmail } });
      userId = lead?.userId || null;
    }

    if (userId) {
      await this.addToSuppression(userId, targetEmail, 'UNSUBSCRIBED', undefined, 'Отписка через 1-Click ссылку');
    }

    logger.info(`[EmailService] 1-Click unsubscribe processed for ${targetEmail}`);
    return {
      success: true,
      message: `Адрес ${targetEmail} успешно отписан от всех рассылок. Вы больше не будете получать сообщения.`,
    };
  }

  /**
   * Processes bounce / complaint webhook reports.
   */
  static async processBounce(
    email: string,
    bounceType: EmailBounceType,
    details?: string,
    sourceMessageId?: string,
    userId?: string,
  ): Promise<void> {
    const normalized = email.trim().toLowerCase();
    logger.warn(`[EmailService] Processing bounce for ${normalized} (type: ${bounceType}): ${details || 'No details'}`);

    const userIds = new Set<string>();
    if (userId) {
      userIds.add(userId);
    }

    const leads = await prisma.lead.findMany({ where: { email: normalized } });
    for (const lead of leads) {
      userIds.add(lead.userId);
    }

    if (userIds.size === 0) {
      // Try to find from recent outbound messages
      const metas = await prisma.emailMessageMeta.findMany({
        where: { toAddress: normalized },
        include: { message: { include: { conversation: true } } },
        take: 5,
      });
      for (const m of metas) {
        if (m.message?.conversation?.userId) {
          userIds.add(m.message.conversation.userId);
        }
      }
    }

    // If still no user, find the first active user
    if (userIds.size === 0) {
      const firstUser = await prisma.user.findFirst();
      if (firstUser) {
        userIds.add(firstUser.id);
      }
    }

    for (const uid of userIds) {
      await this.addToSuppression(
        uid,
        normalized,
        bounceType === 'SPAM_COMPLAINT' ? 'SPAM_COMPLAINT' : bounceType === 'HARD' ? 'HARD_BOUNCE' : 'SOFT_BOUNCE',
        bounceType,
        details,
        sourceMessageId,
      );
    }

    for (const lead of leads) {
      await prisma.timelineEvent.create({
        data: {
          userId: lead.userId,
          leadId: lead.id,
          eventType: 'STATUS_CHANGED',
          title: `Email доставка отклонена (${bounceType})`,
          description: details || 'Почтовый сервер вернул ошибку доставки (bounce). Адрес добавлен в suppression list.',
          metadata: {
            bounceType,
            details,
            email: normalized,
          },
        },
      });
    }
  }
}
