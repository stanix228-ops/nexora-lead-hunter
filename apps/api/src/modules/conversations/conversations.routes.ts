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
import { LeadScoringEngine } from '../ai/scoring.service';

export const conversationRouter: import('express').Router = Router();
export const messageRouter: import('express').Router = Router();

const CONVERSATION_STATUSES: ConversationStatus[] = [
  'NEW', 'UNREAD', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE',
];

const conversationLeadInclude = {
  assignedAccount: { select: { id: true, name: true, phoneMasked: true } },
  assignedInstagramAccount: { select: { id: true, name: true, username: true, status: true } },
  tags: { include: { tag: true } },
  campaigns: { include: { campaign: { select: { id: true, name: true } } } },
};

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
  markUnread: z.boolean().optional(),
});

const updateLeadInConvSchema = z.object({
  companyName: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  notes: z.string().max(5000).optional().nullable(),
  status: z.enum(['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE']).optional(),
  city: z.string().max(100).optional().nullable(),
  niche: z.string().max(100).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  addTagId: z.string().optional(),
  removeTagId: z.string().optional(),
  addCampaignId: z.string().optional(),
  removeCampaignId: z.string().optional(),
});

conversationRouter.post('/open-by-phone', asyncHandler(async (req: Request, res: Response) => {
  const body = openByPhoneSchema.parse(req.body);
  const userId = req.user!.id;
  let account = body.accountId
    ? await prisma.whatsAppAccount.findFirst({ where: { id: body.accountId, userId } })
    : null;

  if (!account) {
    account = await prisma.whatsAppAccount.findFirst({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  if (!account) {
    account = await prisma.whatsAppAccount.create({
      data: {
        userId,
        name: 'Основной WhatsApp',
        phone: '',
        phoneMasked: 'Не привязан',
        status: 'OFFLINE',
        position: 1,
      },
    });
  }

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
    update: {
      aiState: {
        upsert: {
          create: { stage: 'NEW', isAiPaused: true },
          update: { isAiPaused: true },
        },
      },
    },
    create: {
      userId,
      accountId: account.id,
      leadId: lead.id,
      channel: 'WHATSAPP',
      status: 'NEW',
      unreadCount: 0,
      aiState: {
        create: {
          stage: 'NEW',
          isAiPaused: true,
        },
      },
    },
    include: {
      lead: { include: conversationLeadInclude },
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

  if (q.channel) where.channel = String(q.channel) as any;
  if (q.account) where.accountId = String(q.account);
  if (q.instagramAccount) where.instagramAccountId = String(q.instagramAccount);

  if (q.campaign) {
    where.lead = {
      ...(where.lead as object || {}),
      campaigns: { some: { campaignId: String(q.campaign) } },
    };
  }

  if (q.tag) {
    where.lead = {
      ...(where.lead as object || {}),
      tags: { some: { tagId: String(q.tag) } },
    };
  }

  if (q.leadStatus) {
    where.lead = {
      ...(where.lead as object || {}),
      status: String(q.leadStatus) as never,
    };
  }

  if (q.search) {
    const searchStr = String(q.search);
    const searchFilter = [
      { lead: { companyName: { contains: searchStr, mode: 'insensitive' } } },
      { lead: { phone: { contains: searchStr, mode: 'insensitive' } } },
      { lead: { instagramUsername: { contains: searchStr, mode: 'insensitive' } } },
      { lead: { notes: { contains: searchStr, mode: 'insensitive' } } },
    ];
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchFilter }];
      delete where.OR;
    } else {
      where.OR = searchFilter;
    }
  }

  const baseAccountFilter = q.account
    ? { accountId: String(q.account) }
    : q.instagramAccount
      ? { instagramAccountId: String(q.instagramAccount) }
      : {};

  const [
    items,
    total,
    countAll,
    countUnread,
    countReplied,
    countNew,
    countNoResponse,
    countClients,
    countInterested,
    countNegotiation,
  ] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        lead: { include: conversationLeadInclude },
        account: { select: { id: true, name: true, phoneMasked: true } },
        instagramAccount: { select: { id: true, name: true, username: true, status: true, aiExecutionMode: true } },
        aiState: true,
        messages: {
          include: { events: true },
          take: 1,
          orderBy: { recordedAt: 'desc' },
        },
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
        status: 'CLIENT',
      },
    }),
    prisma.conversation.count({
      where: {
        userId,
        ...baseAccountFilter,
        status: 'INTERESTED',
      },
    }),
    prisma.conversation.count({
      where: {
        userId,
        ...baseAccountFilter,
        status: 'NEGOTIATION',
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
      interested: countInterested,
      negotiation: countNegotiation,
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
    include: {
      lead: { include: conversationLeadInclude },
      account: true,
    },
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
      lead: { include: conversationLeadInclude },
      account: { select: { id: true, name: true, phoneMasked: true } },
      instagramAccount: { select: { id: true, name: true, username: true, status: true, aiExecutionMode: true } },
      aiState: true,
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
  if (body.markRead) {
    data.unreadCount = 0;
  } else if (body.markUnread) {
    data.unreadCount = 1;
    data.status = 'UNREAD';
  } else if (body.unreadCount !== undefined) {
    data.unreadCount = body.unreadCount;
  }

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data,
    include: {
      lead: { include: conversationLeadInclude },
      account: true,
    },
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

/**
 * PATCH /api/conversations/:id/lead
 * Directly update lead info, notes, status, tags, and campaigns from the dialog window!
 */
conversationRouter.patch('/:id/lead', asyncHandler(async (req: Request, res: Response) => {
  const body = updateLeadInConvSchema.parse(req.body);
  const userId = req.user!.id;
  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), userId },
    include: { lead: true },
  });
  if (!conversation) throw new NotFoundError('Conversation not found.');

  const leadId = conversation.leadId;

  // Handle Tag toggle
  if (body.addTagId) {
    await prisma.leadTag.createMany({
      data: [{ leadId, tagId: body.addTagId }],
      skipDuplicates: true,
    });
  }
  if (body.removeTagId) {
    await prisma.leadTag.deleteMany({
      where: { leadId, tagId: body.removeTagId },
    });
  }

  // Handle Campaign toggle
  if (body.addCampaignId) {
    await prisma.campaignLead.createMany({
      data: [{ leadId, campaignId: body.addCampaignId }],
      skipDuplicates: true,
    });
  }
  if (body.removeCampaignId) {
    await prisma.campaignLead.deleteMany({
      where: { leadId, campaignId: body.removeCampaignId },
    });
  }

  const data: Record<string, unknown> = {};
  if (body.companyName !== undefined) data.companyName = body.companyName.trim();
  if (body.phone !== undefined) data.phone = body.phone.replace(/\D/g, '');
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.status !== undefined) {
    data.status = body.status;
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: body.status as any },
    });
  }
  if (body.city !== undefined) data.city = body.city;
  if (body.niche !== undefined) data.niche = body.niche;
  if (body.website !== undefined) data.website = body.website;

  if (Object.keys(data).length > 0) {
    await prisma.lead.update({
      where: { id: leadId },
      data,
    });
  }

  const fullConversation = await prisma.conversation.findFirst({
    where: { id: conversation.id },
    include: {
      lead: { include: conversationLeadInclude },
      account: { select: { id: true, name: true, phoneMasked: true } },
      messages: { include: { events: true }, orderBy: { recordedAt: 'asc' } },
    },
  });

  emitToUser(userId, 'conversation.updated', fullConversation);
  res.json(fullConversation);
}));

conversationRouter.post('/mark-all-read', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { accountId } = req.body || {};
  const where: Record<string, unknown> = { userId, unreadCount: { gt: 0 } };
  if (accountId) where.accountId = String(accountId);

  await prisma.conversation.updateMany({
    where,
    data: { unreadCount: 0 },
  });

  emitToUser(userId, 'conversation.updated', { allRead: true });
  res.json({ success: true });
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

messageRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = createMessageSchema.parse(req.body);
  const userId = req.user!.id;
  const conversation = await prisma.conversation.findFirst({
    where: { id: body.conversationId, userId },
    include: { lead: true, account: true },
  });
  if (!conversation) throw new NotFoundError('Conversation not found.');

  const created = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        conversationId: body.conversationId,
        direction: body.direction,
        body: body.body,
        provenance: body.provenance,
      },
    });
    await tx.messageEvent.create({
      data: {
        messageId: msg.id,
        type: body.eventType ?? (body.direction === 'OUTBOUND' ? 'MESSAGE_SENT' : 'MESSAGE_RECEIVED'),
        name: body.direction === 'OUTBOUND' ? 'message.sent' : 'message.received',
        provenance: body.provenance,
      },
    });

    const isOutbound = body.direction === 'OUTBOUND';
    const nextStatus: ConversationStatus = isOutbound
      ? (conversation.status === 'NEW' ? 'REPLIED' : conversation.status)
      : 'UNREAD';

    const conv = await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        status: nextStatus,
        lastMessageAt: new Date(),
        lastMessagePreview: body.body.slice(0, 160),
        unreadCount: isOutbound ? conversation.unreadCount : { increment: 1 },
      },
      include: {
        lead: { include: conversationLeadInclude },
        account: true,
        messages: { include: { events: true }, orderBy: { recordedAt: 'asc' } },
      },
    });
    return { message: msg, conversation: conv };
  });

  await recordActivity({
    userId,
    action: 'MESSAGE_RECORDED',
    entity: 'MESSAGE',
    entityId: created.message.id,
    metadata: {
      direction: body.direction,
      conversationId: body.conversationId,
      accountId: conversation.accountId,
      leadId: conversation.leadId,
    },
  });

  emitToUser(userId, 'message.created', {
    ...created.message,
    conversation: created.conversation,
  });

  // Automatically recalculate AI Lead Score on new message event
  void LeadScoringEngine.recalculateOnEvent(conversation.leadId, userId);

  res.status(201).json(created);
}));

const sendSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().min(1).max(10000),
});

messageRouter.post('/send', asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, body } = sendSchema.parse(req.body);
  const userId = req.user!.id;
  const result = await sendViaGateway(userId, conversationId, body, 'TRACKED');
  res.status(201).json(result);
}));
