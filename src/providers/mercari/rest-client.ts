import { fetchWithTimeout, type FetchJsonOptions } from '../../http.ts';
import {
  MarketplaceError,
  MercariApiError,
  MercariHttpError,
  MercariNotFoundError,
  MercariParseError,
  MercariRateLimitError
} from '../../errors.ts';

const DEBUG_ENV = 'MERCARI_DEBUG';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRIABLE_STATUS = new Set([500, 502, 503, 504]);

export interface MercariRestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  requestId?: string;
}

interface MercariErrorPayload {
  result?: string;
  errors?: Array<{ code?: string; message?: string }>;
  // gRPC-transcoded errors surface a top-level code/message instead of errors[].
  code?: number;
  message?: string;
}

export function debugLog(message: string, value: unknown): void {
  if (process.env[DEBUG_ENV] !== 'true') return;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  process.stderr.write(`[MERCARI DEBUG] ${message}: ${serialized}\n`);
}

export function redactDebugPayload(payload: unknown): unknown {
  // Keep debug output free of credentials; DPoP tokens are per-request and never logged.
  if (typeof payload === 'string' && payload.length > 2000) {
    return `${payload.slice(0, 2000)}…(truncated)`;
  }
  return payload;
}

export async function mercariRest<T>(
  endpoint: string,
  dpopJwt: string,
  options: MercariRestOptions = {}
): Promise<T> {
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
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        dpop: dpopJwt,
        'x-platform': 'web',
        'accept-language': 'ja-JP,ja;q=0.9'
      }
    };
    if (body !== undefined) init.body = body;
    try {
      response = await fetchWithTimeout(endpoint, init);
    } catch (error) {
      lastError = new MercariHttpError(0, `Mercari API unreachable: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw lastError;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
      if (attempt < MAX_RETRIES) {
        await sleep((seconds ?? 1) * 1000 * 2 ** attempt);
        continue;
      }
      throw new MercariRateLimitError(seconds);
    }
    if (RETRIABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
      await response.body?.cancel();
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }

    const text = await response.text();
    debugLog('response status', response.status);
    debugLog('response JSON summary', redactDebugPayload(text.slice(0, 1200)));

    if (!response.ok) {
      throw classifyHttpError(response.status, text);
    }
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new MercariParseError(
        `Mercari API returned non-JSON response from ${endpoint}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  throw new MercariApiError('Mercari API request failed after retries');
}

function classifyHttpError(status: number, text: string): MarketplaceError {
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  try {
    const payload = JSON.parse(text) as MercariErrorPayload;
    if (Array.isArray(payload.errors)) {
      errorCode = payload.errors[0]?.code;
      errorMessage = payload.errors[0]?.message;
    } else if (typeof payload.message === 'string') {
      errorMessage = payload.message;
    }
  } catch {
    // keep body summary in message below
  }
  if (status === 404) {
    return new MercariNotFoundError(`Mercari API resource not found: ${errorMessage ?? text.slice(0, 200)}`);
  }
  const summary = errorMessage ? `${errorMessage} (code=${errorCode ?? 'n/a'})` : text.slice(0, 200);
  return new MercariHttpError(status, `Mercari API HTTP ${status}: ${summary}`, { errorCode });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
