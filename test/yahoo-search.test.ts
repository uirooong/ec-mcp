import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSearchQuery, normalizeSearchItem, passesPostFilters } from '../src/providers/yahoo/search.ts';
import type { YahooApiSearchItem } from '../src/providers/yahoo/types.ts';

test('buildSearchQuery maps every supported filter to the Yahoo API param', () => {
  const q = buildSearchQuery({
    keyword: 'iPhone',
    exclude_keyword: 'ケース ジャンク',
    category_id: '2502,13457',
    price_min: 10000,
    price_max: 20000,
    condition: ['new', 'used10'],
    seller_id: 'p123',
    status: 'sold_out',
    sort: 'price',
    order: 'desc'
  });
  assert.equal(q.get('query'), 'iPhone -ケース -ジャンク');
  assert.equal(q.get('genreCategoryIds'), '2502,13457');
  assert.equal(q.get('itemConditions'), 'new,used10');
  assert.equal(q.get('sellerIds'), 'p123');
  assert.equal(q.get('minPrice'), '10000');
  assert.equal(q.get('maxPrice'), '20000');
  assert.equal(q.get('itemStatus'), 'sold'); // sold_out -> sold
  assert.equal(q.get('sort'), 'price');
  assert.equal(q.get('order'), 'DESC'); // order is upper-case
});

test('buildSearchQuery defaults to on-sale (API default is sold)', () => {
  assert.equal(buildSearchQuery({ keyword: 'x' }).get('itemStatus'), 'open');
  assert.equal(buildSearchQuery({ keyword: 'x', order: 'asc', sort: 'price' }).get('order'), 'ASC');
});

test('buildSearchQuery rejects invalid category and condition values', () => {
  assert.throws(() => buildSearchQuery({ category_id: 'abc' }), /Invalid category_id/);
  assert.throws(() => buildSearchQuery({ condition: 'brand_new' }), /Unsupported condition/);
});

test('normalizeSearchItem maps a raw Yahoo item into the MCP shape', () => {
  const item = normalizeSearchItem({
    id: 'z596076148',
    title: 'iPhone 7 Plus',
    price: '7500',
    itemStatus: 'OPEN',
    condition: 'used60',
    likeCount: 8,
    thumbnailImageUrl: 'https://img.test/a.jpg',
    endTime: '2026-08-14T07:38:54+09:00',
    sellerId: 'p2984176',
    seller: { id: 'p2984176', goodRatio: 99.2, numRating: 2681 },
    brand: { id: 1, name: 'iPhone 7 Plus' },
    category: { id: 38340, name: 'iPhone', path: [
      { id: 1, name: 'shopping' }, { id: 2502, name: 'スマホ' }, { id: 38340, name: 'iPhone' }
    ] }
  });
  assert.ok(item);
  assert.equal(item.id, 'z596076148');
  assert.equal(item.price, 7500);
  assert.equal(item.status, 'on_sale');
  assert.equal(item.condition_id, 'used60');
  assert.equal(item.condition_name, '傷や汚れあり');
  assert.equal(item.url, 'https://paypayfleamarket.yahoo.co.jp/item/z596076148');
  assert.equal(item.category.length, 3);
  assert.equal(item.seller?.good_ratio, 99.2);
  assert.equal(item.brand_name, 'iPhone 7 Plus');
});

test('normalizeSearchItem maps SOLD and rejects empty ids', () => {
  assert.equal(normalizeSearchItem({ title: 'no id' } as YahooApiSearchItem), null);
  assert.equal(normalizeSearchItem({ id: 'x1', itemStatus: 'SOLD' })?.status, 'sold_out');
});

test('passesPostFilters enforces price range and title exclusion', () => {
  const base: YahooApiSearchItem = { id: 'x', title: 'iPhone ケース', price: 15000 };
  assert.equal(passesPostFilters(base, { price_min: 10000, price_max: 20000 }), true);
  assert.equal(passesPostFilters({ ...base, price: 500 }, { price_min: 10000 }), false);
  assert.equal(passesPostFilters({ ...base, price: 25000 }, { price_max: 20000 }), false);
  assert.equal(passesPostFilters(base, { exclude_keyword: 'ケース' }), false);
  assert.equal(passesPostFilters(base, { exclude_keyword: 'android' }), true);
});
