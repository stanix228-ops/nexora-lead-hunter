import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { ConversationStatus, MessageDirection } from '@nexora/types';
import { asyncHandler, NotFoundError, AppError } from '../../common/errors';
import { parsePagination, paginate } from '../../common/pagination';
import { recordActivity } from '../../common/activity/recorder';
import { emitToUser } from '../../common/realtime/socket';
import { sendViaGateway } from '../gateway/gateway.service';

export const conversationRouter: import('express').Router = Router();
export const messageRouter: import('express').Router = Router();

const CONVERSATION_STATUSES: ConversationStatus[] = [
  'NEW', 'UNREAD', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE',
];

const createConversationSchema = z.object({
  accountId: z.string().min(1),
  leadId: z.string().min(1),
  status: z.enum(CONVERSATION_STATUSES as [string, ...string[]]).optional(),
});

const openByPhoneSchema = z.object({
  accountId: z.string().min(1),
  input: z.string().min(1),
  companyName: z.string().optional(),
});

const updateConversationSchema = z.object({
  status: z.enum(CONVERSATION_STATUSES as [string, ...string[]]).optional(),
  unreadCount: z.number().int().min(0).optional(),
  markRead: z.boolean().optional(),
});

conversationRouter.post('/open-by-phone', asyncHandler(async (req: Request, res: Response) => {
  const body = openByPhoneSchema.parse(req.body);
  const userId = req.user!.id;
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: body.accountId, userId } });
  if (!account) throw new NotFoundError('Account not found.');

  let cleaned = body.input.trim();
  const waMeMatch = cleaned.match(/wa\.me\/(?:phone\/)?(\+?\d+)/i);
  if (waMeMatch) cleaned = waMeMatch[1];
  const urlPhoneMatch = cleaned.match(/[?&]phone=(\+?\d+)/i);
  if (urlPhoneMatch) cleaned = urlPhoneMatch[1];

  let digits = cleaned.replace(/\D/g, '');
  if (digits.startsWith('8') && digits.length === 11) {
    digits = '7' + digits.slice(1);
  }

  if (digits.length < 7) {
    throw new AppError(400, 'Укажите корректный номер телефона или ссылку WhatsApp.', 'INVALID_PHONE');
  }

  const { buildWaLink, maskPhone } = await import('@nexora/utils');

  const lead = await prisma.lead.upsert({
    where: { userId_phone: { userId, phone: digits } },
    update: { assignedAccountId: account.id },
    create: {
      userId,
      companyName: body.companyName?.trim() || maskPhone(digits),
      phone: digits,
      whatsappUrl: buildWaLink(digits),
      source: 'WA_LINK',
      status: 'NEW',
      assignedAccountId: account.id,
    },
  });

  const conversation = await prisma.conversation.upsert({
    where: { accountId_leadId: { accountId: account.id, leadId: lead.id } },
    update: {},
    create: {
      userId,
      accountId: account.id,
      leadId: lead.id,
      status: 'NEW',
      unreadCount: 0,
    },
    include: {
      lead: { include: { assignedAccount: { select: { id: true, name: true } } } },
      account: { select: { id: true, name: true, phoneMasked: true } },
      messages: { include: { events: true }, orderBy: { recordedAt: 'asc' } },
    },
  });

  emitToUser(userId, 'conversation.created', conversation);
  res.status(200).json(conversation);
}));

conversationRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = parsePagination(req.query);
  const userId = req.user!.id;
  const q = req.query;
  const where: Record<string, unknown> = { userId };

  const filter = String(q.filter ?? 'ALL').toUpperCase();

  if (filter === 'UNREAD') {
    where.OR = [
      { status: 'UNREAD' },
      { unreadCount: { gt: 0 } },
    ];
  } else if (filter === 'REPLIED') {
    where.OR = [
      { status: 'REPLIED' },
      { messages: { some: { direction: 'INBOUND' } } },
    ];
  } else if (filter === 'NO_RESPONSE') {
    where.OR = [
      { status: 'NO_RESPONSE' },
      {
        AND: [
          { messages: { some: { direction: 'OUTBOUND' } } },
          { messages: { none: { direction: 'INBOUND' } } },
        ],
      },
    ];
  } else if (filter === 'NEW') {
    where.OR = [
      { status: 'NEW' },
      { messages: { none: {} } },
    ];
  } else if (filter === 'INTERESTED') {
    where.status = 'INTERESTED';
  } else if (filter === 'NEGOTIATION') {
    where.status = 'NEGOTIATION';
  } else if (filter === 'CLIENTS' || filter === 'CLIENT') {
    where.status = 'CLIENT';
  }

  if (q.account) where.accountId = String(q.account);
  if (q.search) {
    const searchStr = String(q.search);
    const searchFilter = [
      { lead: { companyName: { contains: searchStr, mode: 'insensitive' } } },
      { lead: { phone: { contains: searchStr, mode: 'insensitive' } } },
    ];
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchFilter }];
      delete where.OR;
    } else {
      where.OR = searchFilter;
    }
  }

  const baseAccountFilter = q.account ? { accountId: String(q.account) } : {};

  const [
    items,
    total,
    countAll,
    countUnread,
    countReplied,
    countNew,
    countNoResponse,
    countClients,
  ] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        lead: { include: { assignedAccount: { select: { id: true, name: true } } } },
        account: { select: { id: true, name: true, phoneMasked: true } },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({ where }),
    prisma.conversation.count({ where: { userId, ...baseAccountFilter } }),
    prisma.conversation.count({
      where: {
        userId,
        ...baseAccountFilter,
        OR: [{ status: 'UNREAD' }, { unreadCount: { gt: 0 } }],
      },
    }),
    prisma.conversation.count({
      where: {
        userId,
        ...baseAccountFilter,
        OR: [{ status: 'REPLIED' }, { messages: { some: { direction: 'INBOUND' } } }],
      },
    }),
    prisma.conversation.count({
      where: {
        userId,
        ...baseAccountFilter,
        OR: [{ status: 'NEW' }, { messages: { none: {} } }],
      },
    }),
    prisma.conversation.count({
      where: {
        userId,
        ...baseAccountFilter,
        OR: [
          { status: 'NO_RESPONSE' },
          {
            AND: [
              { messages: { some: { direction: 'OUTBOUND' } } },
              { messages: { none: { direction: 'INBOUND' } } },
            ],
          },
        ],
      },
    }),
    prisma.conversation.count({
      where: {
        userId,
        ...baseAccountFilter,
        status: { in: ['CLIENT', 'INTERESTED', 'NEGOTIATION'] },
      },
    }),
  ]);

  const paged = paginate(items, total, { page, pageSize });
  res.json({
    ...paged,
    counts: {
      all: countAll,
      unread: countUnread,
      replied: countReplied,
      new: countNew,
      noResponse: countNoResponse,
      clients: countClients,
    },
  });
}));

conversationRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = createConversationSchema.parse(req.body);
  const userId = req.user!.id;
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: body.accountId, userId } });
  if (!account) throw new NotFoundError('Account not found.');
  const lead = await prisma.lead.findFirst({ where: { id: body.leadId, userId } });
  if (!lead) throw new NotFoundError('Lead not found.');

  const existing = await prisma.conversation.findFirst({
    where: { accountId: body.accountId, leadId: body.leadId },
  });
  if (existing) {
    res.json(existing);
    return;
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      accountId: body.accountId,
      leadId: body.leadId,
      status: (body.status as ConversationStatus | undefined) ?? 'NEW',
    },
    include: { lead: true, account: true },
  });
  await recordActivity({
    userId,
    action: 'CONVERSATION_UPDATED',
    entity: 'CONVERSATION',
    entityId: conversation.id,
    metadata: { created: true, leadId: body.leadId, accountId: body.accountId },
  });
  emitToUser(userId, 'conversation.created', conversation);
  res.status(201).json(conversation);
}));

conversationRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
    include: {
      lead: { include: { assignedAccount: { select: { id: true, name: true } } } },
      account: { select: { id: true, name: true } },
      messages: { include: { events: true }, orderBy: { recordedAt: 'asc' } },
    },
  });
  if (!conversation) throw new NotFoundError('Conversation not found.');
  res.json(conversation);
}));

conversationRouter.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const body = updateConversationSchema.parse(req.body);
  const userId = req.user!.id;
  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), userId },
  });
  if (!conversation) throw new NotFoundError('Conversation not found.');

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.markRead) data.unreadCount = 0;
  else if (body.unreadCount !== undefined) data.unreadCount = body.unreadCount;

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data,
    include: { lead: true, account: true },
  });
  await recordActivity({
    userId,
    action: 'CONVERSATION_UPDATED',
    entity: 'CONVERSATION',
    entityId: conversation.id,
    metadata: { status: body.status ?? undefined, markRead: body.markRead ?? undefined },
  });
  emitToUser(userId, 'conversation.updated', updated);
  res.json(updated);
}));

/* ------------------------------------------------ messages */

const createMessageSchema = z.object({
  conversationId: z.string().min(1),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  body: z.string().min(1).max(10000),
  provenance: z.enum(['TRACKED', 'MANUAL', 'UNAVAILABLE']).default('MANUAL'),
  eventType: z.enum(['MESSAGE_CREATED', 'MESSAGE_SENT', 'MESSAGE_DELIVERED', 'MESSAGE_READ', 'MESSAGE_FAILED', 'MESSAGE_RECEIVED']).optional(),
});

messageRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const where: Record<string, unknown> = {};
  if (req.query.conversationId) where.conversationId = String(req.query.conversationId);
  const items = await prisma.message.findMany({
    where,
    orderBy: { recordedAt: 'desc' },
    take: 200,
    include: { events: true },
  });
  res.json({ items });
}));

/**
 * Record a message for a conversation.
 *
 * IMPORTANT: Nexora has no official WhatsApp message pipe, so message
 * writes are recorded with explicit provenance (default MANUAL) and a
 * MessageEvent chain (MESSAGE_CREATED в†’ вЂ¦). TRACKED is only used when a
 * real integrated source provides the fact.
 */
messageRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = createMessageSchema.parse(req.body);
  const userId = req.user!.id;
  const conversation = await prisma.conversation.findFirst({
    where: { id: body.conversationId, userId },
  });
  if (!conversation) throw new NotFoundError('Conversation not found.');

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: conversation.id,
        direction: body.direction as MessageDirection,
        body: body.body,
        provenance: body.provenance,
      },
    });
    await tx.messageEvent.create({
      data: {
        messageId: created.id,
        type: body.eventType ?? (body.direction === 'INBOUND' ? 'MESSAGE_RECEIVED' : 'MESSAGE_CREATED'),
        name: body.eventType ?? 'MESSAGE_CREATED',
        provenance: body.provenance,
      },
    });
    return created;
  });

  const unreadDelta = body.direction === 'INBOUND' ? 1 : 0;
  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: body.body.slice(0, 120),
      unreadCount:
        unreadDelta > 0
          ? { increment: unreadDelta }
          : conversation.unreadCount,
    },
    include: {
      lead: true,
      account: { select: { id: true, name: true } },
      messages: { include: { events: true }, orderBy: { recordedAt: 'asc' } },
    },
  });

  await recordActivity({
    userId,
    action: 'MESSAGE_RECORDED',
    entity: 'MESSAGE',
    entityId: message.id,
    metadata: {
      conversationId: conversation.id,
      direction: body.direction,
      provenance: body.provenance,
    },
  });

  emitToUser(userId, 'message.created', message);
  emitToUser(userId, 'conversation.updated', updated);
  res.status(201).json({ message, conversation: updated });
}));

/**
 * POST /api/messages/send — send a real WhatsApp message through the
 * connected gateway provider. Records the message as TRACKED with a
 * MESSAGE_SENT event when the provider returns an internal id.
 */
messageRouter.post('/send', asyncHandler(async (req: Request, res: Response) => {
  const sendSchema = z.object({
    conversationId: z.string().min(1),
    body: z.string().min(1).max(10000),
  });
  const body = sendSchema.parse(req.body);
  const result = await sendViaGateway(req.user!.id, body.conversationId, body.body);
  res.status(201).json(result);
}));