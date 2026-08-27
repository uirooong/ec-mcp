import { generateDpopJwt } from './dpop.ts';
import {
  DEFAULT_PAGE_SIZE, ENDPOINTS, MAX_FETCH_ITEMS, MAX_PAGES, MAX_PAGE_SIZE, MERCARI_WEB_BASE_URL
} from './constants.ts';
import { buildApiSearchCondition } from './search-condition.ts';
import { debugLog, mercariRest } from './rest-client.ts';
import { normalizeList } from '../../url.ts';
import type { SearchItem, SearchParams, SearchResult } from '../../types.ts';

interface ApiEntitySearchResponse {
  meta?: {
    numFound?: string | number;
    nextPageToken?: string;
  };
  items?: ApiSearchItem[];
}

export interface ApiSearchItem {
  id?: string;
  name?: string;
  price?: string | number;
  status?: string;
  thumbnails?: string[];
  photos?: Array<{ uri?: string }>;
  created?: string | number;
  itemType?: string;
  sellerId?: string;
  categoryId?: string | number;
  shop?: { id?: string };
}

const CREATED_AFTER_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeApiStatus(value: string | undefined): SearchItem['status'] {
  if (value === 'ITEM_STATUS_ON_SALE' || value === 'on_sale') return 'on_sale';
  if (value === 'ITEM_STATUS_SOLD_OUT' || value === 'sold_out') return 'sold_out';
  if (value === 'ITEM_STATUS_TRADING' || value === 'trading') return 'trading';
  return 'unknown';
}

function toNumber(value: string | number | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createdAfterEpoch(value: string | undefined): number | null {
  if (value === undefined || !CREATED_AFTER_PATTERN.test(value)) return null;
  // Mercari operates on JST; treat the requested date as JST midnight.
  const epochMs = Date.parse(`${value}T00:00:00+09:00`);
  return Number.isNaN(epochMs) ? null : Math.floor(epochMs / 1000);
}

/**
 * Secondary validation over REST API JSON responses. The API applies most
 * filters server-side, but exclude keywords can leak through synonym
 * expansion and created_after_date is ignored by entities:search entirely.
 */
export function passesPostFilters(item: ApiSearchItem, params: SearchParams): boolean {
  const price = toNumber(item.price);
  if (params.price_min !== undefined && price < params.price_min) return false;
  if (params.price_max !== undefined && price > params.price_max) return false;
  const excludeWords = normalizeList(params.exclude_keyword)
    .flatMap(value => value.split(/\s+/))
    .filter(Boolean);
  if (excludeWords.length > 0) {
    const haystack = (item.name ?? '').toLowerCase();
    if (excludeWords.some(word => haystack.includes(word.toLowerCase()))) return false;
  }
  const createdAfter = createdAfterEpoch(params.created_after_date);
  if (createdAfter !== null) {
    const created = toNumber(item.created);
    if (created > 0 && created < createdAfter) return false;
  }
  return true;
}

/**
 * entities:search returns two item families: ITEM_TYPE_MERCARI (classic C2C
 * items, id "m123…", detail at /item/{id}) and ITEM_TYPE_BEYOND (Mercari Shops
 * products, base62 id, detail at /shops/product/{id}). Both are real listings,
 * so both must be surfaced; the earlier m\d+ id guard silently dropped every
 * Beyond result (~40-50% of a typical keyword page).
 */
function normalizeItemType(value: string | undefined): SearchItem['item_type'] {
  if (value === 'ITEM_TYPE_BEYOND') return 'beyond';
  if (value === 'ITEM_TYPE_MERCARI') return 'mercari';
  return 'unknown';
}

function itemWebUrl(id: string, itemType: SearchItem['item_type']): string {
  if (itemType === 'beyond') return `${MERCARI_WEB_BASE_URL}/shops/product/${id}`;
  return `${MERCARI_WEB_BASE_URL}/item/${id}`;
}

export function normalizeItem(item: ApiSearchItem): SearchItem | null {
  const id = String(item.id ?? '').trim();
  if (id === '') return null;
  const itemType = normalizeItemType(item.itemType);
  const thumbnail = item.thumbnails?.find(value => typeof value === 'string' && value.length > 0)
    ?? item.photos?.find(photo => typeof photo?.uri === 'string')?.uri
    ?? null;
  return {
    id,
    item_type: itemType,
    name: item.name ?? '',
    price: toNumber(item.price),
    status: normalizeApiStatus(item.status),
    thumbnail,
    url: itemWebUrl(id, itemType)
  };
}

async function requestPage(
  params: SearchParams,
  pageSize: number,
  pageToken: string
): Promise<ApiEntitySearchResponse> {
  const deviceId = crypto.randomUUID();
  const request = {
    userId: '',
    config: { responseToggles: [] as string[] },
    pageSize,
    pageToken,
    searchSessionId: crypto.randomUUID(),
    source: 'BaseSerp',
    indexRouting: 'INDEX_ROUTING_UNSPECIFIED',
    thumbnailTypes: [],
    searchCondition: buildApiSearchCondition(params),
    serviceFrom: 'suruga',
    withItemBrand: true,
    withItemSize: false,
    withItemPromotions: true,
    withItemSizes: true,
    withShopname: false,
    useDynamicAttribute: true,
    withSuggestedItems: false,
    withOfferPricePromotion: true,
    withProductSuggest: false,
    withParentProducts: Boolean(params.show_product_list),
    withProductArticles: false,
    withSearchConditionId: false,
    withAuction: true,
    laplaceDeviceUuid: deviceId
  };
  const dpopJwt = await generateDpopJwt('POST', ENDPOINTS.search, deviceId);
  return mercariRest<ApiEntitySearchResponse>(ENDPOINTS.search, dpopJwt, {
    method: 'POST',
    body: request,
    requestId: deviceId
  });
}

function postFiltersActive(params: SearchParams): boolean {
  return params.price_min !== undefined || params.price_max !== undefined
    || (params.exclude_keyword ?? '').length > 0
    || createdAfterEpoch(params.created_after_date) !== null;
}

export async function searchMercariItems(params: SearchParams): Promise<SearchResult> {
  debugLog('tool', 'mercari_search');
  debugLog('input', params);
  const requestedLimit = params.limit === undefined ? DEFAULT_PAGE_SIZE : Math.max(1, params.limit);
  const pageSize = Math.min(MAX_PAGE_SIZE, requestedLimit);

  const items: SearchItem[] = [];
  let pageToken = params.page_token ?? '';
  let totalCount: number | null = null;
  let nextToken: string | null = null;
  let fetchedCount = 0;
  let rawCount = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const payload = await requestPage(params, pageSize, pageToken);
    totalCount = payload.meta?.numFound === undefined ? totalCount : Number(payload.meta.numFound);
    nextToken = payload.meta?.nextPageToken ? String(payload.meta.nextPageToken) : null;

    const pageItems = (payload.items ?? [])
      .filter(item => passesPostFilters(item, params))
      .map(normalizeItem)
      .filter((item): item is SearchItem => item !== null);
    rawCount += payload.items?.length ?? 0;
    fetchedCount += pageItems.length;
    items.push(...pageItems);
    debugLog('page', { page, raw: payload.items?.length ?? 0, kept: pageItems.length, fetched: fetchedCount });

    // Without post-filters one page already satisfies the limit (pageSize >= limit).
    if (!postFiltersActive(params)) break;
    if (items.length >= requestedLimit || nextToken === null || fetchedCount >= MAX_FETCH_ITEMS) break;
    pageToken = nextToken;
  }

  debugLog('totals', { rawCount, returned: Math.min(items.length, requestedLimit), totalCount });

  const limited = items.slice(0, requestedLimit);
  return {
    items: limited,
    total_count: totalCount,
    next_page_token: nextToken !== null && limited.length > 0 ? nextToken : null,
    source: 'api'
  };
}
