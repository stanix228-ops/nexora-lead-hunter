import { chromium, type Browser, type Page } from 'playwright';
import { searchUrl, getCityConfig } from './cities';
import { logger } from '../../common/logger';

let browserInstance: Browser | null = null;

const MAX_CONCURRENT_TASKS = 2;
let activeTasks = 0;
const taskQueue: Array<() => void> = [];

async function runTask<T>(task: () => Promise<T>): Promise<T> {
  if (activeTasks >= MAX_CONCURRENT_TASKS) {
    await new Promise<void>((resolve) => taskQueue.push(resolve));
  }
  activeTasks++;
  try {
    return await task();
  } finally {
    activeTasks--;
    if (taskQueue.length > 0) {
      const next = taskQueue.shift();
      if (next) next();
    }
  }
}

const PROXY = process.env.PROXY && process.env.PROXY.trim() ? process.env.PROXY.trim() : null;

export async function initBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-features=BlockInsecurePrivateNetworkRequests',
      ],
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

async function bypass(page: Page): Promise<boolean> {
  try {
    const el = await page.$('a:has-text("Пропустить")');
    if (el) {
      await Promise.all([
        page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
        el.click(),
      ]);
      await page.waitForTimeout(500);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export interface FirmResult {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  allPhones: string[];
  whatsapp: string | null;
  max?: string | null;
  instagram: string | null;
  email: string | null;
  site: string | null;
  schedule: string | null;
  rating: number | null;
  reviewsCount?: number | null;
  vk?: string | null;
  telegram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
  profileLink: string;
}

export interface ParseSearchOptions {
  country?: string;
  websiteFilter?: 'all' | 'with_site' | 'without_site';
  whatsappFilter?: 'all' | 'with_wa';
  maxFilter?: 'all' | 'with_max';
  phoneFilter?: 'all' | 'with_phone';
}

export interface ParseSearchResult {
  url: string;
  city: string;
  country: string;
  niche: string;
  total: number;
  results: FirmResult[];
}

export type ProgressCallback = (msg: string | { type: 'result'; data: FirmResult }) => void;

function cleanUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  
  // If it's a 2GIS tracking redirect e.g. http://link.2gis.ru/1.2/.../?https://target.com
  const redirectMatch = url.match(/\?(https?:\/\/[^\s&]+)/i);
  if (redirectMatch && redirectMatch[1]) {
    url = decodeURIComponent(redirectMatch[1]);
  }

  // Remove common tracker suffixes
  url = url.replace(/(\?|&)utm_[^&]+/g, '');
  url = url.replace(/(\?|&)is_from_rle/g, '');
  
  if (url.startsWith('//')) url = 'https:' + url;
  if (!url.startsWith('http://') && !url.startsWith('https://') && url.includes('.')) {
    url = 'https://' + url;
  }

  // Ignore internal/ad domains
  if (
    url.includes('2gis.') ||
    url.includes('yandex.') ||
    url.includes('google.') ||
    url.includes('mail.ru') ||
    url.includes('captcha')
  ) {
    return null;
  }

  return url;
}

function cleanMax(rawMax: string | null | undefined): string | null {
  if (!rawMax) return null;
  const trimmed = rawMax.trim();
  const m = trimmed.match(/(?:max\.ru\/|max\.me\/)([a-zA-Z0-9_\-\/]+)/i);
  if (m && m[1]) {
    const path = m[1].replace(/^\/+/, '');
    return `https://max.ru/${path}`;
  }
  if (trimmed.includes('max.ru') || trimmed.includes('max.me')) {
    return cleanUrl(trimmed);
  }
  return null;
}

function cleanWhatsApp(rawWa: string | null | undefined, phone?: string | null): string | null {
  if (rawWa) {
    const m = rawWa.match(/(?:wa\.me\/|phone=|send\?phone=)(\d{10,15})/);
    if (m) return `https://wa.me/${m[1]}`;
    if (rawWa.startsWith('http')) return cleanUrl(rawWa);
  }
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      let normalized = digits;
      if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
        normalized = '7' + digits.slice(1);
      } else if (digits.length === 10 && digits.startsWith('9')) {
        normalized = '7' + digits;
      }
      return `https://wa.me/${normalized}`;
    }
  }
  return null;
}

function normalizePhoneFormat(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const code = digits.slice(1, 4);
    const p1 = digits.slice(4, 7);
    const p2 = digits.slice(7, 9);
    const p3 = digits.slice(9, 11);
    return `+7 (${code}) ${p1}-${p2}-${p3}`;
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    const code = digits.slice(0, 3);
    const p1 = digits.slice(3, 6);
    const p2 = digits.slice(6, 8);
    const p3 = digits.slice(8, 10);
    return `+7 (${code}) ${p1}-${p2}-${p3}`;
  }
  return raw.trim();
}

function extractFirmFromApiResponse(item: Record<string, any>, domain: string, slug: string): FirmResult {
  const id = String(item.id || '').split('_')[0];
  const name =
    (item.name_ex && typeof item.name_ex === 'object' ? item.name_ex.primary : item.name_ex) ||
    (typeof item.name === 'object' ? item.name.primary : item.name) ||
    item.title ||
    '';

  const address =
    item.address_name ||
    item.address?.components?.map((c: any) => `${c.street || ''} ${c.number || ''}`.trim()).filter(Boolean).join(', ') ||
    '';

  const phones: string[] = [];
  let rawWa: string | null = null;
  let rawMax: string | null = null;
  let rawInsta: string | null = null;
  let rawTg: string | null = null;
  let rawVk: string | null = null;
  let rawSite: string | null = null;
  let rawEmail: string | null = null;

  // 1. From contact_groups
  const contactGroups = Array.isArray(item.contact_groups)
    ? item.contact_groups
    : Array.isArray(item.org?.contact_groups)
    ? item.org.contact_groups
    : [];

  if (contactGroups.length > 0) {
    for (const cg of contactGroups) {
      if (!Array.isArray(cg.contacts)) continue;
      for (const c of cg.contacts) {
        const type = (c.type || '').toLowerCase();
        const val = c.value || c.url || c.text || '';
        if (type === 'phone') {
          const ph = c.print_text || c.text || val;
          const formatted = normalizePhoneFormat(ph);
          if (formatted && !phones.includes(formatted)) phones.push(formatted);
        } else if (type === 'whatsapp') {
          if (!rawWa) rawWa = val || c.url;
        } else if (type === 'max' || type === 'max_messenger' || val.includes('max.ru') || val.includes('max.me')) {
          if (!rawMax) rawMax = val || c.url;
        } else if (type === 'instagram') {
          if (!rawInsta) rawInsta = val || c.url;
        } else if (type === 'telegram') {
          if (!rawTg) rawTg = val || c.url;
        } else if (type === 'vkontakte' || type === 'vk') {
          if (!rawVk) rawVk = val || c.url;
        } else if (type === 'website') {
          if (!rawSite) rawSite = c.url || c.text || val;
        } else if (type === 'email') {
          if (!rawEmail) rawEmail = val || c.text;
        }
      }
    }
  }

  // 2. Direct contacts / phones arrays
  if (Array.isArray(item.contacts)) {
    for (const c of item.contacts) {
      const type = (c.type || '').toLowerCase();
      const val = c.value || c.url || c.text || '';
      if (type === 'phone' || type.includes('tel')) {
        const formatted = normalizePhoneFormat(val);
        if (formatted && !phones.includes(formatted)) phones.push(formatted);
      } else if (type.includes('wa') || type.includes('whatsapp')) {
        if (!rawWa) rawWa = val;
      } else if (type.includes('max') || val.includes('max.ru') || val.includes('max.me')) {
        if (!rawMax) rawMax = val;
      }
    }
  }

  if (Array.isArray(item.phones)) {
    for (const p of item.phones) {
      const ph = typeof p === 'string' ? p : p.phone || p.number || p.text;
      if (ph) {
        const formatted = normalizePhoneFormat(ph);
        if (formatted && !phones.includes(formatted)) phones.push(formatted);
      }
    }
  }

  // 3. From ads actions
  if (!rawWa && item.ads?.options?.actions) {
    for (const act of item.ads.options.actions) {
      const val = act.value || '';
      if (val.includes('wa.me') || val.includes('whatsapp.com')) {
        rawWa = val;
        break;
      }
      if (val.includes('max.ru') || val.includes('max.me')) {
        rawMax = val;
      }
    }
  }

  // 4. From ads link
  if (!rawInsta && item.ads?.link?.text === 'Instagram') {
    rawInsta = item.ads.link.value || '';
  }

  // 5. From links
  if (!rawSite && item.links?.website) {
    rawSite = item.links.website;
  }
  if (!rawWa && item.links?.whatsapp) {
    rawWa = item.links.whatsapp;
  }
  if (!rawMax && (item.links?.max || item.links?.['max.ru'] || item.links?.['max.me'])) {
    rawMax = item.links.max || item.links?.['max.ru'] || item.links?.['max.me'];
  }
  if (!rawTg && item.links?.telegram) {
    rawTg = item.links.telegram;
  }
  if (!rawVk && item.links?.vkontakte) {
    rawVk = item.links.vkontakte;
  }

  // Format schedule
  let scheduleStr: string | null = null;
  if (item.schedule) {
    if (item.schedule.is_24x7) {
      scheduleStr = 'Круглосуточно (24/7)';
    } else if (item.schedule.comment) {
      scheduleStr = item.schedule.comment;
    } else {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const activeDays = days.filter((d) => item.schedule[d]?.working_hours?.length);
      if (activeDays.length > 0) {
        const sampleHours = item.schedule[activeDays[0]]?.working_hours?.[0];
        if (sampleHours) {
          scheduleStr = `${sampleHours.from} - ${sampleHours.to}`;
        }
      }
    }
  }

  const primaryPhone = phones[0] || null;
  const whatsapp = cleanWhatsApp(rawWa, primaryPhone);
  const max = cleanMax(rawMax);
  const site = cleanUrl(rawSite);
  const instagram = cleanUrl(rawInsta);
  const telegram = rawTg ? (rawTg.startsWith('http') ? rawTg : `https://t.me/${rawTg.replace('@', '')}`) : null;
  const vk = cleanUrl(rawVk);

  return {
    id,
    name: name.trim(),
    address: address.trim(),
    phone: primaryPhone,
    allPhones: phones,
    whatsapp,
    max,
    instagram,
    email: rawEmail || null,
    site,
    schedule: scheduleStr,
    rating: item.reviews?.general_rating ? Number(item.reviews.general_rating) : null,
    reviewsCount: item.reviews?.general_review_count ? Number(item.reviews.general_review_count) : null,
    vk,
    telegram,
    facebook: cleanUrl(item.links?.facebook),
    youtube: cleanUrl(item.links?.youtube),
    tiktok: cleanUrl(item.links?.tiktok),
    profileLink: `https://${domain}/${slug}/firm/${id}`,
  };
}

export async function parseSearchPage(
  cityName: string,
  niche: string,
  maxRecords = 50,
  options?: ParseSearchOptions,
  onProgress?: ProgressCallback | null,
): Promise<ParseSearchResult> {
  const cfg = getCityConfig(cityName, options?.country);
  const initialUrl = searchUrl(cityName, niche, options?.country, 1);

  return runTask(async () => {
    const b = await initBrowser();

    const ctx = await b.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'ru-RU',
      timezoneId: 'Asia/Almaty',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      ...(PROXY ? { proxy: { server: PROXY } } : {}),
    });

    const page = await ctx.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Map to cache intercepted items from 2GIS network requests
    const itemsMap = new Map<string, Record<string, any>>();

    page.on('response', async (res) => {
      try {
        const u = res.url();
        if (
          u.includes('2gis') &&
          (u.includes('items') ||
            u.includes('markers') ||
            u.includes('branch') ||
            u.includes('search') ||
            u.includes('catalog') ||
            u.includes('byid'))
        ) {
          const json = await res.json().catch(() => null);
          if (!json) return;
          const items =
            json.result?.items ||
            (json.result?.item ? [json.result.item] : null) ||
            json.items ||
            [];
          if (Array.isArray(items)) {
            for (const it of items) {
              if (it && typeof it === 'object') {
                const rawId = String(it.id || '').split('_')[0];
                if (rawId) {
                  const existing = itemsMap.get(rawId);
                  if (!existing || (it.contact_groups && it.contact_groups.length > 0)) {
                    itemsMap.set(rawId, it);
                  }
                }
              }
            }
          }
        }
      } catch {
        /* ignore json parse error */
      }
    });

    try {
      if (onProgress) onProgress(`Вход в 2GIS (${cfg.country}, ${cfg.name})...`);

      // 1. Visit city main page to pass initial check
      await page.goto(`https://${cfg.domain}/${cfg.slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (page.url().includes('captcha')) throw new Error('2GIS запросил капчу. Повторите запрос через пару минут.');

      if (page.url().includes('museum')) {
        if (onProgress) onProgress('Проходим проверку браузера...');
        await bypass(page);
      }

      const results: FirmResult[] = [];
      const seenFirmIds = new Set<string>();
      const isUnlimited = maxRecords >= 900;
      const maxPages = isUnlimited ? 60 : Math.min(Math.ceil(maxRecords / 10) + 1, 30);
      let totalCount = 0;

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        if (results.length >= maxRecords) break;

        const pageUrl = searchUrl(cityName, niche, options?.country, pageNum);
        if (onProgress) onProgress(`Поиск "${niche}" (страница ${pageNum})...`);

        let searchAttempts = 0;
        while (searchAttempts < 3) {
          searchAttempts++;
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          if (page.url().includes('captcha')) throw new Error('2GIS запросил капчу. Повторите запрос через минуту.');
          if (!page.url().includes('museum')) break;
          if (onProgress) onProgress(`Проверка браузера (попытка ${searchAttempts})...`);
          await bypass(page);
        }

        // Wait for firm links or results list
        try {
          await page.waitForFunction(
            () => {
              const links = document.querySelectorAll('a[href*="/firm/"]');
              return links.length > 0;
            },
            { timeout: 12000, polling: 500 },
          );
        } catch {
          // No more firm links on this page
          break;
        }

        await page.waitForTimeout(1000);

        // Extract firm cards present on current page
        const firmCards = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a[href*="/firm/"]'));
          const cards: Array<{ id: string; name: string }> = [];
          const seen = new Set<string>();

          for (const a of anchors) {
            const href = (a as HTMLAnchorElement).href || '';
            const match = href.match(/\/firm\/(\d+)/);
            if (!match) continue;
            const id = match[1];
            if (seen.has(id)) continue;
            seen.add(id);

            const text = a.textContent?.trim() || '';
            if (text.length > 1 && !text.includes('Реклама') && !text.includes('2ГИС')) {
              cards.push({ id, name: text });
            }
          }
          return cards;
        });

        if (firmCards.length === 0) break;
        totalCount = Math.max(totalCount, totalCount + firmCards.length);

        // Process each firm card on the page
        for (const card of firmCards) {
          if (results.length >= maxRecords) break;
          if (seenFirmIds.has(card.id)) continue;
          seenFirmIds.add(card.id);

          if (onProgress) {
            onProgress(
              isUnlimited
                ? `Сбор контактов: [${results.length + 1} найдено] — ${card.name}`
                : `Сбор контактов: [${results.length + 1}/${maxRecords}] — ${card.name}`,
            );
          }

          let firmData: FirmResult | null = null;

          // Check if we already have full info in itemsMap from network responses
          const cached = itemsMap.get(card.id);
          if (cached && (cached.contact_groups?.length > 0 || cached.contacts?.length > 0 || cached.phones?.length > 0)) {
            firmData = extractFirmFromApiResponse(cached, cfg.domain, cfg.slug);
          } else {
            // Click the card directly in the sidebar to trigger items/byid
            await page.evaluate((firmId) => {
              const link = document.querySelector(`a[href*="/firm/${firmId}"]`) as HTMLElement;
              if (link) {
                link.scrollIntoView({ block: 'center' });
                link.click();
              }
            }, card.id);

            await page.waitForTimeout(600);

            // Click any "Показать телефон" / "Показать контакты" buttons
            await page.evaluate(() => {
              const elements = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
              for (const el of elements) {
                const txt = el.textContent?.toLowerCase().trim() || '';
                if (
                  txt.includes('показать телефон') ||
                  txt.includes('показать номер') ||
                  txt.includes('показать контакт') ||
                  txt.includes('телефоны')
                ) {
                  (el as HTMLElement).click();
                }
              }
            });
            await page.waitForTimeout(400);

            const updatedCached = itemsMap.get(card.id);
            if (updatedCached && (updatedCached.contact_groups?.length > 0 || updatedCached.contacts?.length > 0 || updatedCached.phones?.length > 0)) {
              firmData = extractFirmFromApiResponse(updatedCached, cfg.domain, cfg.slug);
            } else {
              // DOM Fallback
              const domData = await page.evaluate((firmId) => {
                const h1 = document.querySelector('h1')?.textContent?.trim() || '';
                const phonesFound = new Set<string>();

                // 1. From tel: links
                document.querySelectorAll('a[href*="tel:"]').forEach((a) => {
                  const href = (a as HTMLAnchorElement).href.replace('tel:', '').trim();
                  if (href) phonesFound.add(href);
                  const txt = a.textContent?.trim();
                  if (txt && /\d{5,}/.test(txt)) phonesFound.add(txt);
                });

                // 2. From Russian/CIS phone formats
                const allText = document.body.innerText || '';
                const matches = allText.match(/(?:\+?7|8)[\s\-\(]?\(?\d{3,4}\)?[\s\-]?\d{2,3}[\s\-]?\d{2}[\s\-]?\d{2}/g);
                if (matches) {
                  for (const m of matches) {
                    const digits = m.replace(/\D/g, '');
                    if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
                      phonesFound.add(m.trim());
                    }
                  }
                }

                // 3. Socials & messengers
                const waLinks = Array.from(document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com"]')).map((a) => (a as HTMLAnchorElement).href);
                const maxLinks = Array.from(document.querySelectorAll('a[href*="max.ru"], a[href*="max.me"]')).map((a) => (a as HTMLAnchorElement).href);
                const tgLinks = Array.from(document.querySelectorAll('a[href*="t.me/"]')).map((a) => (a as HTMLAnchorElement).href);
                const instaLinks = Array.from(document.querySelectorAll('a[href*="instagram.com"]')).map((a) => (a as HTMLAnchorElement).href);
                const vkLinks = Array.from(document.querySelectorAll('a[href*="vk.com/"]')).map((a) => (a as HTMLAnchorElement).href);
                const emailLinks = Array.from(document.querySelectorAll('a[href*="mailto:"]')).map((a) => (a as HTMLAnchorElement).href.replace('mailto:', '').trim());

                // 4. Address & site
                const addrEl = document.querySelector('[class*="address" i], [class*="street" i], address');
                const address = addrEl?.textContent?.trim() || '';

                const allExtLinks = Array.from(document.querySelectorAll('a[href*="://"]'))
                  .map((a) => (a as HTMLAnchorElement).href)
                  .filter(
                    (h) =>
                      !h.includes('2gis') &&
                      !h.includes('yandex') &&
                      !h.includes('mail.ru') &&
                      !h.includes('google') &&
                      !h.includes('wa.me') &&
                      !h.includes('max.ru') &&
                      !h.includes('max.me') &&
                      !h.includes('tel:') &&
                      !h.includes('instagram.com') &&
                      !h.includes('t.me') &&
                      !h.includes('vk.com') &&
                      !h.includes('facebook.com')
                  );

                return {
                  name: h1,
                  phones: Array.from(phonesFound),
                  whatsapp: waLinks[0] || null,
                  max: maxLinks[0] || null,
                  instagram: instaLinks[0] || null,
                  telegram: tgLinks[0] || null,
                  vk: vkLinks[0] || null,
                  email: emailLinks[0] || null,
                  address,
                  site: allExtLinks[0] || null,
                };
              }, card.id);

              const formattedPhones = domData.phones.map(normalizePhoneFormat).filter(Boolean);
              const primaryPh = formattedPhones[0] || null;
              firmData = {
                id: card.id,
                name: domData.name || card.name,
                address: domData.address,
                phone: primaryPh,
                allPhones: formattedPhones,
                whatsapp: cleanWhatsApp(domData.whatsapp, primaryPh),
                max: cleanMax(domData.max),
                instagram: cleanUrl(domData.instagram),
                email: domData.email || null,
                site: cleanUrl(domData.site),
                schedule: null,
                rating: null,
                reviewsCount: null,
                vk: cleanUrl(domData.vk),
                telegram: domData.telegram,
                facebook: null,
                youtube: null,
                tiktok: null,
                profileLink: `https://${cfg.domain}/${cfg.slug}/firm/${card.id}`,
              };
            }
          }

          if (!firmData) continue;

          results.push(firmData);

          if (onProgress) {
            onProgress({ type: 'result', data: firmData });
          }
        }
      }

      logger.info('2GIS parse completed', {
        city: cityName,
        niche,
        total: totalCount || results.length,
        collected: results.length,
      });

      return {
        url: initialUrl,
        city: cfg.name,
        country: cfg.country,
        niche,
        total: totalCount || results.length,
        results,
      };
    } finally {
      await page.close().catch(() => {});
      await ctx.close().catch(() => {});
    }
  });
}

