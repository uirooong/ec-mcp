// Raw Yahoo! Auctions API shapes (only the fields we consume) kept separate
// from the normalized MCP types below, so provider field names never leak into
// the MCP surface.

export type YahooAuctionId = string;
export type YahooAuctionCategoryId = string;
export type YahooAuctionSellerId = string;

export interface YahooApiCategoryRef {
  id?: number | string;
  name?: string;
  node?: number;
}

export interface YahooApiSearchItem {
  auctionId?: string;
  title?: string;
  /** Current price (bidding price). Named `price` by the API. */
  price?: number | string;
  buyNowPrice?: number | string | null;
  initPriceNoTax?: number | string | null;
  bidCount?: number | string;
  watchCount?: number | string;
  startTime?: string;
  endTime?: string;
  endTimeStatus?: string;
  imageUrl?: string;
  category?: { id?: number | string; name?: string };
  categoryPath?: YahooApiCategoryRef[];
  itemCondition?: string;
  isFreeShipping?: boolean;
  isFixedPrice?: boolean;
  isFleamarketItem?: boolean;
  prefectureCode?: string;
  seller?: { userId?: string; displayName?: string; goodRating?: string; isStore?: boolean };
}

export interface YahooApiSearchResponse {
  totalResultsAvailable?: number;
  items?: YahooApiSearchItem[];
  metadata?: { limit?: number; sort?: string };
}

export interface YahooApiCategoryNode {
  id?: number | string;
  name?: string;
  isLeaf?: boolean;
  count?: number;
}

export interface YahooApiModulesResponse {
  modules?: {
    category?: {
      current?: YahooApiCategoryNode | null;
      parent?: YahooApiCategoryNode | null;
      children?: YahooApiCategoryNode[];
    };
  };
}

export interface YahooApiItemDetail {
  auctionId?: string;
  title?: string;
  description?: string[] | string;
  /** Current price. */
  price?: number | string;
  /** Starting price. */
  initPrice?: number | string;
  /** Buy-it-now price (0 or absent when not offered). */
  bidorbuy?: number | string;
  taxinPrice?: number | string;
  taxinBidorbuy?: number | string;
  bids?: number | string;
  biddersNum?: number | string;
  watchListNum?: number | string;
  quantity?: number | string;
  status?: string;
  startTime?: string;
  endTime?: string;
  /** Seconds remaining, as computed by the API at response time. */
  leftTime?: number | string;
  conditionName?: string;
  category?: { path?: YahooApiCategoryRef[] };
  brand?: { path?: Array<{ id?: string; name?: string }> };
  img?: Array<{ image?: string; thumbnail?: string; width?: number; height?: number }>;
  chargeForShipping?: string;
  shipScheduleName?: string;
  shipping?: { methods?: Array<{ id?: string; name?: string }> };
  seller?: {
    aucUserId?: string;
    displayName?: string;
    isStore?: boolean;
    rating?: {
      goodRating?: string;
      summary?: number;
      ult?: { goodPoint?: number; badPoint?: number; allPoint?: number };
    };
  };
  answeredQAndANum?: number | string;
  unAnsweredQAndANum?: number | string;
  isOffer?: boolean;
  isFleaMarket?: boolean;
  auctionItemUrl?: string;
}

// ---- Normalized MCP types ----

export type YahooAuctionStatus = 'open' | 'closed' | 'unknown';

export interface YahooAuctionCategoryTier {
  id: YahooAuctionCategoryId;
  name: string;
}

export interface YahooAuctionSellerSummary {
  id: YahooAuctionSellerId;
  name: string | null;
  good_rating_ratio: string | null;
  rating_total: number | null;
  good_rating_count: number | null;
  bad_rating_count: number | null;
  is_store: boolean;
}

export interface YahooAuctionSearchItem {
  id: YahooAuctionId;
  name: string;
  current_price: number;
  buy_now_price: number | null;
  has_buy_now: boolean;
  bid_count: number | null;
  watch_count: number | null;
  status: YahooAuctionStatus;
  start_time: string | null;
  end_time: string | null;
  remaining_seconds: number | null;
  condition_id: string | null;
  condition_name: string | null;
  is_free_shipping: boolean | null;
  is_fixed_price: boolean | null;
  shipping_from_prefecture_code: string | null;
  thumbnail: string | null;
  category: YahooAuctionCategoryTier[];
  seller: YahooAuctionSellerSummary | null;
  url: string;
}

export interface YahooAuctionSearchResult {
  items: YahooAuctionSearchItem[];
  total_count: number | null;
  offset: number;
  next_offset: number | null;
  source: 'api';
}

export interface YahooAuctionItemDetail {
  id: YahooAuctionId;
  name: string;
  description: string | null;
  current_price: number;
  starting_price: number | null;
  buy_now_price: number | null;
  has_buy_now: boolean;
  currency: 'JPY';
  bid_count: number | null;
  bidders_count: number | null;
  watch_count: number | null;
  quantity: number | null;
  status: YahooAuctionStatus;
  start_time: string | null;
  end_time: string | null;
  remaining_seconds: number | null;
  photos: string[];
  category: YahooAuctionCategoryTier[];
  brand_names: string[];
  condition_name: string | null;
  shipping_payer: string | null;
  shipping_schedule: string | null;
  shipping_methods: string[];
  seller: YahooAuctionSellerSummary | null;
  questions_count: number | null;
  is_flea_market: boolean;
  url: string;
}

export interface YahooAuctionCategoryRecord {
  id: YahooAuctionCategoryId;
  name: string;
  parentId: YahooAuctionCategoryId | null;
  level: number;
  pathNames: string[];
  isLeaf: boolean | null;
}

export interface YahooAuctionSearchParams {
  keyword?: string;
  exclude_keyword?: string;
  category_id?: Array<number | string> | string;
  price_min?: number;
  price_max?: number;
  buy_now_price_min?: number;
  buy_now_price_max?: number;
  has_buy_now?: boolean;
  condition?: string[] | string;
  status?: 'open' | 'closed';
  free_shipping?: boolean;
  shipping_from_area?: Array<number | string> | string;
  min_bids?: number;
  max_bids?: number;
  ending_within_minutes?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface YahooAuctionCategoriesOptions {
  keyword?: string;
  parent_id?: number | string;
  root_only?: boolean;
}
