import { DETAIL_STATUS_MAP, ENDPOINTS, YAHOO_AUCTION_WEB_BASE } from './constants.ts';
import { debugLog, yahooAuctionRest } from './rest-client.ts';
import { remainingSeconds, toNullableNumber } from './search.ts';
import { YahooAuctionApiError } from './errors.ts';
import { MarketplaceError } from '../../errors.ts';
import type { YahooApiItemDetail, YahooAuctionItemDetail, YahooAuctionStatus } from './types.ts';

const AUCTION_ID_PATTERN = /^[a-z]?\d+$/i;

/**
 * Extracts a Yahoo! Auctions auction id from a raw id or an item URL. Pure and
 * local — the URL itself is never fetched.
 */
export function normalizeAuctionId(input: string): string {
  const raw = input.trim();
  const fromUrl =
    raw.match(/\/auction\/(?<id>[a-z]?\d+)/i)?.groups?.id ??
    raw.match(/[?&]aID=(?<id>[a-z]?\d+)/i)?.groups?.id ??
    raw.match(/[?&]auctionID=(?<id>[a-z]?\d+)/i)?.groups?.id;
  const id = fromUrl ?? (AUCTION_ID_PATTERN.test(raw) ? raw : undefined);
  if (id === undefined) {
    throw new MarketplaceError('MCP_INVALID_ARGUMENT', `Invalid Yahoo! Auctions ID or URL: ${raw}`);
  }
  return id;
}

function normalizeStatus(payload: YahooApiItemDetail, now: number): YahooAuctionStatus {
  const raw = payload.status?.toLowerCase();
  const mapped = raw === undefined ? undefined : DETAIL_STATUS_MAP[raw];
  if (mapped !== undefined) return mapped;
  const remaining = remainingSeconds(payload.endTime, now);
  if (remaining === null) return 'unknown';
  return remaining > 0 ? 'open' : 'closed';
}

/**
 * The detail API returns the description both as a pre-split array of lines and
 * as an HTML blob. We use the structured array and fall back to the plain
 * string form; the HTML variant is deliberately ignored.
 */
function normalizeDescription(value: string[] | string | undefined): string | null {
  if (Array.isArray(value)) {
    const text = value.join('\n').trim();
    return text.length > 0 ? text : null;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

export function buildItemDetail(
  payload: YahooApiItemDetail,
  auctionId: string,
  now = Date.now()
): YahooAuctionItemDetail {
  const buyNow = toNullableNumber(payload.bidorbuy);
  const hasBuyNow = buyNow !== null && buyNow > 0;
  const seen = new Set<string>();
  const category = (payload.category?.path ?? [])
    .filter(tier => tier.id !== undefined)
    .map(tier => ({ id: String(tier.id), name: tier.name ?? '' }))
    .filter(tier => {
      if (seen.has(tier.id)) return false;
      seen.add(tier.id);
      return true;
    });
  const rating = payload.seller?.rating;
  // `leftTime` is the provider's own countdown; prefer it and fall back to a
  // local computation from endTime so expired auctions still report 0.
  const providerLeft = toNullableNumber(payload.leftTime);
  const remaining = providerLeft !== null
    ? Math.max(0, Math.floor(providerLeft))
    : remainingSeconds(payload.endTime, now);

  return {
    id: payload.auctionId ?? auctionId,
    name: payload.title ?? '',
    description: normalizeDescription(payload.description),
    current_price: toNullableNumber(payload.price) ?? 0,
    starting_price: toNullableNumber(payload.initPrice),
    buy_now_price: hasBuyNow ? buyNow : null,
    has_buy_now: hasBuyNow,
    currency: 'JPY',
    bid_count: toNullableNumber(payload.bids),
    bidders_count: toNullableNumber(payload.biddersNum),
    watch_count: toNullableNumber(payload.watchListNum),
    quantity: toNullableNumber(payload.quantity),
    status: normalizeStatus(payload, now),
    start_time: payload.startTime ?? null,
    end_time: payload.endTime ?? null,
    remaining_seconds: remaining,
    photos: (payload.img ?? [])
      .map(image => image.image ?? image.thumbnail)
      .filter((url): url is string => typeof url === 'string' && url.length > 0),
    category,
    brand_names: (payload.brand?.path ?? [])
      .map(brand => brand.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
    condition_name: payload.conditionName ?? null,
    shipping_payer: payload.chargeForShipping ?? null,
    shipping_schedule: payload.shipScheduleName ?? null,
    shipping_methods: (payload.shipping?.methods ?? [])
      .map(method => method.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
    seller: payload.seller?.aucUserId
      ? {
          id: String(payload.seller.aucUserId),
          name: payload.seller.displayName ?? null,
          good_rating_ratio: rating?.goodRating ?? null,
          rating_total: rating?.ult?.allPoint ?? rating?.summary ?? null,
          good_rating_count: rating?.ult?.goodPoint ?? null,
          bad_rating_count: rating?.ult?.badPoint ?? null,
          is_store: Boolean(payload.seller.isStore)
        }
      : null,
    questions_count:
      (toNullableNumber(payload.answeredQAndANum) ?? 0) + (toNullableNumber(payload.unAnsweredQAndANum) ?? 0),
    is_flea_market: Boolean(payload.isFleaMarket),
    url: payload.auctionItemUrl ?? `${YAHOO_AUCTION_WEB_BASE}/jp/auction/${auctionId}`
  };
}

/**
 * Auction detail via GET /api/detail/v2/items/{auctionId} — the same JSON
 * endpoint the Yahoo! Auctions web client's detail module calls. Anonymous,
 * no special headers, and read-only.
 */
export async function fetchYahooAuctionItem(input: string): Promise<YahooAuctionItemDetail> {
  debugLog('tool', 'yahoo_auction_get_item');
  debugLog('input', { item: input });
  const auctionId = normalizeAuctionId(input);
  const payload = await yahooAuctionRest<YahooApiItemDetail>(ENDPOINTS.itemDetail(auctionId));
  const detail = buildItemDetail(payload, auctionId);
  if (!detail.id || !detail.name) {
    throw new YahooAuctionApiError(`Yahoo! Auctions detail API returned an unusable payload for ${auctionId}`);
  }
  debugLog('item detail', {
    id: detail.id,
    price: detail.current_price,
    bids: detail.bid_count,
    status: detail.status
  });
  return detail;
}
