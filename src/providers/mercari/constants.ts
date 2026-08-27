export const MERCARI_API_BASE_URL = 'https://api.mercari.jp';
export const MERCARI_WEB_BASE_URL = 'https://jp.mercari.com';

export const ENDPOINTS = {
  search: `${MERCARI_API_BASE_URL}/v2/entities:search`,
  itemGet: `${MERCARI_API_BASE_URL}/items/get`,
  categoryMaster: `${MERCARI_API_BASE_URL}/master/v2/datasets/item_categories`
} as const;

export const DEFAULT_PAGE_SIZE = 120;
export const MAX_PAGE_SIZE = 120;
export const MAX_PAGES = 5;
export const MAX_FETCH_ITEMS = 600;
export const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const SORT_ENUM = {
  created_time: 'SORT_CREATED_TIME',
  num_likes: 'SORT_NUM_LIKES',
  score: 'SORT_SCORE',
  price: 'SORT_PRICE'
} as const;

export const ORDER_ENUM = {
  asc: 'ORDER_ASC',
  desc: 'ORDER_DESC'
} as const;

export const STATUS_ENUM = {
  on_sale: 'STATUS_ON_SALE',
  trading: 'STATUS_TRADING',
  sold_out: 'STATUS_SOLD_OUT'
} as const;

export const SHIPPING_METHOD_ENUM = {
  anonymous: 'SHIPPING_METHOD_ANONYMOUS',
  japan_post: 'SHIPPING_METHOD_JAPAN_POST',
  no_option: 'SHIPPING_METHOD_NO_OPTION'
} as const;

export const ITEM_TYPE_ENUM = {
  beyond: 'ITEM_TYPE_BEYOND',
  mercari: 'ITEM_TYPE_MERCARI'
} as const;
