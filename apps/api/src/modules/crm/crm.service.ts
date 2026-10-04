import { prisma } from '@nexora/database';
import type {
  BusinessSize,
  LeadPriority,
  LeadStatus,
  DealStageEnum,
  MemoryLayer,
  MemoryFactSource,
  TimelineEventType,
  DigitalMaturity,
} from '@nexora/types';
import { scoreLead } from '../ai/scoring.service';
import { logger } from '../../common/logger';
import { emitToUser } from '../../common/realtime/socket';

// ------------------------------------------------ PII Protection / Sanitization
export interface PiiMaskOptions {
  maskPhone?: boolean;
  maskEmail?: boolean;
}

export function sanitizePii<T extends Record<string, any>>(data: T, options: PiiMaskOptions = {}): T {
  const result: Record<string, any> = { ...data };
  if (options.maskPhone && typeof result['phone'] === 'string' && result['phone'].length > 4) {
    const raw = result['phone'];
    result['phone'] = raw.slice(0, 3) + '***' + raw.slice(-2);
  }
  if (options.maskEmail && typeof result['email'] === 'string' && result['email'].includes('@')) {
    const [local, domain] = result['email'].split('@');
    result['email'] = (local ? local.slice(0, 2) : '') + '***@' + (domain || '');
  }
  return result as T;
}

// ------------------------------------------------ Unified Timeline Service
export interface CreateTimelineEventParams {
  userId: string;
  leadId?: string | null;
  dealId?: string | null;
  conversationId?: string | null;
  eventType: TimelineEventType;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordTimelineEvent(params: CreateTimelineEventParams) {
  try {
    const event = await prisma.timelineEvent.create({
      data: {
        userId: params.userId,
        leadId: params.leadId ?? null,
        dealId: params.dealId ?? null,
        conversationId: params.conversationId ?? null,
        eventType: params.eventType,
        title: params.title,
        description: params.description ?? null,
        metadata: (params.metadata as any) ?? undefined,
      },
    });

    emitToUser(params.userId, 'crm.timeline.created', event);
    return event;
  } catch (error) {
    logger.warn('Failed to record CRM timeline event', { error: String(error) });
    return null;
  }
}

export async function getLeadTimeline(userId: string, leadId: string) {
  return prisma.timelineEvent.findMany({
    where: { userId, leadId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

// ------------------------------------------------ 8-Layer Memory System
export interface RecordClientMemoryParams {
  leadId: string;
  conversationId?: string | null;
  layer: MemoryLayer;
  key: string;
  value: string;
  confidence?: number;
  source?: MemoryFactSource;
  isPinned?: boolean;
  userId?: string;
}

export async function recordClientMemory(params: RecordClientMemoryParams) {
  // Deduplicate: find existing memory with same key & layer for this lead
  const existing = await prisma.clientMemory.findFirst({
    where: {
      leadId: params.leadId,
      layer: params.layer,
      key: params.key,
    },
  });

  let memory;
  if (existing) {
    memory = await prisma.clientMemory.update({
      where: { id: existing.id },
      data: {
        value: params.value,
        confidence: params.confidence ?? existing.confidence,
        conversationId: params.conversationId ?? existing.conversationId,
        source: params.source ?? existing.source,
        isPinned: params.isPinned !== undefined ? params.isPinned : existing.isPinned,
        updatedAt: new Date(),
      },
    });
  } else {
    memory = await prisma.clientMemory.create({
      data: {
        leadId: params.leadId,
        conversationId: params.conversationId ?? null,
        layer: params.layer,
        key: params.key,
        value: params.value,
        confidence: params.confidence ?? 0.9,
        source: params.source ?? 'AI',
        isPinned: params.isPinned ?? false,
      },
    });
  }

  if (params.userId) {
    recordTimelineEvent({
      userId: params.userId,
      leadId: params.leadId,
      conversationId: params.conversationId,
      eventType: 'MEMORY_RECORDED',
      title: `Сохранен факт в память (${params.layer})`,
      description: `${params.key}: ${params.value}`,
      metadata: { layer: params.layer, memoryId: memory.id },
    }).catch(() => {});
  }

  return memory;
}

export async function getLeadMemoriesGrouped(leadId: string) {
  const memories = await prisma.clientMemory.findMany({
    where: { leadId },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: 60,
  });

  const layers: Record<MemoryLayer, typeof memories> = {
    SHORT_TERM: [],
    LONG_TERM: [],
    BUSINESS_FACT: [],
    INTERACTION_FACT: [],
    DEAL_FACT: [],
    PREFERENCE: [],
    OBJECTION: [],
    AGREEMENT: [],
  };

  for (const mem of memories) {
    if (layers[mem.layer]) {
      layers[mem.layer].push(mem);
    }
  }

  return { memories, layers };
}

export async function buildStructuredMemoryPrompt(
  leadId: string,
  options: { maxFactsPerLayer?: number; maxTotalFacts?: number; preloadedMemories?: any[] } = {},
): Promise<string> {
  const maxPerLayer = options.maxFactsPerLayer || 3;
  const maxTotal = options.maxTotalFacts || 12;

  let memories: any[];
  if (options.preloadedMemories && options.preloadedMemories.length > 0) {
    memories = options.preloadedMemories;
  } else {
    const res = await getLeadMemoriesGrouped(leadId);
    memories = res.memories;
  }

  if (!memories || memories.length === 0) {
    return 'Структурированная память клиента: факты еще не зафиксированы.';
  }

  const layerTitles: Record<MemoryLayer, string> = {
    SHORT_TERM: 'Кратковременная память диалога',
    LONG_TERM: 'Долговременная память клиента',
    BUSINESS_FACT: 'Факты о бизнесе',
    INTERACTION_FACT: 'История взаимодействий',
    DEAL_FACT: 'История сделок',
    PREFERENCE: 'Предпочтения клиента',
    OBJECTION: 'Зафиксированные возражения',
    AGREEMENT: 'Договоренности и обязательства',
  };

  const sections: string[] = ['=== СТРУКТУРИРОВАННАЯ ПАМЯТЬ КЛИЕНТА (8 СЛОЕВ) ==='];

  const grouped: Record<string, string[]> = {};
  let totalAdded = 0;

  for (const m of memories) {
    if (totalAdded >= maxTotal) break;
    const title = layerTitles[m.layer as MemoryLayer] || m.layer;
    if (!grouped[title]) grouped[title] = [];
    if (grouped[title].length < maxPerLayer) {
      grouped[title].push(`• [${m.key}] ${m.value}${m.isPinned ? ' 📌' : ''}`);
      totalAdded++;
    }
  }

  for (const [title, items] of Object.entries(grouped)) {
    if (items.length > 0) {
      sections.push(`\n[${title}]:`);
      sections.push(items.join('\n'));
    }
  }

  return sections.join('\n');
}

export async function deleteClientMemory(memoryId: string) {
  return prisma.clientMemory.delete({ where: { id: memoryId } });
}

export async function togglePinClientMemory(memoryId: string) {
  const existing = await prisma.clientMemory.findUnique({ where: { id: memoryId } });
  if (!existing) throw new Error('Memory fact not found');
  return prisma.clientMemory.update({
    where: { id: memoryId },
    data: { isPinned: !existing.isPinned },
  });
}

// ------------------------------------------------ Deal & Pipeline Service
export interface CreateDealParams {
  userId: string;
  leadId: string;
  conversationId?: string | null;
  proposalId?: string | null;
  title: string;
  stage?: DealStageEnum;
  serviceType?: string | null;
  proposalText?: string | null;
  amount?: number;
  discount?: number;
  probability?: number;
  nextAction?: string | null;
  followUpDate?: Date | null;
  lostReason?: string | null;
}

export async function createDeal(params: CreateDealParams) {
  const deal = await prisma.deal.create({
    data: {
      userId: params.userId,
      leadId: params.leadId,
      conversationId: params.conversationId ?? null,
      proposalId: params.proposalId ?? null,
      title: params.title,
      stage: params.stage ?? 'NEW',
      serviceType: params.serviceType ?? null,
      proposalText: params.proposalText ?? null,
      amount: params.amount ?? 0,
      discount: params.discount ?? 0,
      probability: params.probability ?? 50,
      nextAction: params.nextAction ?? null,
      followUpDate: params.followUpDate ?? null,
      lostReason: params.lostReason ?? null,
    },
    include: {
      lead: { select: { id: true, contactName: true, companyName: true, phone: true } },
      proposal: true,
    },
  });

  await recordTimelineEvent({
    userId: params.userId,
    leadId: params.leadId,
    dealId: deal.id,
    conversationId: params.conversationId,
    eventType: 'DEAL_CREATED',
    title: `Создана новая сделка: ${deal.title}`,
    description: `Сумма: ${deal.amount} руб., этап: ${deal.stage}`,
    metadata: { dealId: deal.id, amount: deal.amount, stage: deal.stage },
  });

  emitToUser(params.userId, 'crm.deal.created', deal);
  return deal;
}

export async function updateDealStage(
  userId: string,
  dealId: string,
  stage: DealStageEnum,
  lostReason?: string | null,
) {
  const existing = await prisma.deal.findFirst({ where: { id: dealId, userId } });
  if (!existing) throw new Error('Deal not found');

  const oldStage = existing.stage;
  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage,
      lostReason: stage === 'LOST' ? (lostReason ?? existing.lostReason) : null,
      probability: stage === 'WON' ? 100 : stage === 'LOST' ? 0 : existing.probability,
    },
    include: {
      lead: { select: { id: true, contactName: true, companyName: true, phone: true } },
      proposal: true,
    },
  });

  await recordTimelineEvent({
    userId,
    leadId: deal.leadId,
    dealId: deal.id,
    eventType: 'DEAL_STAGE_CHANGED',
    title: `Сделка перемещена на этап: ${stage}`,
    description: `Предыдущий этап: ${oldStage} -> ${stage}${lostReason ? `. Причина: ${lostReason}` : ''}`,
    metadata: { dealId: deal.id, fromStage: oldStage, toStage: stage, lostReason },
  });

  // If deal won, also update lead status if not already CLIENT
  if (stage === 'WON') {
    await prisma.lead.update({
      where: { id: deal.leadId },
      data: { status: 'CLIENT' },
    });
  }

  emitToUser(userId, 'crm.deal.updated', deal);
  return deal;
}

export async function getDeals(userId: string, filters: { stage?: DealStageEnum; leadId?: string; isArchived?: boolean } = {}) {
  return prisma.deal.findMany({
    where: {
      userId,
      stage: filters.stage,
      leadId: filters.leadId,
      isArchived: filters.isArchived ?? false,
    },
    include: {
      lead: {
        select: {
          id: true,
          contactName: true,
          companyName: true,
          phone: true,
          email: true,
          city: true,
        },
      },
      proposal: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

// ------------------------------------------------ CRM Client / Lead Details & Actions
export async function getClientFullProfile(userId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId },
    include: {
      analysis: true,
      score: true,
      deals: {
        where: { isArchived: false },
        orderBy: { createdAt: 'desc' },
        include: { proposal: true },
      },
      clientMemories: {
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      },
      tags: { include: { tag: true } },
      assignedAccount: { select: { id: true, name: true, phoneMasked: true } },
      conversations: {
        take: 5,
        orderBy: { lastMessageAt: 'desc' },
        include: { messages: { take: 10, orderBy: { recordedAt: 'desc' } } },
      },
      timelineEvents: {
        take: 30,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!lead) return null;

  const { layers } = await getLeadMemoriesGrouped(leadId);

  return {
    ...lead,
    memoryLayers: layers,
  };
}

export async function recalculateLeadAiScore(userId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId },
  });
  if (!lead) throw new Error('Lead not found');

  const scored = await scoreLead(leadId);

  await recordTimelineEvent({
    userId,
    leadId,
    eventType: 'AI_SCORED',
    title: `AI пересчитал скоринг: ${scored.score}/100 (${scored.grade})`,
    description: `Рекомендация: ${scored.recommendedService}. Причины: ${scored.reasons?.join(', ')}`,
    metadata: { score: scored.score, grade: scored.grade, service: scored.recommendedService },
  });

  emitToUser(userId, 'crm.lead.scored', { leadId, score: scored });
  return scored;
}

export async function updateBusinessProfile(
  leadId: string,
  userId: string,
  data: {
    description?: string | null;
    services?: string[] | null;
    websiteUrl?: string | null;
    socials?: Record<string, string> | null;
    competitors?: string[] | null;
    foundProblems?: string[] | null;
    foundOpportunities?: string[] | null;
    digitalMaturity?: DigitalMaturity;
    automationPoints?: string[] | null;
  },
) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, userId } });
  if (!lead) throw new Error('Lead not found');

  const analysis = await prisma.businessAnalysis.upsert({
    where: { leadId },
    update: {
      description: data.description ?? undefined,
      services: (data.services as any) ?? undefined,
      websiteUrl: data.websiteUrl ?? undefined,
      socials: (data.socials as any) ?? undefined,
      competitors: (data.competitors as any) ?? undefined,
      foundProblems: (data.foundProblems as any) ?? undefined,
      foundOpportunities: (data.foundOpportunities as any) ?? undefined,
      digitalMaturity: data.digitalMaturity,
      automationPoints: (data.automationPoints as any) ?? undefined,
    },
    create: {
      leadId,
      description: data.description ?? undefined,
      services: (data.services as any) ?? undefined,
      websiteUrl: data.websiteUrl ?? undefined,
      socials: (data.socials as any) ?? undefined,
      competitors: (data.competitors as any) ?? undefined,
      foundProblems: (data.foundProblems as any) ?? undefined,
      foundOpportunities: (data.foundOpportunities as any) ?? undefined,
      digitalMaturity: data.digitalMaturity ?? 'LOW',
      automationPoints: (data.automationPoints as any) ?? undefined,
    },
  });

  await recordTimelineEvent({
    userId,
    leadId,
    eventType: 'AI_ANALYZED',
    title: 'Обновлен цифровой профиль и анализ бизнеса',
    description: `Зрелость: ${analysis.digitalMaturity}. Проблем найдено: ${(data.foundProblems || []).length}`,
    metadata: { digitalMaturity: analysis.digitalMaturity },
  });

  return analysis;
}

