import type {
  ItemTypeOption, OrderOption, ShippingMethodOption, SortOption, StatusOption
} from '../../types.ts';

export const MERCARI_API_BASE_URL = 'https://api.mercari.jp';
export const MERCARI_MASTER_BASE_URL = 'https://api.mercari.jp/master/v2';
export const MERCARI_WEB_BASE_URL = 'https://jp.mercari.com';
export const CRAWLER_USER_AGENT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
export const BROWSER_ACCEPT_LANGUAGE = 'ja-JP,ja;q=0.9';

export const DEFAULT_PAGE_SIZE = 120;
export const MAX_PAGE_SIZE = 120;

export const SORT_ENUM: Record<SortOption, string> = {
  created_time: 'SORT_CREATED_TIME',
  num_likes: 'SORT_NUM_LIKES',
  score: 'SORT_SCORE',
  price: 'SORT_PRICE'
};

export const ORDER_ENUM: Record<OrderOption, string> = {
  asc: 'ORDER_ASC',
  desc: 'ORDER_DESC'
};

export const STATUS_ENUM: Record<StatusOption, string> = {
  on_sale: 'STATUS_ON_SALE',
  trading: 'STATUS_TRADING',
  sold_out: 'STATUS_SOLD_OUT'
};

export const SHIPPING_METHOD_ENUM: Record<ShippingMethodOption, string> = {
  anonymous: 'SHIPPING_METHOD_ANONYMOUS',
  japan_post: 'SHIPPING_METHOD_JAPAN_POST',
  no_option: 'SHIPPING_METHOD_NO_OPTION'
};

export const ITEM_TYPE_ENUM: Record<ItemTypeOption, string> = {
  beyond: 'ITEM_TYPE_BEYOND',
  mercari: 'ITEM_TYPE_MERCARI'
};
