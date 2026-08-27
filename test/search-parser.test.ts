import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeItem, passesPostFilters } from '../src/providers/mercari/search.ts';
import type { ApiSearchItem } from '../src/providers/mercari/search.ts';

test('normalizes a classic ITEM_TYPE_MERCARI result', () => {
  const item = normalizeItem({
    id: 'm83455948117',
    itemType: 'ITEM_TYPE_MERCARI',
    name: 'iPhone 12',
    price: '1900',
    status: 'ITEM_STATUS_ON_SALE',
    thumbnails: ['https://static.mercdn.net/thumb/a.jpg']
  });
  assert.ok(item);
  assert.equal(item.id, 'm83455948117');
  assert.equal(item.item_type, 'mercari');
  assert.equal(item.price, 1900);
  assert.equal(item.status, 'on_sale');
  assert.equal(item.url, 'https://jp.mercari.com/item/m83455948117');
});

test('keeps ITEM_TYPE_BEYOND (Mercari Shops) results and routes their URL', () => {
  const item = normalizeItem({
    id: '2JVxcFyofDzW6NMvVsk9mU',
    itemType: 'ITEM_TYPE_BEYOND',
    name: 'iPhone case',
    price: 450,
    status: 'ITEM_STATUS_ON_SALE',
    thumbnails: ['https://assets.mercari-shops-static.com/a.jpg'],
    shop: { id: 'aUDrAwQhSV3FvkwfJaFGrV' }
  });
  assert.ok(item, 'Beyond items must not be dropped');
  assert.equal(item.item_type, 'beyond');
  assert.equal(item.url, 'https://jp.mercari.com/shops/product/2JVxcFyofDzW6NMvVsk9mU');
});

test('falls back to photos[].uri for thumbnail and marks unknown type', () => {
  const item = normalizeItem({
    id: 'x1',
    name: 'thing',
    photos: [{ uri: 'https://example.test/p.jpg' }]
  });
  assert.ok(item);
  assert.equal(item.thumbnail, 'https://example.test/p.jpg');
  assert.equal(item.item_type, 'unknown');
});

test('rejects entries without an id', () => {
  assert.equal(normalizeItem({ name: 'no id' } as ApiSearchItem), null);
});

test('post-filter enforces price range that the API can leak past', () => {
  const base: ApiSearchItem = { id: 'm1', name: 'x', price: 5000 };
  assert.equal(passesPostFilters(base, { price_min: 10000, price_max: 20000 }), false);
  assert.equal(passesPostFilters({ ...base, price: 15000 }, { price_min: 10000, price_max: 20000 }), true);
  assert.equal(passesPostFilters({ ...base, price: 25000 }, { price_min: 10000, price_max: 20000 }), false);
});

test('post-filter excludes keywords by item name, case-insensitively', () => {
  const item: ApiSearchItem = { id: 'm1', name: 'Apple iPhone 16', price: 1000 };
  assert.equal(passesPostFilters(item, { exclude_keyword: 'iphone' }), false);
  assert.equal(passesPostFilters(item, { exclude_keyword: 'android' }), true);
});

test('post-filter drops items created before created_after_date (JST)', () => {
  const afterJst = Math.floor(Date.parse('2026-08-02T00:00:00+09:00') / 1000);
  const beforeJst = Math.floor(Date.parse('2026-07-31T00:00:00+09:00') / 1000);
  assert.equal(passesPostFilters({ id: 'm1', name: 'x', price: 1, created: afterJst }, { created_after_date: '2026-08-01' }), true);
  assert.equal(passesPostFilters({ id: 'm1', name: 'x', price: 1, created: beforeJst }, { created_after_date: '2026-08-01' }), false);
});
