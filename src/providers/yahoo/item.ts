import { API_STATUS_MAP, ENDPOINTS, YAHOO_WEB_BASE_URL } from './constants.ts';
import { debugLog, yahooRest } from './rest-client.ts';
import { YahooFleamarketApiError } from './errors.ts';
import { MarketplaceError } from '../../errors.ts';
import type { YahooApiItemDetail, YahooItemDetail, YahooItemStatus } from './types.ts';

const ITEM_ID_PATTERN = /^[a-z]{0,3}\d+$/i;

/**
 * Extracts a Yahoo! Flea Market item id from a raw id or an item URL. Pure and
 * local — no network involved.
 */
export function normalizeItemId(input: string): string {
  const raw = input.trim();
  const fromUrl = raw.match(/\/item\/(?<id>[a-z]{0,3}\d+)/i)?.groups?.id;
  const id = fromUrl ?? (ITEM_ID_PATTERN.test(raw) ? raw : undefined);
  if (id === undefined) {
    throw new MarketplaceError('MCP_INVALID_ARGUMENT', `Invalid Yahoo! Flea Market item id or URL: ${raw}`);
  }
  return id;
}

function numeric(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function epochSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

function normalizeStatus(value: string | undefined): YahooItemStatus {
  if (value === undefined) return 'unknown';
  return API_STATUS_MAP[value.toUpperCase()] ?? 'unknown';
}

export function buildItemDetail(payload: YahooApiItemDetail, itemId: string): YahooItemDetail {
  const seen = new Set<string>();
  const category = (payload.categoryList ?? [])
    .filter(tier => tier.id !== undefined)
    .map(tier => ({ id: String(tier.id), name: tier.name ?? '' }))
    .filter(tier => {
      if (seen.has(tier.id)) return false;
      seen.add(tier.id);
      return true;
    });
  return {
    id: payload.id ?? itemId,
    name: payload.title ?? '',
    description: payload.description ?? null,
    price: numeric(payload.price) ?? 0,
    status: normalizeStatus(payload.status),
    item_type: payload.type ?? null,
    photos: (payload.images ?? [])
      .map(image => image.url)
      .filter((url): url is string => typeof url === 'string' && url.length > 0),
    category,
    product_category_name: payload.productCategory?.name ?? null,
    brand_name: payload.brand?.name ?? null,
    condition_id: payload.condition?.key ?? null,
    condition_name: payload.condition?.text ?? null,
    delivery_method_name: payload.deliveryMethod?.name ?? null,
    delivery_schedule_name: payload.deliverySchedule?.text ?? null,
    shipping_from_location: payload.location ?? null,
    likes_count: numeric(payload.likeCount),
    page_views: numeric(payload.pvCount),
    questions_count: numeric(payload.questionCount),
    hashtags: payload.hashtags ?? [],
    seller: payload.seller?.id
      ? {
          id: String(payload.seller.id),
          nickname: payload.seller.nickname ?? null,
          good_ratio: payload.seller.rating?.goodRatio ?? null,
          num_rating: payload.seller.rating?.total ?? null
        }
      : null,
    url: `${YAHOO_WEB_BASE_URL}/item/${itemId}`,
    created_at: epochSeconds(payload.createDate)
  };
}

/**
 * Item detail via GET /api/item/v2/items/{id} — the same JSON endpoint the
 * Yahoo! Flea Market web client's item API module calls (discovered in the
 * client bundle: publicApiBaseUrl + `/item/v2/items/${id}`). Anonymous, no
 * special headers required. Works for on-sale and sold items regardless of the
 * id prefix; unknown ids return a structured 404.
 */
export async function fetchYahooItem(input: string): Promise<YahooItemDetail> {
  debugLog('tool', 'yahoo_fleamarket_get_item');
  debugLog('input', { item: input });
  const itemId = normalizeItemId(input);
  const payload = await yahooRest<YahooApiItemDetail>(ENDPOINTS.itemDetail(itemId));
  if (payload.error) {
    throw new YahooFleamarketApiError(
      `Yahoo! Flea Market item API error for ${itemId}: ${payload.error.message ?? payload.error.code ?? 'unknown'}`
    );
  }
  const detail = buildItemDetail(payload, itemId);
  if (!detail.id || !detail.name) {
    throw new YahooFleamarketApiError(`Yahoo! Flea Market item API returned an unusable payload for ${itemId}`);
  }
  debugLog('item detail', { id: detail.id, name: detail.name, price: detail.price, status: detail.status });
  return detail;
}
