import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDetail, normalizeItemId } from '../src/providers/mercari/item.ts';

test('normalizes IDs and full URLs', () => {
  assert.equal(normalizeItemId('m48814528195'), 'm48814528195');
  assert.equal(normalizeItemId('https://jp.mercari.com/item/M48814528195'), 'm48814528195');
  assert.throws(() => normalizeItemId('nope'), /Invalid Mercari item ID/);
});

test('normalizes SSR item payload', () => {
  const detail = buildDetail({
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
