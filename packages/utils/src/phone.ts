/**
 * Phone number normalization and formatting helpers.
 *
 * Normalization contract (product spec):
 *  - keep digits only
 *  - strip spaces, `+`, parentheses, hyphens and other separators
 *  - convert CIS local trunk prefix `8` to `7` for 11-digit numbers
 *  - ensure North American (US/CA +1) numbers are properly normalized to 11 digits (1XXXXXXXXXX)
 *  - preserve international country codes (+44, +49, +380, +998, etc.)
 */

const NON_DIGIT = /\D/g;

/** Strip every non-digit character. */
export function digitsOnly(value: string): string {
  return value ? value.replace(NON_DIGIT, '') : '';
}

/**
 * Normalize a phone number to an international E.164-style digit string
 * WITHOUT the leading `+`.
 *
 * Examples:
 *   '+1 (415) 555-2671'  -> '14155552671'
 *   '(818) 555-0199'     -> '18185550199' (US California area code 818)
 *   '+7 700 123 45 67'   -> '77001234567'
 *   '8 700 123 45 67'    -> '77001234567'
 *   'https://wa.me/14155552671' -> '14155552671'
 */
export function normalizePhone(value: string): string {
  if (!value) return '';
  const raw = String(value).trim();
  let digits = digitsOnly(raw);
  if (!digits) return '';

  // 1. Explicit +1 or 1- or 1. or 1 (xxx) (US/Canada international format)
  const hasExplicitUsPrefix =
    raw.startsWith('+1') ||
    raw.startsWith('1-') ||
    raw.startsWith('1 (') ||
    raw.startsWith('1.') ||
    raw.startsWith('1 ');

  if (hasExplicitUsPrefix) {
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits;
    }
    if (digits.length === 10) {
      return '1' + digits;
    }
  }

  // 2. Already an 11-digit US number starting with 1 (e.g. 14155552671, 18185550199)
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits;
  }

  // 3. CIS 11-digit numbers with local trunk prefix '8' (e.g. 89161234567, 87011234567, 83121234567)
  // Only convert 8 -> 7 if length is 11 and NOT starting with international '+' like +86 China, +81 Japan, +82 Korea, +84 Vietnam, +852 HK
  if (digits.length === 11 && digits.startsWith('8')) {
    if (!raw.startsWith('+8')) {
      digits = '7' + digits.slice(1);
      return digits;
    }
  }

  // 4. 10-digit phone numbers:
  if (digits.length === 10) {
    // US area codes span 200..999.
    // If it starts with 2, 3, 4, 5, 6, 8, it is definitively a North American 10-digit number (e.g. 212, 305, 415, 510, 619, 818, 858).
    if (/^[2-68]/.test(digits)) {
      return '1' + digits;
    }
    // If it starts with 9 (e.g. 917 NYC, 949 CA, 916 CA, or Russian 9xx):
    // If raw contains US pattern like '(917) 555-1234', '917-555-1234', or explicit +1
    if (raw.includes('+1') || /^\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}$/.test(raw)) {
      return '1' + digits;
    }
    // Default 10-digit starting with 9 or 7 in CIS:
    if (digits.startsWith('9')) {
      return '7' + digits;
    }
    if (digits.startsWith('7')) {
      return '7' + digits;
    }
  }

  return digits;
}

/** Return digits only if the input plausibly represents a phone number. */
export function isPhoneLike(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length >= 7 && digits.length <= 15;
}

const COUNTRY_PREFIX: Array<[string, string]> = [
  ['1', '+1'], // US / CA
  ['7', '+7'], // KZ / RU
  ['380', '+380'], // UA
  ['375', '+375'], // BY
  ['998', '+998'], // UZ
  ['996', '+996'], // KG
  ['992', '+992'], // TJ
  ['993', '+993'], // TM
  ['994', '+994'], // AZ
  ['995', '+995'], // GE
  ['374', '+374'], // AM
  ['373', '+373'], // MD
  ['86', '+86'], // CN
  ['81', '+81'], // JP
  ['82', '+82'], // KR
  ['44', '+44'], // GB
  ['49', '+49'], // DE
  ['33', '+33'], // FR
  ['39', '+39'], // IT
  ['34', '+34'], // ES
  ['48', '+48'], // PL
  ['40', '+40'], // RO
  ['420', '+420'], // CZ
  ['90', '+90'], // TR
  ['971', '+971'], // AE
  ['966', '+966'], // SA
  ['91', '+91'], // IN
  ['92', '+92'], // PK
  ['93', '+93'], // AF
  ['61', '+61'], // AU
  ['55', '+55'], // BR
  ['52', '+52'], // MX
];

/**
 * Best-effort detection of the international calling code from the
 * normalized digit string. Returns the code with a leading `+` or null.
 */
export function detectCountryCode(normalizedDigits: string): string | null {
  if (!normalizedDigits) return null;
  // Match longer prefixes first
  const sorted = [...COUNTRY_PREFIX].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, code] of sorted) {
    if (normalizedDigits.startsWith(prefix)) return code;
  }
  return null;
}

/** Convert a normalized digit string to a wa.me deep link. */
export function buildWaLink(normalizedDigits: string): string {
  const norm = normalizePhone(normalizedDigits);
  return `https://wa.me/${norm || normalizedDigits}`;
}

/** Format a normalized phone into human-friendly international presentation. */
export function formatPhone(phone: string): string {
  const d = normalizePhone(phone);
  if (!d) return phone;
  // US / Canada: 14155552671 -> +1 (415) 555-2671
  if (d.startsWith('1') && d.length === 11) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
  }
  // CIS: 77011234567 -> +7 (701) 123-45-67
  if (d.startsWith('7') && d.length === 11) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return `+${d}`;
}

/** Mask a phone for display: +1 (415) ***-2671 or +7 (701) ***-**-67 */
export function maskPhone(digits: string): string {
  const d = normalizePhone(digits) || digits.replace(NON_DIGIT, '');
  if (d.length < 7) return d;

  // US (+1): 14155552671 -> +1 (415) ***-2671
  if (d.startsWith('1') && d.length === 11) {
    return `+1 (${d.slice(1, 4)}) ***-${d.slice(7, 11)}`;
  }
  // CIS (+7): 77011234567 -> +7 (701) ***-**-67
  if (d.startsWith('7') && d.length === 11) {
    return `+7 (${d.slice(1, 4)}) ***-**-${d.slice(9, 11)}`;
  }

  const head = d.slice(0, d.length - 4);
  const tail = d.slice(-4);
  const masked = head.slice(0, Math.max(0, head.length - 3)) + '***';
  const code = detectCountryCode(d);
  const fmt = code ? `${code} ` : '';
  return `${fmt}${masked} ${tail}`;
}

/** Short display form used in tables, e.g. 7700 123 **67 or 1415 555 **71. */
export function shortPhone(digits: string): string {
  const d = normalizePhone(digits) || digits.replace(NON_DIGIT, '');
  if (d.length <= 7) return d;
  return `${d.slice(0, d.length - 6)}***${d.slice(-2)}`;
}