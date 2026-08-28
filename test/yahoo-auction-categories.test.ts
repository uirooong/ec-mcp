import assert from 'node:assert/strict';
import test from 'node:test';
import { collectCategoriesFromSearch } from '../src/providers/yahoo-auction/categories.ts';
import type { YahooApiSearchResponse } from '../src/providers/yahoo-auction/types.ts';

const path = [
  { id: 0, name: 'オークション' },
  { id: 23632, name: '家電、AV、カメラ' },
  { id: 23960, name: '携帯電話、スマートフォン' },
  { id: 2084317598, name: 'スマホ本体' }
];

const response: YahooApiSearchResponse = {
  items: [
    { auctionId: 'a', categoryPath: path },
    { auctionId: 'b', categoryPath: path }
  ]
};

test('collectCategoriesFromSearch dedupes by id, builds levels/paths, skips the synthetic root', () => {
  const { byId, frequency } = collectCategoriesFromSearch(response);
  // id 0 ("オークション") is skipped so genres start at level 1.
  assert.deepEqual([...byId.keys()].sort(), ['2084317598', '23632', '23960']);

  const leaf = byId.get('2084317598')!;
  assert.equal(leaf.level, 3);
  assert.deepEqual(leaf.pathNames, ['家電、AV、カメラ', '携帯電話、スマートフォン', 'スマホ本体']);
  assert.equal(leaf.parentId, '23960');

  const top = byId.get('23632')!;
  assert.equal(top.level, 1);
  assert.equal(top.parentId, '0');

  // Two items referenced each tier once -> frequency 2 (not 4).
  assert.equal(frequency.get('2084317598'), 2);
});

test('collectCategoriesFromSearch handles items without a category path', () => {
  const { byId } = collectCategoriesFromSearch({ items: [{ auctionId: 'a' }] });
  assert.equal(byId.size, 0);
});
