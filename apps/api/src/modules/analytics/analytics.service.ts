import { prisma } from '@nexora/database';
import type { Prisma } from '@nexora/database';
import { granularityRange } from '@nexora/utils';

export interface GlobalMessageCounts {
  today: number;
  sevenDays: number;
  thirtyDays: number;
  allTime: number;
}

export async function getGlobalMessageCounts(userId: string): Promise<GlobalMessageCounts> {
  const now = new Date();
  const ranges = {
    today: granularityRange('TODAY', now),
    sevenDays: granularityRange('SEVEN_DAYS', now),
    thirtyDays: granularityRange('THIRTY_DAYS', now),
  } as const;

  const metrics = await prisma.accountMetric.findMany({
    where: { account: { userId } },
    select: { day: true, messagesSent: true, messagesReceived: true },
  });

  const sumInRange = (start: Date, end: Date) =>
    metrics.reduce((acc, m) => {
      if (m.day >= start && m.day <= end) acc += m.messagesSent + m.messagesReceived;
      return acc;
    }, 0);

  return {
    today: sumInRange(ranges.today.start, ranges.today.end),
    sevenDays: sumInRange(ranges.sevenDays.start, ranges.sevenDays.end),
    thirtyDays: sumInRange(ranges.thirtyDays.start, ranges.thirtyDays.end),
    allTime: metrics.reduce((acc, m) => acc + m.messagesSent + m.messagesReceived, 0),
  };
}

export interface DashboardCounters {
  totalAccounts: number;
  connectedAccounts: number;
  totalLeads: number;
  unreadConversations: number;
  messagesToday: number;
  activeCampaigns: number;
  recentMessages: Array<{
    id: string;
    conversationId: string;
    direction: 'INBOUND' | 'OUTBOUND';
    body: string;
    recordedAt: Date;
    leadName: string | null;
    leadPhone: string | null;
  }>;
  recentRiskEvents: Array<{ id: string; level: string; message: string; createdAt: Date }>;
}

function startOfDay(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getGlobalCounters(userId: string): Promise<DashboardCounters> {
  const [
    totalAccounts,
    connectedAccounts,
    totalLeads,
    unreadConversations,
    messagesToday,
    activeCampaigns,
    recentMessages,
    recentRiskEvents,
  ] = await Promise.all([
    prisma.whatsAppAccount.count({ where: { userId } }),
    prisma.whatsAppAccount.count({ where: { userId, status: 'ONLINE' } }),
    prisma.lead.count({ where: { userId } }),
    prisma.conversation.count({ where: { userId, unreadCount: { gt: 0 } } }),
    prisma.message.count({
      where: { conversation: { userId }, recordedAt: { gte: startOfDay() } },
    }),
    prisma.campaign.count({ where: { userId, status: 'ACTIVE' } }),
    prisma.message.findMany({
      where: { conversation: { userId } },
      orderBy: { recordedAt: 'desc' },
      take: 8,
      include: {
        conversation: { include: { lead: { select: { id: true, companyName: true, phone: true } } } },
      },
    }),
    prisma.riskEvent.findMany({
      where: { account: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    totalAccounts,
    connectedAccounts,
    totalLeads,
    unreadConversations,
    messagesToday,
    activeCampaigns,
    recentMessages: recentMessages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      body: m.body.slice(0, 120),
      recordedAt: m.recordedAt,
      leadName: m.conversation.lead?.companyName ?? null,
      leadPhone: m.conversation.lead?.phone ?? null,
    })),
    recentRiskEvents: recentRiskEvents.map((r) => ({
      id: r.id,
      level: r.level,
      message: r.message,
      createdAt: r.createdAt,
    })),
  };
}

export async function buildSeries(
  userId: string,
  granularity: 'day' | 'week' | 'month',
  days = 30,
): Promise<Array<{ date: string; leads: number; replies: number; interested: number; clients: number }>> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const activityEvents = await prisma.activityEvent.findMany({
    where: {
      userId,
      action: { in: ['LEAD_CREATED', 'LEAD_STATUS_CHANGED'] },
      createdAt: { gte: start, lte: end },
    },
    select: { action: true, createdAt: true, metadata: true },
  });

  const buckets = new Map<string, { leads: number; replies: number; interested: number; clients: number }>();
  const key = (d: Date) =>
    granularity === 'day'
      ? d.toISOString().slice(0, 10)
      : granularity === 'week'
        ? `${d.getFullYear()}-W${Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  for (const ev of activityEvents) {
    const k = key(ev.createdAt);
    const b = buckets.get(k) ?? { leads: 0, replies: 0, interested: 0, clients: 0 };
    if (ev.action === 'LEAD_CREATED') {
      b.leads += 1;
    } else if (ev.action === 'LEAD_STATUS_CHANGED') {
      const toStatus = (ev.metadata as { toStatus?: string } | null)?.toStatus;
      const status = (ev.metadata as { status?: string } | null)?.status;
      const s = toStatus ?? status;
      if (s === 'REPLIED' || s === 'INTERESTED' || s === 'NEGOTIATION' || s === 'CLIENT') b.replies += 1;
      if (s === 'INTERESTED' || s === 'NEGOTIATION' || s === 'CLIENT') b.interested += 1;
      if (s === 'CLIENT') b.clients += 1;
    }
    buckets.set(k, b);
  }

  return [...buckets.entries()].map(([date, v]) => ({ date, ...v }));
}

export async function getCampaignPerformance(userId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { userId },
    include: {
      leads: { include: { lead: { select: { status: true } } } },
    },
  });
  return campaigns.map((c) => {
    const leads = c.leads.map((cl) => cl.lead);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      leadsCount: leads.length,
      repliedCount: leads.filter((l) => ['REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT'].includes(l.status)).length,
      interestedCount: leads.filter((l) => ['INTERESTED', 'NEGOTIATION', 'CLIENT'].includes(l.status)).length,
      clientCount: leads.filter((l) => l.status === 'CLIENT').length,
    };
  });
}