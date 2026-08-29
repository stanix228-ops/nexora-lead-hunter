import { prisma } from '@nexora/database';
import type { RiskLevel, RiskSignalType } from '@nexora/types';
import { granularityRange } from '@nexora/utils';

export interface RiskInput {
  metrics: Array<{
    day: Date;
    messagesSent: number;
    messagesReceived: number;
    replies: number;
    responseRate: number | null;
    errors: number;
    negativeEvents: number;
    messageFailures: number;
  }>;
  accountName: string;
  accountStatus: string;
}

export interface ComputedRisk {
  level: RiskLevel;
  responseRate: number | null;
  errorCount: number;
  negativeEvents: number;
  messageFailureCount: number;
  signals: Array<{ type: RiskSignalType; severity: number; message: string; detectedAt: Date }>;
}

const STATUS_WEIGHT: Record<string, number> = {
  ONLINE: 0,
  OFFLINE: 5,
  ATTENTION: 12,
  PAUSED: 2,
};

/**
 * Risk engine — uses ONLY internal metrics that are actually tracked.
 * It never claims to know about block/ban states it cannot observe.
 *
 * Signals:
 *  - response rate drop (current 7d vs previous 7d)
 *  - error spike (current 7d vs previous 7d, elevated absolute)
 *  - negative event spike (current 14d vs previous 14d)
 *  - message failure spike
 *  - account status deterioration
 */
export function computeRisk(input: RiskInput): ComputedRisk {
  const now = new Date();
  const cur7 = granularityRange('SEVEN_DAYS', now);
  const prev7Start = new Date(now);
  prev7Start.setHours(0, 0, 0, 0);
  prev7Start.setDate(prev7Start.getDate() - 13);
  const prev7End = new Date(cur7.start.getTime() - 1);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const inRange = (d: Date, start: Date, end: Date) => d >= start && d <= end;
  const sum = (metrics: typeof input.metrics, select: (m: (typeof input.metrics)[number]) => number) =>
    metrics.reduce((acc, m) => acc + select(m), 0);

  const curMetrics = input.metrics.filter((m) => inRange(m.day, cur7.start, cur7.end));
  const prevMetrics = input.metrics.filter((m) => inRange(m.day, prev7Start, prev7End));

  const curSent = sum(curMetrics, (m) => m.messagesSent);
  const curReplies = sum(curMetrics, (m) => m.replies);
  const prevSent = sum(prevMetrics, (m) => m.messagesSent);
  const prevReplies = sum(prevMetrics, (m) => m.replies);

  const rate = (sent: number, replies: number) => (sent > 0 ? replies / sent : null);
  const curRate = rate(curSent, curReplies);
  const prevRate = rate(prevSent, prevReplies);

  const signals: ComputedRisk['signals'] = [];
  let score = 0;

  if (curRate != null && prevRate != null && prevRate > 0) {
    const drop = (prevRate - curRate) / prevRate;
    if (drop > 0.5) {
      score += 4;
      signals.push({
        type: 'RESPONSE_RATE_DROP',
        severity: 4,
        message: `Response rate dropped ${Math.round(drop * 100)}% vs the previous 7 days.`,
        detectedAt: now,
      });
    } else if (drop > 0.25) {
      score += 2;
      signals.push({
        type: 'RESPONSE_RATE_DROP',
        severity: 2,
        message: `Response rate down ${Math.round(drop * 100)}% week over week.`,
        detectedAt: now,
      });
    }
  }

  const curErrors = sum(curMetrics, (m) => m.errors);
  const prevErrors = sum(prevMetrics, (m) => m.errors);
  if (curErrors >= 10 && curErrors > prevErrors * 1.8) {
    score += 4;
    signals.push({
      type: 'ERROR_SPIKE',
      severity: 4,
      message: `Error count elevated (${curErrors} in the last 7 days).`,
      detectedAt: now,
    });
  } else if (curErrors >= 6) {
    score += 2;
    signals.push({
      type: 'ERROR_SPIKE',
      severity: 2,
      message: `Error count is elevated (${curErrors} in the last 7 days).`,
      detectedAt: now,
    });
  }

  const curNeg = sum(curMetrics, (m) => m.negativeEvents);
  const prevNeg = sum(prevMetrics, (m) => m.negativeEvents);
  if (curNeg >= 3 && curNeg >= prevNeg * 2 + 1) {
    score += 4;
    signals.push({
      type: 'NEGATIVE_EVENT_SPIKE',
      severity: 4,
      message: `Negative events increased (${curNeg} in the last 7 days).`,
      detectedAt: now,
    });
  } else if (curNeg >= 2) {
    score += 2;
    signals.push({
      type: 'NEGATIVE_EVENT_SPIKE',
      severity: 2,
      message: `Negative events detected (${curNeg} in the last 7 days).`,
      detectedAt: now,
    });
  }

  const curFail = sum(curMetrics, (m) => m.messageFailures);
  const prevFail = sum(prevMetrics, (m) => m.messageFailures);
  if (curFail >= 5 && curFail >= prevFail * 1.5 + 1) {
    score += 4;
    signals.push({
      type: 'MESSAGE_FAILURE_SPIKE',
      severity: 4,
      message: `Message failures increasing (${curFail} in the last 7 days).`,
      detectedAt: now,
    });
  } else if (curFail >= 3) {
    score += 2;
    signals.push({
      type: 'MESSAGE_FAILURE_SPIKE',
      severity: 2,
      message: `Message failures detected (${curFail} in the last 7 days).`,
      detectedAt: now,
    });
  }

  score += STATUS_WEIGHT[input.accountStatus] ?? 0;
  if (curSent === 0) {
    score += 1;
    signals.push({
      type: 'SUSPICIOUS_ACTIVITY',
      severity: 1,
      message: 'No outbound activity in the last 7 days.',
      detectedAt: now,
    });
  }

  const level: RiskLevel =
    score >= 12 ? 'CRITICAL' : score >= 8 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW';

  return {
    level,
    responseRate: curRate != null ? Math.round(curRate * 1000) / 10 : null,
    errorCount: sum(input.metrics, (m) => m.errors),
    negativeEvents: sum(input.metrics, (m) => m.negativeEvents),
    messageFailureCount: sum(input.metrics, (m) => m.messageFailures),
    signals,
  };
}

/** Load metrics for an account and compute its risk state. */
export async function riskForAccount(account: {
  id: string;
  name: string;
  status: string;
  metrics?: RiskInput['metrics'];
}) {
  const metrics =
    account.metrics ??
    (await prisma.accountMetric.findMany({ where: { accountId: account.id } }));
  return computeRisk({
    metrics,
    accountName: account.name,
    accountStatus: account.status,
  });
}