import { ENDPOINTS } from './constants.ts';
import { debugLog, yahooRest } from './rest-client.ts';
import { YahooFleamarketApiError } from './errors.ts';
import type { YahooApiUser, YahooSellerProfile } from './types.ts';

/**
 * Public seller profile via /api/v1/users/{sellerId}. Anonymous, structured
 * JSON. Seller listings themselves are retrieved through search (sellerIds).
 */
export async function fetchYahooSeller(sellerId: string): Promise<YahooSellerProfile> {
  debugLog('tool', 'yahoo_fleamarket_get_seller');
  debugLog('input', { sellerId });
  const id = sellerId.trim();
  if (id.length === 0) {
    throw new YahooFleamarketApiError('sellerId must not be empty');
  }
  const user = await yahooRest<YahooApiUser>(ENDPOINTS.user(id));
  return {
    id: String(user.id ?? id),
    nickname: user.nickname ?? null,
    rating_total: user.rating?.total ?? null,
    good_ratio: user.rating?.goodRatio ?? null,
    image_url: user.image?.url ?? null,
    is_gold: Boolean(user.isGold),
    trading_record_label: user.tradingRecord?.displayLabel ?? null
  };
}
