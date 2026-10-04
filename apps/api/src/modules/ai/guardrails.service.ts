import { prisma } from '@nexora/database';
import { logger } from '../../common/logger';

export interface GuardrailCheckResult {
  passed: boolean;
  isOptOut: boolean;
  isPromptInjection: boolean;
  reason?: string;
  sanitizedText: string;
}

const DEFAULT_STOP_WORDS = [
  'стоп',
  'хватит',
  'отписка',
  'отписаться',
  'спам',
  'не пишите',
  'заблокирую',
  'stop',
  'unsubscribe',
  'cancel',
  'spam',
];

const INJECTION_PATTERNS = [
  /ignore (all )?previous (instructions|prompts)/i,
  /system prompt/i,
  /reveal your instructions/i,
  /забудь (все )?предыдущие инструкции/i,
  /ты теперь (не|другой)/i,
  /jailbreak/i,
  /DAN mode/i,
  /prompt injection/i,
  /system override/i,
];

export function checkGuardrails(rawText: string, customStopWords?: string[]): GuardrailCheckResult {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // 1. Check Opt-out / Stop-words
  const stopWords = Array.isArray(customStopWords) && customStopWords.length > 0 ? customStopWords : DEFAULT_STOP_WORDS;
  const isOptOut = stopWords.some((sw) => {
    const word = sw.toLowerCase().trim();
    return lower === word || lower.startsWith(`${word} `) || lower.endsWith(` ${word}`) || lower.includes(` ${word} `);
  });

  if (isOptOut) {
    return {
      passed: false,
      isOptOut: true,
      isPromptInjection: false,
      reason: 'Клиент запросил отписку / стоп-слово.',
      sanitizedText: text,
    };
  }

  // 2. Check Prompt Injection
  const isInjection = INJECTION_PATTERNS.some((pat) => pat.test(text));
  if (isInjection) {
    logger.warn('Prompt injection attempt detected and blocked', { text });
    return {
      passed: false,
      isOptOut: false,
      isPromptInjection: true,
      reason: 'Обнаружена попытка внедрения системных инструкций (Prompt Injection).',
      sanitizedText: 'Запрос содержит недопустимые системные команды.',
    };
  }

  // 3. Sanitization
  const sanitized = text.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '');

  return {
    passed: true,
    isOptOut: false,
    isPromptInjection: false,
    sanitizedText: sanitized,
  };
}

export async function handleOptOutAction(userId: string, conversationId: string, leadId: string): Promise<void> {
  try {
    // 1. Pause AI for this conversation
    await prisma.aiDialogueState.upsert({
      where: { conversationId },
      update: { isAiPaused: true, stage: 'LOST' },
      create: { conversationId, isAiPaused: true, stage: 'LOST' },
    });

    // 2. Cancel all pending follow-up jobs
    await prisma.followUpJob.updateMany({
      where: { conversationId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    // 3. Mark lead as NO_RESPONSE
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'NO_RESPONSE', notes: 'Клиент запросил отписку (Opt-out).' },
    });

    // 4. Record Audit Log
    await prisma.aiAuditLog.create({
      data: {
        userId,
        leadId,
        conversationId,
        actionType: 'GUARDRAIL_TRIGGERED',
        executionTimeMs: 0,
        success: true,
        errorMessage: 'Opt-out triggered. AI paused and follow-ups cancelled.',
      },
    });

    logger.info('Opt-out processed successfully', { conversationId, leadId });
  } catch (err) {
    logger.error('Failed to process opt-out action', { error: (err as Error).message });
  }
}
