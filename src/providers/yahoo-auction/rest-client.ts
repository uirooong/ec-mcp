import { fetchWithTimeout, type FetchJsonOptions } from '../../http.ts';
import { YAHOO_AUCTION_WEB_BASE } from './constants.ts';
import { getSessionCookie, invalidateSession } from './session.ts';
import {
  YahooAuctionApiError,
  YahooAuctionHttpError,
  YahooAuctionNotFoundError,
  YahooAuctionParseError,
  YahooAuctionRateLimitError,
  YahooAuctionUnsupportedFilterError
} from './errors.ts';
import type { MarketplaceError } from '../../errors.ts';

const DEBUG_ENV = 'YAHOO_AUCTION_DEBUG';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRIABLE_STATUS = new Set([500, 502, 503, 504]);
/**
 * Yahoo! Auctions answers HTTP 423 ("オークションにアクセスできませんでした",
 * code GW0002) when a client sends too many requests in a burst. It carries no
 * Retry-After header and persists for minutes, so it is treated as a rate limit
 * and surfaced as such rather than as a generic upstream failure.
 */
const RATE_LIMIT_STATUS = new Set([429, 423]);

// The Yahoo! Auctions JSON API only needs a browser-like UA plus a same-site
// Referer; no cookies, tokens, or sec-* headers are required.
const BASE_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'accept-language': 'ja-JP,ja;q=0.9',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  referer: `${YAHOO_AUCTION_WEB_BASE}/`
};

export interface YahooAuctionRestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

interface YahooAuctionErrorPayload {
  error?: { status?: number; name?: string; code?: string; message?: string };
}

export function isDebug(): boolean {
  return process.env[DEBUG_ENV] === 'true';
}

export function debugLog(message: string, value: unknown): void {
  if (!isDebug()) return;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  process.stderr.write(`[YAHOO AUCTION DEBUG] ${message}: ${serialized}\n`);
}

export function redactDebugPayload(payload: unknown): unknown {
  if (typeof payload === 'string' && payload.length > 2000) {
    return `${payload.slice(0, 2000)}…(truncated)`;
  }
  return payload;
}

export async function yahooAuctionRest<T>(
  endpoint: string,
  options: YahooAuctionRestOptions = {}
): Promise<T> {
  const method = options.method ?? 'GET';
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  debugLog('request method', method);
  debugLog('request URL', endpoint);
  if (body !== undefined) debugLog('request body', redactDebugPayload(body));

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    // The API rejects cookie-less clients (HTTP 423); attach the anonymous
    // session cookie bootstrapped from a plain HEAD on the site root.
    const cookie = await getSessionCookie();
    const init: FetchJsonOptions = {
      method,
      headers: {
        ...BASE_HEADERS,
        cookie,
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      }
    };
    if (body !== undefined) init.body = body;
    try {
      response = await fetchWithTimeout(endpoint, init);
    } catch (error) {
      lastError = new YahooAuctionHttpError(
        0,
        `Yahoo! Auctions API unreachable: ${error instanceof Error ? error.message : String(error)}`
      );
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw lastError;
    }

    if (RATE_LIMIT_STATUS.has(response.status)) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
      await response.body?.cancel();
      // A 423 usually means the session cookie went stale; re-bootstrap it.
      invalidateSession();
      if (attempt < MAX_RETRIES) {
        await sleep((seconds ?? 1) * 1000 * 2 ** attempt);
        continue;
      }
      throw new YahooAuctionRateLimitError(
        seconds,
        `Yahoo! Auctions rate limited the client (HTTP ${response.status}); back off before retrying`
      );
    }
    if (RETRIABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
      await response.body?.cancel();
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }

    const text = await response.text();
    debugLog('response status', response.status);
    debugLog('raw response summary', redactDebugPayload(text.slice(0, 1200)));

    if (!response.ok) {
      throw classifyHttpError(response.status, text, endpoint);
    }
    let parsed: T;
    try {
      parsed = JSON.parse(text) as T;
    } catch (error) {
      throw new YahooAuctionParseError(
        `Yahoo! Auctions API returned non-JSON response from ${endpoint}`,
        error instanceof Error ? error.message : String(error)
      );
    }
    // The API answers 200 with an embedded error envelope for some failures.
    const envelope = parsed as YahooAuctionErrorPayload;
    if (envelope?.error) {
      throw classifyProviderError(envelope, endpoint);
    }
    return parsed;
  }
  throw new YahooAuctionApiError('Yahoo! Auctions API request failed after retries');
}

function classifyProviderError(payload: YahooAuctionErrorPayload, endpoint: string): MarketplaceError {
  const status = payload.error?.status ?? 0;
  const message = payload.error?.message ?? 'unknown provider error';
  const code = payload.error?.code;
  if (status === 404) {
    return new YahooAuctionNotFoundError(`Yahoo! Auctions resource not found (${endpoint}): ${message}`);
  }
  if (status === 400) {
    return new YahooAuctionUnsupportedFilterError(`Yahoo! Auctions rejected the request: ${message}`, { code });
  }
  return new YahooAuctionApiError(`Yahoo! Auctions API error (${endpoint}): ${message}`, { code, status });
}

function classifyHttpError(status: number, text: string, endpoint: string): MarketplaceError {
  let providerCode: string | undefined;
  let providerMessage: string | undefined;
  try {
    const payload = JSON.parse(text) as YahooAuctionErrorPayload;
    providerCode = payload.error?.code;
    providerMessage = payload.error?.message;
  } catch {
    // fall through to the raw summary
  }
  if (status === 404) {
    return new YahooAuctionNotFoundError(
      `Yahoo! Auctions resource not found (${endpoint}): ${providerMessage ?? text.slice(0, 160)}`
    );
  }
  const summary = providerMessage ? `${providerMessage} (code=${providerCode ?? 'n/a'})` : text.slice(0, 200);
  return new YahooAuctionHttpError(status, `Yahoo! Auctions API HTTP ${status}: ${summary}`, { providerCode });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
