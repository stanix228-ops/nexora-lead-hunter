/**
 * Phone number normalization helpers.
 *
 * Normalization contract (product spec):
 *  - keep digits only
 *  - strip spaces, `+`, parentheses, hyphens and other separators
 *  - convert a leading `8` (CIS local trunk prefix) to `7`
 *  - detect the international country calling code where possible
 *
 * Raw source values are preserved by callers — normalization never
 * destroys the original input.
 */

const NON_DIGIT = /\D/g;

/** Strip every non-digit character. */
export function digitsOnly(value: string): string {
  return value.replace(NON_DIGIT, '');
}

/**
 * Normalize a phone number to an international E.164-style digit string
 * WITHOUT the leading `+` (see product spec).
 *
 * Examples:
 *   '+7 700 123 45 67'   -> '77001234567'
 *   '8 700 123 45 67'    -> '77001234567'
 *   'https://wa.me/77001234567' -> '77001234567'
 *   ''                   -> ''
 */
export function normalizePhone(value: string): string {
  let digits = digitsOnly(value);
  if (digits.length > 0 && digits[0] === '8' && digits.length >= 11) {
    digits = '7' + digits.slice(1);
  }
  return digits;
}

/** Return digits only if the input plausibly represents a phone number. */
export function isPhoneLike(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length >= 6 && digits.length <= 15;
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
  if (normalizedDigits === '') return null;
  for (const [prefix, code] of COUNTRY_PREFIX) {
    if (normalizedDigits.startsWith(prefix)) return code;
  }
  return null;
}

/** Convert a normalized digit string to a wa.me deep link. */
export function buildWaLink(normalizedDigits: string): string {
  return `https://wa.me/${normalizedDigits}`;
}

/** Mask a phone for display: +7 700 *** **67 */
export function maskPhone(digits: string): string {
  const d = digits.replace(NON_DIGIT, '');
  if (d.length < 7) return d;
  const head = d.slice(0, d.length - 4);
  const tail = d.slice(-4);
  const masked = head.slice(0, Math.max(0, head.length - 3)) + '***';
  const code = detectCountryCode(d);
  const spaced = (code ? d.replace(code.replace('+', ''), '') : d);
  const fmt = code ? `${code} ` : '';
  if (code === '+7' || code === '+1' || code === '+44') {
    return `${fmt}${masked} ${tail}`;
  }
  return `${fmt}${spaced.slice(0, 3)} ${'***'} ${tail}`;
}

/** Short display form used in tables, e.g. 7700 123 **67. */
export function shortPhone(digits: string): string {
  const d = digits.replace(NON_DIGIT, '');
  if (d.length <= 7) return d;
  return `${d.slice(0, d.length - 6)}***${d.slice(-2)}`;
}