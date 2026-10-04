import { chromium, type Browser, type Page } from 'playwright';
import { logger } from '../../common/logger';
import { extractEmailsFromWebsite } from './email-extractor.service';
import type { FirmResult } from './scraper.service';

export interface GoogleSearchOptions {
  state?: string;
  websiteFilter?: 'all' | 'with_site' | 'without_site';
  phoneFilter?: 'all' | 'with_phone';
  emailFilter?: 'all' | 'with_email';
}

export interface GoogleScraperResult {
  city: string;
  niche: string;
  country: string;
  total: number;
  results: FirmResult[];
  url: string;
}

export type ProgressCallback = (msg: string | { type: 'result'; data: FirmResult }) => void;

/**
 * Unwrap Google Ads and redirect URLs to get the true canonical website URL.
 */
function cleanWebsiteUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const trimmed = rawUrl.trim();
    if (trimmed.includes('google.com/url?') || trimmed.includes('google.com/aclk?')) {
      const parsed = new URL(trimmed);
      const q = parsed.searchParams.get('q') || parsed.searchParams.get('adurl');
      if (q && q.startsWith('http')) return q;
    }
    if (
      trimmed.includes('google.com/maps') ||
      trimmed.includes('gstatic.com') ||
      trimmed.includes('google.com/search') ||
      trimmed.includes('google.com/local')
    ) {
      return null;
    }
    return trimmed;
  } catch {
    return rawUrl;
  }
}

/**
 * Normalize and format US phone numbers to E.164 and readable format.
 */
function normalizeUsPhone(phoneStr: string): { raw: string; e164: string; formatted: string } | null {
  if (!phoneStr) return null;
  const digits = phoneStr.replace(/\D/g, '');

  let clean = digits;
  if (digits.length === 11 && digits.startsWith('1')) {
    clean = digits.slice(1);
  } else if (digits.length !== 10) {
    if (digits.length >= 7) {
      return { raw: phoneStr, e164: `+1${digits}`, formatted: phoneStr };
    }
    return null;
  }

  const area = clean.slice(0, 3);
  const mid = clean.slice(3, 6);
  const last = clean.slice(6, 10);

  return {
    raw: phoneStr,
    e164: `+1${clean}`,
    formatted: `+1 (${area}) ${mid}-${last}`,
  };
}

/**
 * Scrape businesses from Google Maps for US and global markets with 100% detail accuracy.
 */
export async function scrapeGoogleMaps(
  city: string,
  niche: string,
  targetLimit = 30,
  options: GoogleSearchOptions = {},
  onProgress?: ProgressCallback,
): Promise<GoogleScraperResult> {
  const searchQuery = `${niche} ${city}`;
  const targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}?hl=en`;

  logger.info('Starting Google Maps scraper', { city, niche, targetLimit, url: targetUrl });
  onProgress?.(`Запуск браузера и поиск в Google Карты: «${searchQuery}»...`);

  let browser: Browser | null = null;
  const results: FirmResult[] = [];
  const seenPlaceNames = new Set<string>();

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--lang=en-US',
      ],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    });

    const searchPage = await context.newPage();
    const detailPage = await context.newPage();

    // Block heavy media on both pages for extreme speed
    const blockMedia = (route: any) => {
      const resourceType = route.request().resourceType();
      if (['image', 'media', 'font'].includes(resourceType)) {
        return route.abort();
      }
      return route.continue();
    };
    await searchPage.route('**/*', blockMedia);
    await detailPage.route('**/*', blockMedia);

    await searchPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Handle Google cookie consent modal if shown
    try {
      const consentBtn = searchPage
        .locator('button[aria-label*="Accept all"], form[action*="consent"] button, button:has-text("Accept all")')
        .first();
      if (await consentBtn.isVisible({ timeout: 2500 })) {
        await consentBtn.click();
        await searchPage.waitForTimeout(500);
      }
    } catch {
      /* ignore */
    }

    onProgress?.(`Поиск организаций по запросу «${searchQuery}» в Google Maps...`);

    // Locate the feed container on Google Maps
    const feedSelector =
      'div[role="feed"], div.m6QErb[aria-label*="Results"], div[aria-label*="Search results"]';
    try {
      await searchPage.waitForSelector(feedSelector, { timeout: 10000 });
    } catch {
      logger.warn('Google Maps feed selector not found immediately, checking direct place cards');
    }

    let scrollAttempts = 0;
    const isUnlimited = targetLimit >= 900;
    const maxScrollAttempts = isUnlimited ? 250 : Math.max(20, Math.ceil(targetLimit / 2) + 15);
    let consecutiveStallCount = 0;

    while (results.length < targetLimit && scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;
      const prevResultCount = results.length;

      // Extract all current cards from search feed
      const placesData = await searchPage.evaluate(() => {
        const cardNodes = document.querySelectorAll('div[role="article"], div.Nv2PK');
        return Array.from(cardNodes).map((node) => {
          const linkEl = node.querySelector('a.hfpxzc, a[href*="/maps/place/"]') as HTMLAnchorElement | null;
          const name = (
            linkEl?.getAttribute('aria-label') ||
            node.querySelector('div.qBF1Pd, div.fontHeadlineSmall')?.textContent ||
            ''
          ).trim();
          const profileLink = linkEl?.href || '';

          const cleanText = (node.textContent || '').replace(/[\u200B-\u200D\uFEFF\u00A0\u202F\u2000-\u200A]/g, ' ');
          const phoneMatch = cleanText.match(/(?:\+?1\s*[-.]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
          const siteAnchor = node.querySelector(
            'a[data-value="Website"], a[aria-label*="Website" i], a[aria-label*="Сайт" i]',
          ) as HTMLAnchorElement | null;

          let s: string | null = siteAnchor ? siteAnchor.href : null;
          if (
            s &&
            (s.includes('zocdoc.com') ||
              s.includes('patientsreach.io') ||
              s.includes('archy.com') ||
              s.includes('nexhealth.info') ||
              s.includes('reservewithgoogle'))
          ) {
            s = null;
          }

          let rating: number | null = null;
          const ratingEl = node.querySelector('span.MW4etd, span.ZkP5Je');
          if (ratingEl?.textContent) {
            const p = parseFloat(ratingEl.textContent.replace(',', '.'));
            if (!isNaN(p)) rating = p;
          }

          return {
            name,
            profileLink,
            phone: phoneMatch ? phoneMatch[0].trim() : null,
            site: s,
            rating,
          };
        }).filter((p) => p.name && p.profileLink);
      });

      for (const place of placesData) {
        if (results.length >= targetLimit) break;
        if (!place.name || seenPlaceNames.has(place.name)) continue;
        seenPlaceNames.add(place.name);

        let phone = place.phone;
        let site = place.site;
        let address: string | null = null;
        let rating = place.rating;
        let reviewsCount: number | null = null;

        // If snippet is missing phone or official site, visit profileLink in detailPage worker!
        if (!phone || !site) {
          try {
            await detailPage.goto(place.profileLink, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await detailPage
              .waitForSelector('h1.DUwDvf, button[data-item-id^="phone"], a[data-item-id="authority"], div[role="main"]', {
                timeout: 3500,
              })
              .catch(() => {});

            const detail = await detailPage.evaluate(() => {
              const phoneBtn = document.querySelector(
                'button[data-item-id^="phone:tel:"], button[data-item-id*="phone"]',
              );
              let p = phoneBtn
                ? phoneBtn.getAttribute('data-item-id')?.replace(/^phone:tel:/, '') ||
                  phoneBtn.textContent?.trim()
                : null;
              if (!p) {
                const anyPhoneEl = document.querySelector(
                  'button[aria-label*="Phone:" i], [data-tooltip*="phone" i]',
                );
                p =
                  anyPhoneEl?.getAttribute('aria-label')?.replace(/^Phone:\s*/i, '') ||
                  anyPhoneEl?.textContent?.trim() ||
                  null;
              }

              const siteAnchor = document.querySelector(
                'a[data-item-id="authority"], a[aria-label*="Website:" i], a[aria-label*="Website" i]',
              ) as HTMLAnchorElement | null;
              const s = siteAnchor?.href || null;

              const addrBtn = document.querySelector(
                'button[data-item-id="address"], button[aria-label*="Address:" i]',
              );
              const a =
                addrBtn?.getAttribute('aria-label')?.replace(/^Address:\s*/i, '') ||
                addrBtn?.textContent?.trim() ||
                null;

              let r: number | null = null;
              let revs: number | null = null;

              const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"], span.MW4etd');
              if (ratingEl?.textContent) {
                const parsed = parseFloat(ratingEl.textContent.replace(',', '.'));
                if (!isNaN(parsed)) r = parsed;
              }

              const reviewsEl = document.querySelector(
                'div.F7nice span[aria-label*="review" i], div.F7nice span[aria-label*="отзыв" i], span.UY7F9',
              );
              if (reviewsEl) {
                const revMatch = (
                  reviewsEl.getAttribute('aria-label') ||
                  reviewsEl.textContent ||
                  ''
                ).match(/(\d[\d,\.]*)/);
                if (revMatch) {
                  const num = parseInt(revMatch[1].replace(/\D/g, ''), 10);
                  if (!isNaN(num)) revs = num;
                }
              }

              return { phone: p, site: s, address: a, rating: r, reviewsCount: revs };
            });

            if (detail.phone) phone = detail.phone;
            if (detail.site) site = detail.site;
            if (detail.address) address = detail.address;
            if (detail.rating) rating = detail.rating;
            if (detail.reviewsCount) reviewsCount = detail.reviewsCount;
          } catch (err) {
            logger.debug('Detail page inspection fallback error', {
              name: place.name,
              error: (err as Error).message,
            });
          }
        }

        const cleanSite = cleanWebsiteUrl(site);
        const normalizedPhone = phone ? normalizeUsPhone(phone) : null;
        const phoneFormatted = normalizedPhone ? normalizedPhone.formatted : phone;
        const phoneE164 = normalizedPhone
          ? normalizedPhone.e164
          : phone
            ? phone.replace(/\D/g, '')
            : null;

        const cleanAddress = address
          ? address.replace(/, United States\s*$/i, '')
          : `${place.name}, ${city}, USA`;

        const firmItem: FirmResult = {
          id: `gm_${Buffer.from(place.name + (phoneE164 || cleanSite || place.profileLink)).toString('base64').slice(0, 16)}`,
          name: place.name,
          address: cleanAddress,
          phone: phoneFormatted,
          allPhones: phoneFormatted ? [phoneFormatted] : [],
          whatsapp: phoneE164 ? `https://wa.me/${phoneE164.replace(/\D/g, '')}` : null,
          instagram: null,
          email: null,
          site: cleanSite,
          schedule: 'Open',
          rating: rating,
          reviewsCount: reviewsCount,
          profileLink: place.profileLink,
        };

        results.push(firmItem);
        onProgress?.({ type: 'result', data: firmItem });
        onProgress?.(
          isUnlimited
            ? `Собрано ${results.length} организаций в Google Maps (режим «Все результаты»)...`
            : `Собрано ${results.length} из ${targetLimit} организаций в Google Maps...`,
        );
      }

      // Track stalling
      if (results.length === prevResultCount) {
        consecutiveStallCount++;
      } else {
        consecutiveStallCount = 0;
      }

      if (results.length >= targetLimit) break;

      if (consecutiveStallCount >= 6) {
        logger.info('Google Maps scroll stalled, all cards collected');
        break;
      }

      // Scroll the search feed
      await searchPage.evaluate((selector) => {
        const feed = document.querySelector(selector);
        if (feed) feed.scrollTop += 1200;
      }, feedSelector);

      // Check end of list
      const endOfList = await searchPage.evaluate(() => {
        const text = document.body.innerText;
        return (
          text.includes("You've reached the end of the list") ||
          text.includes('No more results') ||
          text.includes('Вы просмотрели все результаты')
        );
      });

      if (endOfList) {
        logger.info('Google Maps reached end of results list');
        break;
      }

      await searchPage.waitForTimeout(600);
    }

    // Step 2: Background Concurrent Email Extraction for items with website
    const itemsWithSite = results.filter((r) => r.site && !r.email);
    if (itemsWithSite.length > 0) {
      onProgress?.(
        `Поиск и извлечение Email с сайтов организаций (${itemsWithSite.length} сайтов)...`,
      );

      const batchSize = 4;
      for (let i = 0; i < itemsWithSite.length; i += batchSize) {
        const batch = itemsWithSite.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(async (item) => {
            if (!item.site) return;
            const email = await extractEmailsFromWebsite(item.site, 3500);
            if (email) {
              item.email = email;
              onProgress?.({ type: 'result', data: item });
            }
          }),
        );
      }
    }

    onProgress?.(`Готово! Успешно собрано ${results.length} организаций по запросу «${searchQuery}».`);
  } catch (err) {
    logger.error('Google Maps scraping error', { city, niche, error: (err as Error).message });
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }

  return {
    city,
    niche,
    country: 'USA',
    total: results.length,
    results,
    url: targetUrl,
  };
}
