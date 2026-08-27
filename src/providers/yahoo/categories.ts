import {
  CATEGORY_CACHE_TTL_MS,
  CATEGORY_SHOPPING_ID,
  ENDPOINTS
} from './constants.ts';
import { debugLog, yahooRest } from './rest-client.ts';
import { YahooFleamarketUnsupportedFilterError } from './errors.ts';
import type {
  YahooApiCategoryChild,
  YahooApiSearchResponse,
  YahooCategoriesOptions,
  YahooCategoryRecord
} from './types.ts';

interface ChildCacheEntry {
  fetchedAt: number;
  children: Array<{ id: string; name: string }>;
}

// Per-parent children cache: the tree is navigated one level at a time via
// /categories/{parentId}/children, and each level rarely changes.
const childrenCache = new Map<string, ChildCacheEntry>();

function cacheValid(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < CATEGORY_CACHE_TTL_MS;
}

/**
 * Fetches the direct children of a category. Leaf categories return HTTP 404
 * ("不正なジャンルカテゴリ"), which we treat as "no children" rather than an error.
 */
export async function fetchChildren(parentId: string): Promise<Array<{ id: string; name: string }>> {
  const cached = childrenCache.get(parentId);
  if (cached && cacheValid(cached.fetchedAt)) return cached.children;
  const payload = await yahooRest<YahooApiCategoryChild[] | null>(
    ENDPOINTS.categoryChildren(parentId),
    { notFoundAsNull: true }
  );
  const children = (payload ?? [])
    .filter(child => child.id !== undefined)
    .map(child => ({ id: String(child.id), name: child.name ?? '' }));
  childrenCache.set(parentId, { fetchedAt: Date.now(), children });
  return children;
}

function normalizeParentId(value: number | string): string {
  const parentId = String(value).trim();
  if (!/^\d+$/.test(parentId)) {
    throw new YahooFleamarketUnsupportedFilterError(`Invalid parent_id: ${String(value)}`);
  }
  return parentId;
}

/** Lists the direct children of a parent as records (single API level, cheap). */
async function listChildren(
  parentId: string,
  parentPath: string[],
  parentLevel: number
): Promise<YahooCategoryRecord[]> {
  const children = await fetchChildren(parentId);
  return children.map(child => ({
    id: child.id,
    name: child.name,
    parentId,
    level: parentLevel + 1,
    pathNames: [...parentPath, child.name],
    hasChildren: null
  }));
}

/**
 * Keyword category search. Rather than crawling the entire tree (thousands of
 * requests), we ask the search API for the keyword and harvest the distinct
 * category tiers from each result item's `category.path` — every level, with
 * full path names, from a single structured request. Categories whose name
 * matches the keyword are returned when present; otherwise the distinct
 * keyword-relevant categories (ranked by how many results reference them) are
 * returned so the caller still gets usable category ids.
 */
export interface CollectedCategories {
  byId: Map<string, YahooCategoryRecord>;
  frequency: Map<string, number>;
}

export function collectCategoriesFromSearch(payload: YahooApiSearchResponse): CollectedCategories {
  const byId = new Map<string, YahooCategoryRecord>();
  const frequency = new Map<string, number>();
  for (const item of payload.items ?? []) {
    const path = (item.category?.path ?? []).filter(tier => tier.id !== undefined);
    const names: string[] = [];
    const countedThisItem = new Set<string>();
    let parentId: string | null = null;
    let level = 0;
    const record = (id: string, name: string, tierLevel: number, pathNames: string[]): void => {
      if (!byId.has(id)) byId.set(id, { id, name, parentId, level: tierLevel, pathNames, hasChildren: null });
      if (!countedThisItem.has(id)) {
        frequency.set(id, (frequency.get(id) ?? 0) + 1);
        countedThisItem.add(id);
      }
      parentId = id;
    };
    for (const tier of path) {
      const id = String(tier.id);
      // Skip the synthetic "shopping" root (id 1) so genres start at level 1.
      if (id === CATEGORY_SHOPPING_ID) {
        parentId = id;
        continue;
      }
      level += 1;
      names.push(tier.name ?? '');
      record(id, tier.name ?? '', level, [...names]);
    }
    // The leaf category may sit below the last path tier (deduped if identical).
    const leaf = item.category;
    if (leaf?.id !== undefined) {
      const id = String(leaf.id);
      record(id, leaf.name ?? '', level + 1, [...names, leaf.name ?? '']);
    }
  }
  return { byId, frequency };
}

async function searchCategoriesByKeyword(keyword: string): Promise<YahooCategoryRecord[]> {
  const query = new URLSearchParams({ query: keyword, results: '100', itemStatus: 'open' });
  const payload = await yahooRest<YahooApiSearchResponse>(`${ENDPOINTS.search}?${query.toString()}`);
  const { byId, frequency } = collectCategoriesFromSearch(payload);
  const all = [...byId.values()];
  const needle = keyword.trim().toLowerCase();
  const nameMatches = all.filter(record => record.name.toLowerCase().includes(needle));
  const chosen = nameMatches.length > 0 ? nameMatches : all;
  return chosen.sort((left, right) => {
    if (nameMatches.length === 0) {
      const diff = (frequency.get(right.id) ?? 0) - (frequency.get(left.id) ?? 0);
      if (diff !== 0) return diff;
    }
    return left.pathNames.join('/').localeCompare(right.pathNames.join('/'), 'ja');
  });
}

export async function getYahooCategories(options: YahooCategoriesOptions = {}): Promise<YahooCategoryRecord[]> {
  debugLog('tool', 'yahoo_fleamarket_get_categories');
  debugLog('input', options);

  if (options.keyword && options.keyword.trim().length > 0) {
    return searchCategoriesByKeyword(options.keyword);
  }
  if (options.parent_id !== undefined) {
    const parentId = normalizeParentId(options.parent_id);
    // pathNames beyond the immediate child name are known only via traversal.
    return listChildren(parentId, [], 0);
  }
  // Default / root_only: the meaningful roots are the top-level genres
  // (children of Shopping=1).
  return listChildren(CATEGORY_SHOPPING_ID, [], 0);
}
