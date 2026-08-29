import { prisma } from '@nexora/database';
import type { Lead, LeadSource } from '@nexora/types';
import {
  buildFingerprint,
  buildWaLink,
  fingerprintKeys,
  parseBatch,
  parseCsvText,
  suggestMapping,
  applyMapping,
  type LeadCandidate,
  type CsvColumnMapping,
} from '@nexora/utils';
import { emitToUser } from '../../common/realtime/socket';
import { recordActivity } from '../../common/activity/recorder';
import type { ImportResult } from '@nexora/types';

export interface TextImportAnalysis {
  mode: 'text';
  content: string;
}

export interface CsvImportAnalysis {
  mode: 'csv';
  content: string;
  mapping?: CsvColumnMapping;
}

export function analyzeText(content: string) {
  return parseBatch(content);
}

export function analyzeCsv(content: string, mapping?: CsvColumnMapping) {
  const parsed = parseCsvText(content);
  const suggested = mapping ?? suggestMapping(parsed.headers);
  const candidates = parsed.rows.map((row) => applyMapping(row, suggested));
  return { parsed, suggestedMapping: suggested, candidates };
}

/** Convert parsed import records into lead candidates. */
export function candidatesFromAnalysis(
  analysis: ReturnType<typeof analyzeText>,
  defaults: { niche?: string; city?: string; source?: LeadSource },
): LeadCandidate[] {
  const candidates: LeadCandidate[] = [];
  for (const record of analysis.preview) {
    if (record.error) continue;
    switch (record.type) {
      case 'WA_LINK':
      case 'PHONE':
        if (record.normalizedValue) {
          candidates.push({
            phone: record.normalizedValue,
            whatsappUrl: buildWaLink(record.normalizedValue),
            niche: defaults.niche,
            city: defaults.city,
            source: defaults.source ?? (record.type === 'WA_LINK' ? 'WA_LINK' : 'PHONE'),
          });
        }
        break;
      case 'INSTAGRAM':
        if (record.normalizedValue) {
          candidates.push({
            instagramUrl: `https://instagram.com/${record.normalizedValue}`,
            niche: defaults.niche,
            city: defaults.city,
            source: defaults.source ?? 'INSTAGRAM',
          });
        }
        break;
      case 'WEBSITE':
        if (record.normalizedValue) {
          candidates.push({
            website: record.normalizedValue,
            niche: defaults.niche,
            city: defaults.city,
            source: defaults.source ?? 'WEBSITE',
          });
        }
        break;
      default:
        break;
    }
  }
  return candidates;
}

/** Collapse duplicates *within* the batch itself. */
export function dedupeBatch(candidates: LeadCandidate[]): LeadCandidate[] {
  const seen = new Set<string>();
  const unique: LeadCandidate[] = [];
  for (const candidate of candidates) {
    const fp = buildFingerprint(candidate);
    let key = '';
    for (const fk of fingerprintKeys()) {
      if (fp[fk]) {
        key = `${fk}:${fp[fk]}`;
        break;
      }
    }
    if (!key || !seen.has(key)) {
      if (key) seen.add(key);
      unique.push(candidate);
    }
  }
  return unique;
}

export interface DedupAgainstDbResult {
  newCandidates: LeadCandidate[];
  duplicates: number;
}

/** Split candidates against leads already in the database. */
export async function dedupAgainstDb(
  userId: string,
  candidates: LeadCandidate[],
): Promise<DedupAgainstDbResult> {
  const existing = await prisma.lead.findMany({
    where: { userId },
    select: {
      companyName: true,
      phone: true,
      whatsappUrl: true,
      instagramUrl: true,
      website: true,
    },
  });
  const seen = new Set<string>();
  for (const lead of existing) {
    const fp = buildFingerprint({
      companyName: lead.companyName,
      phone: lead.phone ?? undefined,
      whatsappUrl: lead.whatsappUrl ?? undefined,
      instagramUrl: lead.instagramUrl ?? undefined,
      website: lead.website ?? undefined,
    });
    for (const fk of fingerprintKeys()) {
      const value = fp[fk];
      if (value) seen.add(`${fk}:${value}`);
    }
  }

  const newCandidates: LeadCandidate[] = [];
  let duplicates = 0;
  for (const candidate of candidates) {
    const fp = buildFingerprint(candidate);
    let isDup = false;
    for (const fk of fingerprintKeys()) {
      const value = fp[fk];
      if (value && seen.has(`${fk}:${value}`)) {
        isDup = true;
        break;
      }
    }
    if (isDup) duplicates++;
    else newCandidates.push(candidate);
  }
  return { newCandidates, duplicates };
}

export async function performImport(
  userId: string,
  candidates: LeadCandidate[],
  strategy: 'new' | 'all',
): Promise<ImportResult> {
  const { newCandidates, duplicates } = await dedupAgainstDb(userId, candidates);
  const toImport = strategy === 'new' ? newCandidates : candidates;

  let imported = 0;
  const errors: string[] = [];
  const created: string[] = [];

  for (const candidate of toImport) {
    try {
      const source = (candidate as { source?: string }).source ?? 'MANUAL';
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: candidate.companyName ?? null,
          phone: candidate.phone ?? null,
          whatsappUrl: candidate.whatsappUrl ?? null,
          instagramUrl: candidate.instagramUrl ?? null,
          website: candidate.website ?? null,
          city: candidate.city ?? null,
          niche: candidate.niche ?? null,
          source: (source as LeadSource) ?? 'MANUAL',
          notes: candidate.notes ?? null,
        },
      });
      imported++;
      created.push(lead.id);
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  if (created.length > 0) {
    emitToUser(userId, 'leads.imported', { count: created.length });
    await recordActivity({
      userId,
      action: 'IMPORT_COMPLETED',
      entity: 'LEAD',
      metadata: { imported, duplicates, strategy, isDemo: false },
    });
  }

  return { imported, duplicates, skipped: candidates.length - imported, errors };
}

export type { Lead };
export { LeadSource };