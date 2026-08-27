import { normalizeList } from '../../url.ts';
import {
  CONDITION_LABELS,
  DEFAULT_PAGE_SIZE,
  ENDPOINTS,
  MAX_FETCH_ITEMS,
  MAX_PAGES,
  MAX_PAGE_SIZE,
  ORDER_ENUM,
  SORT_ENUM,
  STATUS_ENUM,
  API_STATUS_MAP,
  YAHOO_WEB_BASE_URL
} from './constants.ts';
import { debugLog, yahooRest } from './rest-client.ts';
import { YahooFleamarketUnsupportedFilterError } from './errors.ts';
import type {
  YahooApiSearchItem,
  YahooApiSearchResponse,
  YahooItemStatus,
  YahooSearchItem,
  YahooSearchParams,
  YahooSearchResult
} from './types.ts';

const CONDITION_PATTERN = /^(new|used(10|20|30|40|50|60))$/;

function toNumber(value: number | string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value: string | undefined): YahooItemStatus {
  if (value === undefined) return 'unknown';
  return API_STATUS_MAP[value] ?? 'unknown';
}

function categoryIds(value: YahooSearchParams['category_id']): string[] {
  return normalizeList(value).map(item => {
    if (!/^\d+$/.test(item)) {
      throw new YahooFleamarketUnsupportedFilterError(`Invalid category_id: ${item}`);
    }
    return item;
  });
}

function conditionCodes(value: YahooSearchParams['condition']): string[] {
  return normalizeList(value).map(item => {
    const code = item.toLowerCase();
    if (!CONDITION_PATTERN.test(code)) {
      throw new YahooFleamarketUnsupportedFilterError(
        `Unsupported condition: ${item} (expected new or used10..used60)`
      );
    }
    return code;
  });
}

function excludeWords(params: YahooSearchParams): string[] {
  return normalizeList(params.exclude_keyword)
    .flatMap(value => value.split(/\s+/))
    .filter(Boolean);
}

/**
 * Builds the `/api/v1/search` query string. Yahoo natively supports keyword,
 * exclusion (via `-word` in the query), category (genreCategoryIds), price
 * (minPrice/maxPrice), condition (itemConditions), seller (sellerIds), status
 * (itemStatus), and price sorting (sort=price + order ASC/DESC). The API status
 * default is "sold", so we default to on-sale unless the caller asks otherwise.
 */
export function buildSearchQuery(params: YahooSearchParams): URLSearchParams {
  const query = new URLSearchParams();
  const keywordParts: string[] = [];
  if (params.keyword && params.keyword.trim().length > 0) keywordParts.push(params.keyword.trim());
  for (const word of excludeWords(params)) keywordParts.push(`-${word}`);
  query.set('query', keywordParts.join(' '));

  const cats = categoryIds(params.category_id);
  if (cats.length > 0) query.set('genreCategoryIds', cats.join(','));

  const conditions = conditionCodes(params.condition);
  if (conditions.length > 0) query.set('itemConditions', conditions.join(','));

  if (params.seller_id && params.seller_id.trim().length > 0) {
    query.set('sellerIds', params.seller_id.trim());
  }
  if (params.price_min !== undefined) query.set('minPrice', String(params.price_min));
  if (params.price_max !== undefined) query.set('maxPrice', String(params.price_max));

  query.set('itemStatus', params.status ? STATUS_ENUM[params.status] : 'open');

  if (params.sort !== undefined) {
    query.set('sort', SORT_ENUM[params.sort]);
    query.set('order', params.order === 'desc' ? ORDER_ENUM.desc : ORDER_ENUM.asc);
  }
  return query;
}

export function passesPostFilters(item: YahooApiSearchItem, params: YahooSearchParams): boolean {
  const price = toNumber(item.price);
  if (params.price_min !== undefined && price < params.price_min) return false;
  if (params.price_max !== undefined && price > params.price_max) return false;
  const words = excludeWords(params).map(word => word.toLowerCase());
  if (words.length > 0) {
    const haystack = (item.title ?? '').toLowerCase();
    if (words.some(word => haystack.includes(word))) return false;
  }
  return true;
}

export function normalizeSearchItem(item: YahooApiSearchItem): YahooSearchItem | null {
  const id = String(item.id ?? '').trim();
  if (id === '') return null;
  const conditionId = item.condition ?? null;
  const path = item.category?.path ?? [];
  return {
    id,
    name: item.title ?? '',
    price: toNumber(item.price),
    status: normalizeStatus(item.itemStatus),
    condition_id: conditionId,
    condition_name: conditionId ? CONDITION_LABELS[conditionId] ?? null : null,
    thumbnail: item.thumbnailImageUrl ?? null,
    url: `${YAHOO_WEB_BASE_URL}/item/${id}`,
    likes_count: toNullableNumber(item.likeCount),
    category: path
      .filter(tier => tier.id !== undefined)
      .map(tier => ({ id: String(tier.id), name: tier.name ?? '' })),
    brand_name: item.brand?.name ?? null,
    seller: item.sellerId
      ? {
          id: String(item.sellerId),
          good_ratio: item.seller?.goodRatio ?? null,
          num_rating: item.seller?.numRating ?? null
        }
      : null,
    end_time: item.endTime ?? null
  };
}

function postFiltersActive(params: YahooSearchParams): boolean {
  return params.price_min !== undefined
    || params.price_max !== undefined
    || excludeWords(params).length > 0;
}

async function requestPage(query: URLSearchParams, results: number, offset: number): Promise<YahooApiSearchResponse> {
  const page = new URLSearchParams(query);
  page.set('results', String(results));
  page.set('offset', String(offset));
  return yahooRest<YahooApiSearchResponse>(`${ENDPOINTS.search}?${page.toString()}`);
}

export async function searchYahooItems(params: YahooSearchParams): Promise<YahooSearchResult> {
  debugLog('tool', 'yahoo_fleamarket_search');
  debugLog('input', params);
  const requestedLimit = params.limit === undefined ? DEFAULT_PAGE_SIZE : Math.max(1, params.limit);
  const pageSize = Math.min(MAX_PAGE_SIZE, requestedLimit);
  const query = buildSearchQuery(params);
  debugLog('normalized query', query.toString());

  const items: YahooSearchItem[] = [];
  let offset = params.offset ?? 0;
  const startOffset = offset;
  let totalCount: number | null = null;
  let fetchedRaw = 0;
  let lastReturned = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const payload = await requestPage(query, pageSize, offset);
    totalCount = payload.totalResultsAvailable ?? totalCount;
    const rawItems = payload.items ?? [];
    lastReturned = payload.totalResultsReturned ?? rawItems.length;
    fetchedRaw += rawItems.length;

    const pageItems = rawItems
      .filter(item => passesPostFilters(item, params))
      .map(normalizeSearchItem)
      .filter((item): item is YahooSearchItem => item !== null);
    items.push(...pageItems);
    offset += rawItems.length;
    debugLog('page', { page, raw: rawItems.length, kept: pageItems.length, total: items.length });

    if (!postFiltersActive(params)) break;
    if (items.length >= requestedLimit) break;
    if (rawItems.length === 0 || lastReturned < pageSize) break;
    if (fetchedRaw >= MAX_FETCH_ITEMS) break;
  }

  const limited = items.slice(0, requestedLimit);
  const consumed = offset - startOffset;
  const nextOffset = lastReturned >= pageSize && limited.length > 0 ? startOffset + consumed : null;
  debugLog('totals', { fetchedRaw, returned: limited.length, totalCount });
  return {
    items: limited,
    total_count: totalCount,
    offset: startOffset,
    next_offset: nextOffset,
    source: 'api'
  };
}
