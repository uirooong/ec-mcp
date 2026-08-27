import assert from 'node:assert/strict';
import test from 'node:test';
import { collectCategoriesFromSearch } from '../src/providers/yahoo/categories.ts';
import type { YahooApiSearchResponse } from '../src/providers/yahoo/types.ts';

const response: YahooApiSearchResponse = {
  items: [
    {
      id: 'a',
      category: {
        id: 17118,
        name: 'ポケモン',
        path: [
          { id: 1, name: 'shopping' },
          { id: 2511, name: 'ゲーム、おもちゃ' },
          { id: 15160, name: 'フィギュア' },
          { id: 17118, name: 'ポケモン' }
        ]
      }
    },
    {
      id: 'b',
      category: {
        id: 17118,
        name: 'ポケモン',
        path: [
          { id: 1, name: 'shopping' },
          { id: 2511, name: 'ゲーム、おもちゃ' },
          { id: 15160, name: 'フィギュア' },
          { id: 17118, name: 'ポケモン' }
        ]
      }
    }
  ]
};

test('collectCategoriesFromSearch dedupes by id and builds levels/paths, skipping shopping root', () => {
  const { byId, frequency } = collectCategoriesFromSearch(response);
  // shopping(1) is skipped; 2511, 15160, 17118 remain, each once.
  assert.deepEqual([...byId.keys()].sort(), ['15160', '17118', '2511']);
  const pokemon = byId.get('17118')!;
  assert.equal(pokemon.level, 3);
  assert.deepEqual(pokemon.pathNames, ['ゲーム、おもちゃ', 'フィギュア', 'ポケモン']);
  assert.equal(pokemon.parentId, '15160');
  // two items referenced each tier -> frequency 2
  assert.equal(frequency.get('17118'), 2);
});
