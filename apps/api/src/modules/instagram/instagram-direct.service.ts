import crypto from 'node:crypto';
import { prisma } from '@nexora/database';
import type {
  InstagramSendPayload,
  InstagramSendResponse,
  InstagramMediaType,
  AiExecutionMode,
} from '@nexora/types';
import { logger } from '../../common/logger';
import { recordActivity } from '../../common/activity/recorder';
import { recordTimelineEvent } from '../crm/crm.service';
import { emitToUser } from '../../common/realtime/socket';
import { PreFlightGuardrailService } from '../ai/pre-flight-guardrail.service';

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class InstagramDirectService {
  /**
   * Verifies the HMAC-SHA256 signature of an incoming Meta Instagram webhook request.
   */
  static verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
    appSecret: string | undefined,
  ): boolean {
    if (!signatureHeader) return false;
    if (!appSecret) return true; // Permissive in dev if secret not configured

    try {
      const parts = signatureHeader.split('sha256=');
      if (parts.length !== 2) return false;
      const expectedSignature = parts[1];

      const hmac = crypto.createHmac('sha256', appSecret);
      const calculatedSignature = hmac.update(rawBody).digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(calculatedSignature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8'),
      );
    } catch (err: any) {
      logger.error(`[InstagramDirect] Error verifying webhook signature: ${err.message}`);
      return false;
    }
  }

  /**
   * Sends an official Instagram Direct message or media via Meta Graph API.
   */
  static async sendMessage(
    userId: string,
    conversationId: string,
    payload: InstagramSendPayload,
  ): Promise<InstagramSendResponse> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        instagramAccount: true,
        account: true,
        lead: true,
      },
    });

    if (!conversation) {
      throw new Error(`Conversation not found for ID: ${conversationId}`);
    }

    const igAccount = conversation.instagramAccount;
    const recipientId = payload.recipientId || conversation.lead.instagramId;

    if (!recipientId) {
      throw new Error('Recipient Instagram-scoped User ID (IGSID) is required');
    }

    const accessToken = igAccount?.accessToken;
    const isLiveMeta =
      accessToken &&
      !accessToken.startsWith('EAAInstagramMock') &&
      accessToken.length > 30;

    let metaMessageId = `mid.IG_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let rawApiResponse: any = null;

    if (isLiveMeta && igAccount) {
      try {
        const bodyPayload: Record<string, any> = {
          recipient: { id: recipientId },
        };

        if (payload.text) {
          bodyPayload.message = { text: payload.text };
          if (payload.quickReplies && payload.quickReplies.length > 0) {
            bodyPayload.message.quick_replies = payload.quickReplies.map((qr) => ({
              content_type: 'text',
              title: qr.title.slice(0, 20),
              payload: qr.payload,
            }));
          }
        } else if (payload.mediaUrl && payload.mediaType) {
          const fbAttachmentType =
            payload.mediaType === 'IMAGE'
              ? 'image'
              : payload.mediaType === 'VIDEO'
                ? 'video'
                : payload.mediaType === 'AUDIO'
                  ? 'audio'
                  : 'file';

          bodyPayload.message = {
            attachment: {
              type: fbAttachmentType,
              payload: {
                url: payload.mediaUrl,
                is_reusable: true,
              },
            },
          };
        }

        if (payload.tag) {
          bodyPayload.messaging_type = 'MESSAGE_TAG';
          bodyPayload.tag = payload.tag;
        }

        const endpoint = `${GRAPH_API_BASE}/me/messages`;
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        });

        rawApiResponse = await resp.json();

        if (!resp.ok || rawApiResponse.error) {
          const errMsg =
            rawApiResponse.error?.message ||
            `Meta Graph API HTTP ${resp.status}: ${resp.statusText}`;
          throw new Error(errMsg);
        }

        metaMessageId = rawApiResponse.message_id || rawApiResponse.recipient_id || metaMessageId;
      } catch (err: any) {
        logger.error(`[InstagramDirect] Failed to dispatch via Meta API: ${err.message}`, {
          conversationId,
        });
        throw err;
      }
    } else {
      logger.info(
        `[InstagramDirect] Simulated dispatch (no live Meta credentials, using sandbox mid)`,
        { recipientId, text: payload.text?.slice(0, 60) },
      );
    }

    // Save outbound message in CRM database
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        body: payload.text || `[${payload.mediaType || 'MEDIA'}]`,
        mediaType: payload.mediaType || null,
        mediaUrl: payload.mediaUrl || null,
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

    // Update conversation metadata & counter
    if (igAccount) {
      await prisma.instagramAccount.update({
        where: { id: igAccount.id },
        data: {
          messagesSentToday: { increment: 1 },
          lastActiveAt: new Date(),
        },
      });
    }

    const updatedConv = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: (payload.text || '[Медиа Instagram]').slice(0, 120),
      },
      include: {
        lead: true,
        instagramAccount: { select: { id: true, name: true, username: true, status: true } },
      },
    });

    // Record Timeline & Activity Events
    await recordActivity({
      userId,
      action: 'MESSAGE_RECORDED',
      entity: 'MESSAGE',
      entityId: message.id,
      metadata: {
        conversationId,
        direction: 'OUTBOUND',
        metaMessageId,
        channel: 'INSTAGRAM',
        recipientId,
      },
    });

    // Real-time UI notification
    emitToUser(userId, 'message.created', {
      ...message,
      conversation: updatedConv,
      lead: updatedConv.lead,
      instagramAccount: updatedConv.instagramAccount,
    });
    emitToUser(userId, 'conversation.updated', updatedConv);

    return {
      success: true,
      metaMessageId,
      recipientId,
      status: 'SENT',
      sentAt: new Date().toISOString(),
      rawResponse: rawApiResponse,
    };
  }

  /**
   * Processes an incoming Meta Instagram webhook payload.
   */
  static async processInstagramWebhook(payload: any): Promise<{ processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;

    if (!payload || payload.object !== 'instagram' || !Array.isArray(payload.entry)) {
      return { processed: 0, errors: ['Invalid Instagram Webhook payload format'] };
    }

    for (const entry of payload.entry) {
      const entryId = entry.id; // Instagram Business Account ID or Page ID
      const messaging = entry.messaging || [];

      // Find Instagram Account by instagramId or pageId
      let account = await prisma.instagramAccount.findFirst({
        where: {
          OR: [
            { instagramId: entryId },
            { pageId: entryId },
          ],
        },
        include: { user: true },
      });

      // Fallback: pick the first active Instagram account if in dev
      if (!account) {
        account = await prisma.instagramAccount.findFirst({
          where: { status: { not: 'OFFLINE' } },
          include: { user: true },
        });
      }

      if (!account) {
        logger.warn(
          `[InstagramDirect] Webhook received but no matching InstagramAccount found for entryId: ${entryId}`,
        );
        continue;
      }

      const userId = account.userId;

      for (const item of messaging) {
        try {
          // 1. Handle Read Receipts
          if (item.read) {
            await this.handleReadReceipt(userId, item);
            processed++;
            continue;
          }

          // 2. Handle Delivery Receipts
          if (item.delivery) {
            await this.handleDeliveryReceipt(userId, item);
            processed++;
            continue;
          }

          // 3. Handle Inbound Message
          if (item.message && !item.message.is_echo) {
            await this.handleInboundInstagramMessage(userId, account, item);
            processed++;
          }
        } catch (itemErr: any) {
          logger.error(`[InstagramDirect] Error processing item: ${itemErr.message}`);
          errors.push(`Messaging error: ${itemErr.message}`);
        }
      }
    }

    return { processed, errors };
  }

  /**
   * Handles delivery status update for Instagram read receipts.
   */
  private static async handleReadReceipt(userId: string, item: any) {
    const watermark = item.read.watermark;
    const senderId = item.sender?.id;

    if (!senderId) return;

    const watermarkDate = new Date(watermark);

    const messages = await prisma.message.findMany({
      where: {
        conversation: { lead: { instagramId: senderId } },
        direction: 'OUTBOUND',
        deliveryStatus: { not: 'READ' },
        recordedAt: { lte: watermarkDate },
      },
    });

    for (const msg of messages) {
      await prisma.message.update({
        where: { id: msg.id },
        data: { deliveryStatus: 'READ' },
      });

      await prisma.messageEvent.create({
        data: {
          messageId: msg.id,
          type: 'MESSAGE_READ',
          name: 'MESSAGE_READ',
          at: watermarkDate,
          provenance: 'TRACKED',
        },
      });

      emitToUser(userId, 'message.status_updated', {
        messageId: msg.id,
        conversationId: msg.conversationId,
        status: 'READ',
        timestamp: watermarkDate,
      });
    }
  }

  /**
   * Handles delivery status update for Instagram delivery receipts.
   */
  private static async handleDeliveryReceipt(userId: string, item: any) {
    const mids = item.delivery.mids || [];
    for (const mid of mids) {
      const msg = await prisma.message.findFirst({
        where: { metaMessageId: mid },
      });
      if (msg && msg.deliveryStatus === 'SENT') {
        await prisma.message.update({
          where: { id: msg.id },
          data: { deliveryStatus: 'DELIVERED' },
        });

        await prisma.messageEvent.create({
          data: {
            messageId: msg.id,
            type: 'MESSAGE_DELIVERED',
            name: 'MESSAGE_DELIVERED',
            provenance: 'TRACKED',
          },
        });

        emitToUser(userId, 'message.status_updated', {
          messageId: msg.id,
          conversationId: msg.conversationId,
          status: 'DELIVERED',
        });
      }
    }
  }

  /**
   * Handles a single inbound Instagram message, extracts media/text,
   * identifies the contact, updates CRM, and triggers AI evaluation.
   */
  static async handleInboundInstagramMessage(
    userId: string,
    account: any,
    item: any,
  ) {
    const senderId = item.sender?.id; // IG-scoped User ID
    if (!senderId) return;

    const metaMessageId = item.message?.mid || `mid.IN_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Check duplicate by metaMessageId
    const existing = await prisma.message.findFirst({
      where: {
        OR: [{ metaMessageId }, { opId: metaMessageId }],
      },
    });
    if (existing) return;

    // Determine message type & text
    let bodyText = item.message?.text || '';
    let mediaType: InstagramMediaType | null = null;
    let mediaUrl: string | null = null;

    if (item.message?.quick_reply) {
      mediaType = 'QUICK_REPLY';
      bodyText = item.message.quick_reply.payload || bodyText || '[Быстрый ответ]';
    } else if (item.message?.attachments && item.message.attachments.length > 0) {
      const att = item.message.attachments[0];
      const attType = att.type; // image, video, audio, file, share, story_mention
      mediaUrl = att.payload?.url || null;

      if (attType === 'image') {
        mediaType = 'IMAGE';
        bodyText = bodyText || '[Изображение Instagram]';
      } else if (attType === 'video') {
        mediaType = 'VIDEO';
        bodyText = bodyText || '[Видео Instagram]';
      } else if (attType === 'audio') {
        mediaType = 'AUDIO';
        bodyText = bodyText || '[Голосовое сообщение]';
      } else if (attType === 'share' || attType === 'story_mention') {
        mediaType = attType === 'story_mention' ? 'STORY_MENTION' : 'STORY_SHARE';
        bodyText = bodyText || `[Упоминание в Stories Instagram: ${att.payload?.title || ''}]`;
      } else {
        mediaType = 'DOCUMENT';
        bodyText = bodyText || '[Вложение Instagram]';
      }
    }

    const timestamp = item.timestamp ? new Date(item.timestamp) : new Date();

    // 1. Contact Identification (Fetch Profile from Meta Graph API if available)
    let contactName = item.sender?.name || null;
    let username = item.sender?.username || null;
    let profilePicUrl: string | null = null;

    if (!contactName || !username) {
      const cachedLead = await prisma.lead.findFirst({
        where: { userId, instagramId: senderId },
      });
      if (cachedLead) {
        contactName = cachedLead.contactName;
        username = cachedLead.instagramUsername;
      }
    }

    // Try Meta Graph API user lookup if live credentials present
    if (!username && account.accessToken && !account.accessToken.startsWith('EAAInstagramMock')) {
      try {
        const userResp = await fetch(
          `${GRAPH_API_BASE}/${senderId}?fields=name,username,profile_pic&access_token=${account.accessToken}`,
        );
        if (userResp.ok) {
          const userData = await userResp.json();
          contactName = userData.name || contactName;
          username = userData.username || username;
          profilePicUrl = userData.profile_pic || null;
        }
      } catch (err: any) {
        logger.warn(`[InstagramDirect] Failed to fetch user profile for ${senderId}: ${err.message}`);
      }
    }

    const finalUsername = username || `ig_user_${senderId.slice(-6)}`;
    const finalName = contactName || `@${finalUsername}`;

    // 2. CRM Lead Upsert
    let lead = await prisma.lead.findFirst({
      where: { userId, instagramId: senderId },
    });

    if (lead) {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          assignedInstagramAccountId: account.id,
          instagramUsername: finalUsername,
          instagramUrl: `https://instagram.com/${finalUsername}`,
          contactName: finalName,
          companyName: finalName,
        },
      });
    } else {
      lead = await prisma.lead.create({
        data: {
          userId,
          instagramId: senderId,
          instagramUsername: finalUsername,
          instagramUrl: `https://instagram.com/${finalUsername}`,
          contactName: finalName,
          companyName: finalName,
          source: 'INSTAGRAM',
          status: 'NEW',
          assignedInstagramAccountId: account.id,
        },
      });
    }

    // 3. CRM Conversation Upsert
    let conversation = await prisma.conversation.findFirst({
      where: { instagramAccountId: account.id, leadId: lead.id },
      include: {
        lead: true,
        instagramAccount: { select: { id: true, name: true, username: true, status: true } },
      },
    });

    if (conversation) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: 'UNREAD',
          unreadCount: { increment: 1 },
          lastMessageAt: timestamp,
          lastMessagePreview: bodyText.slice(0, 120),
        },
        include: {
          lead: true,
          instagramAccount: { select: { id: true, name: true, username: true, status: true } },
        },
      });
    } else {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          instagramAccountId: account.id,
          leadId: lead.id,
          channel: 'INSTAGRAM',
          status: 'UNREAD',
          unreadCount: 1,
          lastMessageAt: timestamp,
          lastMessagePreview: bodyText.slice(0, 120),
        },
        include: {
          lead: true,
          instagramAccount: { select: { id: true, name: true, username: true, status: true } },
        },
      });
    }

    // 4. Save Inbound Message Record in CRM
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        body: bodyText,
        mediaType,
        mediaUrl,
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

    // 5. CRM Timeline & Activity
    await recordTimelineEvent({
      userId,
      leadId: lead.id,
      conversationId: conversation.id,
      eventType: 'MESSAGE_RECEIVED',
      title: `Входящее сообщение от @${finalUsername} (Instagram Direct)`,
      description: bodyText.slice(0, 250),
      metadata: { metaMessageId, mediaType, instagramId: senderId },
    });

    await recordActivity({
      userId,
      action: 'MESSAGE_RECORDED',
      entity: 'MESSAGE',
      entityId: message.id,
      metadata: { channel: 'INSTAGRAM', username: finalUsername, direction: 'INBOUND' },
    });

    // Real-time UI notifications
    emitToUser(userId, 'lead.created', lead);
    emitToUser(userId, 'message.created', {
      ...message,
      conversation,
      lead,
      instagramAccount: conversation.instagramAccount,
    });
    emitToUser(userId, 'conversation.updated', conversation);

    // 6. AI Sales Agent Triggering based on Account & Conversation Mode
    const effectiveMode: AiExecutionMode = account.aiExecutionMode || 'AUTOMATIC_REPLIES';

    setTimeout(async () => {
      try {
        await this.handleAiExecution(userId, conversation.id, lead.id, bodyText, effectiveMode, account);
      } catch (aiErr: any) {
        logger.error(`[InstagramDirect] AI execution failed: ${aiErr.message}`, {
          conversationId: conversation.id,
        });
      }
    }, 1000);
  }

  /**
   * Executes AI processing for Instagram according to the configured execution mode.
   */
  private static async handleAiExecution(
    userId: string,
    conversationId: string,
    leadId: string,
    inboundText: string,
    mode: AiExecutionMode,
    account: any,
  ) {
    if (mode === 'PAUSED') {
      logger.info(`[InstagramDirect] AI is PAUSED for account @${account.username}. Skipping.`);
      return;
    }

    if (mode === 'HUMAN_HANDOFF') {
      logger.info(`[InstagramDirect] HUMAN_HANDOFF active for account @${account.username}. Alerting manager.`);
      emitToUser(userId, 'ai.human_handoff_requested', {
        conversationId,
        leadId,
        reason: 'Account configured for HUMAN_HANDOFF',
      });
      return;
    }

    // Run Pre-Flight Guardrails Check
    const guardrail = await PreFlightGuardrailService.validateAiDispatch(
      userId,
      conversationId,
      'Здравствуйте! Спасибо за обращение в Nexora. Чем можем помочь?',
    );

    if (!guardrail.allowed) {
      logger.warn(`[InstagramDirect] Pre-Flight Guardrail blocked AI response: ${guardrail.blockedReason}`, {
        conversationId,
      });
      return;
    }

    // Run Consultative AI Sales Brain
    const { processInboundWithSalesBrain } = await import('../ai/sales-brain.service');
    const brainDecision = await processInboundWithSalesBrain(
      userId,
      conversationId,
      inboundText,
    );

    if (!brainDecision.replyText) {
      logger.info(`[InstagramDirect] SalesBrain decided no immediate text response needed.`);
      return;
    }

    const aiReplyText = brainDecision.replyText;

    if (mode === 'MANUAL_APPROVAL') {
      // Store proposed reply for manager approval
      await prisma.aiDialogueState.upsert({
        where: { conversationId },
        update: {
          suggestedReply: aiReplyText,
          suggestedReplyStatus: 'PENDING',
          executionMode: 'MANUAL_APPROVAL',
        },
        create: {
          conversationId,
          suggestedReply: aiReplyText,
          suggestedReplyStatus: 'PENDING',
          executionMode: 'MANUAL_APPROVAL',
        },
      });

      emitToUser(userId, 'ai.suggestion_ready', {
        conversationId,
        leadId,
        suggestedReply: aiReplyText,
        strategy: brainDecision.decision?.nextBestAction || brainDecision.stage || 'INBOUND_REPLY',
        status: 'PENDING',
      });

      logger.info(`[InstagramDirect] AI suggestion stored for MANUAL_APPROVAL in conversation ${conversationId}`);
    } else if (mode === 'AUTOMATIC_REPLIES' || mode === 'FULL_AUTONOMY') {
      // Automatic dispatch via Instagram Direct
      await this.sendMessage(userId, conversationId, {
        recipientId: '',
        text: aiReplyText,
      });

      logger.info(`[InstagramDirect] Autonomous AI reply dispatched for conversation ${conversationId}`);
    }
  }

  /**
   * Approves or rejects a manually generated AI draft response.
   */
  static async handleManualApproval(
    userId: string,
    conversationId: string,
    action: 'APPROVE_AND_SEND' | 'REJECT' | 'EDIT_AND_SEND',
    editedText?: string,
  ) {
    const aiState = await prisma.aiDialogueState.findUnique({
      where: { conversationId },
    });

    if (!aiState || !aiState.suggestedReply) {
      throw new Error('No pending AI suggested reply found for this conversation');
    }

    if (action === 'REJECT') {
      await prisma.aiDialogueState.update({
        where: { conversationId },
        data: { suggestedReplyStatus: 'REJECTED' },
      });
      return { success: true, status: 'REJECTED' };
    }

    const textToSend = action === 'EDIT_AND_SEND' && editedText ? editedText : aiState.suggestedReply;

    // Send approved message
    const sendResult = await this.sendMessage(userId, conversationId, {
      text: textToSend,
    } as any);

    await prisma.aiDialogueState.update({
      where: { conversationId },
      data: {
        suggestedReplyStatus: 'APPROVED',
        lastAiReplyAt: new Date(),
      },
    });

    return {
      success: true,
      status: 'APPROVED_AND_SENT',
      sendResult,
    };
  }
}
