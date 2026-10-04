import { prisma } from '@nexora/database';
import type { LeadSource, LeadPriority, LeadGrade, RecommendedService, UrgencyLevel, BudgetTier } from '@nexora/types';
import type {
  LeadHunterJob,
  LeadHunterRequest,
  DiscoveredLeadRaw,
  HunterDiscoverySource,
  LeadHunterStats,
} from '@nexora/types';
import { normalizePhone, buildWaLink, maskPhone } from '@nexora/utils';
import { logger } from '../../common/logger';
import { SOURCE_ADAPTERS, applyRateLimitDelay } from './hunter-sources';
import { performAiBusinessAnalysis } from '../ai/business-analyzer.service';
import { emitToUser } from '../../common/realtime/socket';
import { NotFoundError, AppError } from '../../common/errors';

/**
 * Extract clean domain name from URL.
 */
export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const raw = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(raw);
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export interface HunterProcessResult {
  discovered: number;
  saved: number;
  duplicates: number;
  rejected: number;
  leads: any[];
}

/**
 * Generates an individualized, conversational, non-templated WhatsApp outreach message
 * based on lead business niche, city, audit signals, and varying conversational hooks.
 */
export function generatePersonalizedOutreachMessage(
  lead: {
    id?: string;
    companyName?: string | null;
    city?: string | null;
    niche?: string | null;
    website?: string | null;
    analysis?: any;
    score?: any;
  },
  jobCity?: string,
): string {
  const company = (lead.companyName || 'Организация').replace(/^(ТОО|ИП|АО|ООО)\s+/i, '').trim();
  const city = lead.city || jobCity || '';
  const nicheRaw = (lead.niche || '').toLowerCase();
  const analysisPains = Array.isArray(lead.analysis?.foundProblems)
    ? (lead.analysis?.foundProblems as string[])
    : [];

  // Deterministic seed from lead ID or name to vary opening hook
  const seedStr = lead.id || company;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const hookIndex = Math.abs(hash) % 4;

  // Detect niche category
  const isMed = /стоматолог|клиник|мед|врач|зуб|доктор|dental|clinic/i.test(nicheRaw) || /стоматолог|клиника/i.test(company);
  const isAuto = !isMed && (/авто|детейл|мойк|шин|repair|detailing|автосервис|(\bсто\b)/i.test(nicheRaw) || /авто/i.test(company));
  const isBeauty = /красот|салон|барбер|стрижк|ногт|маникюр|спа|волос|lashes|hair|barber/i.test(nicheRaw) || /салон|barber/i.test(company);
  const isFood = /ресторан|кафе|доставк|пицц|суши|бургер|еда|кофе|кухн|food|cafe/i.test(nicheRaw);
  const isBuild = /ремонт|строит|мебел|дизайн|окн|потол|отделк|стройка/i.test(nicheRaw);
  const isFitness = /фитнес|спорт|трен|зал|йога|fitness|gym/i.test(nicheRaw);

  let nicheValueProp = '';
  if (isAuto) {
    nicheValueProp = 'настроить Telegram-бота и WhatsApp-ассистента со свободными окнами на подъемник/услугу: клиент выбирает время сам за 30 секунд, а вам сразу падает готовая бронь';
  } else if (isBeauty) {
    nicheValueProp = 'подключить удобную онлайн-запись к мастерам в WhatsApp/Telegram: клиент видит свободные окна 24/7, плюс автоматически уходят напоминания, чтобы исключить неявки';
  } else if (isMed) {
    nicheValueProp = 'настроить быструю запись на первичный прием и авто-ответы на вопросы о стоимости и врачах в WhatsApp 24/7 без нагрузки на регистратуру';
  } else if (isFood) {
    nicheValueProp = 'запустить Telegram Mini App с электронным меню и приемом заказов через Kaspi без высоких комиссий агрегаторам доставки';
  } else if (isBuild) {
    nicheValueProp = 'внедрить интерактивный расчет стоимости (квиз) в WhatsApp: клиент отвечает на 3 вопроса о задаче, а вам сразу падает готовая заявка с контактами';
  } else if (isFitness) {
    nicheValueProp = 'запустить бота с расписанием и быстрой записью на пробную тренировку, чтобы не терять заявки из рекламы и 2GIS';
  } else {
    nicheValueProp = 'подключить умного ассистента в WhatsApp и Telegram-бота для онлайн-записи, который отвечает клиентам за 3 секунды даже ночью и доводит их до визита';
  }

  // Audit pain hook
  let specificPain = '';
  if (analysisPains.length > 0) {
    specificPain = analysisPains[0];
  } else if (!lead.website) {
    specificPain = 'отсутствие современной страницы онлайн-записи и мобильного интерфейса';
  } else {
    specificPain = 'ручная обработка заявок, из-за которой часть клиентов уходит к конкурентам в нерабочие часы';
  }

  // 4 varied natural opening templates
  switch (hookIndex) {
    case 0:
      return `Добрый день! Обратили внимание на «${company}»${city ? ` в г. ${city}` : ''}.\n\nЗаметили хорошую базу клиентов, но увидели точку роста: сейчас можно терять до 30% обращений из-за того, что ${specificPain.toLowerCase()}.\n\nМы в Nexora можем ${nicheValueProp}. Запуск занимает всего 3–5 дней (стоимость от 35 000 ₸). Подскажите, актуально сейчас увеличить поток клиентов?`;

    case 1:
      return `Здравствуйте! Изучили ваш профиль «${company}» в открытых источниках${city ? ` (${city})` : ''}.\n\nПо опыту работы с бизнесом в вашей сфере, до 40% клиентов пишут вечером или в выходные, когда администраторы не успевают ответить сразу. Мы помогаем решить это под ключ: ${nicheValueProp}.\n\nСтоимость очень доступная — от 35 000 ₸, окупается буквально с 1-2 клиентов. Удобно будет взглянуть на короткий пример для вашей сферы?`;

    case 2:
      return `Приветствую! Пишу вам по поводу онлайн-записи и приема клиентов в «${company}»${city ? ` (${city})` : ''}.\n\nМы в Nexora IT разработали решение для сферы ${lead.niche || 'услуг'}, которое позволяет ${nicheValueProp}.\n\nРешение быстрое, с гарантией, оплата делится 50/50 (от 35 000 ₸). Скажите, рассматриваете сейчас внедрение новых цифровых инструментов для бизнеса?`;

    case 3:
    default:
      return `Добрый день! Подскажите, пожалуйста, к кому в «${company}» можно обратиться по вопросу автоматизации приема заявок и онлайн-записи?\n\nМы разработали готовое решение для вашей сферы: ${nicheValueProp}. Исключает человеческий фактор и окупается за первую неделю (от 35 000 ₸).\n\nПодскажите, как сейчас клиенты к вам чаще записываются — звонят или пишут в мессенджеры?`;
  }
}

/**
 * Lead Hunter Service — Autonomous B2B Discovery & Enrichment Pipeline
 */
export class LeadHunterService {
  /**
   * Run full multi-source Lead Hunter pipeline for a given job.
   */
  static async runJob(
    jobId: string,
    onProgress?: (progress: { stage: string; discovered: number; processed: number; saved: number; duplicates: number }) => void,
  ): Promise<HunterProcessResult> {
    const job = await prisma.leadHunterJob.findUnique({
      where: { id: jobId },
      include: { user: { include: { aiConfig: true } } },
    });

    if (!job) {
      throw new Error(`LeadHunterJob ${jobId} not found`);
    }

    logger.info('Starting Lead Hunter Job execution', {
      jobId: job.id,
      name: job.name,
      niche: job.niche,
      city: job.city,
      targetCount: job.targetCount,
    });

    await prisma.leadHunterJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', currentStage: 'Поиск по источникам...' },
    });

    const sources = (job.sources as HunterDiscoverySource[]) || ['2GIS', 'GOOGLE'];
    const filters = (job.filters as any) || {};
    const rawDiscovered: DiscoveredLeadRaw[] = [];

    const logs: Array<{ timestamp: string; message: string; type?: 'info' | 'warn' | 'error' | 'success' }> = [];
    const addLog = async (message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') => {
      const logEntry = { timestamp: new Date().toISOString(), message, type };
      logs.push(logEntry);
      await prisma.leadHunterJob.update({
        where: { id: jobId },
        data: { logs: logs as any },
      }).catch(() => {});
    };

    await addLog(`🚀 Запуск поиска лидов: «${job.query}» в г. ${job.city} (цель: ${job.targetCount})`, 'info');

    // ==========================================
    // Phase 1: Multi-Source Discovery
    // ==========================================
    for (const src of sources) {
      const adapter = SOURCE_ADAPTERS[src];
      if (!adapter) {
        logger.warn(`Hunter adapter not found for source: ${src}`);
        continue;
      }

      await addLog(`📡 Сканирование источника ${src}...`, 'info');

      try {
        const discoveredFromSource = await adapter.discover({
          city: job.city,
          niche: job.niche,
          country: job.country || undefined,
          limit: Math.max(job.targetCount, 20),
          filters,
          onProgress: (msg) => {
            logger.debug(`[Hunter ${src}] ${msg}`);
          },
        });

        rawDiscovered.push(...discoveredFromSource);
        await addLog(`✅ Источник ${src}: найдено кандидатов — ${discoveredFromSource.length}`, 'success');

        await prisma.leadHunterJob.update({
          where: { id: jobId },
          data: {
            discoveredCount: rawDiscovered.length,
          },
        });

        onProgress?.({
          stage: `Поиск (${src})`,
          discovered: rawDiscovered.length,
          processed: 0,
          saved: 0,
          duplicates: 0,
        });

        // Anti-ban rate limit delay between sources
        await applyRateLimitDelay(1500, 3000);
      } catch (err) {
        await addLog(`⚠️ Ошибка при опросе ${src}: ${(err as Error).message}`, 'warn');
      }
    }

    await addLog(`🔎 Всего сырых кандидатов собрано: ${rawDiscovered.length}. Запуск 7-этапного конвейера обработки...`, 'info');

    // ==========================================
    // Phase 2-7: 7-Stage Lead Processing Pipeline
    // ==========================================
    let savedCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;
    let processedCount = 0;
    const savedLeads: any[] = [];

    const seenPhonesInBatch = new Set<string>();
    const seenDomainsInBatch = new Set<string>();
    const seenNamesInBatch = new Set<string>();

    for (const raw of rawDiscovered) {
      processedCount++;

      // Check if target count achieved
      if (savedCount >= job.targetCount) {
        await addLog(`🎯 Целевое количество лидов (${job.targetCount}) успешно достигнуто!`, 'success');
        break;
      }

      const companyName = (raw.name || 'Компания').trim();
      let rawPhone = raw.phone || '';
      if (!rawPhone && raw.whatsapp) {
        const waMatch = raw.whatsapp.match(/\d{7,15}/);
        if (waMatch) rawPhone = waMatch[0];
      }
      const digits = rawPhone ? normalizePhone(rawPhone) : null;
      const domain = extractDomain(raw.website);
      const nameKey = `${companyName.toLowerCase().replace(/[^a-zа-я0-9]/g, '')}|${(job.city || '').toLowerCase()}`;

      // ------------------------------------------
      // Stage 1: Deduplication Engine
      // ------------------------------------------
      if (digits && seenPhonesInBatch.has(digits)) {
        duplicateCount++;
        continue;
      }
      if (domain && seenDomainsInBatch.has(domain)) {
        duplicateCount++;
        continue;
      }
      if (seenNamesInBatch.has(nameKey)) {
        duplicateCount++;
        continue;
      }

      // Check against existing CRM Leads for this user
      let isDuplicateInCrm = false;
      if (digits) {
        const existingByPhone = await prisma.lead.findFirst({
          where: { userId: job.userId, phone: digits },
        });
        if (existingByPhone) isDuplicateInCrm = true;
      }
      if (!isDuplicateInCrm && domain) {
        const existingByDomain = await prisma.lead.findFirst({
          where: { userId: job.userId, website: { contains: domain, mode: 'insensitive' } },
        });
        if (existingByDomain) isDuplicateInCrm = true;
      }
      if (!isDuplicateInCrm && companyName.length > 3) {
        const existingByName = await prisma.lead.findFirst({
          where: {
            userId: job.userId,
            companyName: { equals: companyName, mode: 'insensitive' },
            city: { equals: job.city, mode: 'insensitive' },
          },
        });
        if (existingByName) isDuplicateInCrm = true;
      }

      if (isDuplicateInCrm) {
        duplicateCount++;
        logger.debug('Hunter: Skipping CRM duplicate', { companyName, digits, domain });
        continue;
      }

      if (digits) seenPhonesInBatch.add(digits);
      if (domain) seenDomainsInBatch.add(domain);
      seenNamesInBatch.add(nameKey);

      // ------------------------------------------
      // Stage 2 & 3: Liveness & Existence Verification
      // ------------------------------------------
      let isWebsiteAlive = false;
      let websiteLoadMs = 0;

      if (raw.website) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          const t0 = Date.now();
          const headResp = await fetch(raw.website.startsWith('http') ? raw.website : `https://${raw.website}`, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nexora/2.0' },
          });
          clearTimeout(timeout);
          websiteLoadMs = Date.now() - t0;
          isWebsiteAlive = headResp.ok || headResp.status < 400;
        } catch {
          isWebsiteAlive = false;
        }
      }

      // Filter: Website criteria check
      if (filters.websiteFilter === 'without_site' && (raw.website || isWebsiteAlive)) {
        rejectedCount++;
        continue;
      }
      if (filters.websiteFilter === 'with_site' && (!raw.website || !isWebsiteAlive)) {
        rejectedCount++;
        continue;
      }
      if (filters.hasInstagram && !raw.instagram) {
        rejectedCount++;
        continue;
      }

      // ------------------------------------------
      // Stage 4: 20-Aspect Business Analysis
      // ------------------------------------------
      const analysisReport = await performAiBusinessAnalysis(job.userId, {
        companyName,
        website: raw.website || null,
        instagram: raw.instagram || null,
        city: job.city,
        niche: job.niche,
        reviews: raw.reviewsCount ? [`Отзывов в справочнике: ${raw.reviewsCount}, рейтинг: ${raw.rating || 'N/A'}`] : null,
      });

      // Filter: Problematic site requirement
      if (filters.requireProblematicSite) {
        const hasCriticalProblems = analysisReport.problems.some(
          (p) => p.severity === 'CRITICAL' || p.severity === 'HIGH' || p.problem.toLowerCase().includes('сайт'),
        );
        if (!hasCriticalProblems && isWebsiteAlive && websiteLoadMs < 2000) {
          rejectedCount++;
          continue;
        }
      }

      // Filter: Automation need requirement
      if (filters.requireAutomationNeed) {
        const hasAutomationPoints = analysisReport.automationOpportunities && analysisReport.automationOpportunities.length > 0;
        const noBooking = analysisReport.currentDigitalState.onlineBooking.status !== 'OPTIMAL';
        if (!hasAutomationPoints && !noBooking) {
          rejectedCount++;
          continue;
        }
      }

      // ------------------------------------------
      // Stage 5: AI Scoring (0 - 100)
      // ------------------------------------------
      let calculatedScore = 50;
      const reasons: string[] = [];
      const painPoints: string[] = [];

      // Digital deficiencies (+30 pts)
      if (!raw.website) {
        calculatedScore += 25;
        reasons.push('Отсутствует сайт — требуется разработка веб-решения под ключ');
        painPoints.push('Клиенты не могут найти услуги в поиске');
      } else if (analysisReport.currentDigitalState.mobile.status === 'CRITICAL') {
        calculatedScore += 20;
        reasons.push('Сайт не адаптирован под смартфоны — потеря мобильного трафика');
      } else if (websiteLoadMs > 3000) {
        calculatedScore += 15;
        reasons.push(`Медленная скорость загрузки (${websiteLoadMs} мс)`);
      }

      // High value niche (+15 pts)
      const nicheLower = (job.niche || '').toLowerCase();
      if (['стоматолог', 'клиник', 'ресторан', 'кафе', 'авто', 'юрист', 'недвижим', 'салон', 'фитнес'].some((k) => nicheLower.includes(k))) {
        calculatedScore += 15;
        reasons.push('Высокомаржинальная ниша с активным спросом');
      }

      // Messenger readiness (+15 pts)
      if (digits && (raw.whatsapp || digits)) {
        calculatedScore += 10;
        reasons.push('Прямой доступ к ЛПР через WhatsApp');
      }
      if (raw.instagram && !raw.website) {
        calculatedScore += 10;
        reasons.push('Активный Instagram без онлайн-записи и веб-каталога');
      }

      calculatedScore = Math.min(Math.max(calculatedScore, 10), 98);

      if (calculatedScore < job.minScore) {
        rejectedCount++;
        logger.debug('Hunter: Lead rejected due to minScore threshold', { companyName, score: calculatedScore, minScore: job.minScore });
        continue;
      }

      // ------------------------------------------
      // Stage 6: Potential Service Prediction
      // ------------------------------------------
      let recommendedService: RecommendedService = 'WEB';
      if (!raw.website && raw.instagram) {
        recommendedService = 'TELEGRAM_BOT';
      } else if (!raw.website) {
        recommendedService = 'WEB';
      } else if (nicheLower.includes('клиник') || nicheLower.includes('стоматолог') || nicheLower.includes('b2b')) {
        recommendedService = 'AI_AUTOMATION';
      } else if (nicheLower.includes('ресторан') || nicheLower.includes('доставка') || nicheLower.includes('салон')) {
        recommendedService = 'TELEGRAM_BOT';
      } else if (analysisReport.currentDigitalState.mobile.status === 'CRITICAL' || websiteLoadMs > 3000) {
        recommendedService = 'REDESIGN';
      }

      let grade: LeadGrade = 'WARM';
      let priority: LeadPriority = 'MEDIUM';
      let urgency: UrgencyLevel = 'MEDIUM';
      let budgetTier: BudgetTier = 'MEDIUM';

      if (calculatedScore >= 80) {
        grade = 'HOT';
        priority = 'URGENT';
        urgency = 'HIGH';
        budgetTier = 'HIGH';
      } else if (calculatedScore >= 55) {
        grade = 'WARM';
        priority = 'HIGH';
        urgency = 'MEDIUM';
        budgetTier = 'MEDIUM';
      } else {
        grade = 'COLD';
        priority = 'LOW';
        urgency = 'LOW';
        budgetTier = 'LOW';
      }

      // ------------------------------------------
      // Stage 7: CRM Persistence & Memory Recording
      // ------------------------------------------
      const mappedSource: LeadSource = (
        raw.source === '2GIS' ? 'GIS_2' :
        raw.source === 'GOOGLE' ? 'GOOGLE_MAPS' :
        raw.source === 'INSTAGRAM' ? 'INSTAGRAM' :
        raw.source === 'TELEGRAM' ? 'TELEGRAM' :
        raw.source === 'LINKEDIN' ? 'LINKEDIN' :
        raw.source === 'EMAIL' ? 'EMAIL' : 'MANUAL'
      ) as LeadSource;

      const notesArr: string[] = [];
      if (raw.address) notesArr.push(`Адрес: ${raw.address}`);
      if (raw.rating) notesArr.push(`Рейтинг: ${raw.rating} (${raw.reviewsCount || 0} отзывов)`);
      if (raw.email) notesArr.push(`Email: ${raw.email}`);
      if (raw.telegram) notesArr.push(`Telegram: ${raw.telegram}`);
      if (raw.profileLink) notesArr.push(`Профиль: ${raw.profileLink}`);
      notesArr.push(`Источник обнаружения: ${raw.source} (Lead Hunter)`);

      const leadPhone = digits || `hunter_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      const createdLead = await prisma.lead.create({
        data: {
          userId: job.userId,
          companyName: companyName,
          phone: leadPhone,
          whatsappUrl: digits ? buildWaLink(digits) : (raw.whatsapp || null),
          instagramUrl: raw.instagram || null,
          telegram: raw.telegram || null,
          email: raw.email || null,
          website: raw.website || null,
          city: job.city,
          country: job.country || null,
          niche: job.niche,
          source: mappedSource,
          status: 'NEW',
          priority,
          hunterJobId: job.id,
          searchQuery: job.query,
          discoveredAt: new Date(),
          notes: notesArr.join('\n'),
        },
      });

      // Save Business Analysis
      await prisma.businessAnalysis.create({
        data: {
          leadId: createdLead.id,
          description: analysisReport.businessSummary,
          services: analysisReport.potentialSolutions.map((s) => s.solution) as any,
          websiteUrl: raw.website || null,
          foundProblems: analysisReport.problems.map((p) => p.problem) as any,
          foundOpportunities: analysisReport.opportunities as any,
          digitalMaturity: analysisReport.digitalMaturity,
          automationPoints: analysisReport.automationOpportunities as any,
          websiteStatus: raw.website ? (isWebsiteAlive ? 'ACTIVE' : 'ERROR') : 'NO_WEBSITE',
          pageLoadSpeedMs: websiteLoadMs || null,
          isMobileFriendly: analysisReport.currentDigitalState.mobile.status === 'OPTIMAL',
          summary: analysisReport.businessSummary,
        },
      });

      // Save Lead Score
      await prisma.leadScore.create({
        data: {
          leadId: createdLead.id,
          score: calculatedScore,
          grade,
          recommendedService,
          urgency,
          estimatedBudgetTier: budgetTier,
          reasons: reasons as any,
          painPoints: (painPoints.length > 0 ? painPoints : analysisReport.problems.slice(0, 3).map((p) => p.problem)) as any,
          techGaps: analysisReport.problems.map((p) => `${p.problem} (${p.severity})`) as any,
          rawAnalysis: analysisReport as any,
        },
      });

      // Save Timeline Event
      await prisma.timelineEvent.create({
        data: {
          userId: job.userId,
          leadId: createdLead.id,
          eventType: 'LEAD_CREATED',
          title: `Лид найден через Lead Hunter (${raw.source})`,
          description: `Компания «${companyName}» обнаружена по запросу «${job.query}». AI Score: ${calculatedScore}/100 (${grade}). Рекомендовано: ${recommendedService}.`,
          metadata: {
            source: raw.source,
            score: calculatedScore,
            recommendedService,
            city: job.city,
          },
        },
      });

      // Record top facts to 8-layer ClientMemory
      const topProblems = analysisReport.problems.slice(0, 3);
      for (const prob of topProblems) {
        await prisma.clientMemory.create({
          data: {
            leadId: createdLead.id,
            layer: 'BUSINESS_FACT',
            key: prob.problem.slice(0, 60),
            value: `${prob.evidence} | Решение: ${prob.possible_solution}`,
            confidence: prob.confidence || 0.9,
            source: 'AI',
          },
        });
      }

      savedCount++;
      savedLeads.push({
        id: createdLead.id,
        companyName,
        phone: leadPhone,
        website: raw.website,
        score: calculatedScore,
        grade,
        recommendedService,
        source: raw.source,
      });

      await addLog(`⭐ Сохранен лид: «${companyName}» (Score: ${calculatedScore}, ${recommendedService})`, 'success');

      // Update progress in DB & notify UI
      await prisma.leadHunterJob.update({
        where: { id: jobId },
        data: {
          processedCount,
          savedCount,
          duplicateCount,
          rejectedCount,
          currentStage: `Обработка (${savedCount}/${job.targetCount})...`,
        },
      });

      onProgress?.({
        stage: `Анализ и сохранение (${savedCount}/${job.targetCount})`,
        discovered: rawDiscovered.length,
        processed: processedCount,
        saved: savedCount,
        duplicates: duplicateCount,
      });

      // Pacing delay between processing
      await applyRateLimitDelay(300, 800);
    }

    // ==========================================
    // Phase 8: Finalize Job & Safe Outreach Handling
    // ==========================================
    await prisma.leadHunterJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        currentStage: 'Поиск и обработка завершены',
        completedAt: new Date(),
        processedCount,
        savedCount,
        duplicateCount,
        rejectedCount,
      },
    });

    await addLog(
      `🎉 Поиск завершен! Найдено: ${rawDiscovered.length}, Сохранено в CRM: ${savedCount}, Дубликатов: ${duplicateCount}, Отсеяно: ${rejectedCount}`,
      'success',
    );

    // Auto-Outreach check
    if (job.autoOutreach && savedCount > 0) {
      await addLog(`⚡ Автоматический Outreach включен. Начинаем отправку персонализированных сообщений в WhatsApp...`, 'info');
      try {
        const outreachRes = await this.sendWhatsAppOutreachForJob(jobId, job.userId);
        await addLog(`💬 [WhatsApp Outreach] Успешно отправлено: ${outreachRes.sentCount} сообщений в WhatsApp! Пропущено: ${outreachRes.skippedCount}`, 'success');
      } catch (outreachErr: any) {
        await addLog(`⚠️ Ошибка автоматического Outreach в WhatsApp: ${outreachErr.message}`, 'warn');
      }
    } else {
      await addLog(`🛡 Авто-отправка отключена. Лиды готовы к отправке по кнопке «Написать всем в WhatsApp».`, 'info');
    }

    return {
      discovered: rawDiscovered.length,
      saved: savedCount,
      duplicates: duplicateCount,
      rejected: rejectedCount,
      leads: savedLeads,
    };
  }

  /**
   * Send personalized WhatsApp outreach to leads discovered in a job.
   */
  static async sendWhatsAppOutreachForJob(
    jobId: string,
    userId: string,
    limit = 200,
  ): Promise<{
    totalLeads: number;
    sentCount: number;
    skippedCount: number;
    failedCount: number;
    errors: string[];
  }> {
    const job = await prisma.leadHunterJob.findFirst({
      where: { id: jobId, userId },
      include: {
        leads: {
          where: { status: 'NEW' },
          include: { analysis: true, score: true, conversations: true },
          take: limit,
        },
      },
    });

    if (!job) throw new NotFoundError('Задача Lead Hunter не найдена');

    // Find active WhatsApp account
    const waAccount = await prisma.whatsAppAccount.findFirst({
      where: { userId, status: 'ONLINE' },
    });

    if (!waAccount) {
      throw new AppError(400, 'Нет активного подключенного аккаунта WhatsApp. Подключите аккаунт через QR-код в разделе «Аккаунты WhatsApp».', 'NO_ONLINE_WA_ACCOUNT');
    }

    const { sendWaText } = await import('../wa/wa.manager');
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const lead of job.leads) {
      // Must have valid phone digits
      const digits = (lead.phone || '').replace(/\D/g, '');
      if (digits.length < 10 || lead.phone?.startsWith('hunter_')) {
        skippedCount++;
        continue;
      }

      // Check if conversation already exists
      if (lead.conversations && lead.conversations.length > 0) {
        skippedCount++;
        continue;
      }

      const company = lead.companyName || 'Организация';
      const city = lead.city || job.city || '';

      // Compose individual tailored first touch using dynamic niche engine
      const text = generatePersonalizedOutreachMessage(lead, city);

      try {
        // 1. Send via WhatsApp
        let opId: string | null = null;
        try {
          const res = await sendWaText(waAccount.id, digits, text);
          opId = res.opId;
        } catch (waErr: any) {
          logger.warn(`Failed to send real WA message to ${digits}: ${waErr.message}`);
          if (waErr.message === 'WA_SESSION_NOT_CONNECTED') {
            errors.push(`Сессия WhatsApp не активна. Переподключите аккаунт.`);
            break;
          }
          failedCount++;
          errors.push(`Ошибка отправки на ${lead.companyName || digits}: ${waErr.message}`);
          continue;
        }

        // 2. Create conversation in DB
        const conv = await prisma.conversation.create({
          data: {
            userId,
            leadId: lead.id,
            accountId: waAccount.id,
            channel: 'WHATSAPP',
            status: 'NEW',
            lastMessagePreview: text.slice(0, 100),
            lastMessageAt: new Date(),
            aiState: {
              create: {
                stage: 'CONTACTED',
                isAiPaused: false,
              },
            },
          },
        });

        // 3. Create outbound message
        await prisma.message.create({
          data: {
            conversationId: conv.id,
            direction: 'OUTBOUND',
            body: text,
            opId,
            recordedAt: new Date(),
          },
        });

        // 4. Update lead status
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: 'CONTACTED' },
        });

        // 5. Timeline event
        await prisma.timelineEvent.create({
          data: {
            userId,
            leadId: lead.id,
            conversationId: conv.id,
            eventType: 'MESSAGE_SENT',
            title: `Отправлено первое сообщение в WhatsApp (+${digits})`,
            description: `AI Agent начал диалог с «${company}». Текст: ${text.slice(0, 100)}...`,
            metadata: { phone: digits, accountId: waAccount.id },
          },
        });

        sentCount++;
        emitToUser(userId, 'lead.updated', { id: lead.id, status: 'CONTACTED' });
        emitToUser(userId, 'conversation.created', conv);

        // Anti-ban pacing delay (2 - 3 seconds between messages)
        await new Promise((r) => setTimeout(r, 2500));
      } catch (err: any) {
        failedCount++;
        errors.push(`Ошибка отправки на ${lead.companyName}: ${err.message}`);
      }
    }

    return {
      totalLeads: job.leads.length,
      sentCount,
      skippedCount,
      failedCount,
      errors: errors.slice(0, 5),
    };
  }

  /**
   * Get aggregated Hunter statistics.
   */
  static async getStats(userId: string): Promise<LeadHunterStats> {
    const jobs = await prisma.leadHunterJob.findMany({
      where: { userId },
    });

    const totalJobs = jobs.length;
    const runningJobs = jobs.filter((j) => j.status === 'RUNNING').length;
    const totalDiscovered = jobs.reduce((acc, j) => acc + j.discoveredCount, 0);
    const totalSaved = jobs.reduce((acc, j) => acc + j.savedCount, 0);
    const totalDuplicates = jobs.reduce((acc, j) => acc + j.duplicateCount, 0);

    // Average AI score of discovered leads
    const scores = await prisma.leadScore.findMany({
      where: { lead: { userId, hunterJobId: { not: null } } },
      select: { score: true },
    });

    const avgAiScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length) : 75;

    // Counts by source
    const leadsBySource = await prisma.lead.groupBy({
      by: ['source'],
      where: { userId, hunterJobId: { not: null } },
      _count: { id: true },
    });

    const bySource: Record<string, number> = {};
    for (const item of leadsBySource) {
      bySource[item.source] = item._count.id;
    }

    return {
      totalJobs,
      runningJobs,
      totalDiscovered,
      totalSaved,
      totalDuplicates,
      avgAiScore,
      bySource,
    };
  }
}
