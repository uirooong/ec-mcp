import { fetchWithTimeout } from '../../http.ts';
import { SESSION_TTL_MS, YAHOO_AUCTION_WEB_BASE } from './constants.ts';
import { YahooAuctionHttpError } from './errors.ts';

/**
 * Yahoo! Auctions' JSON API rejects cookie-less clients with HTTP 423
 * ("オークションにアクセスできませんでした"). A normal browser picks up an
 * anonymous tracking cookie (`B`) on its first page hit, and that is all the
 * API needs — no login, no account, no personal data.
 *
 * We bootstrap the same way with a HEAD request to the site root and keep only
 * the `Set-Cookie` values. The response body is never downloaded or parsed;
 * this is HTTP header handling, not page scraping. Nothing is hardcoded: the
 * cookie is issued fresh per process and refreshed on expiry or on a 423.
 */

const BOOTSTRAP_HEADERS: Record<string, string> = {
  'accept-language': 'ja-JP,ja;q=0.9',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
};

// Only these non-personal, anonymously issued cookies are forwarded.
const ALLOWED_COOKIE_NAMES = new Set(['B', 'XB', 'A', 'XA']);

interface SessionState {
  cookie: string;
  fetchedAt: number;
}

let session: SessionState | undefined;
let inFlight: Promise<string> | undefined;

function parseSetCookies(response: Response): string {
  // Bun/undici expose getSetCookie(); fall back to the folded header.
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ?? '').split(/,(?=[^;]+?=)/);
  const pairs = new Map<string, string>();
  for (const entry of raw) {
    const first = entry.split(';', 1)[0]?.trim();
    if (!first) continue;
    const separator = first.indexOf('=');
    if (separator <= 0) continue;
    const name = first.slice(0, separator);
    if (!ALLOWED_COOKIE_NAMES.has(name)) continue;
    pairs.set(name, first.slice(separator + 1));
  }
  return [...pairs].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function bootstrap(): Promise<string> {
  const response = await fetchWithTimeout(`${YAHOO_AUCTION_WEB_BASE}/`, {
    method: 'HEAD',
    headers: BOOTSTRAP_HEADERS
  });
  await response.body?.cancel();
  const cookie = parseSetCookies(response);
  if (cookie.length === 0) {
    throw new YahooAuctionHttpError(
      response.status,
      'Yahoo! Auctions did not issue an anonymous session cookie'
    );
  }
  session = { cookie, fetchedAt: Date.now() };
  return cookie;
}

/** Returns a cached anonymous cookie header, bootstrapping one if needed. */
export async function getSessionCookie(): Promise<string> {
  if (session && Date.now() - session.fetchedAt < SESSION_TTL_MS) return session.cookie;
  // Collapse concurrent bootstraps into a single request.
  if (inFlight === undefined) {
    inFlight = bootstrap().finally(() => {
      inFlight = undefined;
    });
  }
  return inFlight;
}

/** Drops the cached cookie so the next request bootstraps a fresh session. */
export function invalidateSession(): void {
  session = undefined;
}
