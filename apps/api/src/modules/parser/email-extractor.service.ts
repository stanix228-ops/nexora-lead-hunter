import { logger } from '../../common/logger';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const MAILTO_REGEX = /href=["']mailto:([^"'\s?]+)/gi;

const JUNK_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js', '.woff', '.woff2'];
const JUNK_DOMAINS = ['example.com', 'domain.com', 'yourdomain.com', 'email.com', 'sentry.io', 'wixpress.com', 'schema.org'];

function sanitizeEmail(email: string): string | null {
  let cleaned = email.trim().toLowerCase();
  // Remove leading/trailing punctuation
  cleaned = cleaned.replace(/^[^\w]+|[^\w]+$/g, '');

  if (cleaned.length < 5 || cleaned.length > 80) return null;
  if (!cleaned.includes('@') || !cleaned.includes('.')) return null;

  for (const ext of JUNK_EXTENSIONS) {
    if (cleaned.endsWith(ext)) return null;
  }
  const domain = cleaned.split('@')[1];
  if (!domain || JUNK_DOMAINS.includes(domain)) return null;

  return cleaned;
}

/**
 * Fast asynchronous email extractor from a website URL using native fetch.
 * Checks the homepage and `/contact` or `/about` subpages with a strict timeout.
 */
export async function extractEmailsFromWebsite(websiteUrl: string, maxTimeoutMs = 3500): Promise<string | null> {
  if (!websiteUrl) return null;

  let normalizedUrl = websiteUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  const foundEmails = new Set<string>();

  const fetchAndScrape = async (targetUrl: string): Promise<void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), maxTimeoutMs);

    try {
      const resp = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!resp.ok) return;
      const html = await resp.text();
      if (!html) return;

      // 1. Extract mailto links
      let mailtoMatch: RegExpExecArray | null;
      while ((mailtoMatch = MAILTO_REGEX.exec(html)) !== null) {
        if (mailtoMatch[1]) {
          const clean = sanitizeEmail(mailtoMatch[1]);
          if (clean) foundEmails.add(clean);
        }
      }

      // 2. Regex search in body text
      const matches = html.match(EMAIL_REGEX) || [];
      for (const m of matches) {
        const clean = sanitizeEmail(m);
        if (clean) foundEmails.add(clean);
      }
    } catch {
      /* ignore timeout or network error */
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    // 1. Scrape Homepage
    await fetchAndScrape(normalizedUrl);

    if (foundEmails.size > 0) {
      return pickBestEmail(Array.from(foundEmails));
    }

    // 2. If nothing on homepage, try /contact in parallel
    const baseUrl = new URL(normalizedUrl).origin;
    const contactPages = [`${baseUrl}/contact`, `${baseUrl}/contact-us`, `${baseUrl}/about`];

    await Promise.allSettled(contactPages.map((u) => fetchAndScrape(u)));

    if (foundEmails.size > 0) {
      return pickBestEmail(Array.from(foundEmails));
    }
  } catch (err) {
    logger.debug('Email extraction failed for website', { url: websiteUrl, error: (err as Error).message });
  }

  return null;
}

function pickBestEmail(emails: string[]): string {
  const priorities = ['info@', 'contact@', 'sales@', 'hello@', 'support@', 'office@', 'admin@', 'inquiry@', 'mail@'];
  for (const prefix of priorities) {
    const match = emails.find((e) => e.startsWith(prefix));
    if (match) return match;
  }
  return emails[0] || '';
}
