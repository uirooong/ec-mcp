import type { ListInput } from './types.ts';

export function normalizeList(value: ListInput): string[] {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  const rawValues = Array.isArray(value) ? value : [value];
  return rawValues
    .flatMap(item => String(item).split(','))
    .map(item => item.trim())
    .filter(Boolean);
}
