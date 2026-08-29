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
 * Scrape businesses from Google Maps for US and international markets.
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
  onProgress?.(`Запуск браузера и переход в Google Карты: «${searchQuery}»...`);

  let browser: Browser | null = null;
  const results: FirmResult[] = [];
  const seenPlaceIds = new Set<string>();

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
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    });

    const page = await context.newPage();

    // Block images, media, and fonts to speed up scraping significantly
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'media', 'font'].includes(resourceType)) {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Handle Google cookie consent modal if shown
    try {
      const consentBtn = page.locator('button[aria-label*="Accept all"], form[action*="consent"] button, button:has-text("Accept all")').first();
      if (await consentBtn.isVisible({ timeout: 2500 })) {
        await consentBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      /* ignore */
    }

    onProgress?.(`Поиск организаций по запросу «${searchQuery}» в Google Maps...`);

    // Locate the feed container on Google Maps
    const feedSelector = 'div[role="feed"], div.m6QErb[aria-label*="Results"], div[aria-label*="Search results"]';
    try {
      await page.waitForSelector(feedSelector, { timeout: 10000 });
    } catch {
      logger.warn('Google Maps feed selector not found immediately, checking direct place cards');
    }

    let scrollAttempts = 0;
    const isUnlimited = targetLimit >= 900;
    const maxScrollAttempts = isUnlimited ? 250 : Math.max(20, Math.ceil(targetLimit / 3) + 15);
    let consecutiveStallCount = 0;

    while (results.length < targetLimit && scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;
      const prevResultCount = results.length;

      // Extract all current card elements in the left panel
      const cardsData = await page.evaluate(() => {
        const items: Array<{
          name: string;
          profileLink: string;
          rating: number | null;
          reviewsCount: number | null;
          category: string | null;
          phone: string | null;
          site: string | null;
          address: string | null;
          rawText: string;
        }> = [];

        const cardNodes = document.querySelectorAll('div[role="article"], div.Nv2PK, div.THOPZb');

        cardNodes.forEach((node) => {
          const linkEl = node.querySelector('a.hfpxzc, a[href*="/maps/place/"]') as HTMLAnchorElement | null;
          const name = linkEl?.getAttribute('aria-label') || node.querySelector('div.qBF1Pd, div.fontHeadlineSmall')?.textContent?.trim() || '';
          const profileLink = linkEl?.href || '';

          if (!name) return;

          // Rating & Reviews
          let rating: number | null = null;
          let reviewsCount: number | null = null;

          const ratingEl = node.querySelector('span.MW4etd, span.ZkP5Je');
          if (ratingEl?.textContent) {
            const parsed = parseFloat(ratingEl.textContent.replace(',', '.'));
            if (!isNaN(parsed)) rating = parsed;
          }

          const reviewsEl = node.querySelector('span.UY7F9');
          if (reviewsEl?.textContent) {
            const revMatch = reviewsEl.textContent.match(/\d[\d,\.]*/);
            if (revMatch) {
              const num = parseInt(revMatch[0].replace(/\D/g, ''), 10);
              if (!isNaN(num)) reviewsCount = num;
            }
          }

          // Category, Address, Phone, Website
          let category: string | null = null;
          let address: string | null = null;
          let phone: string | null = null;
          let site: string | null = null;

          // Website link
          const siteEl = node.querySelector('a[aria-label*="Website" i], a.lcr4fd, a[data-value="Website"], a[href*="http"]:not([href*="google."]):not([href*="gstatic."]):not([href*="/maps/"])') as HTMLAnchorElement | null;
          if (siteEl?.href) {
            site = siteEl.href;
          }

          // Information lines
          const infoLines = Array.from(node.querySelectorAll('div.W4Efsd')).map((el) => el.textContent?.trim() || '');
          const allText = node.textContent || '';

          // Find phone (US format \(\d{3}\)\s*\d{3}-\d{4} or \d{3}-\d{3}-\d{4})
          const phoneMatch = allText.match(/(?:\+?1\s*[-.]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
          if (phoneMatch) {
            phone = phoneMatch[0].trim();
          }

          // Extract category
          if (infoLines[0]) {
            const parts = infoLines[0].split('·').map((p) => p.trim());
            if (parts[0]) category = parts[0];
          }

          // Extract address
          if (infoLines[1]) {
            const parts = infoLines[1].split('·').map((p) => p.trim());
            address = parts.find((p) => /\d+/.test(p) || p.length > 5) || parts[0] || null;
          }

          items.push({
            name,
            profileLink,
            rating,
            reviewsCount,
            category,
            phone,
            site,
            address,
            rawText: allText,
          });
        });

        return items;
      });

      // Process new discovered cards
      for (const card of cardsData) {
        if (results.length >= targetLimit) break;
        if (!card.name) continue;

        const placeKey = `${card.name}_${card.phone || card.profileLink}`;
        if (seenPlaceIds.has(placeKey)) continue;
        seenPlaceIds.add(placeKey);

        // Normalize phone
        const normalizedPhone = card.phone ? normalizeUsPhone(card.phone) : null;
        const phoneFormatted = normalizedPhone ? normalizedPhone.formatted : card.phone;
        const phoneE164 = normalizedPhone ? normalizedPhone.e164 : (card.phone ? card.phone.replace(/\D/g, '') : null);

        // Filter checks
        if (options.websiteFilter === 'with_site' && !card.site) continue;
        if (options.websiteFilter === 'without_site' && card.site) continue;
        if (options.phoneFilter === 'with_phone' && !phoneE164) continue;

        const firmItem: FirmResult = {
          id: `gm_${Buffer.from(card.name + (phoneE164 || card.profileLink)).toString('base64').slice(0, 16)}`,
          name: card.name,
          address: card.address || `${city}, USA`,
          phone: phoneFormatted,
          allPhones: phoneFormatted ? [phoneFormatted] : [],
          whatsapp: phoneE164 ? `https://wa.me/${phoneE164.replace(/\D/g, '')}` : null,
          instagram: null,
          email: null,
          site: card.site,
          schedule: 'Open',
          rating: card.rating,
          reviewsCount: card.reviewsCount,
          profileLink: card.profileLink || targetUrl,
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

      // Check if we reached target
      if (results.length >= targetLimit) break;

      // If no new cards after 6 scrolls, we reached bottom
      if (consecutiveStallCount >= 6) {
        logger.info('Google Maps scroll stalled, all cards collected');
        break;
      }

      // Scroll the feed to load more results
      await page.evaluate((selector) => {
        const feed = document.querySelector(selector);
        if (feed) {
          feed.scrollTop += 1200;
          return true;
        }
        window.scrollBy(0, 1200);
        return false;
      }, feedSelector);

      // Check for "You've reached the end of the list"
      const endOfList = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes("You've reached the end of the list") || text.includes('No more results') || text.includes('Вы просмотрели все результаты');
      });

      if (endOfList) {
        logger.info('Google Maps reached end of results list');
        break;
      }

      await page.waitForTimeout(1100);
    }

    // Step 2: Background Concurrent Email Extraction for items with website
    const itemsWithSite = results.filter((r) => r.site && !r.email);
    if (itemsWithSite.length > 0) {
      onProgress?.(`Поиск и извлечение Email с сайтов организаций (${itemsWithSite.length} сайтов)...`);

      // Extract emails in batches of 4 concurrent requests
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
