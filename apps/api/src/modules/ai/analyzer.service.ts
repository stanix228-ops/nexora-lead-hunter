import { prisma } from '@nexora/database';
import { logger } from '../../common/logger';
import type { BusinessAnalysis } from '@nexora/types';

export interface RawWebAnalysis {
  websiteUrl: string | null;
  websiteStatus: 'ONLINE' | 'OFFLINE' | 'NO_WEBSITE' | 'ERROR';
  pageLoadSpeedMs: number | null;
  isMobileFriendly: boolean;
  techStack: string[];
  hasOnlineBooking: boolean;
  hasEcommerce: boolean;
  hasChatWidget: boolean;
  seoScore: number;
  detectedGaps: string[];
  instagramHandle: string | null;
  instagramBio: string | null;
  instagramFollowers: number | null;
  summary: string;
}

/**
 * Perform digital footprint and web analysis on a given Lead.
 */
export async function analyzeLeadDigitalFootprint(leadId: string): Promise<BusinessAnalysis> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { analysis: true },
  });

  if (!lead) {
    throw new Error('Lead not found for analysis.');
  }

  const raw = await inspectLeadWebsiteAndSocial(lead);

  const analysis = await prisma.businessAnalysis.upsert({
    where: { leadId },
    update: {
      websiteUrl: raw.websiteUrl,
      websiteStatus: raw.websiteStatus,
      pageLoadSpeedMs: raw.pageLoadSpeedMs,
      isMobileFriendly: raw.isMobileFriendly,
      techStack: raw.techStack,
      hasOnlineBooking: raw.hasOnlineBooking,
      hasEcommerce: raw.hasEcommerce,
      hasChatWidget: raw.hasChatWidget,
      seoScore: raw.seoScore,
      detectedGaps: raw.detectedGaps,
      instagramHandle: raw.instagramHandle,
      instagramBio: raw.instagramBio,
      instagramFollowers: raw.instagramFollowers,
      summary: raw.summary,
      analyzedAt: new Date(),
    },
    create: {
      leadId,
      websiteUrl: raw.websiteUrl,
      websiteStatus: raw.websiteStatus,
      pageLoadSpeedMs: raw.pageLoadSpeedMs,
      isMobileFriendly: raw.isMobileFriendly,
      techStack: raw.techStack,
      hasOnlineBooking: raw.hasOnlineBooking,
      hasEcommerce: raw.hasEcommerce,
      hasChatWidget: raw.hasChatWidget,
      seoScore: raw.seoScore,
      detectedGaps: raw.detectedGaps,
      instagramHandle: raw.instagramHandle,
      instagramBio: raw.instagramBio,
      instagramFollowers: raw.instagramFollowers,
      summary: raw.summary,
      analyzedAt: new Date(),
    },
  });

  return analysis as unknown as BusinessAnalysis;
}

async function inspectLeadWebsiteAndSocial(lead: {
  website?: string | null;
  instagramUrl?: string | null;
  companyName?: string | null;
  niche?: string | null;
  city?: string | null;
}): Promise<RawWebAnalysis> {
  const gaps: string[] = [];
  const techStack: string[] = [];
  let websiteStatus: 'ONLINE' | 'OFFLINE' | 'NO_WEBSITE' | 'ERROR' = 'NO_WEBSITE';
  let pageLoadSpeedMs: number | null = null;
  let isMobileFriendly = false;
  let hasOnlineBooking = false;
  let hasEcommerce = false;
  let hasChatWidget = false;
  let seoScore = 30;

  let siteUrl = lead.website?.trim() || null;
  if (siteUrl && !siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
    siteUrl = `https://${siteUrl}`;
  }

  let instagramHandle: string | null = null;
  if (lead.instagramUrl) {
    const match = lead.instagramUrl.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
    if (match && match[1]) {
      instagramHandle = match[1];
    }
  }

  if (!siteUrl) {
    websiteStatus = 'NO_WEBSITE';
    gaps.push('Отсутствует собственный сайт (потеря до 60% поискового и рекламного трафика)');
    gaps.push('Нет удобного каталога / прайс-листа для клиентов в интернете');
    if (!lead.instagramUrl) {
      gaps.push('Слабое цифровое присутствие в сети (только карточка на картах)');
    }
  } else {
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(siteUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timeoutId);

      pageLoadSpeedMs = Date.now() - startTime;

      if (res.ok) {
        websiteStatus = 'ONLINE';
        const html = await res.text();
        const lowerHtml = html.toLowerCase();

        // Check tech stack & CMS
        if (lowerHtml.includes('tilda') || lowerHtml.includes('tildacdn')) techStack.push('Tilda');
        if (lowerHtml.includes('wp-content') || lowerHtml.includes('wordpress')) techStack.push('WordPress');
        if (lowerHtml.includes('bitrix')) techStack.push('1C-Bitrix');
        if (lowerHtml.includes('react') || lowerHtml.includes('_next') || lowerHtml.includes('next.js')) techStack.push('React/Next.js');
        if (lowerHtml.includes('wix')) techStack.push('Wix');
        if (lowerHtml.includes('shopify')) techStack.push('Shopify');
        if (lowerHtml.includes('webflow')) techStack.push('Webflow');
        if (techStack.length === 0) techStack.push('Custom / HTML');

        // Check mobile viewport
        isMobileFriendly = lowerHtml.includes('name="viewport"') || lowerHtml.includes("name='viewport'");
        if (!isMobileFriendly) {
          gaps.push('Сайт не оптимизирован под мобильные устройства');
        }

        // Check load speed
        if (pageLoadSpeedMs > 2500) {
          gaps.push(`Медленная скорость загрузки сайта (${(pageLoadSpeedMs / 1000).toFixed(1)} сек, норма < 1.0 сек)`);
        }

        // Check online booking
        hasOnlineBooking =
          lowerHtml.includes('yclients') ||
          lowerHtml.includes('dikidi') ||
          lowerHtml.includes('easyweek') ||
          lowerHtml.includes('booking') ||
          lowerHtml.includes('онлайн-запись') ||
          lowerHtml.includes('записаться онлайн');
        if (!hasOnlineBooking && (lead.niche?.toLowerCase().includes('салон') || lead.niche?.toLowerCase().includes('клиник') || lead.niche?.toLowerCase().includes('услуг'))) {
          gaps.push('Нет системы мгновенной онлайн-записи (клиенты вынуждены звонить)');
        }

        // Check E-commerce
        hasEcommerce = lowerHtml.includes('cart') || lowerHtml.includes('корзина') || lowerHtml.includes('checkout') || lowerHtml.includes('купить');

        // Check Chat / Messengers
        hasChatWidget =
          lowerHtml.includes('jivo') ||
          lowerHtml.includes('chatra') ||
          lowerHtml.includes('wa.me') ||
          lowerHtml.includes('t.me') ||
          lowerHtml.includes('whatsapp') ||
          lowerHtml.includes('telegram');
        if (!hasChatWidget) {
          gaps.push('Нет виджета мгновенной связи в WhatsApp / Telegram на сайте');
        }

        // SEO scoring heuristic
        let score = 50;
        if (lowerHtml.includes('<h1')) score += 15;
        if (lowerHtml.includes('name="description"')) score += 15;
        if (isMobileFriendly) score += 10;
        if (pageLoadSpeedMs < 1500) score += 10;
        seoScore = Math.min(score, 100);

        if (seoScore < 60) {
          gaps.push('Базовые SEO-теги отсутствуют или не оптимизированы для поисковиков');
        }
      } else {
        websiteStatus = 'ERROR';
        gaps.push(`Сайт возвращает ошибку HTTP ${res.status}`);
      }
    } catch {
      websiteStatus = 'OFFLINE';
      gaps.push('Сайт недоступен или долго не отвечает');
    }
  }

  if (instagramHandle && !siteUrl) {
    gaps.push('Трафик из Instagram не перенаправляется в автоматизированную воронку или Telegram-бота');
  }

  const summary = generateAnalysisSummary(lead.companyName || 'Компания', lead.niche || 'Бизнес', gaps, techStack, websiteStatus);

  return {
    websiteUrl: siteUrl,
    websiteStatus,
    pageLoadSpeedMs,
    isMobileFriendly,
    techStack,
    hasOnlineBooking,
    hasEcommerce,
    hasChatWidget,
    seoScore,
    detectedGaps: gaps,
    instagramHandle,
    instagramBio: lead.instagramUrl ? 'Instagram аккаунт найден' : null,
    instagramFollowers: null,
    summary,
  };
}

function generateAnalysisSummary(
  name: string,
  niche: string,
  gaps: string[],
  techStack: string[],
  status: string,
): string {
  if (status === 'NO_WEBSITE') {
    return `${name} (${niche}) работает без собственного веб-ресурса. Основной контакт через карты и телефон. Высокий потенциал для внедрения продающего Next.js сайта или Telegram Mini App для онлайн-продаж.`;
  }
  if (status === 'OFFLINE' || status === 'ERROR') {
    return `Сайт компании ${name} в данный момент недоступен. Клиенты теряются при попытке перехода из поиска. Требуется срочный аудит и модернизация.`;
  }
  const stack = techStack.length > 0 ? techStack.join(', ') : 'Не определен';
  return `Цифровой аудит ${name} (${niche}): Стек [${stack}]. Выявлено ${gaps.length} ключевых точек роста для автоматизации и повышения конверсии заявок.`;
}
