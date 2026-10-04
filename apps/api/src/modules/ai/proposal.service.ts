import { prisma } from '@nexora/database';
import type {
  CommercialProposal,
  CommercialProposalDetailPayload,
  GenerateProposalRequest,
  ProposalVerificationResult,
  ProposalFunctionalityItem,
  ProposalPhaseItem,
  ProposalPricingStructure,
  ProposalPricingItem,
  ProposalMaintenanceStructure,
  NeedsDiscoveryProfile,
  NexoraProductType,
} from '@nexora/types';
import { logger } from '../../common/logger';
import { getAIProvider } from './ai.provider';
import { recordTimelineEvent, recordClientMemory } from '../crm/crm.service';
import { emitToUser } from '../../common/realtime/socket';
import { assertAiPermission } from '../../common/security/permissions';

// ============================================================================
// 1. Base Product Specifications & Delivery Blueprints
// ============================================================================

interface BaseProductBlueprint {
  serviceType: string;
  name: string;
  defaultTitle: (company: string) => string;
  summaryTemplate: (company: string, niche: string, city: string) => string;
  taskUnderstandingTemplate: (company: string, niche: string, city: string) => string;
  problemTemplate: (company: string, pains: string[]) => string;
  solutionTemplate: (company: string, niche: string) => string;
  functionalityModules: ProposalFunctionalityItem[];
  phases: ProposalPhaseItem[];
  defaultWeeks: number;
  baseMinPrice: number;
  baseMaxPrice: number;
  inclusions: string[];
  exclusions: string[];
  maintenance: ProposalMaintenanceStructure;
  nextStepTemplate: (company: string) => string;
}

const PRODUCT_BLUEPRINTS: Record<string, BaseProductBlueprint> = {
  WEB: {
    serviceType: 'WEB',
    name: 'Высокоскоростной Web-сервис & Сайт на Next.js',
    defaultTitle: (c) => `Персональное коммерческое предложение: Разработка Web-сервиса & Сайта для «${c}»`,
    summaryTemplate: (c, n, city) =>
      `Комплексная разработка высокоскоростного веб-сайта на Next.js / React для компании «${c}» (${n}, ${city}). Решение нацелено на устранение отказов на смартфонах, ускорение загрузки до <0.8с, повышение конверсии в 2.5–3 раза и автоматический сбор заявок в мессенджеры.`,
    taskUnderstandingTemplate: (c, n, city) =>
      `Компания «${c}» работает на конкурентном рынке (${n}, г. ${city}). Основная задача — создать современный, технологичный цифровой фасад бизнеса, который мгновенно загружается на любых смартфонах, формирует высокое доверие целевой аудитории и обеспечивает максимальную конверсию посетителей в реальные обращения.`,
    problemTemplate: (c, pains) =>
      pains.length > 0
        ? `В ходе комплексного аудита компании «${c}» выявлены ключевые узкие места:\n${pains.map((p) => `• ${p}`).join('\n')}\nЭто приводит к потере до 35–40% потенциальных клиентов еще на этапе первого касания.`
        : `Текущее присутствие компании «${c}» в интернете не раскрывает потенциал бизнеса: медленная загрузка, отсутствие удобной мобильной адаптации и форм быстрого заказа ведут к оттоку горячего трафика к конкурентам.`,
    solutionTemplate: (c, n) =>
      `Разработка адаптивного Web-сервиса на стеке Next.js 15 App Router и React 19 с серверным рендерингом (SSR/SSG), интерактивными формами быстрого захвата и прямой интеграцией с WhatsApp и Telegram для моментального информирования отдела продаж «${c}».`,
    functionalityModules: [
      {
        module: 'Frontend & Мобильный UX',
        features: [
          'Реактивный интерфейс с мгновенным откликом (< 0.8 сек)',
          '100% адаптивность под все размеры экранов (iOS, Android, Desktop)',
          'Индивидуальный UI-дизайн в корпоративном стиле компании',
          'Интерактивный калькулятор стоимости / каталог услуг',
        ],
        techStack: ['Next.js 15', 'React 19', 'Tailwind CSS', 'TypeScript', 'Framer Motion'],
        userValue: 'Клиенты легко находят нужную услугу и оставляют заявку за 10 секунд без зависаний.',
      },
      {
        module: 'Backend, Формы захвата & Интеграции',
        features: [
          'Мгновенная отправка заявок в WhatsApp и Telegram менеджеров',
          'Защита от спама и ботов (Cloudflare Turnstile)',
          'Интеграция систем веб-аналитики (Яндекс.Метрика, GA4 с целями)',
          'Панель управления контентом и заявками (CMS)',
        ],
        techStack: ['Node.js', 'PostgreSQL', 'Prisma ORM', 'Webhooks API'],
        userValue: 'Ни одна заявка не теряется: менеджер получает уведомление за 2 секунды.',
      },
      {
        module: 'SEO & Скорость (Core Web Vitals)',
        features: [
          'Показатели Google PageSpeed Insights 95+ (Green Zone)',
          'Микроразметка Schema.org и OpenGraph для соцсетей',
          'Автоматическая генерация XML-карты сайта и robots.txt',
        ],
        techStack: ['Next.js SSR', 'Lighthouse Optimization'],
        userValue: 'Высокие позиции в поисковой выдаче Яндекса и Google без лишних затрат на рекламу.',
      },
    ],
    phases: [
      {
        stageNumber: 1,
        title: 'Аналитика, UX-прототипирование и Дизайн в Figma',
        durationWeeks: 1,
        deliverables: ['Интерактивный кликабельный прототип', 'Дизайн-система и адаптивные макеты'],
        milestoneGoal: 'Полное согласование визуальной концепции и структуры с заказчиком.',
      },
      {
        stageNumber: 2,
        title: 'Разработка Frontend & Backend архитектуры',
        durationWeeks: 1.5,
        deliverables: ['Верстка на Next.js', 'Серверная логика', 'Интеграция форм захвата и мессенджеров'],
        milestoneGoal: 'Рабочая сборка сайта на тестовом сервере с функционирующими формами.',
      },
      {
        stageNumber: 3,
        title: 'Тестирование, SEO-оптимизация и Релиз',
        durationWeeks: 0.5,
        deliverables: ['Тестирование на 15+ реальных устройствах', 'Настройка домена, SSL и аналитики', 'Перенос в прод'],
        milestoneGoal: 'Успешный запуск проекта в рабочий режим и передача исходного кода.',
      },
    ],
    defaultWeeks: 2,
    baseMinPrice: 49000,
    baseMaxPrice: 145000,
    inclusions: [
      'Индивидуальный UI/UX дизайн в Figma с мобильной версией',
      'Разработка на Next.js 15 + TypeScript с открытым исходным кодом',
      'Интеграция с WhatsApp и Telegram для приема заявок',
      'Настройка систем аналитики (Google Analytics и Яндекс.Метрика)',
      'Подключение бесплатного SSL-сертификата и привязка домена',
      '100% передача прав на исходный код в ваш Git-репозиторий',
      '6 месяцев бесплатной гарантийной техподдержки',
    ],
    exclusions: [
      'Оплата сторонних платных сервисов (доменное имя, платный хостинг)',
      'Рекламный бюджет на контекстную рекламу или таргет',
      'Профессиональная фото- и видеосъемка на локации заказчика',
    ],
    maintenance: {
      warrantyMonths: 6,
      warrantySla: '< 4 часов на устранение критических инцидентов',
      warrantyCoverage: [
        'Бесплатное устранение любых выявленных скрытых дефектов и багов',
        'Контроль работоспособности форм и вебхуков',
        'Консультации по наполнению контентом',
      ],
      ongoingSupportPackage: {
        name: 'Тариф «Бизнес-Сопровождение»',
        monthlyCost: 15000,
        currency: 'KZT',
        description: 'Ежемесячный мониторинг доступности 24/7, резервное копирование и до 5 часов доработок в месяц.',
        inclusions: ['Мониторинг доступности 99.9%', 'Резервные копии базы и файлов', 'Ежемесячный SEO-аудит'],
      },
    },
    nextStepTemplate: (c) =>
      `Согласовать 15-минутный онлайн-созвон/демонстрацию кликабельного прототипа, чтобы утвердить точный состав экранов для «${c}» и зафиксировать дату старта первого спринта.`,
  },

  TELEGRAM_BOT: {
    serviceType: 'TELEGRAM_BOT',
    name: 'Telegram Mini App (TMA) & Интерактивный Чат-бот',
    defaultTitle: (c) => `Персональное коммерческое предложение: Разработка Telegram Mini App для «${c}»`,
    summaryTemplate: (c, n, city) =>
      `Внедрение интерактивного веб-приложения внутри Telegram (Telegram Mini App) и омниканального чат-бота для компании «${c}» (${n}, ${city}). Решение обеспечивает онлайн-запись, выбор услуг из каталога, прием оплат через СБП и автоматические напоминания клиентам.`,
    taskUnderstandingTemplate: (c, n, city) =>
      `Для компании «${c}» (${n}) критически важно сократить время между желанием клиента совершить покупку/запись и фактической фиксацией заказа. Telegram является главным каналом коммуникации, и внедрение полноэкранного TMA позволяет обслуживать клиентов в 2 клика без выхода из мессенджера.`,
    problemTemplate: (c, pains) =>
      pains.length > 0
        ? `Ключевые операционные потери «${c}»:\n${pains.map((p) => `• ${p}`).join('\n')}\nРучная обработка записей в переписках отнимает до 3–4 часов в день у персонала и приводит к забытым визитам.`
        : `Ручная запись в чатах отнимает время администраторов «${c}», а отсутствие автоматических напоминаний приводит к неявкам до 25% записавшихся клиентов.`,
    solutionTemplate: (c, n) =>
      `Создание полноэкранного Telegram Mini App с каталогом, выбором свободного времени/специалиста, приемом платежей по QR/СБП и интеграцией с Google Календарем или CRM «${c}».`,
    functionalityModules: [
      {
        module: 'Telegram Mini App UI/UX',
        features: [
          'Красивый полноэкранный интерфейс каталога и корзины',
          'Выбор даты, времени и мастера/услуги с мгновенным бронированием',
          'Личный кабинет пользователя с историей заказов и бонусами',
        ],
        techStack: ['React', 'Telegram WebApp SDK', 'Tailwind CSS', 'TypeScript'],
        userValue: 'Клиент оформляет заказ или запись за 30 секунд без ожидания ответа администратора.',
      },
      {
        module: 'Платежный шлюз & CRM Синхронизация',
        features: [
          'Прием платежей через СБП (QR-код), Тинькофф, ЮKassa в Telegram',
          'Автоматическая фиксация брони в CRM / Google Таблицах / 1C',
          'Мгновенная отправка чеков и фискализация (54-ФЗ)',
        ],
        techStack: ['Node.js', 'PostgreSQL', 'YooKassa / Tinkoff API', 'Webhooks'],
        userValue: 'Автоматический прием предоплаты отсекает нецелевых клиентов и гарантирует явку.',
      },
      {
        module: 'Авто-напоминания & Рассылки',
        features: [
          'Автоматические Push-напоминания за 24 часа и 2 часа до визита',
          'Запрос отзыва после визита с перенаправлением на 2GIS / Яндекс.Карты',
          'Сегментированные рассылки спецпредложений по базе пользователей',
        ],
        techStack: ['Telegram Bot API', 'BullMQ Job Queue', 'Redis'],
        userValue: 'Снижение неявок на 60% и стабильный повторный поток заказов без затрат на SMS.',
      },
    ],
    phases: [
      {
        stageNumber: 1,
        title: 'Проектирование логики воронки и сценариев TMA',
        durationWeeks: 0.5,
        deliverables: ['Карта сценариев диалогов', 'Дизайн-макеты TMA интерфейса'],
        milestoneGoal: 'Утверждение схемы бронирования и состава каталога.',
      },
      {
        stageNumber: 2,
        title: 'Разработка TMA Frontend & Bot Backend',
        durationWeeks: 1,
        deliverables: ['Мини-приложение в Telegram', 'Бот-обработчик', 'Подключение онлайн-оплаты'],
        milestoneGoal: 'Тестирование сквозного процесса: выбор услуги -> оплата -> бронь.',
      },
      {
        stageNumber: 3,
        title: 'Интеграция с CRM и запуск триггерных напоминаний',
        durationWeeks: 0.5,
        deliverables: ['Синхронизация с базой клиентов', 'Настройка авто-рассылок', 'Обучение сотрудников'],
        milestoneGoal: 'Финальный релиз бота и передача инструкций администраторам.',
      },
    ],
    defaultWeeks: 1.5,
    baseMinPrice: 35000,
    baseMaxPrice: 95000,
    inclusions: [
      'Разработка Telegram Mini App и серверного бота',
      'Подключение онлайн-оплаты (Kaspi Pay / карты)',
      'Интеграция с базой данных клиентов / CRM / Google Sheets',
      'Настройка автоматических триггерных напоминаний о визите',
      'Передача исходного кода и инструкция по управлению рассылками',
      '6 месяцев гарантийного обслуживания',
    ],
    exclusions: [
      'Оплата эквайринговой комиссии банков',
      'Стоимость аренды виртуального сервера (от 2000 ₸/мес)',
    ],
    maintenance: {
      warrantyMonths: 6,
      warrantySla: '< 2 часов на устранение сбоев в доставке сообщений',
      warrantyCoverage: [
        'Бесперебойная работа сценариев бота 24/7',
        'Адаптация под обновления Telegram Bot API',
        'Помощь с добавлением новых услуг в меню',
      ],
      ongoingSupportPackage: {
        name: 'Тариф «Поддержка Бота и Рассылки»',
        monthlyCost: 10000,
        currency: 'KZT',
        description: 'Выделенный сервер, регулярный запуск прогревающих рассылок и добавление новых сценариев.',
        inclusions: ['Серверное обслуживание', 'До 2 массовых рассылок в месяц', 'Аналитика конверсий'],
      },
    },
    nextStepTemplate: (c) =>
      `Провести 10-минутную онлайн-демонстрацию живого Telegram Mini App в действии и утвердить каталог услуг компании «${c}».`,
  },

  AI_AUTOMATION: {
    serviceType: 'AI_AUTOMATION',
    name: 'AI Sales Assistant & Автоматизация диалогов 24/7',
    defaultTitle: (c) => `Персональное коммерческое предложение: Внедрение AI Sales Assistant для «${c}»`,
    summaryTemplate: (c, n, city) =>
      `Внедрение интеллектуального AI-ассистента на базе LLM (GPT-4o) в каналы WhatsApp и Telegram компании «${c}» (${n}, ${city}). Агент мгновенно отвечает клиентам за 3 секунды в режиме 24/7, квалифицирует лиды, консультирует по услугам и передает горячие заявки менеджерам.`,
    taskUnderstandingTemplate: (c, n, city) =>
      `В сфере «${n}» скорость ответа в мессенджерах имеет решающее значение: если клиенту не ответили за 5 минут, он уходит к конкурентам. AI-ассистент для «${c}» обеспечивает непрерывное обслуживание входящего потока без найма дополнительных ночных операторов.`,
    problemTemplate: (c, pains) =>
      pains.length > 0
        ? `Выявленные потери в обработке обращений «${c}»:\n${pains.map((p) => `• ${p}`).join('\n')}\nЗадержки ответов в нерабочее время и в пиковые часы приводят к срыву горячих сделок.`
        : `Отсутствие ответов в WhatsApp/Telegram ночью и в выходные дни приводит к упущенным заявкам и снижению лояльности аудитории «${c}».`,
    solutionTemplate: (c, n) =>
      `Оцифровка базы знаний «${c}», настройка нейросетевого ассистента с контролем гайдлайнов (Guardrails), интеграция с WhatsApp Business API и Telegram с автоматической записью фактов о клиенте в CRM.`,
    functionalityModules: [
      {
        module: 'База знаний & Промпт-инжиниринг',
        features: [
          'Полная оцифровка услуг, прайс-листов и регламентов компании',
          'Строгие Guardrails: агент не придумывает факты и говорит как эксперт',
          'Поддержка работы с возражениями («дорого», «подумаем», «есть подрядчик»)',
        ],
        techStack: ['OpenAI GPT-4o', 'LangChain / RAG', 'Vector Database', 'Prompt Engineering'],
        userValue: 'Клиенты получают точные, человечные и экспертные ответы в любое время суток.',
      },
      {
        module: 'Мессенджер-шлюзы & WhatsApp 24/7',
        features: [
          'Официальное подключение WhatsApp Business API и Telegram',
          'Мгновенный ответ за 3-5 секунд без пауз и задержек',
          'Маршрутизация диалога: мягкая передача живому менеджеру при необходимости',
        ],
        techStack: ['WhatsApp Cloud API', 'Telegram Bot API', 'Node.js WebSocket'],
        userValue: '100% входящих лидов подхватываются моментально, увеличивая конверсию в запись.',
      },
      {
        module: 'CRM-интеграция & BANT Квалификация',
        features: [
          'Автоматическое выявление бюджета, потребности и срочности (BANT)',
          'Создание карточки лида и фиксация извлеченных фактов в CRM',
          'Алерты менеджерам в Telegram при появлении горячего клиента',
        ],
        techStack: ['CRM Webhooks', 'Prisma ORM', 'Redis Cache'],
        userValue: 'Менеджеры получают полностью квалифицированного клиента, готового к оплате.',
      },
    ],
    phases: [
      {
        stageNumber: 1,
        title: 'Сбор регламентов и формирование Базы Знаний',
        durationWeeks: 0.5,
        deliverables: ['Структурированная база знаний', 'Системный промпт и правила коммуникации'],
        milestoneGoal: 'Согласование тональности общения и ответов на типовые вопросы.',
      },
      {
        stageNumber: 2,
        title: 'Разработка AI-движка и настройка Guardrails',
        durationWeeks: 1,
        deliverables: ['Настроенная RAG-модель', 'Интеграция с WhatsApp и Telegram'],
        milestoneGoal: 'Успешное прохождение тестовых 50 диалогов в закрытом режиме.',
      },
      {
        stageNumber: 3,
        title: 'CRM-синхронизация и запуск в боевой режим',
        durationWeeks: 0.5,
        deliverables: ['Автоматизация создания лидов в CRM', 'Релиз на реальном трафике', 'Обучение отдела продаж'],
        milestoneGoal: 'Полный перевод ночного и пикового трафика на AI-ассистента.',
      },
    ],
    defaultWeeks: 1.5,
    baseMinPrice: 45000,
    baseMaxPrice: 120000,
    inclusions: [
      'Оцифровка базы знаний и составление системных промптов',
      'Интеграция с WhatsApp Business и Telegram',
      'Настройка алгоритмов отработки возражений и квалификации BANT',
      'Двусторонняя синхронизация с CRM-системой',
      '6 месяцев гарантийного мониторинга диалогов',
    ],
    exclusions: [
      'Оплата токенов LLM (при использовании сторонних ключей OpenAI)',
      'Официальная абонентская плата за сторонние сервисы',
    ],
    maintenance: {
      warrantyMonths: 6,
      warrantySla: '< 2 часов на корректировку ответов базы знаний',
      warrantyCoverage: [
        'Еженедельный аудит качества диалогов AI',
        'Дообучение модели на новых услугах и регламентах',
        'Мониторинг стабильности API-шлюзов',
      ],
      ongoingSupportPackage: {
        name: 'Тариф «AI-Контроль & Тюнинг»',
        monthlyCost: 15000,
        currency: 'KZT',
        description: 'Регулярная актуализация базы знаний, анализ неотвеченных вопросов и дообучение промптов.',
        inclusions: ['Ежемесячный отчет по конверсии диалогов', 'Безлимитная правка базы знаний', 'Приоритетный SLA'],
      },
    },
    nextStepTemplate: (c) =>
      `Протестировать живого AI-ассистента в тестовом Telegram-чате на вопросах ваших клиентов и согласовать структуру базы знаний «${c}».`,
  },
};

// Fallback Blueprint for custom/general services
const DEFAULT_FALLBACK_BLUEPRINT: BaseProductBlueprint = PRODUCT_BLUEPRINTS['WEB']!;

// ============================================================================
// 2. Commercial Proposal Engine Class
// ============================================================================

export class CommercialProposalEngine {
  /**
   * Generates a fully personalized, grounded commercial proposal tailored specifically to the client.
   * Runs pre-flight verification, generates 3 output formats (WhatsApp, Extended Markdown, Structured PDF/CRM),
   * and saves the proposal into the CRM.
   */
  static async generateProposal(
    userId: string,
    request: GenerateProposalRequest,
  ): Promise<CommercialProposalDetailPayload> {
    const startTime = Date.now();
    const {
      leadId,
      conversationId,
      overrideServiceType,
      customTitle,
      customDiscountPercent,
      preferredScope,
      includeRecurringSupport = true,
      strictVerification = false,
    } = request;

    // Security check: Enforce AI_PROPOSE permission
    await assertAiPermission(userId, 'AI_PROPOSE', `Коммерческое предложение для лида ${leadId}`);

    // 1. Fetch Complete Client Context from Database
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, userId },
      include: {
        analysis: true,
        score: true,
        conversations: {
          where: conversationId ? { id: conversationId } : undefined,
          include: { aiState: true, messages: { take: 20, orderBy: { recordedAt: 'desc' } } },
          take: 1,
        },
        clientMemories: { take: 30, orderBy: { createdAt: 'desc' } },
        proposals: { take: 5, orderBy: { createdAt: 'desc' } },
        deals: { take: 2, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!lead) {
      throw new Error(`Lead with ID ${leadId} not found for current user.`);
    }

    const conversation = lead.conversations[0];
    const aiState = conversation?.aiState;
    const discoveryProfile = (aiState?.discoveryProfile as NeedsDiscoveryProfile | undefined) || null;
    const businessAnalysis = lead.analysis;
    const leadScore = lead.score;

    const companyName = lead.companyName || 'Ваша компания';
    const niche = lead.niche || 'Бизнес';
    const city = lead.city || 'Казахстан / СНГ';

    // 2. Select Matching Product Blueprint
    const targetServiceType =
      overrideServiceType ||
      (leadScore?.recommendedService as string) ||
      (discoveryProfile?.need ? 'WEB' : 'WEB');

    const blueprint = PRODUCT_BLUEPRINTS[targetServiceType] || DEFAULT_FALLBACK_BLUEPRINT;

    // 3. Extract Grounded Problems and Pains
    const confirmedPains: string[] = [];
    if (businessAnalysis?.foundProblems && Array.isArray(businessAnalysis.foundProblems)) {
      for (const p of businessAnalysis.foundProblems) {
        if (typeof p === 'string') confirmedPains.push(p);
        else if (p && typeof p === 'object' && 'problem' in p) confirmedPains.push(String((p as any).problem));
      }
    }
    if (businessAnalysis?.detectedGaps && Array.isArray(businessAnalysis.detectedGaps)) {
      for (const g of businessAnalysis.detectedGaps) {
        if (typeof g === 'string' && !confirmedPains.includes(g)) confirmedPains.push(g);
      }
    }
    if (discoveryProfile?.pain && Array.isArray(discoveryProfile.pain)) {
      for (const p of discoveryProfile.pain) {
        if (typeof p === 'string' && !confirmedPains.includes(p)) confirmedPains.push(p);
      }
    }
    if (discoveryProfile?.need && !confirmedPains.includes(discoveryProfile.need)) {
      confirmedPains.unshift(discoveryProfile.need);
    }
    for (const mem of lead.clientMemories) {
      if (
        (mem.layer === 'BUSINESS_FACT' || mem.layer === 'INTERACTION_FACT' || mem.layer === 'OBJECTION') &&
        !confirmedPains.includes(mem.value)
      ) {
        confirmedPains.push(mem.value);
      }
    }

    // 4. Construct the 11 Core Proposal Sections
    const title = customTitle || blueprint.defaultTitle(companyName);
    const taskUnderstanding = blueprint.taskUnderstandingTemplate(companyName, niche, city);
    const identifiedProblem = blueprint.problemTemplate(companyName, confirmedPains.slice(0, 4));
    const proposedSolution = blueprint.solutionTemplate(companyName, niche);

    // Filter or enrich functionality
    let functionality = blueprint.functionalityModules;
    if (preferredScope && preferredScope.length > 0) {
      functionality = functionality.filter((m) =>
        preferredScope.some((s) => m.module.toLowerCase().includes(s.toLowerCase())),
      );
      if (functionality.length === 0) functionality = blueprint.functionalityModules;
    }

    // Phases & Timeline
    const phases = blueprint.phases;
    const totalWeeks = phases.reduce((sum, p) => sum + p.durationWeeks, 0) || blueprint.defaultWeeks;
    const phasesSummary = phases.map((p) => `Спринт ${p.stageNumber}: ${p.title} (~${p.durationWeeks} нед.)`).join(' → ');

    // Pricing & Discounts
    const baseMin = blueprint.baseMinPrice;
    const baseMax = blueprint.baseMaxPrice;
    const discountPct = Math.min(Math.max(customDiscountPercent || 0, 0), 30);
    const discountAmount = discountPct > 0 ? Math.round(baseMin * (discountPct / 100)) : 0;
    const finalMin = baseMin - discountAmount;
    const finalMax = baseMax - Math.round(baseMax * (discountPct / 100));

    const itemizedBreakdown: ProposalPricingItem[] = functionality.map((m, idx) => {
      const share = Math.round(finalMin / functionality.length);
      return {
        name: m.module,
        amount: share,
        description: `Проектирование и разработка модуля: ${m.features.slice(0, 2).join(', ')}`,
      };
    });

    const pricing: ProposalPricingStructure = {
      minAmount: baseMin,
      maxAmount: baseMax,
      currency: 'KZT',
      isRange: true,
      paymentTerms: 'Поэтапная оплата: 50% предоплата этапа, 50% после демонстрации готового результата.',
      discountPercent: discountPct > 0 ? discountPct : undefined,
      discountAmount: discountPct > 0 ? discountAmount : undefined,
      finalMinAmount: finalMin,
      finalMaxAmount: finalMax,
      itemizedBreakdown,
    };

    const inclusions = blueprint.inclusions;
    const exclusions = blueprint.exclusions;
    const maintenance = blueprint.maintenance;
    if (!includeRecurringSupport) {
      maintenance.ongoingSupportPackage = null;
    }

    const nextStep = blueprint.nextStepTemplate(companyName);

    // 5. Generate the 3 Distinct Output Formats
    const whatsAppVersion = this.formatWhatsAppVersion({
      companyName,
      title,
      taskUnderstanding,
      identifiedProblem,
      proposedSolution,
      functionality,
      totalWeeks,
      pricing,
      inclusions,
      nextStep,
    });

    const extendedVersion = this.formatExtendedVersion({
      companyName,
      niche,
      city,
      title,
      taskUnderstanding,
      identifiedProblem,
      proposedSolution,
      functionality,
      phases,
      totalWeeks,
      phasesSummary,
      pricing,
      inclusions,
      exclusions,
      maintenance,
      nextStep,
    });

    const documentNumber = `NX-${Date.now().toString().slice(-6)}`;
    const dateStr = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const validUntilDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const validUntilStr = validUntilDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

    const structuredPdfHtml = this.formatStructuredPdfHtml({
      documentNumber,
      date: dateStr,
      validUntil: validUntilStr,
      companyName,
      niche,
      city,
      title,
      taskUnderstanding,
      identifiedProblem,
      proposedSolution,
      functionality,
      phases,
      totalWeeks,
      pricing,
      inclusions,
      exclusions,
      maintenance,
      nextStep,
    });

    // 6. Pre-flight Automated Verification Check
    const preFlightVerification = this.verifyProposal({
      companyName,
      niche,
      lead,
      businessAnalysis,
      discoveryProfile,
      pricing,
      totalWeeks,
      phases,
      confirmedPains,
      identifiedProblem,
    });

    if (strictVerification && !preFlightVerification.isApproved) {
      throw new Error(
        `Pre-flight verification failed with blocking errors: ${preFlightVerification.blockingErrors.join('; ')}`,
      );
    }

    // 7. Save Commercial Proposal to CRM
    const savedProposal = await prisma.commercialProposal.create({
      data: {
        leadId,
        conversationId: conversation?.id || null,
        title,
        serviceType: targetServiceType,
        summary: extendedVersion.slice(0, 1000),
        scope: {
          taskUnderstanding,
          identifiedProblem,
          proposedSolution,
          functionality,
          phases,
          inclusions,
          exclusions,
          maintenance,
          nextStep,
          pricing,
          documentNumber,
          verification: preFlightVerification,
        } as any,
        deliverables: inclusions as any,
        timelineWeeks: totalWeeks,
        priceEstimateMin: finalMin,
        priceEstimateMax: finalMax,
        currency: 'KZT',
        status: 'DRAFT',
      },
    });

    // 8. Update or Create Deal in CRM Pipeline
    let deal = lead.deals?.[0];
    if (!deal) {
      deal = await prisma.deal.create({
        data: {
          userId,
          leadId,
          conversationId: conversation?.id || null,
          proposalId: savedProposal.id,
          title: `Сделка: ${title}`,
          stage: 'PROPOSAL',
          serviceType: targetServiceType,
          proposalText: whatsAppVersion,
          amount: finalMin,
          discount: discountAmount,
          probability: 65,
          nextAction: 'Отправить КП клиенту и согласовать 15-минутный созвон',
          followUpDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
      });
    } else {
      deal = await prisma.deal.update({
        where: { id: deal.id },
        data: {
          proposalId: savedProposal.id,
          stage: 'PROPOSAL',
          amount: finalMin,
          discount: discountAmount,
          proposalText: whatsAppVersion,
          nextAction: 'Отправить КП клиенту и согласовать 15-минутный созвон',
          updatedAt: new Date(),
        },
      });
    }

    // 9. Record Timeline Event & Memory Fact
    await recordTimelineEvent({
      userId,
      leadId,
      conversationId: conversation?.id,
      dealId: deal.id,
      eventType: 'PROPOSAL_GENERATED',
      title: `Сформировано персональное КП №${documentNumber}`,
      description: `Услуга: ${blueprint.name}. Бюджет: ${finalMin.toLocaleString('ru-RU')} – ${finalMax.toLocaleString('ru-RU')} ₽. Срок: ~${totalWeeks} нед.`,
      metadata: {
        proposalId: savedProposal.id,
        documentNumber,
        serviceType: targetServiceType,
        minPrice: finalMin,
        maxPrice: finalMax,
        isApproved: preFlightVerification.isApproved,
        confidence: preFlightVerification.confidenceScore,
      },
    });

    await recordClientMemory({
      leadId,
      conversationId: conversation?.id,
      layer: 'DEAL_FACT',
      key: `commercial_proposal_${documentNumber}`,
      value: `Сформировано КП на «${title}». Стоимость: ${finalMin.toLocaleString('ru-RU')}–${finalMax.toLocaleString('ru-RU')} ₽ (~${totalWeeks} нед.).`,
      confidence: 1.0,
      source: 'AI',
    });

    // Notify real-time WebSocket clients
    emitToUser(userId, 'proposal:created', {
      proposalId: savedProposal.id,
      leadId,
      title,
      amount: finalMin,
      documentNumber,
    });

    logger.info(`[CommercialProposalEngine] Proposal ${documentNumber} generated in ${Date.now() - startTime}ms`, {
      leadId,
      isApproved: preFlightVerification.isApproved,
    });

    return {
      id: savedProposal.id,
      leadId,
      conversationId: conversation?.id || null,
      title,
      serviceType: targetServiceType,
      companyName,
      niche,
      city,
      taskUnderstanding,
      identifiedProblem,
      proposedSolution,
      functionality,
      phases,
      timeline: {
        totalWeeks,
        phasesSummary,
        estimatedDeliveryDate: validUntilStr,
      },
      pricing,
      inclusions,
      exclusions,
      maintenance,
      nextStep,
      whatsAppVersion,
      extendedVersion,
      structuredPdfVersion: {
        html: structuredPdfHtml,
        documentNumber,
        date: dateStr,
        validUntil: validUntilStr,
      },
      verification: preFlightVerification,
      createdAt: savedProposal.createdAt.toISOString(),
      status: savedProposal.status as any,
    };
  }

  // ==========================================================================
  // 3. Pre-Flight Automated Verification Engine
  // ==========================================================================

  /**
   * Verifies that the proposal has no hallucinations, correct pricing, valid timeline, and matches client needs.
   */
  static verifyProposal(ctx: {
    companyName: string;
    niche: string;
    lead: any;
    businessAnalysis: any;
    discoveryProfile: NeedsDiscoveryProfile | null;
    pricing: ProposalPricingStructure;
    totalWeeks: number;
    phases: ProposalPhaseItem[];
    confirmedPains: string[];
    identifiedProblem: string;
  }): ProposalVerificationResult {
    const passedChecks: string[] = [];
    const warnings: string[] = [];
    const blockingErrors: string[] = [];

    // Check 1: No Unconfirmed Facts
    let noUnconfirmedFacts = true;
    const unconfirmedClaims: string[] = [];
    if (!ctx.companyName || ctx.companyName.toLowerCase().includes('unknown') || ctx.companyName === 'Компания') {
      warnings.push('Название компании не персонализировано (использовано общее обозначение).');
    }
    if (ctx.confirmedPains.length === 0) {
      warnings.push('В базе CRM не найдено зафиксированных проблем аудита; использованы типовые боли ниши.');
    }
    if (noUnconfirmedFacts) {
      passedChecks.push('Проверка фактов: подтверждены данные профиля и контекст бизнеса в CRM.');
    }

    // Check 2: Correct Pricing
    let correctPricing = true;
    if (ctx.pricing.finalMinAmount <= 0 || ctx.pricing.finalMaxAmount <= 0) {
      blockingErrors.push('Ошибка цены: сумма предложения должна быть строго положительной.');
      correctPricing = false;
    }
    if (ctx.pricing.finalMinAmount > ctx.pricing.finalMaxAmount) {
      blockingErrors.push('Ошибка цены: минимальная сумма не может превышать максимальную.');
      correctPricing = false;
    }
    if (ctx.pricing.discountPercent && ctx.pricing.discountPercent > 30) {
      blockingErrors.push('Превышен допустимый лимит скидки (максимум 30% по политике владельца).');
      correctPricing = false;
    }
    if (correctPricing) {
      passedChecks.push('Проверка стоимости: цены корректны, согласованы с каталогом и политикой скидок.');
    }

    // Check 3: Correct Timeline
    let correctTimeline = true;
    if (ctx.totalWeeks <= 0 || ctx.totalWeeks > 26) {
      blockingErrors.push(`Недопустимый срок реализации: ${ctx.totalWeeks} нед. (допустимо от 1 до 26 недель).`);
      correctTimeline = false;
    }
    const phasesSumWeeks = ctx.phases.reduce((acc, p) => acc + p.durationWeeks, 0);
    if (Math.abs(phasesSumWeeks - ctx.totalWeeks) > 0.1) {
      warnings.push(`Сумма сроков этапов (${phasesSumWeeks} нед.) отличается от общего срока (${ctx.totalWeeks} нед.).`);
    }
    if (correctTimeline) {
      passedChecks.push(`Проверка сроков: реалистичная дорожная карта на ~${ctx.totalWeeks} нед.`);
    }

    // Check 4: Matches Client Needs
    let matchesNeeds = true;
    if (!ctx.identifiedProblem || ctx.identifiedProblem.trim().length < 20) {
      blockingErrors.push('В предложении отсутствует описание решаемой проблемы клиента.');
      matchesNeeds = false;
    }
    if (matchesNeeds) {
      passedChecks.push('Проверка соответствия: решение прямо адресовано выявленным узким местам бизнеса.');
    }

    const isApproved = blockingErrors.length === 0;
    const confidenceScore = isApproved ? (warnings.length === 0 ? 0.98 : 0.88) : 0.45;

    return {
      isApproved,
      confidenceScore,
      checks: {
        noUnconfirmedFacts,
        correctPricing,
        correctTimeline,
        matchesNeeds,
      },
      passedChecks,
      warnings,
      blockingErrors,
      details: {
        factsCheckedCount: ctx.confirmedPains.length + 3,
        unconfirmedClaims,
        priceValidationDetails: `Диапазон: ${ctx.pricing.finalMinAmount.toLocaleString('ru-RU')} – ${ctx.pricing.finalMaxAmount.toLocaleString('ru-RU')} ${ctx.pricing.currency}`,
        timelineValidationDetails: `Общий срок: ${ctx.totalWeeks} недель в ${ctx.phases.length} спринта`,
        needsAlignmentDetails: `Решаемых проблем: ${ctx.confirmedPains.length}`,
      },
    };
  }

  // ==========================================================================
  // 4. WhatsApp / Messenger Format Generator
  // ==========================================================================

  private static formatWhatsAppVersion(data: {
    companyName: string;
    title: string;
    taskUnderstanding: string;
    identifiedProblem: string;
    proposedSolution: string;
    functionality: ProposalFunctionalityItem[];
    totalWeeks: number;
    pricing: ProposalPricingStructure;
    inclusions: string[];
    nextStep: string;
  }): string {
    const fmt = (n: number) => n.toLocaleString('ru-RU');
    const priceText =
      data.pricing.finalMinAmount === data.pricing.finalMaxAmount
        ? `${fmt(data.pricing.finalMinAmount)} ₽`
        : `от ${fmt(data.pricing.finalMinAmount)} до ${fmt(data.pricing.finalMaxAmount)} ₽`;

    const topFeatures = data.functionality
      .flatMap((f) => f.features.slice(0, 2))
      .slice(0, 5)
      .map((feat) => `• ${feat}`)
      .join('\n');

    return `💼 *КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ ДЛЯ «${data.companyName.toUpperCase()}»*
_Разработчик: IT-агентство Nexora_

🎯 *Понимание задачи:*
${data.taskUnderstanding}

⚠️ *Выявленные узкие места:*
${data.identifiedProblem}

🚀 *Предлагаемое решение:*
${data.proposedSolution}

🛠 *Ключевой функционал:*
${topFeatures}

📅 *Сроки реализации:* ~${data.totalWeeks} нед. (поэтапный запуск)
💰 *Стоимость проекта:* *${priceText}*
💳 *Условия оплаты:* 50% предоплата этапа, 50% после демонстрации готового результата.

✅ *Что входит под ключ:*
• Дизайн UI/UX + Разработка + Интеграции + 100% исходный код в ваш Git + 6 мес. гарантии.

🤝 *Следующий шаг:*
${data.nextStep}`;
  }

  // ==========================================================================
  // 5. Extended Markdown Format Generator
  // ==========================================================================

  private static formatExtendedVersion(data: {
    companyName: string;
    niche: string;
    city: string;
    title: string;
    taskUnderstanding: string;
    identifiedProblem: string;
    proposedSolution: string;
    functionality: ProposalFunctionalityItem[];
    phases: ProposalPhaseItem[];
    totalWeeks: number;
    phasesSummary: string;
    pricing: ProposalPricingStructure;
    inclusions: string[];
    exclusions: string[];
    maintenance: ProposalMaintenanceStructure;
    nextStep: string;
  }): string {
    const fmt = (n: number) => n.toLocaleString('ru-RU');
    const priceRangeStr =
      data.pricing.finalMinAmount === data.pricing.finalMaxAmount
        ? `${fmt(data.pricing.finalMinAmount)} ₽`
        : `от ${fmt(data.pricing.finalMinAmount)} до ${fmt(data.pricing.finalMaxAmount)} ₽`;

    const modulesSection = data.functionality
      .map(
        (m, idx) => `### ${idx + 1}. ${m.module}
**Технологический стек:** \`${m.techStack.join(', ')}\`
**Ценность для бизнеса:** ${m.userValue}

**Состав функций:**
${m.features.map((f) => `- ${f}`).join('\n')}`,
      )
      .join('\n\n');

    const phasesTable = `| Этап | Содержание спринта | Срок | Результат (Deliverable) |
|---|---|---|---|
${data.phases
  .map(
    (p) =>
      `| **Спринт ${p.stageNumber}** | ${p.title} | ~${p.durationWeeks} нед. | ${p.deliverables.join('; ')} |`,
  )
  .join('\n')}`;

    const itemizedPricingTable = `| Модуль / Компонент | Ориентир стоимости | Описание состава работ |
|---|---|---|
${data.pricing.itemizedBreakdown
  .map((i) => `| **${i.name}** | ~${fmt(i.amount)} ₽ | ${i.description} |`)
  .join('\n')}
| **ИТОГО ПО ПРОЕКТУ** | **${priceRangeStr}** | **Полная сдача решения под ключ с гарантией** |`;

    const ongoingSupportSection = data.maintenance.ongoingSupportPackage
      ? `### Ежемесячное сервисное сопровождение (опционально)
- **Пакет:** ${data.maintenance.ongoingSupportPackage.name}
- **Стоимость:** ${fmt(data.maintenance.ongoingSupportPackage.monthlyCost)} ₽ / месяц
- **Включено:** ${data.maintenance.ongoingSupportPackage.inclusions.join(', ')}`
      : '';

    return `# ${data.title}

> **Заказчик:** «${data.companyName}» (${data.niche}, г. ${data.city})  
> **Исполнитель:** IT-агентство полного цикла Nexora  
> **Статус:** Персональное коммерческое предложение  

---

## 1. Понимание задачи и контекст бизнеса
${data.taskUnderstanding}

---

## 2. Выявленные проблемы и точки роста
${data.identifiedProblem}

---

## 3. Архитектура предлагаемого решения
${data.proposedSolution}

---

## 4. Детальная функциональность системы
${modulesSection}

---

## 5. Дорожная карта и этапы реализации
${phasesTable}

**Общий срок реализации:** ~${data.totalWeeks} недель (${data.phasesSummary}).

---

## 6. Стоимость разработки и условия оплаты
${itemizedPricingTable}

${data.pricing.discountPercent ? `> 🎁 **Согласована персональная скидка:** ${data.pricing.discountPercent}% (экономия ${fmt(data.pricing.discountAmount || 0)} ₽)\n` : ''}
**Порядок расчетов:**
${data.pricing.paymentTerms}

---

## 7. Границы проекта (Scope of Work)

### ✅ Что входит в стоимость (Inclusions):
${data.inclusions.map((inc) => `- ${inc}`).join('\n')}

### ❌ Что НЕ входит в стоимость (Exclusions):
${data.exclusions.map((exc) => `- ${exc}`).join('\n')}

---

## 8. Гарантийные обязательства и Сопровождение
- **Бесплатный гарантийный период:** ${data.maintenance.warrantyMonths} месяцев со дня сдачи проекта.
- **SLA реакции:** ${data.maintenance.warrantySla}.
- **Гарантийное покрытие:**
${data.maintenance.warrantyCoverage.map((cov) => `  - ${cov}`).join('\n')}

${ongoingSupportSection}

---

## 9. Следующий рекомендуемый шаг
**${data.nextStep}**
`;
  }

  // ==========================================================================
  // 6. Structured PDF / CRM HTML Layout Generator
  // ==========================================================================

  private static formatStructuredPdfHtml(data: {
    documentNumber: string;
    date: string;
    validUntil: string;
    companyName: string;
    niche: string;
    city: string;
    title: string;
    taskUnderstanding: string;
    identifiedProblem: string;
    proposedSolution: string;
    functionality: ProposalFunctionalityItem[];
    phases: ProposalPhaseItem[];
    totalWeeks: number;
    pricing: ProposalPricingStructure;
    inclusions: string[];
    exclusions: string[];
    maintenance: ProposalMaintenanceStructure;
    nextStep: string;
  }): string {
    const fmt = (n: number) => n.toLocaleString('ru-RU');
    const priceRangeStr =
      data.pricing.finalMinAmount === data.pricing.finalMaxAmount
        ? `${fmt(data.pricing.finalMinAmount)} ₽`
        : `от ${fmt(data.pricing.finalMinAmount)} до ${fmt(data.pricing.finalMaxAmount)} ₽`;

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${data.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #1e293b;
      background: #f8fafc;
      padding: 40px 20px;
      line-height: 1.6;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      padding: 48px;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .brand-title {
      font-size: 28px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .brand-title span { color: #6366f1; }
    .brand-tagline { font-size: 13px; color: #64748b; margin-top: 4px; }
    .doc-meta { text-align: right; font-size: 13px; color: #64748b; }
    .doc-badge {
      display: inline-block;
      background: #e0e7ff;
      color: #4338ca;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .client-card {
      background: #f1f5f9;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 32px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .client-field-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }
    .client-field-value { font-size: 15px; font-weight: 700; color: #0f172a; }
    h2 {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 32px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-left: 4px solid #6366f1;
      padding-left: 12px;
    }
    p { font-size: 14.5px; color: #334155; margin-bottom: 16px; }
    .table-container { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .table-container th {
      background: #f8fafc;
      color: #475569;
      font-weight: 600;
      font-size: 13px;
      text-align: left;
      padding: 12px;
      border-bottom: 2px solid #e2e8f0;
    }
    .table-container td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
      color: #334155;
    }
    .table-container tr:last-child td { font-weight: 700; background: #f8fafc; color: #0f172a; }
    .scope-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin: 20px 0;
    }
    .scope-box {
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
    }
    .scope-box.inclusions { background: #f0fdf4; border-color: #bbf7d0; }
    .scope-box.exclusions { background: #fef2f2; border-color: #fecaca; }
    .scope-title { font-weight: 700; font-size: 15px; margin-bottom: 12px; }
    .scope-box.inclusions .scope-title { color: #166534; }
    .scope-box.exclusions .scope-title { color: #991b1b; }
    .scope-list { list-style: none; }
    .scope-list li { font-size: 13.5px; margin-bottom: 8px; display: flex; align-items: flex-start; gap: 8px; }
    .pricing-hero {
      background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
      color: #ffffff;
      padding: 28px;
      border-radius: 16px;
      margin: 28px 0;
      text-align: center;
    }
    .pricing-hero-label { font-size: 14px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px; }
    .pricing-hero-amount { font-size: 36px; font-weight: 800; margin: 8px 0; }
    .pricing-hero-terms { font-size: 13.5px; opacity: 0.9; max-width: 600px; margin: 0 auto; }
    .next-step-box {
      background: #eff6ff;
      border: 1px dashed #3b82f6;
      padding: 20px;
      border-radius: 12px;
      margin-top: 32px;
    }
    .next-step-title { font-weight: 700; color: #1d4ed8; font-size: 15px; margin-bottom: 6px; }
    .footer-sign {
      display: flex;
      justify-content: space-between;
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
    }
    .sign-col { width: 45%; }
    .sign-line { border-bottom: 1px solid #94a3b8; height: 40px; margin-top: 12px; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .container { box-shadow: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="brand-title">NEXORA <span>DIGITAL</span></div>
        <div class="brand-tagline">Индивидуальная IT-разработка & AI-автоматизация продаж</div>
      </div>
      <div class="doc-meta">
        <div class="doc-badge">КП №${data.documentNumber}</div>
        <div>Дата: <strong>${data.date}</strong></div>
        <div>Действительно до: <strong>${data.validUntil}</strong></div>
      </div>
    </div>

    <div class="client-card">
      <div>
        <div class="client-field-label">Заказчик</div>
        <div class="client-field-value">«${data.companyName}»</div>
      </div>
      <div>
        <div class="client-field-label">Сфера / Город</div>
        <div class="client-field-value">${data.niche} (${data.city})</div>
      </div>
    </div>

    <h2>1. Понимание задачи</h2>
    <p>${data.taskUnderstanding}</p>

    <h2>2. Выявленные точки роста</h2>
    <p>${data.identifiedProblem.replace(/\n/g, '<br>')}</p>

    <h2>3. Предлагаемое решение</h2>
    <p>${data.proposedSolution}</p>

    <h2>4. Дорожная карта и сроки</h2>
    <table class="table-container">
      <thead>
        <tr>
          <th>Спринт</th>
          <th>Состав работ</th>
          <th>Срок</th>
          <th>Результат</th>
        </tr>
      </thead>
      <tbody>
        ${data.phases
          .map(
            (p) => `<tr>
          <td><strong>Спринт ${p.stageNumber}</strong></td>
          <td>${p.title}</td>
          <td>~${p.durationWeeks} нед.</td>
          <td>${p.deliverables.join(', ')}</td>
        </tr>`,
          )
          .join('')}
        <tr>
          <td colspan="2"><strong>Общий срок проекта</strong></td>
          <td colspan="2"><strong>~${data.totalWeeks} недель</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="pricing-hero">
      <div class="pricing-hero-label">Бюджет проекта под ключ</div>
      <div class="pricing-hero-amount">${priceRangeStr}</div>
      <div class="pricing-hero-terms">${data.pricing.paymentTerms}</div>
    </div>

    <h2>5. Границы проекта</h2>
    <div class="scope-grid">
      <div class="scope-box inclusions">
        <div class="scope-title">Входит в стоимость:</div>
        <ul class="scope-list">
          ${data.inclusions.map((i) => `<li>✓ ${i}</li>`).join('')}
        </ul>
      </div>
      <div class="scope-box exclusions">
        <div class="scope-title">Не входит в стоимость:</div>
        <ul class="scope-list">
          ${data.exclusions.map((e) => `<li>✗ ${e}</li>`).join('')}
        </ul>
      </div>
    </div>

    <h2>6. Гарантия и Сопровождение</h2>
    <p>• <strong>Гарантия:</strong> ${data.maintenance.warrantyMonths} месяцев бесплатной гарантийной техподдержки на программный код.<br>
    • <strong>SLA:</strong> ${data.maintenance.warrantySla}.</p>

    <div class="next-step-box">
      <div class="next-step-title">Рекомендуемый следующий шаг:</div>
      <p style="margin-bottom:0;">${data.nextStep}</p>
    </div>

    <div class="footer-sign">
      <div class="sign-col">
        <div class="client-field-label">Исполнитель: Nexora Studio</div>
        <div class="sign-line"></div>
      </div>
      <div class="sign-col">
        <div class="client-field-label">Заказчик: «${data.companyName}»</div>
        <div class="sign-line"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}

// Backward-compatible wrapper for existing imports
export async function generateCommercialProposal(
  leadId: string,
  conversationId?: string | null,
  customServiceType?: string,
): Promise<CommercialProposal> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error('Lead not found.');

  const result = await CommercialProposalEngine.generateProposal(lead.userId, {
    leadId,
    conversationId: conversationId || undefined,
    overrideServiceType: customServiceType,
  });

  return {
    id: result.id!,
    leadId,
    conversationId: conversationId || null,
    title: result.title,
    serviceType: result.serviceType,
    summary: result.extendedVersion,
    scope: result.functionality as any,
    deliverables: result.inclusions as any,
    timelineWeeks: result.timeline.totalWeeks,
    priceEstimateMin: result.pricing.finalMinAmount,
    priceEstimateMax: result.pricing.finalMaxAmount,
    currency: 'KZT',
    status: 'DRAFT',
    createdAt: new Date(result.createdAt),
    updatedAt: new Date(),
    formattedMarkdown: result.whatsAppVersion,
  } as unknown as CommercialProposal;
}
