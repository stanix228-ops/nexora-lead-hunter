import { prisma } from '@nexora/database';
import type {
  DataProvenance,
  MessageDirection,
  MessageEventType,
} from '@nexora/database';
import { maskPhone, buildWaLink, normalizePhone } from '@nexora/utils';
import { AppError, NotFoundError } from '../../common/errors';
import { recordActivity } from '../../common/activity/recorder';
import { emitToUser } from '../../common/realtime/socket';

/** The maximum allowed accounts per workspace. */
export const MAX_ACCOUNTS = 7;

/** Clean JID / phone string to normalized digits (e.g. 14155552671@s.whatsapp.net -> 14155552671, 77051234567:45@s.whatsapp.net -> 77051234567) */
export function cleanJidToPhone(jid: string): string {
  const withoutDomain = (jid || '').split('@')[0] || '';
  const withoutDevice = withoutDomain.split(':')[0] || '';
  return normalizePhone(withoutDevice);
}

/**
 * Send a real WhatsApp message through the built-in session, recording
 * TRACKED events.
 */
export async function sendViaGateway(
  userId: string,
  conversationId: string,
  body: string,
  provenance: DataProvenance = 'TRACKED',
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { lead: true, account: { include: { gateway: true } } },
  });
  if (!conversation) throw new NotFoundError('Conversation not found.');
  if (!conversation.account) {
    throw new AppError(400, 'WhatsApp account is not attached to this conversation.', 'ACCOUNT_NOT_ATTACHED');
  }

  const connection = conversation.account.gateway;
  if (!connection || connection.status !== 'CONNECTED') {
    throw new AppError(409, 'Account is not connected to the gateway.', 'GATEWAY_NOT_CONNECTED');
  }
  if (!conversation.lead?.phone) {
    throw new AppError(409, 'Lead has no phone number to message.', 'LEAD_NO_PHONE');
  }

  const { sendWaText } = await import('../wa/wa.manager');
  let sent: { idMessage?: string; messageId?: string } | null = null;
  try {
    const res = await sendWaText(conversation.account.id, conversation.lead.phone, body);
    sent = { idMessage: res.opId || undefined, messageId: res.opId || undefined };
  } catch {
    throw new AppError(
      409,
      'WhatsApp-сессия не подключена. Нажмите QR на аккаунте.',
      'GATEWAY_NOT_CONNECTED',
    );
  }

  const opId = sent?.idMessage ?? sent?.messageId ?? null;

  const eventType: MessageEventType = 'MESSAGE_SENT';
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND' as MessageDirection,
        body,
        provenance,
        recordedAt: new Date(),
        opId,
      },
    });
    await tx.messageEvent.create({
      data: {
        messageId: created.id,
        type: eventType,
        name: eventType,
        provenance,
      },
    });
    const updated = await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: body.slice(0, 120),
      },
      include: {
        lead: true,
        account: { select: { id: true, name: true, phoneMasked: true } },
        messages: { include: { events: true }, orderBy: { recordedAt: 'asc' } },
      },
    });
    return { created, updated };
  });

  await recordActivity({
    userId,
    action: 'MESSAGE_RECORDED',
    entity: 'MESSAGE',
    entityId: message.created.id,
    metadata: { conversationId, direction: 'OUTBOUND', provenance, viaGateway: true, opId },
  });
  emitToUser(userId, 'message.created', {
    ...message.created,
    conversation: message.updated,
    lead: message.updated.lead,
    account: { id: conversation.account.id, name: conversation.account.name },
  });
  emitToUser(userId, 'conversation.updated', message.updated);
  return { message: message.created, conversation: message.updated };
}

/** Shape of an inbound message handed over by the built-in WA manager. */
export interface InboundWaPayload {
  chatId: string;
  text: string;
  opId?: string;
  senderName?: string;
  timestamp?: number;
}

/**
 * Handle an inbound message from the built-in WhatsApp session:
 * find-or-create the lead by phone, ensure a conversation exists on the right
 * account, store the message as TRACKED and notify the UI in realtime.
 */
export async function handleInbound(userId: string, accountId: string, payload: InboundWaPayload) {
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new NotFoundError('Account not found.');

  const digits = cleanJidToPhone(payload.chatId ?? '');
  const text = (payload.text ?? '').trim();
  const senderName = payload.senderName?.trim() || null;
  if (!digits || digits.length < 7 || !text) return { ok: true, ignored: true };

  // Avoid duplicate messages if already recorded by opId
  if (payload.opId) {
    const existingMsg = await prisma.message.findFirst({
      where: { opId: payload.opId },
    });
    if (existingMsg) return { ok: true, duplicated: true };
  }

  // Robust lead lookup matching digits, +digits, or 8/7 prefix variations
  let lead = await prisma.lead.findFirst({
    where: {
      userId,
      OR: [
        { phone: digits },
        { phone: `+${digits}` },
        ...(digits.startsWith('7') && digits.length === 11
          ? [{ phone: `8${digits.slice(1)}` }, { phone: `+8${digits.slice(1)}` }]
          : []),
      ],
    },
  });

  if (lead) {
    if (senderName && (!lead.companyName || lead.companyName.startsWith('+') || /^\d+$/.test(lead.companyName))) {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: { assignedAccountId: accountId, companyName: senderName },
      });
    }
  } else {
    lead = await prisma.lead.create({
      data: {
        userId,
        companyName: senderName || maskPhone(digits),
        phone: digits,
        whatsappUrl: buildWaLink(digits),
        source: 'WA_LINK',
        status: 'NEW',
        assignedAccountId: accountId,
      },
    });
  }

  const msgTime = new Date(payload.timestamp ?? Date.now());

  const conversation = await prisma.conversation.upsert({
    where: { accountId_leadId: { accountId, leadId: lead.id } },
    update: {
      status: 'UNREAD',
      unreadCount: { increment: 1 },
      lastMessageAt: msgTime,
      lastMessagePreview: text.slice(0, 120),
    },
    create: {
      userId,
      accountId,
      leadId: lead.id,
      status: 'UNREAD',
      unreadCount: 1,
      lastMessageAt: msgTime,
      lastMessagePreview: text.slice(0, 120),
    },
    include: {
      lead: true,
      account: { select: { id: true, name: true, phoneMasked: true } },
    },
  });

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'INBOUND' as MessageDirection,
      body: text,
      provenance: 'TRACKED' as DataProvenance,
      opId: payload.opId ?? null,
      recordedAt: msgTime,
    },
  });

  await prisma.messageEvent.create({
    data: {
      messageId: message.id,
      type: 'MESSAGE_RECEIVED' as MessageEventType,
      name: 'MESSAGE_RECEIVED',
      provenance: 'TRACKED' as DataProvenance,
    },
  });

  await recordActivity({
    userId,
    action: 'LEAD_IMPORTED',
    entity: 'LEAD',
    entityId: lead.id,
    metadata: { viaGateway: true, source: 'WA_LINK', phone: maskPhone(digits) },
  });

  emitToUser(userId, 'lead.created', lead);
  emitToUser(userId, 'message.created', {
    ...message,
    conversation,
    lead,
    account: { id: account.id, name: account.name },
  });
  emitToUser(userId, 'conversation.updated', conversation);

  // Trigger AI Sales Agent processing asynchronously
  setTimeout(async () => {
    try {
      const aiConfig = await prisma.aiAgentConfig.findUnique({ where: { userId } });
      if (!aiConfig || aiConfig.mode === 'OFF') return;

      const aiState = await prisma.aiDialogueState.findUnique({ where: { conversationId: conversation.id } });
      if (aiState?.isAiPaused) return;

      const { processInboundWithSalesBrain } = await import('../ai/sales-brain.service');
      const result = await processInboundWithSalesBrain(userId, conversation.id, text);

      if (aiConfig.mode === 'AUTONOMOUS' && result.replyText && !result.optOutTriggered) {
        // Enforce safe delay before sending
        const delayMs = Math.max(3000, (aiConfig.minDelaySeconds || 4) * 1000);
        setTimeout(async () => {
          try {
            await sendViaGateway(userId, conversation.id, result.replyText!, 'TRACKED');
          } catch (sendErr) {
            /* ignore if session disconnected */
          }
        }, delayMs);
      }
    } catch (aiErr) {
      /* ignore ai error to not disrupt basic messaging */
    }
  }, 500);

  return { ok: true, leadId: lead.id, conversationId: conversation.id, messageId: message.id };
}

/**
 * Handle an outbound message sent by the user directly from mobile WhatsApp.
 * Keeps conversation and message history synchronized across devices.
 */
export async function handleOutboundSynced(userId: string, accountId: string, payload: InboundWaPayload) {
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return;

  const digits = cleanJidToPhone(payload.chatId ?? '');
  const text = (payload.text ?? '').trim();
  if (!digits || digits.length < 7 || !text) return;

  if (payload.opId) {
    const existing = await prisma.message.findFirst({ where: { opId: payload.opId } });
    if (existing) return;
  }

  const lead = await prisma.lead.upsert({
    where: { userId_phone: { userId, phone: digits } },
    update: { assignedAccountId: accountId },
    create: {
      userId,
      companyName: maskPhone(digits),
      phone: digits,
      whatsappUrl: buildWaLink(digits),
      source: 'WA_LINK',
      status: 'NEW',
      assignedAccountId: accountId,
    },
  });

  const msgTime = new Date(payload.timestamp ?? Date.now());

  const conversation = await prisma.conversation.upsert({
    where: { accountId_leadId: { accountId, leadId: lead.id } },
    update: {
      lastMessageAt: msgTime,
      lastMessagePreview: text.slice(0, 120),
    },
    create: {
      userId,
      accountId,
      leadId: lead.id,
      status: 'NEW',
      unreadCount: 0,
      lastMessageAt: msgTime,
      lastMessagePreview: text.slice(0, 120),
    },
    include: {
      lead: true,
      account: { select: { id: true, name: true, phoneMasked: true } },
    },
  });

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUTBOUND' as MessageDirection,
      body: text,
      provenance: 'TRACKED' as DataProvenance,
      opId: payload.opId ?? null,
      recordedAt: msgTime,
    },
  });

  emitToUser(userId, 'message.created', {
    ...message,
    conversation,
    lead,
    account: { id: account.id, name: account.name },
  });
  emitToUser(userId, 'conversation.updated', conversation);
}

/**
 * Synchronize all past chats, contacts, and messages from WhatsApp history sync.
 */
export async function syncWaHistory(
  userId: string,
  accountId: string,
  data: {
    chats?: Array<{ id?: string; name?: string | null; conversationTimestamp?: number | null; unreadCount?: number | null }>;
    contacts?: Array<{ id?: string; name?: string | null; notify?: string | null; verifiedName?: string | null }>;
    messages?: Array<{ key?: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null }; message?: unknown; messageTimestamp?: number | null; pushName?: string | null }>;
  },
) {
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return;

  const contactMap = new Map<string, string>();
  for (const c of data.contacts ?? []) {
    const digits = cleanJidToPhone(c.id ?? '');
    const name = c.name || c.notify || c.verifiedName;
    if (digits && name) {
      contactMap.set(digits, name);
    }
  }

  // 1. Process chats
  for (const chat of data.chats ?? []) {
    const jid = chat.id || '';
    if (!jid.endsWith('@s.whatsapp.net')) continue;
    const digits = cleanJidToPhone(jid);
    if (!digits || digits.length < 7) continue;

    const contactName = chat.name || contactMap.get(digits) || maskPhone(digits);
    const unread = Number(chat.unreadCount) || 0;
    const lastTime = chat.conversationTimestamp
      ? new Date(Number(chat.conversationTimestamp) * 1000)
      : new Date();

    const lead = await prisma.lead.upsert({
      where: { userId_phone: { userId, phone: digits } },
      update: {
        assignedAccountId: accountId,
        companyName: contactName !== maskPhone(digits) ? contactName : undefined,
      },
      create: {
        userId,
        companyName: contactName,
        phone: digits,
        whatsappUrl: buildWaLink(digits),
        source: 'WA_LINK',
        status: 'NEW',
        assignedAccountId: accountId,
      },
    });

    const conv = await prisma.conversation.upsert({
      where: { accountId_leadId: { accountId, leadId: lead.id } },
      update: {
        lastMessageAt: lastTime,
        unreadCount: unread > 0 ? unread : undefined,
      },
      create: {
        userId,
        accountId,
        leadId: lead.id,
        status: unread > 0 ? 'UNREAD' : 'NEW',
        unreadCount: unread,
        lastMessageAt: lastTime,
      },
      include: {
        lead: true,
        account: { select: { id: true, name: true, phoneMasked: true } },
      },
    });

    emitToUser(userId, 'conversation.created', conv);
  }

  // 2. Process historical messages
  const { extractTextFromRaw } = await import('../wa/wa.manager');
  for (const m of data.messages ?? []) {
    const key = (m.key || {}) as Record<string, any>;
    const jid =
      key.remoteJidAlt && String(key.remoteJidAlt).endsWith('@s.whatsapp.net')
        ? String(key.remoteJidAlt)
        : key.participantAlt && String(key.participantAlt).endsWith('@s.whatsapp.net')
          ? String(key.participantAlt)
          : String(key.remoteJid || '');
    if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue;
    const digits = cleanJidToPhone(jid);
    if (!digits || digits.length < 7) continue;

    const text = extractTextFromRaw(m);
    if (!text) continue;

    const opId = m.key?.id || undefined;
    if (opId) {
      const exists = await prisma.message.findFirst({ where: { opId } });
      if (exists) continue;
    }

    let lead = await prisma.lead.findFirst({ where: { userId, phone: digits } });
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          userId,
          companyName: m.pushName || maskPhone(digits),
          phone: digits,
          whatsappUrl: buildWaLink(digits),
          source: 'WA_LINK',
          status: 'NEW',
          assignedAccountId: accountId,
        },
      });
    }

    const ts = m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000) : new Date();
    const isOut = Boolean(m.key?.fromMe);

    const conv = await prisma.conversation.upsert({
      where: { accountId_leadId: { accountId, leadId: lead.id } },
      update: {
        lastMessageAt: ts,
        lastMessagePreview: text.slice(0, 120),
      },
      create: {
        userId,
        accountId,
        leadId: lead.id,
        status: isOut ? 'NEW' : 'UNREAD',
        unreadCount: isOut ? 0 : 1,
        lastMessageAt: ts,
        lastMessagePreview: text.slice(0, 120),
      },
      include: {
        lead: true,
        account: { select: { id: true, name: true, phoneMasked: true } },
      },
    });

    const createdMsg = await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: isOut ? 'OUTBOUND' : 'INBOUND',
        body: text,
        provenance: 'TRACKED',
        opId: opId ?? null,
        recordedAt: ts,
      },
    });

    emitToUser(userId, 'message.created', {
      ...createdMsg,
      conversation: conv,
      lead,
      account: { id: account.id, name: account.name },
    });
    emitToUser(userId, 'conversation.updated', conv);
  }
}