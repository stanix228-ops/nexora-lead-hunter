import { prisma } from '@nexora/database';
import type { MessageCounter } from '@nexora/types';
import { granularityRange } from '@nexora/utils';

type MetricLike = {
  day: Date;
  messagesSent: number;
  messagesReceived: number;
  replies: number;
  activeConversations: number;
};

/**
 * Message counters per account. Computed from tracked AccountMetric rows.
 * Active conversations come from real Conversation rows with recent
 * activity — everything is derived from stored (tracked) data.
 */
export async function getAccountCounters(account: {
  id: string;
}): Promise<MessageCounter> {
  const now = new Date();
  const [metrics, conv] = await Promise.all([
    prisma.accountMetric.findMany({ where: { accountId: account.id } }),
    prisma.conversation.count({
      where: {
        accountId: account.id,
        lastMessageAt: { gte: granularityRange('SEVEN_DAYS', now).start },
      },
    }),
  ]);

  const sumInRange = (start: Date, end: Date) =>
    metrics.reduce((acc, m) => {
      if (m.day >= start && m.day <= end) {
        acc += m.messagesSent + m.messagesReceived;
      }
      return acc;
    }, 0);

  const today = granularityRange('TODAY', now);
  const seven = granularityRange('SEVEN_DAYS', now);
  const thirty = granularityRange('THIRTY_DAYS', now);

  const replies = metrics.reduce((acc, m) => {
    if (m.day >= thirty.start && m.day <= thirty.end) return acc + m.replies;
    return acc;
  }, 0);

  return {
    today: sumInRange(today.start, today.end),
    sevenDays: sumInRange(seven.start, seven.end),
    thirtyDays: sumInRange(thirty.start, thirty.end),
    total: metrics.reduce((acc, m) => acc + m.messagesSent + m.messagesReceived, 0),
    replies,
    activeConversations: conv,
  };
}

export type AccountWithMetrics = Awaited<
  ReturnType<typeof prisma.whatsAppAccount.findMany>
>[number] & {
  metrics?: MetricLike[];
};