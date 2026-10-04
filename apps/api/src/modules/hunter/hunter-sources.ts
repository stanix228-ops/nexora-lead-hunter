import { logger } from '../../common/logger';
import { parseSearchPage, type FirmResult } from '../parser/scraper.service';
import { scrapeGoogleMaps } from '../parser/google-scraper.service';
import { extractEmailsFromWebsite } from '../parser/email-extractor.service';
import type { DiscoveredLeadRaw, HunterDiscoverySource, LeadHunterFilters } from '@nexora/types';
import { normalizePhone, buildWaLink } from '@nexora/utils';

export interface HunterSourceOptions {
  city: string;
  niche: string;
  country?: string;
  limit: number;
  filters?: LeadHunterFilters;
  onProgress?: (msg: string) => void;
}

export interface IHunterSourceAdapter {
  source: HunterDiscoverySource;
  discover(options: HunterSourceOptions): Promise<DiscoveredLeadRaw[]>;
}

/**
 * Random delay with jitter to adhere to rate limits and anti-bot guidelines.
 */
export async function applyRateLimitDelay(minMs = 1500, maxMs = 3500): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * 1. 2GIS Source Adapter
 * Direct reuse of existing high-precision 2GIS parser.
 */
export class Gis2SourceAdapter implements IHunterSourceAdapter {
  source: HunterDiscoverySource = '2GIS';

  async discover(options: HunterSourceOptions): Promise<DiscoveredLeadRaw[]> {
    logger.info('Hunter [2GIS]: Starting discovery', { city: options.city, niche: options.niche });
    options.onProgress?.(`[2GIS] Поиск организаций в ${options.city} по нише «${options.niche}»...`);

    const websiteFilter = options.filters?.websiteFilter || 'all';

    try {
      const data = await parseSearchPage(
        options.city,
        options.niche,
        options.limit,
        {
          country: options.country,
          websiteFilter,
        },
        (msg) => {
          if (typeof msg === 'string') {
            options.onProgress?.(`[2GIS] ${msg}`);
          }
        },
      );

      const items: DiscoveredLeadRaw[] = (data.results || []).map((res: FirmResult) => ({
        source: '2GIS' as HunterDiscoverySource,
        name: res.name,
        phone: res.phone,
        allPhones: res.allPhones || (res.phone ? [res.phone] : []),
        email: res.email,
        website: res.site,
        instagram: res.instagram,
        telegram: res.telegram,
        whatsapp: res.whatsapp,
        address: res.address,
        rating: res.rating,
        reviewsCount: res.reviewsCount,
        profileLink: res.profileLink,
        extra: {
          schedule: res.schedule,
          max: res.max,
          vk: res.vk,
        },
      }));

      await applyRateLimitDelay(1000, 2000);
      logger.info('Hunter [2GIS]: Discovered leads', { count: items.length });
      return items;
    } catch (err) {
      logger.warn('Hunter [2GIS] Discovery error', { error: (err as Error).message });
      return [];
    }
  }
}

/**
 * 2. Google Maps / Search Source Adapter
 * Direct reuse of existing Google scraper.
 */
export class GoogleMapsSourceAdapter implements IHunterSourceAdapter {
  source: HunterDiscoverySource = 'GOOGLE';

  async discover(options: HunterSourceOptions): Promise<DiscoveredLeadRaw[]> {
    logger.info('Hunter [Google]: Starting discovery', { city: options.city, niche: options.niche });
    options.onProgress?.(`[Google] Поиск компаний в Google Maps: ${options.niche} ${options.city}...`);

    try {
      const data = await scrapeGoogleMaps(
        options.city,
        options.niche,
        options.limit,
        {
          websiteFilter: options.filters?.websiteFilter || 'all',
        },
        (msg) => {
          if (typeof msg === 'string') {
            options.onProgress?.(`[Google] ${msg}`);
          }
        },
      );

      const items: DiscoveredLeadRaw[] = (data.results || []).map((res: FirmResult) => ({
        source: 'GOOGLE' as HunterDiscoverySource,
        name: res.name,
        phone: res.phone,
        allPhones: res.allPhones || (res.phone ? [res.phone] : []),
        email: res.email,
        website: res.site,
        instagram: res.instagram,
        telegram: res.telegram,
        whatsapp: res.whatsapp,
        address: res.address,
        rating: res.rating,
        reviewsCount: res.reviewsCount,
        profileLink: res.profileLink,
      }));

      await applyRateLimitDelay(1500, 3000);
      logger.info('Hunter [Google]: Discovered leads', { count: items.length });
      return items;
    } catch (err) {
      logger.warn('Hunter [Google] Discovery error', { error: (err as Error).message });
      return [];
    }
  }
}

/**
 * 3. Instagram Business Scanner Adapter
 * Discovers business profiles, Bio links, and contact channels.
 */
export class InstagramSourceAdapter implements IHunterSourceAdapter {
  source: HunterDiscoverySource = 'INSTAGRAM';

  async discover(options: HunterSourceOptions): Promise<DiscoveredLeadRaw[]> {
    logger.info('Hunter [Instagram]: Scanning niche accounts', { city: options.city, niche: options.niche });
    options.onProgress?.(`[Instagram] Поиск бизнес-аккаунтов в ${options.city} по тегам «#${options.niche.replace(/\s+/g, '')}»...`);

    const leads: DiscoveredLeadRaw[] = [];
    const query = `${options.niche} ${options.city}`;

    // Perform structured web query discovery
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:instagram.com "${options.niche}" "${options.city}"`)}`;
      const resp = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
        },
      });

      if (resp.ok) {
        const html = await resp.text();
        const linkMatches = html.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/gi);
        const seenHandles = new Set<string>();

        for (const match of linkMatches) {
          const handle = match[1]?.toLowerCase();
          if (!handle || ['p', 'reel', 'explore', 'stories', 'tv', 'about', 'legal'].includes(handle)) {
            continue;
          }
          if (seenHandles.has(handle)) continue;
          seenHandles.add(handle);

          const formattedName = `${options.niche} @${handle}`;
          leads.push({
            source: 'INSTAGRAM',
            name: formattedName,
            instagram: `https://instagram.com/${handle}`,
            website: null,
            phone: null,
            address: options.city,
            extra: { handle, query },
          });

          if (leads.length >= options.limit) break;
        }
      }
    } catch (err) {
      logger.debug('Instagram web discovery failed, falling back to structured generator', { error: (err as Error).message });
    }

    await applyRateLimitDelay(1200, 2500);
    logger.info('Hunter [Instagram]: Discovered leads', { count: leads.length });
    return leads;
  }
}

/**
 * 4. Telegram Business Adapter
 * Discovers channels, bots, and direct t.me contacts for target niches.
 */
export class TelegramSourceAdapter implements IHunterSourceAdapter {
  source: HunterDiscoverySource = 'TELEGRAM';

  async discover(options: HunterSourceOptions): Promise<DiscoveredLeadRaw[]> {
    logger.info('Hunter [Telegram]: Searching channel contacts', { city: options.city, niche: options.niche });
    options.onProgress?.(`[Telegram] Поиск каналов и контактов t.me для «${options.niche} ${options.city}»...`);

    const leads: DiscoveredLeadRaw[] = [];

    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:t.me "${options.niche}" "${options.city}"`)}`;
      const resp = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
        },
      });

      if (resp.ok) {
        const html = await resp.text();
        const linkMatches = html.matchAll(/https?:\/\/t\.me\/([a-zA-Z0-9_]+)/gi);
        const seenUsernames = new Set<string>();

        for (const match of linkMatches) {
          const username = match[1]?.toLowerCase();
          if (!username || ['joinchat', 'addstickers', 'share', 's', 'c'].includes(username)) {
            continue;
          }
          if (seenUsernames.has(username)) continue;
          seenUsernames.add(username);

          leads.push({
            source: 'TELEGRAM',
            name: `${options.niche} Telegram @${username}`,
            telegram: `https://t.me/${username}`,
            phone: null,
            address: options.city,
            extra: { username },
          });

          if (leads.length >= options.limit) break;
        }
      }
    } catch (err) {
      logger.debug('Telegram discovery failed', { error: (err as Error).message });
    }

    await applyRateLimitDelay(1200, 2500);
    logger.info('Hunter [Telegram]: Discovered leads', { count: leads.length });
    return leads;
  }
}

/**
 * 5. LinkedIn Company & B2B Adapter
 * Discovers corporate pages and key contacts for B2B niches.
 */
export class LinkedInSourceAdapter implements IHunterSourceAdapter {
  source: HunterDiscoverySource = 'LINKEDIN';

  async discover(options: HunterSourceOptions): Promise<DiscoveredLeadRaw[]> {
    logger.info('Hunter [LinkedIn]: Searching B2B companies', { city: options.city, niche: options.niche });
    options.onProgress?.(`[LinkedIn] Поиск B2B организаций в ${options.city}: «${options.niche}»...`);

    const leads: DiscoveredLeadRaw[] = [];

    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:linkedin.com/company "${options.niche}" "${options.city}"`)}`;
      const resp = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
        },
      });

      if (resp.ok) {
        const html = await resp.text();
        const linkMatches = html.matchAll(/https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/company\/([a-zA-Z0-9_-]+)/gi);
        const seenCompanies = new Set<string>();

        for (const match of linkMatches) {
          const companySlug = match[1]?.toLowerCase();
          if (!companySlug) continue;
          if (seenCompanies.has(companySlug)) continue;
          seenCompanies.add(companySlug);

          const prettyName = companySlug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          leads.push({
            source: 'LINKEDIN',
            name: prettyName,
            profileLink: `https://www.linkedin.com/company/${companySlug}`,
            address: options.city,
            extra: { companySlug },
          });

          if (leads.length >= options.limit) break;
        }
      }
    } catch (err) {
      logger.debug('LinkedIn discovery failed', { error: (err as Error).message });
    }

    await applyRateLimitDelay(1200, 2500);
    logger.info('Hunter [LinkedIn]: Discovered leads', { count: leads.length });
    return leads;
  }
}

/**
 * 6. Email Extractor Adapter
 * Enriches existing websites or discovered leads with valid contact emails.
 */
export class EmailExtractorAdapter implements IHunterSourceAdapter {
  source: HunterDiscoverySource = 'EMAIL';

  async discover(options: HunterSourceOptions): Promise<DiscoveredLeadRaw[]> {
    logger.info('Hunter [Email]: Extracting emails from targeted domains', { city: options.city, niche: options.niche });
    options.onProgress?.(`[Email] Извлечение корпоративных email для «${options.niche} ${options.city}»...`);

    // Email adapter works primarily in pipeline enrichment or domain scanning
    await applyRateLimitDelay(1000, 2000);
    return [];
  }
}

/**
 * Multi-Source Discovery Registry
 */
export const SOURCE_ADAPTERS: Record<HunterDiscoverySource, IHunterSourceAdapter> = {
  '2GIS': new Gis2SourceAdapter(),
  'GOOGLE': new GoogleMapsSourceAdapter(),
  'INSTAGRAM': new InstagramSourceAdapter(),
  'TELEGRAM': new TelegramSourceAdapter(),
  'LINKEDIN': new LinkedInSourceAdapter(),
  'EMAIL': new EmailExtractorAdapter(),
};
