import assert from 'node:assert/strict';
import test from 'node:test';
import { buildItemDetail, normalizeItemId } from '../src/providers/yahoo/item.ts';

test('normalizeItemId accepts raw ids and item URLs', () => {
  assert.equal(normalizeItemId('z596076148'), 'z596076148');
  assert.equal(normalizeItemId('1242198081'), '1242198081');
  assert.equal(normalizeItemId('https://paypayfleamarket.yahoo.co.jp/item/e1241962359'), 'e1241962359');
  assert.equal(normalizeItemId('https://paypayfleamarket.yahoo.co.jp/item/b1216415467?foo=1'), 'b1216415467');
  assert.throws(() => normalizeItemId('not a listing'), /Invalid Yahoo! Flea Market item/);
});

// Shape taken from a live /api/item/v2/items/{id} response.
test('buildItemDetail normalizes the item v2 payload', () => {
  const detail = buildItemDetail({
    id: 'o1237764507',
    title: 'WiFi専用 iPad pro 12.9 第4世代',
    description: 'wifi ipad pro 本体',
    price: 73000,
    status: 'OPEN',
    type: 'auction',
    condition: { key: 'used40', text: 'やや傷や汚れあり' },
    images: [
      { url: 'https://img.test/1.jpg', width: 1200, height: 1200 },
      { url: 'https://img.test/2.jpg' }
    ],
    categoryList: [
      { id: 2502, name: 'スマホ、タブレット、パソコン' },
      { id: 21076, name: 'タブレットPC' },
      { id: 21077, name: 'iPad' },
      { id: 21077, name: 'iPad' } // duplicate must be dropped
    ],
    productCategory: { id: 23663, name: 'iPad' },
    brand: { id: 100011, name: 'Apple' },
    seller: { id: 'p1837072', nickname: 'Yu_Na', rating: { total: 545, goodRatio: 99 } },
    deliveryMethod: { id: 'YAMATO', name: 'おてがる配送（ヤマト運輸）' },
    deliverySchedule: { id: 'ONE_TO_TWO_DAYS', text: '1〜2日で発送' },
    location: 'YAMANASHI',
    createDate: '2026-08-28T08:36:10+09:00',
    likeCount: 4,
    pvCount: 12,
    questionCount: 0,
    hashtags: ['ipad']
  }, 'o1237764507');
  assert.equal(detail.id, 'o1237764507');
  assert.equal(detail.price, 73000);
  assert.equal(detail.status, 'on_sale');
  assert.equal(detail.description, 'wifi ipad pro 本体');
  assert.deepEqual(detail.photos, ['https://img.test/1.jpg', 'https://img.test/2.jpg']);
  assert.deepEqual(detail.category.map(tier => tier.id), ['2502', '21076', '21077']); // deduped, order kept
  assert.equal(detail.condition_id, 'used40');
  assert.equal(detail.condition_name, 'やや傷や汚れあり');
  assert.equal(detail.delivery_method_name, 'おてがる配送（ヤマト運輸）');
  assert.equal(detail.shipping_from_location, 'YAMANASHI');
  assert.equal(detail.seller?.nickname, 'Yu_Na');
  assert.equal(detail.seller?.num_rating, 545);
  assert.equal(detail.likes_count, 4);
  assert.ok(detail.created_at !== null && detail.created_at > 0);
  assert.equal(detail.url, 'https://paypayfleamarket.yahoo.co.jp/item/o1237764507');
});

test('buildItemDetail maps SOLD and tolerates missing fields', () => {
  const detail = buildItemDetail({ id: 'x1', title: 't', status: 'SOLD' }, 'x1');
  assert.equal(detail.status, 'sold_out');
  assert.equal(detail.description, null);
  assert.deepEqual(detail.photos, []);
  assert.equal(detail.seller, null);
});
