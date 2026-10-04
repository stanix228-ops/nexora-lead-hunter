import crypto from 'node:crypto';
import { prisma } from '@nexora/database';
import type {
  OfficialWhatsAppConfig,
  OfficialWhatsAppSendPayload,
  OfficialWhatsAppSendResponse,
  DeliveryStatus,
  OfficialMediaType,
} from '@nexora/types';
import { logger } from '../../common/logger';
import { recordActivity } from '../../common/activity/recorder';
import { recordTimelineEvent } from '../crm/crm.service';
import { emitToUser } from '../../common/realtime/socket';
import { maskPhone, buildWaLink } from '@nexora/utils';
import { PreFlightGuardrailService } from '../ai/pre-flight-guardrail.service';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class OfficialWhatsAppService {
  /**
   * Verifies the HMAC-SHA256 signature sent in the X-Hub-Signature-256 header.
   */
  static verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
    appSecret: string,
  ): boolean {
    if (!signatureHeader || !appSecret) return true; // If secret not set in dev, pass

    try {
      const parts = signatureHeader.split('sha256=');
      const signature = parts[1];
      if (!signature) return false;

      const expected = crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch (err: any) {
      logger.error(`[OfficialWhatsApp] Signature verification failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Sends an outbound message through Meta WhatsApp Cloud API / Authorized BSP.
   */
  static async sendMessage(
    userId: string,
    conversationId: string,
    payload: OfficialWhatsAppSendPayload,
  ): Promise<OfficialWhatsAppSendResponse> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        lead: true,
        account: {
          include: { gateway: true },
        },
      },
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found.`);
    }

    const recipientPhone = payload.to || conversation.lead.phone;
    if (!recipientPhone) {
      throw new Error(`No phone number available for conversation ${conversationId}.`);
    }

    // Clean phone to digits without '+' (e.g. 77011234567)
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const account = conversation.account;
    const gateway = account?.gateway;

    const phoneNumberId = gateway?.officialPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = gateway?.officialAccessToken || process.env.WHATSAPP_ACCESS_TOKEN;

    const isLiveMetaApi = Boolean(
      phoneNumberId &&
      accessToken &&
      !accessToken.includes('Mock') &&
      !accessToken.includes('Test') &&
      (process.env.NODE_ENV === 'production' || process.env.META_API_LIVE === 'true'),
    );

    let metaMessageId: string = `wamid.HBgL${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let rawApiResponse: any = null;

    if (isLiveMetaApi) {
      try {
        // Build Meta Graph API request body
        let metaBody: any = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
        };

        if (payload.templateName) {
          // Template Message
          metaBody.type = 'template';
          metaBody.template = {
            name: payload.templateName,
            language: { code: payload.templateLanguage || 'ru' },
            components: payload.templateComponents || [],
          };
        } else if (payload.mediaType && payload.mediaUrl) {
          // Media Message (image, document, audio, video, sticker)
          const typeLower = payload.mediaType.toLowerCase();
          metaBody.type = typeLower;
          metaBody[typeLower] = {
            link: payload.mediaUrl,
            caption: payload.mediaCaption || payload.body || undefined,
            filename: payload.mediaFileName || undefined,
          };
        } else {
          // Standard Text Message
          metaBody.type = 'text';
          metaBody.text = {
            preview_url: true,
            body: payload.body || '',
          };
        }

        const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metaBody),
        });

        const json = await res.json();
        rawApiResponse = json;

        if (!res.ok) {
          throw new Error(
            `Meta Graph API error ${res.status}: ${json.error?.message || JSON.stringify(json)}`,
          );
        }

        if (json.messages && json.messages[0]?.id) {
          metaMessageId = json.messages[0].id;
        }
      } catch (err: any) {
        logger.error(`[OfficialWhatsApp] Failed to dispatch via Meta API: ${err.message}`, {
          conversationId,
        });
        throw err;
      }
    } else {
      logger.info(
        `[OfficialWhatsApp] Simulated dispatch (no live Meta credentials configured, using local mock gateway wamid)`,
        { cleanPhone, body: payload.body?.slice(0, 60) },
      );
    }

    // Save outbound message in CRM Database
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        body: payload.body || payload.mediaCaption || `[${payload.mediaType || 'MEDIA'}]`,
        mediaType: payload.mediaType || null,
        mediaUrl: payload.mediaUrl || null,
        mediaCaption: payload.mediaCaption || null,
        mediaFileName: payload.mediaFileName || null,
        metaMessageId,
        deliveryStatus: 'SENT',
        provenance: 'TRACKED',
        recordedAt: new Date(),
        opId: metaMessageId,
      },
    });

    await prisma.messageEvent.create({
      data: {
        messageId: message.id,
        type: 'MESSAGE_SENT',
        name: 'MESSAGE_SENT',
        provenance: 'TRACKED',
      },
    });

    // Update conversation metadata
    const updatedConv = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: (payload.body || payload.mediaCaption || '[Медиа]').slice(0, 120),
      },
      include: {
        lead: true,
        account: { select: { id: true, name: true, phoneMasked: true } },
      },
    });

    // Activity & Timeline Event
    await recordActivity({
      userId,
      action: 'MESSAGE_RECORDED',
      entity: 'MESSAGE',
      entityId: message.id,
      metadata: {
        conversationId,
        direction: 'OUTBOUND',
        metaMessageId,
        viaOfficialApi: true,
      },
    });

    // Realtime UI Notification
    emitToUser(userId, 'message.created', {
      ...message,
      conversation: updatedConv,
      lead: updatedConv.lead,
      account: account ? { id: account.id, name: account.name } : null,
    });
    emitToUser(userId, 'conversation.updated', updatedConv);

    return {
      success: true,
      metaMessageId,
      status: 'SENT',
      sentAt: new Date().toISOString(),
      rawResponse: rawApiResponse,
    };
  }

  /**
   * Parses and processes an official WhatsApp Webhook payload from Meta.
   */
  static async processMetaWebhook(payload: any): Promise<{ processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;

    if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
      return { processed: 0, errors: ['Invalid Meta Webhook payload format'] };
    }

    for (const entry of payload.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;

        const metadata = value.metadata;
        const phoneNumberId = metadata?.phone_number_id;
        const displayPhoneNumber = metadata?.display_phone_number;

        // Find the WhatsAppAccount associated with this phone number or ID (exact officialPhoneNumberId match first)
        let account = phoneNumberId
          ? await prisma.whatsAppAccount.findFirst({
              where: { gateway: { officialPhoneNumberId: phoneNumberId } },
              include: { user: true, gateway: true },
            })
          : null;

        if (!account && displayPhoneNumber) {
          account = await prisma.whatsAppAccount.findFirst({
            where: { phone: { contains: displayPhoneNumber.replace(/\D/g, '') } },
            include: { user: true, gateway: true },
          });
        }

        // Fallback: pick the first active account if only one exists in dev
        if (!account) {
          account = await prisma.whatsAppAccount.findFirst({
            where: { status: { not: 'OFFLINE' } },
            include: { user: true, gateway: true },
          });
        }

        if (!account) {
          logger.warn(
            `[OfficialWhatsApp] Webhook received but no matching WhatsAppAccount found for phoneNumberId: ${phoneNumberId}`,
          );
          continue;
        }

        const userId = account.userId;

        // 1. Process Message Status Updates (sent, delivered, read, failed)
        const statuses = value.statuses || [];
        for (const statusItem of statuses) {
          try {
            await this.handleStatusUpdate(userId, statusItem);
            processed++;
          } catch (stErr: any) {
            errors.push(`Status update error: ${stErr.message}`);
          }
        }

        // 2. Process Inbound Messages (text, media, contacts, locations)
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const msg of messages) {
          try {
            const senderWaId = msg.from; // e.g. "77019998877"
            const contactObj = contacts.find((c: any) => c.wa_id === senderWaId);
            const profileName = contactObj?.profile?.name || null;

            await this.handleInboundOfficialMessage(userId, account.id, msg, profileName);
            processed++;
          } catch (msgErr: any) {
            logger.error(`[OfficialWhatsApp] Error processing inbound message: ${msgErr.message}`);
            errors.push(`Message error: ${msgErr.message}`);
          }
        }
      }
    }

    return { processed, errors };
  }

  /**
   * Handles delivery status updates (sent -> delivered -> read / failed).
   */
  private static async handleStatusUpdate(userId: string, statusItem: any) {
    const metaMessageId = statusItem.id;
    const statusStr: string = (statusItem.status || '').toUpperCase(); // SENT, DELIVERED, READ, FAILED
    const timestamp = statusItem.timestamp
      ? new Date(Number.parseInt(statusItem.timestamp, 10) * 1000)
      : new Date();

    const existingMessage = await prisma.message.findFirst({
      where: {
        OR: [{ metaMessageId }, { opId: metaMessageId }],
      },
      include: { conversation: true },
    });

    if (!existingMessage) return;

    await prisma.message.update({
      where: { id: existingMessage.id },
      data: {
        deliveryStatus: statusStr,
      },
    });

    const eventName =
      statusStr === 'DELIVERED'
        ? 'MESSAGE_DELIVERED'
        : statusStr === 'READ'
          ? 'MESSAGE_READ'
          : statusStr === 'FAILED'
            ? 'MESSAGE_FAILED'
            : 'MESSAGE_SENT';

    await prisma.messageEvent.create({
      data: {
        messageId: existingMessage.id,
        type: eventName as any,
        name: eventName,
        at: timestamp,
        provenance: 'TRACKED',
      },
    });

    emitToUser(userId, 'message.status_updated', {
      messageId: existingMessage.id,
      conversationId: existingMessage.conversationId,
      status: statusStr,
      timestamp,
    });
  }

  /**
   * Processes a single inbound message from the official WhatsApp webhook,
   * synchronizes CRM, extracts media, and triggers AI Sales Agent with Pre-Flight checks.
   */
  static async handleInboundOfficialMessage(
    userId: string,
    accountId: string,
    msg: any,
    profileName: string | null,
  ) {
    const digits = (msg.from || '').replace(/\D/g, '');
    if (!digits || digits.length < 7) return;

    const metaMessageId = msg.id;

    // Check duplicate by metaMessageId
    const existing = await prisma.message.findFirst({
      where: {
        OR: [{ metaMessageId }, { opId: metaMessageId }],
      },
    });
    if (existing) return;

    // Determine message type & content
    const msgType = msg.type; // text, image, document, audio, video, sticker, location, interactive
    let bodyText = '';
    let mediaType: OfficialMediaType | null = null;
    let mediaUrl: string | null = null;
    let mediaMimeType: string | null = null;
    let mediaCaption: string | null = null;
    let mediaFileName: string | null = null;

    if (msgType === 'text') {
      bodyText = msg.text?.body || '';
    } else if (msgType === 'image') {
      mediaType = 'IMAGE';
      mediaMimeType = msg.image?.mime_type || 'image/jpeg';
      mediaCaption = msg.image?.caption || '';
      bodyText = mediaCaption || '[Изображение]';
      mediaUrl = msg.image?.id ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${msg.image.id}` : null;
    } else if (msgType === 'document') {
      mediaType = 'DOCUMENT';
      mediaMimeType = msg.document?.mime_type || 'application/pdf';
      mediaFileName = msg.document?.filename || 'document.pdf';
      mediaCaption = msg.document?.caption || '';
      bodyText = mediaCaption || `[Документ: ${mediaFileName}]`;
      mediaUrl = msg.document?.id ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${msg.document.id}` : null;
    } else if (msgType === 'audio' || msgType === 'voice') {
      mediaType = 'AUDIO';
      mediaMimeType = msg.audio?.mime_type || msg.voice?.mime_type || 'audio/ogg';
      bodyText = '[Голосовое сообщение]';
      mediaUrl = msg.audio?.id || msg.voice?.id ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${msg.audio?.id || msg.voice?.id}` : null;
    } else if (msgType === 'video') {
      mediaType = 'VIDEO';
      mediaMimeType = msg.video?.mime_type || 'video/mp4';
      mediaCaption = msg.video?.caption || '';
      bodyText = mediaCaption || '[Видео]';
      mediaUrl = msg.video?.id ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${msg.video.id}` : null;
    } else if (msgType === 'interactive') {
      mediaType = 'INTERACTIVE';
      const buttonReply = msg.interactive?.button_reply;
      const listReply = msg.interactive?.list_reply;
      bodyText = buttonReply?.title || listReply?.title || '[Ответ на интерактивную кнопку]';
    } else if (msgType === 'location') {
      mediaType = 'LOCATION';
      bodyText = `[Геолокация: ${msg.location?.latitude}, ${msg.location?.longitude} - ${msg.location?.name || ''}]`;
    } else {
      bodyText = `[Сообщение типа: ${msgType}]`;
    }

    const timestamp = msg.timestamp
      ? new Date(Number.parseInt(msg.timestamp, 10) * 1000)
      : new Date();

    // 1. CRM Lead Contact Identification & Upsert
    const lead = await prisma.lead.upsert({
      where: { userId_phone: { userId, phone: digits } },
      update: {
        assignedAccountId: accountId,
        contactName: profileName || undefined,
        companyName: profileName ? profileName : undefined,
      },
      create: {
        userId,
        contactName: profileName || '',
        companyName: profileName || maskPhone(digits),
        phone: digits,
        whatsappUrl: buildWaLink(digits),
        source: 'WA_LINK',
        status: 'NEW',
        assignedAccountId: accountId,
      },
    });

    // 2. CRM Conversation Upsert
    const conversation = await prisma.conversation.upsert({
      where: { accountId_leadId: { accountId, leadId: lead.id } },
      update: {
        status: 'UNREAD',
        unreadCount: { increment: 1 },
        lastMessageAt: timestamp,
        lastMessagePreview: bodyText.slice(0, 120),
      },
      create: {
        userId,
        accountId,
        leadId: lead.id,
        status: 'UNREAD',
        unreadCount: 1,
        lastMessageAt: timestamp,
        lastMessagePreview: bodyText.slice(0, 120),
      },
      include: {
        lead: true,
        account: { select: { id: true, name: true, phoneMasked: true } },
      },
    });

    // 3. Save Inbound Message Record
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        body: bodyText,
        mediaType,
        mediaUrl,
        mediaMimeType,
        mediaCaption,
        mediaFileName,
        metaMessageId,
        deliveryStatus: 'DELIVERED',
        provenance: 'TRACKED',
        recordedAt: timestamp,
        opId: metaMessageId,
      },
    });

    await prisma.messageEvent.create({
      data: {
        messageId: message.id,
        type: 'MESSAGE_RECEIVED',
        name: 'MESSAGE_RECEIVED',
        at: timestamp,
        provenance: 'TRACKED',
      },
    });

    // 4. CRM Timeline & Activity
    await recordTimelineEvent({
      userId,
      leadId: lead.id,
      conversationId: conversation.id,
      eventType: 'MESSAGE_RECEIVED',
      title: `Входящее сообщение от ${profileName || maskPhone(digits)} (Official WhatsApp)`,
      description: bodyText.slice(0, 250),
      metadata: { metaMessageId, mediaType },
    });

    await recordActivity({
      userId,
      action: 'MESSAGE_RECORDED',
      entity: 'MESSAGE',
      entityId: message.id,
      metadata: { viaOfficialApi: true, phone: maskPhone(digits), direction: 'INBOUND' },
    });

    // Realtime UI notifications
    emitToUser(userId, 'lead.created', lead);
    emitToUser(userId, 'message.created', {
      ...message,
      conversation,
      lead,
      account: conversation.account ? { id: accountId, name: conversation.account.name } : { id: accountId, name: 'WA Account' },
    });
    emitToUser(userId, 'conversation.updated', conversation);

    // 5. Trigger Autonomous AI Sales Brain Response with Pre-Flight Guardrails
    setTimeout(async () => {
      try {
        const aiConfig = await prisma.aiAgentConfig.findUnique({ where: { userId } });
        if (!aiConfig || aiConfig.mode === 'OFF') return;

        const aiState = await prisma.aiDialogueState.findUnique({
          where: { conversationId: conversation.id },
        });
        if (aiState?.isAiPaused || aiState?.humanTakeoverAt) {
          logger.info(`[OfficialWhatsApp] AI response skipped: conversation AI is paused or in human takeover.`, {
            conversationId: conversation.id,
          });
          return;
        }

        const { processInboundWithSalesBrain } = await import('../ai/sales-brain.service');
        const salesBrainResult = await processInboundWithSalesBrain(userId, conversation.id, bodyText);

        if (
          aiConfig.mode === 'AUTONOMOUS' &&
          salesBrainResult.replyText &&
          !salesBrainResult.optOutTriggered &&
          !salesBrainResult.isHotLead
        ) {
          // ================================================================
          // PRE-FLIGHT GUARDRAIL CHECKS (5 Mandatory Verifications)
          // ================================================================
          const guardrailResult = await PreFlightGuardrailService.validateAiDispatch(
            userId,
            conversation.id,
            salesBrainResult.replyText,
          );

          if (!guardrailResult.allowed) {
            logger.warn(
              `[OfficialWhatsApp] AI reply blocked by Pre-Flight Guardrail: ${guardrailResult.blockedReason}`,
              {
                conversationId: conversation.id,
                checks: guardrailResult.checks,
              },
            );
            return;
          }

          // Human-like typing delay before sending
          const delayMs = Math.max(3000, (aiConfig.minDelaySeconds || 4) * 1000);
          setTimeout(async () => {
            try {
              // Re-check guardrails right before sending (in case human took over during delay)
              const secondCheck = await PreFlightGuardrailService.validateAiDispatch(
                userId,
                conversation.id,
                salesBrainResult.replyText!,
              );

              if (!secondCheck.allowed) {
                logger.warn(`[OfficialWhatsApp] AI reply cancelled at dispatch time: ${secondCheck.blockedReason}`);
                return;
              }

              await OfficialWhatsAppService.sendMessage(userId, conversation.id, {
                to: digits,
                body: salesBrainResult.replyText!,
              });
            } catch (sendErr: any) {
              logger.error(`[OfficialWhatsApp] Failed to send autonomous AI response: ${sendErr.message}`);
            }
          }, delayMs);
        }
      } catch (aiErr: any) {
        logger.error(`[OfficialWhatsApp] AI background processing error: ${aiErr.message}`);
      }
    }, 500);
  }
}
