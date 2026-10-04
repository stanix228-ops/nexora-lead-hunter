import { prisma } from '@nexora/database';
import { logger } from '../../common/logger';
import { getAIProvider } from './ai.provider';
import { recordTimelineEvent, recordClientMemory } from '../crm/crm.service';
import { assertAiPermission } from '../../common/security/permissions';
import { assertSafeUrl } from '../../common/security/ssrf-guard';
import type {
  BusinessAnalysisRequest,
  BusinessAnalysisReport,
  DigitalStateAuditMap,
  DigitalAspectAudit,
  StructuredProblemItem,
  DigitalMaturity,
  AiAgentConfig,
} from '@nexora/types';

// In-memory Cache for fast re-requests (24 hours TTL)
interface CacheEntry {
  report: BusinessAnalysisReport;
  cachedAt: number;
}
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const memoryCache = new Map<string, CacheEntry>();

function getCacheKey(req: BusinessAnalysisRequest): string {
  const parts = [
    req.companyName.trim().toLowerCase(),
    (req.website || '').trim().toLowerCase(),
    (req.instagram || '').trim().toLowerCase(),
    (req.city || '').trim().toLowerCase(),
    (req.niche || '').trim().toLowerCase(),
  ];
  return parts.join('|');
}

/**
 * Main entrypoint for AI Business Analyzer
 */
export async function performAiBusinessAnalysis(
  userId: string,
  request: BusinessAnalysisRequest,
): Promise<BusinessAnalysisReport> {
  // Security check: Verify AI_ANALYZE permission
  await assertAiPermission(userId, 'AI_ANALYZE', `Business Analysis: ${request.companyName}`);

  const startTime = Date.now();
  const cacheKey = getCacheKey(request);

  // 1. Check in-memory Cache (if not forceReanalyze)
  if (!request.forceReanalyze) {
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      logger.info('Returning in-memory cached AI business analysis', { companyName: request.companyName });
      return {
        ...cached.report,
        meta: {
          ...cached.report.meta,
          cached: true,
          executionTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  // 2. Fetch AI Configuration for LLM
  const config = await prisma.aiAgentConfig.findUnique({ where: { userId } });
  const provider = getAIProvider(config as unknown as AiAgentConfig);

  // 3. Technical & Digital Asset Inspection (Web scraping, DOM heuristic, Speed check)
  const technicalInspection = await inspectDigitalAssets(request);

  // 4. Synthesize 20-Aspect Business Audit with AI Provider & strict reasoning
  const analysisReport = await synthesizeBusinessReport(
    request,
    technicalInspection,
    provider,
    config?.temperature ?? 0.3,
  );

  // 5. Store in In-Memory Cache
  memoryCache.set(cacheKey, {
    report: analysisReport,
    cachedAt: Date.now(),
  });

  // 6. If leadId is present or provided, persist in CRM database
  if (request.leadId) {
    await persistAnalysisInCrm(userId, request.leadId, analysisReport);
  }

  return analysisReport;
}

// ------------------------------------------------ Technical Assets Inspector
interface RawInspectionData {
  websiteStatus: 'ONLINE' | 'OFFLINE' | 'NO_WEBSITE' | 'ERROR';
  statusCode: number | null;
  pageLoadSpeedMs: number | null;
  htmlContent: string | null;
  techStack: string[];
  isMobileFriendly: boolean | null;
  hasCtaButtons: boolean;
  ctaTextSamples: string[];
  hasForms: boolean;
  hasClickablePhone: boolean;
  hasClickableEmail: boolean;
  hasWhatsAppLink: boolean;
  hasTelegramLink: boolean;
  hasOnlineBooking: boolean;
  bookingSystemName: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  hasH1: boolean;
  hasExplicitBrokenLinks: boolean;
  instagramFound: boolean;
  instagramHandle: string | null;
}

async function inspectDigitalAssets(req: BusinessAnalysisRequest): Promise<RawInspectionData> {
  const result: RawInspectionData = {
    websiteStatus: 'NO_WEBSITE',
    statusCode: null,
    pageLoadSpeedMs: null,
    htmlContent: null,
    techStack: [],
    isMobileFriendly: null,
    hasCtaButtons: false,
    ctaTextSamples: [],
    hasForms: false,
    hasClickablePhone: false,
    hasClickableEmail: false,
    hasWhatsAppLink: false,
    hasTelegramLink: false,
    hasOnlineBooking: false,
    bookingSystemName: null,
    seoTitle: null,
    seoDescription: null,
    hasH1: false,
    hasExplicitBrokenLinks: false,
    instagramFound: false,
    instagramHandle: null,
  };

  // Inspect Instagram URL
  if (req.instagram) {
    result.instagramFound = true;
    const match = req.instagram.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
    result.instagramHandle = match && match[1] ? match[1] : req.instagram.replace('@', '');
  }

  // Inspect Website
  let siteUrl = req.website?.trim() || null;
  if (siteUrl && !siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
    siteUrl = `https://${siteUrl}`;
  }

  if (!siteUrl) {
    result.websiteStatus = 'NO_WEBSITE';
    return result;
  }

  // SSRF Protection: Validate target URL is not pointing to private/internal IPs
  try {
    assertSafeUrl(siteUrl);
  } catch (err) {
    logger.warn('SSRF Guard blocked unsafe website analysis URL', { siteUrl, error: (err as Error).message });
    result.websiteStatus = 'OFFLINE';
    return result;
  }

  try {
    const fetchStart = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const res = await fetch(siteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeoutId);

    result.pageLoadSpeedMs = Date.now() - fetchStart;
    result.statusCode = res.status;

    if (res.ok) {
      result.websiteStatus = 'ONLINE';
      const html = await res.text();
      result.htmlContent = html.slice(0, 50000); // Sample for prompt analysis
      const lower = html.toLowerCase();

      // CMS & Stack detection
      if (lower.includes('tilda') || lower.includes('tildacdn')) result.techStack.push('Tilda Publishing');
      if (lower.includes('wp-content') || lower.includes('wordpress')) result.techStack.push('WordPress');
      if (lower.includes('bitrix')) result.techStack.push('1C-Bitrix');
      if (lower.includes('react') || lower.includes('_next') || lower.includes('next.js')) result.techStack.push('React / Next.js');
      if (lower.includes('wix.com')) result.techStack.push('Wix');
      if (lower.includes('shopify')) result.techStack.push('Shopify');
      if (lower.includes('webflow')) result.techStack.push('Webflow');
      if (result.techStack.length === 0) result.techStack.push('Custom HTML/JS');

      // Mobile viewport
      result.isMobileFriendly = lower.includes('name="viewport"') || lower.includes("name='viewport'");

      // CTA detection
      result.hasCtaButtons = lower.includes('<button') || lower.includes('class="btn') || lower.includes("class='btn");
      const ctaMatches = html.match(
        /(записаться|купить|оставить заявку|заказать|получить консультацию|рассчитать|подробнее|связаться|забронировать)/gi,
      );
      if (ctaMatches) {
        result.ctaTextSamples = Array.from(new Set(ctaMatches)).slice(0, 5);
      }

      // Forms detection
      result.hasForms = lower.includes('<form') || lower.includes('input type="text"') || lower.includes('input type="tel"');

      // Contacts detection
      result.hasClickablePhone = lower.includes('href="tel:') || lower.includes("href='tel:");
      result.hasClickableEmail = lower.includes('href="mailto:') || lower.includes("href='mailto:");

      // WhatsApp / Telegram
      result.hasWhatsAppLink = lower.includes('wa.me') || lower.includes('api.whatsapp.com') || lower.includes('whatsapp');
      result.hasTelegramLink = lower.includes('t.me') || lower.includes('telegram.me') || lower.includes('telegram');

      // Online Booking systems
      if (lower.includes('yclients.com') || lower.includes('yclients')) {
        result.hasOnlineBooking = true;
        result.bookingSystemName = 'YClients';
      } else if (lower.includes('dikidi.net') || lower.includes('dikidi')) {
        result.hasOnlineBooking = true;
        result.bookingSystemName = 'Dikidi';
      } else if (lower.includes('easyweek.io') || lower.includes('easyweek')) {
        result.hasOnlineBooking = true;
        result.bookingSystemName = 'EasyWeek';
      } else if (lower.includes('онлайн-запись') || lower.includes('записаться онлайн')) {
        result.hasOnlineBooking = true;
        result.bookingSystemName = 'Кастомная форма записи';
      }

      // SEO basics
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      result.seoTitle = titleMatch && titleMatch[1] ? titleMatch[1].trim() : null;

      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      result.seoDescription = descMatch && descMatch[1] ? descMatch[1].trim() : null;

      result.hasH1 = lower.includes('<h1');
    } else {
      result.websiteStatus = 'ERROR';
    }
  } catch {
    result.websiteStatus = 'OFFLINE';
  }

  return result;
}

// ------------------------------------------------ Synthesis & Reasoning with LLM Provider
async function synthesizeBusinessReport(
  req: BusinessAnalysisRequest,
  tech: RawInspectionData,
  provider: ReturnType<typeof getAIProvider>,
  temperature: number,
): Promise<BusinessAnalysisReport> {
  const startTime = Date.now();

  const promptPayload = {
    company: {
      name: req.companyName,
      niche: req.niche || 'Бизнес / Услуги',
      city: req.city || 'Не указан',
      websiteUrl: req.website || null,
      instagram: req.instagram || null,
      reviews: req.reviews || null,
      additionalInfo: req.availableInfo || null,
    },
    technicalInspection: {
      websiteStatus: tech.websiteStatus,
      httpStatusCode: tech.statusCode,
      speedMs: tech.pageLoadSpeedMs,
      techStack: tech.techStack,
      isMobileFriendly: tech.isMobileFriendly,
      hasCtaButtons: tech.hasCtaButtons,
      ctaSamples: tech.ctaTextSamples,
      hasForms: tech.hasForms,
      hasClickablePhone: tech.hasClickablePhone,
      hasClickableEmail: tech.hasClickableEmail,
      hasWhatsAppLink: tech.hasWhatsAppLink,
      hasTelegramLink: tech.hasTelegramLink,
      hasOnlineBooking: tech.hasOnlineBooking,
      bookingSystem: tech.bookingSystemName,
      seoTitle: tech.seoTitle,
      seoDescription: tech.seoDescription,
      hasH1: tech.hasH1,
    },
  };

  const systemPrompt = `Ты — ведущий AI Business Analyst и IT Solution Architect агентства цифровой трансформации Nexora.
Твоя задача: провести глубокий, объективный и структурированный аудит бизнеса на основе предоставленных данных.

СТРОГИЕ ПРАВИЛА:
1. НЕ ПРИДУМЫВАЙ ФАКТЫ. Опирайся только на предоставленные факты и технический скрапинг.
2. ЕСЛИ ДАННЫХ НЕДОСТАТОЧНО по какому-либо параметру (например, нет отзывов или нет сайта) — ОБЯЗАТЕЛЬНО пиши "insufficient_data" в поле status/evidence, а не пытайся выдумывать.
3. ЧЕТКО РАЗГРАНИЧИВАЙ:
   - FACT: подтвержденный факт (например, сайт открывается за 3200мс, нет ссылки на WhatsApp, стек Tilda).
   - HYPOTHESIS: обоснованная гипотеза (например, «вероятно, администраторы тратят до 2 часов в день на подтверждение записей вручную»).
   - ESTIMATE: оценочный расчет потерь или потенциала (например, «оценочно теряется до 20-30% трафика из-за отсутствия мобильной адаптации»).

ТЫ ДОЛЖЕН ПРОАНАЛИЗИРОВАТЬ РОВНО 20 АСПЕКТОВ:
1. website (доступность, статус, CMS)
2. mobile (мобильная адаптивность)
3. structure (структура и ясность оффера)
4. ux (пользовательский опыт)
5. design (визуальный стиль и доверие)
6. cta (призывы к действию)
7. forms (формы заявок)
8. contacts (контактные данные)
9. whatsapp (связь в WhatsApp)
10. telegram (связь в Telegram / бот)
11. onlineBooking (онлайн-запись)
12. speed (скорость загрузки)
13. seo (поисковая оптимизация)
14. explicitIssues (явные технические проблемы)
15. instagram (соцсеть Instagram)
16. reviews (отзывы клиентов — если нет, то "insufficient_data")
17. competitors (конкурентное окружение в нише/городе)
18. customerJourney (клиентский путь)
19. manualProcesses (ручные процессы)
20. automationOpportunities (возможности автоматизации)

ФОРМАТ ОТВЕТА (ТОЛЬКО ЧИСТЫЙ JSON БЕЗ MARKDOWN РАЗМЕТКИ):
{
  "businessSummary": "Краткое экспертное резюме бизнеса, его масштаба и позиционирования",
  "digitalMaturity": "LOW" | "MEDIUM" | "HIGH" | "ADVANCED",
  "currentDigitalState": {
    "website": { "status": "OPTIMAL"|"SUBOPTIMAL"|"CRITICAL"|"insufficient_data", "evidence": "строка с фактом", "details": "пояснение", "score": 0-100 },
    "mobile": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "structure": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "ux": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "design": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "cta": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "forms": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "contacts": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "whatsapp": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "telegram": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "onlineBooking": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "speed": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "seo": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "explicitIssues": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "instagram": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "reviews": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "competitors": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "customerJourney": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "manualProcesses": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 },
    "automationOpportunities": { "status": "...", "evidence": "...", "details": "...", "score": 0-100 }
  },
  "problems": [
    {
      "problem": "Суть проблемы",
      "evidence": "Фактическое подтверждение (улика)",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "business_impact": "Влияние на бизнес и продажи",
      "estimated_loss": "Оценка потерь (в % или рублях)",
      "possible_solution": "Решение от Nexora",
      "confidence": 0.0-1.0,
      "classification": "FACT" | "HYPOTHESIS" | "ESTIMATE"
    }
  ],
  "opportunities": ["Точка роста 1", "Точка роста 2"],
  "automationOpportunities": ["Сценарий автоматизации 1", "Сценарий автоматизации 2"],
  "competitorObservations": ["Наблюдение по конкурентам 1", "Наблюдение 2"],
  "potentialSolutions": [
    {
      "solution": "Название IT-решения Nexora",
      "impact": "Ожидаемый бизнес-эффект",
      "timelineWeeks": 2,
      "priceEstimate": "от 50 000 до 120 000 руб."
    }
  ],
  "confidence": 0.92,
  "confidenceReason": "Обоснование уровня уверенности",
  "recommendedNextStep": "Конкретный рекомендуемый шаг для менеджера продаж Nexora"
}`;

  const userPrompt = `Проведи полный AI аудит компании на основе входных данных:\n${JSON.stringify(promptPayload, null, 2)}`;

  try {
    const rawAiOutput = await provider.generateText(userPrompt, systemPrompt, { temperature });
    const cleanJson = cleanJsonString(rawAiOutput);
    const parsed = JSON.parse(cleanJson);

    return {
      businessSummary: parsed.businessSummary || `${req.companyName} — анализ завершен.`,
      digitalMaturity: (parsed.digitalMaturity as DigitalMaturity) || calculateMaturity(parsed.currentDigitalState),
      currentDigitalState: parsed.currentDigitalState || buildFallbackDigitalState(tech, req),
      problems: Array.isArray(parsed.problems) ? parsed.problems : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      automationOpportunities: Array.isArray(parsed.automationOpportunities) ? parsed.automationOpportunities : [],
      competitorObservations: Array.isArray(parsed.competitorObservations) ? parsed.competitorObservations : [],
      potentialSolutions: Array.isArray(parsed.potentialSolutions) ? parsed.potentialSolutions : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      confidenceReason: parsed.confidenceReason || 'Анализ сформирован на основе технического аудита и отраслевых метрик.',
      recommendedNextStep: parsed.recommendedNextStep || 'Подготовить индивидуальное коммерческое предложение Nexora.',
      meta: {
        analyzedAt: new Date().toISOString(),
        cached: false,
        executionTimeMs: Date.now() - startTime,
        provider: provider.name,
      },
    };
  } catch (error) {
    logger.warn('LLM structured analysis failed, falling back to deterministic analyzer engine', {
      error: String(error),
    });
    return buildDeterministicReport(req, tech, startTime);
  }
}

// ------------------------------------------------ Deterministic Fallback Builder
function buildDeterministicReport(
  req: BusinessAnalysisRequest,
  tech: RawInspectionData,
  startTime: number,
): BusinessAnalysisReport {
  const problems: StructuredProblemItem[] = [];
  const opportunities: string[] = [];
  const automation: string[] = [];
  const competitors: string[] = [];

  const digitalState = buildFallbackDigitalState(tech, req);

  if (tech.websiteStatus === 'NO_WEBSITE') {
    problems.push({
      problem: 'Полное отсутствие собственного сайта и веб-визитки',
      evidence: 'Сайт не указан или домен не зарегистрирован',
      severity: 'CRITICAL',
      business_impact: 'Потеря до 60% потенциальных клиентов из поиска и рекламы, отсутствие доверия',
      estimated_loss: 'до 40-50% недополученной выручки',
      possible_solution: 'Разработка быстрого конверсионного сайта на Next.js под ключ',
      confidence: 0.98,
      classification: 'FACT',
    });
    opportunities.push('Запуск современного сайта на Next.js с мгновенной онлайн-оплатой и каталогом');
  } else if (tech.websiteStatus === 'OFFLINE' || tech.websiteStatus === 'ERROR') {
    problems.push({
      problem: 'Сайт компании недоступен или выдает техническую ошибку соединения',
      evidence: `Попытка обращения к ${req.website || 'домену'} завершилась сбоем (статус: ${tech.websiteStatus})`,
      severity: 'CRITICAL',
      business_impact: 'Посетители натыкаются на ошибку и сразу уходят к конкурентам',
      estimated_loss: 'до 100% цифрового входящего трафика',
      possible_solution: 'Перенос на современный отказоустойчивый стек Next.js 15 с CDN и SSL',
      confidence: 0.99,
      classification: 'FACT',
    });
    opportunities.push('Развертывание современного веб-сайта на отказоустойчивой инфраструктуре Nexora');
  } else if (tech.websiteStatus === 'ONLINE') {
    if (tech.pageLoadSpeedMs && tech.pageLoadSpeedMs > 2500) {
      problems.push({
        problem: `Медленная скорость загрузки сайта (${(tech.pageLoadSpeedMs / 1000).toFixed(1)} сек)`,
        evidence: `Время ответа сервера составило ${tech.pageLoadSpeedMs} мс`,
        severity: 'HIGH',
        business_impact: 'Пользователи закрывают вкладку не дождавшись загрузки, рост отказов (Bounce Rate)',
        estimated_loss: 'до 25% упущенных визитов',
        possible_solution: 'Оптимизация ассетов, переход на современный SSR/SSG стек Nexora',
        confidence: 0.95,
        classification: 'FACT',
      });
    }

    if (!tech.hasWhatsAppLink) {
      problems.push({
        problem: 'Отсутствует прямая кнопка связи в WhatsApp на сайте',
        evidence: 'В коде страницы не найдены ссылки wa.me или api.whatsapp.com',
        severity: 'MEDIUM',
        business_impact: 'Клиенты не могут задать быстрый вопрос в привычном мессенджере',
        estimated_loss: 'до 15-20% теплых лидов',
        possible_solution: 'Интеграция виджета Nexora WhatsApp с автоматическим AI-консультантом',
        confidence: 0.92,
        classification: 'FACT',
      });
    }

    if (!tech.hasOnlineBooking && (req.niche?.toLowerCase().includes('клиник') || req.niche?.toLowerCase().includes('салон') || req.niche?.toLowerCase().includes('услуг'))) {
      problems.push({
        problem: 'Отсутствие системы онлайн-записи (пациенты/клиенты должны звонить)',
        evidence: 'Не найдены виджеты YClients/Dikidi или интерактивное расписание',
        severity: 'HIGH',
        business_impact: 'В нерабочие часы и выходные заявки не фиксируются и уходят конкурентам',
        estimated_loss: 'до 30% записей в вечернее и ночное время',
        possible_solution: 'Внедрение модуля онлайн-записи и Telegram Mini App с авто-напоминаниями',
        confidence: 0.9,
        classification: 'HYPOTHESIS',
      });
    }
  }

  automation.push('Внедрение автономного AI Sales Agent для квалификации и консультации 24/7 в WhatsApp');
  automation.push('Автоматическая синхронизация заявок с CRM и оповещение менеджеров');

  if (req.niche) {
    competitors.push(`В нише «${req.niche}» (${req.city || 'РФ'}) до 45% конкурентов уже используют мессенджер-маркетинг`);
  }

  return {
    businessSummary: `${req.companyName} (${req.niche || 'Бизнес'}). Город: ${req.city || 'Не указан'}. Проведен базовый цифровой аудит.`,
    digitalMaturity: calculateMaturity(digitalState),
    currentDigitalState: digitalState,
    problems,
    opportunities,
    automationOpportunities: automation,
    competitorObservations: competitors,
    potentialSolutions: [
      {
        solution: 'Пакет «Цифровой отдел продаж Nexora»',
        impact: 'Рост конверсии входящих лидов на 25-40% за счет мгновенного AI-ответа в WhatsApp',
        timelineWeeks: 2,
        priceEstimate: 'от 65 000 до 140 000 руб.',
      },
    ],
    confidence: 0.88,
    confidenceReason: 'Оценка построена на прямом сканировании цифровых активов компании.',
    recommendedNextStep: 'Связаться в WhatsApp с кратким аудитом выявленных точек роста.',
    meta: {
      analyzedAt: new Date().toISOString(),
      cached: false,
      executionTimeMs: Date.now() - startTime,
      provider: 'Deterministic Engine',
    },
  };
}

function buildFallbackDigitalState(tech: RawInspectionData, req: BusinessAnalysisRequest): DigitalStateAuditMap {
  const hasSite = tech.websiteStatus === 'ONLINE';

  return {
    website: {
      status: hasSite ? 'OPTIMAL' : tech.websiteStatus === 'NO_WEBSITE' ? 'CRITICAL' : 'SUBOPTIMAL',
      evidence: hasSite ? `Сайт доступен. Стек: ${tech.techStack.join(', ') || 'Custom'}` : 'Сайт отсутствует или недоступен',
      details: hasSite ? 'Ресурс отвечает на HTTP запросы' : 'Клиенты не могут найти услуги на собственном сайте',
      score: hasSite ? 80 : 0,
    },
    mobile: {
      status: tech.isMobileFriendly ? 'OPTIMAL' : hasSite ? 'CRITICAL' : 'insufficient_data',
      evidence: tech.isMobileFriendly ? 'Тег viewport найден' : hasSite ? 'Тег viewport отсутствует' : 'insufficient_data',
      details: tech.isMobileFriendly ? 'Адаптивный дизайн для смартфонов' : 'Не оптимизировано для мобильных',
      score: tech.isMobileFriendly ? 85 : 20,
    },
    structure: {
      status: hasSite ? 'SUBOPTIMAL' : 'insufficient_data',
      evidence: hasSite ? 'Стандартная одностраничная или многостраничная структура' : 'insufficient_data',
      details: hasSite ? 'Требуется проверка логики Customer Journey' : 'Недостаточно данных',
      score: hasSite ? 60 : 0,
    },
    ux: {
      status: hasSite ? 'SUBOPTIMAL' : 'insufficient_data',
      evidence: hasSite ? (tech.hasCtaButtons ? 'Кнопки действий присутствуют' : 'Мало заметных CTA') : 'insufficient_data',
      details: 'Удобство взаимодействия и читаемость цен',
      score: hasSite ? 65 : 0,
    },
    design: {
      status: hasSite ? 'SUBOPTIMAL' : 'insufficient_data',
      evidence: hasSite ? `Платформа: ${tech.techStack[0] || 'Web'}` : 'insufficient_data',
      details: 'Визуальный авторитет и доверие',
      score: hasSite ? 70 : 0,
    },
    cta: {
      status: tech.hasCtaButtons ? 'OPTIMAL' : hasSite ? 'CRITICAL' : 'insufficient_data',
      evidence: tech.ctaTextSamples.length > 0 ? `Примеры: ${tech.ctaTextSamples.join(', ')}` : 'CTA не обнаружены',
      details: 'Призывы к целевому действию',
      score: tech.hasCtaButtons ? 80 : 25,
    },
    forms: {
      status: tech.hasForms ? 'OPTIMAL' : 'SUBOPTIMAL',
      evidence: tech.hasForms ? 'Формы ввода заявок найдены' : 'Формы не обнаружены',
      details: 'Простота отправки контактов',
      score: tech.hasForms ? 75 : 30,
    },
    contacts: {
      status: tech.hasClickablePhone ? 'OPTIMAL' : 'SUBOPTIMAL',
      evidence: tech.hasClickablePhone ? 'Кликабельный tel: протокол активен' : 'Телефон не кликабелен',
      details: 'Доступность контактов',
      score: tech.hasClickablePhone ? 90 : 40,
    },
    whatsapp: {
      status: tech.hasWhatsAppLink ? 'OPTIMAL' : 'CRITICAL',
      evidence: tech.hasWhatsAppLink ? 'Прямой переход в WhatsApp настроен' : 'Ссылка на WhatsApp отсутствует',
      details: 'Канал коммуникации WhatsApp',
      score: tech.hasWhatsAppLink ? 95 : 10,
    },
    telegram: {
      status: tech.hasTelegramLink ? 'OPTIMAL' : 'SUBOPTIMAL',
      evidence: tech.hasTelegramLink ? 'Telegram канал / ссылка обнаружены' : 'Telegram не подключен',
      details: 'Канал Telegram',
      score: tech.hasTelegramLink ? 85 : 30,
    },
    onlineBooking: {
      status: tech.hasOnlineBooking ? 'OPTIMAL' : 'CRITICAL',
      evidence: tech.hasOnlineBooking ? `Подключено: ${tech.bookingSystemName}` : 'Онлайн-запись отсутствует',
      details: 'Система бронирования / записи',
      score: tech.hasOnlineBooking ? 95 : 20,
    },
    speed: {
      status: tech.pageLoadSpeedMs && tech.pageLoadSpeedMs < 1500 ? 'OPTIMAL' : tech.pageLoadSpeedMs ? 'CRITICAL' : 'insufficient_data',
      evidence: tech.pageLoadSpeedMs ? `${tech.pageLoadSpeedMs} мс` : 'insufficient_data',
      details: 'Скорость отклика сервера',
      score: tech.pageLoadSpeedMs && tech.pageLoadSpeedMs < 1500 ? 90 : 40,
    },
    seo: {
      status: tech.seoTitle && tech.seoDescription ? 'OPTIMAL' : 'SUBOPTIMAL',
      evidence: tech.seoTitle ? `Title: ${tech.seoTitle.slice(0, 40)}...` : 'Meta теги не заполнены',
      details: 'Поисковая оптимизация',
      score: tech.seoTitle ? 70 : 30,
    },
    explicitIssues: {
      status: tech.websiteStatus === 'ONLINE' ? 'OPTIMAL' : 'CRITICAL',
      evidence: tech.websiteStatus === 'ONLINE' ? 'Критических сбоев HTTP не выявлено' : `Статус: ${tech.websiteStatus}`,
      details: 'Явные технические проблемы',
      score: tech.websiteStatus === 'ONLINE' ? 90 : 10,
    },
    instagram: {
      status: tech.instagramFound ? 'OPTIMAL' : 'insufficient_data',
      evidence: tech.instagramFound ? `@${tech.instagramHandle}` : 'insufficient_data',
      details: 'Instagram профиль',
      score: tech.instagramFound ? 80 : 0,
    },
    reviews: {
      status: req.reviews ? 'OPTIMAL' : 'insufficient_data',
      evidence: req.reviews ? 'Отзывы предоставлены для анализа' : 'insufficient_data',
      details: 'Анализ репутации и отзывов клиентов',
      score: req.reviews ? 85 : 0,
    },
    competitors: {
      status: 'SUBOPTIMAL',
      evidence: `Оценка конкурентов по нише ${req.niche || '—'} в городе ${req.city || 'РФ'}`,
      details: 'Конкурентное окружение',
      score: 60,
    },
    customerJourney: {
      status: tech.hasWhatsAppLink && tech.hasOnlineBooking ? 'OPTIMAL' : 'SUBOPTIMAL',
      evidence: 'Оценка удобства пути от первого визита до оформления',
      details: 'Customer Journey',
      score: tech.hasWhatsAppLink && tech.hasOnlineBooking ? 85 : 45,
    },
    manualProcesses: {
      status: !tech.hasOnlineBooking || !tech.hasWhatsAppLink ? 'CRITICAL' : 'SUBOPTIMAL',
      evidence: 'Высокая доля ручной обработки заявок операторами/администраторами',
      details: 'Ручные операции',
      score: !tech.hasOnlineBooking ? 30 : 70,
    },
    automationOpportunities: {
      status: 'OPTIMAL',
      evidence: 'Высокий потенциал внедрения Nexora AI Sales Agent и автоворонки',
      details: 'Точки автоматизации',
      score: 95,
    },
  };
}

function calculateMaturity(state: DigitalStateAuditMap): DigitalMaturity {
  const scores = Object.values(state).map((v) => v.score ?? 50);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (avg >= 80) return 'ADVANCED';
  if (avg >= 60) return 'HIGH';
  if (avg >= 40) return 'MEDIUM';
  return 'LOW';
}

function cleanJsonString(str: string): string {
  let clean = str.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return clean.trim();
}

// ------------------------------------------------ CRM Persistence Helper
async function persistAnalysisInCrm(
  userId: string,
  leadId: string,
  report: BusinessAnalysisReport,
) {
  try {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, userId } });
    if (!lead) return;

    // 1. Update BusinessAnalysis
    const problemsText = report.problems.map((p) => `${p.problem} (${p.severity}): ${p.possible_solution}`);
    await prisma.businessAnalysis.upsert({
      where: { leadId },
      update: {
        description: report.businessSummary,
        foundProblems: problemsText as any,
        foundOpportunities: report.opportunities as any,
        digitalMaturity: report.digitalMaturity,
        automationPoints: report.automationOpportunities as any,
        competitors: report.competitorObservations as any,
        summary: report.businessSummary,
        analyzedAt: new Date(),
      },
      create: {
        leadId,
        description: report.businessSummary,
        foundProblems: problemsText as any,
        foundOpportunities: report.opportunities as any,
        digitalMaturity: report.digitalMaturity,
        automationPoints: report.automationOpportunities as any,
        competitors: report.competitorObservations as any,
        summary: report.businessSummary,
        analyzedAt: new Date(),
      },
    });

    // 2. Add Timeline Event
    await recordTimelineEvent({
      userId,
      leadId,
      eventType: 'AI_ANALYZED',
      title: `AI Business Analyzer: аудит бизнеса «${lead.companyName || lead.contactName || 'Клиент'}»`,
      description: `Зрелость: ${report.digitalMaturity}. Проблем выявлено: ${report.problems.length}. Шаг: ${report.recommendedNextStep}`,
      metadata: {
        digitalMaturity: report.digitalMaturity,
        confidence: report.confidence,
        problemsCount: report.problems.length,
      },
    });

    // 3. Save key facts in 8-Layer Memory (BUSINESS_FACT, OBJECTION)
    for (const prob of report.problems.slice(0, 3)) {
      await recordClientMemory({
        leadId,
        layer: 'BUSINESS_FACT',
        key: `Узкое место: ${prob.problem.slice(0, 40)}`,
        value: `${prob.business_impact} [${prob.classification}]`,
        confidence: prob.confidence,
        source: 'AI',
        userId,
      });
    }

    if (report.automationOpportunities.length > 0) {
      await recordClientMemory({
        leadId,
        layer: 'BUSINESS_FACT',
        key: 'Точка автоматизации',
        value: report.automationOpportunities[0]!,
        confidence: 0.95,
        source: 'AI',
        userId,
      });
    }
  } catch (err) {
    logger.warn('Failed to persist AI Business Analysis into CRM database', { error: String(err) });
  }
}
