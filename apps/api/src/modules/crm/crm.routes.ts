import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { Prisma } from '@nexora/database';
import { asyncHandler, AppError, NotFoundError } from '../../common/errors';
import { parsePagination, paginate } from '../../common/pagination';
import { emitToUser } from '../../common/realtime/socket';
import { buildWaLink, buildExportCsv } from '@nexora/utils';
import {
  recordTimelineEvent,
  recordClientMemory,
  getLeadMemoriesGrouped,
  deleteClientMemory,
  togglePinClientMemory,
  createDeal,
  updateDealStage,
  getDeals,
  getClientFullProfile,
  recalculateLeadAiScore,
  updateBusinessProfile,
  getLeadTimeline,
  sanitizePii,
} from './crm.service';

export const crmRouter: import('express').Router = Router();

// ------------------------------------------------ Validation Schemas
const clientCreateSchema = z.object({
  contactName: z.string().max(200).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
  position: z.string().max(150).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  whatsappUrl: z.string().max(300).optional().nullable(),
  instagramUrl: z.string().max(300).optional().nullable(),
  telegram: z.string().max(100).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  niche: z.string().max(100).optional().nullable(),
  businessSize: z.enum(['MICRO', 'SMALL', 'MEDIUM', 'ENTERPRISE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE']).optional(),
  source: z.enum(['WA_LINK', 'PHONE', 'INSTAGRAM', 'WEBSITE', 'CSV', 'MANUAL']).optional(),
  assumedNeed: z.string().max(5000).optional().nullable(),
  estimatedBudget: z.number().nonnegative().optional().nullable(),
  isDecisionMaker: z.boolean().optional().nullable(),
  decisionMakerInfo: z.string().max(500).optional().nullable(),
  dealProbability: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
  customFields: z.record(z.unknown()).optional().nullable(),
  assignedAccountId: z.string().optional().nullable(),
});

const dealCreateSchema = z.object({
  leadId: z.string().min(1),
  conversationId: z.string().optional().nullable(),
  proposalId: z.string().optional().nullable(),
  title: z.string().min(1).max(200),
  stage: z.enum(['NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']).optional(),
  serviceType: z.string().max(100).optional().nullable(),
  proposalText: z.string().optional().nullable(),
  amount: z.number().nonnegative().optional().default(0),
  discount: z.number().nonnegative().optional().default(0),
  probability: z.number().min(0).max(100).optional().default(50),
  nextAction: z.string().max(300).optional().nullable(),
  followUpDate: z.string().datetime().optional().nullable(),
  lostReason: z.string().max(500).optional().nullable(),
});

const dealStageUpdateSchema = z.object({
  stage: z.enum(['NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']),
  lostReason: z.string().max(500).optional().nullable(),
});

const memoryFactSchema = z.object({
  leadId: z.string().min(1),
  conversationId: z.string().optional().nullable(),
  layer: z.enum([
    'SHORT_TERM',
    'LONG_TERM',
    'BUSINESS_FACT',
    'INTERACTION_FACT',
    'DEAL_FACT',
    'PREFERENCE',
    'OBJECTION',
    'AGREEMENT',
  ]),
  key: z.string().min(1).max(200),
  value: z.string().min(1).max(5000),
  confidence: z.number().min(0).max(1).optional().default(0.9),
  source: z.enum(['USER', 'AI', 'MANUAL']).optional().default('MANUAL'),
  isPinned: z.boolean().optional().default(false),
});

const businessProfileSchema = z.object({
  description: z.string().max(5000).optional().nullable(),
  services: z.array(z.string()).optional().nullable(),
  websiteUrl: z.string().max(300).optional().nullable(),
  socials: z.record(z.string()).optional().nullable(),
  competitors: z.array(z.string()).optional().nullable(),
  foundProblems: z.array(z.string()).optional().nullable(),
  foundOpportunities: z.array(z.string()).optional().nullable(),
  digitalMaturity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'ADVANCED']).optional(),
  automationPoints: z.array(z.string()).optional().nullable(),
});

const timelineNoteSchema = z.object({
  note: z.string().min(1).max(5000),
  dealId: z.string().optional().nullable(),
});

// ============================================================================
// CLIENT / LEAD ENDPOINTS
// ============================================================================

crmRouter.get('/clients', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { page, pageSize } = parsePagination(req.query);
  const q = req.query;

  const where: Prisma.LeadWhereInput = { userId };

  if (q.archived === 'true') {
    where.isArchived = true;
  } else {
    where.isArchived = false;
  }

  if (q.status) where.status = String(q.status) as any;
  if (q.priority) where.priority = String(q.priority) as any;
  if (q.businessSize) where.businessSize = String(q.businessSize) as any;
  if (q.city) where.city = { contains: String(q.city), mode: 'insensitive' };
  if (q.country) where.country = { contains: String(q.country), mode: 'insensitive' };
  if (q.niche) where.niche = { contains: String(q.niche), mode: 'insensitive' };
  if (q.account) where.assignedAccountId = String(q.account);

  const search = q.search ? String(q.search).trim() : '';
  if (search) {
    where.OR = [
      { contactName: { contains: search, mode: 'insensitive' } },
      { companyName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { telegram: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { niche: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        score: true,
        analysis: { select: { digitalMaturity: true, websiteStatus: true } },
        deals: { where: { isArchived: false }, select: { id: true, title: true, amount: true, stage: true } },
        tags: { include: { tag: true } },
        assignedAccount: { select: { id: true, name: true, phoneMasked: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  const sanitized = items.map((client) => ({
    ...client,
    tags: client.tags.map((t) => t.tag),
  }));

  res.json(paginate(sanitized, total, { page, pageSize }));
}));

crmRouter.get('/clients/export', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const maskPii = req.query.maskPii === 'true';

  const clients = await prisma.lead.findMany({
    where: { userId, isArchived: false },
    include: {
      score: true,
      analysis: true,
      deals: { where: { isArchived: false } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const exportData = clients.map((c) => {
    const raw = {
      id: c.id,
      contactName: c.contactName ?? '',
      companyName: c.companyName ?? '',
      position: c.position ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      telegram: c.telegram ?? '',
      whatsappUrl: c.whatsappUrl ?? '',
      website: c.website ?? '',
      city: c.city ?? '',
      country: c.country ?? '',
      niche: c.niche ?? '',
      businessSize: c.businessSize,
      priority: c.priority,
      status: c.status,
      aiScore: c.score?.score ?? '',
      grade: c.score?.grade ?? '',
      digitalMaturity: c.analysis?.digitalMaturity ?? '',
      dealProbability: c.dealProbability ?? '',
      estimatedBudget: c.estimatedBudget ?? '',
      notes: c.notes ?? '',
      createdAt: c.createdAt.toISOString(),
    };
    return maskPii ? sanitizePii(raw, { maskPhone: true, maskEmail: true }) : raw;
  });

  const csv = buildExportCsv(exportData as any);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nexora-crm-clients.csv"');
  res.send(csv);
}));

crmRouter.post('/clients', asyncHandler(async (req: Request, res: Response) => {
  const body = clientCreateSchema.parse(req.body);
  const userId = req.user!.id;

  let whatsappUrl = body.whatsappUrl ?? null;
  if (!whatsappUrl && body.phone) {
    whatsappUrl = buildWaLink(body.phone.replace(/\D/g, ''));
  }

  const client = await prisma.lead.create({
    data: {
      userId,
      contactName: body.contactName ?? null,
      companyName: body.companyName ?? null,
      position: body.position ?? null,
      phone: body.phone?.replace(/\D/g, '') ?? null,
      email: body.email || null,
      whatsappUrl,
      instagramUrl: body.instagramUrl ?? null,
      telegram: body.telegram ?? null,
      website: body.website ?? null,
      city: body.city ?? null,
      country: body.country ?? null,
      niche: body.niche ?? null,
      businessSize: body.businessSize ?? 'SMALL',
      priority: body.priority ?? 'MEDIUM',
      status: body.status ?? 'NEW',
      source: body.source ?? 'MANUAL',
      assumedNeed: body.assumedNeed ?? null,
      estimatedBudget: body.estimatedBudget ?? null,
      isDecisionMaker: body.isDecisionMaker ?? null,
      decisionMakerInfo: body.decisionMakerInfo ?? null,
      dealProbability: body.dealProbability ?? null,
      notes: body.notes ?? null,
      customFields: (body.customFields as any) ?? undefined,
      assignedAccountId: body.assignedAccountId ?? null,
    },
    include: {
      score: true,
      analysis: true,
      tags: { include: { tag: true } },
    },
  });

  await recordTimelineEvent({
    userId,
    leadId: client.id,
    eventType: 'LEAD_CREATED',
    title: `Создан новый контакт: ${client.contactName || client.companyName || 'Новый клиент'}`,
    description: `Компания: ${client.companyName || '—'}, Ниша: ${client.niche || '—'}, Приоритет: ${client.priority}`,
    metadata: { clientId: client.id },
  });

  emitToUser(userId, 'crm.client.created', client);
  res.status(201).json(client);
}));

crmRouter.get('/clients/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const client = await getClientFullProfile(userId, req.params.id);
  if (!client) throw new NotFoundError('Client profile not found.');
  res.json(client);
}));

crmRouter.patch('/clients/:id', asyncHandler(async (req: Request, res: Response) => {
  const body = clientCreateSchema.partial().parse(req.body);
  const userId = req.user!.id;

  const existing = await prisma.lead.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new NotFoundError('Client not found.');

  const updated = await prisma.lead.update({
    where: { id: existing.id },
    data: {
      contactName: body.contactName === undefined ? undefined : body.contactName,
      companyName: body.companyName === undefined ? undefined : body.companyName,
      position: body.position === undefined ? undefined : body.position,
      phone: body.phone === undefined ? undefined : body.phone?.replace(/\D/g, ''),
      email: body.email === undefined ? undefined : (body.email || null),
      whatsappUrl: body.whatsappUrl === undefined ? undefined : body.whatsappUrl,
      instagramUrl: body.instagramUrl === undefined ? undefined : body.instagramUrl,
      telegram: body.telegram === undefined ? undefined : body.telegram,
      website: body.website === undefined ? undefined : body.website,
      city: body.city === undefined ? undefined : body.city,
      country: body.country === undefined ? undefined : body.country,
      niche: body.niche === undefined ? undefined : body.niche,
      businessSize: body.businessSize,
      priority: body.priority,
      status: body.status,
      source: body.source,
      assumedNeed: body.assumedNeed === undefined ? undefined : body.assumedNeed,
      estimatedBudget: body.estimatedBudget === undefined ? undefined : body.estimatedBudget,
      isDecisionMaker: body.isDecisionMaker === undefined ? undefined : body.isDecisionMaker,
      decisionMakerInfo: body.decisionMakerInfo === undefined ? undefined : body.decisionMakerInfo,
      dealProbability: body.dealProbability === undefined ? undefined : body.dealProbability,
      notes: body.notes === undefined ? undefined : body.notes,
      customFields: body.customFields === undefined ? undefined : (body.customFields as any),
      assignedAccountId: body.assignedAccountId === undefined ? undefined : body.assignedAccountId,
    },
    include: {
      score: true,
      analysis: true,
      tags: { include: { tag: true } },
    },
  });

  if (body.status && body.status !== existing.status) {
    await recordTimelineEvent({
      userId,
      leadId: updated.id,
      eventType: 'STATUS_CHANGED',
      title: `Статус изменен на "${updated.status}"`,
      description: `Предыдущий: ${existing.status} -> Новый: ${updated.status}`,
      metadata: { fromStatus: existing.status, toStatus: updated.status },
    });
  }

  emitToUser(userId, 'crm.client.updated', updated);
  res.json(updated);
}));

crmRouter.post('/clients/:id/archive', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const existing = await prisma.lead.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new NotFoundError('Client not found.');

  const updated = await prisma.lead.update({
    where: { id: existing.id },
    data: {
      isArchived: !existing.isArchived,
      archivedAt: !existing.isArchived ? new Date() : null,
    },
  });

  await recordTimelineEvent({
    userId,
    leadId: updated.id,
    eventType: 'STATUS_CHANGED',
    title: updated.isArchived ? 'Клиент перемещен в архив' : 'Клиент восстановлен из архива',
    description: `Архивация: ${updated.isArchived}`,
  });

  emitToUser(userId, 'crm.client.archived', { id: updated.id, isArchived: updated.isArchived });
  res.json({ ok: true, isArchived: updated.isArchived });
}));

crmRouter.delete('/clients/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const existing = await prisma.lead.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new NotFoundError('Client not found.');

  await prisma.lead.delete({ where: { id: existing.id } });
  emitToUser(userId, 'crm.client.deleted', { id: existing.id });
  res.json({ ok: true });
}));

crmRouter.post('/clients/:id/recalculate-score', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const score = await recalculateLeadAiScore(userId, req.params.id);
  res.json({ ok: true, score });
}));

crmRouter.get('/clients/:id/business', asyncHandler(async (req: Request, res: Response) => {
  const analysis = await prisma.businessAnalysis.findUnique({
    where: { leadId: req.params.id },
  });
  res.json(analysis || {});
}));

crmRouter.patch('/clients/:id/business', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = businessProfileSchema.parse(req.body);
  const updated = await updateBusinessProfile(req.params.id, userId, body);
  res.json(updated);
}));

// ============================================================================
// DEAL / PIPELINE ENDPOINTS
// ============================================================================

crmRouter.get('/deals', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const stage = req.query.stage as any;
  const leadId = req.query.leadId as string | undefined;
  const isArchived = req.query.isArchived === 'true';

  const deals = await getDeals(userId, { stage, leadId, isArchived });
  res.json(deals);
}));

crmRouter.post('/deals', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = dealCreateSchema.parse(req.body);

  const deal = await createDeal({
    userId,
    leadId: body.leadId,
    conversationId: body.conversationId,
    proposalId: body.proposalId,
    title: body.title,
    stage: body.stage,
    serviceType: body.serviceType,
    proposalText: body.proposalText,
    amount: body.amount,
    discount: body.discount,
    probability: body.probability,
    nextAction: body.nextAction,
    followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
    lostReason: body.lostReason,
  });

  res.status(201).json(deal);
}));

crmRouter.get('/deals/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const deal = await prisma.deal.findFirst({
    where: { id: req.params.id, userId },
    include: {
      lead: true,
      proposal: true,
      timelineEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!deal) throw new NotFoundError('Deal not found.');
  res.json(deal);
}));

crmRouter.patch('/deals/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = dealCreateSchema.partial().parse(req.body);

  const existing = await prisma.deal.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new NotFoundError('Deal not found.');

  const updated = await prisma.deal.update({
    where: { id: existing.id },
    data: {
      title: body.title,
      serviceType: body.serviceType === undefined ? undefined : body.serviceType,
      proposalText: body.proposalText === undefined ? undefined : body.proposalText,
      amount: body.amount,
      discount: body.discount,
      probability: body.probability,
      nextAction: body.nextAction === undefined ? undefined : body.nextAction,
      followUpDate: body.followUpDate !== undefined ? (body.followUpDate ? new Date(body.followUpDate) : null) : undefined,
      lostReason: body.lostReason === undefined ? undefined : body.lostReason,
    },
    include: { lead: true, proposal: true },
  });

  emitToUser(userId, 'crm.deal.updated', updated);
  res.json(updated);
}));

crmRouter.patch('/deals/:id/stage', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { stage, lostReason } = dealStageUpdateSchema.parse(req.body);

  const updated = await updateDealStage(userId, req.params.id, stage, lostReason);
  res.json(updated);
}));

crmRouter.delete('/deals/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const existing = await prisma.deal.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new NotFoundError('Deal not found.');

  await prisma.deal.delete({ where: { id: existing.id } });
  emitToUser(userId, 'crm.deal.deleted', { id: existing.id });
  res.json({ ok: true });
}));

// ============================================================================
// 8-LAYER MEMORY ENDPOINTS
// ============================================================================

crmRouter.get('/leads/:id/memory', asyncHandler(async (req: Request, res: Response) => {
  const data = await getLeadMemoriesGrouped(req.params.id);
  res.json(data);
}));

crmRouter.post('/leads/:id/memory', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = memoryFactSchema.parse({ ...req.body, leadId: req.params.id });

  const memory = await recordClientMemory({
    leadId: body.leadId,
    conversationId: body.conversationId,
    layer: body.layer,
    key: body.key,
    value: body.value,
    confidence: body.confidence,
    source: body.source,
    isPinned: body.isPinned,
    userId,
  });

  emitToUser(userId, 'crm.memory.created', memory);
  res.status(201).json(memory);
}));

crmRouter.patch('/memory/:id/pin', asyncHandler(async (req: Request, res: Response) => {
  const updated = await togglePinClientMemory(req.params.id);
  emitToUser(req.user!.id, 'crm.memory.updated', updated);
  res.json(updated);
}));

crmRouter.delete('/memory/:id', asyncHandler(async (req: Request, res: Response) => {
  await deleteClientMemory(req.params.id);
  emitToUser(req.user!.id, 'crm.memory.deleted', { id: req.params.id });
  res.json({ ok: true });
}));

// ============================================================================
// UNIFIED TIMELINE ENDPOINTS
// ============================================================================

crmRouter.get('/leads/:id/timeline', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const timeline = await getLeadTimeline(userId, req.params.id);
  res.json(timeline);
}));

crmRouter.post('/leads/:id/timeline/note', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { note, dealId } = timelineNoteSchema.parse(req.body);

  const event = await recordTimelineEvent({
    userId,
    leadId: req.params.id,
    dealId,
    eventType: 'NOTE_ADDED',
    title: 'Добавлена заметка менеджера',
    description: note,
  });

  res.status(201).json(event);
}));
