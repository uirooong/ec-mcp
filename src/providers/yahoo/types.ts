// Raw Yahoo! Flea Market API response shapes (only the fields we consume) kept
// separate from the normalized MCP types below, so provider field names never
// leak into the MCP surface.

export type YahooItemId = string;
export type YahooCategoryId = string;
export type YahooSellerId = string;

export interface YahooApiCategoryRef {
  id?: number | string;
  name?: string;
  path?: Array<{ id?: number | string; name?: string }>;
  productCategoryId?: number | string;
}

export interface YahooApiSearchItem {
  id?: string;
  title?: string;
  price?: number | string;
  likeCount?: number | string;
  openTime?: string;
  endTime?: string;
  thumbnailImageUrl?: string;
  imageCount?: number | string;
  category?: YahooApiCategoryRef;
  brand?: { id?: number | string; name?: string };
  sellerId?: string;
  itemStatus?: string;
  condition?: string;
  seller?: { id?: string; goodRatio?: number; numRating?: number };
}

export interface YahooApiSearchResponse {
  totalResultsAvailable?: number;
  totalResultsReturned?: number;
  offset?: number;
  items?: YahooApiSearchItem[];
  error?: { code?: string; codeV2?: string; message?: string };
}

export interface YahooApiCategoryChild {
  id?: number | string;
  name?: string;
  isWearCategory?: boolean;
  productCategory?: { id?: number | string; name?: string };
  purchaseProhibitedGenreUnder18?: boolean;
}

export interface YahooApiUser {
  id?: string;
  nickname?: string;
  deleted?: boolean;
  rating?: { total?: number; goodRatio?: number };
  image?: { url?: string };
  isGold?: boolean;
  tradingRecord?: { displayLabel?: string };
}

// ---- Normalized MCP types ----

export type YahooItemStatus = 'on_sale' | 'sold_out' | 'unknown';

export interface YahooCategoryTier {
  id: YahooCategoryId;
  name: string;
}

export interface YahooSellerSummary {
  id: YahooSellerId;
  good_ratio: number | null;
  num_rating: number | null;
}

export interface YahooSearchItem {
  id: YahooItemId;
  name: string;
  price: number;
  status: YahooItemStatus;
  condition_id: string | null;
  condition_name: string | null;
  thumbnail: string | null;
  url: string;
  likes_count: number | null;
  category: YahooCategoryTier[];
  brand_name: string | null;
  seller: YahooSellerSummary | null;
  end_time: string | null;
}

export interface YahooSearchResult {
  items: YahooSearchItem[];
  total_count: number | null;
  offset: number;
  next_offset: number | null;
  source: 'api';
}

export interface YahooCategoryRecord {
  id: YahooCategoryId;
  name: string;
  parentId: YahooCategoryId | null;
  level: number;
  pathNames: string[];
  // true/false when known (keyword crawl), null when not probed (cheap listing).
  hasChildren: boolean | null;
}

export interface YahooSellerProfile {
  id: YahooSellerId;
  nickname: string | null;
  rating_total: number | null;
  good_ratio: number | null;
  image_url: string | null;
  is_gold: boolean;
  trading_record_label: string | null;
}

// Raw /api/item/v2/items/{id} response (fields we consume).
export interface YahooApiItemDetail {
  id?: string;
  title?: string;
  description?: string;
  price?: number | string;
  status?: string;
  type?: string;
  condition?: { key?: string; text?: string };
  images?: Array<{ url?: string; width?: number; height?: number }>;
  categoryList?: Array<{ id?: number | string; name?: string }>;
  productCategory?: { id?: number | string; name?: string };
  brand?: { id?: number | string; name?: string };
  seller?: {
    id?: string;
    nickname?: string;
    rating?: { total?: number; goodRatio?: number };
    image?: { url?: string };
  };
  deliveryMethod?: { id?: string; name?: string };
  deliverySchedule?: { id?: string; text?: string };
  location?: string;
  createDate?: string;
  likeCount?: number | string;
  pvCount?: number | string;
  questionCount?: number | string;
  hashtags?: string[];
  error?: { code?: string; message?: string };
}

export interface YahooItemDetail {
  id: YahooItemId;
  name: string;
  description: string | null;
  price: number;
  status: YahooItemStatus;
  item_type: string | null;
  photos: string[];
  category: YahooCategoryTier[];
  product_category_name: string | null;
  brand_name: string | null;
  condition_id: string | null;
  condition_name: string | null;
  delivery_method_name: string | null;
  delivery_schedule_name: string | null;
  shipping_from_location: string | null;
  likes_count: number | null;
  page_views: number | null;
  questions_count: number | null;
  hashtags: string[];
  seller: (YahooSellerSummary & { nickname: string | null }) | null;
  url: string;
  created_at: number | null;
}

export interface YahooSearchParams {
  keyword?: string;
  exclude_keyword?: string;
  category_id?: number[] | string;
  price_min?: number;
  price_max?: number;
  condition?: string[] | string;
  status?: 'on_sale' | 'sold_out';
  seller_id?: string;
  sort?: 'price';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface YahooCategoriesOptions {
  keyword?: string;
  parent_id?: number | string;
  root_only?: boolean;
}
