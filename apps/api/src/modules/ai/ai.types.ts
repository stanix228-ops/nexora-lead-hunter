import type {
  AiAgentMode,
  AiProvider,
  LeadGrade,
  RecommendedService,
  UrgencyLevel,
  BudgetTier,
  AiStage,
  MemoryFactCategory,
  MemoryFactSource,
  ProposalStatus,
  FollowUpStatus,
  AiActionType,
} from '@nexora/types';

export interface NexoraServiceItem {
  id: string;
  name: string;
  category: RecommendedService;
  description: string;
  targetNiches: string[];
  keyBenefits: string[];
  priceRange: { min: number; max: number; currency: string };
  timelineWeeks: number;
  deliverables: string[];
}

export const DEFAULT_NEXORA_CATALOG: NexoraServiceItem[] = [
  {
    id: 'web_modern_app',
    name: 'Высококонверсионный Web-сервис / Сайт на Next.js & React',
    category: 'WEB',
    description: 'Разработка быстрого, адаптивного и продающего веб-приложения / лендинга с SEO-оптимизацией и интеграцией в CRM.',
    targetNiches: ['Рестораны', 'Клиники', 'Недвижимость', 'Услуги', 'B2B', 'Автосервисы', 'Отели', 'Салоны красоты'],
    keyBenefits: [
      'Мгновенная загрузка < 0.8с (Lighthouse 95+)',
      '100% адаптивность под смартфоны (рост конверсии до +40%)',
      'Прямая интеграция с WhatsApp и Telegram для сбора заявок',
      'SEO-оптимизированная структура для топ-выдачи Google и Яндекс',
    ],
    priceRange: { min: 49000, max: 145000, currency: 'KZT' },
    timelineWeeks: 2,
    deliverables: ['UI/UX дизайн', 'Next.js Frontend', 'Панель администратора', 'SEO-настройка', 'Интеграция форм в мессенджеры'],
  },
  {
    id: 'tg_bot_tma',
    name: 'Telegram Mini App (TMA) и чат-бот для продаж & онлайн-записи',
    category: 'TELEGRAM_BOT',
    description: 'Интерактивный Telegram Mini App и авто-бот для оформления заказов, онлайн-бронирования, каталога товаров и прогрева базы без перехода на сторонние сайты.',
    targetNiches: ['Рестораны и доставка', 'Бьюти-сфера', 'Фитнес-клубы', 'E-commerce', 'Инфобизнес', 'Медицина', 'Сфера услуг', 'Автосервисы и детейлинг'],
    keyBenefits: [
      'Клиент покупает и бронирует прямо в Telegram в 2 клика',
      'Автоматические push-уведомления и рассылки по базе без блокировок',
      'Интеграция с Kaspi Pay, Halyk, онлайн-оплатой',
      'Снижение нагрузки на операторов до 70%',
    ],
    priceRange: { min: 35000, max: 95000, currency: 'KZT' },
    timelineWeeks: 1.5,
    deliverables: ['Сценарий диалогов', 'Telegram Mini App интерфейс', 'Интеграция с онлайн-оплатой Kaspi/карты', 'Синхронизация с CRM'],
  },
  {
    id: 'ai_sales_agent',
    name: 'AI-Ассистент & Автоматизация поддержки в WhatsApp (LLM 24/7)',
    category: 'AI_AUTOMATION',
    description: 'Умный AI-менеджер для WhatsApp, который мгновенно отвечает на вопросы клиентов, консультирует по услугам, закрывает возражения и передает горячие лиды.',
    targetNiches: ['B2B услуги', 'Недвижимость', 'Медицина', 'Образование', 'Автодилеры', 'Детейлинг', 'Юристы'],
    keyBenefits: [
      'Мгновенный ответ клиентам за 3 секунды даже ночью и в выходные',
      'Знает всю базу знаний компании и прайс-лист',
      'Не устает, не увольняется и квалифицирует лиды по BANT',
      'Экономия до 200 000 ₸/мес на штате операторов первой линии',
    ],
    priceRange: { min: 45000, max: 120000, currency: 'KZT' },
    timelineWeeks: 2,
    deliverables: ['База знаний компании', 'Промпт-инжиниринг и guardrails', 'Интеграция с WhatsApp/Telegram', 'CRM-уведомления'],
  },
  {
    id: 'custom_crm_system',
    name: 'Кастомная CRM / ERP и автоматизация учета заказов',
    category: 'CUSTOM_CRM',
    description: 'Индивидуальная система учета клиентов, заказов, склада и аналитики без ежемесячных оплат за облачные сервисы и под ваши уникальные регламенты.',
    targetNiches: ['Производство', 'Логистика', 'Строительство', 'B2B дистрибуция', 'Сетевой ритейл', 'Клиники', 'Автосервисы'],
    keyBenefits: [
      'Разработка строго под ваши регламенты и логику работы',
      'Отсутствие ежемесячных подписок за каждого пользователя',
      'Полная аналитика воронки продаж, финансов и KPI сотрудников',
      'Безопасное хранение данных на ваших серверах',
    ],
    priceRange: { min: 85000, max: 240000, currency: 'KZT' },
    timelineWeeks: 3,
    deliverables: ['Техническое задание', 'База данных PostgreSQL', 'Панель управления', 'Система ролей и прав', 'Обучение персонала'],
  },
  {
    id: 'mobile_crossplatform_app',
    name: 'Мобильное приложение для iOS и Android (React Native / Flutter)',
    category: 'MOBILE',
    description: 'Нативное мобильное приложение с личным кабинетом, программой лояльности, push-уведомлениями и онлайн-оплатой.',
    targetNiches: ['Фитнес', 'Доставка еды', 'Такси и логистика', 'B2C сервисы', 'Маркетплейсы'],
    keyBenefits: [
      'Единая кодовая база для iOS и Android',
      'Увеличение LTV клиентов через push-маркетинг',
      'Публикация в App Store и Google Play под ключ',
    ],
    priceRange: { min: 150000, max: 390000, currency: 'KZT' },
    timelineWeeks: 4,
    deliverables: ['UX/UI прототип', 'iOS & Android сборки', 'Backend API', 'Публикация в сторах'],
  },
];

export interface CopilotSuggestion {
  id: string;
  type: 'VALUE_PITCH' | 'DIAGNOSTIC_QUESTION' | 'OBJECTION_REBUTTAL' | 'PROPOSAL_SUMMARY' | 'CLOSING_CTA';
  title: string;
  text: string;
  rationale: string;
}

export interface AiDialogueContext {
  conversationId: string;
  leadId: string;
  leadName?: string | null;
  phone?: string | null;
  niche?: string | null;
  city?: string | null;
  website?: string | null;
  currentStage: AiStage;
  leadScore?: number;
  grade?: LeadGrade;
  recommendedService?: RecommendedService;
  diagnosedGaps?: string[];
  bant?: {
    budget?: string | null;
    authority?: string | null;
    need?: string | null;
    timeline?: string | null;
  };
  facts?: Array<{ key: string; value: string; category: string }>;
  messages: Array<{
    direction: 'INBOUND' | 'OUTBOUND';
    body: string;
    recordedAt: Date;
  }>;
}

export interface ProposalGenerationResult {
  title: string;
  serviceType: string;
  summary: string;
  scope: string[];
  deliverables: string[];
  timelineWeeks: number;
  priceEstimateMin: number;
  priceEstimateMax: number;
  currency: string;
  formattedMarkdown: string;
}
