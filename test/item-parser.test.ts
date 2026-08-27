import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCategoryTiers, buildItemDetail, normalizeItemId } from '../src/providers/mercari/item.ts';

test('normalizes IDs and full URLs', () => {
  assert.equal(normalizeItemId('m48814528195'), 'm48814528195');
  assert.equal(normalizeItemId('https://jp.mercari.com/item/M48814528195'), 'm48814528195');
  assert.throws(() => normalizeItemId('nope'), /Invalid Mercari item ID/);
});

test('normalizes SSR item payload', () => {
  const detail = buildItemDetail({
    id: 'm1',
    name: 'Item',
    price: 1100,
    status: 'on_sale',
    description: 'Description',
    photos: ['https://example.test/a.jpg'],
    item_category: {
      id: 1289,
      name: 'Pokemon',
      parent_category_id: 82,
      parent_category_name: 'Cards',
      root_category_id: 1328,
      root_category_name: 'Games'
    },
    item_condition: { id: 1, name: 'New' },
    shipping_payer: { id: 2, name: 'Seller pays' },
    num_likes: 11,
    comments: [{}, {}]
  }, 'm1');
  assert.equal(detail.category.length, 3);
  assert.equal(detail.condition_id, 1);
  assert.equal(detail.comments_count, 2);
  assert.equal(detail.likes_count, 11);
});

test('builds root-to-leaf category chain from ntiers and dedupes by id', () => {
  const tiers = buildCategoryTiers({
    parent_categories_ntiers: [
      { id: 6386, name: 'ホビー・楽器・アート' },
      { id: 79, name: '楽器・機材' },
      { id: 724, name: '配信機器' },
      { id: 6692, name: 'マイク' }
    ],
    item_category_ntiers: { id: 6693, name: 'コンデンサーマイク' },
    // legacy field repeats ids already present; must not duplicate
    item_category: { id: 6693, name: 'コンデンサーマイク', parent_category_id: 6692, root_category_id: 6386 }
  });
  assert.deepEqual(tiers.map(tier => tier.id), ['6386', '79', '724', '6692', '6693']);
});
