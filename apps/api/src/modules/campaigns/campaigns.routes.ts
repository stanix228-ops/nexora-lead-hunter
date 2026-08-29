import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { CampaignStatus } from '@nexora/types';
import { granularityRange, toDayKey } from '@nexora/utils';
import { asyncHandler, AppError, NotFoundError } from '../../common/errors';
import { recordActivity } from '../../common/activity/recorder';
import { emitToUser } from '../../common/realtime/socket';

export const campaignsRouter: import('express').Router = Router();

const CAMPAIGN_STATUSES: CampaignStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'];

const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  niche: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  source: z.string().max(50).optional().nullable(),
  status: z.enum(CAMPAIGN_STATUSES as [string, ...string[]]).optional(),
});

async function campaignStats(campaignId: string) {
  const campaignLeads = await prisma.campaignLead.findMany({
    where: { campaignId },
    include: { lead: { select: { status: true } } },
  });

  const total = campaignLeads.length;
  const count = (statuses: string[]) =>
    campaignLeads.filter((cl) => statuses.includes(cl.lead.status)).length;

  const contacted = count(['CONTACTED', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE']);
  const replies = count(['REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT']);
  const interested = count(['INTERESTED', 'NEGOTIATION', 'CLIENT']);
  const negotiations = count(['NEGOTIATION']);
  const clients = count(['CLIENT']);
  const conversionRate = total > 0 ? (clients / total) * 100 : 0;

  // Message counters for the campaign's leads, per granularity.
  const leadIds = campaignLeads.map((cl) => cl.leadId);
  const conversations = await prisma.conversation.findMany({
    where: { leadId: { in: leadIds } },
    select: { messages: { select: { recordedAt: true } } },
  });
  const allRecorded = conversations.flatMap((c) => c.messages).map((m) => m.recordedAt);
  const now = new Date();
  const inRange = (start: Date, end: Date) =>
    allRecorded.filter((at) => at >= start && at <= end).length;

  const counters = {
    TODAY: inRange(granularityRange('TODAY', now).start, now),
    SEVEN_DAYS: inRange(granularityRange('SEVEN_DAYS', now).start, now),
    THIRTY_DAYS: inRange(granularityRange('THIRTY_DAYS', now).start, now),
    ALL_TIME: allRecorded.length,
  };

  return {
    leads: total,
    contacted,
    replies,
    interested,
    negotiations,
    clients,
    conversionRate: Math.round(conversionRate * 100) / 100,
    counters,
  };
}

function daysBack(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

async function campaignSeries(campaignId: string, days = 30) {
  const start = daysBack(days);
  const [campaignLeads, statusChanges, conversations] = await Promise.all([
    prisma.campaignLead.findMany({
      where: { campaignId, addedAt: { gte: start } },
      select: { addedAt: true },
    }),
    prisma.activityEvent.findMany({
      where: {
        action: 'LEAD_STATUS_CHANGED',
        metadata: { path: ['campaignIds'], array_contains: campaignId },
        createdAt: { gte: start },
      },
      select: { createdAt: true, metadata: true },
    }),
    prisma.campaignLead.findMany({
      where: { campaignId },
      select: { lead: { select: { conversations: { select: { messages: { select: { recordedAt: true } } } } } } },
    }),
  ]);

  const dayBuckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return toDayKey(d);
  });

  const inDay = <T extends { createdAt?: Date; addedAt?: Date }>(items: T[], key: string) =>
    items.filter((i) => toDayKey(i.createdAt ?? i.addedAt!) === key).length;

  const replyMsgs = conversations.flatMap((cl) =>
    cl.lead.conversations.flatMap((c) => c.messages),
  );

  return dayBuckets.map((day) => ({
    day,
    leads: campaignLeads.filter((cl) => toDayKey(cl.addedAt) === day).length,
    replies: replyMsgs.filter((m) => toDayKey(m.recordedAt) === day).length,
    interested: statusChanges.filter(
      (e) => toDayKey(e.createdAt) === day && (e.metadata as { toStatus?: string } | null)?.toStatus === 'INTERESTED',
    ).length,
    clients: statusChanges.filter(
      (e) => toDayKey(e.createdAt) === day && (e.metadata as { toStatus?: string } | null)?.toStatus === 'CLIENT',
    ).length,
  }));
}

campaignsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const campaigns = await prisma.campaign.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  });
  const items = await Promise.all(
    campaigns.map(async (campaign) => ({
      campaign,
      ...(await campaignStats(campaign.id)),
    })),
  );
  res.json({ items });
}));

campaignsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = campaignSchema.parse(req.body);
  const campaign = await prisma.campaign.create({
    data: {
      userId: req.user!.id,
      name: body.name,
      description: body.description ?? null,
      niche: body.niche ?? null,
      city: body.city ?? null,
      source: body.source ?? null,
      status: (body.status as CampaignStatus | undefined) ?? 'DRAFT',
    },
  });
  await recordActivity({
    userId: req.user!.id,
    action: 'CAMPAIGN_CREATED',
    entity: 'CAMPAIGN',
    entityId: campaign.id,
    metadata: { name: campaign.name },
  });
  emitToUser(req.user!.id, 'campaign.created', campaign);
  res.status(201).json({ campaign, ...(await campaignStats(campaign.id)) });
}));

campaignsRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
  });
  if (!campaign) throw new NotFoundError('Campaign not found.');
  const [stats, series] = await Promise.all([
    campaignStats(campaign.id),
    campaignSeries(campaign.id),
  ]);
  res.json({ campaign, ...stats, series });
}));

campaignsRouter.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const body = campaignSchema.partial().parse(req.body);
  const userId = req.user!.id;
  const campaign = await prisma.campaign.findFirst({ where: { id: String(req.params.id), userId } });
  if (!campaign) throw new NotFoundError('Campaign not found.');
  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      name: body.name ?? undefined,
      description: body.description === undefined ? undefined : body.description,
      niche: body.niche === undefined ? undefined : body.niche,
      city: body.city === undefined ? undefined : body.city,
      source: body.source === undefined ? undefined : body.source,
      status: body.status as CampaignStatus | undefined,
    },
  });
  await recordActivity({
    userId,
    action:
      body.status && body.status !== campaign.status
        ? ('CAMPAIGN_STATUS_CHANGED' as const)
        : ('CAMPAIGN_UPDATED' as const),
    entity: 'CAMPAIGN',
    entityId: campaign.id,
    metadata: { status: body.status ?? undefined, name: updated.name },
  });
  emitToUser(userId, 'campaign.updated', updated);
  res.json({ campaign: updated, ...(await campaignStats(campaign.id)) });
}));

campaignsRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const campaign = await prisma.campaign.findFirst({ where: { id: String(req.params.id), userId } });
  if (!campaign) throw new NotFoundError('Campaign not found.');
  await prisma.campaign.delete({ where: { id: campaign.id } });
  await recordActivity({
    userId,
    action: 'CAMPAIGN_UPDATED',
    entity: 'CAMPAIGN',
    entityId: campaign.id,
    metadata: { deleted: true, name: campaign.name },
  });
  emitToUser(userId, 'campaign.deleted', { id: campaign.id });
  res.json({ ok: true });
}));

const addLeadsSchema = z.object({
  leadIds: z.array(z.string()).min(1).max(5000),
});

campaignsRouter.post('/:id/leads', asyncHandler(async (req: Request, res: Response) => {
  const body = addLeadsSchema.parse(req.body);
  const userId = req.user!.id;
  const campaign = await prisma.campaign.findFirst({ where: { id: String(req.params.id), userId } });
  if (!campaign) throw new NotFoundError('Campaign not found.');

  const ownLeads = await prisma.lead.findMany({
    where: { id: { in: body.leadIds }, userId },
    select: { id: true },
  });
  const ids = ownLeads.map((l) => l.id);
  await prisma.campaignLead.createMany({
    data: ids.map((leadId) => ({ campaignId: campaign.id, leadId })),
    skipDuplicates: true,
  });
  await recordActivity({
    userId,
    action: 'CAMPAIGN_UPDATED',
    entity: 'CAMPAIGN',
    entityId: campaign.id,
    metadata: { addedLeads: ids.length },
  });
  emitToUser(userId, 'campaign.updated', campaign);
  res.json({ ok: true, added: ids.length });
}));

campaignsRouter.delete('/:id/leads', asyncHandler(async (req: Request, res: Response) => {
  const body = addLeadsSchema.parse(req.body);
  const userId = req.user!.id;
  const campaign = await prisma.campaign.findFirst({ where: { id: String(req.params.id), userId } });
  if (!campaign) throw new NotFoundError('Campaign not found.');
  await prisma.campaignLead.deleteMany({
    where: { campaignId: campaign.id, leadId: { in: body.leadIds } },
  });
  await recordActivity({
    userId,
    action: 'CAMPAIGN_UPDATED',
    entity: 'CAMPAIGN',
    entityId: campaign.id,
    metadata: { removedLeads: body.leadIds.length },
  });
  emitToUser(userId, 'campaign.updated', campaign);
  res.json({ ok: true, removed: body.leadIds.length });
}));