import { CATEGORY_CACHE_TTL_MS, CATEGORY_ROOT_ID, ENDPOINTS } from './constants.ts';
import { debugLog, yahooAuctionRest } from './rest-client.ts';
import { YahooAuctionUnsupportedFilterError } from './errors.ts';
import type {
  YahooApiModulesResponse,
  YahooApiSearchResponse,
  YahooAuctionCategoriesOptions,
  YahooAuctionCategoryRecord
} from './types.ts';

interface CategoryLevel {
  current: { id: string; name: string; isLeaf: boolean | null } | null;
  parent: { id: string; name: string } | null;
  children: Array<{ id: string; name: string; isLeaf: boolean | null }>;
}

interface LevelCacheEntry {
  fetchedAt: number;
  level: CategoryLevel;
}

// Per-category cache. Yahoo exposes no category master dataset, so the tree is
// read one level at a time; each level rarely changes.
const levelCache = new Map<string, LevelCacheEntry>();

function cacheValid(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < CATEGORY_CACHE_TTL_MS;
}

function normalizeCategoryId(value: number | string): string {
  const id = String(value).trim();
  if (!/^\d+$/.test(id)) {
    throw new YahooAuctionUnsupportedFilterError(`Invalid category id: ${String(value)}`);
  }
  return id;
}

/**
 * Reads one level of the category tree. The search "modules" endpoint returns
 * current/parent/children for any category id, which gives arbitrary-depth
 * navigation without a category master dataset.
 */
export async function fetchCategoryLevel(categoryId: string): Promise<CategoryLevel> {
  const cached = levelCache.get(categoryId);
  if (cached && cacheValid(cached.fetchedAt)) return cached.level;

  const query = new URLSearchParams({ categoryId, status: 'OPEN' });
  const payload = await yahooAuctionRest<YahooApiModulesResponse>(
    `${ENDPOINTS.searchModules}?${query.toString()}`
  );
  const raw = payload.modules?.category ?? {};
  const level: CategoryLevel = {
    current: raw.current?.id === undefined
      ? null
      : { id: String(raw.current.id), name: raw.current.name ?? '', isLeaf: raw.current.isLeaf ?? null },
    parent: raw.parent?.id === undefined
      ? null
      : { id: String(raw.parent.id), name: raw.parent.name ?? '' },
    children: (raw.children ?? [])
      .filter(child => child.id !== undefined)
      .map(child => ({ id: String(child.id), name: child.name ?? '', isLeaf: child.isLeaf ?? null }))
  };
  levelCache.set(categoryId, { fetchedAt: Date.now(), level });
  return level;
}

async function listChildren(parentId: string): Promise<YahooAuctionCategoryRecord[]> {
  const level = await fetchCategoryLevel(parentId);
  const parentName = level.current?.name;
  const includeParent = parentName !== undefined && parentId !== CATEGORY_ROOT_ID;
  return level.children.map(child => ({
    id: child.id,
    name: child.name,
    parentId,
    level: 1,
    pathNames: includeParent ? [parentName, child.name] : [child.name],
    isLeaf: child.isLeaf
  }));
}

/**
 * Collects every distinct category tier referenced by a set of search results.
 * Each item carries its full root-to-leaf `categoryPath`, so one search request
 * yields categories at every depth with complete path names. Tiers are
 * deduplicated by id while preserving hierarchy order.
 */
export function collectCategoriesFromSearch(payload: YahooApiSearchResponse): {
  byId: Map<string, YahooAuctionCategoryRecord>;
  frequency: Map<string, number>;
} {
  const byId = new Map<string, YahooAuctionCategoryRecord>();
  const frequency = new Map<string, number>();
  for (const item of payload.items ?? []) {
    const path = (item.categoryPath ?? []).filter(tier => tier.id !== undefined);
    const names: string[] = [];
    const countedHere = new Set<string>();
    let parentId: string | null = null;
    let level = 0;
    for (const tier of path) {
      const id = String(tier.id);
      // Skip the synthetic root ("オークション", id 0) so genres start at level 1.
      if (id === CATEGORY_ROOT_ID) {
        parentId = id;
        continue;
      }
      level += 1;
      names.push(tier.name ?? '');
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          name: tier.name ?? '',
          parentId,
          level,
          pathNames: [...names],
          isLeaf: null
        });
      }
      if (!countedHere.has(id)) {
        frequency.set(id, (frequency.get(id) ?? 0) + 1);
        countedHere.add(id);
      }
      parentId = id;
    }
  }
  return { byId, frequency };
}

/**
 * Keyword category search. Yahoo has no category-search endpoint, and walking
 * the tree costs one request per node — enough to trip the provider's burst
 * limiter (HTTP 423). Instead we run a single structured search for the keyword
 * and harvest the category tiers the matching auctions belong to, which covers
 * every depth in one request. Name matches are preferred; otherwise the
 * keyword-relevant categories are returned ranked by how many results cite them.
 */
async function searchCategoriesByKeyword(keyword: string): Promise<YahooAuctionCategoryRecord[]> {
  const query = new URLSearchParams({
    query: keyword,
    status: 'OPEN',
    limit: '100'
  });
  const payload = await yahooAuctionRest<YahooApiSearchResponse>(`${ENDPOINTS.search}?${query.toString()}`);
  const { byId, frequency } = collectCategoriesFromSearch(payload);
  const all = [...byId.values()];
  const needle = keyword.trim().toLowerCase();
  const nameMatches = all.filter(record => record.name.toLowerCase().includes(needle));
  const chosen = nameMatches.length > 0 ? nameMatches : all;
  debugLog('category keyword search', { keyword, harvested: all.length, nameMatches: nameMatches.length });
  return chosen.sort((left, right) => {
    if (nameMatches.length === 0) {
      const diff = (frequency.get(right.id) ?? 0) - (frequency.get(left.id) ?? 0);
      if (diff !== 0) return diff;
    }
    return left.pathNames.join('/').localeCompare(right.pathNames.join('/'), 'ja');
  });
}

export async function getYahooAuctionCategories(
  options: YahooAuctionCategoriesOptions = {}
): Promise<YahooAuctionCategoryRecord[]> {
  debugLog('tool', 'yahoo_auction_get_categories');
  debugLog('input', options);

  if (options.keyword && options.keyword.trim().length > 0) {
    return searchCategoriesByKeyword(options.keyword);
  }
  if (options.parent_id !== undefined) {
    return listChildren(normalizeCategoryId(options.parent_id));
  }
  // Default / root_only: the top-level Yahoo! Auctions genres.
  return listChildren(CATEGORY_ROOT_ID);
}
