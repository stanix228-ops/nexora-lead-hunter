import { prisma } from '@nexora/database';
import type {
  AiAgentConfig,
  AiStage,
  SalesBrainStage,
  SalesBrainAction,
  ClientIntent,
  ConsultativePhase,
  SalesBrainDecision,
  SalesBrainProcessResult,
  SalesBrainStateData,
} from '@nexora/types';
import { logger } from '../../common/logger';
import { getAIProvider, type LLMProvider } from './ai.provider';
import { checkGuardrails, handleOptOutAction } from './guardrails.service';
import { detectAndHandleObjection, type ObjectionMatch } from './objection.service';
import { checkHotLeadIntent, triggerHumanHandoff } from './handoff.service';
import { extractAndStoreMemoryFacts, getLeadMemoryContext } from './memory.service';
import { scheduleNextFollowUp, cancelPendingFollowUps } from './followup.service';
import { buildStructuredMemoryPrompt } from '../crm/crm.service';
import { DEFAULT_NEXORA_CATALOG, type CopilotSuggestion } from './ai.types';
import { NeedsDiscoveryEngine } from './needs-discovery.service';
import type { NeedsDiscoveryProfile } from '@nexora/types';
import { assertAiPermission } from '../../common/security/permissions';
import { PromptFirewall } from '../../common/security/prompt-firewall';
import {
  STAGE_RULES,
  normalizeSalesBrainStage,
  validateStateTransition,
  getActionsForStage,
  getConsultativePhaseForStage,
  evaluateAutoStageTransition,
} from './sales-brain-state';

/**
 * 1. Intent & Sentiment Classifier
 */
export function classifyClientIntent(text: string): {
  intent: ClientIntent;
  confidence: number;
  extractedDetails?: Record<string, string>;
} {
  const lower = text.toLowerCase().trim();

  // 1. Opt-out
  if (
    lower.includes('стоп') ||
    lower.includes('stop') ||
    lower.includes('отписка') ||
    lower.includes('не пишите') ||
    lower.includes('удалите номер') ||
    lower.includes('отстаньте')
  ) {
    return { intent: 'OPT_OUT', confidence: 0.99 };
  }

  // 2. Request Call / Human
  if (
    lower.includes('созвон') ||
    lower.includes('позвоните') ||
    lower.includes('наберите') ||
    lower.includes('человек') ||
    lower.includes('менеджер') ||
    lower.includes('директор') ||
    lower.includes('call me') ||
    lower.includes('номер телефона')
  ) {
    return { intent: 'REQUEST_CALL_HUMAN', confidence: 0.95 };
  }

  // 3. Interested & Ready / Deal closing
  if (
    lower.includes('куда платить') ||
    lower.includes('выставляйте счет') ||
    lower.includes('готовы работать') ||
    lower.includes('готовы начать') ||
    lower.includes('подписываем') ||
    lower.includes('оформить заказ') ||
    lower.includes('реквизиты')
  ) {
    return { intent: 'INTERESTED_READY', confidence: 0.94 };
  }

  // 4. Objections
  if (
    lower.includes('дорого') ||
    lower.includes('нет денег') ||
    lower.includes('нет бюджета') ||
    lower.includes('дороговато') ||
    lower.includes('expensive')
  ) {
    return { intent: 'OBJECTION_PRICE', confidence: 0.95 };
  }

  if (
    lower.includes('есть сайт') ||
    lower.includes('есть разработчик') ||
    lower.includes('свой программист') ||
    lower.includes('уже сделали') ||
    lower.includes('штатный специалист')
  ) {
    return { intent: 'OBJECTION_EXISTING_DEVELOPER', confidence: 0.93 };
  }

  if (
    lower.includes('на почту') ||
    lower.includes('потом') ||
    lower.includes('не сейчас') ||
    lower.includes('позже') ||
    lower.includes('занят') ||
    lower.includes('нет времени')
  ) {
    return { intent: 'OBJECTION_TIME', confidence: 0.9 };
  }

  if (
    lower.includes('не надо') ||
    lower.includes('не нужно') ||
    lower.includes('не интересно') ||
    lower.includes('не актуально') ||
    lower.includes('нет надобности')
  ) {
    return { intent: 'OBJECTION_NO_NEED', confidence: 0.9 };
  }

  if (
    lower.includes('гарант') ||
    lower.includes('кейсы') ||
    lower.includes('примеры') ||
    lower.includes('кто вы') ||
    lower.includes('портфолио') ||
    lower.includes('отзывы')
  ) {
    return { intent: 'OBJECTION_TRUST', confidence: 0.91 };
  }

  // 5. Inquiries
  if (
    lower.includes('цена') ||
    lower.includes('стоимость') ||
    lower.includes('сколько') ||
    lower.includes('прайс') ||
    lower.includes('тариф') ||
    lower.includes('бюджет')
  ) {
    return { intent: 'PRICE_INQUIRY', confidence: 0.9 };
  }

  if (
    lower.includes('срок') ||
    lower.includes('сколько по времени') ||
    lower.includes('когда будет готов') ||
    lower.includes('быстро')
  ) {
    return { intent: 'TIMELINE_INQUIRY', confidence: 0.88 };
  }

  if (
    lower.includes('стек') ||
    lower.includes('react') ||
    lower.includes('next') ||
    lower.includes('1с') ||
    lower.includes('битрикс') ||
    lower.includes('интеграци') ||
    lower.includes('бот') ||
    lower.includes('api')
  ) {
    return { intent: 'TECH_INQUIRY', confidence: 0.87 };
  }

  // 6. Problem Statement (client describes business friction / pain)
  if (
    lower.includes('терьяем') ||
    lower.includes('теряем') ||
    lower.includes('не успева') ||
    lower.includes('много ручной') ||
    lower.includes('долго отвечаем') ||
    lower.includes('нет сайта') ||
    lower.includes('старый сайт') ||
    lower.includes('клиенты жалуются') ||
    lower.includes('мало заявок') ||
    lower.includes('падают продажи')
  ) {
    return { intent: 'PROBLEM_STATEMENT', confidence: 0.92 };
  }

  if (
    lower.includes('что вы') ||
    lower.includes('чем занимаетесь') ||
    lower.includes('какие услуги') ||
    lower.includes('подробнее') ||
    lower.includes('расскажите')
  ) {
    return { intent: 'QUESTION_ABOUT_SERVICES', confidence: 0.86 };
  }

  if (
    lower.startsWith('привет') ||
    lower.startsWith('здравствуй') ||
    lower.startsWith('добрый') ||
    lower === 'да' ||
    lower === 'слушаю' ||
    lower.includes('доброе утро') ||
    lower.includes('добрый вечер')
  ) {
    return { intent: 'GREETING', confidence: 0.85 };
  }

  return { intent: 'QUESTION_ABOUT_SERVICES', confidence: 0.7 };
}

/**
 * 2. 10-Step Decision Matrix Evaluator
 */
export function evaluateSalesBrainDecisions(
  currentStage: SalesBrainStage,
  targetStage: SalesBrainStage,
  intent: ClientIntent,
  objectionMatch: ObjectionMatch | null,
  lead: any,
  messageCount: number,
): SalesBrainDecision {
  const phase = getConsultativePhaseForStage(targetStage);

  let shouldAskQuestion = false;
  let shouldProposeSolution = false;
  let shouldSendProposal = false;
  let shouldTransferToHuman = false;
  let nextBestAction: SalesBrainAction = 'ASK_QUALIFYING_QUESTION';
  let rationale = '';

  // 1. Human Handoff Decision
  if (targetStage === 'HUMAN_HANDOFF' || intent === 'REQUEST_CALL_HUMAN') {
    shouldTransferToHuman = true;
    nextBestAction = 'TRANSFER_TO_HUMAN';
    rationale = 'Клиент запросил созвон / прямой контакт с лицом принимающим решения.';
  }
  // 2. Objection Handling
  else if (objectionMatch || intent.startsWith('OBJECTION_')) {
    nextBestAction = 'HANDLE_OBJECTION';
    shouldAskQuestion = true;
    rationale = `Обнаружено сомнение/возражение (${objectionMatch?.category || intent}). Эмпатичная отработка с выходом на ценность.`;
  }
  // 3. Closing / Proposal
  else if (targetStage === 'PROPOSAL' || intent === 'INTERESTED_READY') {
    shouldSendProposal = true;
    nextBestAction = 'SEND_PROPOSAL';
    rationale = 'Клиент готов к коммерческому предложению и ознакомлению с условиями.';
  }
  // 4. Solution Presentation
  else if (targetStage === 'SOLUTION' || targetStage === 'QUALIFIED') {
    shouldProposeSolution = true;
    shouldAskQuestion = true;
    nextBestAction = 'PRESENT_SOLUTION';
    rationale = 'Потребность выявлена: презентуем архитектурное решение Nexora и связываем с ROI.';
  }
  // 5. Discovery & Qualifying
  else if (targetStage === 'DISCOVERY' || targetStage === 'CONTACTED') {
    shouldAskQuestion = true;
    nextBestAction = messageCount > 1 ? 'DEEPEN_PROBLEM_IMPACT' : 'ASK_QUALIFYING_QUESTION';
    rationale = 'Консалтинговая диагностика: выявление узких мест и потерь перед презентацией разработки.';
  }
  // 6. Default Fallback
  else {
    shouldAskQuestion = true;
    nextBestAction = 'ASK_QUALIFYING_QUESTION';
    rationale = 'Сбор контекста о процессах бизнеса клиента.';
  }

  return {
    shouldAskQuestion,
    shouldProposeSolution,
    shouldSendProposal,
    shouldTransferToHuman,
    detectedIntent: intent,
    detectedObjection: objectionMatch?.category || null,
    nextBestAction,
    consultativePhase: phase,
    rationale,
    confidence: 0.92,
  };
}

/**
 * 3. Consultative Reply Synthesizer (LLM + Strict Fallback)
 * Follows: PROBLEM -> IMPACT -> NEED -> SOLUTION -> VALUE -> OFFER
 */
export async function synthesizeConsultativeReply(
  provider: LLMProvider,
  config: Partial<AiAgentConfig> | null,
  lead: any,
  memoryContext: string,
  history: Array<{ direction: string; body: string }>,
  inboundText: string,
  targetStage: SalesBrainStage,
  decision: SalesBrainDecision,
  objectionMatch: ObjectionMatch | null,
  discoveryProfile?: NeedsDiscoveryProfile | null,
): Promise<string> {
  // 1. If Objection is matched and deterministic rebuttal is high confidence
  if (objectionMatch && targetStage === 'NEGOTIATION') {
    return objectionMatch.rebuttal;
  }

  // 2. If Human Handoff is triggered
  if (decision.shouldTransferToHuman || targetStage === 'HUMAN_HANDOFF') {
    return 'Отлично! Передаю диалог нашему ведущему архитектору решений для согласования деталей и созвона. Он подключится в течение нескольких минут.';
  }

  const companyName = lead.companyName || 'клиент';
  const niche = lead.niche || 'бизнес';
  const recService = lead.score?.recommendedService || 'WEB';
  const problems = Array.isArray(lead.analysis?.foundProblems)
    ? (lead.analysis.foundProblems as string[]).slice(0, 3).join(', ')
    : 'необходимость ускорения обработки заявок';

  const systemPrompt = `Ты — ведущий консультант по цифровой трансформации и IT-разработке Nexora.
Твоя цель — ПОНЯТЬ БИЗНЕС КЛИЕНТА И ПОМОЧЬ ЕМУ, следуя консалтинговой формуле:
PROBLEM (Боль) → IMPACT (Потери/Влияние на бизнес) → NEED (Потребность) → SOLUTION (Решение) → VALUE (Окупаемость/ROI) → OFFER (Предложение)

СТРОГИЕ ПРАВИЛА:
1. НЕ продавать разработку «в лоб» и не навязывать услуги без понимания контекста.
2. Не задавать клиенту списки вопросов или анкеты! Задавать максимум ОДИН естественный вопрос.
3. Не переспрашивать то, что уже известно.
4. Текущая стадия воронки: "${targetStage}" (Фаза: "${decision.consultativePhase}").
5. Длина ответа: строго 2–4 предложения (лаконично, структурированно, для WhatsApp/Telegram).
6. Обязательно заканчивай сообщение открытым вопросом по делу.
7. Запрещено: выдумывать нереалистичные цены/сроки, давить на клиента, спорить.
8. Тон: уважительный, партнерский, уверенный, экспертный.

Данные о клиенте:
- Компания: ${companyName}
- Ниша: ${niche}
- Сайт: ${lead.website || 'Отсутствует или на реконструкции'}
- Выявленные сложности: ${problems}
- Рекомендуемое решение Nexora: ${recService}
${discoveryProfile ? `\nПрофиль выявленных потребностей:\n- Потребность: ${discoveryProfile.need || 'уточняется'}\n- Боль: ${discoveryProfile.pain?.join(', ') || 'уточняется'}\n- Последствия: ${discoveryProfile.impact || 'уточняются'}\n- Желаемый результат: ${discoveryProfile.desiredResult || 'уточняется'}` : ''}
${discoveryProfile?.nextSuggestedQuestion ? `\nРекомендуемый следующий единственный вопрос: "${discoveryProfile.nextSuggestedQuestion}"` : ''}
${memoryContext ? `\nCRM Память о клиенте:\n${memoryContext}` : ''}
${config?.systemPrompt ? `\nДополнительные инструкции руководства:\n${config.systemPrompt}` : ''}`;

  const dialogueFormatted = history
    .slice(-8)
    .map((m) => `${m.direction === 'INBOUND' ? 'Клиент' : 'Консультант Nexora'}: ${m.body}`)
    .join('\n');

  const userPrompt = `История диалога:
${dialogueFormatted || '(Первое входящее сообщение)'}

Новое сообщение клиента: "${inboundText}"
Цель ответа: ${decision.rationale} (Действие: ${decision.nextBestAction})
${discoveryProfile?.nextSuggestedQuestion ? `Органично используй или адаптируй вопрос: "${discoveryProfile.nextSuggestedQuestion}"` : ''}

Сформулируй краткий (2-4 предложения), естественный ответ от лица консультанта Nexora.`;

  try {
    const rawReply = await provider.generateText(userPrompt, systemPrompt, {
      temperature: config?.temperature ?? 0.35,
    });

    if (rawReply && rawReply.trim().length > 15) {
      // Guard: Never allow sending initial outreach greeting when conversation is already active
      const isGreetingTemplate =
        rawReply.includes('Здравствуйте! Изучил ваш профиль') ||
        rawReply.includes('Здравствуйте! Обратили внимание на ваш бизнес') ||
        (history.length > 0 && rawReply.toLowerCase().startsWith('здравствуйте! изучил'));
      if (!isGreetingTemplate || history.length === 0) {
        return rawReply.trim();
      }
    }
  } catch (err) {
    logger.warn('LLM reply generation failed, using deterministic consultative fallback', { error: (err as Error).message });
  }

  // Deterministic Fallback Engine
  return generateDeterministicConsultativeFallback(
    targetStage,
    decision,
    companyName,
    niche,
    recService,
    discoveryProfile?.nextSuggestedQuestion,
    history.length,
  );
}

/**
 * Deterministic fallback responses aligned with consultative stages.
 */
function generateDeterministicConsultativeFallback(
  stage: SalesBrainStage,
  decision: SalesBrainDecision,
  companyName: string,
  niche: string,
  service: string,
  suggestedQuestion?: string | null,
  historyLength: number = 0,
): string {
  if (suggestedQuestion && (stage === 'DISCOVERY' || stage === 'CONTACTED' || historyLength > 0)) {
    return suggestedQuestion;
  }
  switch (stage) {
    case 'NEW':
    case 'CONTACTED':
      if (historyLength > 0) {
        return `Благодарю за ответ! Чтобы точнее понять специфику «${companyName}»: подскажите, как сейчас у вас организован прием обращений — клиенты пишут напрямую в WhatsApp или звонят по телефону?`;
      }
      return `Здравствуйте! Обратили внимание на ваш бизнес «${companyName}» в сфере ${niche}. Мы в Nexora помогаем компаниям автоматизировать прием клиентов и увеличить поток заявок через современные веб-сервисы и ботов. Скажите, актуален ли для вас вопрос привлечения новых клиентов сейчас?`;

    case 'DISCOVERY':
      return `Благодарю за ответ! Чтобы точнее понять специфику «${companyName}»: подскажите, как сейчас у вас выстроен процесс обработки входящих запросов — клиенты пишут напрямую операторам или есть автоматизированная система?`;

    case 'QUALIFIED':
      return `Понял вас! Это частая сложность в сфере ${niche}, из-за которой теряется до 25-30% обращений. Мы в Nexora как раз внедряем быстрые веб-решения и умных ассистентов, чтобы закрывать эту задачу. Хотите покажу, как мы реализовали похожее решение?`;

    case 'SOLUTION':
      return `Для задач «${companyName}» оптимально подойдет связка из быстрого веб-каталога и Telegram Mini App с интеграцией в CRM. Это позволяет клиенту оформлять заявку за 2 клика и ускоряет обработку в 3 раза. Можем подготовить короткий расчет под ваш объем?`;

    case 'PROPOSAL':
      return `Мы подготовили структурированное предложение с описанием этапов, сроков (от 2 недель) и бюджета. Могу отправить файл прямо сюда в чат для ознакомления?`;

    case 'NEGOTIATION':
      return `Прекрасно понимаю ваш вопрос. Мы можем разбить проект на 2 этапа — сначала запустить ключевой MVP за комфортный бюджет, чтобы он сразу начал приносить результат. Как смотрите на такой вариант?`;

    case 'FOLLOW_UP':
      return `Здравствуйте! Хотел уточнить, удалось ли посмотреть информацию по автоматизации для «${companyName}»? Буду рад ответить на любые технические вопросы или уточнить детали.`;

    case 'WON':
      return `Отлично! Рады началу совместной работы. Передаю проект в отдел разработки для подготовки ТЗ и договора. Наш специалист свяжется с вами сегодня.`;

    case 'LOST':
      return `Вас понял! Большое спасибо за уделенное время. Оставим наши контакты — если в будущем понадобится качественная IT-разработка или автоматизация, будем рады сотрудничеству. Успехов вашему бизнесу!`;

    case 'HUMAN_HANDOFF':
      return `Отлично! Передаю диалог нашему ведущему архитектору решений для согласования деталей. Он подключится в течение нескольких минут.`;

    default:
      return `Подскажите, какие ключевые задачи по автоматизации или развитию сайта сейчас стоят перед «${companyName}» в первую очередь?`;
  }
}

/**
 * 4. Main Sales Brain Processor: Autonomous Consultative Pipeline
 */
export async function processInboundWithSalesBrain(
  userId: string,
  conversationId: string,
  inboundText: string,
  forceTargetStage?: SalesBrainStage,
): Promise<SalesBrainProcessResult> {
  const startTime = Date.now();

  // Security check: Verify AI_READ permission to access conversation and lead data
  await assertAiPermission(userId, 'AI_READ', `Чтение диалога ${conversationId}`);

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      lead: {
        include: {
          analysis: true,
          score: true,
          clientMemories: { take: 10, orderBy: { createdAt: 'desc' } },
        },
      },
      aiState: true,
      messages: { orderBy: { recordedAt: 'desc' }, take: 15 },
    },
  });

  if (!conversation || !conversation.lead) {
    throw new Error('Conversation or lead not found for Sales Brain processing.');
  }

  const lead = conversation.lead;
  const config = await prisma.aiAgentConfig.findUnique({ where: { userId } });

  // 0. Global AI Off or Dialogue Paused Check
  if (config?.mode === 'OFF' || conversation.aiState?.isAiPaused) {
    const currentSt = normalizeSalesBrainStage(conversation.aiState?.stage || 'HUMAN_TAKEOVER');
    return {
      replyText: null,
      stage: currentSt,
      previousStage: currentSt,
      decision: {
        shouldAskQuestion: false,
        shouldProposeSolution: false,
        shouldSendProposal: false,
        shouldTransferToHuman: true,
        detectedIntent: 'OPT_OUT',
        nextBestAction: 'PROPOSE_NEXT_STEP',
        consultativePhase: 'PROBLEM',
        rationale: 'AI агент отключен или диалог переведен в ручной режим.',
        confidence: 1.0,
      },
      allowedActions: [],
      prohibitedActions: [],
      isAiPaused: true,
      isHotLead: false,
      humanHandoffTriggered: false,
      optOutTriggered: false,
      executionTimeMs: Date.now() - startTime,
    };
  }

  const provider = getAIProvider(config as any);

  // 1. Guardrail & Opt-Out Check
  const stopWords = Array.isArray(config?.stopWords) ? (config.stopWords as string[]) : undefined;
  const guard = checkGuardrails(inboundText, stopWords);

  if (guard.isOptOut) {
    await handleOptOutAction(userId, conversationId, lead.id);
    const decision: SalesBrainDecision = {
      shouldAskQuestion: false,
      shouldProposeSolution: false,
      shouldSendProposal: false,
      shouldTransferToHuman: false,
      detectedIntent: 'OPT_OUT',
      nextBestAction: 'PROPOSE_NEXT_STEP',
      consultativePhase: 'PROBLEM',
      rationale: 'Клиент запросил отписку/прекращение диалога.',
      confidence: 1.0,
    };
    return {
      replyText: null,
      stage: 'LOST',
      previousStage: normalizeSalesBrainStage(conversation.aiState?.stage),
      decision,
      allowedActions: getActionsForStage('LOST').allowed,
      prohibitedActions: getActionsForStage('LOST').prohibited,
      isAiPaused: true,
      isHotLead: false,
      humanHandoffTriggered: false,
      optOutTriggered: true,
      executionTimeMs: Date.now() - startTime,
    };
  }

  // Cancel any pending follow-ups since user replied
  await cancelPendingFollowUps(conversationId);

  // 2. Classify Intent & Objections
  const intentResult = classifyClientIntent(guard.sanitizedText);
  const objectionMatch = detectAndHandleObjection(guard.sanitizedText);
  const hotCheck = checkHotLeadIntent(guard.sanitizedText);

  // 3. Determine Current Stage & Transition
  const currentStage = normalizeSalesBrainStage(conversation.aiState?.stage);
  const hasIdentifiedProblems = Boolean(
    lead.analysis?.foundProblems &&
    Array.isArray(lead.analysis.foundProblems) &&
    lead.analysis.foundProblems.length > 0,
  );
  const hasIdentifiedNeed = Boolean(lead.assumedNeed || lead.clientMemories.length > 0);

  let targetStage: SalesBrainStage = forceTargetStage
    ? forceTargetStage
    : evaluateAutoStageTransition(
        currentStage,
        intentResult.intent,
        guard.sanitizedText,
        conversation.messages.length,
        hasIdentifiedProblems,
        hasIdentifiedNeed,
      );

  if (hotCheck.isHot && targetStage !== 'LOST') {
    targetStage = 'HUMAN_HANDOFF';
  }

  // Validate state transition
  const transitionCheck = validateStateTransition(currentStage, targetStage);
  if (!transitionCheck.allowed) {
    logger.warn('State transition rejected by Sales Brain State Machine, keeping current stage', {
      currentStage,
      targetStage,
      reason: transitionCheck.reason,
    });
    targetStage = currentStage;
  }

  // 4. Evaluate Decisions
  const decision = evaluateSalesBrainDecisions(
    currentStage,
    targetStage,
    intentResult.intent,
    objectionMatch,
    lead,
    conversation.messages.length,
  );

  // 5. Extract & Record Memory Facts (8-Layer Memory Engine)
  const extractedFacts = await extractAndStoreMemoryFacts(lead.id, guard.sanitizedText, conversationId);

  // 6. Dynamic Needs Discovery Engine: 12-Slot Profile Extraction & Single Question Selection
  const discoveryAnalysis = await NeedsDiscoveryEngine.analyzeAndExtractProfile(
    userId,
    conversationId,
    guard.sanitizedText,
    conversation,
  );

  // Auto-progress from DISCOVERY to QUALIFIED if core slots are known
  if (discoveryAnalysis.canTransitionToSolution && targetStage === 'DISCOVERY') {
    targetStage = 'QUALIFIED';
  }

  // 7. Synthesize Consultative Reply (with token-budgeted memory context)
  const memoryContext = await buildStructuredMemoryPrompt(lead.id, {
    preloadedMemories: lead.clientMemories,
    maxFactsPerLayer: 3,
    maxTotalFacts: 12,
  });
  const dialogueHistory = conversation.messages
    .slice()
    .reverse()
    .map((m) => ({ direction: m.direction, body: m.body }));

  const rawReplyText = await synthesizeConsultativeReply(
    provider,
    config,
    lead,
    memoryContext,
    dialogueHistory,
    guard.sanitizedText,
    targetStage,
    decision,
    objectionMatch,
    discoveryAnalysis.profile,
  );

  // Security check: Pass outgoing reply through PromptFirewall to strip leaked keys or system prompts
  const { sanitizedReply: replyText } = PromptFirewall.sanitizeOutgoingReply(rawReplyText);

  // 8. Update CRM State, Timeline & Audit Log in Parallel
  const isHumanHandoff = targetStage === 'HUMAN_HANDOFF';
  const isAiPaused = isHumanHandoff || (conversation.aiState?.isAiPaused ?? false);

  let leadStatus = lead.status;
  if (targetStage === 'WON') leadStatus = 'CLIENT';
  else if (targetStage === 'LOST') leadStatus = 'NO_RESPONSE';
  else if (targetStage === 'HUMAN_HANDOFF' || targetStage === 'NEGOTIATION') leadStatus = 'NEGOTIATION';
  else if (targetStage === 'QUALIFIED' || targetStage === 'SOLUTION' || targetStage === 'PROPOSAL') leadStatus = 'INTERESTED';
  else if (targetStage === 'DISCOVERY') leadStatus = 'REPLIED';

  const execTime = Date.now() - startTime;

  await Promise.all([
    prisma.aiDialogueState.upsert({
      where: { conversationId },
      update: {
        stage: targetStage as AiStage,
        isAiPaused,
        humanTakeoverAt: isHumanHandoff ? new Date() : undefined,
        lastAiReplyAt: replyText ? new Date() : undefined,
        confidenceScore: decision.confidence,
        discoveryProfile: discoveryAnalysis.profile as any,
      },
      create: {
        conversationId,
        stage: targetStage as AiStage,
        isAiPaused,
        humanTakeoverAt: isHumanHandoff ? new Date() : null,
        lastAiReplyAt: replyText ? new Date() : null,
        confidenceScore: decision.confidence,
        discoveryProfile: discoveryAnalysis.profile as any,
      },
    }),
    leadStatus !== lead.status
      ? prisma.lead.update({
          where: { id: lead.id },
          data: { status: leadStatus },
        })
      : Promise.resolve(null),
    prisma.timelineEvent.create({
      data: {
        userId,
        leadId: lead.id,
        conversationId,
        eventType: isHumanHandoff
          ? 'HUMAN_HANDOFF'
          : objectionMatch
          ? 'OBJECTION_LOGGED'
          : 'MESSAGE_SENT',
        title: isHumanHandoff
          ? 'Sales Brain: Диалог передан человеку'
          : `Sales Brain: Стадия ${STAGE_RULES[targetStage]?.label || targetStage}`,
        description: replyText ? `Ответ AI: ${replyText.slice(0, 150)}...` : 'AI обработал диалог',
        metadata: {
          stage: targetStage,
          phase: decision.consultativePhase,
          intent: intentResult.intent,
          nextBestAction: decision.nextBestAction,
        } as any,
      },
    }),
    prisma.aiAuditLog.create({
      data: {
        userId,
        leadId: lead.id,
        conversationId,
        actionType: objectionMatch ? 'OBJECTION_HANDLED' : 'INBOUND_REPLY',
        modelUsed: provider.name,
        inputSnapshot: {
          inboundText: guard.sanitizedText,
          currentStage,
          intent: intentResult.intent,
        },
        outputSnapshot: {
          targetStage,
          phase: decision.consultativePhase,
          reply: replyText,
          decision: decision as any,
        } as any,
        executionTimeMs: execTime,
        success: true,
      },
    }),
  ]);

  if (isHumanHandoff) {
    await triggerHumanHandoff(userId, conversationId, lead.id, hotCheck.intentReason || 'Передано архитектору решений');
  } else if (targetStage !== 'LOST' && targetStage !== 'WON') {
    await scheduleNextFollowUp(conversationId, lead.id);
  }

  const stageActions = getActionsForStage(targetStage);

  return {
    replyText,
    stage: targetStage,
    previousStage: currentStage,
    decision,
    allowedActions: stageActions.allowed,
    prohibitedActions: stageActions.prohibited,
    isAiPaused,
    isHotLead: hotCheck.isHot,
    humanHandoffTriggered: isHumanHandoff,
    objectionHandled: Boolean(objectionMatch),
    optOutTriggered: false,
    extractedFacts: extractedFacts.map((f) => ({ key: f.key, value: f.value, layer: f.layer })),
    executionTimeMs: execTime,
  };
}

/**
 * 5. Generate Smart Copilot Suggestions for Human Managers
 */
export async function generateCopilotSuggestions(
  userId: string,
  conversationId: string,
): Promise<CopilotSuggestion[]> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      lead: { include: { analysis: true, score: true } },
      aiState: true,
      messages: { orderBy: { recordedAt: 'desc' }, take: 8 },
    },
  });

  if (!conversation || !conversation.lead) {
    throw new Error('Conversation not found.');
  }

  const lead = conversation.lead;
  const companyName = lead.companyName || 'клиент';
  const niche = lead.niche || 'бизнес';
  const stage = normalizeSalesBrainStage(conversation.aiState?.stage);

  const s1: CopilotSuggestion = {
    id: 'sug_diagnostic',
    type: 'DIAGNOSTIC_QUESTION',
    title: '1. Диагностический вопрос (BANT & Боли)',
    text: `Подскажите, как сейчас у вас в «${companyName}» выстроен процесс приема и ведения клиентов — вручную через мессенджеры или уже внедрена CRM/автоматизация?`,
    rationale: 'Выявляет узкие места и ручные потери без давления на покупку.',
  };

  const s2: CopilotSuggestion = {
    id: 'sug_value',
    type: 'VALUE_PITCH',
    title: '2. Презентация ценности решения (ROI)',
    text: `Мы специализируемся на разработке веб-сервисов и ботов для ниши ${niche}. Можем внедрить решение, которое сократит время ответа клиентам до 5 секунд и увеличит конверсию в заявку на 25-40%. Хотите покажу пример реализации?`,
    rationale: 'Демонстрирует экспертизу в нише и измеримый финансовый результат.',
  };

  const s3: CopilotSuggestion = {
    id: 'sug_closing',
    type: 'CLOSING_CTA',
    title: '3. Призыв к согласованию ТЗ / созвону',
    text: `Можем провести короткий 15-минутный онлайн-созвон с нашим ведущим архитектором: покажем рабочий прототип решения под задачи «${companyName}» и рассчитаем смету. В какое время вам удобно созвониться?`,
    rationale: 'Переводит лида на встречу с лицом принимающим решения.',
  };

  return [s1, s2, s3];
}

/**
 * 6. Get Full Diagnostic State of a Conversation
 */
export async function getSalesBrainState(
  userId: string,
  conversationId: string,
): Promise<SalesBrainStateData> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      lead: {
        include: {
          clientMemories: { take: 15, orderBy: { createdAt: 'desc' } },
        },
      },
      aiState: true,
    },
  });

  if (!conversation || !conversation.lead) {
    throw new Error('Conversation not found.');
  }

  const currentStage = normalizeSalesBrainStage(conversation.aiState?.stage);
  const actions = getActionsForStage(currentStage);
  const phase = getConsultativePhaseForStage(currentStage);

  return {
    conversationId,
    leadId: conversation.leadId,
    currentStage,
    allowedActions: actions.allowed,
    prohibitedActions: actions.prohibited,
    consultativePhase: phase,
    bant: {
      budget: conversation.aiState?.bantBudget,
      authority: conversation.aiState?.bantAuthority,
      need: conversation.aiState?.bantNeed,
      timeline: conversation.aiState?.bantTimeline,
    },
    identifiedPains: Array.isArray(conversation.aiState?.identifiedPains)
      ? (conversation.aiState.identifiedPains as string[])
      : [],
    offeredServices: Array.isArray(conversation.aiState?.offeredServices)
      ? (conversation.aiState.offeredServices as string[])
      : [],
    objectionsEncountered: Array.isArray(conversation.aiState?.objectionsEncountered)
      ? (conversation.aiState.objectionsEncountered as string[])
      : [],
    isAiPaused: conversation.aiState?.isAiPaused ?? false,
    confidenceScore: conversation.aiState?.confidenceScore ?? 0.9,
    recentMemories: conversation.lead.clientMemories as any,
  };
}

/**
 * 7. Programmatic or Manual Stage Transition
 */
export async function transitionSalesBrainStage(
  userId: string,
  conversationId: string,
  nextStage: SalesBrainStage,
  reason?: string,
): Promise<{ success: boolean; stage: SalesBrainStage; message: string }> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { aiState: true, lead: true },
  });

  if (!conversation) {
    throw new Error('Conversation not found.');
  }

  const currentStage = normalizeSalesBrainStage(conversation.aiState?.stage);
  const validation = validateStateTransition(currentStage, nextStage, true); // Manager override = true

  if (!validation.allowed) {
    return { success: false, stage: currentStage, message: validation.reason || 'Transition rejected' };
  }

  const isHandoff = nextStage === 'HUMAN_HANDOFF';

  await prisma.aiDialogueState.upsert({
    where: { conversationId },
    update: {
      stage: nextStage as AiStage,
      isAiPaused: isHandoff ? true : conversation.aiState?.isAiPaused,
      humanTakeoverAt: isHandoff ? new Date() : undefined,
    },
    create: {
      conversationId,
      stage: nextStage as AiStage,
      isAiPaused: isHandoff,
      humanTakeoverAt: isHandoff ? new Date() : null,
    },
  });

  await prisma.timelineEvent.create({
    data: {
      userId,
      leadId: conversation.leadId,
      conversationId,
      eventType: isHandoff ? 'HUMAN_HANDOFF' : 'DEAL_STAGE_CHANGED',
      title: `Стадия изменена на: ${STAGE_RULES[nextStage]?.label || nextStage}`,
      description: reason || `Переход из ${currentStage} в ${nextStage}`,
      metadata: { fromStage: currentStage, toStage: nextStage, manual: true } as any,
    },
  });

  return {
    success: true,
    stage: nextStage,
    message: `Стадия успешно изменена на ${STAGE_RULES[nextStage]?.label || nextStage}`,
  };
}
