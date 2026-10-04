import { prisma } from '@nexora/database';
import type {
  NegotiationObjectionType,
  NegotiationStrategyForExpensive,
  NegotiationTurn,
  OwnerDiscountPolicy,
  NegotiationProcessRequest,
  NegotiationEngineResult,
  CommercialProposal,
  Deal,
} from '@nexora/types';
import { logger } from '../../common/logger';
import { recordTimelineEvent, recordClientMemory } from '../crm/crm.service';
import { emitToUser } from '../../common/realtime/socket';
import { assertAiPermission } from '../../common/security/permissions';
import { PromptFirewall } from '../../common/security/prompt-firewall';

// ============================================================================
// 1. Default Owner Discount Policy
// ============================================================================

export const DEFAULT_OWNER_DISCOUNT_POLICY: OwnerDiscountPolicy = {
  maxDiscountPercent: 12,
  allowDiscountsWithoutScopeReduction: false,
  requireManagerApprovalAbovePercent: 15,
  autoSuggestMvpFirst: true,
};

// ============================================================================
// 2. Objection Match Rule Definition
// ============================================================================

interface ObjectionRule {
  type: NegotiationObjectionType;
  keywords: string[];
  underlyingReason: string;
  acknowledge: string;
  clarify: string;
  reframe: string;
  nextStep: string;
}

const OBJECTION_RULES: ObjectionRule[] = [
  {
    type: 'OPT_OUT',
    keywords: [
      'не пишите мне',
      'не пишите больше',
      'не пишите',
      'отпишите',
      'отпишите меня',
      'удалите номер',
      'удалите меня',
      'спам',
      'стоп',
      'не звоните',
      'отстаньте',
      'хватит писать',
      'stop',
      'unsubscribe',
    ],
    underlyingReason: 'Категорический отказ от коммуникации или нежелание получать сообщения.',
    acknowledge: 'Вас понял, приношу извинения за беспокойство.',
    clarify: '',
    reframe: '',
    nextStep: 'Коммуникация немедленно прекращена.',
  },
  {
    type: 'EXPENSIVE',
    keywords: [
      'дорого',
      'слишком дорого',
      'очень дорого',
      'дороговато',
      'высокая цена',
      'много просите',
      'цены кусаются',
      'не по карману',
      'ценник высокий',
      'дорого стоит',
      'накладно',
      'слишком накладно',
      'платить сразу',
      'сразу всю сумму',
      'платить всю сумму',
      'большая сумма',
      'не потянем',
      'не тянем',
      'бьет по карману',
      'скидка',
      'скидку',
      'скидочку',
      'сделайте скидку',
      'дайте скидку',
      'скиньте цену',
      'уступите',
      'дешевле',
      'expensive',
      'too expensive',
      'high price',
      'discount',
    ],
    underlyingReason: 'Неуверенность в окупаемости инвестиций, недостаток бюджета на полный scope или непонимание структуры себестоимости.',
    acknowledge: 'Полностью вас понимаю: инвестиции в разработку должны быть экономически обоснованы и быстро окупаться.',
    clarify: 'Подскажите, какой формат для вас комфортнее рассмотреть?',
    reframe:
      'Мы в Nexora можем разбить проект на 2 этапа: сначала запустить ключевой модуль (MVP), который сразу начнет приносить новые заявки и окупать себя, а расширение сделать позже. Либо можем оптимизировать состав функций строго под желаемый бюджет.',
    nextStep: 'Удобно будет посмотреть, как выглядит базовый MVP для вашей сферы и каков его срок окупаемости?',
  },
  {
    type: 'THINK_ABOUT_IT',
    keywords: [
      'подумаем',
      'надо подумать',
      'я подумаю',
      'мы подумаем',
      'посоветуемся',
      'надо взвесить',
      'подумаю',
      'надо обсудить',
      'think about it',
      'need to think',
    ],
    underlyingReason: 'Остались скрытые сомнения по срокам, окупаемости или интеграции, либо не сформирована достаточная срочность.',
    acknowledge: 'Конечно, взвешенное решение — самое правильное для бизнеса.',
    clarify: 'Обычно, когда берут паузу на подумать, остаются вопросы по срокам запуска, окупаемости или интеграции с текущими процессами. Какая часть проекта сейчас вызывает наибольшие сомнения?',
    reframe:
      'Чтобы не тратить ваше время на абстрактные размышления, мы можем наглядно показать интерактивный прототип решения на 10-минутном созвоне.',
    nextStep: 'Удобно будет взглянуть на 10-минутное демо в зуме/телеграме, чтобы принять окончательное решение на основе реального прототипа?',
  },
  {
    type: 'NOT_NEEDED',
    keywords: [
      'не нужно',
      'нам это не надо',
      'не надо',
      'не интересно',
      'не актуально',
      'нет потребности',
      'нам не требуется',
      'not interested',
      'not needed',
    ],
    underlyingReason: 'Клиент не осознает скрытые потери (например, ночные упущенные заявки или низкую конверсию на смартфонах).',
    acknowledge: 'Вас понял, спасибо за честный и прямой ответ!',
    clarify: 'Чтобы мы понимали специфику: у вас сейчас уже налажен автоматический сбор заявок из мессенджеров?',
    reframe:
      'Многие наши клиенты тоже изначально не планировали разработку, пока не увидели, что до 35% клиентов уходят к конкурентам, если им не ответили в течение 3–5 минут в WhatsApp.',
    nextStep: 'Оставляю наши контакты. Если в будущем возникнет задача по разработке сайта, бота или автоматизации — команда Nexora всегда на связи. Могу прислать ссылку на портфолио на всякий случай?',
  },
  {
    type: 'ALREADY_HAVE_DEVELOPER',
    keywords: [
      'есть разработчик',
      'свой программист',
      'штатный программист',
      'штатный айтишник',
      'у нас есть подрядчик',
      'уже есть разработчики',
      'своя команда разработки',
      'работаем с программистом',
      'свой разработчик',
      'есть программист',
      'свои программисты',
      'свои разработчики',
      'уже есть программист',
      'have developer',
      'own developer',
    ],
    underlyingReason: 'Лояльность к текущему подрядчику или штатному сотруднику, опасение конфликта интересов.',
    acknowledge: 'Здорово, что у вас уже есть проверенная IT-команда! Это отличная база.',
    clarify: 'Подскажите, хватает ли текущим разработчикам ресурсов на быстрое внедрение Telegram Mini Apps и AI-инструментов?',
    reframe:
      'Мы в Nexora не заменяем ваших специалистов, а часто работаем в связке: берем на себя узкие задачи (например, создание Telegram Mini App с платежами или 24/7 AI-ассистента в WhatsApp), чтобы разгрузить вашу команду от рутины.',
    nextStep: 'Хотите, пришлю техническую спецификацию или API-документацию, которую ваш разработчик сможет быстро оценить?',
  },
  {
    type: 'ALREADY_HAVE_WEBSITE',
    keywords: [
      'есть сайт',
      'у нас уже есть сайт',
      'сайт сделан',
      'уже есть лендинг',
      'сайт работает',
      'уже есть веб-сайт',
      'свой сайт',
      'сайт есть',
      'лендинг есть',
      'already have website',
      'have site',
    ],
    underlyingReason: 'Уверенность, что существующий сайт полностью закрывает задачи, непонимание разницы в конверсии современных Web-приложений.',
    acknowledge: 'Отлично! Наличие действующего сайта — это уже готовый источник входящего трафика.',
    clarify: 'Удовлетворяет ли вас текущая конверсия сайта на мобильных устройствах и скорость загрузки?',
    reframe:
      'Мы часто не переделываем рабочий сайт с нуля, а подключаем к нему современные инструменты захвата: интерактивный Telegram-бот для онлайн-заказа в 2 клика или AI-виджет консультаций, поднимающий конверсию текущих посетителей на +30–40%.',
    nextStep: 'Хотите, проведем бесплатный 5-минутный UX-аудит текущего сайта с рекомендациями по росту конверсии на смартфонах?',
  },
  {
    type: 'SEND_PRICE_LIST',
    keywords: [
      'отправьте цены',
      'пришлите цены',
      'пришлите прайс',
      'отправьте прайс',
      'скиньте прайс',
      'сколько стоит',
      'какой прайс',
      'скиньте расценки',
      'назовите цену',
      'какая цена',
      'прайс-лист',
      'прайс',
      'цены и прайс',
      'send prices',
      'price list',
      'what is the price',
    ],
    underlyingReason: 'Потребность в быстром ценовом ориентире без долгих созвонов, сравнение с рынком.',
    acknowledge: 'С удовольствием сориентирую вас по ценовым диапазонам!',
    clarify: 'Подскажите кратко, какую главную задачу сейчас хотите решить: сайт, Telegram Mini App или авто-ответы в мессенджерах?',
    reframe:
      'У нас прозрачное ценообразование: базовые Telegram-боты и авто-воронки — от 35 000 ₽, современные веб-сервисы на Next.js — от 45 000 ₽, внедрение умного AI-ассистента 24/7 — от 50 000 ₽. Итоговая стоимость зависит только от набора нужных функций и фиксируется в договоре.',
    nextStep: 'После вашего ответа я сразу пришлю точную смету с составом работ и сроками реализации.',
  },
  {
    type: 'NOT_RIGHT_TIME',
    keywords: [
      'сейчас не время',
      'не время',
      'не вовремя',
      'потом',
      'не сейчас',
      'в следующем квартале',
      'после праздников',
      'в конце года',
      'через месяц',
      'позже',
      'занят',
      'not now',
      'later',
    ],
    underlyingReason: 'Высокая загруженность текущими операционными задачами, отсутствие временного ресурса на запуск.',
    acknowledge: 'Принял вас, полностью уважаю ваше время и текущую загрузку!',
    clarify: 'Чтобы мы не отвлекали вас раньше времени: когда для вашей компании будет наиболее актуально вернуться к вопросу?',
    reframe:
      'Мы берем 90% технических задач на себя: проектирование, дизайн, разработку и перенос на сервер. От вас потребуется всего 1–2 коротких созвона для согласования.',
    nextStep: 'Давайте я зафиксирую дату и вернусь к вам, когда спадет операционная нагрузка. Удобно будет списаться через пару недель?',
  },
  {
    type: 'NO_BUDGET',
    keywords: [
      'нет бюджета',
      'бюджет не заложен',
      'нет денег на разработку',
      'кризис',
      'денег нет',
      'нет денег',
      'не планировали траты',
      'нет свободных средств',
      'бюджета нет',
      'no budget',
      'out of budget',
    ],
    underlyingReason: 'Ограниченность денежного потока или заморозка инвестиционных бюджетов компании.',
    acknowledge: 'Понимаю текущую ситуацию: грамотное управление денежным потоком — главный приоритет любого бизнеса.',
    clarify: 'Рассматриваете ли вы запуск поэтапного MVP с окупаемостью с первого месяца?',
    reframe:
      'Мы можем не начинать с масштабной разработки, а запустить легкое микро-решение (например, базовый Telegram-бот или WhatsApp авто-воронку от 30 000 ₽), которое начнет окупать себя с первых же привлеченных клиентов.',
    nextStep: 'Хотите посмотреть краткий расчет, как микро-решение окупает себя в вашей сфере за 2–3 недели?',
  },
  {
    type: 'DISCUSS_WITH_BOSS',
    keywords: [
      'обсудить с руководителем',
      'обсудить с директором',
      'согласовать с директором',
      'согласовать с руководителем',
      'покажу руководству',
      'решает директор',
      'обсужу с шефом',
      'обсудить с шефом',
      'нужно одобрение руководства',
      'я не принимаю решение',
      'покажу начальнику',
      'согласовать с шефом',
      'обсудить это с директором',
      'discuss with boss',
      'need approval',
    ],
    underlyingReason: 'Собеседник не является единственным лицом, принимающим решения (ЛПР), и боится некорректно передать ценность руководству.',
    acknowledge: 'Конечно, такие решения принимаются на уровне руководства компании.',
    clarify: 'Какие ключевые показатели (сроки, окупаемость, гарантии) наиболее важны для вашего директора?',
    reframe:
      'Чтобы вам не тратить время на пересказ и подготовку материалов, мы можем подготовить краткую 1-страничную сводку (Executive Summary) для вашего руководителя: проблема, решение, расчет окупаемости и гарантии Nexora.',
    nextStep: 'Подготовить для вас такой компактный документ для показа директору?',
  },
  {
    type: 'SEND_PROPOSAL',
    keywords: [
      'пришлите предложение',
      'отправьте предложение',
      'пришлите кп',
      'отправьте кп',
      'скиньте на почту предложение',
      'скиньте кп',
      'вышлите коммерческое',
      'пришлите информацию',
      'скиньте предложение',
      'коммерческое предложение',
      'send proposal',
      'send offer',
    ],
    underlyingReason: 'Желание быстро получить официальный структурированный документ для ознакомления.',
    acknowledge: 'С радостью подготовлю для вас персональное коммерческое предложение!',
    clarify: 'Чтобы КП содержало точные цифры под ваш бизнес, а не шаблонную воду: какой продукт для вас сейчас приоритетнее — сайт на Next.js, Telegram Mini App или AI-ассистент в WhatsApp?',
    reframe:
      'Наши коммерческие предложения включают детальный состав работ (Scope), дорожную карту запуска по неделям, вилку бюджета и расчет ожидаемого эффекта (ROI).',
    nextStep: 'После вашего ответа я сразу сформирую и отправлю готовый расчет прямо сюда в чат.',
  },
  {
    type: 'COMPARING_OPTIONS',
    keywords: [
      'сравниваем варианты',
      'сравниваем',
      'выбираем подрядчика',
      'выбираем студию',
      'есть другие предложения',
      'смотрим конкурентов',
      'у нас тендер',
      'сравниваем с другими',
      'смотрим еще студии',
      'выбираем',
      'comparing',
      'comparing options',
    ],
    underlyingReason: 'Активный выбор между несколькими поставщиками, поиск объективных критериев надежности и технологичности.',
    acknowledge: 'Это очень грамотный подход: выбор IT-партнера определяет качество и стабильность продукта на годы вперед.',
    clarify: 'На какие критерии (скорость работы, передача исходного кода, гарантии) вы обращаете внимание в первую очередь?',
    reframe:
      'Ключевые преимущества Nexora: мы разрабатываем на современном стеке Next.js & React (скорость <0.8с), передаем 100% исходного кода в ваш Git и предоставляем 6 месяцев бесплатной гарантийной поддержки по официальному договору.',
    nextStep: 'Могу прислать краткий чек-лист критериев для сравнения IT-подрядчиков, чтобы вам было проще сделать объективный выбор. Прислать?',
  },
];

// ============================================================================
// 3. Negotiation Engine Class
// ============================================================================

export class NegotiationEngine {
  /**
   * Main entrypoint for processing any incoming client objection.
   * Strictly adheres to: OBJECTION → IDENTIFY REASON → ACKNOWLEDGE → CLARIFY → REFRAME VALUE → OFFER NEXT STEP
   */
  static async processNegotiation(
    userId: string,
    request: NegotiationProcessRequest,
  ): Promise<NegotiationEngineResult> {
    const startTime = Date.now();
    const { text, conversationId, leadId, customOwnerPolicy } = request;

    const policy: OwnerDiscountPolicy = {
      ...DEFAULT_OWNER_DISCOUNT_POLICY,
      ...(customOwnerPolicy || {}),
    };

    // Security check: Enforce AI_NEGOTIATE permission
    await assertAiPermission(userId, 'AI_NEGOTIATE', `Переговоры/возражения для диалога ${conversationId || leadId}`);

    // 1. Fetch Conversation & Lead Context
    let conversation: any = null;
    let lead: any = null;

    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          lead: {
            include: {
              score: true,
              analysis: true,
              proposals: { take: 1, orderBy: { createdAt: 'desc' } },
            },
          },
          aiState: true,
        },
      });

      if (conversation?.lead) {
        lead = conversation.lead;
      }
    }

    if (!lead && leadId) {
      lead = await prisma.lead.findFirst({
        where: { id: leadId, userId },
        include: { score: true, analysis: true, proposals: { take: 1, orderBy: { createdAt: 'desc' } } },
      });
    }

    // 2. Classify Objection & Detect Opt-Out
    const matchedRule = this.classifyObjection(text);

    // 3. Handle Immediate Opt-Out if requested
    if (matchedRule.type === 'OPT_OUT') {
      const optOutTurn = this.handleOptOut();
      await this.syncOptOutToCrm(userId, conversation?.id, lead?.id, text);

      return {
        turn: optOutTurn,
        crmUpdates: {
          isAiPaused: true,
          leadStatus: 'NO_RESPONSE',
          optOut: true,
          recordedMemoryFact: {
            key: 'client_opt_out',
            value: 'Клиент запросил прекращение коммуникации (Opt-Out). Автоматические ответы остановлены.',
            layer: 'OBJECTION',
          },
        },
        executionTimeMs: Date.now() - startTime,
      };
    }

    // 4. Handle "Expensive" Objection with Strategic Matrix & Owner Policy
    let expensiveStrategy: NegotiationStrategyForExpensive | undefined;
    let discountOffer: NegotiationTurn['discountOffer'] | undefined;
    let turn: NegotiationTurn;

    if (matchedRule.type === 'EXPENSIVE') {
      const expensiveResult = this.handleExpensiveObjection(text, lead, policy);
      expensiveStrategy = expensiveResult.strategy;
      discountOffer = expensiveResult.discountOffer;

      turn = {
        detectedObjection: 'EXPENSIVE',
        confidence: 0.96,
        underlyingReason: matchedRule.underlyingReason,
        acknowledgedEmpathy: matchedRule.acknowledge,
        clarifyingQuestion: expensiveResult.clarifyingQuestion,
        reframedValue: expensiveResult.reframedValue,
        suggestedNextStep: expensiveResult.suggestedNextStep,
        fullResponseText: expensiveResult.fullResponseText,
        expensiveStrategyApplied: expensiveStrategy,
        discountOffer,
        optOutTriggered: false,
        guardrailPassed: this.enforceNegotiationGuardrails(expensiveResult.fullResponseText),
      };
    } else {
      // 5. Standard 5-Step Formula for other 10 Objections
      const fullResponse = `${matchedRule.acknowledge}\n\n${matchedRule.reframe}\n\n${matchedRule.clarify ? matchedRule.clarify + '\n\n' : ''}${matchedRule.nextStep}`;

      turn = {
        detectedObjection: matchedRule.type,
        confidence: matchedRule.type === 'UNKNOWN' ? 0.4 : 0.92,
        underlyingReason: matchedRule.underlyingReason,
        acknowledgedEmpathy: matchedRule.acknowledge,
        clarifyingQuestion: matchedRule.clarify,
        reframedValue: matchedRule.reframe,
        suggestedNextStep: matchedRule.nextStep,
        fullResponseText: fullResponse,
        optOutTriggered: false,
        guardrailPassed: this.enforceNegotiationGuardrails(fullResponse),
      };
    }

    // 6. Record in CRM Memory & Timeline
    const memoryFact = await this.syncNegotiationToCrm(userId, conversation?.id, lead?.id, turn, text);

    return {
      turn,
      crmUpdates: {
        isAiPaused: false,
        optOut: false,
        recordedMemoryFact: memoryFact,
      },
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Fast, deterministic classifier matching 11 objections + Opt-Out triggers.
   * Uses word boundary matching and longest-match scoring to eliminate collisions (e.g. 'мне нужно' vs 'не нужно').
   */
  static classifyObjection(text: string): ObjectionRule {
    const raw = text.trim();
    const lower = raw.toLowerCase();

    // 1. OPT_OUT check has absolute priority
    const optOutRule = OBJECTION_RULES.find((r) => r.type === 'OPT_OUT')!;
    for (const kw of optOutRule.keywords) {
      if (lower.includes(kw)) {
        return optOutRule;
      }
    }

    // 2. Score all other rules based on exact word boundary & longest keyword length
    let bestMatch: { rule: ObjectionRule; score: number } | null = null;

    for (const rule of OBJECTION_RULES) {
      if (rule.type === 'OPT_OUT') continue;

      for (const kw of rule.keywords) {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?:^|[^а-яёa-z0-9])${escaped}(?:$|[^а-яёa-z0-9])`, 'i');

        if (pattern.test(lower)) {
          const matchScore = kw.length;
          if (!bestMatch || matchScore > bestMatch.score) {
            bestMatch = { rule, score: matchScore };
          }
        }
      }
    }

    if (bestMatch) {
      return bestMatch.rule;
    }

    // Default Unknown fallback
    return {
      type: 'UNKNOWN',
      keywords: [],
      underlyingReason: 'Общий запрос или вопрос без ярко выраженного возражения.',
      acknowledge: 'Понимаю вашу позицию, спасибо за уточнение!',
      clarify: 'Подскажите, какой аспект для вас сейчас наиболее приоритетен?',
      reframe: 'Мы в Nexora всегда подбираем решение индивидуально под бизнес-процессы компании.',
      nextStep: 'Удобно будет обсудить детали на короткой 10-минутной демонстрации?',
    };
  }

  /**
   * Generates empathetic, non-intrusive goodbye and halts AI instantly.
   */
  private static handleOptOut(): NegotiationTurn {
    const fullResponse =
      'Вас понял, больше не будем вас беспокоить. Если в будущем возникнет задача по разработке сайта, бота или автоматизации — контакты Nexora сохранены в этом чате. Всего вам доброго и успешного развития бизнеса!';

    return {
      detectedObjection: 'OPT_OUT',
      confidence: 1.0,
      underlyingReason: 'Клиент запросил прекращение рассылки / сообщений.',
      acknowledgedEmpathy: 'Вас понял, больше не будем вас беспокоить.',
      clarifyingQuestion: '',
      reframedValue: '',
      suggestedNextStep: 'Диалог переведен в архив, AI остановлен.',
      fullResponseText: fullResponse,
      optOutTriggered: true,
      guardrailPassed: true,
    };
  }

  /**
   * Handles "Expensive" objection according to the strict 5-strategy rule matrix:
   * 1. Reduce scope
   * 2. Staged payments
   * 3. Offer MVP
   * 4. Alternative format (e.g. TMA vs Mobile App)
   * 5. Explain cost breakdown
   * + Owner Discount Policy compliance
   */
  private static handleExpensiveObjection(
    text: string,
    lead: any,
    policy: OwnerDiscountPolicy,
  ): {
    strategy: NegotiationStrategyForExpensive;
    clarifyingQuestion: string;
    reframedValue: string;
    suggestedNextStep: string;
    fullResponseText: string;
    discountOffer?: NegotiationTurn['discountOffer'];
  } {
    const lower = text.toLowerCase();
    const proposal = lead?.proposals?.[0] as CommercialProposal | undefined;
    const basePrice = proposal ? proposal.priceEstimateMin : 45000;

    // Determine strategy based on client text nuance
    let strategy: NegotiationStrategyForExpensive = 'OFFER_MVP';
    let strategyExplanation = '';
    let clarifying = '';
    let discountOffer: NegotiationTurn['discountOffer'] | undefined;

    if (lower.includes('скидк') || lower.includes('уступите') || lower.includes('дешевле')) {
      if (policy.allowDiscountsWithoutScopeReduction && policy.maxDiscountPercent > 0) {
        const discountAmount = Math.round(basePrice * (policy.maxDiscountPercent / 100));
        const finalPrice = basePrice - discountAmount;

        strategy = 'OWNER_POLICY_DISCOUNT';
        strategyExplanation = `Мы можем согласовать скидку ${policy.maxDiscountPercent}% в рамках текущего спринта разработки (экономия ${discountAmount.toLocaleString('ru-RU')} ₽, итоговая стоимость: ${finalPrice.toLocaleString('ru-RU')} ₽) при условии фиксации ТЗ на этой неделе.`;
        clarifying = 'Позволит ли такой бюджет комфортно стартовать проект?';
        discountOffer = {
          discountPercent: policy.maxDiscountPercent,
          discountAmount,
          finalPrice,
          rationale: `Согласована скидка ${policy.maxDiscountPercent}% по политике владельца`,
          isOwnerPolicyCompliant: true,
        };
      } else {
        strategy = 'REDUCE_SCOPE';
        strategyExplanation =
          'Мы не снижаем качество кода и надежность серверов, но можем уменьшить объем (Scope): убрать второстепенные модули и оставить только то, что напрямую приносит новых клиентов и продажи.';
        clarifying = 'Какие 1–2 функции для вас сейчас критически важны для старта?';
      }
    } else if (lower.includes('сразу') || lower.includes('разом') || lower.includes('платить')) {
      strategy = 'STAGED_PAYMENT';
      strategyExplanation =
        'Вам не нужно оплачивать весь проект целиком: мы работаем с поэтапной оплатой (50% предоплата этапа, 50% после демонстрации готового модуля). Это снижает нагрузку на ваш бюджет и дает полный контроль за каждым этапом.';
      clarifying = 'Удобно ли разбить оплату на 2–3 равные части по ходу разработки?';
    } else if (lower.includes('приложение') || lower.includes('дорогое приложение')) {
      strategy = 'ALTERNATIVE_FORMAT';
      strategyExplanation =
        'Вместо разработки тяжелого мобильного приложения для App Store мы можем запустить Telegram Mini App (TMA). Он открывается мгновенно прямо в Telegram, обладает тем же функционалом онлайн-заказа, но стоит в 3 раза дешевле и запускается за 2 недели.';
      clarifying = 'Рассматривали формат Telegram Mini App для вашей сферы?';
    } else {
      // Default: MVP + Cost Breakdown
      strategy = 'OFFER_MVP';
      strategyExplanation =
        'Мы можем разбить проект на 2 этапа: сначала запустить базовый функционал (MVP от 35 000 ₽), который сразу начнет приносить новые заявки и окупать вложения, а масштабирование сделать из уже полученной прибыли. В стоимость входят дизайн, код, интеграции с 1С/мессенджерами и 6 месяцев гарантийного обслуживания.';
      clarifying = 'Подскажите, комфортно ли стартовать с базового MVP с быстрой окупаемостью?';
    }

    const nextStep = 'Удобно будет созвониться на 10 минут, чтобы наглядно показать состав MVP и зафиксировать комфортную смету?';

    const fullResponseText = `Полностью вас понимаю: инвестиции в IT-разработку должны быть экономически обоснованы и быстро приносить прибыль.\n\n${strategyExplanation}\n\n${clarifying}\n\n${nextStep}`;

    return {
      strategy,
      clarifyingQuestion: clarifying,
      reframedValue: strategyExplanation,
      suggestedNextStep: nextStep,
      fullResponseText,
      discountOffer,
    };
  }

  /**
   * Strict Guardrails Verification:
   * Asserts no arguing, no aggressive pressure, no fake scarcity, no made-up claims.
   */
  static enforceNegotiationGuardrails(text: string): boolean {
    const lower = text.toLowerCase();

    // 1. Disallow direct arguing
    const forbiddenArguing = ['вы не правы', 'вы ошибаетесь', 'это не так', 'вы не понимаете', 'вы заблуждаетесь'];
    for (const fa of forbiddenArguing) {
      if (lower.includes(fa)) return false;
    }

    // 2. Disallow aggressive pressure
    const forbiddenPressure = ['вы обязаны', 'вам срочно нужно', 'почему вы тянете', 'вы упускаете свой единственный шанс'];
    for (const fp of forbiddenPressure) {
      if (lower.includes(fp)) return false;
    }

    // 3. Disallow fake scarcity
    const forbiddenScarcity = ['акция только сегодня', 'осталось 1 место', 'цена вырастет через 2 часа', 'скидка сгорит'];
    for (const fs of forbiddenScarcity) {
      if (lower.includes(fs)) return false;
    }

    return true;
  }

  /**
   * Synchronizes Opt-Out events into CRM and stops AI.
   */
  private static async syncOptOutToCrm(
    userId: string,
    conversationId?: string | null,
    leadId?: string | null,
    inboundText?: string,
  ): Promise<void> {
    try {
      if (conversationId) {
        await prisma.aiDialogueState.upsert({
          where: { conversationId },
          update: { isAiPaused: true, stage: 'LOST' },
          create: { conversationId, isAiPaused: true, stage: 'LOST' },
        });

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { status: 'NO_RESPONSE' },
        });
      }

      if (leadId) {
        await prisma.lead.update({
          where: { id: leadId },
          data: { status: 'NO_RESPONSE' },
        });

        await recordClientMemory({
          leadId,
          conversationId: conversationId || null,
          layer: 'OBJECTION',
          key: 'client_opt_out',
          value: `Клиент запросил прекращение коммуникации: «${inboundText}». AI остановлен.`,
          confidence: 1.0,
          source: 'AI',
        });

        await recordTimelineEvent({
          userId,
          leadId,
          conversationId: conversationId || null,
          eventType: 'STATUS_CHANGED',
          title: 'Отказ от коммуникации (Opt-Out)',
          description: `Клиент запросил остановку сообщений. Статус: NO_RESPONSE, AI приостановлен.`,
          metadata: { optOut: true, triggerText: inboundText },
        });
      }

      emitToUser(userId, 'CRM_UPDATED', { conversationId, leadId, isAiPaused: true, optOut: true });
    } catch (err) {
      logger.error('Failed to sync Opt-Out to CRM', { error: err });
    }
  }

  /**
   * Records objection negotiation facts into ClientMemory, Timeline and updates pipeline.
   */
  private static async syncNegotiationToCrm(
    userId: string,
    conversationId: string | null | undefined,
    leadId: string | null | undefined,
    turn: NegotiationTurn,
    inboundText: string,
  ): Promise<{ key: string; value: string; layer: string }> {
    const memoryFact = {
      key: `objection_${turn.detectedObjection.toLowerCase()}`,
      value: `Возражение «${turn.detectedObjection}»: ${turn.underlyingReason}. Отработано через: ${turn.reframedValue}`,
      layer: 'OBJECTION',
    };

    try {
      if (leadId) {
        await recordClientMemory({
          leadId,
          conversationId: conversationId || null,
          layer: 'OBJECTION',
          key: memoryFact.key,
          value: memoryFact.value,
          confidence: turn.confidence,
          source: 'AI',
        });

        await recordTimelineEvent({
          userId,
          leadId,
          conversationId: conversationId || null,
          eventType: 'OBJECTION_LOGGED',
          title: `Отработано возражение: ${turn.detectedObjection}`,
          description: `Клиент: «${inboundText}». Стратегия: ${turn.expensiveStrategyApplied || '5-Step Consultative Reframe'}`,
          metadata: {
            objectionType: turn.detectedObjection,
            strategy: turn.expensiveStrategyApplied,
            discountOffer: turn.discountOffer,
          },
        });
      }
    } catch (err) {
      logger.error('Failed to sync negotiation to CRM', { error: err });
    }

    return memoryFact;
  }
}
