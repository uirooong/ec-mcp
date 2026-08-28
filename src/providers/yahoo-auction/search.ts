import { normalizeList } from '../../url.ts';
import {
  CONDITION_CODES,
  CONDITION_LABELS,
  DEFAULT_PAGE_SIZE,
  ENDPOINTS,
  MAX_FETCH_ITEMS,
  MAX_PAGES,
  MAX_PAGE_SIZE,
  SORT_TOKENS,
  STATUS_PARAM,
  YAHOO_AUCTION_WEB_BASE,
  type SortKey
} from './constants.ts';
import { debugLog, yahooAuctionRest } from './rest-client.ts';
import { YahooAuctionUnsupportedFilterError } from './errors.ts';
import type {
  YahooApiSearchItem,
  YahooApiSearchResponse,
  YahooAuctionSearchItem,
  YahooAuctionSearchParams,
  YahooAuctionSearchResult,
  YahooAuctionStatus
} from './types.ts';

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Seconds until `endTime`; 0 once the auction has ended. */
export function remainingSeconds(endTime: string | undefined, now = Date.now()): number | null {
  if (!endTime) return null;
  const end = Date.parse(endTime);
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.floor((end - now) / 1000));
}

function normalizeStatus(item: YahooApiSearchItem, now = Date.now()): YahooAuctionStatus {
  // The search API carries no explicit per-item status; it is derived from
  // endTime (searches are scoped open/closed via the `status` request param).
  const remaining = remainingSeconds(item.endTime, now);
  if (remaining === null) return 'unknown';
  return remaining > 0 ? 'open' : 'closed';
}

function categoryIds(value: YahooAuctionSearchParams['category_id']): string[] {
  return normalizeList(value).map(item => {
    if (!/^\d+$/.test(item)) {
      throw new YahooAuctionUnsupportedFilterError(`Invalid category_id: ${item}`);
    }
    return item;
  });
}

function conditionCodes(value: YahooAuctionSearchParams['condition']): string[] {
  return normalizeList(value).map(item => {
    const code = item.toUpperCase();
    if (!(CONDITION_CODES as readonly string[]).includes(code)) {
      throw new YahooAuctionUnsupportedFilterError(
        `Unsupported condition: ${item} (expected one of ${CONDITION_CODES.join(', ')})`
      );
    }
    return code;
  });
}

function prefectureCodes(value: YahooAuctionSearchParams['shipping_from_area']): string[] {
  return normalizeList(value).map(item => {
    if (!/^\d{1,2}$/.test(item)) {
      throw new YahooAuctionUnsupportedFilterError(`Invalid shipping_from_area (prefecture code): ${item}`);
    }
    return item.padStart(2, '0');
  });
}

function excludeWords(params: YahooAuctionSearchParams): string[] {
  return normalizeList(params.exclude_keyword)
    .flatMap(value => value.split(/\s+/))
    .filter(Boolean);
}

function sortToken(params: YahooAuctionSearchParams): string | null {
  if (params.sort === undefined) return null;
  const tokens = SORT_TOKENS[params.sort as SortKey];
  if (tokens === undefined) {
    throw new YahooAuctionUnsupportedFilterError(
      `Unsupported sort: ${params.sort} (expected one of ${Object.keys(SORT_TOKENS).join(', ')})`
    );
  }
  return params.order === 'desc' ? tokens.desc : tokens.asc;
}

/**
 * Builds the `/api/search/v3/search/items` query. Natively supported by the
 * API: query (with `-word` exclusion), categoryIds, minPrice/maxPrice,
 * minBuyNowPrice/maxBuyNowPrice, conditions, isFreeShipping, prefectureCodes,
 * status, sort, limit, offset. Bid-count and ending-within filters have no
 * native parameter and are applied MCP-side over the returned JSON.
 */
export function buildSearchQuery(params: YahooAuctionSearchParams): URLSearchParams {
  const query = new URLSearchParams();
  const keywordParts: string[] = [];
  if (params.keyword && params.keyword.trim().length > 0) keywordParts.push(params.keyword.trim());
  for (const word of excludeWords(params)) keywordParts.push(`-${word}`);
  const categories = categoryIds(params.category_id);
  // An empty `query=` makes the API answer HTTP 500, so only send it when the
  // keyword is non-empty; a category-only search omits the parameter entirely.
  if (keywordParts.length > 0) {
    query.set('query', keywordParts.join(' '));
  } else if (categories.length === 0) {
    throw new YahooAuctionUnsupportedFilterError(
      'Yahoo! Auctions search requires a keyword or a category_id'
    );
  }
  if (categories.length > 0) query.set('categoryIds', categories.join(','));

  const conditions = conditionCodes(params.condition);
  if (conditions.length > 0) query.set('conditions', conditions.join(','));

  const prefectures = prefectureCodes(params.shipping_from_area);
  if (prefectures.length > 0) query.set('prefectureCodes', prefectures.join(','));

  if (params.price_min !== undefined) query.set('minPrice', String(params.price_min));
  if (params.price_max !== undefined) query.set('maxPrice', String(params.price_max));
  // `minBuyNowPrice` doubles as the "has buy-it-now" filter: every returned
  // item carries a buy-now price once it is set.
  const buyNowMin = params.buy_now_price_min ?? (params.has_buy_now === true ? 1 : undefined);
  if (buyNowMin !== undefined) query.set('minBuyNowPrice', String(buyNowMin));
  if (params.buy_now_price_max !== undefined) query.set('maxBuyNowPrice', String(params.buy_now_price_max));
  if (params.free_shipping === true) query.set('isFreeShipping', 'true');

  query.set('status', params.status === 'closed' ? STATUS_PARAM.closed : STATUS_PARAM.open);

  const sort = sortToken(params);
  if (sort !== null) query.set('sort', sort);
  return query;
}

/** Secondary validation over the JSON the API actually returned. */
export function passesPostFilters(
  item: YahooApiSearchItem,
  params: YahooAuctionSearchParams,
  now = Date.now()
): boolean {
  const price = toNumber(item.price);
  if (params.price_min !== undefined && price < params.price_min) return false;
  if (params.price_max !== undefined && price > params.price_max) return false;

  const buyNow = toNullableNumber(item.buyNowPrice);
  const hasBuyNow = buyNow !== null && buyNow > 0;
  if (params.has_buy_now === true && !hasBuyNow) return false;
  if (params.has_buy_now === false && hasBuyNow) return false;
  if (params.buy_now_price_min !== undefined && (!hasBuyNow || buyNow < params.buy_now_price_min)) return false;
  if (params.buy_now_price_max !== undefined && (!hasBuyNow || buyNow > params.buy_now_price_max)) return false;

  const bids = toNullableNumber(item.bidCount);
  if (params.min_bids !== undefined && (bids === null || bids < params.min_bids)) return false;
  if (params.max_bids !== undefined && (bids === null || bids > params.max_bids)) return false;

  if (params.ending_within_minutes !== undefined) {
    const remaining = remainingSeconds(item.endTime, now);
    if (remaining === null || remaining > params.ending_within_minutes * 60) return false;
  }
  if (params.free_shipping === true && item.isFreeShipping !== true) return false;

  const words = excludeWords(params).map(word => word.toLowerCase());
  if (words.length > 0) {
    const haystack = (item.title ?? '').toLowerCase();
    if (words.some(word => haystack.includes(word))) return false;
  }
  return true;
}

export function normalizeSearchItem(
  item: YahooApiSearchItem,
  now = Date.now()
): YahooAuctionSearchItem | null {
  const id = String(item.auctionId ?? '').trim();
  if (id === '') return null;
  const buyNow = toNullableNumber(item.buyNowPrice);
  const conditionId = item.itemCondition ?? null;
  const seen = new Set<string>();
  const category = (item.categoryPath ?? [])
    .filter(tier => tier.id !== undefined)
    .map(tier => ({ id: String(tier.id), name: tier.name ?? '' }))
    .filter(tier => {
      if (seen.has(tier.id)) return false;
      seen.add(tier.id);
      return true;
    });
  return {
    id,
    name: item.title ?? '',
    current_price: toNumber(item.price),
    buy_now_price: buyNow,
    has_buy_now: buyNow !== null && buyNow > 0,
    bid_count: toNullableNumber(item.bidCount),
    watch_count: toNullableNumber(item.watchCount),
    status: normalizeStatus(item, now),
    start_time: item.startTime ?? null,
    end_time: item.endTime ?? null,
    remaining_seconds: remainingSeconds(item.endTime, now),
    condition_id: conditionId,
    condition_name: conditionId ? CONDITION_LABELS[conditionId] ?? null : null,
    is_free_shipping: item.isFreeShipping ?? null,
    is_fixed_price: item.isFixedPrice ?? null,
    shipping_from_prefecture_code: item.prefectureCode ?? null,
    thumbnail: item.imageUrl ?? null,
    category,
    seller: item.seller?.userId
      ? {
          id: String(item.seller.userId),
          name: item.seller.displayName ?? null,
          good_rating_ratio: item.seller.goodRating ?? null,
          rating_total: null,
          good_rating_count: null,
          bad_rating_count: null,
          is_store: Boolean(item.seller.isStore)
        }
      : null,
    url: `${YAHOO_AUCTION_WEB_BASE}/jp/auction/${id}`
  };
}

function postFiltersActive(params: YahooAuctionSearchParams): boolean {
  return params.price_min !== undefined
    || params.price_max !== undefined
    || params.buy_now_price_min !== undefined
    || params.buy_now_price_max !== undefined
    || params.has_buy_now !== undefined
    || params.min_bids !== undefined
    || params.max_bids !== undefined
    || params.ending_within_minutes !== undefined
    || params.free_shipping === true
    || excludeWords(params).length > 0;
}

async function requestPage(
  query: URLSearchParams,
  limit: number,
  offset: number
): Promise<YahooApiSearchResponse> {
  const page = new URLSearchParams(query);
  page.set('limit', String(limit));
  page.set('offset', String(offset));
  return yahooAuctionRest<YahooApiSearchResponse>(`${ENDPOINTS.search}?${page.toString()}`);
}

export async function searchYahooAuctions(
  params: YahooAuctionSearchParams
): Promise<YahooAuctionSearchResult> {
  debugLog('tool', 'yahoo_auction_search');
  debugLog('input', params);
  const requestedLimit = params.limit === undefined ? DEFAULT_PAGE_SIZE : Math.max(1, params.limit);
  const pageSize = Math.min(MAX_PAGE_SIZE, requestedLimit);
  const query = buildSearchQuery(params);
  debugLog('normalized query', query.toString());
  const now = Date.now();

  const items: YahooAuctionSearchItem[] = [];
  const startOffset = params.offset ?? 0;
  let offset = startOffset;
  let totalCount: number | null = null;
  let fetchedRaw = 0;
  let lastPageSize = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const payload = await requestPage(query, pageSize, offset);
    totalCount = payload.totalResultsAvailable ?? totalCount;
    const rawItems = payload.items ?? [];
    lastPageSize = rawItems.length;
    fetchedRaw += rawItems.length;

    const pageItems = rawItems
      .filter(item => passesPostFilters(item, params, now))
      .map(item => normalizeSearchItem(item, now))
      .filter((item): item is YahooAuctionSearchItem => item !== null);
    items.push(...pageItems);
    offset += rawItems.length;
    debugLog('page', { page, raw: rawItems.length, kept: pageItems.length, total: items.length });

    if (!postFiltersActive(params)) break;
    if (items.length >= requestedLimit) break;
    if (rawItems.length === 0 || rawItems.length < pageSize) break;
    if (fetchedRaw >= MAX_FETCH_ITEMS) break;
  }

  const limited = items.slice(0, requestedLimit);
  const nextOffset = lastPageSize >= pageSize && limited.length > 0 ? offset : null;
  debugLog('totals', { fetchedRaw, returned: limited.length, totalCount });
  return {
    items: limited,
    total_count: totalCount,
    offset: startOffset,
    next_offset: nextOffset,
    source: 'api'
  };
}
