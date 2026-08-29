import type { Lead } from '@nexora/types';

export interface CsvColumnMapping {
  companyName?: string;
  phone?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  website?: string;
  city?: string;
  niche?: string;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** RFC-4180-tolerant parser: quoted fields, commas/escaped quotes inside. */
export function parseCsvText(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  const normalized = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && normalized[i + 1] === '\n') i++;
      pushRow();
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ''));

  const records = dataRows.map((r) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (r[index] ?? '').trim();
    });
    return record;
  });

  return { headers, rows: records };
}

const HEADER_ALIASES: Record<keyof CsvColumnMapping, string[]> = {
  companyName: ['company', 'companyname', 'company name', 'organisation', 'organization', 'business', 'businessname', 'name', 'фирма', 'компания'],
  phone: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'cell', 'номер', 'телефон'],
  whatsappUrl: ['whatsapp', 'whatsappurl', 'whatsapp url', 'wa', 'wartap', 'whatsapplink'],
  instagramUrl: ['instagram', 'instagramurl', 'instagram url', 'ig', 'instagramhandle'],
  website: ['website', 'web', 'site', 'url', 'domain', 'weburl', 'сайт'],
  city: ['city', 'town', 'location', 'город'],
  niche: ['niche', 'industry', 'sector', 'category', 'type', 'сфера', 'отрасль'],
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-zа-я0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Auto-suggest a column mapping from the CSV headers. */
export function suggestMapping(headers: string[]): CsvColumnMapping {
  const mapping: CsvColumnMapping = {};
  const usedHeaders = new Set<string>();

  const normalized = headers.map((h) => normalizeHeader(h));

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[keyof CsvColumnMapping, string[]]>) {
    let matchIndex = -1;
    let matchScore = 0;
    normalized.forEach((h, index) => {
      if (usedHeaders.has(headers[index])) return;
      if (aliases.includes(h)) {
        const score = aliases.indexOf(h) === 0 ? 3 : 2;
        if (score > matchScore) {
          matchScore = score;
          matchIndex = index;
        }
      } else if (field === 'whatsappUrl' && h.startsWith('whatsapp')) {
        matchScore = 1;
        matchIndex = index;
      }
    });
    if (matchIndex >= 0) {
      mapping[field] = headers[matchIndex];
      usedHeaders.add(headers[matchIndex]);
    }
  }

  return mapping;
}

export function applyMapping(row: Record<string, string>, mapping: CsvColumnMapping) {
  const pick = (field?: string): string | null => {
    if (!field) return null;
    const value = row[field]?.trim();
    return value ? value : null;
  };
  return {
    companyName: pick(mapping.companyName),
    phone: pick(mapping.phone),
    whatsappUrl: pick(mapping.whatsappUrl),
    instagramUrl: pick(mapping.instagramUrl),
    website: pick(mapping.website),
    city: pick(mapping.city),
    niche: pick(mapping.niche),
  };
}

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return '';
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface CsvExportColumn {
  header: string;
  value: (lead: Lead) => string | null | undefined;
}

export const DEFAULT_EXPORT_COLUMNS: CsvExportColumn[] = [
  { header: 'Company', value: (l) => l.companyName },
  { header: 'Phone', value: (l) => l.phone },
  { header: 'WhatsApp', value: (l) => l.whatsappUrl },
  { header: 'Instagram', value: (l) => l.instagramUrl },
  { header: 'Website', value: (l) => l.website },
  { header: 'City', value: (l) => l.city },
  { header: 'Niche', value: (l) => l.niche },
  { header: 'Status', value: (l) => l.status },
  { header: 'Source', value: (l) => l.source },
  { header: 'Account', value: (l) => l.assignedAccountId ?? null },
  { header: 'Created', value: (l) => l.createdAt.toISOString?.() ?? String(l.createdAt) },
];

export function buildExportCsv(leads: Lead[], columns: CsvExportColumn[] = DEFAULT_EXPORT_COLUMNS): string {
  const header = columns.map((c) => c.header).join(',');
  const body = leads
    .map((lead) => columns.map((c) => escapeCsv(c.value(lead))).join(','))
    .join('\n');
  return `${header}\n${body}`;
}