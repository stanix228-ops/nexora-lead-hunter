import { URL } from 'url';
import net from 'net';

/**
 * SSRF (Server-Side Request Forgery) Guard.
 * Validates outgoing URLs requested by Hunter, Scraper, Webhook dispatch, and Business Analyzer.
 * Blocks private IP ranges, loopbacks, link-local addresses, and cloud metadata endpoints.
 */

// Private & special IPv4 ranges
const BLOCKED_IPV4_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' }, // 10.0.0.0/8 (Private)
  { start: '172.16.0.0', end: '172.31.255.255' }, // 172.16.0.0/12 (Private)
  { start: '192.168.0.0', end: '192.168.255.255' }, // 192.168.0.0/16 (Private)
  { start: '127.0.0.0', end: '127.255.255.255' }, // 127.0.0.0/8 (Loopback)
  { start: '169.254.0.0', end: '169.254.255.255' }, // 169.254.0.0/16 (Link-local & AWS/GCP Metadata)
  { start: '0.0.0.0', end: '0.255.255.255' }, // 0.0.0.0/8
  { start: '100.64.0.0', end: '100.127.255.255' }, // Shared Address Space
  { start: '198.18.0.0', end: '198.19.255.255' }, // Benchmark Testing
  { start: '224.0.0.0', end: '239.255.255.255' }, // Multicast
  { start: '240.0.0.0', end: '255.255.255.255' }, // Reserved
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'metadata.google.internal',
  'instance-data',
  '169.254.169.254',
]);

function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIp(ip: string): boolean {
  if (!net.isIPv4(ip)) {
    // Check IPv6 loopbacks / link-locals
    if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fc00:') || ip.startsWith('fd00:')) {
      return true;
    }
    return false;
  }

  const num = ipToNumber(ip);
  return BLOCKED_IPV4_RANGES.some((range) => {
    const start = ipToNumber(range.start);
    const end = ipToNumber(range.end);
    return num >= start && num <= end;
  });
}

/**
 * Validates whether a target URL is safe for server-side outbound requests.
 */
export function validateSafeUrl(urlString: string): { isSafe: boolean; reason?: string } {
  if (!urlString || typeof urlString !== 'string') {
    return { isSafe: false, reason: 'URL не указан или пуст' };
  }

  try {
    const url = new URL(urlString.startsWith('http://') || urlString.startsWith('https://') ? urlString : `https://${urlString}`);

    // Protocol validation
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { isSafe: false, reason: `Недопустимый протокол: ${url.protocol}. Разрешены только HTTP и HTTPS.` };
    }

    const hostname = url.hostname.toLowerCase();

    // Blocked hostnames check
    if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return { isSafe: false, reason: `Запрещенный хост назначения (Local/Internal): ${hostname}` };
    }

    // IP address validation
    if (net.isIP(hostname)) {
      if (isPrivateIp(hostname)) {
        return { isSafe: false, reason: `Запрещен доступ к приватным/локальным IP-адресам (SSRF Guard): ${hostname}` };
      }
    }

    // Port restrictions
    if (url.port) {
      const portNum = parseInt(url.port, 10);
      const allowedPorts = [80, 443, 8080, 8443];
      if (!allowedPorts.includes(portNum)) {
        return { isSafe: false, reason: `Запрещен нестандартный порт: ${portNum}. Разрешены: 80, 443, 8080, 8443.` };
      }
    }

    return { isSafe: true };
  } catch {
    return { isSafe: false, reason: 'Невалидный формат URL' };
  }
}

/**
 * Asserts that the URL is safe, throwing an error if it fails SSRF validation.
 */
export function assertSafeUrl(urlString: string): void {
  const check = validateSafeUrl(urlString);
  if (!check.isSafe) {
    throw new Error(`[SSRF_SECURITY_VIOLATION] ${check.reason}`);
  }
}
