/**
 * PII (Personally Identifiable Information) and Secret Masker.
 * Automatically redacts sensitive customer data, tokens, passwords, and API keys.
 */

// Common secret patterns
const SECRET_PATTERNS = [
  // OpenAI & Anthropic & OpenRouter API Keys
  /\b(sk-[a-zA-Z0-9_-]{20,})\b/g,
  /\b(ghp_[a-zA-Z0-9]{20,})\b/g,
  /\b(xox[baprs]-[a-zA-Z0-9-]{10,})\b/g,
  // JWT Tokens
  /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
  // Bearer tokens
  /\bBearer\s+([a-zA-Z0-9._~+/-]+=*)/gi,
  // Passwords in query/body
  /(password["':\s=]+)([^"'\s&,]{3,})/gi,
  // Database connection strings with credentials
  /(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi,
];

// PII patterns
const PHONE_PATTERN = /(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g;
const EMAIL_PATTERN = /\b([a-zA-Z0-9._%+-]{1,2})[a-zA-Z0-9._%+-]*(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
const CREDIT_CARD_PATTERN = /\b(?:\d{4}[ -]?){3}\d{4}\b/g;

/**
 * Masks secrets and tokens in raw text.
 */
export function maskSecrets(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let result = text;
  // OpenAI & Anthropic & OpenRouter API Keys
  result = result.replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, '***[REDACTED_API_KEY]***');
  result = result.replace(/\b(ghp_[a-zA-Z0-9]{20,})\b/g, '***[REDACTED_API_KEY]***');
  result = result.replace(/\b(xox[baprs]-[a-zA-Z0-9-]{10,})\b/g, '***[REDACTED_API_KEY]***');
  // JWT Tokens
  result = result.replace(/\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '***[REDACTED_JWT]***');
  // Bearer tokens
  result = result.replace(/\bBearer\s+([a-zA-Z0-9._~+/-]+=*)/gi, 'Bearer ***[REDACTED_TOKEN]***');
  // Passwords in query/body
  result = result.replace(/(password["':\s=]+)([^"'\s&,]{3,})/gi, '$1***[REDACTED_PASSWORD]***');
  // Database connection strings with credentials
  result = result.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1***[REDACTED_DB_PASS]***$3');

  return result;
}

/**
 * Masks Personally Identifiable Information (PII) in text while preserving readability.
 */
export function maskPii(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let result = maskSecrets(text);

  // Mask Email: j***@domain.com
  result = result.replace(EMAIL_PATTERN, '$1***$2');

  // Mask Credit Cards
  result = result.replace(CREDIT_CARD_PATTERN, '****-****-****-****');

  return result;
}

/**
 * Recursively sanitizes objects and data structures for safe logging.
 */
export function sanitizeForLog<T = any>(data: T): T {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return maskPii(data) as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLog(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, any> = {};
    const sensitiveKeys = new Set([
      'password',
      'passwordhash',
      'token',
      'secret',
      'jwtsecret',
      'metaappsecret',
      'metagraphaccesstoken',
      'bottoken',
      'apikey',
      'smtppassword',
      'authorization',
      'cookie',
    ]);

    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        sanitized[key] = '***[REDACTED]***';
      } else {
        sanitized[key] = sanitizeForLog(value);
      }
    }
    return sanitized as T;
  }

  return data;
}
