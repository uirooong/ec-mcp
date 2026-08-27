import { randomUUID } from 'node:crypto';

export interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

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
