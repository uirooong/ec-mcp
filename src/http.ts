import { randomUUID } from 'node:crypto';

export interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Upstream returned non-JSON response from ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parsed;
}

export async function fetchWithTimeout(url: string, options: FetchJsonOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...requestInit } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...requestInit, signal: requestInit.signal ?? controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function newUuid(): string {
  return randomUUID();
}
