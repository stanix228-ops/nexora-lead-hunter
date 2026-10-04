import { execFile } from 'node:child_process';
import { logger } from '../../common/logger';
import { extractEmailsFromWebsite } from './email-extractor.service';
import type { FirmResult } from './scraper.service';

export interface YandexSearchOptions {
  websiteFilter?: 'all' | 'with_site' | 'without_site';
  phoneFilter?: 'all' | 'with_phone';
  whatsappFilter?: 'all' | 'with_wa';
  telegramFilter?: 'all' | 'with_tg';
}

export interface YandexScraperResult {
  city: string;
  niche: string;
  country: string;
  total: number;
  results: FirmResult[];
  url: string;
}

export type YandexProgressCallback = (msg: string | { type: 'result'; data: FirmResult }) => void;

/**
 * Clean tracking parameters from website URLs.
 */
function cleanWebsiteUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `https://${trimmed}`;
    }
    const u = new URL(trimmed);
    u.searchParams.delete('yclid');
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('utm_content');
    u.searchParams.delete('utm_term');
    u.searchParams.delete('_openstat');
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Normalize Russian phone numbers to clean digits and standard format.
 */
function normalizeRussianPhone(phoneStr: string): { raw: string; e164: string; formatted: string } | null {
  if (!phoneStr) return null;
  const digits = phoneStr.replace(/\D/g, '');

  let clean = digits;
  if (digits.length === 11) {
    if (digits.startsWith('8') || digits.startsWith('7')) {
      clean = '7' + digits.slice(1);
    }
  } else if (digits.length === 10) {
    clean = '7' + digits;
  } else if (digits.length < 7) {
    return null;
  }

  // Format Russian number: +7 (XXX) XXX-XX-XX
  let formatted = phoneStr;
  if (clean.length === 11 && clean.startsWith('7')) {
    const code = clean.slice(1, 4);
    const p1 = clean.slice(4, 7);
    const p2 = clean.slice(7, 9);
    const p3 = clean.slice(9, 11);
    formatted = `+7 (${code}) ${p1}-${p2}-${p3}`;
  }

  return {
    raw: phoneStr,
    e164: `+${clean}`,
    formatted,
  };
}

/**
 * Fetch HTML via native curl.exe with timeout and redirect following.
 */
function fetchYandexPage(url: string, timeoutSec = 20): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'curl.exe',
      [
        '-s',
        '-L',
        '--compressed',
        '--max-time',
        String(timeoutSec),
        '-A',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        url,
      ],
      { maxBuffer: 40 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout || '');
      },
    );
  });
}

/**
 * Scrape businesses from Yandex Maps (Яндекс Карты) for Russia and CIS.
 */
export async function scrapeYandexMaps(
  city: string,
  niche: string,
  targetLimit = 30,
  options: YandexSearchOptions = {},
  onProgress?: YandexProgressCallback,
): Promise<YandexScraperResult> {
  const searchQuery = `${niche.trim()} ${city.trim()}`;
  const baseUrl = `https://yandex.ru/maps/?text=${encodeURIComponent(searchQuery)}`;

  logger.info('Starting Yandex Maps scraper', { city, niche, targetLimit, baseUrl });
  onProgress?.(`Подключение к Яндекс Картам: поиск «${searchQuery}»...`);

  const results: FirmResult[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const maxPages = Math.min(Math.ceil(targetLimit / 20) + 2, 25);
  let currentPage = 1;
  let totalFoundInYandex = 0;

  while (results.length < targetLimit && currentPage <= maxPages) {
    const pageUrl = `${baseUrl}&page=${currentPage}`;
    logger.info(`Fetching Yandex Maps page ${currentPage}...`, { pageUrl });
    onProgress?.(`Сбор страницы ${currentPage} из Яндекс Карт (собрано: ${results.length} из ${targetLimit})...`);

    let html = '';
    try {
      html = await fetchYandexPage(pageUrl, 25);
    } catch (fetchErr: any) {
      logger.warn(`Failed to fetch page ${currentPage} from Yandex Maps: ${fetchErr.message}`);
      break;
    }

    if (!html || html.length < 5000) {
      logger.warn(`Empty or too small response on page ${currentPage} (${html?.length || 0} bytes)`);
      break;
    }

    // Extract state-view JSON embedded by Yandex Maps
    const startTag = '<script type="application/json" class="state-view">';
    const endTag = '</script>';
    const sIdx = html.indexOf(startTag);

    if (sIdx === -1) {
      logger.warn(`state-view script not found on Yandex page ${currentPage}`);
      break;
    }

    const jsonStart = sIdx + startTag.length;
    const jsonEnd = html.indexOf(endTag, jsonStart);
    if (jsonEnd === -1) break;

    let data: any = null;
    try {
      data = JSON.parse(html.slice(jsonStart, jsonEnd));
    } catch (parseErr: any) {
      logger.warn(`Failed to parse Yandex JSON: ${parseErr.message}`);
      break;
    }

    const searchResults = data?.stack?.[0]?.results;
    if (searchResults?.totalResultCount && !totalFoundInYandex) {
      totalFoundInYandex = Number(searchResults.totalResultCount);
    }

    const rawItems: any[] = searchResults?.items || [];
    if (rawItems.length === 0) {
      logger.info(`No items returned on Yandex page ${currentPage}, stopping pagination.`);
      break;
    }

    logger.info(`Found ${rawItems.length} raw items on Yandex page ${currentPage}`);

    for (const org of rawItems) {
      if (results.length >= targetLimit) break;

      const orgId = String(org.id || '');
      const rawTitle = String(org.title || org.shortTitle || '').trim();

      if (org.type && org.type !== 'business') continue;
      if (!rawTitle) continue;
      if (orgId && seenIds.has(orgId)) continue;
      if (seenNames.has(rawTitle.toLowerCase())) continue;

      if (orgId) seenIds.add(orgId);
      seenNames.add(rawTitle.toLowerCase());

      // 1. Phones
      const allPhonesList: string[] = [];
      let primaryPhone: string | null = null;
      let primaryPhoneDigits = '';

      if (Array.isArray(org.phones)) {
        for (const p of org.phones) {
          const rawNum = String(p.number || p.value || '').trim();
          const norm = normalizeRussianPhone(rawNum);
          if (norm && !allPhonesList.includes(norm.formatted)) {
            allPhonesList.push(norm.formatted);
            if (!primaryPhone) {
              primaryPhone = norm.formatted;
              primaryPhoneDigits = norm.e164.replace(/\D/g, '');
            }
          }
        }
      }

      // Filter: phone check
      if (options.phoneFilter === 'with_phone' && !primaryPhone) {
        continue;
      }

      // 2. Social Links & Messengers (VK, Telegram, WhatsApp, YouTube, Instagram, MAX)
      let vkUrl: string | null = null;
      let tgUrl: string | null = null;
      let waNumber: string | null = null;
      let instagramUrl: string | null = null;
      let youtubeUrl: string | null = null;
      let maxUrl: string | null = null;

      const checkLinkForSocials = (href: string, type = '') => {
        if (!href) return;
        const trimmed = href.trim();
        const lower = trimmed.toLowerCase();
        const tLower = type.toLowerCase();

        if (tLower === 'vkontakte' || tLower === 'vk' || lower.includes('vk.com') || lower.includes('vk.ru')) {
          if (!vkUrl) vkUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
        } else if (
          tLower === 'telegram' ||
          lower.includes('t.me/') ||
          lower.includes('telegram.me/') ||
          lower.includes('tg://')
        ) {
          if (!tgUrl) {
            if (trimmed.startsWith('tg://')) {
              tgUrl = trimmed;
            } else if (trimmed.startsWith('http')) {
              tgUrl = trimmed;
            } else if (trimmed.startsWith('@')) {
              tgUrl = `https://t.me/${trimmed.slice(1)}`;
            } else {
              tgUrl = `https://${trimmed}`;
            }
          }
        } else if (tLower === 'whatsapp' || lower.includes('wa.me') || lower.includes('whatsapp.com')) {
          const waMatch = trimmed.match(/wa\.me\/(?:\+)?(\d+)/i) || trimmed.match(/phone=(\d+)/i);
          if (waMatch && waMatch[1]) {
            waNumber = waMatch[1];
          } else if (primaryPhoneDigits) {
            waNumber = primaryPhoneDigits;
          }
        } else if (tLower === 'instagram' || lower.includes('instagram.com')) {
          if (!instagramUrl) instagramUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
        } else if (tLower === 'youtube' || lower.includes('youtube.com') || lower.includes('youtu.be')) {
          if (!youtubeUrl) youtubeUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
        } else if (tLower === 'max' || lower.includes('max.ru')) {
          if (!maxUrl) maxUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
        }
      };

      if (Array.isArray(org.socialLinks)) {
        for (const sl of org.socialLinks) {
          checkLinkForSocials(String(sl.href || sl.url || ''), String(sl.type || ''));
        }
      }

      if (Array.isArray(org.references)) {
        for (const ref of org.references) {
          if (typeof ref === 'string') checkLinkForSocials(ref);
          else if (ref && typeof ref.id === 'string') checkLinkForSocials(ref.id, ref.type);
          else if (ref && typeof ref.href === 'string') checkLinkForSocials(ref.href, ref.type);
        }
      }

      if (Array.isArray(org.links)) {
        for (const l of org.links) {
          if (typeof l === 'string') checkLinkForSocials(l);
          else if (l && typeof l.href === 'string') checkLinkForSocials(l.href, l.type);
        }
      }

      if (Array.isArray(org.messengers)) {
        for (const m of org.messengers) {
          if (typeof m === 'string') checkLinkForSocials(m);
          else if (m && typeof m.href === 'string') checkLinkForSocials(m.href, m.type);
        }
      }

      // Check description or short snippets for t.me/@handles
      const descText = String(org.description || org.snippet || '').trim();
      if (descText && !tgUrl) {
        const tgMatch = descText.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_+]+)/i);
        if (tgMatch && tgMatch[1]) {
          tgUrl = `https://t.me/${tgMatch[1]}`;
        }
      }

      // Fallback: If company has mobile Russian phone (+7 9xx xxx-xx-xx), generate direct Telegram chat link with phone number
      let finalTgUrl = tgUrl;
      if (!finalTgUrl && primaryPhoneDigits) {
        if (primaryPhoneDigits.startsWith('79') && primaryPhoneDigits.length === 11) {
          finalTgUrl = `https://t.me/+${primaryPhoneDigits}`;
        }
      }

      // Filter: telegram check
      if (options.telegramFilter === 'with_tg' && !finalTgUrl) {
        continue;
      }

      // Fallback: If company has mobile phone (+7 9xx xxx-xx-xx), it's a WhatsApp candidate
      if (!waNumber && primaryPhoneDigits) {
        if (primaryPhoneDigits.startsWith('79') && primaryPhoneDigits.length === 11) {
          waNumber = primaryPhoneDigits;
        }
      }

      // Filter: whatsapp check
      if (options.whatsappFilter === 'with_wa' && !waNumber) {
        continue;
      }

      // 3. Website
      let website: string | null = null;
      if (Array.isArray(org.urls) && org.urls.length > 0) {
        website = cleanWebsiteUrl(org.urls[0]);
      } else if (org.url) {
        website = cleanWebsiteUrl(org.url);
      } else if (Array.isArray(org.references)) {
        // Sometimes domain is stored in references
        const chatRef = org.references.find(
          (r: any) =>
            typeof r.id === 'string' &&
            (r.id.endsWith('.ru') || r.id.endsWith('.com') || r.id.endsWith('.рф') || r.id.endsWith('.org')),
        );
        if (chatRef) {
          website = cleanWebsiteUrl(`https://${chatRef.id}`);
        }
      }

      // Filter: website check
      if (options.websiteFilter === 'with_site' && !website) {
        continue;
      }
      if (options.websiteFilter === 'without_site' && website) {
        continue;
      }

      // 4. Address & Profile link
      const address = String(org.fullAddress || org.address || org.description || city).trim();
      const seoname = org.seoname ? String(org.seoname) : orgId;
      const profileLink = orgId
        ? `https://yandex.ru/maps/org/${encodeURIComponent(seoname)}/${encodeURIComponent(orgId)}/`
        : `https://yandex.ru/maps/?text=${encodeURIComponent(rawTitle + ' ' + address)}`;

      // 5. Rating & Reviews
      const rating = org.ratingData?.ratingValue ? Number(org.ratingData.ratingValue) : null;
      const reviewsCount = org.ratingData?.reviewCount ? Number(org.ratingData.reviewCount) : null;

      // 6. Schedule
      const schedule = org.workingTimeText ? String(org.workingTimeText).trim() : null;

      const firm: FirmResult = {
        id: orgId || `yandex_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: rawTitle,
        address,
        phone: primaryPhone,
        allPhones: allPhonesList,
        whatsapp: waNumber,
        max: maxUrl,
        instagram: instagramUrl,
        email: null,
        site: website,
        schedule,
        rating,
        reviewsCount,
        vk: vkUrl,
        telegram: finalTgUrl,
        facebook: null,
        youtube: youtubeUrl,
        tiktok: null,
        profileLink,
      };

      // Enrich with email if website exists
      if (website && results.length < targetLimit) {
        void extractEmailsFromWebsite(website, 2500)
          .then((foundEmail) => {
            if (foundEmail) firm.email = foundEmail;
          })
          .catch(() => {});
      }

      results.push(firm);
      onProgress?.({ type: 'result', data: firm });
    }

    currentPage++;
    // Small polite pause between page requests
    await new Promise((r) => setTimeout(r, 1200));
  }

  logger.info(`Yandex Maps scraping completed. Total results: ${results.length}`);
  onProgress?.(`Сбор завершён! Получено ${results.length} компаний из Яндекс Карт.`);

  return {
    city,
    niche,
    country: 'Россия',
    total: Math.max(results.length, totalFoundInYandex),
    results,
    url: baseUrl,
  };
}
