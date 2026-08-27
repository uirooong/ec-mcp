// All Yahoo! Flea Market (paypayfleamarket) endpoints and enum mappings live
// here so future API changes touch a single file. These are the internal
// JSON APIs the Yahoo! Flea Market web client's server tier calls; they are
// reachable anonymously and return structured JSON (no HTML involved).

// The web client's publicApiBaseUrl is https://paypayfleamarket.yahoo.co.jp/api/
// with per-service prefixes (e.g. /v1/search, /item/v2/items/{id},
// /category/v1/categories/{id}/children).
export const YAHOO_API_ROOT = 'https://paypayfleamarket.yahoo.co.jp/api';
export const YAHOO_API_BASE_URL = `${YAHOO_API_ROOT}/v1`;
export const YAHOO_WEB_BASE_URL = 'https://paypayfleamarket.yahoo.co.jp';

export const ENDPOINTS = {
  search: `${YAHOO_API_BASE_URL}/search`,
  itemDetail: (itemId: string): string => `${YAHOO_API_ROOT}/item/v2/items/${encodeURIComponent(itemId)}`,
  categoryChildren: (parentId: string): string =>
    `${YAHOO_API_BASE_URL}/categories/${encodeURIComponent(parentId)}/children`,
  user: (sellerId: string): string => `${YAHOO_API_BASE_URL}/users/${encodeURIComponent(sellerId)}`,
  userRatings: (sellerId: string): string =>
    `${YAHOO_API_BASE_URL}/users/${encodeURIComponent(sellerId)}/ratings`
} as const;

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100; // API caps `results` at 100.
export const MAX_PAGES = 5;
export const MAX_FETCH_ITEMS = 500;
export const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CATEGORY_ROOT_ID = '0'; // /categories/0/children -> [Shopping(1)]
export const CATEGORY_SHOPPING_ID = '1'; // real top-level genres are children of 1.
export const MAX_CATEGORY_CRAWL_NODES = 4000; // safety bound for keyword crawl.

// MCP sort key -> API `sort` value. Only reliably verified keys are exposed.
// The API default (no sort) is relevance/recommended.
export const SORT_ENUM = {
  price: 'price'
} as const;

// API `order` values are upper-case; unknown values fall back to ASC.
export const ORDER_ENUM = {
  asc: 'ASC',
  desc: 'DESC'
} as const;

// MCP status -> API `itemStatus`. The API only distinguishes open vs sold.
export const STATUS_ENUM = {
  on_sale: 'open',
  sold_out: 'sold'
} as const;

// API itemStatus (raw) -> normalized MCP status.
export const API_STATUS_MAP: Record<string, 'on_sale' | 'sold_out'> = {
  OPEN: 'on_sale',
  SOLD: 'sold_out'
};

// Yahoo! Flea Market item condition codes -> Japanese label. `new` plus the
// used10..used60 scale are what the search API accepts for `itemConditions`.
export const CONDITION_LABELS: Record<string, string> = {
  new: '新品、未使用',
  used10: '未使用に近い',
  used20: '目立った傷や汚れなし',
  used40: 'やや傷や汚れあり',
  used60: '傷や汚れあり'
};
