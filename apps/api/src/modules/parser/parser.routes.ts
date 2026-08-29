import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { LeadSource, LeadStatus } from '@nexora/database';
import { normalizePhone, buildWaLink, maskPhone } from '@nexora/utils';
import { asyncHandler, NotFoundError, AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { emitToUser } from '../../common/realtime/socket';
import { CITIES, getCitiesByCountry, getCityConfig } from './cities';
import { US_STATES_MAP, US_NICHE_SUGGESTIONS } from './us-cities';
import { parseSearchPage, type FirmResult } from './scraper.service';
import { scrapeGoogleMaps } from './google-scraper.service';
import {
  getAllSessions,
  getSessionById,
  saveSession,
  updateSessionTitle,
  deleteSession,
} from './sessions.service';

export const parserRouter: import('express').Router = Router();

const searchCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(city: string, niche: string, limit: number, options?: Record<string, any>): string {
  const optStr = JSON.stringify(options || {});
  return `${city.toLowerCase()}|${niche.toLowerCase()}|${limit}|${optStr}`;
}

const firmItemSchema = z.object({
  name: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  allPhones: z.array(z.string()).optional(),
  whatsapp: z.string().optional().nullable(),
  instagram: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  site: z.string().optional().nullable(),
  schedule: z.string().optional().nullable(),
  rating: z.number().optional().nullable(),
  reviewsCount: z.number().optional().nullable(),
  vk: z.string().optional().nullable(),
  telegram: z.string().optional().nullable(),
  profileLink: z.string().optional().nullable(),
});

/**
 * GET /api/parser/cities
 * Returns dictionary of all supported countries and cities.
 */
parserRouter.get(
  '/cities',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      countries: getCitiesByCountry(),
      list: CITIES,
    });
  }),
);

/**
 * GET /api/parser/sessions
 * List all saved parsing history sessions for the current user.
 */
parserRouter.get(
  '/sessions',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const list = await getAllSessions(userId);
    res.json({ items: list });
  }),
);

/**
 * GET /api/parser/sessions/:id
 * Get full session details with all leads.
 */
parserRouter.get(
  '/sessions/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const session = await getSessionById(userId, String(req.params.id));
    if (!session) throw new NotFoundError('Сохраненный сбор не найден');
    res.json(session);
  }),
);

/**
 * POST /api/parser/sessions
 * Save or update a session.
 */
parserRouter.post(
  '/sessions',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const schema = z.object({
      id: z.string().optional(),
      title: z.string().optional(),
      niche: z.string().min(1),
      city: z.string().min(1),
      country: z.string().optional(),
      totalFound: z.number().optional(),
      items: z.array(firmItemSchema),
    });
    const body = schema.parse(req.body);

    const session = await saveSession({
      id: body.id,
      userId,
      title: body.title,
      niche: body.niche,
      city: body.city,
      country: body.country,
      totalFound: body.totalFound,
      items: body.items as FirmResult[],
    });

    res.json(session);
  }),
);

/**
 * PATCH /api/parser/sessions/:id
 * Rename session title.
 */
parserRouter.patch(
  '/sessions/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { title } = z.object({ title: z.string().min(1) }).parse(req.body);
    const updated = await updateSessionTitle(userId, String(req.params.id), title);
    if (!updated) throw new NotFoundError('Сохраненный сбор не найден');
    res.json(updated);
  }),
);

/**
 * DELETE /api/parser/sessions/:id
 * Delete a session.
 */
parserRouter.delete(
  '/sessions/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const deleted = await deleteSession(userId, String(req.params.id));
    if (!deleted) throw new NotFoundError('Сохраненный сбор не найден');
    res.json({ success: true });
  }),
);

/**
 * GET /api/parser/search
 * Live Server-Sent Events (SSE) streaming endpoint.
 */
parserRouter.get(
  '/search',
  asyncHandler(async (req: Request, res: Response) => {
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    const niche = typeof req.query.niche === 'string' ? req.query.niche.trim() : '';
    const country = typeof req.query.country === 'string' ? req.query.country.trim() : undefined;
    const websiteFilter = (req.query.websiteFilter as 'all' | 'with_site' | 'without_site') || 'all';
    const whatsappFilter = (req.query.whatsappFilter as 'all' | 'with_wa') || 'all';
    const phoneFilter = (req.query.phoneFilter as 'all' | 'with_phone') || 'all';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '30'), 10) || 30, 1), 10000);

    if (!city) {
      res.status(400).json({ error: 'Укажите город' });
      return;
    }
    if (!niche) {
      res.status(400).json({ error: 'Укажите нишу для поиска' });
      return;
    }

    const cfg = getCityConfig(city, country);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let closed = false;
    const send = (type: string, data: any) => {
      if (!closed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    };

    const heartbeat = setInterval(() => {
      if (!closed && !res.writableEnded) {
        res.write(': heartbeat\n\n');
      }
    }, 12000);

    req.on('close', () => {
      closed = true;
      clearInterval(heartbeat);
    });

    const searchOptions = {
      country,
      websiteFilter,
      whatsappFilter,
      phoneFilter,
    };

    const cacheKey = getCacheKey(cfg.name, niche, limit, searchOptions);
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      send('progress', { message: 'Загружено из кэша' });
      for (const item of cached.data.results || []) {
        send('result', item);
      }
      send('complete', {
        total: cached.data.total,
        results: cached.data.results?.length || 0,
        city: cached.data.city,
        country: cached.data.country,
        niche: cached.data.niche,
        url: cached.data.url,
      });
      clearInterval(heartbeat);
      res.end();
      return;
    }

    try {
      const data = await parseSearchPage(cfg.name, niche, limit, searchOptions, (msg) => {
        if (closed) return;
        if (typeof msg === 'object' && msg.type === 'result') {
          send('result', msg.data);
        } else if (typeof msg === 'string') {
          send('progress', { message: msg });
        }
      });

      if (!closed && !res.writableEnded) {
        searchCache.set(cacheKey, { data, timestamp: Date.now() });

        // Auto-save batch to history
        const savedSession = await saveSession({
          userId: req.user!.id,
          niche: data.niche,
          city: data.city,
          country: data.country,
          totalFound: data.total,
          items: data.results,
        }).catch((err) => {
          logger.error('Failed to auto-save parser session', { error: err.message });
          return null;
        });

        send('complete', {
          sessionId: savedSession?.id,
          sessionTitle: savedSession?.title,
          total: data.total,
          results: data.results.length,
          city: data.city,
          country: data.country,
          niche: data.niche,
          url: data.url,
        });
      }
    } catch (err) {
      logger.error('2GIS Search Error', { city, niche, error: (err as Error).message });
      send('error', { error: (err as Error).message });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }),
);

/**
 * GET /api/parser/google/cities
 * Returns US states, cities, and niche suggestions.
 */
parserRouter.get(
  '/google/cities',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      states: US_STATES_MAP,
      niches: US_NICHE_SUGGESTIONS,
    });
  }),
);

/**
 * GET /api/parser/google/search
 * Live Server-Sent Events (SSE) streaming endpoint for Google Maps scraper.
 */
parserRouter.get(
  '/google/search',
  asyncHandler(async (req: Request, res: Response) => {
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    const niche = typeof req.query.niche === 'string' ? req.query.niche.trim() : '';
    const state = typeof req.query.state === 'string' ? req.query.state.trim() : undefined;
    const websiteFilter = (req.query.websiteFilter as 'all' | 'with_site' | 'without_site') || 'all';
    const phoneFilter = (req.query.phoneFilter as 'all' | 'with_phone') || 'all';
    const emailFilter = (req.query.emailFilter as 'all' | 'with_email') || 'all';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '30'), 10) || 30, 1), 10000);

    if (!city) {
      res.status(400).json({ error: 'Укажите город или ZIP-код США' });
      return;
    }
    if (!niche) {
      res.status(400).json({ error: 'Укажите нишу для поиска' });
      return;
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let closed = false;
    const send = (type: string, data: any) => {
      if (!closed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    };

    const heartbeat = setInterval(() => {
      if (!closed && !res.writableEnded) {
        res.write(': heartbeat\n\n');
      }
    }, 12000);

    req.on('close', () => {
      closed = true;
      clearInterval(heartbeat);
    });

    const searchOptions = {
      state,
      websiteFilter,
      phoneFilter,
      emailFilter,
    };

    try {
      const data = await scrapeGoogleMaps(city, niche, limit, searchOptions, (msg) => {
        if (closed) return;
        if (typeof msg === 'object' && msg.type === 'result') {
          send('result', msg.data);
        } else if (typeof msg === 'string') {
          send('progress', { message: msg });
        }
      });

      if (!closed && !res.writableEnded) {
        // Auto-save batch to history
        const savedSession = await saveSession({
          userId: req.user!.id,
          niche: data.niche,
          city: data.city,
          country: 'USA',
          totalFound: data.total,
          items: data.results,
        }).catch((err) => {
          logger.error('Failed to auto-save Google Maps parser session', { error: err.message });
          return null;
        });

        send('complete', {
          sessionId: savedSession?.id,
          sessionTitle: savedSession?.title,
          total: data.total,
          results: data.results.length,
          city: data.city,
          country: 'USA',
          niche: data.niche,
          url: data.url,
        });
      }
    } catch (err) {
      logger.error('Google Maps Search Error', { city, niche, error: (err as Error).message });
      send('error', { error: (err as Error).message });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }),
);

/**
 * POST /api/parser/add-to-whatsapp
 * Batch add parsed leads directly to chosen WhatsApp account(s) with smart distribution.
 */
parserRouter.post(
  '/add-to-whatsapp',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const schema = z.object({
      accountId: z.string().optional(),
      accountIds: z.array(z.string()).optional(),
      distributionMode: z.enum(['single', 'round_robin', 'batch']).optional().default('single'),
      perAccountLimit: z.number().optional().default(20),
      items: z.array(firmItemSchema),
      city: z.string().optional(),
      niche: z.string().optional(),
    });
    const body = schema.parse(req.body);

    const targetAccountIds: string[] = [];
    if (Array.isArray(body.accountIds) && body.accountIds.length > 0) {
      targetAccountIds.push(...body.accountIds);
    } else if (body.accountId) {
      targetAccountIds.push(body.accountId);
    }

    if (targetAccountIds.length === 0) {
      throw new AppError(400, 'Выберите хотя бы один WhatsApp аккаунт для добавления лидов.', 'NO_ACCOUNT');
    }

    const accounts = await prisma.whatsAppAccount.findMany({
      where: { id: { in: targetAccountIds }, userId },
    });

    if (accounts.length === 0) {
      throw new NotFoundError('Выбранные WhatsApp аккаунты не найдены.');
    }

    let addedCount = 0;
    let skippedCount = 0;
    const createdConversations = [];
    const statsMap = new Map<string, number>();

    // 1. Deduplicate incoming items by normalized phone number
    const uniqueItems: Array<{ item: (typeof body.items)[0]; digits: string }> = [];
    const seenPhones = new Set<string>();

    for (const item of body.items) {
      let rawPhone = item.phone || '';
      if (!rawPhone && item.whatsapp) {
        const waMatch = item.whatsapp.match(/\d{7,15}/);
        if (waMatch) rawPhone = waMatch[0];
      }

      const digits = normalizePhone(rawPhone);
      if (!digits || digits.length < 7) {
        skippedCount++;
        continue;
      }

      if (seenPhones.has(digits)) {
        // Skip duplicate in current batch
        continue;
      }
      seenPhones.add(digits);
      uniqueItems.push({ item, digits });
    }

    const perLimit = Math.max(1, body.perAccountLimit || 20);

    // 2. Distribute uniquely across target accounts
    for (let i = 0; i < uniqueItems.length; i++) {
      const { item, digits } = uniqueItems[i]!;

      // Determine target account based on distribution mode
      let targetAccount = accounts[0]!;
      if (body.distributionMode === 'round_robin') {
        targetAccount = accounts[i % accounts.length]!;
      } else if (body.distributionMode === 'batch') {
        const accIndex = Math.min(Math.floor(i / perLimit), accounts.length - 1);
        targetAccount = accounts[accIndex]!;
      }

      const noteLines: string[] = [];
      if (item.address) noteLines.push(`Адрес: ${item.address}`);
      if (item.schedule) noteLines.push(`График: ${item.schedule}`);
      if (item.email) noteLines.push(`Email: ${item.email}`);
      if (item.telegram) noteLines.push(`Telegram: ${item.telegram}`);
      if (item.vk) noteLines.push(`VK: ${item.vk}`);
      if (item.profileLink) noteLines.push(`2GIS: ${item.profileLink}`);
      if (item.site) noteLines.push(`Сайт: ${item.site}`);
      const notes = noteLines.join('\n');

      const lead = await prisma.lead.upsert({
        where: { userId_phone: { userId, phone: digits } },
        update: {
          companyName: item.name || maskPhone(digits),
          whatsappUrl: item.whatsapp || buildWaLink(digits),
          instagramUrl: item.instagram || undefined,
          website: item.site || undefined,
          city: body.city || undefined,
          niche: body.niche || undefined,
          notes: notes || undefined,
          assignedAccountId: targetAccount.id,
        },
        create: {
          userId,
          companyName: item.name || maskPhone(digits),
          phone: digits,
          whatsappUrl: item.whatsapp || buildWaLink(digits),
          instagramUrl: item.instagram || null,
          website: item.site || null,
          city: body.city || null,
          niche: body.niche || null,
          source: 'WA_LINK' as LeadSource,
          status: 'NEW' as LeadStatus,
          notes: notes || null,
          assignedAccountId: targetAccount.id,
        },
      });

      // Remove any unstarted/empty conversations on OTHER accounts for this lead
      // so the lead is strictly on the newly assigned account without duplicate appearances
      await prisma.conversation.deleteMany({
        where: {
          leadId: lead.id,
          accountId: { not: targetAccount.id },
          messages: { none: {} },
        },
      });

      const conversation = await prisma.conversation.upsert({
        where: { accountId_leadId: { accountId: targetAccount.id, leadId: lead.id } },
        update: {},
        create: {
          userId,
          accountId: targetAccount.id,
          leadId: lead.id,
          status: 'NEW',
          unreadCount: 0,
        },
        include: {
          lead: true,
          account: { select: { id: true, name: true, phoneMasked: true } },
        },
      });

      if (uniqueItems.length <= 5) {
        emitToUser(userId, 'conversation.created', conversation);
      }
      createdConversations.push({
        id: conversation.id,
        leadId: lead.id,
        accountId: targetAccount.id,
        accountName: targetAccount.name,
        phone: digits,
        name: lead.companyName,
      });

      statsMap.set(targetAccount.id, (statsMap.get(targetAccount.id) || 0) + 1);
      addedCount++;
    }

    if (uniqueItems.length > 5) {
      emitToUser(userId, 'conversation.updated', { count: addedCount });
    }

    res.json({
      added: addedCount,
      skipped: skippedCount,
      mode: body.distributionMode,
      distribution: accounts.map((acc) => ({
        accountId: acc.id,
        accountName: acc.name,
        phoneMasked: acc.phoneMasked,
        count: statsMap.get(acc.id) || 0,
      })),
      conversations: createdConversations,
    });
  }),
);

const importSchema = z.object({
  items: z.array(firmItemSchema),
  city: z.string().optional(),
  country: z.string().optional(),
  niche: z.string().optional(),
  campaignId: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
  skipDuplicates: z.boolean().optional().default(true),
});

/**
 * POST /api/parser/import
 * Batch import parsed 2GIS results into user's Leads table.
 */
parserRouter.post(
  '/import',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const body = importSchema.parse(req.body);

    let imported = 0;
    let duplicates = 0;
    let skipped = 0;
    const leadIds: string[] = [];

    for (const item of body.items) {
      let rawPhone = item.phone || '';
      if (!rawPhone && item.whatsapp) {
        const waMatch = item.whatsapp.match(/\d{7,15}/);
        if (waMatch) rawPhone = waMatch[0];
      }

      const digits = normalizePhone(rawPhone);
      if (!digits || digits.length < 7) {
        skipped++;
        continue;
      }

      // Check if lead already exists by phone
      const existing = await prisma.lead.findFirst({
        where: { userId, phone: digits },
      });

      if (existing) {
        duplicates++;
        if (body.skipDuplicates) {
          continue;
        }
      }

      // Format notes with additional 2GIS data
      const noteLines: string[] = [];
      if (item.address) noteLines.push(`Адрес: ${item.address}`);
      if (item.schedule) noteLines.push(`График: ${item.schedule}`);
      if (item.email) noteLines.push(`Email: ${item.email}`);
      if (item.telegram) noteLines.push(`Telegram: ${item.telegram}`);
      if (item.vk) noteLines.push(`VK: ${item.vk}`);
      if (item.profileLink) noteLines.push(`2GIS: ${item.profileLink}`);
      const notes = noteLines.join('\n');

      const lead = await prisma.lead.upsert({
        where: { userId_phone: { userId, phone: digits } },
        update: {
          companyName: item.name || maskPhone(digits),
          whatsappUrl: item.whatsapp || buildWaLink(digits),
          instagramUrl: item.instagram || undefined,
          website: item.site || undefined,
          city: body.city || undefined,
          niche: body.niche || undefined,
          notes: notes || undefined,
        },
        create: {
          userId,
          companyName: item.name || maskPhone(digits),
          phone: digits,
          whatsappUrl: item.whatsapp || buildWaLink(digits),
          instagramUrl: item.instagram || null,
          website: item.site || null,
          city: body.city || null,
          niche: body.niche || null,
          source: 'MANUAL' as LeadSource,
          status: 'NEW' as LeadStatus,
          notes: notes || null,
        },
      });

      leadIds.push(lead.id);
      imported++;
      emitToUser(userId, 'lead.created', lead);

      // If campaign assigned, link lead to campaign
      if (body.campaignId) {
        try {
          await prisma.campaignLead.upsert({
            where: { campaignId_leadId: { campaignId: body.campaignId, leadId: lead.id } },
            update: {},
            create: {
              campaignId: body.campaignId,
              leadId: lead.id,
            },
          });
        } catch {
          /* ignore duplicate link */
        }
      }
    }

    res.json({
      imported,
      duplicates,
      skipped,
      totalProcessed: body.items.length,
      leadIds,
    });
  }),
);

