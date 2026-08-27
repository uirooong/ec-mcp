import {
  ITEM_TYPE_ENUM, ORDER_ENUM, SHIPPING_METHOD_ENUM, SORT_ENUM, STATUS_ENUM
} from './constants.ts';
import { normalizeList } from '../../url.ts';
import type { SearchParams } from '../../types.ts';

export interface ApiSearchCondition {
  keyword: string;
  excludeKeyword: string;
  sort: string;
  order: string;
  status: string[];
  sizeId: number[];
  categoryId: number[];
  brandId: number[];
  sellerId: string[];
  priceMin: number;
  priceMax: number;
  itemConditionId: number[];
  shippingPayerId: number[];
  shippingFromArea: number[];
  shippingMethod: string[];
  colorId: number[];
  hasCoupon: boolean;
  createdAfterDate?: string;
  itemTypes: string[];
  skuIds: string[];
}

function toNumbers(value: string[] | undefined): number[] {
  if (!value) return [];
  const result: number[] = [];
  for (const item of value) {
    const normalizedItem = /^[a-z]/i.test(item) && /g/i.test(item) ? item.slice(1) : item;
    const parsedValue = Number(normalizedItem);
    if (!Number.isFinite(parsedValue)) {
      throw new Error(`Invalid numeric list value: ${item}`);
    }
    result.push(parsedValue);
  }
  return result;
}

function mapUnique(value: string[], map: Record<string, string>): string[] {
  return [...new Set(value.map(item => map[item] ?? item))];
}

export function buildApiSearchCondition(params: SearchParams): ApiSearchCondition {
  const statuses = mapUnique(normalizeList(params.status), STATUS_ENUM);
  if (statuses.includes(STATUS_ENUM.sold_out)) {
    statuses.push(STATUS_ENUM.trading);
  }
  const conditions: ApiSearchCondition = {
    keyword: params.keyword ?? '',
    excludeKeyword: params.exclude_keyword ?? '',
    sort: params.sort === undefined ? 'SORT_DEFAULT' : SORT_ENUM[params.sort],
    order: params.order === undefined || params.order === 'desc' ? ORDER_ENUM.desc : ORDER_ENUM[params.order],
    status: [...new Set(statuses)],
    sizeId: toNumbers(normalizeList(params.size_id)),
    categoryId: toNumbers(normalizeList(params.category_id)),
    brandId: toNumbers(normalizeList(params.brand_id)),
    sellerId: normalizeList(params.seller_id),
    priceMin: params.price_min === undefined ? 0 : Number(params.price_min) || 0,
    priceMax: params.price_max === undefined ? 0 : Number(params.price_max) || 0,
    itemConditionId: toNumbers(normalizeList(params.item_condition_id)),
    shippingPayerId: toNumbers(normalizeList(params.shipping_payer_id)),
    shippingFromArea: toNumbers(normalizeList(params.shipping_from_area)),
    shippingMethod: mapUnique(normalizeList(params.shipping_method), SHIPPING_METHOD_ENUM),
    colorId: toNumbers(normalizeList(params.color_id)),
    hasCoupon: Boolean(params.has_coupon),
    itemTypes: mapUnique(
      normalizeList(params.item_types).map(item => item.toLowerCase()),
      ITEM_TYPE_ENUM
    ),
    skuIds: Array.isArray(params.sku_ids)
      ? params.sku_ids.flatMap(item => item.split(',')).map(item => item.trim()).filter(Boolean)
      : params.sku_ids?.split(',').map(item => item.trim()).filter(Boolean) ?? []
  };
  if (params.created_after_date !== undefined && params.created_after_date.length > 0) {
    conditions.createdAfterDate = params.created_after_date;
  }
  return conditions;
}

Object.assign(STATUS_ENUM, {});
