import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSearchUrl } from '../src/url.ts';

test('builds whitelisted search URL with list filters', () => {
  const url = buildSearchUrl('https://jp.mercari.com/search', {
    keyword: 'カビゴン',
    category_id: [1328, 82],
    status: 'on_sale,sold_out',
    item_condition_id: [1, 2],
    price_min: 1000,
    price_max: 2000,
    sort: 'created_time',
    order: 'asc'
  });
  const search = url.searchParams;
  assert.equal(search.get('keyword'), 'カビゴン');
  assert.equal(search.get('category_id'), '1328,82');
  assert.equal(search.get('status'), 'on_sale,sold_out');
  assert.equal(search.get('item_condition_id'), '1,2');
  assert.equal(search.get('price_min'), '1000');
  assert.equal(search.get('sort'), 'created_time');
});
