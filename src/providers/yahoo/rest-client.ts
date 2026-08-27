import { fetchWithTimeout, type FetchJsonOptions } from '../../http.ts';
import { YAHOO_WEB_BASE_URL } from './constants.ts';
import {
  YahooFleamarketApiError,
  YahooFleamarketHttpError,
  YahooFleamarketNotFoundError,
  YahooFleamarketParseError,
  YahooFleamarketRateLimitError
} from './errors.ts';

const DEBUG_ENV = 'YAHOO_FLEAMARKET_DEBUG';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRIABLE_STATUS = new Set([500, 502, 503, 504]);

// The Yahoo! Flea Market JSON API only needs a browser-like UA plus a same-site
// Referer; it does not require cookies, tokens, or sec-* headers.
const BASE_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'accept-language': 'ja-JP,ja;q=0.9',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  referer: `${YAHOO_WEB_BASE_URL}/`
};

export interface YahooRestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  /** When true, a 404 returns null instead of throwing (used for leaf categories). */
  notFoundAsNull?: boolean;
}

interface YahooErrorPayload {
  error?: { code?: string; codeV2?: string; name?: string; statusCode?: number; message?: string };
  statusCode?: number;
  message?: string;
}

export function isDebug(): boolean {
  return process.env[DEBUG_ENV] === 'true';
}

export function debugLog(message: string, value: unknown): void {
  if (!isDebug()) return;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  process.stderr.write(`[YAHOO FLEAMARKET DEBUG] ${message}: ${serialized}\n`);
}

export function redactDebugPayload(payload: unknown): unknown {
  if (typeof payload === 'string' && payload.length > 2000) {
    return `${payload.slice(0, 2000)}…(truncated)`;
  }
  return payload;
}

export async function yahooRest<T>(endpoint: string, options: YahooRestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  debugLog('request method', method);
  debugLog('request URL', endpoint);
  if (body !== undefined) debugLog('request body', redactDebugPayload(body));

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    const init: FetchJsonOptions = {
      method,
      headers: {
        ...BASE_HEADERS,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers
      }
    };
    if (body !== undefined) init.body = body;
    try {
      response = await fetchWithTimeout(endpoint, init);
    } catch (error) {
      lastError = new YahooFleamarketHttpError(
        0,
        `Yahoo! Flea Market API unreachable: ${error instanceof Error ? error.message : String(error)}`
      );
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw lastError;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
      await response.body?.cancel();
      if (attempt < MAX_RETRIES) {
        await sleep((seconds ?? 1) * 1000 * 2 ** attempt);
        continue;
      }
      throw new YahooFleamarketRateLimitError(seconds);
    }
    if (RETRIABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
      await response.body?.cancel();
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }
    if (response.status === 404 && options.notFoundAsNull) {
      await response.body?.cancel();
      return null as T;
    }

    const text = await response.text();
    debugLog('response status', response.status);
    debugLog('raw response summary', redactDebugPayload(text.slice(0, 1200)));

    if (!response.ok) {
      throw classifyHttpError(response.status, text, endpoint);
    }
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new YahooFleamarketParseError(
        `Yahoo! Flea Market API returned non-JSON response from ${endpoint}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  throw new YahooFleamarketApiError('Yahoo! Flea Market API request failed after retries');
}

function classifyHttpError(status: number, text: string, endpoint: string): import('../../errors.ts').MarketplaceError {
  let providerCode: string | undefined;
  let providerMessage: string | undefined;
  try {
    const payload = JSON.parse(text) as YahooErrorPayload;
    providerCode = payload.error?.codeV2 ?? payload.error?.code;
    providerMessage = payload.error?.message ?? payload.message;
  } catch {
    // fall through to raw summary
  }
  if (status === 404) {
    return new YahooFleamarketNotFoundError(
      `Yahoo! Flea Market resource not found (${endpoint}): ${providerMessage ?? text.slice(0, 160)}`
    );
  }
  const summary = providerMessage ? `${providerMessage} (code=${providerCode ?? 'n/a'})` : text.slice(0, 200);
  return new YahooFleamarketHttpError(status, `Yahoo! Flea Market API HTTP ${status}: ${summary}`, { providerCode });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
