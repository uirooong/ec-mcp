import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSearchQuery,
  normalizeSearchItem,
  passesPostFilters,
  remainingSeconds
} from '../src/providers/yahoo-auction/search.ts';
import type { YahooApiSearchItem } from '../src/providers/yahoo-auction/types.ts';

test('buildSearchQuery maps every supported filter to the Yahoo Auctions param', () => {
  const q = buildSearchQuery({
    keyword: 'iPhone',
    exclude_keyword: 'ケース ジャンク',
    category_id: '23632,21600',
    price_min: 10000,
    price_max: 20000,
    buy_now_price_min: 5000,
    buy_now_price_max: 50000,
    condition: ['new', 'used20'],
    shipping_from_area: [13, 1],
    free_shipping: true,
    status: 'closed',
    sort: 'current_price',
    order: 'desc'
  });
  assert.equal(q.get('query'), 'iPhone -ケース -ジャンク');
  assert.equal(q.get('categoryIds'), '23632,21600');
  assert.equal(q.get('minPrice'), '10000');
  assert.equal(q.get('maxPrice'), '20000');
  assert.equal(q.get('minBuyNowPrice'), '5000');
  assert.equal(q.get('maxBuyNowPrice'), '50000');
  assert.equal(q.get('conditions'), 'NEW,USED20'); // upper-cased
  assert.equal(q.get('prefectureCodes'), '13,01'); // zero-padded
  assert.equal(q.get('isFreeShipping'), 'true');
  assert.equal(q.get('status'), 'CLOSED');
  assert.equal(q.get('sort'), '-PRICE');
});

test('buildSearchQuery defaults to open status and ascending sort tokens', () => {
  const q = buildSearchQuery({ keyword: 'x', sort: 'end_time' });
  assert.equal(q.get('status'), 'OPEN');
  assert.equal(q.get('sort'), '+END_TIME');
});

test('has_buy_now is expressed as minBuyNowPrice=1', () => {
  assert.equal(buildSearchQuery({ keyword: 'x', has_buy_now: true }).get('minBuyNowPrice'), '1');
  assert.equal(buildSearchQuery({ keyword: 'x' }).get('minBuyNowPrice'), null);
});

test('buildSearchQuery omits an empty query but requires keyword or category', () => {
  // Category-only search must not send query= (the API answers 500 for it).
  const q = buildSearchQuery({ category_id: 23632 });
  assert.equal(q.get('query'), null);
  assert.equal(q.get('categoryIds'), '23632');
  assert.throws(() => buildSearchQuery({}), /requires a keyword or a category_id/);
});

test('buildSearchQuery rejects invalid filter values', () => {
  assert.throws(() => buildSearchQuery({ keyword: 'x', category_id: 'abc' }), /Invalid category_id/);
  assert.throws(() => buildSearchQuery({ keyword: 'x', condition: 'MINT' }), /Unsupported condition/);
  assert.throws(() => buildSearchQuery({ keyword: 'x', sort: 'relevance' }), /Unsupported sort/);
  assert.throws(() => buildSearchQuery({ keyword: 'x', shipping_from_area: 'tokyo' }), /Invalid shipping_from_area/);
});

test('remainingSeconds counts down and floors expired auctions at zero', () => {
  const now = Date.parse('2026-08-28T12:00:00+09:00');
  assert.equal(remainingSeconds('2026-08-28T12:01:40+09:00', now), 100);
  assert.equal(remainingSeconds('2026-08-28T11:00:00+09:00', now), 0);
  assert.equal(remainingSeconds(undefined, now), null);
});

const rawItem: YahooApiSearchItem = {
  auctionId: 'x1236553240',
  title: 'iPhone 15 Pro 256GB',
  price: '12500',
  buyNowPrice: 20000,
  bidCount: 7,
  watchCount: 3,
  startTime: '2026-08-21T11:23:18+09:00',
  endTime: '2026-08-28T13:00:00+09:00',
  itemCondition: 'USED20',
  isFreeShipping: true,
  isFixedPrice: false,
  prefectureCode: '13',
  imageUrl: 'https://img.test/a.jpg',
  categoryPath: [
    { id: 0, name: 'オークション' },
    { id: 23632, name: '家電、AV、カメラ' },
    { id: 23960, name: '携帯電話、スマートフォン' },
    { id: 23960, name: '携帯電話、スマートフォン' } // duplicate must be dropped
  ],
  seller: { userId: 'SELLER1', displayName: 'shop', goodRating: '98.5%', isStore: true }
};

test('normalizeSearchItem maps auction-specific fields', () => {
  const now = Date.parse('2026-08-28T12:00:00+09:00');
  const item = normalizeSearchItem(rawItem, now);
  assert.ok(item);
  assert.equal(item.id, 'x1236553240');
  assert.equal(item.current_price, 12500);
  assert.equal(item.buy_now_price, 20000);
  assert.equal(item.has_buy_now, true);
  assert.equal(item.bid_count, 7);
  assert.equal(item.watch_count, 3);
  assert.equal(item.status, 'open');
  assert.equal(item.remaining_seconds, 3600);
  assert.equal(item.condition_id, 'USED20');
  assert.equal(item.condition_name, '目立った傷や汚れなし');
  assert.deepEqual(item.category.map(tier => tier.id), ['0', '23632', '23960']); // deduped, order kept
  assert.equal(item.seller?.id, 'SELLER1');
  assert.equal(item.url, 'https://auctions.yahoo.co.jp/jp/auction/x1236553240');
});

test('normalizeSearchItem marks ended auctions closed and handles missing buy-now', () => {
  const now = Date.parse('2026-08-29T12:00:00+09:00'); // after endTime
  const item = normalizeSearchItem({ ...rawItem, buyNowPrice: null }, now);
  assert.ok(item);
  assert.equal(item.status, 'closed');
  assert.equal(item.remaining_seconds, 0);
  assert.equal(item.buy_now_price, null);
  assert.equal(item.has_buy_now, false);
  assert.equal(normalizeSearchItem({ title: 'no id' }), null);
});

test('post-filters validate price, buy-now, bids and ending window', () => {
  const now = Date.parse('2026-08-28T12:00:00+09:00');
  assert.equal(passesPostFilters(rawItem, { price_min: 10000, price_max: 20000 }, now), true);
  assert.equal(passesPostFilters(rawItem, { price_min: 13000 }, now), false);
  assert.equal(passesPostFilters(rawItem, { price_max: 12000 }, now), false);

  assert.equal(passesPostFilters(rawItem, { has_buy_now: true }, now), true);
  assert.equal(passesPostFilters({ ...rawItem, buyNowPrice: null }, { has_buy_now: true }, now), false);
  assert.equal(passesPostFilters({ ...rawItem, buyNowPrice: null }, { has_buy_now: false }, now), true);
  assert.equal(passesPostFilters(rawItem, { buy_now_price_max: 15000 }, now), false);

  assert.equal(passesPostFilters(rawItem, { min_bids: 5 }, now), true);
  assert.equal(passesPostFilters(rawItem, { min_bids: 8 }, now), false);
  assert.equal(passesPostFilters(rawItem, { max_bids: 3 }, now), false);

  assert.equal(passesPostFilters(rawItem, { ending_within_minutes: 120 }, now), true);
  assert.equal(passesPostFilters(rawItem, { ending_within_minutes: 30 }, now), false);

  assert.equal(passesPostFilters(rawItem, { exclude_keyword: 'Pro' }, now), false);
  assert.equal(passesPostFilters(rawItem, { exclude_keyword: 'Android' }, now), true);
  assert.equal(passesPostFilters({ ...rawItem, isFreeShipping: false }, { free_shipping: true }, now), false);
});
