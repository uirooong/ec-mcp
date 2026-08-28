import assert from 'node:assert/strict';
import test from 'node:test';
import { searchYahooAuctions } from '../src/providers/yahoo-auction/search.ts';
import { fetchYahooAuctionItem } from '../src/providers/yahoo-auction/item.ts';
import { getYahooAuctionCategories } from '../src/providers/yahoo-auction/categories.ts';

// Live tests against the Yahoo! Auctions JSON API. Skipped unless explicitly
// enabled so CI never depends on the external endpoint. The provider throttles
// bursts (HTTP 423), so these run sequentially and stay modest in volume.
const ENABLED = process.env.YAHOO_AUCTION_INTEGRATION_TEST === 'true';
const liveTest = ENABLED ? test : test.skip;

liveTest('basic keyword search returns open auctions', async () => {
  const result = await searchYahooAuctions({ keyword: 'iPhone', limit: 20 });
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every(item => item.id.length > 0));
  assert.ok(result.items.every(item => item.status === 'open'));
});

liveTest('Japanese keyword search works', async () => {
  const result = await searchYahooAuctions({ keyword: '地デジチューナー', limit: 5 });
  assert.ok(result.items.length > 0);
});

liveTest('current price range holds in the final response', async () => {
  const result = await searchYahooAuctions({ keyword: 'iPhone', price_min: 10000, price_max: 20000, limit: 40 });
  assert.ok(result.items.every(item => item.current_price >= 10000 && item.current_price <= 20000));
});

liveTest('has_buy_now returns only auctions with a buy-it-now price', async () => {
  const result = await searchYahooAuctions({ keyword: 'iPhone', has_buy_now: true, limit: 30 });
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every(item => item.has_buy_now && (item.buy_now_price ?? 0) > 0));
});

liveTest('exclude keyword does not leak into titles', async () => {
  const result = await searchYahooAuctions({ keyword: 'iPhone', exclude_keyword: 'ケース', limit: 30 });
  assert.ok(result.items.every(item => !item.name.includes('ケース')));
});

liveTest('category-only search stays inside the category subtree', async () => {
  const result = await searchYahooAuctions({ category_id: 23632, limit: 20 });
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every(item => item.category.some(tier => tier.id === '23632')));
});

liveTest('keyword + unrelated category honors the category constraint', async () => {
  const result = await searchYahooAuctions({ keyword: 'iPhone', category_id: 21600, limit: 20 });
  assert.ok(result.items.every(item => item.category.some(tier => tier.id === '21600')));
});

liveTest('current price sort is monotonic in both directions', async () => {
  const asc = await searchYahooAuctions({ keyword: 'Nintendo Switch', sort: 'current_price', order: 'asc', limit: 30 });
  const ap = asc.items.map(item => item.current_price);
  for (let i = 1; i < ap.length; i++) assert.ok(ap[i]! >= ap[i - 1]!);

  const desc = await searchYahooAuctions({ keyword: 'Nintendo Switch', sort: 'current_price', order: 'desc', limit: 30 });
  const dp = desc.items.map(item => item.current_price);
  for (let i = 1; i < dp.length; i++) assert.ok(dp[i]! <= dp[i - 1]!);
});

liveTest('end_time ascending returns soonest-ending auctions first', async () => {
  const result = await searchYahooAuctions({ keyword: 'iPhone', sort: 'end_time', order: 'asc', limit: 30 });
  const times = result.items.map(item => Date.parse(item.end_time ?? ''));
  for (let i = 1; i < times.length; i++) assert.ok(times[i]! >= times[i - 1]!);
  assert.ok(result.items.every(item => (item.remaining_seconds ?? 0) >= 0));
});

liveTest('condition filter returns only that condition', async () => {
  const result = await searchYahooAuctions({ keyword: 'iPhone', condition: 'NEW', limit: 20 });
  assert.ok(result.items.every(item => item.condition_id === 'NEW'));
});

liveTest('free shipping and prefecture filters are respected', async () => {
  const result = await searchYahooAuctions({
    keyword: 'iPhone',
    free_shipping: true,
    shipping_from_area: 13,
    limit: 20
  });
  assert.ok(result.items.every(item => item.is_free_shipping === true));
  assert.ok(result.items.every(item => item.shipping_from_prefecture_code === '13'));
});

liveTest('min_bids post-filter keeps only auctions with bids', async () => {
  const result = await searchYahooAuctions({
    keyword: 'iPhone',
    min_bids: 1,
    sort: 'bid_count',
    order: 'desc',
    limit: 20
  });
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every(item => (item.bid_count ?? 0) >= 1));
});

liveTest('offset pagination does not repeat items', async () => {
  const p0 = await searchYahooAuctions({ keyword: 'iPhone', limit: 5, offset: 0, sort: 'end_time', order: 'asc' });
  const p1 = await searchYahooAuctions({ keyword: 'iPhone', limit: 5, offset: 5, sort: 'end_time', order: 'asc' });
  const overlap = p0.items.filter(a => p1.items.some(b => b.id === a.id));
  assert.equal(overlap.length, 0);
});

liveTest('item detail exposes auction-specific fields', async () => {
  const seed = await searchYahooAuctions({ keyword: 'iPhone', min_bids: 1, sort: 'bid_count', order: 'desc', limit: 5 });
  const target = seed.items[0];
  assert.ok(target);
  const detail = await fetchYahooAuctionItem(target.id);
  assert.equal(detail.id, target.id);
  assert.equal(detail.currency, 'JPY');
  assert.ok(detail.current_price > 0);
  assert.ok((detail.bid_count ?? 0) >= 1);
  assert.ok(detail.end_time !== null);
  assert.ok((detail.remaining_seconds ?? -1) >= 0);
  assert.ok(detail.category.length > 0);
  assert.ok(detail.seller !== null);
});

liveTest('item detail by URL matches detail by ID', async () => {
  const seed = await searchYahooAuctions({ keyword: 'iPhone', limit: 3 });
  const target = seed.items[0];
  assert.ok(target);
  const byId = await fetchYahooAuctionItem(target.id);
  const byUrl = await fetchYahooAuctionItem(`https://auctions.yahoo.co.jp/jp/auction/${target.id}`);
  assert.equal(byId.id, byUrl.id);
  assert.equal(byId.name, byUrl.name);
});

liveTest('unknown auction id maps to a provider error', async () => {
  await assert.rejects(() => fetchYahooAuctionItem('z99999999999999'));
});

liveTest('category root and nested levels resolve to arbitrary depth', async () => {
  const roots = await getYahooAuctionCategories({ root_only: true });
  assert.ok(roots.length > 0);
  const level2 = await getYahooAuctionCategories({ parent_id: 23632 });
  assert.ok(level2.length > 0);
  const level3 = await getYahooAuctionCategories({ parent_id: 23960 });
  assert.ok(level3.some(record => record.name.includes('スマホ')));
  const level4 = await getYahooAuctionCategories({ parent_id: 2084317598 });
  assert.ok(level4.some(record => record.name === 'iPhone'));
});

liveTest('category keyword search finds nested categories', async () => {
  const matches = await getYahooAuctionCategories({ keyword: 'iPhone' });
  assert.ok(matches.length > 0);
  assert.ok(matches.every(record => record.pathNames.length > 0));
});
