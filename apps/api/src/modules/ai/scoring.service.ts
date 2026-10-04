import { prisma } from '@nexora/database';
import type {
  LeadGrade,
  RecommendedService,
  UrgencyLevel,
  BudgetTier,
  ScoringCategory,
  ScoringFactorItem,
  ScoringBreakdown,
  LeadScoreResult,
  LeadScoreRequest,
} from '@nexora/types';
import { analyzeLeadDigitalFootprint } from './analyzer.service';
import { performAiBusinessAnalysis } from './business-analyzer.service';
import { logger } from '../../common/logger';
import { emitToUser } from '../../common/realtime/socket';

/**
 * High-value and high-margin B2B niches
 */
const HIGH_VALUE_NICHES = [
  'стоматолог', 'клиник', 'медицин', 'ресторан', 'кафе', 'доставка',
  'автосервис', 'детейлинг', 'недвижим', 'застройщик', 'риелтор',
  'юрист', 'адвокат', 'салон', 'барбершоп', 'фитнес', 'b2b', 'производств',
  'косметол', 'ecommerce', 'опт',
];

const RETAINER_NICHES = [
  'клиник', 'стоматолог', 'ресторан', 'доставка', 'салон', 'фитнес',
  'ecommerce', 'автосервис', 'b2b',
];

/**
 * AI Lead Scoring Engine
 * Deterministic multi-factor scoring (1–100) across 12 transparent criteria.
 */
export class LeadScoringEngine {
  /**
   * Evaluate raw or stored Lead and produce an explainable score with breakdown.
   */
  static async evaluateScore(
    userId: string,
    input: LeadScoreRequest,
  ): Promise<LeadScoreResult> {
    let lead: any = null;
    let analysis: any = null;
    let conversation: any = null;
    let messages: any[] = [];

    if (input.leadId) {
      lead = await prisma.lead.findUnique({
        where: { id: input.leadId },
        include: {
          analysis: true,
          conversations: {
            include: {
              messages: { take: 10, orderBy: { recordedAt: 'desc' } },
            },
          },
        },
      });

      if (lead) {
        analysis = lead.analysis;
        conversation = lead.conversations?.[0];
        messages = conversation?.messages || [];
      }
    }

    // Merge raw input with DB lead if available
    const companyName = input.companyName || lead?.companyName || 'Организация';
    const niche = (input.niche || lead?.niche || '').toLowerCase();
    const city = input.city || lead?.city || '';
    const website = input.website !== undefined ? input.website : (lead?.website || null);
    const phone = input.phone || lead?.phone || null;
    const email = input.email || lead?.email || null;
    const instagram = input.instagram || lead?.instagramUrl || null;
    const telegram = input.telegram || lead?.telegram || null;
    const businessSize = input.businessSize || lead?.businessSize || 'SMALL';
    const isDecisionMaker = input.isDecisionMaker !== undefined ? input.isDecisionMaker : lead?.isDecisionMaker;
    const position = (input.position || lead?.position || '').toLowerCase();

    // If no analysis exists, run quick business analyzer
    if (!analysis && (website || companyName)) {
      try {
        const report = await performAiBusinessAnalysis(userId, {
          companyName,
          website,
          instagram,
          city,
          niche,
        });
        analysis = {
          foundProblems: report.problems.map((p) => p.problem),
          digitalMaturity: report.digitalMaturity,
          websiteStatus: website ? 'ACTIVE' : 'NO_WEBSITE',
          isMobileFriendly: report.currentDigitalState.mobile.status === 'OPTIMAL',
          hasOnlineBooking: report.currentDigitalState.onlineBooking.status === 'OPTIMAL',
          pageLoadSpeedMs: 1200,
          detectedGaps: report.problems.map((p) => p.problem),
        };
      } catch {
        analysis = null;
      }
    }

    // -------------------------------------------------------------
    // 12-FACTOR DETERMINISTIC SCORING ENGINE
    // -------------------------------------------------------------
    const factors: ScoringFactorItem[] = [];
    const explanations: string[] = [];
    const painPoints: string[] = [];
    const techGaps: string[] = [];

    let totalRawScore = 0;

    // --- Factor 1: Наличие проблемы (Problem Presence, Max 20) ---
    let problemPoints = 0;
    const problemsList = (analysis?.foundProblems as string[]) || [];
    if (!website) {
      problemPoints = 20;
      factors.push({
        key: 'strong_website_opportunity',
        factor: 'Отсутствие собственного сайта',
        points: 20,
        category: 'problem',
        description: 'Компания не имеет сайта и теряет поисковый трафик',
        evidence: 'Сайт отсутствует или не указан в профиле',
      });
      explanations.push('strong website opportunity: +20');
      painPoints.push('Клиенты не могут найти услуги в поиске Google/Яндекс');
    } else if (problemsList.length >= 3) {
      problemPoints = 18;
      factors.push({
        key: 'multiple_bottlenecks',
        factor: 'Множественные цифровые узкие места',
        points: 18,
        category: 'problem',
        description: `Выявлено ${problemsList.length} операционных проблем`,
        evidence: problemsList.slice(0, 2).join('; '),
      });
      explanations.push(`multiple operational bottlenecks: +18`);
    } else if (problemsList.length >= 1) {
      problemPoints = 12;
      factors.push({
        key: 'identified_problems',
        factor: 'Выявленные точки потери заявок',
        points: 12,
        category: 'problem',
        description: 'Обнаружены пробелы в цифровом пути клиента',
        evidence: problemsList[0] || 'Проблемы в конверсии',
      });
      explanations.push('identified operational issues: +12');
    } else {
      problemPoints = 4;
    }
    totalRawScore += problemPoints;

    // --- Factor 2: Серьёзность проблемы (Problem Severity, Max 15) ---
    let severityPoints = 0;
    if (analysis?.websiteStatus === 'ERROR' || analysis?.isMobileFriendly === false) {
      severityPoints = 15;
      factors.push({
        key: 'critical_digital_failure',
        factor: 'Критическая неисправность сайта / мобильной версии',
        points: 15,
        category: 'severity',
        description: 'Сайт недоступен либо ломается на смартфонах',
        evidence: 'Отсутствует мобильный viewport или сбой загрузки',
      });
      explanations.push('critical digital failure: +15');
      techGaps.push('Сайт не адаптирован для мобильных устройств');
    } else if (analysis?.hasOnlineBooking === false && (niche.includes('клиник') || niche.includes('стоматолог') || niche.includes('салон'))) {
      severityPoints = 12;
      factors.push({
        key: 'missing_online_booking',
        factor: 'Отсутствие системы онлайн-записи',
        points: 12,
        category: 'severity',
        description: 'Клиенты не могут записаться 24/7 и уходят',
        evidence: 'Виджет онлайн-записи отсутствует',
      });
      explanations.push('missing online booking: +12');
      painPoints.push('Потеря клиентов в нерабочие часы из-за отсутствия записи');
    } else if (analysis?.pageLoadSpeedMs && analysis.pageLoadSpeedMs > 3000) {
      severityPoints = 8;
      factors.push({
        key: 'slow_page_speed',
        factor: 'Медленная скорость загрузки (>3 сек)',
        points: 8,
        category: 'severity',
        description: 'Потеря посетителей из-за долгого отклика сервера',
        evidence: `Время ответа: ${analysis.pageLoadSpeedMs} мс`,
      });
      explanations.push('slow website speed: +8');
    } else {
      severityPoints = 4;
    }
    totalRawScore += severityPoints;

    // --- Factor 3: Потенциальная стоимость решения (Solution Value, Max 15) ---
    let solutionValuePoints = 0;
    if (businessSize === 'ENTERPRISE' || niche.includes('застройщик') || niche.includes('клиник')) {
      solutionValuePoints = 15;
      factors.push({
        key: 'enterprise_solution_value',
        factor: 'Высокий средний чек проекта (Enterprise)',
        points: 15,
        category: 'budget',
        description: 'Потенциал комплексного внедрения AI + CRM + Web',
        evidence: 'Масштабный бизнес с высокой стоимостью привлечения клиента',
      });
      explanations.push('high-ticket solution value: +15');
    } else if (businessSize === 'MEDIUM' || HIGH_VALUE_NICHES.some((h) => niche.includes(h))) {
      solutionValuePoints = 11;
      factors.push({
        key: 'mid_tier_solution_value',
        factor: 'Стандартный коммерческий чек (60к–150к ₽)',
        points: 11,
        category: 'budget',
        description: 'Разработка под ключ + Telegram Mini App',
        evidence: 'Устойчивая ниша со сформированным бюджетом',
      });
      explanations.push('mid-tier solution value: +11');
    } else {
      solutionValuePoints = 6;
      explanations.push('standard package value: +6');
    }
    totalRawScore += solutionValuePoints;

    // --- Factor 4: Соответствие услугам Nexora (Fit with Nexora, Max 20) ---
    let nexoraFitPoints = 0;
    let recommendedService: RecommendedService = 'WEB';

    if (!website && instagram) {
      nexoraFitPoints = 20;
      recommendedService = 'TELEGRAM_BOT';
      factors.push({
        key: 'automation_opportunity',
        factor: 'Идеальное соответствие: Telegram Mini App / Бот',
        points: 20,
        category: 'fit',
        description: 'Активный Instagram без веб-каталога — перевод трафика в Telegram',
        evidence: 'Наличие Instagram-аккаунта при отсутствии веб-витрины',
      });
      explanations.push('automation opportunity: +20');
    } else if (!website) {
      nexoraFitPoints = 20;
      recommendedService = 'WEB';
      factors.push({
        key: 'web_development_fit',
        factor: 'Идеальное соответствие: Веб-разработка под ключ',
        points: 20,
        category: 'fit',
        description: 'Создание сайта с конверсионной структурой и интеграцией CRM',
        evidence: 'Полное отсутствие сайта компании',
      });
      explanations.push('web development fit: +20');
    } else if (niche.includes('клиник') || niche.includes('стоматолог') || niche.includes('b2b') || niche.includes('юрист')) {
      nexoraFitPoints = 18;
      recommendedService = 'AI_AUTOMATION';
      factors.push({
        key: 'ai_sales_agent_fit',
        factor: 'Идеальное соответствие: AI Sales Agent & Квалификация',
        points: 18,
        category: 'fit',
        description: 'Внедрение AI-ассистента для обработки лидов 24/7 в WhatsApp/Telegram',
        evidence: 'Ниша с высоким объемом типовых консультаций и записей',
      });
      explanations.push('ai automation fit: +18');
    } else if (analysis?.isMobileFriendly === false || (analysis?.pageLoadSpeedMs && analysis.pageLoadSpeedMs > 3000)) {
      nexoraFitPoints = 16;
      recommendedService = 'REDESIGN';
      factors.push({
        key: 'redesign_fit',
        factor: 'Идеальное соответствие: Редизайн и оптимизация UX',
        points: 16,
        category: 'fit',
        description: 'Перевод устаревшего сайта на современный стек React/Next.js',
        evidence: 'Низкие технические метрики текущего сайта',
      });
      explanations.push('redesign fit: +16');
    } else {
      nexoraFitPoints = 12;
      recommendedService = 'INTEGRATION';
      explanations.push('system integration fit: +12');
    }
    totalRawScore += nexoraFitPoints;

    // --- Factor 5: Размер бизнеса (Business Size, Max 15) ---
    let businessSizePoints = 0;
    if (businessSize === 'ENTERPRISE') {
      businessSizePoints = 15;
      factors.push({
        key: 'enterprise_size',
        factor: 'Крупный бизнес (Enterprise)',
        points: 15,
        category: 'size',
        description: 'Федеральная или сетевая компания',
        evidence: 'Множество филиалов или крупный штат',
      });
      explanations.push('enterprise business size: +15');
    } else if (businessSize === 'MEDIUM') {
      businessSizePoints = 12;
      factors.push({
        key: 'medium_size',
        factor: 'Средний бизнес (Medium)',
        points: 12,
        category: 'size',
        description: 'Устойчивая компания с постоянным потоком клиентов',
        evidence: 'Штат от 10+ сотрудников',
      });
      explanations.push('medium business size: +12');
    } else if (businessSize === 'SMALL') {
      businessSizePoints = 8;
      factors.push({
        key: 'small_size',
        factor: 'Малый бизнес (Small)',
        points: 8,
        category: 'size',
        description: 'Локальная сервисная компания',
        evidence: '1-2 точки обслуживания',
      });
      explanations.push('small business size: +8');
    } else {
      businessSizePoints = 4;
      explanations.push('micro business size: +4');
    }
    totalRawScore += businessSizePoints;

    // --- Factor 6: Цифровая зрелость (Digital Maturity, Max 15) ---
    let maturityPoints = 0;
    const maturity = analysis?.digitalMaturity || 'LOW';
    if (maturity === 'LOW') {
      maturityPoints = 15;
      factors.push({
        key: 'low_digital_maturity',
        factor: 'Низкая цифровая зрелость (Высокий потенциал роста)',
        points: 15,
        category: 'maturity',
        description: 'Отсутствие базовой цифровизации дает максимальный ROI от внедрения',
        evidence: 'Digital Maturity: LOW',
      });
      explanations.push('low digital maturity (high upside): +15');
    } else if (maturity === 'MEDIUM') {
      maturityPoints = 11;
      factors.push({
        key: 'medium_digital_maturity',
        factor: 'Средняя зрелость (Готовность к автоматизации)',
        points: 11,
        category: 'maturity',
        description: 'Есть базовый сайт, нужны боты, AI и CRM',
        evidence: 'Digital Maturity: MEDIUM',
      });
      explanations.push('medium digital maturity: +11');
    } else {
      maturityPoints = 5;
      explanations.push('advanced digital maturity: +5');
    }
    totalRawScore += maturityPoints;

    // --- Factor 7: Косвенные признаки бюджета (Budget Indicators, Max 15) ---
    let budgetPoints = 0;
    const isHighMarginNiche = HIGH_VALUE_NICHES.some((n) => niche.includes(n));
    if (isHighMarginNiche && (city.toLowerCase().includes('москва') || city.toLowerCase().includes('алматы') || city.toLowerCase().includes('санкт') || city.toLowerCase().includes('dubai') || city.toLowerCase().includes('астана'))) {
      budgetPoints = 15;
      factors.push({
        key: 'active_business_high_volume',
        factor: 'Маржинальная ниша в платежеспособном мегаполисе',
        points: 15,
        category: 'budget_indicators',
        description: 'Высокая покупательская способность и готовность инвестировать в IT',
        evidence: `Город: ${city}, Ниша: ${niche}`,
      });
      explanations.push('active business high volume: +15');
    } else if (isHighMarginNiche) {
      budgetPoints = 10;
      factors.push({
        key: 'high_margin_niche',
        factor: 'Высокомаржинальная отрасль',
        points: 10,
        category: 'budget_indicators',
        description: 'Высокий LTV конечного клиента компании',
        evidence: `Ниша: ${niche}`,
      });
      explanations.push('high margin industry: +10');
    } else {
      budgetPoints = 5;
      explanations.push('standard budget indicators: +5');
    }
    totalRawScore += budgetPoints;

    // --- Factor 8: Срочность (Urgency, Max 12) ---
    let urgencyPoints = 0;
    let urgency: UrgencyLevel = 'MEDIUM';
    const lastMsgText = (messages[0]?.body || '').toLowerCase();

    if (lastMsgText.includes('срочно') || lastMsgText.includes('сегодня') || lastMsgText.includes('быстрее') || lastMsgText.includes('теряем')) {
      urgencyPoints = 12;
      urgency = 'HIGH';
      factors.push({
        key: 'high_urgency_intent',
        factor: 'Прямой маркер срочности в диалоге',
        points: 12,
        category: 'urgency',
        description: 'Клиент явно обозначил жесткие сроки или горящую потребность',
        evidence: `Сообщение: «${messages[0]?.body}»`,
      });
      explanations.push('high urgency detected: +12');
    } else if (isHighMarginNiche && !website) {
      urgencyPoints = 9;
      urgency = 'HIGH';
      factors.push({
        key: 'market_urgency',
        factor: 'Рыночная срочность (потеря клиентов конкурентам)',
        points: 9,
        category: 'urgency',
        description: 'В конкурентной нише отсутствие сайта ведет к ежедневным финансовым потерям',
        evidence: 'Ниша с высоким темпом конкуренции',
      });
      explanations.push('market urgency: +9');
    } else {
      urgencyPoints = 4;
      urgency = 'LOW';
      explanations.push('standard timeline: +4');
    }
    totalRawScore += urgencyPoints;

    // --- Factor 9: Наличие Decision Maker (Decision Maker, Max 12) ---
    let dmPoints = 0;
    if (isDecisionMaker || position.includes('директор') || position.includes('основатель') || position.includes('ceo') || position.includes('владелец') || position.includes('руководитель')) {
      dmPoints = 12;
      factors.push({
        key: 'direct_decision_maker',
        factor: 'Прямой контакт с лицом, принимающим решения (ЛПР)',
        points: 12,
        category: 'decision_maker',
        description: 'Диалог ведется с собственником или директором без посредников',
        evidence: position ? `Должность: ${position}` : 'Верифицированный статус ЛПР',
      });
      explanations.push('direct decision maker: +12');
    } else if (phone && phone.length >= 10) {
      dmPoints = 8;
      factors.push({
        key: 'direct_contact_available',
        factor: 'Доступен прямой мобильный номер / WhatsApp',
        points: 8,
        category: 'decision_maker',
        description: 'Возможность прямой связи в мессенджере',
        evidence: `Телефон: ${phone}`,
      });
      explanations.push('direct contact available: +8');
    } else {
      dmPoints = 2;
      explanations.push('general channel contact: +2');
    }
    totalRawScore += dmPoints;

    // --- Factor 10: Качество контактов (Contact Quality, Max 10) ---
    let contactPoints = 0;
    const channelCount = [phone, email, instagram, telegram].filter(Boolean).length;
    if (channelCount >= 3) {
      contactPoints = 10;
      factors.push({
        key: 'omnichannel_verified',
        factor: 'Омниканальный контакт (3+ проверенных канала)',
        points: 10,
        category: 'contacts',
        description: 'Доступны WhatsApp, почта и социальные сети',
        evidence: `${channelCount} активных канала связи`,
      });
      explanations.push('omnichannel verified contacts: +10');
    } else if (channelCount >= 2) {
      contactPoints = 7;
      factors.push({
        key: 'multi_channel_contacts',
        factor: 'Два подтвержденных канала связи',
        points: 7,
        category: 'contacts',
        description: 'Доступны телефон/WhatsApp и дополнительный контакт',
        evidence: `${channelCount} канала связи`,
      });
      explanations.push('multi-channel contacts: +7');
    } else {
      contactPoints = 3;
      explanations.push('single channel contact: +3');
    }
    totalRawScore += contactPoints;

    // --- Factor 11: Готовность к коммуникации (Communication Readiness, Max 15) ---
    let commPoints = 0;
    const convStatus = conversation?.status || lead?.status || 'NEW';
    if (convStatus === 'INTERESTED' || convStatus === 'NEGOTIATION') {
      commPoints = 15;
      factors.push({
        key: 'high_engagement',
        factor: 'Высокая вовлеченность и подтвержденный интерес',
        points: 15,
        category: 'communication',
        description: 'Клиент активно обсуждает условия или задает вопросы по решению',
        evidence: `Статус диалога: ${convStatus}`,
      });
      explanations.push('high communication engagement: +15');
    } else if (convStatus === 'REPLIED' || messages.length > 0) {
      commPoints = 11;
      factors.push({
        key: 'client_responsive',
        factor: 'Клиент отвечает на сообщения в мессенджере',
        points: 11,
        category: 'communication',
        description: 'Получен входящий ответ, диалог активен',
        evidence: `Сообщений в истории: ${messages.length}`,
      });
      explanations.push('client responsive: +11');
    } else {
      commPoints = 4;
      explanations.push('initial touch pending: +4');
    }
    totalRawScore += commPoints;

    // --- Factor 12: Вероятность повторных платежей (Recurring / LTV, Max 12) ---
    let recurringPoints = 0;
    if (RETAINER_NICHES.some((r) => niche.includes(r))) {
      recurringPoints = 12;
      factors.push({
        key: 'high_recurring_potential',
        factor: 'Высокий потенциал повторных платежей (LTV)',
        points: 12,
        category: 'recurring',
        description: 'Регулярная потребность в AI-поддержке, доработке ботов и контенте',
        evidence: `Ниша с высоким LTV: ${niche}`,
      });
      explanations.push('high recurring potential: +12');
    } else {
      recurringPoints = 5;
      explanations.push('standard one-off potential: +5');
    }
    totalRawScore += recurringPoints;

    // -------------------------------------------------------------
    // Normalization to 1 - 100
    // -------------------------------------------------------------
    // Maximum possible raw points sum: 20+15+15+20+15+15+15+12+12+10+15+12 = 176
    const normalizedScore = Math.min(Math.max(Math.round((totalRawScore / 176) * 100), 1), 99);

    // -------------------------------------------------------------
    // Categorization (Strictly aligned with requirements)
    // 1–30 = low, 31–60 = medium, 61–80 = high, 81–100 = hot
    // -------------------------------------------------------------
    let category: ScoringCategory = 'medium';
    let grade: LeadGrade = 'WARM';
    let budgetTier: BudgetTier = 'MEDIUM';

    if (normalizedScore >= 81) {
      category = 'hot';
      grade = 'HOT';
      budgetTier = 'HIGH';
    } else if (normalizedScore >= 61) {
      category = 'high';
      grade = 'WARM';
      budgetTier = 'MEDIUM';
    } else if (normalizedScore >= 31) {
      category = 'medium';
      grade = 'WARM';
      budgetTier = 'MEDIUM';
    } else {
      category = 'low';
      grade = 'UNQUALIFIED';
      budgetTier = 'LOW';
    }

    // -------------------------------------------------------------
    // Confidence Calculation (0.60 to 0.98 based on data density)
    // -------------------------------------------------------------
    let confidence = 0.65;
    if (analysis) confidence += 0.10;
    if (phone) confidence += 0.08;
    if (messages.length > 0) confidence += 0.08;
    if (isDecisionMaker) confidence += 0.05;
    if (website) confidence += 0.03;
    confidence = Math.min(Math.round(confidence * 100) / 100, 0.98);

    const scoreBreakdown: ScoringBreakdown = {
      problemPresence: problemPoints,
      problemSeverity: severityPoints,
      solutionValue: solutionValuePoints,
      nexoraFit: nexoraFitPoints,
      businessSize: businessSizePoints,
      digitalMaturity: maturityPoints,
      budgetIndicators: budgetPoints,
      urgency: urgencyPoints,
      decisionMaker: dmPoints,
      contactQuality: contactPoints,
      communicationReadiness: commPoints,
      recurringPotential: recurringPoints,
    };

    const result: LeadScoreResult = {
      leadId: input.leadId,
      score: normalizedScore,
      category,
      confidence,
      grade,
      recommendedService,
      urgency,
      estimatedBudgetTier: budgetTier,
      factors,
      explanations,
      scoreBreakdown,
      reasons: explanations.slice(0, 5),
      painPoints,
      techGaps,
      summary: `Score: ${normalizedScore} (${category.toUpperCase()}). Confidence: ${confidence}. Оффер: ${recommendedService}.`,
      scoredAt: new Date().toISOString(),
    };

    // -------------------------------------------------------------
    // Persist to CRM if leadId is present
    // -------------------------------------------------------------
    if (input.leadId) {
      await prisma.leadScore.upsert({
        where: { leadId: input.leadId },
        update: {
          score: normalizedScore,
          grade,
          category,
          confidence,
          recommendedService,
          urgency,
          estimatedBudgetTier: budgetTier,
          reasons: explanations as any,
          factors: factors as any,
          breakdown: scoreBreakdown as any,
          painPoints: painPoints as any,
          techGaps: techGaps as any,
          rawAnalysis: result as any,
          scoredAt: new Date(),
        },
        create: {
          leadId: input.leadId,
          score: normalizedScore,
          grade,
          category,
          confidence,
          recommendedService,
          urgency,
          estimatedBudgetTier: budgetTier,
          reasons: explanations as any,
          factors: factors as any,
          breakdown: scoreBreakdown as any,
          painPoints: painPoints as any,
          techGaps: techGaps as any,
          rawAnalysis: result as any,
          scoredAt: new Date(),
        },
      });

      // Update Lead Priority
      const priorityMap: Record<ScoringCategory, any> = {
        hot: 'URGENT',
        high: 'HIGH',
        medium: 'MEDIUM',
        low: 'LOW',
      };
      await prisma.lead.update({
        where: { id: input.leadId },
        data: { priority: priorityMap[category] },
      });

      // Create Timeline Event
      await prisma.timelineEvent.create({
        data: {
          userId,
          leadId: input.leadId,
          eventType: 'AI_SCORED',
          title: `Пересчет AI Score: ${normalizedScore}/100 [${category.toUpperCase()}]`,
          description: `Оценка уверенности: ${(confidence * 100).toFixed(0)}%. Рекомендованная услуга: ${recommendedService}.\nФакторы:\n${explanations.slice(0, 4).join('\n')}`,
          metadata: {
            score: normalizedScore,
            category,
            confidence,
            recommendedService,
          },
        },
      }).catch(() => {});

      // Broadcast update
      emitToUser(userId, 'lead.scored', {
        leadId: input.leadId,
        score: normalizedScore,
        category,
        confidence,
        recommendedService,
      });
    }

    return result;
  }

  /**
   * Recalculate score automatically upon incoming messages or data updates.
   */
  static async recalculateOnEvent(leadId: string, userId: string): Promise<LeadScoreResult | null> {
    try {
      logger.info('Auto-recalculating AI Lead Score on event', { leadId, userId });
      return await this.evaluateScore(userId, { leadId, forceRecalculate: true });
    } catch (err) {
      logger.warn('Failed to auto-recalculate lead score', { leadId, error: (err as Error).message });
      return null;
    }
  }
}

/**
 * Backward compatibility helper for existing references.
 */
export async function scoreLead(leadId: string): Promise<any> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error('Lead not found for scoring');
  return LeadScoringEngine.evaluateScore(lead.userId, { leadId });
}
