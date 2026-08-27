import type { SearchParams, ListInput, SortOption, OrderOption } from './types.ts';

const SORT_ORDER_VALUES = new Set<SortOption>(['created_time', 'num_likes', 'score', 'price']);

function appendList(search: URLSearchParams, name: string, value: ListInput): void {
  const values = normalizeList(value);
  if (values.length > 0) {
    search.set(name, values.join(','));
  }
}

export function normalizeList(value: ListInput): string[] {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  const rawValues = Array.isArray(value) ? value : [value];
  return rawValues
    .flatMap(item => String(item).split(','))
    .map(item => item.trim())
    .filter(Boolean);
}

export function buildSearchUrl(baseUrl: string, params: SearchParams): URL {
  const url = new URL(baseUrl);
  const search = new URLSearchParams();
  for (const key of [
    'keyword', 'exclude_keyword', 'category_id', 'size_id', 'brand_id',
    'price_min', 'price_max', 'item_condition_id', 'shipping_payer_id',
    'status', 'shipping_method', 'color_id', 'item_types'
  ] as const) {
    const value = params[key as keyof SearchParams] as string | undefined;
    if (typeof value === 'string') {
      search.set(key, value);
    } else if (key in params && value !== undefined && value !== null && !Array.isArray(value)) {
      search.set(key, String(value));
    } else if (Array.isArray(value)) {
      appendList(search, key, value);
    }
  }
  if (params.seller_id !== undefined) appendList(search, 'seller_id', params.seller_id);
  if (params.shipping_from_area !== undefined) appendList(search, 'shipping_from_area', params.shipping_from_area);
  if (params.has_coupon !== undefined) search.set('has_coupon', String(params.has_coupon));
  if (params.created_after_date !== undefined) search.set('created_after_date', params.created_after_date);
  if (params.sort !== undefined && SORT_ORDER_VALUES.has(params.sort)) search.set('sort', params.sort);
  if (params.order !== undefined) search.set('order', params.order);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.page_token !== undefined) search.set('page_token', params.page_token);
  if (params.sku_ids !== undefined) search.set('sku_ids', Array.isArray(params.sku_ids) ? params.sku_ids.join(',') : params.sku_ids);
  if (params.show_product_list !== undefined) search.set('show_product_list', String(params.show_product_list));
  url.search = search.toString();
  return url;
}

export function stableQueryString(url: URL): string {
  const search = new URLSearchParams(url.search);
  search.delete('page_token');
  return search.toString();
}

export type { OrderOption };
