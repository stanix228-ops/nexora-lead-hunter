import { prisma } from '@nexora/database';
import type {
  NexoraProductType,
  SolutionBuilderResult,
  SolutionBuilderRequest,
  ApplySolutionToProposalRequest,
  ConsultativePitchStructure,
  MatchedNexoraProduct,
  SolutionDeliverableItem,
  SolutionPricingEstimate,
  SolutionRecurringOption,
  NeedsDiscoveryProfile,
  CommercialProposal,
  Deal,
} from '@nexora/types';
import { logger } from '../../common/logger';
import { getAIProvider } from './ai.provider';
import { recordTimelineEvent, recordClientMemory } from '../crm/crm.service';
import { emitToUser } from '../../common/realtime/socket';

// ============================================================================
// 1. Nexora 8-Product Catalog Specifications
// ============================================================================

interface CatalogProductSpec {
  type: NexoraProductType;
  title: string;
  tagline: string;
  description: string;
  keywords: string[];
  painTriggerKeywords: string[];
  keyFeatures: string[];
  deliverables: SolutionDeliverableItem[];
  baseMinPrice: number;
  baseMaxPrice: number;
  estimatedWeeks: number;
  recurringOption: SolutionRecurringOption;
  roiFormula: (niche?: string) => { savingsOrRevenue: string; paybackMonths: number; metric: string };
}

const NEXORA_PRODUCT_CATALOG: CatalogProductSpec[] = [
  {
    type: 'WEBSITE',
    title: 'Высокоскоростной Web-сервис & Сайт на Next.js / React',
    tagline: 'Мгновенная загрузка <0.8с, 100% мобильная адаптация и SEO-оптимизация',
    description: 'Разработка современного веб-приложения на Next.js и React с адаптивным UI, продуманным UX, интеграцией с мессенджерами и максимальной конверсией из посетителя в заявку.',
    keywords: ['сайт', 'веб', 'лендинг', 'веб-сервис', 'интернет-магазин', 'редизайн', 'скорость', 'seo', 'мобильная версия', 'ux', 'дизайн'],
    painTriggerKeywords: ['нет сайта', 'медленный сайт', 'не открывается', 'старый дизайн', 'нет мобильной', 'низкая конверсия', 'нет заявок с сайта', 'нет форм', 'падают заявки'],
    keyFeatures: [
      'Мгновенная загрузка страниц (< 0.8с) на Next.js App Router',
      '100% адаптивность под экраны смартфонов и планшетов',
      'Интерактивные формы захвата с мгновенной отправкой в WhatsApp/Telegram',
      'Техническое SEO (микроразметка, Open Graph, Core Web Vitals 95+)',
      'Удобная панель управления контентом без программистов',
    ],
    deliverables: [
      { name: 'UI/UX прототип и дизайн', description: 'Индивидуальный дизайн в Figma с мобильной версией', techStack: ['Figma'], timelineWeeks: 1 },
      { name: 'Next.js Frontend & SSR', description: 'Реактивный интерфейс с серверным рендерингом', techStack: ['Next.js', 'React', 'Tailwind CSS', 'TypeScript'], timelineWeeks: 1.5 },
      { name: 'Интеграция форм и аналитики', description: 'Связка с WhatsApp, Telegram, Яндекс.Метрикой и GA4', techStack: ['Node.js', 'Webhooks'], timelineWeeks: 0.5 },
    ],
    baseMinPrice: 49000,
    baseMaxPrice: 145000,
    estimatedWeeks: 2,
    recurringOption: {
      name: 'Техподдержка, хостинг и SEO-мониторинг',
      monthlyCost: 15000,
      currency: 'KZT',
      description: 'Обновление контента, резервные копии, мониторинг доступности 24/7 и оптимизация позиций в поиске.',
      benefits: ['Бесперебойная работа сайта 99.9%', 'До 5 часов правок в месяц', 'Ежемесячный SEO-отчет'],
    },
    roiFormula: () => ({
      savingsOrRevenue: '+30–50% заявок за счет устранения отказов на смартфонах',
      paybackMonths: 1.5,
      metric: 'Рост конверсии из трафика в обращение с 1.2% до 3.8%',
    }),
  },
  {
    type: 'TELEGRAM_BOT',
    title: 'Telegram Mini App (TMA) & Чат-бот для продаж и бронирования',
    tagline: 'Оформление заказов и онлайн-запись в 2 клика без выхода из Telegram',
    description: 'Интерактивное веб-приложение внутри Telegram (TMA) и чат-бот для каталога, онлайн-записи, бронирования столиков/услуг и автоматических push-рассылок по клиентской базе.',
    keywords: ['telegram', 'бот', 'чат-бот', 'tma', 'mini app', 'телеграм', 'запись', 'меню', 'бронь', 'онлайн-запись'],
    painTriggerKeywords: ['ручная запись', 'переписки в директ', 'теряются записи', 'нет онлайн записи', 'очереди', 'клиенты забывают прийти', 'нет бота'],
    keyFeatures: [
      'Полноэкранный TMA интерфейс с каталогом и корзиной',
      'Онлайн-бронирование времени и услуг с мгновенным подтверждением',
      'Прием платежей через Kaspi Pay, карты прямо в Telegram',
      'Автоматические напоминания клиентам о визите за 2 часа',
      'Бесплатные прогревающие рассылки по всей базе подписчиков',
    ],
    deliverables: [
      { name: 'Архитектура сценариев и воронки', description: 'Логика веток диалогов, каталога и онлайн-записи', techStack: ['Mermaid', 'Figma'], timelineWeeks: 0.5 },
      { name: 'Telegram Mini App Frontend', description: 'Быстрый интерфейс TMA с корзиной и выбором времени', techStack: ['React', 'Telegram WebApp SDK', 'Tailwind'], timelineWeeks: 1 },
      { name: 'Bot Backend & Платежный шлюз', description: 'Серверная логика бота, вебхуки и интеграция оплат', techStack: ['Node.js', 'PostgreSQL', 'Kaspi API'], timelineWeeks: 1 },
    ],
    baseMinPrice: 35000,
    baseMaxPrice: 95000,
    estimatedWeeks: 1.5,
    recurringOption: {
      name: 'Сопровождение бота, рассылки и сервер',
      monthlyCost: 10000,
      currency: 'KZT',
      description: 'Выделенный сервер, обновление сценариев, запуск маркетинговых рассылок и техподдержка.',
      benefits: ['Гарантия доставки сообщений', 'Обновление меню/услуг без доплат', 'Аналитика конверсий бота'],
    },
    roiFormula: () => ({
      savingsOrRevenue: 'Снижение неявок (no-show) на 60% + допродажи в рассылках',
      paybackMonths: 1,
      metric: 'Экономия до 40 часов работы администратора в месяц',
    }),
  },
  {
    type: 'AI_ASSISTANT',
    title: 'AI Sales Assistant & 24/7 Консультант (WhatsApp & Telegram)',
    tagline: 'Мгновенный ответ за 3 секунды, квалификация лидов и дожим сделок',
    description: 'Интеллектуальный AI-менеджер на базе LLM, обученный на регламентах и базе знаний компании. Квалифицирует клиентов, отвечает на вопросы, отрабатывает возражения и передает горячие лиды.',
    keywords: ['ai', 'ии', 'ассистент', 'менеджер', 'whatsapp', 'ответы ночью', '24/7', 'квалификация', 'нейросеть', 'оператор'],
    painTriggerKeywords: ['долго отвечаем', 'теряем лиды ночью', 'менеджеры не успевают', 'рутинные вопросы', 'слив лидов', 'нет операторов на выходных', 'высокая нагрузка'],
    keyFeatures: [
      'Ответ клиентам в WhatsApp и Telegram за 3-5 секунд 24/7/365',
      'Глубокая база знаний: знает все услуги, цены, тайминги и условия',
      'Умная квалификация лидов по BANT (бюджет, потребность, сроки)',
      'Отработка возражений по методике Nexora (дорого, подумаю, есть другие)',
      'Мгновенная передача горячего клиента живому менеджеру с готовой сводкой',
    ],
    deliverables: [
      { name: 'Оцифровка базы знаний и регламентов', description: 'Структурирование прайса, FAQ и алгоритмов квалификации', techStack: ['Knowledge Graph', 'Vector DB'], timelineWeeks: 1 },
      { name: 'Настройка AI-модели и Guardrails', description: 'Тюнинг промптов, tone-of-voice и защитных фильтров', techStack: ['LLM Engine', 'LangChain/Custom'], timelineWeeks: 1 },
      { name: 'Шлюз WhatsApp/Telegram & CRM Sync', description: 'Интеграция с номерами компании и фиксация сделок в CRM', techStack: ['Baileys/WPPConnect', 'PostgreSQL'], timelineWeeks: 1 },
    ],
    baseMinPrice: 45000,
    baseMaxPrice: 120000,
    estimatedWeeks: 2,
    recurringOption: {
      name: 'AI Поддержка, дообучение модели и токены',
      monthlyCost: 15000,
      currency: 'KZT',
      description: 'Оплата API LLM-моделей, мониторинг диалогов, регулярное дообучение на новых вопросах и SLA.',
      benefits: ['Безлимитная обработка входящих диалогов', 'Еженедельный аудит качества ответов', 'Добавление новых продуктов'],
    },
    roiFormula: () => ({
      savingsOrRevenue: 'Экономия 150 000+ ₸/мес на зарплате операторов + 0 упущенных ночных лидов',
      paybackMonths: 1.2,
      metric: '100% охват обращений со средним временем ответа 4 секунды',
    }),
  },
  {
    type: 'BUSINESS_AUTOMATION',
    title: 'Сквозная автоматизация воронки продаж и интеграции',
    tagline: 'Авто-цепочки дожима в WhatsApp, связка с Kaspi/1С/CRM и отсутствие потерь лидов',
    description: 'Построение автоматизированного конвейера обработки клиентов: авто-сообщения после первого контакта, синхронизация с 1С / складскими программами, напоминания о повторных покупках.',
    keywords: ['автоматизация', 'воронка', 'дожим', 'crm интеграция', '1с', 'триггеры', 'напоминания', 'склад', 'синхронизация'],
    painTriggerKeywords: ['забывают перезвонить', 'нет дожима', 'ручной перенос данных', 'рассинхрон с 1с', 'нет сквозной аналитики', 'теряются контакты'],
    keyFeatures: [
      'Автоматические каскадные цепочки дожима «теплых» лидов в WhatsApp',
      'Двусторонняя синхронизация остатков, счетов и заказов с Kaspi / 1С / CRM',
      'Триггерные уведомления руководству о зависших сделках',
      'Автоматическая генерация счетов и коммерческих предложений',
      'Сквозной трекинг источников лидов от рекламы до оплаты',
    ],
    deliverables: [
      { name: 'Аудит и карта бизнес-процессов', description: 'Детализация точек интеграции и триггерных событий', techStack: ['BPMN'], timelineWeeks: 0.5 },
      { name: 'Разработка интеграционных коннекторов', description: 'Webhooks, API-шлюзы к 1С, CRM и эквайрингу', techStack: ['Node.js', 'REST API', 'Redis'], timelineWeeks: 1 },
      { name: 'Настройка триггерных авто-цепочек', description: 'Логика дожима и авто-уведомлений менеджеров', techStack: ['Workflow Engine'], timelineWeeks: 0.5 },
    ],
    baseMinPrice: 35000,
    baseMaxPrice: 95000,
    estimatedWeeks: 1.5,
    recurringOption: {
      name: 'Мониторинг интеграций и поддержка API',
      monthlyCost: 10000,
      currency: 'KZT',
      description: 'Контроль стабильности обмена данными между сервисами и обновление протоколов API.',
      benefits: ['Мониторинг ошибок синхронизации 24/7', 'Адаптация под обновления 1C/CRM', 'Приоритетная линия техподдержки'],
    },
    roiFormula: () => ({
      savingsOrRevenue: 'Возврат до 25% «уснувших» клиентов через авто-дожим',
      paybackMonths: 1,
      metric: 'Исключение человеческого фактора при передаче данных между системами',
    }),
  },
  {
    type: 'CUSTOM_IT_SOLUTION',
    title: 'Кастомная CRM / ERP система под уникальные регламенты',
    tagline: 'Индивидуальная система учета без ежемесячных платежей за пользователей',
    description: 'Индивидуальная платформа управления клиентами, проектами, производством и финансами, разработанная строго под специфику вашего бизнеса. Полное владение кодом и базами данных.',
    keywords: ['custom crm', 'erp', 'кастомная crm', 'система учета', 'производство', 'база данных', 'своя система', 'управление проектами'],
    painTriggerKeywords: ['готовые crm не подходят', 'дорого платить за пользователей', 'сложные процессы', 'нужен свой функционал', 'утечки данных', 'amo не гибкая'],
    keyFeatures: [
      'Архитектура создана строго под уникальные бизнес-шаги компании',
      'Отсутствие лицензионных платежей за каждого добавленного сотрудника',
      'Гибкая система ролей: от оператора до финансового директора',
      'Встроенная аналитика маржинальности, KPI и воронки продаж',
      'Хранение данных на собственных защищенных серверах клиента',
    ],
    deliverables: [
      { name: 'Детальное техническое задание (ТЗ)', description: 'Проектирование схемы БД, ролей и сценариев работы', techStack: ['PostgreSQL', 'DBDiagram'], timelineWeeks: 1 },
      { name: 'Backend API & База данных', description: 'Отказоустойчивый серверный бэкенд с бизнес-логикой', techStack: ['Node.js', 'Prisma', 'PostgreSQL'], timelineWeeks: 2 },
      { name: 'Admin Dashboard & Web UI', description: 'Быстрый интерфейс для сотрудников и руководства', techStack: ['React', 'Next.js', 'Tailwind'], timelineWeeks: 2 },
    ],
    baseMinPrice: 85000,
    baseMaxPrice: 240000,
    estimatedWeeks: 3,
    recurringOption: {
      name: 'Администрирование серверов и развитие функционала',
      monthlyCost: 20000,
      currency: 'KZT',
      description: 'Выделенный DevOps-инженер, бэкапы, мониторинг безопасности и добавление новых отчетов.',
      benefits: ['Безопасность корпоративных данных', 'Ежемесячный пул часов на доработки', 'Гарантия стабильности'],
    },
    roiFormula: () => ({
      savingsOrRevenue: 'Экономия от 200 000 ₸/год на подписках коробочных CRM + рост прозрачности',
      paybackMonths: 3,
      metric: 'Сокращение времени обработки одного заказа с 20 до 4 минут',
    }),
  },
  {
    type: 'MOBILE_APP',
    title: 'Мобильное приложение iOS & Android (React Native / Flutter)',
    tagline: 'Прямой контакт с клиентом через иконку на главном экране и Push-уведомления',
    description: 'Кроссплатформенное мобильное приложение с личным кабинетом, каталогом, программой лояльности, push-уведомлениями и онлайн-оплатой для максимизации повторных покупок.',
    keywords: ['мобильное приложение', 'ios', 'android', 'app store', 'google play', 'приложение', 'react native', 'flutter', 'лояльность'],
    painTriggerKeywords: ['нужно мобильное приложение', 'хотим приложение', 'низкий ltv', 'нет повторных продаж', 'пластиковые карты лояльности'],
    keyFeatures: [
      'Единая быстрая кодовая база для iOS и Android',
      'Электронная карта лояльности с начислением и списанием бонусов',
      'Сегментированные Push-уведомления с открываемостью свыше 40%',
      'Быстрая оплата через Kaspi Pay / Apple Pay в один клик',
      'Публикация в App Store и Google Play под ключ',
    ],
    deliverables: [
      { name: 'UX/UI дизайн экранов приложения', description: 'Дизайн-система для iOS (HIG) и Android (Material)', techStack: ['Figma'], timelineWeeks: 1.5 },
      { name: 'Разработка приложения (iOS + Android)', description: 'Клиентское мобильное приложение с оффлайн-кэшем', techStack: ['React Native', 'TypeScript'], timelineWeeks: 2.5 },
      { name: 'Backend, Push-сервер и релиз в сторах', description: 'Сервер авторизации, рассылка пушей и прохождение модерации', techStack: ['Node.js', 'FCM', 'App Store Connect'], timelineWeeks: 1 },
    ],
    baseMinPrice: 150000,
    baseMaxPrice: 390000,
    estimatedWeeks: 4,
    recurringOption: {
      name: 'Поддержка версий ОС и релизы обновлений',
      monthlyCost: 25000,
      currency: 'KZT',
      description: 'Адаптация под новые версии iOS/Android, устранение багов и публикация патчей.',
      benefits: ['Совместимость со всеми смартфонами', 'Мониторинг крашей Crashlytics', 'Обновление контента в сторах'],
    },
    roiFormula: () => ({
      savingsOrRevenue: 'Рост повторных заказов (LTV) на +35-45% за счет Push-маркетинга',
      paybackMonths: 3.5,
      metric: 'Прямой доступ в карман клиента без затрат на платную рекламу в поиске',
    }),
  },
  {
    type: 'AI_TOOL',
    title: 'Кастомные AI-инструменты & Обработка документов / Прайсов',
    tagline: 'Автоматическое распознавание счетов, анализ отзывов и мгновенный расчет смет',
    description: 'Узкоспециализированные AI-модули для рутинных внутренних операций: автоматический парсинг входящих спецификаций и смет, анализ тональности отзывов, генерация отчетов.',
    keywords: ['ai tool', 'распознавание', 'парсер прайсов', 'обработка документов', 'анализ отзывов', 'ocr', 'авто-смета', 'умный поиск'],
    painTriggerKeywords: ['много рутины в excel', 'долго считаем сметы', 'ручной ввод документов', 'ручной разбор почты', 'ошибки в расчетах'],
    keyFeatures: [
      'Автоматическое извлечение данных из PDF, Excel, фото документов (OCR + LLM)',
      'Мгновенный расчет себестоимости и коммерческих смет по прайс-листу',
      'AI-анализ отзывов клиентов и автоматическая подготовка ответов',
      'Интеграция с внутренними таблицами и базами данных через API',
    ],
    deliverables: [
      { name: 'Пайплайн парсинга и AI-обработки', description: 'Алгоритмы распознавания структуры и извлечения сущностей', techStack: ['Python', 'OCR', 'OpenAI/Claude API'], timelineWeeks: 1 },
      { name: 'Интерфейс загрузки и экспорта', description: 'Веб-панель для операторов с пакетной загрузкой файлов', techStack: ['React', 'FastAPI'], timelineWeeks: 1 },
    ],
    baseMinPrice: 35000,
    baseMaxPrice: 85000,
    estimatedWeeks: 1.5,
    recurringOption: {
      name: 'AI Мощности и адаптация форматов документов',
      monthlyCost: 15000,
      currency: 'KZT',
      description: 'Поддержка новых шаблонов документов от поставщиков и оплата AI-токенов.',
      benefits: ['Адаптация под любые новые бланки', 'Точность распознавания 99.2%', 'Ежедневное резервное копирование'],
    },
    roiFormula: () => ({
      savingsOrRevenue: 'Сокращение времени подготовки сметы с 3 часов до 30 секунд',
      paybackMonths: 1,
      metric: 'Освобождение 2 сотрудников от рутинного ручного ввода данных',
    }),
  },
];

// ============================================================================
// 2. Solution Builder Service
// ============================================================================

export class SolutionBuilderService {
  /**
   * Main entrypoint: Builds a comprehensive, grounded Nexora IT Solution
   * based on Business Analysis, Needs Discovery Profile, and Client Memories.
   */
  static async buildSolution(
    userId: string,
    request: SolutionBuilderRequest,
  ): Promise<SolutionBuilderResult> {
    const startTime = Date.now();
    const { leadId, conversationId, overrideProblems, preferredProductTypes, targetBudget } = request;

    let lead: any = null;
    let conversation: any = null;

    if (leadId) {
      lead = await prisma.lead.findFirst({
        where: { id: leadId, userId },
        include: {
          analysis: true,
          score: true,
          clientMemories: { take: 30, orderBy: { createdAt: 'desc' } },
        },
      });
    }

    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          lead: {
            include: {
              analysis: true,
              score: true,
              clientMemories: { take: 30, orderBy: { createdAt: 'desc' } },
            },
          },
          aiState: true,
          messages: { take: 25, orderBy: { recordedAt: 'asc' } },
        },
      });

      if (!lead && conversation?.lead) {
        lead = conversation.lead;
      }
    }

    const companyName = request.companyName || lead?.companyName || lead?.phone || 'Компания клиента';
    const niche = request.niche || lead?.niche || 'Бизнес / Услуги';
    const discoveryProfile: Partial<NeedsDiscoveryProfile> =
      (conversation?.aiState?.discoveryProfile as Partial<NeedsDiscoveryProfile>) || {};

    // 1. Gather all Grounded Pains & Diagnosed Gaps across all modules
    const groundedPains: Array<{
      pain: string;
      impact: string;
      addressedBy: string;
      source: 'BUSINESS_ANALYSIS' | 'NEEDS_DISCOVERY' | 'MEMORY';
    }> = [];

    // From Business Analysis:
    if (lead?.analysis) {
      const gaps = (lead.analysis.detectedGaps as string[]) || [];
      const problems = (lead.analysis.foundProblems as any[]) || [];

      for (const gap of gaps) {
        groundedPains.push({
          pain: gap,
          impact: 'Снижение конверсии и отток потенциальных клиентов к конкурентам',
          addressedBy: 'Digital Optimization',
          source: 'BUSINESS_ANALYSIS',
        });
      }

      for (const prob of problems) {
        const text = typeof prob === 'string' ? prob : prob?.title || prob?.description || '';
        const imp = prob?.impact || prob?.financialLoss || 'Прямые потери заявок и времени сотрудников';
        if (text && !groundedPains.some((gp) => gp.pain === text)) {
          groundedPains.push({
            pain: text,
            impact: imp,
            addressedBy: 'Digital Optimization',
            source: 'BUSINESS_ANALYSIS',
          });
        }
      }
    }

    // From Needs Discovery Profile:
    if (discoveryProfile.pain && Array.isArray(discoveryProfile.pain)) {
      for (const p of discoveryProfile.pain) {
        if (!groundedPains.some((gp) => gp.pain.toLowerCase() === p.toLowerCase())) {
          groundedPains.push({
            pain: p,
            impact: discoveryProfile.impact || 'Операционные задержки и потеря выручки',
            addressedBy: 'Needs Discovery Target',
            source: 'NEEDS_DISCOVERY',
          });
        }
      }
    }
    if (discoveryProfile.need) {
      groundedPains.push({
        pain: `Потребность: ${discoveryProfile.need}`,
        impact: discoveryProfile.impact || 'Необходимость масштабирования продаж',
        addressedBy: 'Target Need',
        source: 'NEEDS_DISCOVERY',
      });
    }

    // From Client Memories:
    if (lead?.clientMemories) {
      for (const mem of lead.clientMemories) {
        if (mem.layer === 'INTERACTION_FACT' || mem.layer === 'BUSINESS_FACT' || mem.layer === 'OBJECTION') {
          if (mem.key.includes('pain') || mem.key.includes('problem') || mem.key.includes('bottleneck')) {
            groundedPains.push({
              pain: mem.value,
              impact: 'Зафиксировано в истории взаимодействия с клиентом',
              addressedBy: 'Memory Fact',
              source: 'MEMORY',
            });
          }
        }
      }
    }

    // From Overrides:
    if (overrideProblems && overrideProblems.length > 0) {
      for (const op of overrideProblems) {
        groundedPains.push({
          pain: op,
          impact: 'Критическое узкое место, указанное при проектировании решения',
          addressedBy: 'Manual Override',
          source: 'BUSINESS_ANALYSIS',
        });
      }
    }

    // If still empty (e.g. cold lead without audit yet), add standard baseline hypothesis
    if (groundedPains.length === 0) {
      groundedPains.push({
        pain: 'Отсутствие современного автоматизированного канала онлайн-продаж и приема заявок 24/7',
        impact: 'Потеря до 30% входящего трафика в нерабочее время и низкая конверсия первого контакта',
        addressedBy: 'Baseline IT Audit',
        source: 'BUSINESS_ANALYSIS',
      });
    }

    // 2. Problem-to-Product Matching Algorithm
    const allProblemText = groundedPains.map((p) => `${p.pain} ${p.impact}`).join(' ').toLowerCase();
    const scoredProducts: Array<{ product: CatalogProductSpec; matchScore: number; reason: string }> = [];

    for (const prod of NEXORA_PRODUCT_CATALOG) {
      let score = 0;
      const matchingReasons: string[] = [];

      // Check pain triggers
      for (const trigger of prod.painTriggerKeywords) {
        if (allProblemText.includes(trigger)) {
          score += 25;
          matchingReasons.push(`Прямое соответствие проблеме: «${trigger}»`);
        }
      }

      // Check general keywords
      for (const kw of prod.keywords) {
        if (allProblemText.includes(kw)) {
          score += 10;
        }
      }

      // If user preferred this product
      if (preferredProductTypes && preferredProductTypes.includes(prod.type)) {
        score += 50;
        matchingReasons.push('Приоритетный выбор пользователя');
      }

      // Check lead score recommended service
      if (lead?.score?.recommendedService) {
        const rec = lead.score.recommendedService;
        if (
          (rec === 'WEB' && prod.type === 'WEBSITE') ||
          (rec === 'TELEGRAM_BOT' && prod.type === 'TELEGRAM_BOT') ||
          (rec === 'AI_AUTOMATION' && prod.type === 'AI_ASSISTANT') ||
          (rec === 'CUSTOM_CRM' && prod.type === 'CUSTOM_IT_SOLUTION') ||
          (rec === 'MOBILE' && prod.type === 'MOBILE_APP') ||
          (rec === 'INTEGRATION' && prod.type === 'BUSINESS_AUTOMATION')
        ) {
          score += 35;
          matchingReasons.push('Рекомендовано AI Lead Scoring Engine');
        }
      }

      if (score > 0) {
        scoredProducts.push({
          product: prod,
          matchScore: score,
          reason: matchingReasons.join('; ') || 'Соответствие профилю бизнеса',
        });
      }
    }

    // Sort by highest match score
    scoredProducts.sort((a, b) => b.matchScore - a.matchScore);

    // If no specific match, default to top general fit (Website or AI Assistant)
    if (scoredProducts.length === 0) {
      scoredProducts.push({
        product: NEXORA_PRODUCT_CATALOG[0]!, // Website
        matchScore: 30,
        reason: 'Базовая точка роста цифрового присутствия',
      });
    }

    // 3. Single Product vs Complex Bundle Determination
    const isMultiPains = groundedPains.length >= 2;
    const topScored = scoredProducts.slice(0, 3);
    const isBundle = isMultiPains && topScored.length >= 2 && topScored[1]!.matchScore >= 20;

    let finalProductType: NexoraProductType;
    let matchedProductsList: MatchedNexoraProduct[] = [];
    let solutionTitle = '';
    let headline = '';
    let summary = '';

    if (isBundle) {
      finalProductType = 'COMPLEX_BUNDLE';
      const selectedSpecs = topScored.slice(0, 3).map((s) => s.product);

      matchedProductsList = selectedSpecs.map((spec) => ({
        type: spec.type,
        title: spec.title,
        tagline: spec.tagline,
        description: spec.description,
        targetedPain: groundedPains[0]?.pain || 'Оптимизация цифровых каналов',
        keyFeatures: spec.keyFeatures,
        deliverables: spec.deliverables,
        baseMinPrice: spec.baseMinPrice,
        baseMaxPrice: spec.baseMaxPrice,
        estimatedWeeks: spec.estimatedWeeks,
      }));

      const productNames = selectedSpecs.map((s) => s.title.split('&')[0]!.split('/')[0]!.trim()).join(' + ');
      solutionTitle = `Комплексная цифровая экосистема Nexora (${productNames})`;
      headline = `Сквозное решение для «${companyName}»: объединение ${selectedSpecs.map((s) => s.type).join(', ')} в единую систему продаж`;
      summary = `Для устранения всех выявленных узких мест «${companyName}» разработан синергетический пакет IT-продуктов. Совместное внедрение закрывает потери на этапе первого контакта, автоматизирует обработку заявок и удерживает клиентов в собственной экосистеме.`;
    } else {
      const topSpec = topScored[0]!.product;
      finalProductType = topSpec.type;

      matchedProductsList = [
        {
          type: topSpec.type,
          title: topSpec.title,
          tagline: topSpec.tagline,
          description: topSpec.description,
          targetedPain: groundedPains[0]?.pain || 'Оптимизация бизнес-процессов',
          keyFeatures: topSpec.keyFeatures,
          deliverables: topSpec.deliverables,
          baseMinPrice: topSpec.baseMinPrice,
          baseMaxPrice: topSpec.baseMaxPrice,
          estimatedWeeks: topSpec.estimatedWeeks,
        },
      ];

      solutionTitle = `${topSpec.title} для «${companyName}»`;
      headline = `${topSpec.tagline} — целевое IT-решение Nexora`;
      summary = `Индивидуальное решение для «${companyName}» (${niche}), устраняющее проблему «${groundedPains[0]?.pain || 'конверсии'}» и гарантирующее измеримый рост ключевых бизнес-метрик.`;
    }

    // 4. Calculate Pricing & Transparent Scope Range
    const pricing = this.calculatePricingEstimate(matchedProductsList, isBundle, targetBudget, discoveryProfile);

    // 5. Compose 8-Block Consultative Pitch
    const pitch = this.generate8BlockPitchStructure({
      companyName,
      niche,
      productType: finalProductType,
      isBundle,
      matchedProducts: matchedProductsList,
      groundedPains,
      pricing,
      discoveryProfile,
    });

    // 6. Format Final Markdown Pitch for Messengers
    const formattedPitchMessage = this.formatMessengerPitch(pitch, companyName);

    // 7. Compose Implementation Roadmap
    const implementationRoadmap = this.composeRoadmap(matchedProductsList, isBundle);

    // 8. Calculate Expected ROI & Metrics
    const expectedRoi = this.calculateRoiMetrics(matchedProductsList, niche);

    // 9. Recurring Service Option
    const primarySpec = NEXORA_PRODUCT_CATALOG.find((p) => p.type === matchedProductsList[0]?.type) || NEXORA_PRODUCT_CATALOG[0]!;
    const recurringOption = primarySpec.recurringOption;

    return {
      productType: finalProductType,
      isBundle,
      solutionTitle,
      headline,
      summary,
      matchedProducts: matchedProductsList,
      groundedPains,
      pitch,
      formattedPitchMessage,
      pricing,
      recurringOption,
      implementationRoadmap,
      expectedRoi,
      confidence: Math.min(0.95, 0.75 + groundedPains.length * 0.05),
      generationMetadata: {
        leadId: leadId || undefined,
        conversationId: conversationId || undefined,
        analyzedAt: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Applies the generated solution directly to the CRM:
   * Creates/updates CommercialProposal, updates Deal pipeline, records timeline & memory.
   */
  static async applySolutionToProposal(
    userId: string,
    request: ApplySolutionToProposalRequest,
  ): Promise<{ proposal: CommercialProposal; deal: Deal }> {
    const { leadId, conversationId, solution, proposalTitle, customDiscountPercent } = request;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, userId },
    });

    if (!lead) {
      throw new Error(`Lead ${leadId} not found.`);
    }

    const discount = customDiscountPercent || (solution.isBundle ? 10 : 0);
    const minPrice = Math.round(solution.pricing.minAmount * (1 - discount / 100));
    const maxPrice = Math.round(solution.pricing.maxAmount * (1 - discount / 100));
    const avgPrice = Math.round((minPrice + maxPrice) / 2);

    const title = proposalTitle || solution.solutionTitle;
    const allDeliverables = solution.matchedProducts.flatMap((p) => p.deliverables.map((d) => `${p.title}: ${d.name}`));
    const companyDisplay = lead.companyName || lead.phone || 'Клиент';
    const allScope = [
      `Анализ бизнес-процессов «${companyDisplay}» и фиксация ТЗ`,
      ...solution.matchedProducts.flatMap((p) => p.keyFeatures.map((f) => `Внедрение: ${f}`)),
      `Сквозное тестирование, перенос на боевой сервер и интеграция`,
      `Гарантийная техническая поддержка от Nexora`,
    ];

    const timelineWeeks = Math.max(...solution.matchedProducts.map((p) => p.estimatedWeeks));

    // 1. Create or Update CommercialProposal in Database
    const proposal = await prisma.commercialProposal.create({
      data: {
        leadId,
        conversationId: conversationId || null,
        title,
        serviceType: solution.productType,
        summary: solution.summary,
        scope: allScope,
        deliverables: allDeliverables,
        timelineWeeks,
        priceEstimateMin: minPrice,
        priceEstimateMax: maxPrice,
        currency: solution.pricing.currency,
        status: 'DRAFT',
      },
    });

    // 2. Create or Update Deal in Pipeline
    let deal = await prisma.deal.findFirst({
      where: { leadId, userId, isArchived: false },
      orderBy: { createdAt: 'desc' },
    });

    if (deal) {
      deal = await prisma.deal.update({
        where: { id: deal.id },
        data: {
          proposalId: proposal.id,
          stage: 'PROPOSAL',
          serviceType: solution.productType,
          proposalText: solution.formattedPitchMessage,
          amount: avgPrice,
          discount: discount > 0 ? avgPrice * (discount / 100) : 0,
          probability: 70,
          nextAction: 'Презентовать КП и согласовать 10-минутную демонстрацию',
        },
      });
    } else {
      deal = await prisma.deal.create({
        data: {
          userId,
          leadId,
          conversationId: conversationId || null,
          proposalId: proposal.id,
          title: `Сделка: ${title}`,
          stage: 'PROPOSAL',
          serviceType: solution.productType,
          proposalText: solution.formattedPitchMessage,
          amount: avgPrice,
          discount: discount > 0 ? avgPrice * (discount / 100) : 0,
          probability: 65,
          nextAction: 'Отправить коммерческое предложение клиенту',
        },
      });
    }

    // 3. Update Dialogue State Stage if active conversation
    if (conversationId) {
      await prisma.aiDialogueState.upsert({
        where: { conversationId },
        update: {
          stage: 'SOLUTION',
          offeredServices: solution.matchedProducts.map((p) => p.type),
        },
        create: {
          conversationId,
          stage: 'SOLUTION',
          offeredServices: solution.matchedProducts.map((p) => p.type),
        },
      });
    }

    // 4. Record CRM Timeline Event
    await recordTimelineEvent({
      userId,
      leadId,
      dealId: deal.id,
      conversationId: conversationId || null,
      eventType: 'PROPOSAL_GENERATED',
      title: `Сформировано решение: ${solution.solutionTitle}`,
      description: `Формат: ${solution.productType}. Вилка бюджета: ${minPrice.toLocaleString('ru-RU')} – ${maxPrice.toLocaleString('ru-RU')} ${solution.pricing.currency}`,
      metadata: {
        proposalId: proposal.id,
        isBundle: solution.isBundle,
        productType: solution.productType,
        minPrice,
        maxPrice,
      },
    });

    // 5. Record Client Memory Layer
    await recordClientMemory({
      leadId,
      conversationId: conversationId || null,
      layer: 'DEAL_FACT',
      key: 'offered_solution_package',
      value: `${solution.solutionTitle} (Бюджет: ${minPrice}–${maxPrice} ${solution.pricing.currency})`,
      confidence: 0.95,
      source: 'AI',
    });

    // 6. Realtime WebSocket Broadcast
    emitToUser(userId, 'PROPOSAL_UPDATED', {
      leadId,
      dealId: deal.id,
      proposalId: proposal.id,
      solutionTitle: title,
    });

    return {
      proposal: proposal as unknown as CommercialProposal,
      deal: deal as unknown as Deal,
    };
  }

  // ============================================================================
  // Private Helper Methods: Pricing, 8-Block Formulation & Roadmaps
  // ============================================================================

  private static calculatePricingEstimate(
    products: MatchedNexoraProduct[],
    isBundle: boolean,
    targetBudget?: number,
    discoveryProfile?: Partial<NeedsDiscoveryProfile>,
  ): SolutionPricingEstimate {
    let rawMin = 0;
    let rawMax = 0;

    for (const p of products) {
      rawMin += p.baseMinPrice;
      rawMax += p.baseMaxPrice;
    }

    // Apply bundle synergy discount (10-15% discount for package)
    if (isBundle && products.length >= 2) {
      rawMin = Math.round(rawMin * 0.88);
      rawMax = Math.round(rawMax * 0.88);
    }

    // Clarification questions needed for exact scope estimation
    const requiredClarifications: string[] = [];
    if (!discoveryProfile?.decisionMaker?.isDecisionMaker) {
      requiredClarifications.push('Согласование финального ТЗ с лицом, принимающим решения (ЛПР)');
    }
    if (!discoveryProfile?.currentSolution?.stack) {
      requiredClarifications.push('Точные спецификации текущей IT-инфраструктуры и API для интеграций');
    }
    requiredClarifications.push('Объем уникальных дизайн-экранов и пользовательских сценариев');
    requiredClarifications.push('Необходимость миграции исторической базы клиентов из старых систем');

    const isSufficientDataForExactPrice = false; // Always transparent range until formal SOW/TZ is signed

    let reasoning = isBundle
      ? `Комплексное пакетное решение из ${products.length} продуктов с учетом пакетной синергии (-12%).`
      : `Индивидуальная оценка на основе продукта «${products[0]?.title}».`;

    if (targetBudget && targetBudget > 0) {
      reasoning += ` Зафиксирован ориентир бюджета клиента: ~${targetBudget.toLocaleString('ru-RU')} ₸. Предложенный диапазон позволяет запустить MVP в рамках бюджета.`;
    }

    return {
      minAmount: rawMin,
      maxAmount: rawMax,
      currency: 'KZT',
      isRange: true,
      confidence: 0.88,
      reasoning,
      requiredClarifications,
      isSufficientDataForExactPrice,
    };
  }

  private static generate8BlockPitchStructure(params: {
    companyName: string;
    niche: string;
    productType: NexoraProductType;
    isBundle: boolean;
    matchedProducts: MatchedNexoraProduct[];
    groundedPains: Array<{ pain: string; impact: string }>;
    pricing: SolutionPricingEstimate;
    discoveryProfile: Partial<NeedsDiscoveryProfile>;
  }): ConsultativePitchStructure {
    const { companyName, niche, productType, isBundle, matchedProducts, groundedPains, pricing } = params;

    // 1. PROBLEM
    const mainPains = groundedPains.slice(0, 3).map((p) => p.pain).join(', ');
    const problem = `В ходе анализа цифровых процессов «${companyName}» выявлены ключевые ограничения: ${mainPains}.`;

    // 2. WHY IT MATTERS
    const primaryImpact = groundedPains[0]?.impact || 'Снижение конверсии и отток потенциальных покупателей к конкурентам';
    const whyItMatters = `Это напрямую влияет на финансовый результат: ${primaryImpact}. Пользователи сталкиваются с задержками при первом контакте и уходят к конкурентам, а сотрудники тратят до 30% рабочего времени на рутинную ручную обработку.`;

    // 3. SOLUTION
    const productTitles = matchedProducts.map((p) => p.title).join(' и ');
    const solution = isBundle
      ? `Внедрение комплексной IT-системы Nexora: связка «${productTitles}», полностью закрывающая весь путь клиента от первого клика до оплаты.`
      : `Разработка и запуск «${matchedProducts[0]?.title}» от Nexora — решение, созданное специально для специфики сферы «${niche}».`;

    // 4. HOW IT WORKS
    const howItWorks = matchedProducts
      .flatMap((p) => p.keyFeatures.slice(0, 2))
      .map((f, idx) => `${idx + 1}) ${f}`)
      .join('\n');

    // 5. EXPECTED RESULT
    const expectedResult = isBundle
      ? `• Рост конверсии из входящего трафика в закрытую сделку на +35–50%\n• Мгновенный отклик 24/7 без потери клиентов в нерабочие часы\n• Сокращение нагрузки на операторов до 65% благодаря авто-сценариям`
      : `• Устранение выявленной проблемы («${groundedPains[0]?.pain}»)\n• Увеличение скорости взаимодействия с клиентом в 4 раза\n• Окупаемость инвестиций в течение 1–3 месяцев`;

    // 6. IMPLEMENTATION
    const totalWeeks = Math.max(...matchedProducts.map((p) => p.estimatedWeeks));
    const implementation = `Срок реализации: ~${totalWeeks} нед. Поэтапный запуск:\n1. Аналитика и UX-прототип (3–5 дней)\n2. Разработка и интеграции (7–12 дней)\n3. Тестирование, перенос на сервер и обучение команды (3–4 дня)`;

    // 7. ESTIMATED COST
    const minFmt = pricing.minAmount.toLocaleString('ru-RU');
    const maxFmt = pricing.maxAmount.toLocaleString('ru-RU');
    const estimatedCost = `Ориентировочный бюджет: от ${minFmt} до ${maxFmt} ${pricing.currency} (точная сумма фиксируется после согласования финального ТЗ).`;

    // 8. OPTIONAL RECURRING SERVICE
    const rec = matchedProducts[0]?.type ? NEXORA_PRODUCT_CATALOG.find((p) => p.type === matchedProducts[0]?.type)?.recurringOption : null;
    const optionalRecurringService = rec
      ? `Опционально: «${rec.name}» — ${rec.monthlyCost.toLocaleString('ru-RU')} ${rec.currency}/мес (${rec.description})`
      : 'Опционально: Гарантийное обслуживание и серверная оптимизация: от 12 000 ₽/мес.';

    return {
      problem,
      whyItMatters,
      solution,
      howItWorks,
      expectedResult,
      implementation,
      estimatedCost,
      optionalRecurringService,
    };
  }

  private static formatMessengerPitch(pitch: ConsultativePitchStructure, companyName: string): string {
    return `⚡️ *ИНДИВИДУАЛЬНОЕ IT-РЕШЕНИЕ ДЛЯ «${companyName.toUpperCase()}»*
_Разработано IT-командой Nexora_

📌 *1. ВЫЯВЛЕННАЯ ПРОБЛЕМА (PROBLEM)*
${pitch.problem}

⚠️ *2. В ЧЕМ РИСК И ПОТЕРИ (WHY IT MATTERS)*
${pitch.whyItMatters}

💡 *3. НАШЕ РЕШЕНИЕ (SOLUTION)*
${pitch.solution}

⚙️ *4. КАК ЭТО РАБОТАЕТ (HOW IT WORKS)*
${pitch.howItWorks}

📈 *5. ОЖИДАЕМЫЙ РЕЗУЛЬТАТ (EXPECTED RESULT)*
${pitch.expectedResult}

⏱ *6. ЭТАПЫ И СРОКИ (IMPLEMENTATION)*
${pitch.implementation}

💰 *7. ОЦЕНКА СТОИМОСТИ (ESTIMATED COST)*
${pitch.estimatedCost}

🔄 *8. ПОДДЕРЖКА И РАЗВИТИЕ (RECURRING SERVICE)*
${pitch.optionalRecurringService}

---
🤝 *Следующий шаг:*
Удобно будет провести короткую 10-минутную онлайн-демонстрацию прототипа, чтобы наглядно показать архитектуру и зафиксировать точные требования?`;
  }

  private static composeRoadmap(
    products: MatchedNexoraProduct[],
    isBundle: boolean,
  ): Array<{ stage: string; durationWeeks: number; deliverables: string[] }> {
    if (isBundle) {
      return [
        {
          stage: 'Этап 1: Архитектура и UX-проектирование',
          durationWeeks: 1,
          deliverables: ['Техническое задание', 'UI/UX прототипы всех интерфейсов', 'Схема БД и API'],
        },
        {
          stage: 'Этап 2: Параллельная разработка модулей',
          durationWeeks: 2,
          deliverables: products.flatMap((p) => p.deliverables.map((d) => d.name)),
        },
        {
          stage: 'Этап 3: Сквозная интеграция и QA',
          durationWeeks: 1,
          deliverables: ['Сквозное E2E тестирование', 'Нагрузочные тесты', 'Настройка защищенного сервера'],
        },
        {
          stage: 'Этап 4: Релиз и обучение команды',
          durationWeeks: 0.5,
          deliverables: ['Боевой запуск', 'Видео-инструкции для сотрудников', 'Передача всех исходных кодов'],
        },
      ];
    }

    return [
      {
        stage: 'Этап 1: Проектирование и прототип',
        durationWeeks: 0.5,
        deliverables: ['Согласование ТЗ', 'Интерактивный кликабельный дизайн'],
      },
      {
        stage: 'Этап 2: Программирование и интеграции',
        durationWeeks: products[0]?.estimatedWeeks ? Math.max(1, products[0].estimatedWeeks - 1) : 1.5,
        deliverables: products[0]?.deliverables.map((d) => d.name) || ['Разработка системы'],
      },
      {
        stage: 'Этап 3: Тестирование и запуск',
        durationWeeks: 0.5,
        deliverables: ['Релиз на продакшн', 'Передача документации и доступов'],
      },
    ];
  }

  private static calculateRoiMetrics(
    products: MatchedNexoraProduct[],
    niche: string,
  ): { expectedMonthlySavingsOrRevenue?: string | null; paybackPeriodMonths?: number | null; keyMetric: string } {
    const primaryType = products[0]?.type || 'WEBSITE';
    const spec = NEXORA_PRODUCT_CATALOG.find((p) => p.type === primaryType) || NEXORA_PRODUCT_CATALOG[0]!;
    const formula = spec.roiFormula(niche);

    return {
      expectedMonthlySavingsOrRevenue: formula.savingsOrRevenue,
      paybackPeriodMonths: formula.paybackMonths,
      keyMetric: formula.metric,
    };
  }
}
