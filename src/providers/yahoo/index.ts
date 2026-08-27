import { searchYahooItems } from './search.ts';
import { fetchYahooItem } from './item.ts';
import { getYahooCategories } from './categories.ts';
import { fetchYahooSeller } from './seller.ts';
import type {
  YahooCategoriesOptions,
  YahooCategoryRecord,
  YahooItemDetail,
  YahooSearchParams,
  YahooSearchResult,
  YahooSellerProfile
} from './types.ts';

// Yahoo! Flea Market has different data semantics from Mercari (auction-backed
// listings, distinct category API, no anonymous item-detail endpoint), so it is
// a standalone provider rather than an implementation of the Mercari-shaped
// MarketplaceProvider interface.
export class YahooFleamarketProvider {
  readonly id = 'yahoo_fleamarket';

  async search(params: YahooSearchParams): Promise<YahooSearchResult> {
    return searchYahooItems(params);
  }

  async getItem(itemIdOrUrl: string): Promise<YahooItemDetail> {
    return fetchYahooItem(itemIdOrUrl);
  }

  async getCategories(options?: YahooCategoriesOptions): Promise<YahooCategoryRecord[]> {
    return getYahooCategories(options);
  }

  async getSeller(sellerId: string): Promise<YahooSellerProfile> {
    return fetchYahooSeller(sellerId);
  }
}

export const yahooFleamarketProvider = new YahooFleamarketProvider();
