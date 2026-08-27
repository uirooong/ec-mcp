import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApiSearchCondition } from '../src/providers/mercari/search-condition.ts';

test('maps every shared URL filter into API search condition', () => {
  const condition = buildApiSearchCondition({
    keyword: 'ポケモン',
    exclude_keyword: 'コピー',
    category_id: '1289,82',
    size_id: ['g123', 45],
    brand_id: '15487',
    seller_id: [1, '2'],
    price_min: 300,
    price_max: 10000,
    item_condition_id: [1, 3],
    shipping_payer_id: '2',
    shipping_from_area: '39,13',
    status: 'sold_out,on_sale',
    shipping_method: 'anonymous,no_option',
    color_id: [4],
    item_types: ['beyond', 'mercari'],
    has_coupon: true,
    created_after_date: '2026-08-01',
    sort: 'price',
    order: 'asc',
    sku_ids: 'a,b,c',
    show_product_list: true
  });
  assert.equal(condition.keyword, 'ポケモン');
  assert.deepEqual(condition.categoryId, [1289, 82]);
  assert.deepEqual(condition.sizeId, [123, 45]);
  assert.deepEqual(condition.sellerId, ['1', '2']);
  assert.equal(condition.priceMin, 300);
  assert.equal(condition.priceMax, 10000);
  assert.deepEqual(new Set(condition.status), new Set(['STATUS_SOLD_OUT', 'STATUS_TRADING', 'STATUS_ON_SALE']));
  assert.deepEqual(condition.shippingMethod, ['SHIPPING_METHOD_ANONYMOUS', 'SHIPPING_METHOD_NO_OPTION']);
  assert.deepEqual(condition.itemTypes, ['ITEM_TYPE_BEYOND', 'ITEM_TYPE_MERCARI']);
  assert.equal(condition.hasCoupon, true);
  assert.equal(condition.createdAfterDate, '2026-08-01');
  assert.equal(condition.sort, 'SORT_PRICE');
  assert.equal(condition.order, 'ORDER_ASC');
  assert.deepEqual(condition.skuIds, ['a', 'b', 'c']);
});
