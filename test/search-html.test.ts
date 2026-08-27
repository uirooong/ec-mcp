import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSearchHtml } from '../src/providers/mercari/search.ts';

const html = `
<ul><li data-testid="item-cell"><a href="/item/m111"><span class="itemName__x">Alpha &amp; Beta</span>
<div class="priceContainer"><span class="number__6b270ca7">1,100</span></div></a>SOLD</li>
<li data-testid="item-cell"><a href="/item/m222"><span class="itemName__x">Gamma</span>
<span class="number__6b270ca7">400</span></a></li></ul>`;

test('parses crawler search result cells', () => {
  const items = parseSearchHtml(html);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(item => item.id), ['m111', 'm222']);
  assert.equal(items[0]?.name, 'Alpha & Beta');
  assert.equal(items[0]?.price, 1100);
  assert.equal(items[0]?.status, 'sold_out');
  assert.equal(items[1]?.status, 'on_sale');
});
