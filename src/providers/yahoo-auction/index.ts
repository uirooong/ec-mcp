import { searchYahooAuctions } from './search.ts';
import { fetchYahooAuctionItem } from './item.ts';
import { getYahooAuctionCategories } from './categories.ts';
import type {
  YahooAuctionCategoriesOptions,
  YahooAuctionCategoryRecord,
  YahooAuctionItemDetail,
  YahooAuctionSearchParams,
  YahooAuctionSearchResult
} from './types.ts';

// Yahoo! Auctions is auction-native (current/buy-now prices, bids, end time),
// so it is a standalone provider rather than an implementation of the
// flea-market-shaped MarketplaceProvider interface.
export class YahooAuctionProvider {
  readonly id = 'yahoo_auction';

  async search(params: YahooAuctionSearchParams): Promise<YahooAuctionSearchResult> {
    return searchYahooAuctions(params);
  }

  async getItem(auctionIdOrUrl: string): Promise<YahooAuctionItemDetail> {
    return fetchYahooAuctionItem(auctionIdOrUrl);
  }

  async getCategories(options?: YahooAuctionCategoriesOptions): Promise<YahooAuctionCategoryRecord[]> {
    return getYahooAuctionCategories(options);
  }
}

export const yahooAuctionProvider = new YahooAuctionProvider();
