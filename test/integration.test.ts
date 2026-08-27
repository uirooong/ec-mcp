import assert from 'node:assert/strict';
import test from 'node:test';
import { searchMercariItems } from '../src/providers/mercari/search.ts';
import { fetchMercariItem } from '../src/providers/mercari/item.ts';
import { fetchAllCategories, filterCategories } from '../src/providers/mercari/categories.ts';

// Live tests hit Mercari's REST API. They are skipped unless explicitly enabled
// so CI never depends on an external, unauthenticated endpoint.
const ENABLED = process.env.MERCARI_INTEGRATION_TEST === 'true';
const liveTest = ENABLED ? test : test.skip;

liveTest('keyword search returns items', async () => {
  const result = await searchMercariItems({ keyword: 'iPhone', limit: 20 });
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every(item => item.id.length > 0));
});

liveTest('price range is respected in the final response', async () => {
  const result = await searchMercariItems({ keyword: 'iPhone', price_min: 10000, price_max: 20000, limit: 40 });
  assert.ok(result.items.every(item => item.price >= 10000 && item.price <= 20000));
});

liveTest('exclude keyword does not leak into the final response', async () => {
  const result = await searchMercariItems({ keyword: 'iPhone', exclude_keyword: 'iPhone', limit: 30 });
  assert.ok(result.items.every(item => !item.name.toLowerCase().includes('iphone')));
});

liveTest('keyword + category keeps the category constraint', async () => {
  const result = await searchMercariItems({ keyword: 'iPhone', category_id: 5, limit: 5 });
  if (result.items[0]) {
    const detail = await fetchMercariItem(result.items[0].id);
    assert.ok(detail.category.some(tier => tier.id === '5'));
  }
});

liveTest('sort price asc yields non-decreasing prices', async () => {
  const result = await searchMercariItems({ keyword: 'iPhone', sort: 'price', order: 'asc', limit: 40 });
  const prices = result.items.map(item => item.price);
  for (let i = 1; i < prices.length; i++) assert.ok(prices[i]! >= prices[i - 1]!);
});

liveTest('seller_id-only search returns that seller\'s items', async () => {
  const sellerId = process.env.PROBE_SELLER_ID ?? '276296408';
  const result = await searchMercariItems({ seller_id: sellerId, limit: 10 });
  assert.ok(result.items.length > 0);
});

liveTest('get_item returns fully populated detail', async () => {
  const search = await searchMercariItems({ keyword: 'iPhone', item_types: 'mercari', limit: 5 });
  const target = search.items.find(item => item.item_type === 'mercari');
  assert.ok(target);
  const detail = await fetchMercariItem(target.id);
  assert.notEqual(detail.status, 'unknown');
  assert.ok(detail.condition_id !== null);
  assert.ok(detail.created_at !== null);
  assert.ok(detail.category.length > 0);
});

liveTest('item URL and bare ID resolve to the same item', async () => {
  const search = await searchMercariItems({ keyword: 'iPhone', item_types: 'mercari', limit: 3 });
  const target = search.items.find(item => item.item_type === 'mercari');
  assert.ok(target);
  const byId = await fetchMercariItem(target.id);
  const byUrl = await fetchMercariItem(`https://jp.mercari.com/item/${target.id}`);
  assert.equal(byId.id, byUrl.id);
});

liveTest('category tree exposes nested children via parent_id', async () => {
  const records = await fetchAllCategories();
  assert.ok(filterCategories(records, { root_only: true }).length > 0);
  assert.ok(filterCategories(records, { parent_id: 98 }).length > 0);
  assert.ok(filterCategories(records, { parent_id: 848 }).length > 0);
});
