import { prisma } from '@nexora/database';
import type {
  NeedsDiscoveryProfile,
  NeedsDiscoveryAnalysisResult,
  DiscoveryUrgency,
  BuyingIntentLevel,
  MemoryLayer,
} from '@nexora/types';
import { logger } from '../../common/logger';
import { getAIProvider } from './ai.provider';
import { emitToUser } from '../../common/realtime/socket';

/**
 * 1. Slot Extraction & Discovery Engine
 */
export class NeedsDiscoveryEngine {
  /**
   * Analyzes conversation context, extracts 12 structured slots, determines missing items,
   * and picks ONE natural next question following the non-interrogative rules.
   */
  static async analyzeAndExtractProfile(
    userId: string,
    conversationId: string,
    newInboundText?: string,
    preloadedConversation?: any,
  ): Promise<NeedsDiscoveryAnalysisResult> {
    const conversation = preloadedConversation || await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        lead: {
          include: {
            analysis: true,
            score: true,
            clientMemories: { take: 20, orderBy: { createdAt: 'desc' } },
          },
        },
        aiState: true,
        messages: { orderBy: { recordedAt: 'asc' }, take: 25 },
      },
    });

    if (!conversation || !conversation.lead) {
      throw new Error(`Conversation ${conversationId} or lead not found.`);
    }

    const lead = conversation.lead;
    const existingProfile: Partial<NeedsDiscoveryProfile> =
      (conversation.aiState?.discoveryProfile as Partial<NeedsDiscoveryProfile>) || {};

    const allText = [
      ...(conversation.messages || []).map((m: any) => `${m.direction}: ${m.body}`),
      newInboundText ? `INBOUND: ${newInboundText}` : '',
      lead.notes || '',
      lead.assumedNeed || '',
    ].join('\n');

    const lower = allText.toLowerCase();

    // 1. Extract NEED
    let need: string | null = existingProfile.need || lead.assumedNeed || null;
    if (lower.includes('нужен сайт') || lower.includes('разработка сайта') || lower.includes('создать сайт')) {
      need = 'Разработка современного высококонверсионного сайта / веб-сервиса на Next.js';
    } else if (lower.includes('бот') || lower.includes('telegram') || lower.includes('тг-бот') || lower.includes('mini app')) {
      need = 'Telegram Mini App (TMA) и чат-бот для автоматизации онлайн-продаж и записи';
    } else if (lower.includes('ai-ассистент') || lower.includes('автоответ') || lower.includes('ai ассистент') || lower.includes('ии')) {
      need = 'AI-Ассистент для автоматической поддержки и квалификации клиентов 24/7 в WhatsApp/Telegram';
    } else if (lower.includes('crm') || lower.includes('автоматизац') || lower.includes('система учета') || lower.includes('1с')) {
      need = 'Кастомная CRM-система и сквозная автоматизация бизнес-процессов';
    } else if (lower.includes('мобильное приложени') || lower.includes('ios') || lower.includes('android')) {
      need = 'Кроссплатформенное мобильное приложение iOS / Android';
    }

    // 2. Extract CURRENT_PROCESS
    let currentProcess: string | null = existingProfile.currentProcess || null;
    if (lower.includes('вручную') || lower.includes('ручной ввод') || lower.includes('пишут в whatsapp') || lower.includes('звонят на телефон')) {
      currentProcess = 'Обработка обращений вручную администраторами/менеджерами через личные мессенджеры и звонки';
    } else if (lower.includes('excel') || lower.includes('гугл таблиц') || lower.includes('таблиц')) {
      currentProcess = 'Учет клиентов и записей ведется в таблицах Excel / Google Sheets';
    } else if (lower.includes('блокнот') || lower.includes('на бумаге')) {
      currentProcess = 'Бумажный учет / журнал записей без единой цифровой базы';
    } else if (lower.includes('1с') || lower.includes('битрикс') || lower.includes('amocrm')) {
      currentProcess = 'Частично автоматизирован в текущей учетной системе, но отсутствует бесшовная интеграция с мессенджерами';
    }

    // 3. Extract PAIN points
    const pains: Set<string> = new Set(existingProfile.pain || []);
    if (lower.includes('не успева') || lower.includes('долго отвеча') || lower.includes('вечером')) {
      pains.add('Долгий ответ клиентам в нерабочие часы, выходные и пиковые нагрузки');
    }
    if (lower.includes('теряем') || lower.includes('уходят клиенты') || lower.includes('забывают перезвонить')) {
      pains.add('Потеря до 25-35% потенциальных клиентов из-за человеческого фактора');
    }
    if (lower.includes('нет сайта') || lower.includes('старый сайт') || lower.includes('неудобный сайт') || lower.includes('не открывается')) {
      pains.add('Отсутствие адаптивного продающего сайта с прямой онлайн-записью');
    }
    if (lower.includes('много рутины') || lower.includes('зашиваемся') || lower.includes('однотипные вопросы')) {
      pains.add('Высокая нагрузка операторов рутинными ответами на типовые вопросы о ценах и услугах');
    }

    // 4. Extract IMPACT (Consequences & losses)
    let impact: string | null = existingProfile.impact || null;
    if (pains.size > 0 || lower.includes('потер') || lower.includes('упущен')) {
      if (lower.includes('деньги') || lower.includes('выручк') || lower.includes('продаж')) {
        impact = 'Прямые финансовые потери и недополученная выручка от непринятых заявок';
      } else if (pains.has('Потеря до 25-35% потенциальных клиентов из-за человеческого фактора')) {
        impact = 'Отток горячих клиентов к конкурентам, которые отвечают в течение 1 минуты';
      } else if (pains.has('Долгий ответ клиентам в нерабочие часы, выходные и пиковые нагрузки')) {
        impact = 'Снижение конверсии рекламы из-за простоя обращений в нерабочее время';
      } else if (!impact && pains.size > 0) {
        impact = 'Перегрузка персонала ручными операциями и риск потери ключевых клиентов';
      }
    }

    // 5. Extract DESIRED_RESULT
    let desiredResult: string | null = existingProfile.desiredResult || null;
    if (lower.includes('24/7') || lower.includes('круглосуточно') || lower.includes('быстро отвечать') || lower.includes('мгновенно')) {
      desiredResult = 'Мгновенная консультация и авто-прием заявок 24/7 без задержек';
    } else if (lower.includes('увеличить заявки') || lower.includes('больше клиентов') || lower.includes('рост продаж')) {
      desiredResult = 'Увеличение потока онлайн-заявок и конверсии в покупку на 25-40%';
    } else if (lower.includes('онлайн-запись') || lower.includes('запись к врачу') || lower.includes('бронирование')) {
      desiredResult = 'Бесшовная онлайн-запись клиентов в 2 клика без необходимости звонка';
    } else if (lower.includes('интеграци') || lower.includes('автоматически падало в')) {
      desiredResult = 'Автоматическая передача всех заявок из мессенджеров прямо в CRM / 1C';
    }

    // 6. Extract URGENCY
    let urgency: DiscoveryUrgency = existingProfile.urgency || 'UNKNOWN';
    if (lower.includes('срочно') || lower.includes('на этой неделе') || lower.includes('как можно скорее') || lower.includes('горят сроки')) {
      urgency = 'HIGH';
    } else if (lower.includes('в этом месяце') || lower.includes('к сезону') || lower.includes('в течение 2-3 недель')) {
      urgency = 'MEDIUM';
    } else if (lower.includes('не горит') || lower.includes('в планах на квартал') || lower.includes('пока просто смотрим')) {
      urgency = 'LOW';
    }

    // 7. Extract BUDGET
    let budget = existingProfile.budget || null;
    const budgetMatch = lower.match(/(бюджет|до|около|рассчитываем на)\s+(\d+[\s\d]*)\s*(тыс|руб|к|тысяч|т\.р\.)/i);
    if (budgetMatch && budgetMatch[2]) {
      const amount = parseInt(budgetMatch[2].replace(/\s/g, ''), 10);
      budget = {
        amount: isNaN(amount) ? null : amount * (budgetMatch[3]?.includes('тыс') || budgetMatch[3]?.includes('к') ? 1000 : 1),
        currency: 'RUB',
        tier: amount > 250000 ? 'HIGH' : amount > 80000 ? 'MEDIUM' : 'LOW',
        raw: `${budgetMatch[2]} ${budgetMatch[3] || 'руб.'}`,
        isNegotiable: true,
      };
    } else if (lower.includes('дорого') || lower.includes('ограничен')) {
      budget = {
        tier: 'LOW',
        raw: 'Бюджет ограничен / требуется поэтапный запуск (MVP)',
        isNegotiable: true,
      };
    }

    // 8. Extract DECISION_MAKER
    let decisionMaker = existingProfile.decisionMaker || null;
    if (
      lower.includes('я директор') ||
      lower.includes('я собственник') ||
      lower.includes('я владелец') ||
      lower.includes('я руководитель') ||
      lower.includes('главный врач') ||
      lower.includes('главврач') ||
      lower.includes('управляющий') ||
      lower.includes('основатель') ||
      lower.includes('генеральный директор') ||
      lower.includes('ceo') ||
      lower.includes('founder')
    ) {
      decisionMaker = {
        isDecisionMaker: true,
        role: lower.includes('главный врач') || lower.includes('главврач')
          ? 'Главный врач / Руководитель клиники'
          : 'Руководитель / Владелец бизнеса',
        details: 'Прямой ЛПР с полномочиями принятия решений',
      };
    } else if (lower.includes('согласую с руководством') || lower.includes('спрошу у директора') || lower.includes('мне поручили')) {
      decisionMaker = {
        isDecisionMaker: false,
        role: 'Менеджер / Специалист',
        details: 'Требуется согласование с вышестоящим руководством',
      };
    }

    // 9. Extract CURRENT_SOLUTION
    let currentSolution = existingProfile.currentSolution || null;
    const stackTools: string[] = currentSolution?.tools ? [...currentSolution.tools] : [];
    if (lower.includes('1с') && !stackTools.includes('1C')) stackTools.push('1C');
    if (lower.includes('битрикс') && !stackTools.includes('Bitrix24')) stackTools.push('Bitrix24');
    if (lower.includes('amo') && !stackTools.includes('AmoCRM')) stackTools.push('AmoCRM');
    if (lower.includes('tilda') && !stackTools.includes('Tilda')) stackTools.push('Tilda');
    if (lower.includes('wordpress') && !stackTools.includes('WordPress')) stackTools.push('WordPress');
    if (lower.includes('excel') && !stackTools.includes('Excel/Google Sheets')) stackTools.push('Excel/Google Sheets');

    const hasDev = lower.includes('свой программист') || lower.includes('есть разработчик') || lower.includes('штатный специалист');
    if (stackTools.length > 0 || hasDev) {
      currentSolution = {
        tools: stackTools,
        existingDeveloper: hasDev,
        provider: hasDev ? 'Штатный разработчик' : currentSolution?.provider || null,
      };
    }

    // 10. Extract CONSTRAINTS
    const constraints: Set<string> = new Set(existingProfile.constraints || []);
    if (lower.includes('1с')) constraints.add('Обязательна бесшовная интеграция с 1С');
    if (lower.includes('безнал') || lower.includes('ндс') || lower.includes('договор')) constraints.add('Оплата по безналичному расчету с договором и актами');
    if (lower.includes('безопасность') || lower.includes('персональные данные') || lower.includes('152-фз')) constraints.add('Хранение данных строго в соответствии с законодательством');
    if (urgency === 'HIGH') constraints.add('Сжатые сроки запуска решения');

    // 11. Extract BUYING_INTENT
    let buyingIntent: BuyingIntentLevel = 'EXPLORING';
    if (lower.includes('куда платить') || lower.includes('выставляйте счет') || lower.includes('готовы начать') || lower.includes('подписываем')) {
      buyingIntent = 'READY_TO_BUY';
    } else if (lower.includes('созвон') || lower.includes('позвоните') || lower.includes('давайте обсудим')) {
      buyingIntent = 'HIGH_INTENT';
    } else if (lower.includes('сколько стоит') || lower.includes('цена') || lower.includes('смета') || lower.includes('кп')) {
      buyingIntent = 'EVALUATING';
    } else if (lower.includes('не интересно') || lower.includes('не надо') || lower.includes('отписка')) {
      buyingIntent = 'COLD';
    }

    // 12. Calculate Missing Slots & Confidence
    const painArray = Array.from(pains);
    const constraintsArray = Array.from(constraints);

    const missingSlots: string[] = [];
    if (!need) missingSlots.push('NEED');
    if (!currentProcess) missingSlots.push('CURRENT_PROCESS');
    if (painArray.length === 0) missingSlots.push('PAIN');
    if (!impact) missingSlots.push('IMPACT');
    if (!desiredResult) missingSlots.push('DESIRED_RESULT');
    if (urgency === 'UNKNOWN') missingSlots.push('URGENCY');
    if (!budget) missingSlots.push('BUDGET');
    if (!decisionMaker) missingSlots.push('DECISION_MAKER');
    if (!currentSolution) missingSlots.push('CURRENT_SOLUTION');
    if (constraintsArray.length === 0) missingSlots.push('CONSTRAINTS');

    const totalSlots = 10;
    const completedSlotsCount = totalSlots - missingSlots.length;
    const confidence = Math.min(1.0, Math.max(0.2, completedSlotsCount / totalSlots));

    const profile: NeedsDiscoveryProfile = {
      need,
      currentProcess,
      pain: painArray.length > 0 ? painArray : null,
      impact,
      desiredResult,
      urgency,
      budget,
      decisionMaker,
      currentSolution,
      constraints: constraintsArray,
      buyingIntent,
      confidence: Number(confidence.toFixed(2)),
      completedSlotsCount,
      missingSlots,
    };

    // 13. Smart Natural Single-Question Selection
    const companyName = lead.companyName || 'клиент';
    const niche = lead.niche || 'бизнес';
    const messageCount = conversation.messages.length + (newInboundText ? 1 : 0);

    const questionResult = NeedsDiscoveryEngine.selectNextNaturalQuestion(
      profile,
      companyName,
      niche,
      messageCount,
    );

    profile.nextSuggestedQuestion = questionResult.nextQuestion;
    profile.nextSuggestedQuestionGoal = questionResult.questionGoal;

    // 14. Persist to CRM
    const extractedNewFacts = await NeedsDiscoveryEngine.syncNeedsDiscoveryWithCrm(
      lead.id,
      conversationId,
      profile,
      userId,
    );

    return {
      profile,
      nextQuestion: questionResult.nextQuestion,
      questionGoal: questionResult.questionGoal,
      canTransitionToSolution: questionResult.canTransitionToSolution,
      budgetTimingAppropriate: questionResult.budgetTimingAppropriate,
      extractedNewFacts,
      explanation: questionResult.explanation,
    };
  }

  /**
   * 2. Anti-Questionnaire Rule Engine: Selects strictly ONE contextually natural question.
   */
  static selectNextNaturalQuestion(
    profile: NeedsDiscoveryProfile,
    companyName: string,
    niche: string,
    messageCount: number,
  ): {
    nextQuestion: string | null;
    questionGoal: string | null;
    canTransitionToSolution: boolean;
    budgetTimingAppropriate: boolean;
    explanation: string;
  } {
    const hasNeed = Boolean(profile.need);
    const hasPain = Boolean(profile.pain && profile.pain.length > 0);
    const hasProcess = Boolean(profile.currentProcess);
    const hasImpact = Boolean(profile.impact);
    const hasDesiredResult = Boolean(profile.desiredResult);

    // Rule: Budget timing is NOT appropriate in the first message or when problem/impact/result are unknown
    const budgetTimingAppropriate =
      messageCount >= 3 && hasPain && hasImpact && (hasDesiredResult || hasNeed);

    // Readiness to transition to Solution: Core diagnostics complete
    const coreSlotsFilled = [hasNeed, hasPain, hasProcess, hasImpact, hasDesiredResult].filter(Boolean).length;
    if (coreSlotsFilled >= 4 || (hasPain && hasImpact && hasDesiredResult)) {
      return {
        nextQuestion: null,
        questionGoal: 'Все ключевые потребности и боли выявлены. Готовы к презентации решения Nexora.',
        canTransitionToSolution: true,
        budgetTimingAppropriate,
        explanation: 'Собрано достаточное количество контекста для формулирования ценностного предложения.',
      };
    }

    // Priority 1: Current Process & Pain
    if (!hasProcess && !hasPain) {
      return {
        nextQuestion: `Подскажите, как сейчас у вас в «${companyName}» выстроен процесс приема входящих обращений — клиенты пишут напрямую администраторам в WhatsApp или есть автоматизированная CRM/бот?`,
        questionGoal: 'Понять текущий процесс и выявить первичные узкие места',
        canTransitionToSolution: false,
        budgetTimingAppropriate: false,
        explanation: 'Первичное выявление процессов и ручных операций без давления на продажу.',
      };
    }

    // Priority 2: Deepen Problem Impact
    if (hasPain && !hasImpact) {
      return {
        nextQuestion: `Понимаю вас. А как это сейчас влияет на работу — замечаете, что часть клиентов уходит к конкурентам из-за задержек с ответом в нерабочее время?`,
        questionGoal: 'Оценить влияние проблемы на бизнес и финансовые потери',
        canTransitionToSolution: false,
        budgetTimingAppropriate: false,
        explanation: 'Углубление в бизнес-последствия (Impact) для обоснования ценности решения.',
      };
    }

    // Priority 3: Desired Outcome & Metrics
    if (!hasDesiredResult) {
      return {
        nextQuestion: `Какой результат для «${companyName}» сейчас в приоритете — обеспечить мгновенный авто-ответ 24/7 или организовать бесшовную онлайн-запись прямо в мессенджере?`,
        questionGoal: 'Понять целевой результат и приоритеты клиента',
        canTransitionToSolution: false,
        budgetTimingAppropriate: false,
        explanation: 'Определение целевого состояния и критериев успеха проекта.',
      };
    }

    // Priority 4: Existing Tech Stack / Tools
    if (!profile.currentSolution) {
      return {
        nextQuestion: `Используете ли сейчас какую-то учетную систему (например, 1С, AmoCRM или Битрикс24), с которой важно будет настроить интеграцию?`,
        questionGoal: 'Выявить существующие инструменты и технические ограничения',
        canTransitionToSolution: false,
        budgetTimingAppropriate: false,
        explanation: 'Уточнение технического окружения для точной оценки архитектуры.',
      };
    }

    // Priority 5: Budget Timing (Only when task, pain, and impact are established)
    if (!profile.budget && budgetTimingAppropriate) {
      return {
        nextQuestion: `Мы можем предложить как быстрый запуск базового модуля (MVP) для быстрой окупаемости, так и комплексную систему под ключ. Подскажите, какой формат запуска для вас комфортнее?`,
        questionGoal: 'Тактично выяснить бюджетные ориентиры и масштаб проекта',
        canTransitionToSolution: false,
        budgetTimingAppropriate: true,
        explanation: 'Выяснение бюджета через выбор формата проекта (MVP vs Full Scale).',
      };
    }

    // Default Fallback
    return {
      nextQuestion: `Подскажите, какие главные задачи по автоматизации для «${companyName}» сейчас стоят на первом месте?`,
      questionGoal: 'Уточнение ключевого приоритета проекта',
      canTransitionToSolution: false,
      budgetTimingAppropriate: false,
      explanation: 'Фокусировка на главном приоритете клиента.',
    };
  }

  /**
   * 3. Sync discovered facts into CRM (AiDialogueState, ClientMemory, Lead, TimelineEvent)
   */
  static async syncNeedsDiscoveryWithCrm(
    leadId: string,
    conversationId: string,
    profile: NeedsDiscoveryProfile,
    userId: string,
  ): Promise<Array<{ key: string; value: string; layer: string }>> {
    const extractedFacts: Array<{ key: string; value: string; layer: string }> = [];

    // 1. Update AiDialogueState
    await prisma.aiDialogueState.upsert({
      where: { conversationId },
      update: {
        discoveryProfile: profile as any,
        bantNeed: profile.need || undefined,
        bantBudget: profile.budget?.raw || undefined,
        bantAuthority: profile.decisionMaker?.role || undefined,
        bantTimeline: profile.urgency !== 'UNKNOWN' ? profile.urgency : undefined,
        identifiedPains: profile.pain ? (profile.pain as any) : undefined,
        confidenceScore: profile.confidence,
      },
      create: {
        conversationId,
        discoveryProfile: profile as any,
        bantNeed: profile.need || null,
        bantBudget: profile.budget?.raw || null,
        bantAuthority: profile.decisionMaker?.role || null,
        bantTimeline: profile.urgency !== 'UNKNOWN' ? profile.urgency : null,
        identifiedPains: profile.pain ? (profile.pain as any) : undefined,
        confidenceScore: profile.confidence,
      },
    });

    // 2. Update Lead Table
    const updateLeadData: Record<string, unknown> = {};
    if (profile.need) updateLeadData.assumedNeed = profile.need;
    if (profile.budget?.amount) updateLeadData.estimatedBudget = profile.budget.amount;
    if (profile.decisionMaker?.isDecisionMaker !== undefined && profile.decisionMaker?.isDecisionMaker !== null) {
      updateLeadData.isDecisionMaker = profile.decisionMaker.isDecisionMaker;
      updateLeadData.decisionMakerInfo = profile.decisionMaker.role || profile.decisionMaker.details || null;
    }

    if (Object.keys(updateLeadData).length > 0) {
      await prisma.lead.update({
        where: { id: leadId },
        data: updateLeadData,
      });
    }

    // 3. Persist Key Milestones to 8-Layer Memory Fact System
    if (profile.need) {
      extractedFacts.push({ key: 'Основная потребность', value: profile.need, layer: 'SHORT_TERM' });
    }
    if (profile.currentProcess) {
      extractedFacts.push({ key: 'Текущий процесс', value: profile.currentProcess, layer: 'BUSINESS_FACT' });
    }
    if (profile.impact) {
      extractedFacts.push({ key: 'Влияние на бизнес', value: profile.impact, layer: 'DEAL_FACT' });
    }
    if (profile.desiredResult) {
      extractedFacts.push({ key: 'Желаемый результат', value: profile.desiredResult, layer: 'AGREEMENT' });
    }
    if (profile.budget?.raw) {
      extractedFacts.push({ key: 'Бюджетные рамки', value: profile.budget.raw, layer: 'DEAL_FACT' });
    }

    // 3. Batch Persist Key Milestones to 8-Layer Memory Fact System
    if (extractedFacts.length > 0) {
      try {
        await prisma.clientMemory.createMany({
          data: extractedFacts.map((fact) => ({
            leadId,
            conversationId,
            layer: fact.layer as MemoryLayer,
            key: fact.key,
            value: fact.value,
            source: 'AI' as const,
            confidence: profile.confidence,
          })),
        });
      } catch {
        /* ignore duplicate insertion */
      }
    }

    // 4. Record Timeline Event if Significant Need Discovered (asynchronous non-blocking)
    if (profile.completedSlotsCount >= 4) {
      prisma.timelineEvent.create({
        data: {
          userId,
          leadId,
          conversationId,
          eventType: 'MEMORY_RECORDED',
          title: `Needs Discovery: Сформирован профиль потребностей (${profile.completedSlotsCount}/10 слотов)`,
          description: `Выявлено: ${profile.need || 'Потребность зафиксирована'}. Боль: ${profile.pain?.[0] || '—'}`,
          metadata: {
            completedSlots: profile.completedSlotsCount,
            confidence: profile.confidence,
            buyingIntent: profile.buyingIntent,
          } as any,
        },
      }).catch(() => {});
    }

    // 5. Emit socket update
    emitToUser(userId, 'ai.needs_discovery_updated', {
      conversationId,
      leadId,
      profile,
      timestamp: new Date().toISOString(),
    });

    return extractedFacts;
  }
}
