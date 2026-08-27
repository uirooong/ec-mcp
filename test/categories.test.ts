import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCategoryRecords, filterCategories } from '../src/providers/mercari/categories.ts';

test('constructs levels and paths for category hierarchy', () => {
  const records = buildCategoryRecords([
    { id: 1328, name: 'ゲーム', parentId: null },
    { id: 82, name: 'カード', parentId: 1328 },
    { id: 1289, name: 'ポケモン', parentId: 82 }
  ]);
  assert.deepEqual(
    records.find(record => record.id === 1289)?.pathNames,
    ['ゲーム', 'カード', 'ポケモン']
  );
  assert.equal(records.find(record => record.id === 1289)?.level, 3);
  assert.deepEqual(filterCategories(records, { root_only: true }).map(record => record.id), [1328]);
  assert.deepEqual(filterCategories(records, { keyword: 'ポケ' }).map(record => record.id), [1289]);
  assert.deepEqual(filterCategories(records, { parent_id: 82 }).map(record => record.id), [1289]);
});
