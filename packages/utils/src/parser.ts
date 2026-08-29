import type { ImportAnalysis, ImportPreviewRecord } from '@nexora/types';
import { isPhoneLike, normalizePhone } from './phone';

const WA_ME_RE = /(?:https?:\/\/)?(?:www\.)?wa\.me\/(\+?\d[\d\s()\-.]*)/i;
const WA_API_RE =
  /(?:https?:\/\/)?(?:api|chat)\.whatsapp\.com\/(?:send|index\.html)\?.*?phone=(\+?\d[\d\s()\-.]*)/i;
const WA_CHAT_RE = /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/phone\/?/i;
const INSTAGRAM_RE = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p\/|reel\/|stories\/)?([a-zA-Z0-9_.-]+)/i;
const WEBSITE_RE =
  /^(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z]{2,})(?:\/[\w\-./?%&=]*)?$/;

export type DetectedType = ImportPreviewRecord['type'];

/**
 * Classify and normalize a single raw entry pasted into the importer.
 * The original value is preserved on the record — normalization never
 * destroys source data.
 */
export function parseSingle(rawValue: string): ImportPreviewRecord {
  const originalValue = rawValue.trim();
  if (originalValue === '') {
    return { originalValue, normalizedValue: null, type: 'UNDETECTED', error: 'Empty entry' };
  }

  const waMe = originalValue.match(WA_ME_RE);
  if (waMe) {
    return parsePhoneFromMatch(originalValue, waMe[1], 'WA_LINK');
  }

  const waApi = originalValue.match(WA_API_RE);
  if (waApi) {
    return parsePhoneFromMatch(originalValue, waApi[1], 'WA_LINK');
  }

  if (WA_CHAT_RE.test(originalValue)) {
    return {
      originalValue,
      normalizedValue: null,
      type: 'WA_LINK',
      error: 'whatsapp.com/phone link does not embed a contact number',
    };
  }

  const instagram = originalValue.match(INSTAGRAM_RE);
  if (instagram) {
    return {
      originalValue,
      normalizedValue: instagram[1].toLowerCase(),
      type: 'INSTAGRAM',
      error: null,
    };
  }

  if (isPhoneLike(originalValue)) {
    const normalizedValue = normalizePhone(originalValue);
    if (!normalizedValue) {
      return { originalValue, normalizedValue: null, type: 'PHONE', error: 'No digits found' };
    }
    return { originalValue, normalizedValue, type: 'PHONE', error: null };
  }

  if (WEBSITE_RE.test(originalValue)) {
    return { originalValue, normalizedValue: originalValue, type: 'WEBSITE', error: null };
  }

  return {
    originalValue,
    normalizedValue: null,
    type: 'UNDETECTED',
    error: 'Unrecognized format',
  };
}

function parsePhoneFromMatch(
  originalValue: string,
  rawNumber: string,
  type: DetectedType,
): ImportPreviewRecord {
  const normalizedValue = normalizePhone(rawNumber);
  if (!normalizedValue) {
    return { originalValue, normalizedValue: null, type, error: 'No digits found in link' };
  }
  return { originalValue, normalizedValue, type, error: null };
}

/** Analyze a multi-line pasted payload into a preview + counts. */
export function parseBatch(rawText: string): ImportAnalysis {
  const entries = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const preview = entries.map(parseSingle);

  const detected = {
    waLinks: preview.filter((p) => p.type === 'WA_LINK').length,
    phones: preview.filter((p) => p.type === 'PHONE').length,
    instagram: preview.filter((p) => p.type === 'INSTAGRAM').length,
    websites: preview.filter((p) => p.type === 'WEBSITE').length,
    undetected: preview.filter((p) => p.type === 'UNDETECTED').length,
  };

  return { detected, preview };
}