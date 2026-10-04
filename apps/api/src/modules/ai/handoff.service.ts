import { prisma } from '@nexora/database';
import { emitToUser } from '../../common/realtime/socket';
import { recordActivity } from '../../common/activity/recorder';
import { logger } from '../../common/logger';
import { assertAiPermission } from '../../common/security/permissions';

export interface HotLeadCheckResult {
  isHot: boolean;
  intentReason?: string;
}

const HOT_LEAD_TRIGGERS = [
  /созвон/i,
  /позвон(ите|и)/i,
  /номер телефона/i,
  /реквизиты/i,
  /договор/i,
  /счет на оплату/i,
  /предоплат/i,
  /куда платить/i,
  /готовы начать/i,
  /давайте работать/i,
  /оформить заказ/i,
  /встрет(иться|имся)/i,
  /call me/i,
  /send invoice/i,
  /ready to start/i,
];

export function checkHotLeadIntent(text: string): HotLeadCheckResult {
  for (const trigger of HOT_LEAD_TRIGGERS) {
    if (trigger.test(text)) {
      return {
        isHot: true,
        intentReason: `Клиент запросил прямой контакт или оформление сделки (${text.slice(0, 60)})`,
      };
    }
  }
  return { isHot: false };
}

export async function triggerHumanHandoff(
  userId: string,
  conversationId: string,
  leadId: string,
  reason: string,
): Promise<void> {
  // Security check: Enforce AI_HANDOFF permission
  await assertAiPermission(userId, 'AI_HANDOFF', `Передача оператору: ${reason}`);

  // Update state
  const state = await prisma.aiDialogueState.upsert({
    where: { conversationId },
    update: {
      stage: 'HUMAN_TAKEOVER',
      isAiPaused: true,
      humanTakeoverAt: new Date(),
    },
    create: {
      conversationId,
      stage: 'HUMAN_TAKEOVER',
      isAiPaused: true,
      humanTakeoverAt: new Date(),
    },
  });

  // Update lead status to NEGOTIATION
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: 'NEGOTIATION' },
  });

  // Emit realtime hot lead alert
  emitToUser(userId, 'ai.hot_lead_alert', {
    conversationId,
    leadId,
    reason,
    timestamp: new Date().toISOString(),
  });

  await recordActivity({
    userId,
    action: 'LEAD_STATUS_CHANGED',
    entity: 'LEAD',
    entityId: leadId,
    metadata: { toStatus: 'NEGOTIATION', aiHandoff: true, reason },
  });

  logger.info('Human handoff triggered for conversation', { conversationId, reason });
}

export async function toggleAiPause(userId: string, conversationId: string): Promise<{ isAiPaused: boolean }> {
  const existing = await prisma.aiDialogueState.findUnique({ where: { conversationId } });
  const nextPause = !existing?.isAiPaused;

  const updated = await prisma.aiDialogueState.upsert({
    where: { conversationId },
    update: { isAiPaused: nextPause },
    create: { conversationId, isAiPaused: nextPause },
  });

  emitToUser(userId, 'ai.state_updated', {
    conversationId,
    isAiPaused: updated.isAiPaused,
  });

  return { isAiPaused: updated.isAiPaused };
}
