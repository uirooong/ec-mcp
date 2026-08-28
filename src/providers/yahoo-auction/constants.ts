// All Yahoo! Auctions endpoints and enum mappings live here so future API
// changes touch a single file. These are the internal JSON APIs the Yahoo!
// Auctions web client (Next.js "webfe" app) calls; they are reachable
// anonymously and return structured JSON. No HTML is involved.

export const YAHOO_AUCTION_API_BASE = 'https://auctions.yahoo.co.jp/api';
export const YAHOO_AUCTION_WEB_BASE = 'https://auctions.yahoo.co.jp';

export const ENDPOINTS = {
  search: `${YAHOO_AUCTION_API_BASE}/search/v3/search/items`,
  itemDetail: (auctionId: string): string =>
    `${YAHOO_AUCTION_API_BASE}/detail/v2/items/${encodeURIComponent(auctionId)}`,
  // Category navigation rides on the search "modules" endpoint, which returns
  // current/parent/children for any category id (arbitrary depth).
  searchModules: `${YAHOO_AUCTION_API_BASE}/search/v1/search/modules`
} as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100; // API rejects limit > 100.
export const MAX_PAGES = 5;
export const MAX_FETCH_ITEMS = 500;
export const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Anonymous session cookie lifetime before we re-bootstrap it.
export const SESSION_TTL_MS = 30 * 60 * 1000;
export const CATEGORY_ROOT_ID = '0';

/**
 * MCP sort key -> API `sort` value. The API takes a signed token where "+" is
 * ascending and "-" is descending; the full allow-list is reported by the API's
 * own validation error. Only keys verified against live responses are exposed.
 */
export const SORT_TOKENS = {
  current_price: { asc: '+PRICE', desc: '-PRICE' },
  buy_now_price: { asc: '+BUY_NOW_PRICE', desc: '-BUY_NOW_PRICE' },
  start_price: { asc: '+START_PRICE', desc: '-START_PRICE' },
  end_time: { asc: '+END_TIME', desc: '-END_TIME' },
  bid_count: { asc: '+BID_COUNT', desc: '-BID_COUNT' },
  watch_count: { asc: '+WATCH_COUNT', desc: '-WATCH_COUNT' }
} as const;

export type SortKey = keyof typeof SORT_TOKENS;

// MCP status -> API `status`. The search API only distinguishes open vs closed.
export const STATUS_PARAM = {
  open: 'OPEN',
  closed: 'CLOSED'
} as const;

/**
 * Item condition codes accepted by the search API's `conditions` parameter and
 * echoed back on each item as `itemCondition`.
 */
export const CONDITION_CODES = ['NEW', 'USED10', 'USED20', 'USED40', 'USED60'] as const;
export type ConditionCode = (typeof CONDITION_CODES)[number];

export const CONDITION_LABELS: Record<string, string> = {
  NEW: '新品、未使用',
  USED10: '未使用に近い',
  USED20: '目立った傷や汚れなし',
  USED40: 'やや傷や汚れあり',
  USED60: '傷や汚れあり'
};

// Raw detail `status` values seen on live responses -> normalized MCP status.
export const DETAIL_STATUS_MAP: Record<string, 'open' | 'closed'> = {
  open: 'open',
  closed: 'closed',
  close: 'closed'
};
