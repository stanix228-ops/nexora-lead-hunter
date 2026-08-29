import type { Lead, LeadSource } from '@nexora/types';
import { normalizePhone } from './phone';

export interface LeadCandidate {
  companyName?: string | null;
  phone?: string | null;
  whatsappUrl?: string | null;
  instagramUrl?: string | null;
  website?: string | null;
  city?: string | null;
  niche?: string | null;
  source?: LeadSource | string;
  notes?: string | null;
}

export interface LeadFingerprint {
  phone?: string;
  whatsappNumber?: string;
  websiteHost?: string;
  instagramHandle?: string;
  companyPhone?: string;
}

/**
 * Deduplication keys, in priority order (see product spec):
 *  1. normalized phone
 *  2. whatsapp URL (normalized to digits)
 *  3. website
 *  4. Instagram
 *  5. combination of company + phone
 */
export function buildFingerprint(candidate: LeadCandidate): LeadFingerprint {
  const fp: LeadFingerprint = {};

  if (candidate.phone) {
    const digits = normalizePhone(candidate.phone);
    if (digits) fp.phone = digits;
  }
  if (candidate.whatsappUrl) {
    const digits = normalizePhone(candidate.whatsappUrl);
    if (digits) fp.whatsappNumber = digits;
  }
  if (candidate.website) {
    const host = hostFromUrl(candidate.website);
    if (host) fp.websiteHost = host;
  }
  if (candidate.instagramUrl) {
    const handle = instagramHandleFromUrl(candidate.instagramUrl);
    if (handle) fp.instagramHandle = handle;
  }
  const company = candidate.companyName?.trim().toLowerCase();
  if (company && fp.phone) {
    fp.companyPhone = `${company}::${fp.phone}`;
  }
  return fp;
}

/** The set of keys that must be unique for a fingerprint map. */
export function fingerprintKeys(): (keyof LeadFingerprint)[] {
  return ['phone', 'whatsappNumber', 'websiteHost', 'instagramHandle', 'companyPhone'];
}

function hostFromUrl(url: string): string | null {
  const m = url.match(/^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][a-zA-Z0-9.-]*)/);
  return m ? m[1].toLowerCase() : null;
}

function instagramHandleFromUrl(url: string): string | null {
  const m = url.match(/(?:instagram\.com)\/([a-zA-Z0-9_.]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** For URL-typed candidate fields, produce a sortable unique key. */
export function uniqueValue(candidate: LeadCandidate, key: keyof LeadCandidate): string {
  const value = candidate[key];
  if (!value) return '';
  const text = value.trim().toLowerCase();
  if (key === 'phone' || key === 'whatsappUrl') {
    return normalizePhone(text);
  }
  return text;
}

/**
 * Given a list of candidate leads (new import batch) and the existing
 * leads (from the database), return which candidates are new vs dupes.
 */
export function splitDuplicates(
  candidates: LeadCandidate[],
  existing: Lead[],
): { newCandidates: LeadCandidate[]; duplicateIndices: number[]; duplicateNames: string[] } {
  const seen = new Set<string>();
  for (const lead of existing) {
    const fp = buildFingerprint({
      companyName: lead.companyName,
      phone: lead.phone ?? undefined,
      whatsappUrl: lead.whatsappUrl ?? undefined,
      instagramUrl: lead.instagramUrl ?? undefined,
      website: lead.website ?? undefined,
    });
    for (const key of fingerprintKeys()) {
      const value = fp[key];
      if (value) seen.add(`${key}:${value}`);
    }
  }

  const newCandidates: LeadCandidate[] = [];
  const duplicateIndices: number[] = [];
  const duplicateNames: string[] = [];

  candidates.forEach((candidate, index) => {
    const fp = buildFingerprint(candidate);
    let isDuplicate = false;
    for (const key of fingerprintKeys()) {
      const value = fp[key];
      if (value && seen.has(`${key}:${value}`)) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) {
      duplicateIndices.push(index);
      duplicateNames.push(candidate.companyName ?? candidate.phone ?? `Row ${index + 1}`);
    } else {
      newCandidates.push(candidate);
    }
  });

  return { newCandidates, duplicateIndices, duplicateNames };
}