import assert from 'node:assert/strict';
import test from 'node:test';
import { searchYahooItems } from '../src/providers/yahoo/search.ts';
import { getYahooCategories } from '../src/providers/yahoo/categories.ts';
import { fetchYahooSeller } from '../src/providers/yahoo/seller.ts';
import { fetchYahooItem } from '../src/providers/yahoo/item.ts';

// Live tests against the Yahoo! Flea Market JSON API. Skipped unless enabled so
// CI never depends on the external endpoint.
const ENABLED = process.env.YAHOO_FLEAMARKET_INTEGRATION_TEST === 'true';
const liveTest = ENABLED ? test : test.skip;

liveTest('basic keyword search returns on-sale items', async () => {
  const result = await searchYahooItems({ keyword: 'iPhone', limit: 20 });
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every(item => item.status === 'on_sale'));
});

liveTest('Japanese keyword search works', async () => {
  const result = await searchYahooItems({ keyword: '地デジチューナー', limit: 5 });
  assert.ok(result.items.length > 0);
});

liveTest('price range holds in the final response', async () => {
  const result = await searchYahooItems({ keyword: 'iPhone', price_min: 10000, price_max: 20000, limit: 40 });
  assert.ok(result.items.every(item => item.price >= 10000 && item.price <= 20000));
});

liveTest('exclude keyword does not leak into titles', async () => {
  const result = await searchYahooItems({ keyword: 'iPhone', exclude_keyword: 'ケース', limit: 30 });
  assert.ok(result.items.every(item => !item.name.includes('ケース')));
});

liveTest('category filter keeps items in the category subtree', async () => {
  const result = await searchYahooItems({ keyword: 'iPhone', category_id: 2502, limit: 20 });
  assert.ok(result.items.every(item => item.category.some(tier => tier.id === '2502')));
});

liveTest('keyword + unrelated category honors the category constraint', async () => {
  const result = await searchYahooItems({ keyword: 'iPhone', category_id: 2498, limit: 10 });
  assert.ok(result.items.every(item => item.category.some(tier => tier.id === '2498')));
});

liveTest('sort price ascending and descending are monotonic', async () => {
  const asc = await searchYahooItems({ keyword: 'Nintendo Switch', sort: 'price', order: 'asc', limit: 30 });
  const ap = asc.items.map(i => i.price);
  for (let i = 1; i < ap.length; i++) assert.ok(ap[i]! >= ap[i - 1]!);
  const desc = await searchYahooItems({ keyword: 'Nintendo Switch', sort: 'price', order: 'desc', limit: 30 });
  const dp = desc.items.map(i => i.price);
  for (let i = 1; i < dp.length; i++) assert.ok(dp[i]! <= dp[i - 1]!);
});

liveTest('seller filter returns only that seller and profile resolves', async () => {
  const seed = await searchYahooItems({ keyword: 'iPhone', limit: 10 });
  const sellerId = seed.items.find(i => i.seller)?.seller?.id;
  assert.ok(sellerId);
  const bySeller = await searchYahooItems({ seller_id: sellerId, limit: 10 });
  assert.ok(bySeller.items.every(i => i.seller?.id === sellerId));
  const profile = await fetchYahooSeller(sellerId);
  assert.equal(profile.id, sellerId);
});

liveTest('offset pagination does not repeat items', async () => {
  const p0 = await searchYahooItems({ keyword: 'iPhone', limit: 5, offset: 0, sort: 'price', order: 'asc' });
  const p1 = await searchYahooItems({ keyword: 'iPhone', limit: 5, offset: 5, sort: 'price', order: 'asc' });
  const overlap = p0.items.filter(a => p1.items.some(b => b.id === a.id));
  assert.equal(overlap.length, 0);
});

liveTest('category root and nested children resolve', async () => {
  const roots = await getYahooCategories({ root_only: true });
  assert.ok(roots.length > 0);
  const children = await getYahooCategories({ parent_id: 2502 });
  assert.ok(children.length > 0);
  const grand = await getYahooCategories({ parent_id: 38338 });
  assert.ok(grand.some(record => record.name.includes('iPhone')));
});

liveTest('category keyword search finds the matching category', async () => {
  const matches = await getYahooCategories({ keyword: 'ポケモン' });
  assert.ok(matches.some(record => record.name.includes('ポケモン')));
});

liveTest('item detail by ID is fully populated', async () => {
  const seed = await searchYahooItems({ keyword: 'iPhone', limit: 3 });
  const target = seed.items[0];
  assert.ok(target);
  const detail = await fetchYahooItem(target.id);
  assert.equal(detail.id, target.id);
  assert.equal(detail.status, 'on_sale');
  assert.ok(detail.name.length > 0);
  assert.ok(detail.description !== null && detail.description.length > 0);
  assert.ok(detail.photos.length > 0);
  assert.ok(detail.category.length > 0);
  assert.ok(detail.condition_id !== null);
  assert.ok(detail.seller !== null);
  assert.ok(detail.created_at !== null);
});

liveTest('item detail by URL matches item detail by ID', async () => {
  const seed = await searchYahooItems({ keyword: 'iPhone', limit: 3 });
  const target = seed.items[0];
  assert.ok(target);
  const byId = await fetchYahooItem(target.id);
  const byUrl = await fetchYahooItem(`https://paypayfleamarket.yahoo.co.jp/item/${target.id}`);
  assert.equal(byId.id, byUrl.id);
  assert.equal(byId.name, byUrl.name);
  assert.equal(byId.price, byUrl.price);
});

liveTest('unknown item id maps to a not-found error', async () => {
  await assert.rejects(() => fetchYahooItem('zzz999999999999'), /not found|見つかりません|取得に失敗/);
});
