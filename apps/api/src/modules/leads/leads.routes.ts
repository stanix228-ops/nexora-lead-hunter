import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { Prisma } from '@nexora/database';
import type { LeadStatus } from '@nexora/types';
import { buildWaLink, buildExportCsv } from '@nexora/utils';
import { asyncHandler, AppError, NotFoundError } from '../../common/errors';
import { parsePagination, paginate } from '../../common/pagination';
import { recordActivity } from '../../common/activity/recorder';
import { emitToUser } from '../../common/realtime/socket';

export const leadsRouter: import('express').Router = Router();

const LEAD_STATUSES: LeadStatus[] = [
  'NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE',
];

const leadCreateSchema = z.object({
  companyName: z.string().max(200).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  whatsappUrl: z.string().max(300).optional().nullable(),
  instagramUrl: z.string().max(300).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  niche: z.string().max(100).optional().nullable(),
  status: z.enum(LEAD_STATUSES as [string, ...string[]]).optional(),
  source: z.enum(['WA_LINK', 'PHONE', 'INSTAGRAM', 'WEBSITE', 'CSV', 'MANUAL']).optional(),
  notes: z.string().max(5000).optional().nullable(),
  assignedAccountId: z.string().optional().nullable(),
});

function buildWhere(req: Request) {
  const q = req.query;
  const userId = req.user!.id;
  const where: Record<string, unknown> = { userId };

  if (q.status) where.status = String(q.status);
  if (q.account) where.assignedAccountId = String(q.account);
  if (q.city) where.city = { contains: String(q.city), mode: 'insensitive' } as never;
  if (q.niche) where.niche = String(q.niche);
  if (q.source) where.source = String(q.source);

  if (q.dateFrom) {
    where.createdAt = { ...(where.createdAt as object ?? {}), gte: new Date(String(q.dateFrom)) };
  }
  if (q.dateTo) {
    where.createdAt = { ...(where.createdAt as object ?? {}), lte: new Date(String(q.dateTo)) };
  }

  const search = q.search ? String(q.search).trim() : '';
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { whatsappUrl: { contains: search, mode: 'insensitive' } },
      { instagramUrl: { contains: search, mode: 'insensitive' } },
      { website: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (q.campaign && where.OR === undefined) {
    where.campaigns = { some: { campaignId: String(q.campaign) } };
  } else if (q.campaign) {
    (where.OR as unknown[]).push({ campaigns: { some: { campaignId: String(q.campaign) } } });
  }

  if (q.tag) where.tags = { some: { tagId: String(q.tag) } };

  return where as Prisma.LeadWhereInput;
}

const leadInclude = {
  tags: { include: { tag: true } },
  campaigns: { include: { campaign: true } },
  assignedAccount: { select: { id: true, name: true, phoneMasked: true } },
} as const;

type LeadWithRelations = {
  [key: string]: unknown;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  campaigns: Array<{ campaign: { id: string; name: string } }>;
  assignedAccount: { id: string; name: string; phoneMasked: string } | null;
};

function serializeLead(lead: LeadWithRelations) {
  const { tags, campaigns, assignedAccount, ...rest } = lead;
  return {
    ...rest,
    tags: tags.map((t) => t.tag),
    campaigns: campaigns.map((c) => c.campaign),
    assignedAccount,
  };
}

leadsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = parsePagination(req.query);
  const where = buildWhere(req);
  const sortBy = String(req.query.sortBy ?? 'createdAt');
  const sortDir = String(req.query.sortDir ?? 'desc') === 'asc' ? 'asc' : 'desc';

  const allowSort = ['createdAt', 'companyName', 'status', 'city', 'phone', 'updatedAt'];
  const orderBy = allowSort.includes(sortBy)
    ? { [sortBy]: sortDir }
    : { createdAt: 'desc' as const };

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: leadInclude,
      orderBy: orderBy as never,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  res.json(paginate(items.map(serializeLead), total, { page, pageSize }));
}));

leadsRouter.get('/export', asyncHandler(async (req: Request, res: Response) => {
  const where = buildWhere(req);
  const leads = await prisma.lead.findMany({
    where,
    include: { assignedAccount: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const csv = buildExportCsv(
    leads.map((l) => ({
      ...l,
      assignedAccountId: l.assignedAccount?.name ?? null,
    })),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nexora-leads.csv"');
  res.send(csv);
}));

leadsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = leadCreateSchema.parse(req.body);
  const userId = req.user!.id;

  const source = body.source ?? 'MANUAL';
  let whatsappUrl = body.whatsappUrl ?? null;
  if (!whatsappUrl && body.phone) whatsappUrl = buildWaLink(body.phone.replace(/\D/g, ''));

  const lead = await prisma.lead.create({
    data: {
      userId,
      companyName: body.companyName ?? null,
      phone: body.phone?.replace(/\D/g, '') ?? null,
      whatsappUrl,
      instagramUrl: body.instagramUrl ?? null,
      website: body.website ?? null,
      city: body.city ?? null,
      niche: body.niche ?? null,
      status: (body.status as LeadStatus | undefined) ?? 'NEW',
      source,
      notes: body.notes ?? null,
      assignedAccountId: body.assignedAccountId ?? null,
    },
    include: leadInclude,
  });

  await recordActivity({
    userId,
    action: 'LEAD_CREATED',
    entity: 'LEAD',
    entityId: lead.id,
    metadata: { companyName: lead.companyName },
  });
  emitToUser(userId, 'lead.created', serializeLead(lead));
  res.status(201).json(serializeLead(lead));
}));

leadsRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const lead = await prisma.lead.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
    include: {
      ...leadInclude,
      conversations: {
        include: { account: { select: { id: true, name: true } }, messages: true },
        take: 10,
        orderBy: { lastMessageAt: 'desc' },
      },
    },
  });
  if (!lead) throw new NotFoundError('Lead not found.');
  res.json(serializeLead(lead));
}));

leadsRouter.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const body = leadCreateSchema.partial().parse(req.body);
  const userId = req.user!.id;
  const lead = await prisma.lead.findFirst({ where: { id: String(req.params.id), userId } });
  if (!lead) throw new NotFoundError('Lead not found.');

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      companyName: body.companyName === undefined ? undefined : body.companyName,
      phone: body.phone === undefined ? undefined : body.phone?.replace(/\D/g, ''),
      whatsappUrl: body.whatsappUrl === undefined ? undefined :
        body.whatsappUrl ?? (body.phone ? buildWaLink(body.phone.replace(/\D/g, '')) : undefined),
      instagramUrl: body.instagramUrl === undefined ? undefined : body.instagramUrl,
      website: body.website === undefined ? undefined : body.website,
      city: body.city === undefined ? undefined : body.city,
      niche: body.niche === undefined ? undefined : body.niche,
      status: body.status as LeadStatus | undefined,
      source: body.source ?? undefined,
      notes: body.notes === undefined ? undefined : body.notes,
      assignedAccountId:
        body.assignedAccountId === undefined ? undefined : body.assignedAccountId,
    },
    include: leadInclude,
  });

  const leadCampaigns = await prisma.campaignLead.findMany({
    where: { leadId: lead.id },
    select: { campaignId: true },
  });
  await recordActivity({
    userId,
    action:
      body.status && body.status !== lead.status
        ? ('LEAD_STATUS_CHANGED' as const)
        : ('LEAD_EDITED' as const),
    entity: 'LEAD',
    entityId: updated.id,
    leadId: updated.id,
    metadata: {
      fromStatus: body.status ? lead.status : undefined,
      toStatus: body.status ?? undefined,
      accountId: body.assignedAccountId ?? undefined,
      campaignIds: leadCampaigns.map((c) => c.campaignId),
    },
  });
  emitToUser(userId, 'lead.updated', serializeLead(updated));
  res.json(serializeLead(updated));
}));

leadsRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const lead = await prisma.lead.findFirst({ where: { id: String(req.params.id), userId } });
  if (!lead) throw new NotFoundError('Lead not found.');
  await prisma.lead.delete({ where: { id: lead.id } });
  await recordActivity({
    userId,
    action: 'LEAD_EDITED',
    entity: 'LEAD',
    entityId: lead.id,
    metadata: { deleted: true, companyName: lead.companyName },
  });
  emitToUser(userId, 'lead.deleted', { id: lead.id });
  res.json({ ok: true });
}));

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(1000),
  action: z.enum([
    'ASSIGN_ACCOUNT',
    'ADD_TAG',
    'REMOVE_TAG',
    'ASSIGN_CAMPAIGN',
    'SET_STATUS',
    'DELETE',
  ]),
  payload: z.record(z.unknown()).optional().default({}),
});

leadsRouter.post('/bulk', asyncHandler(async (req: Request, res: Response) => {
  const { ids, action, payload } = bulkSchema.parse(req.body);
  const userId = req.user!.id;
  const target = await prisma.lead.findMany({ where: { id: { in: ids }, userId }, select: { id: true } });
  const validIds = target.map((t) => t.id);
  if (validIds.length === 0) {
    res.json({ ok: true, affected: 0 });
    return;
  }

  let affected = 0;
  switch (action) {
    case 'ASSIGN_ACCOUNT': {
      const accountId = String(payload.accountId ?? '');
      if (!accountId) throw new AppError(400, 'accountId is required.');
      const account = await prisma.whatsAppAccount.findFirst({ where: { id: accountId, userId } });
      if (!account) throw new NotFoundError('Account not found.');
      const result = await prisma.lead.updateMany({ where: { id: { in: validIds }, userId }, data: { assignedAccountId: accountId } });
      affected = result.count;
      await recordActivity({ userId, action: 'LEAD_ASSIGNED', entity: 'LEAD', metadata: { action, accountId, count: affected } });
      break;
    }
    case 'ADD_TAG': {
      const tagId = String(payload.tagId ?? '');
      const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
      if (!tag) throw new NotFoundError('Tag not found.');
      const existing = await prisma.leadTag.findMany({ where: { tagId, leadId: { in: validIds } }, select: { leadId: true } });
      const existingIds = new Set(existing.map((e) => e.leadId));
      await prisma.leadTag.createMany({
        data: validIds.filter((id) => !existingIds.has(id)).map((leadId) => ({ leadId, tagId })),
        skipDuplicates: true,
      });
      affected = validIds.length;
      await recordActivity({ userId, action: 'TAG_ADDED', entity: 'LEAD', metadata: { tagId, tagName: tag.name, count: affected } });
      break;
    }
    case 'REMOVE_TAG': {
      const tagId = String(payload.tagId ?? '');
      if (!tagId) throw new AppError(400, 'tagId is required.');
      const result = await prisma.leadTag.deleteMany({ where: { tagId, leadId: { in: validIds } } });
      affected = result.count;
      await recordActivity({ userId, action: 'TAG_REMOVED', entity: 'LEAD', metadata: { tagId, count: affected } });
      break;
    }
    case 'ASSIGN_CAMPAIGN': {
      const campaignId = String(payload.campaignId ?? '');
      const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } });
      if (!campaign) throw new NotFoundError('Campaign not found.');
      await prisma.campaignLead.createMany({
        data: validIds.map((leadId) => ({ campaignId, leadId })),
        skipDuplicates: true,
      });
      affected = validIds.length;
      await recordActivity({ userId, action: 'CAMPAIGN_UPDATED', entity: 'CAMPAIGN', entityId: campaignId, metadata: { action, count: affected } });
      break;
    }
    case 'SET_STATUS': {
      const status = String(payload.status ?? '');
      if (!LEAD_STATUSES.includes(status as LeadStatus)) throw new AppError(400, 'Invalid status.');
      const result = await prisma.lead.updateMany({ where: { id: { in: validIds }, userId }, data: { status: status as LeadStatus } });
      affected = result.count;
      const campaignLinks = await prisma.campaignLead.findMany({ where: { leadId: { in: validIds } }, select: { campaignId: true } });
      await recordActivity({
        userId,
        action: 'LEAD_STATUS_CHANGED',
        entity: 'LEAD',
        metadata: { status, count: affected, campaignIds: campaignLinks.map((c) => c.campaignId) },
      });
      break;
    }
    case 'DELETE': {
      const result = await prisma.lead.deleteMany({ where: { id: { in: validIds }, userId } });
      affected = result.count;
      await recordActivity({ userId, action: 'LEAD_EDITED', entity: 'LEAD', metadata: { deleted: true, count: affected } });
      break;
    }
  }

  emitToUser(userId, 'leads.bulk.updated', { action, ids: validIds });
  res.json({ ok: true, affected, action });
}));