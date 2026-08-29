import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { FirmResult } from './scraper.service';
import { logger } from '../../common/logger';

export interface ParserSession {
  id: string;
  userId: string;
  title: string;
  niche: string;
  city: string;
  country: string;
  createdAt: string;
  updatedAt: string;
  totalFound: number;
  withSiteCount: number;
  withoutSiteCount: number;
  whatsappCount: number;
  phonesCount: number;
  items: FirmResult[];
}

export type ParserSessionSummary = Omit<ParserSession, 'items'> & {
  itemsCount: number;
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'parser-sessions.json');

async function ensureFile(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(SESSIONS_FILE);
    } catch {
      await fs.writeFile(SESSIONS_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
  } catch (err) {
    logger.error('Failed to initialize parser sessions storage', { error: (err as Error).message });
  }
}

async function readAll(): Promise<ParserSession[]> {
  await ensureFile();
  try {
    const raw = await fs.readFile(SESSIONS_FILE, 'utf-8');
    return JSON.parse(raw) as ParserSession[];
  } catch {
    return [];
  }
}

async function writeAll(sessions: ParserSession[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}

export function generateSessionTitle(niche: string, city: string, date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const cleanNiche = (niche || 'Поиск').trim();
  const cleanCity = (city || '').trim();
  return `${cleanNiche} ${cleanCity} ${day}.${month}.${year}`.trim();
}

export async function getAllSessions(userId: string): Promise<ParserSessionSummary[]> {
  const all = await readAll();
  return all
    .filter((s) => s.userId === userId)
    .map((s) => ({
      id: s.id,
      userId: s.userId,
      title: s.title,
      niche: s.niche,
      city: s.city,
      country: s.country,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      totalFound: s.totalFound,
      withSiteCount: s.withSiteCount,
      withoutSiteCount: s.withoutSiteCount,
      whatsappCount: s.whatsappCount,
      phonesCount: s.phonesCount,
      itemsCount: s.items.length,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getSessionById(userId: string, id: string): Promise<ParserSession | null> {
  const all = await readAll();
  const found = all.find((s) => s.id === id && s.userId === userId);
  return found || null;
}

export async function saveSession(params: {
  id?: string;
  userId: string;
  title?: string;
  niche: string;
  city: string;
  country?: string;
  totalFound?: number;
  items: FirmResult[];
}): Promise<ParserSession> {
  const all = await readAll();
  const now = new Date().toISOString();
  const id = params.id || crypto.randomUUID();

  const withSiteCount = params.items.filter((it) => !!it.site).length;
  const withoutSiteCount = params.items.filter((it) => !it.site).length;
  const whatsappCount = params.items.filter((it) => !!it.whatsapp).length;
  const phonesCount = params.items.filter((it) => !!it.phone || !!it.whatsapp).length;
  const title = params.title?.trim() || generateSessionTitle(params.niche, params.city);

  const existingIdx = all.findIndex((s) => s.id === id && s.userId === params.userId);

  const newSession: ParserSession = {
    id,
    userId: params.userId,
    title,
    niche: params.niche,
    city: params.city,
    country: params.country || 'Казахстан',
    createdAt: existingIdx >= 0 ? all[existingIdx]!.createdAt : now,
    updatedAt: now,
    totalFound: params.totalFound || params.items.length,
    withSiteCount,
    withoutSiteCount,
    whatsappCount,
    phonesCount,
    items: params.items,
  };

  if (existingIdx >= 0) {
    all[existingIdx] = newSession;
  } else {
    all.unshift(newSession);
  }

  await writeAll(all);
  return newSession;
}

export async function updateSessionTitle(
  userId: string,
  id: string,
  title: string,
): Promise<ParserSession | null> {
  const all = await readAll();
  const idx = all.findIndex((s) => s.id === id && s.userId === userId);
  if (idx < 0) return null;

  all[idx]!.title = title.trim();
  all[idx]!.updatedAt = new Date().toISOString();
  await writeAll(all);
  return all[idx]!;
}

export async function deleteSession(userId: string, id: string): Promise<boolean> {
  const all = await readAll();
  const filtered = all.filter((s) => !(s.id === id && s.userId === userId));
  if (filtered.length === all.length) return false;
  await writeAll(filtered);
  return true;
}
